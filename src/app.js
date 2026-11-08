// API REST del gimnasio: autenticación con roles, membresías y pagos,
// control de acceso, rutinas, avances, recomendación y reportes.
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { hoy, ahora, sumarDias, fechaValida, estadoEfectivo, RECOMENDACIONES, OBJETIVOS } = require('./util');

const SECRETO = process.env.JWT_SECRET || 'secreto-solo-para-desarrollo';
const ROLES = ['cliente', 'entrenador', 'administrador'];
const ESTADOS = ['activa', 'vencida', 'suspendida'];

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // ---------- helpers ----------
  const err = (res, codigo, mensaje) => res.status(codigo).json({ error: mensaje });
  const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

  function auth(req, res, next) {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return err(res, 401, 'Debes iniciar sesión.');
    try {
      req.user = jwt.verify(token, SECRETO);
      next();
    } catch {
      err(res, 401, 'Sesión inválida o vencida.');
    }
  }
  const rol = (...permitidos) => (req, res, next) =>
    permitidos.includes(req.user.rol) ? next() : err(res, 403, 'No tienes permiso para esta acción.');

  const membresiaActiva = (usuarioId) => {
    const filas = db.prepare('SELECT m.*, p.nombre AS plan FROM membresias m JOIN planes p ON p.id=m.plan_id WHERE usuario_id=? ORDER BY id DESC').all(usuarioId);
    return filas.find((m) => estadoEfectivo(m) === 'activa') || null;
  };
  const conEstado = (m) => ({ ...m, estado_efectivo: estadoEfectivo(m) });

  // ---------- autenticación ----------
  app.post('/api/login', (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return err(res, 400, 'Correo y contraseña son obligatorios.');
    const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(String(email).toLowerCase().trim());
    if (!u || !bcrypt.compareSync(String(password), u.password_hash)) return err(res, 401, 'Credenciales incorrectas.');
    const token = jwt.sign({ id: u.id, rol: u.rol, nombre: u.nombre }, SECRETO, { expiresIn: '8h' });
    res.json({ token, usuario: { id: u.id, nombre: u.nombre, rol: u.rol, objetivo: u.objetivo } });
  });

  app.get('/api/me', auth, (req, res) => {
    const u = db.prepare('SELECT id, nombre, documento, email, rol, objetivo FROM usuarios WHERE id=?').get(req.user.id);
    res.json({ ...u, membresia: u.rol === 'cliente' ? membresiaActiva(u.id) : null });
  });

  // ---------- usuarios ----------
  app.get('/api/usuarios', auth, rol('administrador', 'entrenador'), (req, res) => {
    let sql = 'SELECT id, nombre, documento, email, rol, objetivo FROM usuarios';
    const params = [];
    if (req.user.rol === 'entrenador') sql += " WHERE rol='cliente'";
    else if (req.query.rol && ROLES.includes(req.query.rol)) { sql += ' WHERE rol=?'; params.push(req.query.rol); }
    const filas = db.prepare(sql + ' ORDER BY nombre').all(...params).map((u) => {
      if (u.rol !== 'cliente') return u;
      const act = membresiaActiva(u.id);
      return { ...u, membresia_activa: act ? { plan: act.plan, vencimiento: act.vencimiento } : null };
    });
    res.json(filas);
  });

  app.post('/api/usuarios', auth, rol('administrador'), (req, res) => {
    const { nombre, documento, email, password, rol: r, objetivo } = req.body || {};
    if (!nombre || !documento || !email || !password || !r) return err(res, 400, 'Nombre, documento, correo, contraseña y rol son obligatorios.');
    if (!ROLES.includes(r)) return err(res, 400, 'Rol no válido.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return err(res, 400, 'Correo no válido.');
    if (String(password).length < 6) return err(res, 400, 'La contraseña debe tener al menos 6 caracteres.');
    if (objetivo && !OBJETIVOS.includes(objetivo)) return err(res, 400, 'Objetivo no válido.');
    try {
      const info = db.prepare('INSERT INTO usuarios (nombre, documento, email, password_hash, rol, objetivo) VALUES (?,?,?,?,?,?)')
        .run(String(nombre).trim(), String(documento).trim(), String(email).toLowerCase().trim(), bcrypt.hashSync(String(password), 10), r, objetivo || null);
      res.status(201).json({ id: info.lastInsertRowid });
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return err(res, 409, 'Ya existe un usuario con ese documento o correo.');
      throw e;
    }
  });

  app.patch('/api/usuarios/:id/objetivo', auth, (req, res) => {
    const id = Number(req.params.id);
    if (req.user.rol === 'cliente' && req.user.id !== id) return err(res, 403, 'No tienes permiso para esta acción.');
    const { objetivo } = req.body || {};
    if (!OBJETIVOS.includes(objetivo)) return err(res, 400, 'Objetivo no válido.');
    db.prepare("UPDATE usuarios SET objetivo=? WHERE id=? AND rol='cliente'").run(objetivo, id);
    res.json({ ok: true });
  });

  // ---------- planes, membresías y pagos ----------
  app.get('/api/planes', auth, (req, res) => res.json(db.prepare('SELECT * FROM planes ORDER BY duracion_dias').all()));

  app.get('/api/membresias', auth, rol('administrador'), (req, res) => {
    const filas = db.prepare(`SELECT m.*, u.nombre AS cliente, p.nombre AS plan, p.precio
      FROM membresias m JOIN usuarios u ON u.id=m.usuario_id JOIN planes p ON p.id=m.plan_id ORDER BY m.id DESC`).all();
    res.json(filas.map(conEstado));
  });

  app.get('/api/mi-membresia', auth, (req, res) => {
    const filas = db.prepare('SELECT m.*, p.nombre AS plan FROM membresias m JOIN planes p ON p.id=m.plan_id WHERE usuario_id=? ORDER BY m.id DESC').all(req.user.id);
    res.json(filas.map(conEstado));
  });

  // Crea la membresía y registra su pago en una sola transacción.
  app.post('/api/membresias', auth, rol('administrador'), (req, res) => {
    const { usuario_id, plan_id, metodo } = req.body || {};
    const inicio = req.body.inicio || hoy();
    if (!usuario_id || !plan_id) return err(res, 400, 'Cliente y plan son obligatorios.');
    if (!fechaValida(inicio)) return err(res, 400, 'Fecha de inicio no válida.');
    const cliente = db.prepare("SELECT id FROM usuarios WHERE id=? AND rol='cliente'").get(usuario_id);
    const plan = db.prepare('SELECT * FROM planes WHERE id=?').get(plan_id);
    if (!cliente) return err(res, 404, 'Cliente no encontrado.');
    if (!plan) return err(res, 404, 'Plan no encontrado.');
    // Criterio de aceptación: no puede haber dos membresías activas a la vez.
    const vigente = membresiaActiva(cliente.id);
    if (vigente) return err(res, 409, `El cliente ya tiene una membresía activa (vence el ${vigente.vencimiento}).`);
    const vencimiento = sumarDias(inicio, plan.duracion_dias);
    const crear = db.transaction(() => {
      const m = db.prepare('INSERT INTO membresias (usuario_id, plan_id, inicio, vencimiento, estado) VALUES (?,?,?,?,?)')
        .run(cliente.id, plan.id, inicio, vencimiento, 'activa');
      db.prepare('INSERT INTO pagos (membresia_id, monto, fecha, metodo) VALUES (?,?,?,?)')
        .run(m.lastInsertRowid, plan.precio, hoy(), metodo || 'efectivo');
      return m.lastInsertRowid;
    });
    res.status(201).json({ id: crear(), vencimiento });
  });

  app.patch('/api/membresias/:id/estado', auth, rol('administrador'), (req, res) => {
    const { estado } = req.body || {};
    if (!ESTADOS.includes(estado)) return err(res, 400, 'Estado no válido.');
    const m = db.prepare('SELECT * FROM membresias WHERE id=?').get(req.params.id);
    if (!m) return err(res, 404, 'Membresía no encontrada.');
    if (estado === 'activa') {
      const otra = db.prepare('SELECT * FROM membresias WHERE usuario_id=? AND id<>?').all(m.usuario_id, m.id)
        .find((x) => estadoEfectivo(x) === 'activa');
      if (otra) return err(res, 409, 'El cliente ya tiene otra membresía activa.');
    }
    db.prepare('UPDATE membresias SET estado=? WHERE id=?').run(estado, m.id);
    res.json({ ok: true });
  });

  app.post('/api/pagos', auth, rol('administrador'), (req, res) => {
    const { membresia_id, monto, metodo } = req.body || {};
    if (!membresia_id || !(Number(monto) > 0)) return err(res, 400, 'Membresía y un monto mayor a cero son obligatorios.');
    if (!db.prepare('SELECT id FROM membresias WHERE id=?').get(membresia_id)) return err(res, 404, 'Membresía no encontrada.');
    const info = db.prepare('INSERT INTO pagos (membresia_id, monto, fecha, metodo) VALUES (?,?,?,?)')
      .run(membresia_id, Math.round(Number(monto)), hoy(), metodo || 'efectivo');
    res.status(201).json({ id: info.lastInsertRowid });
  });

  // ---------- control de acceso ----------
  app.post('/api/accesos', auth, rol('administrador'), (req, res) => {
    const documento = String((req.body || {}).documento || '').trim();
    if (!documento) return err(res, 400, 'Ingresa el documento del usuario.');
    const u = db.prepare('SELECT id, nombre, rol FROM usuarios WHERE documento=?').get(documento);
    let permitido = 0, motivo, vencimiento = null;
    if (!u) motivo = 'Documento no registrado.';
    else if (u.rol !== 'cliente') { permitido = 1; motivo = 'Personal del gimnasio.'; }
    else {
      const filas = db.prepare('SELECT * FROM membresias WHERE usuario_id=? ORDER BY id DESC').all(u.id);
      const ultima = filas[0];
      const activa = filas.find((m) => estadoEfectivo(m) === 'activa');
      if (activa) { permitido = 1; motivo = 'Membresía activa.'; vencimiento = activa.vencimiento; }
      else if (!ultima) motivo = 'El usuario no tiene membresía.';
      else { motivo = `Membresía ${estadoEfectivo(ultima)}.`; vencimiento = ultima.vencimiento; }
    }
    db.prepare('INSERT INTO accesos (usuario_id, documento, fecha_hora, permitido, motivo) VALUES (?,?,?,?,?)')
      .run(u ? u.id : null, documento, ahora(), permitido, motivo);
    res.status(permitido ? 200 : 403).json({ permitido: !!permitido, motivo, nombre: u ? u.nombre : null, vencimiento });
  });

  app.get('/api/accesos', auth, rol('administrador'), (req, res) => {
    res.json(db.prepare(`SELECT a.*, u.nombre FROM accesos a LEFT JOIN usuarios u ON u.id=a.usuario_id ORDER BY a.id DESC LIMIT 30`).all());
  });

  // ---------- recomendación basada en reglas ----------
  app.get('/api/recomendacion/:objetivo', auth, (req, res) => {
    const r = RECOMENDACIONES[req.params.objetivo];
    if (!r) return err(res, 400, 'Objetivo no válido. Usa: ' + OBJETIVOS.join(', ') + '.');
    res.json(r);
  });

  // ---------- rutinas ----------
  function rutinaCompleta(r) {
    const ejercicios = db.prepare('SELECT ejercicio, series, repeticiones, observaciones FROM rutina_ejercicios WHERE rutina_id=? ORDER BY id').all(r.id);
    return { ...r, ejercicios };
  }
  function validarEjercicios(lista) {
    if (!Array.isArray(lista) || lista.length === 0) return 'Agrega al menos un ejercicio.';
    for (const e of lista) {
      if (!e.ejercicio || !String(e.ejercicio).trim()) return 'Todos los ejercicios necesitan nombre.';
      if (!(Number(e.series) > 0)) return 'Las series deben ser un número mayor a cero.';
      if (!e.repeticiones || !String(e.repeticiones).trim()) return 'Indica las repeticiones de cada ejercicio.';
    }
    return null;
  }

  app.get('/api/rutinas', auth, (req, res) => {
    let clienteId = req.user.id;
    if (req.user.rol !== 'cliente' && req.query.cliente_id) clienteId = Number(req.query.cliente_id);
    let filas;
    if (req.user.rol === 'cliente' || req.query.cliente_id) {
      filas = db.prepare('SELECT r.*, e.nombre AS entrenador FROM rutinas r JOIN usuarios e ON e.id=r.entrenador_id WHERE cliente_id=? ORDER BY r.id DESC').all(clienteId);
    } else {
      filas = db.prepare('SELECT r.*, e.nombre AS entrenador, c.nombre AS cliente FROM rutinas r JOIN usuarios e ON e.id=r.entrenador_id JOIN usuarios c ON c.id=r.cliente_id ORDER BY r.id DESC').all();
    }
    res.json(filas.map(rutinaCompleta));
  });

  app.post('/api/rutinas', auth, rol('entrenador', 'administrador'), (req, res) => {
    const { cliente_id, nombre, observaciones, ejercicios } = req.body || {};
    if (!cliente_id || !nombre) return err(res, 400, 'Cliente y nombre de la rutina son obligatorios.');
    if (!db.prepare("SELECT id FROM usuarios WHERE id=? AND rol='cliente'").get(cliente_id)) return err(res, 404, 'Cliente no encontrado.');
    const msg = validarEjercicios(ejercicios);
    if (msg) return err(res, 400, msg);
    const crear = db.transaction(() => {
      const r = db.prepare('INSERT INTO rutinas (cliente_id, entrenador_id, nombre, observaciones, creada) VALUES (?,?,?,?,?)')
        .run(cliente_id, req.user.id, String(nombre).trim(), observaciones || '', hoy());
      const ins = db.prepare('INSERT INTO rutina_ejercicios (rutina_id, ejercicio, series, repeticiones, observaciones) VALUES (?,?,?,?,?)');
      for (const e of ejercicios) ins.run(r.lastInsertRowid, String(e.ejercicio).trim(), Number(e.series), String(e.repeticiones).trim(), e.observaciones || '');
      return r.lastInsertRowid;
    });
    res.status(201).json({ id: crear() });
  });

  // Modifica una rutina conservando al resto del historial del usuario.
  app.put('/api/rutinas/:id', auth, rol('entrenador', 'administrador'), (req, res) => {
    const { nombre, observaciones, ejercicios } = req.body || {};
    const r = db.prepare('SELECT * FROM rutinas WHERE id=?').get(req.params.id);
    if (!r) return err(res, 404, 'Rutina no encontrada.');
    if (!nombre) return err(res, 400, 'El nombre de la rutina es obligatorio.');
    const msg = validarEjercicios(ejercicios);
    if (msg) return err(res, 400, msg);
    db.transaction(() => {
      db.prepare('UPDATE rutinas SET nombre=?, observaciones=? WHERE id=?').run(String(nombre).trim(), observaciones || '', r.id);
      db.prepare('DELETE FROM rutina_ejercicios WHERE rutina_id=?').run(r.id);
      const ins = db.prepare('INSERT INTO rutina_ejercicios (rutina_id, ejercicio, series, repeticiones, observaciones) VALUES (?,?,?,?,?)');
      for (const e of ejercicios) ins.run(r.id, String(e.ejercicio).trim(), Number(e.series), String(e.repeticiones).trim(), e.observaciones || '');
    })();
    res.json({ ok: true });
  });

  // ---------- avances ----------
  app.post('/api/avances', auth, (req, res) => {
    const b = req.body || {};
    let usuarioId = req.user.id;
    if (req.user.rol !== 'cliente' && b.usuario_id) usuarioId = Number(b.usuario_id);
    const fecha = b.fecha || hoy();
    if (!fechaValida(fecha)) return err(res, 400, 'Fecha no válida.');
    const peso = num(b.peso), cintura = num(b.cintura), pecho = num(b.pecho), carga = num(b.carga_kg);
    for (const [k, v] of Object.entries({ peso, cintura, pecho, carga })) {
      if (v !== null && (isNaN(v) || v <= 0)) return err(res, 400, `El valor de ${k} debe ser un número mayor a cero.`);
    }
    if (peso === null && cintura === null && pecho === null && carga === null) return err(res, 400, 'Registra al menos una medida (peso, medidas o carga).');
    if (carga !== null && !b.ejercicio) return err(res, 400, 'Indica el ejercicio al que corresponde la carga.');
    const info = db.prepare('INSERT INTO avances (usuario_id, fecha, peso, cintura, pecho, ejercicio, carga_kg) VALUES (?,?,?,?,?,?,?)')
      .run(usuarioId, fecha, peso, cintura, pecho, carga !== null ? String(b.ejercicio).trim() : null, carga);
    res.status(201).json({ id: info.lastInsertRowid });
  });

  // Historial cronológico (de la fecha más antigua a la más reciente).
  app.get('/api/avances', auth, (req, res) => {
    let usuarioId = req.user.id;
    if (req.user.rol !== 'cliente' && req.query.usuario_id) usuarioId = Number(req.query.usuario_id);
    res.json(db.prepare('SELECT * FROM avances WHERE usuario_id=? ORDER BY fecha ASC, id ASC').all(usuarioId));
  });

  // ---------- reportes administrativos (calculados desde la base de datos) ----------
  app.get('/api/reportes/membresias', auth, rol('administrador'), (req, res) => {
    const filas = db.prepare('SELECT m.*, u.nombre AS cliente, p.nombre AS plan FROM membresias m JOIN usuarios u ON u.id=m.usuario_id JOIN planes p ON p.id=m.plan_id').all().map(conEstado);
    const resumen = { activa: 0, vencida: 0, suspendida: 0 };
    filas.forEach((m) => resumen[m.estado_efectivo]++);
    res.json({ resumen, detalle: filas });
  });

  app.get('/api/reportes/ingresos', auth, rol('administrador'), (req, res) => {
    const desde = req.query.desde || '0000-01-01', hasta = req.query.hasta || '9999-12-31';
    if (!fechaValida(desde) && req.query.desde) return err(res, 400, 'Fecha "desde" no válida.');
    if (!fechaValida(hasta) && req.query.hasta) return err(res, 400, 'Fecha "hasta" no válida.');
    const porDia = db.prepare('SELECT fecha, SUM(monto) AS total, COUNT(*) AS pagos FROM pagos WHERE fecha BETWEEN ? AND ? GROUP BY fecha ORDER BY fecha').all(desde, hasta);
    res.json({ total: porDia.reduce((s, x) => s + x.total, 0), por_dia: porDia });
  });

  app.get('/api/reportes/asistencia', auth, rol('administrador'), (req, res) => {
    const desde = req.query.desde || '0000-01-01', hasta = req.query.hasta || '9999-12-31';
    const porDia = db.prepare(`SELECT substr(fecha_hora,1,10) AS fecha, SUM(permitido) AS permitidos, SUM(1-permitido) AS denegados
      FROM accesos WHERE substr(fecha_hora,1,10) BETWEEN ? AND ? GROUP BY fecha ORDER BY fecha`).all(desde, hasta);
    res.json({ por_dia: porDia });
  });

  app.use('/api', (req, res) => err(res, 404, 'Recurso no encontrado.'));
  app.use((e, req, res, next) => { console.error(e); err(res, 500, 'Error interno del servidor.'); });
  return app;
}

module.exports = { createApp };
