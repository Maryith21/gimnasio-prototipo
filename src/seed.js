// Datos de demostración. Se ejecuta con: npm run seed
const bcrypt = require('bcryptjs');
const { hoy, sumarDias } = require('./util');

function sembrar(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n > 0) return false;
  const h = (p) => bcrypt.hashSync(p, 10);
  const u = db.prepare('INSERT INTO usuarios (nombre, documento, email, password_hash, rol, objetivo) VALUES (?,?,?,?,?,?)');
  u.run('Administrador Demo', '1000000001', 'admin@gimnasio.test', h('Admin123*'), 'administrador', null);
  u.run('Carlos Entrenador', '1000000002', 'entrenador@gimnasio.test', h('Entrena123*'), 'entrenador', null);
  u.run('Laura Martínez', '1000000003', 'laura@gimnasio.test', h('Cliente123*'), 'cliente', 'perdida_peso');
  u.run('Andrés Pérez', '1000000004', 'andres@gimnasio.test', h('Cliente123*'), 'cliente', 'ganancia_muscular');
  u.run('Sofía Ramírez', '1000000005', 'sofia@gimnasio.test', h('Cliente123*'), 'cliente', 'resistencia');

  const p = db.prepare('INSERT INTO planes (nombre, duracion_dias, precio) VALUES (?,?,?)');
  p.run('Mensual', 30, 90000);
  p.run('Trimestral', 90, 240000);
  p.run('Semestral', 180, 450000);

  const t = hoy();
  const m = db.prepare('INSERT INTO membresias (usuario_id, plan_id, inicio, vencimiento, estado) VALUES (?,?,?,?,?)');
  const pg = db.prepare('INSERT INTO pagos (membresia_id, monto, fecha, metodo) VALUES (?,?,?,?)');
  // Laura: activa. Andrés: vencida. Sofía: sin membresía.
  const m1 = m.run(3, 2, sumarDias(t, -10), sumarDias(t, 80), 'activa').lastInsertRowid;
  pg.run(m1, 240000, sumarDias(t, -10), 'transferencia');
  const m2 = m.run(4, 1, sumarDias(t, -45), sumarDias(t, -15), 'activa').lastInsertRowid;
  pg.run(m2, 90000, sumarDias(t, -45), 'efectivo');

  const av = db.prepare('INSERT INTO avances (usuario_id, fecha, peso, cintura, pecho, ejercicio, carga_kg) VALUES (?,?,?,?,?,?,?)');
  av.run(3, sumarDias(t, -9), 72.5, 84, 96, 'Sentadilla', 30);
  av.run(3, sumarDias(t, -5), 71.8, 83, 96, 'Sentadilla', 35);
  av.run(3, sumarDias(t, -1), 71.0, 82, 95.5, 'Sentadilla', 40);
  return true;
}

module.exports = { sembrar };

if (require.main === module) {
  const { abrirDb } = require('./db');
  console.log(sembrar(abrirDb()) ? 'Datos de demostración creados.' : 'La base de datos ya tiene datos; no se modificó nada.');
}
