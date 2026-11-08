// Pruebas de aceptación: una por cada criterio de aceptación de la Actividad 2.
// Ejecutar con: npm test
const test = require('node:test');
const assert = require('node:assert');
const { abrirDb } = require('../src/db');
const { createApp } = require('../src/app');
const { sembrar } = require('../src/seed');

let servidor, base;
const tokens = {};

async function api(metodo, ruta, cuerpo, token) {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  return { status: r.status, data: await r.json() };
}
async function login(email, password) {
  const { data } = await api('POST', '/api/login', { email, password });
  return data.token;
}

test.before(async () => {
  const db = abrirDb(':memory:');
  sembrar(db);
  servidor = createApp(db).listen(0);
  base = 'http://localhost:' + servidor.address().port;
  tokens.admin = await login('admin@gimnasio.test', 'Admin123*');
  tokens.entrenador = await login('entrenador@gimnasio.test', 'Entrena123*');
  tokens.laura = await login('laura@gimnasio.test', 'Cliente123*');   // membresía activa
  tokens.andres = await login('andres@gimnasio.test', 'Cliente123*'); // membresía vencida
});
test.after(() => servidor.close());

test('Login: credenciales incorrectas se rechazan', async () => {
  const r = await api('POST', '/api/login', { email: 'admin@gimnasio.test', password: 'mala' });
  assert.strictEqual(r.status, 401);
});

test('CA1: impide el ingreso con membresía vencida o suspendida', async () => {
  const vencida = await api('POST', '/api/accesos', { documento: '1000000004' }, tokens.admin);
  assert.strictEqual(vencida.status, 403);
  assert.strictEqual(vencida.data.permitido, false);

  const activa = await api('POST', '/api/accesos', { documento: '1000000003' }, tokens.admin);
  assert.strictEqual(activa.status, 200);
  assert.strictEqual(activa.data.permitido, true);

  // Suspender la membresía de Laura debe bloquear su acceso.
  const lista = await api('GET', '/api/membresias', null, tokens.admin);
  const deLaura = lista.data.find((m) => m.cliente === 'Laura Martínez');
  await api('PATCH', `/api/membresias/${deLaura.id}/estado`, { estado: 'suspendida' }, tokens.admin);
  const suspendida = await api('POST', '/api/accesos', { documento: '1000000003' }, tokens.admin);
  assert.strictEqual(suspendida.data.permitido, false);
  await api('PATCH', `/api/membresias/${deLaura.id}/estado`, { estado: 'activa' }, tokens.admin);

  const noRegistrado = await api('POST', '/api/accesos', { documento: '999' }, tokens.admin);
  assert.strictEqual(noRegistrado.data.permitido, false);
});

test('CA2: solo entrenador o administrador crean/modifican rutinas', async () => {
  const cuerpo = { cliente_id: 3, nombre: 'Rutina A', ejercicios: [{ ejercicio: 'Press', series: 3, repeticiones: '10' }] };
  assert.strictEqual((await api('POST', '/api/rutinas', cuerpo, tokens.laura)).status, 403);
  assert.strictEqual((await api('POST', '/api/rutinas', cuerpo)).status, 401);
  const ok = await api('POST', '/api/rutinas', cuerpo, tokens.entrenador);
  assert.strictEqual(ok.status, 201);
  assert.strictEqual((await api('PUT', `/api/rutinas/${ok.data.id}`, { ...cuerpo, nombre: 'Cambio' }, tokens.laura)).status, 403);
  assert.strictEqual((await api('PUT', `/api/rutinas/${ok.data.id}`, { ...cuerpo, nombre: 'Cambio' }, tokens.entrenador)).status, 200);
  assert.strictEqual((await api('POST', '/api/rutinas', { ...cuerpo, ejercicios: [] }, tokens.entrenador)).status, 400);
});

test('CA3: solo el administrador registra pagos y cambia el estado de una membresía', async () => {
  assert.strictEqual((await api('POST', '/api/pagos', { membresia_id: 1, monto: 1000 }, tokens.entrenador)).status, 403);
  assert.strictEqual((await api('POST', '/api/pagos', { membresia_id: 1, monto: 1000 }, tokens.laura)).status, 403);
  assert.strictEqual((await api('PATCH', '/api/membresias/1/estado', { estado: 'suspendida' }, tokens.entrenador)).status, 403);
  assert.strictEqual((await api('POST', '/api/pagos', { membresia_id: 1, monto: 1000 }, tokens.admin)).status, 201);
  assert.strictEqual((await api('POST', '/api/pagos', { membresia_id: 1, monto: -5 }, tokens.admin)).status, 400);
});

test('CA4: guarda cada avance con fecha y lo devuelve en orden cronológico', async () => {
  await api('POST', '/api/avances', { fecha: '2026-01-10', peso: 70 }, tokens.laura);
  await api('POST', '/api/avances', { fecha: '2026-01-05', peso: 71 }, tokens.laura);
  const { data } = await api('GET', '/api/avances', null, tokens.laura);
  const fechas = data.map((a) => a.fecha);
  assert.deepStrictEqual(fechas, [...fechas].sort());
  assert.ok(fechas.includes('2026-01-05') && fechas.includes('2026-01-10'));
  assert.strictEqual((await api('POST', '/api/avances', { peso: -3 }, tokens.laura)).status, 400);
  assert.strictEqual((await api('POST', '/api/avances', {}, tokens.laura)).status, 400);
});

test('CA5: sugiere una rutina inicial para un objetivo válido y rechaza uno inválido', async () => {
  for (const o of ['perdida_peso', 'ganancia_muscular', 'resistencia']) {
    const r = await api('GET', '/api/recomendacion/' + o, null, tokens.laura);
    assert.strictEqual(r.status, 200);
    assert.ok(r.data.ejercicios.length >= 1);
  }
  assert.strictEqual((await api('GET', '/api/recomendacion/volar', null, tokens.laura)).status, 400);
});

test('CA6: no permite dos membresías activas para el mismo usuario', async () => {
  // Laura ya tiene una activa.
  const dup = await api('POST', '/api/membresias', { usuario_id: 3, plan_id: 1 }, tokens.admin);
  assert.strictEqual(dup.status, 409);
  // Sofía no tiene: la primera se crea y la segunda se rechaza.
  assert.strictEqual((await api('POST', '/api/membresias', { usuario_id: 5, plan_id: 1 }, tokens.admin)).status, 201);
  assert.strictEqual((await api('POST', '/api/membresias', { usuario_id: 5, plan_id: 2 }, tokens.admin)).status, 409);
  // Andrés (vencida) sí puede renovar.
  assert.strictEqual((await api('POST', '/api/membresias', { usuario_id: 4, plan_id: 1 }, tokens.admin)).status, 201);
});

test('CA7: los reportes salen de los datos almacenados', async () => {
  const m = await api('GET', '/api/reportes/membresias', null, tokens.admin);
  const total = m.data.resumen.activa + m.data.resumen.vencida + m.data.resumen.suspendida;
  assert.strictEqual(total, m.data.detalle.length);
  const i = await api('GET', '/api/reportes/ingresos', null, tokens.admin);
  assert.strictEqual(i.data.total, i.data.por_dia.reduce((s, x) => s + x.total, 0));
  assert.ok(i.data.total > 0);
  const a = await api('GET', '/api/reportes/asistencia', null, tokens.admin);
  assert.ok(a.data.por_dia.length >= 1);
  assert.strictEqual((await api('GET', '/api/reportes/ingresos', null, tokens.laura)).status, 403);
});

test('Seguridad: un cliente no ve datos de otros ni administra usuarios', async () => {
  assert.strictEqual((await api('GET', '/api/usuarios', null, tokens.laura)).status, 403);
  assert.strictEqual((await api('POST', '/api/usuarios', { nombre: 'x' }, tokens.laura)).status, 403);
  const rutinasAndres = await api('GET', '/api/rutinas?cliente_id=4', null, tokens.laura);
  assert.ok(rutinasAndres.data.every((r) => r.cliente_id === 3)); // solo ve las propias
});

test('Usuarios: validaciones y documento/correo duplicado', async () => {
  const nuevo = { nombre: 'Test', documento: '2000', email: 'test@x.co', password: 'abcdef', rol: 'cliente' };
  assert.strictEqual((await api('POST', '/api/usuarios', nuevo, tokens.admin)).status, 201);
  assert.strictEqual((await api('POST', '/api/usuarios', nuevo, tokens.admin)).status, 409);
  assert.strictEqual((await api('POST', '/api/usuarios', { ...nuevo, documento: '2001', email: 'a@x.co', rol: 'dios' }, tokens.admin)).status, 400);
  assert.strictEqual((await api('POST', '/api/usuarios', { ...nuevo, documento: '2002', email: 'b@x.co', password: '123' }, tokens.admin)).status, 400);
});

// ---------- Pruebas agregadas en el refinamiento (hallazgos H5 a H7) ----------
test('H5: ajustar una rutina crea una nueva versión y conserva la anterior', async () => {
  const cuerpo = { cliente_id: 5, nombre: 'Base', ejercicios: [{ ejercicio: 'Trote', series: 1, repeticiones: '20 min' }] };
  const v1 = await api('POST', '/api/rutinas', cuerpo, tokens.entrenador);
  const v2 = await api('PUT', `/api/rutinas/${v1.data.id}`, { ...cuerpo, nombre: 'Base ajustada' }, tokens.entrenador);
  assert.strictEqual(v2.status, 200);
  assert.notStrictEqual(v2.data.id, v1.data.id);
  const { data } = await api('GET', '/api/rutinas?cliente_id=5', null, tokens.entrenador);
  const anterior = data.find((r) => r.id === v1.data.id);
  const nueva = data.find((r) => r.id === v2.data.id);
  assert.ok(anterior && anterior.nombre === 'Base' && anterior.ejercicios.length === 1);
  assert.strictEqual(nueva.reemplaza_a, v1.data.id);
});

test('H6: no acepta avances con fecha futura', async () => {
  const r = await api('POST', '/api/avances', { fecha: '2099-01-01', peso: 70 }, tokens.laura);
  assert.strictEqual(r.status, 400);
});

test('H7: el documento se reconoce aunque se digite con puntos o espacios', async () => {
  const r = await api('POST', '/api/accesos', { documento: '1.000.000.003' }, tokens.admin);
  assert.strictEqual(r.data.nombre, 'Laura Martínez');
  const r2 = await api('POST', '/api/accesos', { documento: ' 1000 000 004 ' }, tokens.admin);
  assert.strictEqual(r2.data.nombre, 'Andrés Pérez');
});
