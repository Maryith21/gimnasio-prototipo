// Interfaz web (JavaScript sin frameworks) que consume la API REST.
const $ = (s, r = document) => r.querySelector(s);
const contenido = $('#contenido');
const OBJ = { perdida_peso: 'Pérdida de peso', ganancia_muscular: 'Ganancia muscular', resistencia: 'Resistencia' };
let sesion = null;

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pesos = (n) => '$' + Number(n || 0).toLocaleString('es-CO');
const chip = (e) => `<span class="chip ${esc(e)}">${esc(e)}</span>`;

function avisar(msg, error = false) {
  const a = $('#aviso');
  a.textContent = msg; a.className = 'ver' + (error ? ' error' : '');
  clearTimeout(avisar.t); avisar.t = setTimeout(() => (a.className = ''), 3500);
}

async function api(metodo, ruta, cuerpo) {
  const r = await fetch('/api' + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(sesion ? { Authorization: 'Bearer ' + sesion.token } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  const datos = await r.json().catch(() => ({}));
  if (r.status === 401 && sesion) { cerrarSesion(); throw new Error('Tu sesión terminó. Inicia sesión de nuevo.'); }
  if (!r.ok && datos.error) throw new Error(datos.error);
  return datos;
}
const intentar = (fn) => async (...a) => { try { await fn(...a); } catch (e) { avisar(e.message, true); } };

// ---------------- sesión y navegación ----------------
function guardar(s) { sesion = s; sessionStorage.setItem('gym', JSON.stringify(s)); }
function cerrarSesion() { sesion = null; sessionStorage.removeItem('gym'); iniciar(); }
$('#salir').onclick = cerrarSesion;

const MENUS = {
  administrador: [['reportes', 'Reportes'], ['acceso', 'Control de acceso'], ['membresias', 'Membresías y pagos'], ['usuarios', 'Usuarios']],
  entrenador: [['clientes', 'Clientes y rutinas']],
  cliente: [['plan', 'Mi plan'], ['rutina', 'Mi rutina'], ['progreso', 'Mi progreso']]
};
const VISTAS = { reportes, acceso, membresias, usuarios, clientes, plan, rutina, progreso };

function iniciar() {
  const guardada = sessionStorage.getItem('gym');
  if (guardada && !sesion) sesion = JSON.parse(guardada);
  if (!sesion) { $('#barra').hidden = true; return vistaLogin(); }
  $('#barra').hidden = false;
  $('#quien').textContent = `${sesion.usuario.nombre} · ${sesion.usuario.rol}`;
  const items = MENUS[sesion.usuario.rol];
  $('#menu').innerHTML = items.map(([k, t]) => `<button data-v="${k}">${t}</button>`).join('');
  $('#menu').querySelectorAll('button').forEach((b) => (b.onclick = () => ir(b.dataset.v)));
  ir(items[0][0]);
}
function ir(v) {
  $('#menu').querySelectorAll('button').forEach((b) => b.classList.toggle('activo', b.dataset.v === v));
  contenido.innerHTML = '<p class="vacio">Cargando…</p>';
  intentar(VISTAS[v])();
}

// ---------------- login ----------------
function vistaLogin() {
  contenido.innerHTML = `
    <div class="tarjeta login">
      <h1>Iniciar sesión</h1><p class="sub">Sistema de gestión del gimnasio</p>
      <form id="f">
        <label for="email">Correo</label><input id="email" type="email" required autocomplete="username">
        <label for="pw">Contraseña</label><input id="pw" type="password" required autocomplete="current-password">
        <div class="acciones"><button>Entrar</button></div>
      </form>
      <p class="demo">Usuarios de prueba (contraseña entre paréntesis):<br>
        <code>admin@gimnasio.test</code> (Admin123*)<br>
        <code>entrenador@gimnasio.test</code> (Entrena123*)<br>
        <code>laura@gimnasio.test</code> · <code>andres@gimnasio.test</code> · <code>sofia@gimnasio.test</code> (Cliente123*)</p>
    </div>`;
  $('#f').onsubmit = intentar(async (e) => {
    e.preventDefault();
    guardar(await api('POST', '/login', { email: $('#email').value, password: $('#pw').value }));
    iniciar();
  });
}

// ---------------- administrador ----------------
async function reportes() {
  const [m, i, a] = await Promise.all([api('GET', '/reportes/membresias'), api('GET', '/reportes/ingresos'), api('GET', '/reportes/asistencia')]);
  const asist = a.por_dia.reduce((s, d) => ({ p: s.p + d.permitidos, d: s.d + d.denegados }), { p: 0, d: 0 });
  contenido.innerHTML = `
    <h1>Reportes administrativos</h1><p class="sub">Calculados a partir de los datos almacenados.</p>
    <div class="cifras">
      <div class="cifra"><b>${m.resumen.activa}</b><span>Membresías activas</span></div>
      <div class="cifra"><b>${m.resumen.vencida}</b><span>Membresías vencidas</span></div>
      <div class="cifra"><b>${m.resumen.suspendida}</b><span>Suspendidas</span></div>
      <div class="cifra"><b>${pesos(i.total)}</b><span>Ingresos registrados</span></div>
      <div class="cifra"><b>${asist.p}</b><span>Ingresos permitidos</span></div>
      <div class="cifra"><b>${asist.d}</b><span>Ingresos denegados</span></div>
    </div>
    <div class="rejilla">
      <div class="tarjeta"><h2>Membresías por cliente</h2><div class="tabla-scroll"><table>
        <tr><th>Cliente</th><th>Plan</th><th>Vence</th><th>Estado</th></tr>
        ${m.detalle.map((x) => `<tr><td>${esc(x.cliente)}</td><td>${esc(x.plan)}</td><td>${esc(x.vencimiento)}</td><td>${chip(x.estado_efectivo)}</td></tr>`).join('')}
      </table></div></div>
      <div class="tarjeta"><h2>Ingresos por día</h2><div class="tabla-scroll"><table>
        <tr><th>Fecha</th><th>Pagos</th><th>Total</th></tr>
        ${i.por_dia.map((x) => `<tr><td>${esc(x.fecha)}</td><td>${x.pagos}</td><td>${pesos(x.total)}</td></tr>`).join('') || '<tr><td colspan="3" class="vacio">Sin pagos.</td></tr>'}
      </table></div>
      <h2 style="margin-top:1.2rem">Asistencia por día</h2><div class="tabla-scroll"><table>
        <tr><th>Fecha</th><th>Permitidos</th><th>Denegados</th></tr>
        ${a.por_dia.map((x) => `<tr><td>${esc(x.fecha)}</td><td>${x.permitidos}</td><td>${x.denegados}</td></tr>`).join('') || '<tr><td colspan="3" class="vacio">Sin registros de ingreso.</td></tr>'}
      </table></div></div>
    </div>`;
}

async function acceso() {
  const hist = await api('GET', '/accesos');
  contenido.innerHTML = `
    <h1>Control de acceso</h1><p class="sub">Ingresa el documento del usuario para validar su membresía en recepción.</p>
    <div class="rejilla">
      <div class="tarjeta"><form id="f">
        <label for="doc">Documento</label><input id="doc" inputmode="numeric" required autofocus placeholder="Ej: 1000000003">
        <div class="acciones"><button>Validar ingreso</button></div></form>
        <div id="res"></div></div>
      <div class="tarjeta"><h2>Últimos ingresos</h2><div class="tabla-scroll"><table>
        <tr><th>Hora</th><th>Usuario</th><th>Resultado</th></tr>
        ${hist.map((a) => `<tr><td>${esc(a.fecha_hora.slice(5, 16))}</td><td>${esc(a.nombre || a.documento)}</td>
          <td>${a.permitido ? '<span class="chip ok">Permitido</span>' : '<span class="chip mal">Denegado</span>'} <small>${esc(a.motivo)}</small></td></tr>`).join('') || '<tr><td colspan="3" class="vacio">Aún no hay ingresos.</td></tr>'}
      </table></div></div>
    </div>`;
  $('#f').onsubmit = intentar(async (e) => {
    e.preventDefault();
    const r = await fetch('/api/accesos', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sesion.token }, body: JSON.stringify({ documento: $('#doc').value }) });
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    $('#res').innerHTML = `<div class="resultado ${d.permitido ? 'ok' : 'mal'}"><b>${d.permitido ? 'Ingreso permitido' : 'Ingreso denegado'}</b>
      ${esc(d.nombre || 'Usuario desconocido')}<br>${esc(d.motivo)}${d.vencimiento ? (d.permitido ? ' Vence el ' : ' Venció el ') + esc(d.vencimiento) : ''}</div>`;
    const h = await api('GET', '/accesos'); // refresca historial sin borrar el resultado
    $('table', contenido.querySelectorAll('.tarjeta')[1]).outerHTML = `<table><tr><th>Hora</th><th>Usuario</th><th>Resultado</th></tr>${h.map((a) => `<tr><td>${esc(a.fecha_hora.slice(5, 16))}</td><td>${esc(a.nombre || a.documento)}</td><td>${a.permitido ? '<span class="chip ok">Permitido</span>' : '<span class="chip mal">Denegado</span>'} <small>${esc(a.motivo)}</small></td></tr>`).join('')}</table>`;
    $('#doc').select();
  });
}

async function membresias() {
  const [lista, clientes, planes] = await Promise.all([api('GET', '/membresias'), api('GET', '/usuarios?rol=cliente'), api('GET', '/planes')]);
  contenido.innerHTML = `
    <h1>Membresías y pagos</h1><p class="sub">Un cliente solo puede tener una membresía activa a la vez. Al crearla se registra su pago.</p>
    <div class="rejilla">
      <div class="tarjeta"><h2>Nueva membresía</h2><form id="f">
        <label for="cl">Cliente</label><select id="cl" required>${clientes.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}</select>
        <label for="pl">Plan</label><select id="pl">${planes.map((p) => `<option value="${p.id}">${esc(p.nombre)} · ${p.duracion_dias} días · ${pesos(p.precio)}</option>`).join('')}</select>
        <label for="mt">Método de pago</label><select id="mt"><option>efectivo</option><option>transferencia</option><option>tarjeta</option></select>
        <div class="acciones"><button>Registrar membresía y pago</button></div></form></div>
      <div class="tarjeta"><h2>Membresías</h2><div class="tabla-scroll"><table>
        <tr><th>Cliente</th><th>Plan</th><th>Vence</th><th>Estado</th><th>Acción</th></tr>
        ${lista.map((m) => `<tr><td>${esc(m.cliente)}</td><td>${esc(m.plan)}</td><td>${esc(m.vencimiento)}</td><td>${chip(m.estado_efectivo)}</td>
          <td>${m.estado_efectivo === 'suspendida' ? `<button class="sec" data-id="${m.id}" data-e="activa">Reactivar</button>` : m.estado_efectivo === 'activa' ? `<button class="sec" data-id="${m.id}" data-e="suspendida">Suspender</button>` : ''}</td></tr>`).join('')}
      </table></div></div>
    </div>`;
  $('#f').onsubmit = intentar(async (e) => {
    e.preventDefault();
    const r = await api('POST', '/membresias', { usuario_id: +$('#cl').value, plan_id: +$('#pl').value, metodo: $('#mt').value });
    avisar('Membresía creada. Vence el ' + r.vencimiento);
    membresias();
  });
  contenido.querySelectorAll('button[data-id]').forEach((b) => (b.onclick = intentar(async () => {
    await api('PATCH', `/membresias/${b.dataset.id}/estado`, { estado: b.dataset.e });
    avisar('Estado actualizado'); membresias();
  })));
}

async function usuarios() {
  const lista = await api('GET', '/usuarios');
  contenido.innerHTML = `
    <h1>Usuarios</h1><p class="sub">Registro de clientes, entrenadores y administradores.</p>
    <div class="rejilla">
      <div class="tarjeta"><h2>Nuevo usuario</h2><form id="f">
        <label for="n">Nombre completo</label><input id="n" required>
        <div class="fila"><div><label for="d">Documento</label><input id="d" required inputmode="numeric"></div>
        <div><label for="r">Rol</label><select id="r"><option value="cliente">Cliente</option><option value="entrenador">Entrenador</option><option value="administrador">Administrador</option></select></div></div>
        <label for="e">Correo</label><input id="e" type="email" required>
        <label for="p">Contraseña (mínimo 6 caracteres)</label><input id="p" type="password" required minlength="6">
        <label for="o">Objetivo (clientes)</label><select id="o"><option value="">— sin definir —</option>${Object.entries(OBJ).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <div class="acciones"><button>Crear usuario</button></div></form></div>
      <div class="tarjeta"><h2>Usuarios registrados</h2><div class="tabla-scroll"><table>
        <tr><th>Nombre</th><th>Documento</th><th>Rol</th><th>Membresía</th></tr>
        ${lista.map((u) => `<tr><td>${esc(u.nombre)}<br><small>${esc(u.email)}</small></td><td>${esc(u.documento)}</td><td>${esc(u.rol)}</td>
          <td>${u.rol === 'cliente' ? (u.membresia_activa ? chip('activa') + ' <small>hasta ' + esc(u.membresia_activa.vencimiento) + '</small>' : '<span class="chip vencida">sin membresía activa</span>') : '—'}</td></tr>`).join('')}
      </table></div></div>
    </div>`;
  $('#f').onsubmit = intentar(async (e) => {
    e.preventDefault();
    await api('POST', '/usuarios', { nombre: $('#n').value, documento: $('#d').value, rol: $('#r').value, email: $('#e').value, password: $('#p').value, objetivo: $('#o').value || undefined });
    avisar('Usuario creado'); usuarios();
  });
}

// ---------------- entrenador ----------------
function filaEjercicio(e = {}) {
  return `<div class="ejercicio">
    <input class="x-ej" placeholder="Ejercicio" value="${esc(e.ejercicio)}" aria-label="Ejercicio">
    <input class="x-se" type="number" min="1" placeholder="Series" value="${esc(e.series)}" aria-label="Series">
    <input class="x-re" placeholder="Reps" value="${esc(e.repeticiones)}" aria-label="Repeticiones">
    <input class="x-ob" placeholder="Observaciones" value="${esc(e.observaciones)}" aria-label="Observaciones">
    <button type="button" class="sec x-del" aria-label="Quitar ejercicio">✕</button></div>`;
}
// Una rutina es "versión anterior" si otra la reemplazó al ajustarla.
const reemplazada = (lista, r) => lista.some((x) => x.reemplaza_a === r.id);
const tablaRutina = (r) => `<table><tr><th>Ejercicio</th><th>Series</th><th>Reps</th><th>Notas</th></tr>
  ${r.ejercicios.map((e) => `<tr><td>${esc(e.ejercicio)}</td><td>${e.series}</td><td>${esc(e.repeticiones)}</td><td>${esc(e.observaciones)}</td></tr>`).join('')}</table>`;

async function clientes() {
  const lista = await api('GET', '/usuarios');
  contenido.innerHTML = `
    <h1>Clientes y rutinas</h1><p class="sub">Asigna rutinas, ajústalas sin perder el historial y consulta el progreso del cliente.</p>
    <div class="tarjeta"><label for="cl">Cliente</label>
      <select id="cl">${lista.map((c) => `<option value="${c.id}">${esc(c.nombre)}${c.objetivo ? ' · ' + OBJ[c.objetivo] : ''}</option>`).join('')}</select></div>
    <div id="detalle"></div>`;
  $('#cl').onchange = intentar(() => detalleCliente(lista));
  await detalleCliente(lista);
}

async function detalleCliente(lista) {
  const id = +$('#cl').value;
  const cli = lista.find((c) => c.id === id);
  const [rutinas, avances] = await Promise.all([api('GET', `/rutinas?cliente_id=${id}`), api('GET', `/avances?usuario_id=${id}`)]);
  $('#detalle').innerHTML = `
    <div class="rejilla">
      <div class="tarjeta ancha"><h2 id="tit">Nueva rutina</h2>
        <form id="fr"><input type="hidden" id="rid">
          <label for="rn">Nombre de la rutina</label><input id="rn" required placeholder="Ej: Rutina de fuerza semana 1">
          <label for="ro">Observaciones generales</label><textarea id="ro" rows="2"></textarea>
          <label>Ejercicios</label><div id="ejs">${filaEjercicio()}</div>
          <div class="acciones"><button type="button" class="sec" id="mas">+ Ejercicio</button>
            ${cli.objetivo ? `<button type="button" class="sec" id="sug">Usar sugerida (${OBJ[cli.objetivo]})</button>` : ''}
            <button>Guardar rutina</button><button type="button" class="sec" id="canc" hidden>Cancelar edición</button></div></form></div>
      <div class="tarjeta ancha"><h2>Rutinas asignadas</h2>
        ${rutinas.map((r) => `<div style="margin-bottom:1rem"><b>${esc(r.nombre)}</b> <small>· ${esc(r.creada)} · ${esc(r.entrenador)}${reemplazada(rutinas, r) ? ' · <span class="chip vencida">versión anterior</span>' : ''}</small>
          ${r.observaciones ? `<br><small>${esc(r.observaciones)}</small>` : ''}<div class="tabla-scroll">${tablaRutina(r)}</div>
          ${reemplazada(rutinas, r) ? '' : `<div class="acciones" style="margin-top:.4rem"><button class="sec" data-ed="${r.id}">Ajustar</button></div>`}</div>`).join('') || '<p class="vacio">Sin rutinas asignadas.</p>'}
        <h2 style="margin-top:1rem">Progreso del cliente</h2>${tablaAvances(avances)}</div>
    </div>`;
  const ejs = $('#ejs');
  const poner = (lista) => { ejs.innerHTML = lista.map(filaEjercicio).join(''); };
  ejs.onclick = (e) => { if (e.target.classList.contains('x-del')) { e.target.closest('.ejercicio').remove(); } };
  $('#mas').onclick = () => ejs.insertAdjacentHTML('beforeend', filaEjercicio());
  if ($('#sug')) $('#sug').onclick = intentar(async () => {
    const s = await api('GET', '/recomendacion/' + cli.objetivo);
    $('#rn').value = s.nombre; $('#ro').value = s.observaciones; poner(s.ejercicios);
    avisar('Rutina sugerida cargada; ajústala antes de guardar.');
  });
  contenido.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => {
    const r = rutinas.find((x) => x.id === +b.dataset.ed);
    $('#rid').value = r.id; $('#rn').value = r.nombre; $('#ro').value = r.observaciones || ''; poner(r.ejercicios);
    $('#tit').textContent = 'Ajustar rutina (se guarda como nueva versión)'; $('#canc').hidden = false; $('#fr').scrollIntoView({ behavior: 'smooth' });
  }));
  $('#canc').onclick = () => detalleCliente(lista);
  $('#fr').onsubmit = intentar(async (e) => {
    e.preventDefault();
    const ejercicios = [...ejs.querySelectorAll('.ejercicio')].map((f) => ({
      ejercicio: $('.x-ej', f).value, series: $('.x-se', f).value, repeticiones: $('.x-re', f).value, observaciones: $('.x-ob', f).value
    }));
    const cuerpo = { cliente_id: id, nombre: $('#rn').value, observaciones: $('#ro').value, ejercicios };
    if ($('#rid').value) await api('PUT', '/rutinas/' + $('#rid').value, cuerpo); else await api('POST', '/rutinas', cuerpo);
    avisar($('#rid').value ? 'Nueva versión guardada; la anterior queda en el historial.' : 'Rutina guardada'); detalleCliente(lista);
  });
}

// ---------------- cliente ----------------
async function plan() {
  const [yo, ms] = await Promise.all([api('GET', '/me'), api('GET', '/mi-membresia')]);
  const a = yo.membresia;
  contenido.innerHTML = `
    <h1>Hola, ${esc(yo.nombre.split(' ')[0])}</h1><p class="sub">Estado de tu membresía y tu objetivo.</p>
    <div class="rejilla">
      <div class="tarjeta"><h2>Membresía</h2>
        ${a ? `<p>${chip('activa')} Plan <b>${esc(a.plan)}</b></p><p>Vence el <b>${esc(a.vencimiento)}</b></p>`
            : '<p><span class="chip vencida">sin membresía activa</span></p><p>Acércate a recepción para renovar tu plan.</p>'}
        <table><tr><th>Plan</th><th>Inicio</th><th>Vence</th><th>Estado</th></tr>
        ${ms.map((m) => `<tr><td>${esc(m.plan)}</td><td>${esc(m.inicio)}</td><td>${esc(m.vencimiento)}</td><td>${chip(m.estado_efectivo)}</td></tr>`).join('')}</table></div>
      <div class="tarjeta"><h2>Mi objetivo</h2><form id="fo">
        <label for="o">Objetivo de entrenamiento</label>
        <select id="o">${Object.entries(OBJ).map(([k, v]) => `<option value="${k}" ${yo.objetivo === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <div class="acciones"><button>Guardar objetivo</button></div></form></div>
    </div>`;
  $('#fo').onsubmit = intentar(async (e) => {
    e.preventDefault();
    await api('PATCH', `/usuarios/${sesion.usuario.id}/objetivo`, { objetivo: $('#o').value });
    sesion.usuario.objetivo = $('#o').value; guardar(sesion); avisar('Objetivo guardado');
  });
}

async function rutina() {
  const rutinas = await api('GET', '/rutinas');
  const obj = sesion.usuario.objetivo;
  const sug = obj ? await api('GET', '/recomendacion/' + obj) : null;
  contenido.innerHTML = `
    <h1>Mi rutina</h1><p class="sub">Rutinas asignadas por tu entrenador.</p>
    ${rutinas.filter((r) => !reemplazada(rutinas, r)).map((r) => `<div class="tarjeta"><h2>${esc(r.nombre)}</h2><p class="leyenda">Asignada el ${esc(r.creada)} por ${esc(r.entrenador)}</p>
      ${r.observaciones ? `<p>${esc(r.observaciones)}</p>` : ''}<div class="tabla-scroll">${tablaRutina(r)}</div></div>`).join('')
      || '<div class="tarjeta"><p class="vacio">Tu entrenador aún no te ha asignado una rutina.</p></div>'}
    ${sug ? `<div class="tarjeta"><h2>Rutina inicial sugerida · ${OBJ[obj]}</h2><p class="leyenda">${esc(sug.observaciones)} Es una guía general; tu entrenador puede ajustarla.</p>
      <div class="tabla-scroll">${tablaRutina(sug)}</div></div>` : ''}`;
}

function tablaAvances(av) {
  if (!av.length) return '<p class="vacio">Sin avances registrados.</p>';
  return `<div class="tabla-scroll"><table><tr><th>Fecha</th><th>Peso (kg)</th><th>Cintura (cm)</th><th>Pecho (cm)</th><th>Carga</th></tr>
    ${av.map((a) => `<tr><td>${esc(a.fecha)}</td><td>${a.peso ?? '—'}</td><td>${a.cintura ?? '—'}</td><td>${a.pecho ?? '—'}</td><td>${a.carga_kg ? esc(a.ejercicio) + ' · ' + a.carga_kg + ' kg' : '—'}</td></tr>`).join('')}</table></div>`;
}

function grafica(av) {
  const pts = av.filter((a) => a.peso != null);
  if (pts.length < 2) return '<p class="vacio">Registra al menos dos pesos para ver tu evolución.</p>';
  const W = 600, H = 220, m = 36;
  const ys = pts.map((p) => p.peso), min = Math.min(...ys) - 1, max = Math.max(...ys) + 1;
  const x = (i) => m + (i * (W - 2 * m)) / (pts.length - 1), y = (v) => H - m - ((v - min) / (max - min)) * (H - 2 * m);
  return `<svg class="grafica" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución del peso">
    <line x1="${m}" y1="${H - m}" x2="${W - m}" y2="${H - m}" stroke="#dde3ea"/><line x1="${m}" y1="${m}" x2="${m}" y2="${H - m}" stroke="#dde3ea"/>
    <polyline fill="none" stroke="#0f766e" stroke-width="2.5" points="${pts.map((p, i) => `${x(i)},${y(p.peso)}`).join(' ')}"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.peso)}" r="4" fill="#0f766e"/><text x="${x(i)}" y="${y(p.peso) - 9}" font-size="11" text-anchor="middle" fill="#1d2733">${p.peso}</text>
      <text x="${x(i)}" y="${H - 14}" font-size="10" text-anchor="middle" fill="#5b6876">${esc(p.fecha.slice(5))}</text>`).join('')}
    <text x="${m}" y="16" font-size="11" fill="#5b6876">Peso (kg)</text></svg>`;
}

async function progreso() {
  const av = await api('GET', '/avances');
  contenido.innerHTML = `
    <h1>Mi progreso</h1><p class="sub">Cada registro queda guardado con su fecha.</p>
    <div class="rejilla">
      <div class="tarjeta"><h2>Registrar avance</h2><form id="f">
        <div class="fila"><div><label for="fe">Fecha</label><input id="fe" type="date"></div>
          <div><label for="pe">Peso (kg)</label><input id="pe" type="number" step="0.1" min="1"></div></div>
        <div class="fila"><div><label for="ci">Cintura (cm)</label><input id="ci" type="number" step="0.1" min="1"></div>
          <div><label for="pc">Pecho (cm)</label><input id="pc" type="number" step="0.1" min="1"></div></div>
        <div class="fila"><div><label for="ej">Ejercicio (carga)</label><input id="ej" placeholder="Ej: Sentadilla"></div>
          <div><label for="ca">Carga (kg)</label><input id="ca" type="number" step="0.5" min="1"></div></div>
        <div class="acciones"><button>Guardar avance</button></div></form></div>
      <div class="tarjeta"><h2>Evolución del peso</h2>${grafica(av)}<h2 style="margin-top:1rem">Historial</h2>${tablaAvances(av)}</div>
    </div>`;
  $('#fe').value = $('#fe').max = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  $('#f').onsubmit = intentar(async (e) => {
    e.preventDefault();
    await api('POST', '/avances', { fecha: $('#fe').value, peso: $('#pe').value, cintura: $('#ci').value, pecho: $('#pc').value, ejercicio: $('#ej').value, carga_kg: $('#ca').value });
    avisar('Avance guardado'); progreso();
  });
}

iniciar();
