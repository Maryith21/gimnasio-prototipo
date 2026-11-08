// Utilidades de fechas (zona horaria de Bogotá) y reglas de negocio compartidas.
const ZONA = 'America/Bogota';

function hoy() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date()); // YYYY-MM-DD
}
function ahora() {
  const f = new Intl.DateTimeFormat('sv-SE', { timeZone: ZONA, dateStyle: 'short', timeStyle: 'medium' });
  return f.format(new Date()); // YYYY-MM-DD HH:MM:SS
}
function sumarDias(fechaISO, dias) {
  const [a, m, d] = fechaISO.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d + dias));
  return f.toISOString().slice(0, 10);
}
function fechaValida(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

// El estado "efectivo" se calcula con la fecha: una membresía marcada como activa
// cuyo vencimiento ya pasó se considera vencida.
function estadoEfectivo(m) {
  if (m.estado === 'suspendida') return 'suspendida';
  if (m.estado === 'vencida' || m.vencimiento < hoy()) return 'vencida';
  return 'activa';
}

// Recomendación basada en reglas (no usa aprendizaje automático), según el objetivo.
const RECOMENDACIONES = {
  perdida_peso: {
    nombre: 'Rutina inicial: pérdida de peso',
    observaciones: 'Priorizar trabajo cardiovascular y circuitos de cuerpo completo, 3 a 4 días por semana.',
    ejercicios: [
      { ejercicio: 'Caminata o trote suave en banda', series: 1, repeticiones: '25 min', observaciones: 'Ritmo constante' },
      { ejercicio: 'Sentadilla con peso corporal', series: 3, repeticiones: '15', observaciones: 'Espalda recta' },
      { ejercicio: 'Remo en máquina', series: 3, repeticiones: '15', observaciones: 'Carga ligera' },
      { ejercicio: 'Plancha abdominal', series: 3, repeticiones: '30 s', observaciones: 'Descanso de 30 s' },
      { ejercicio: 'Bicicleta estática', series: 1, repeticiones: '15 min', observaciones: 'Enfriamiento' }
    ]
  },
  ganancia_muscular: {
    nombre: 'Rutina inicial: ganancia muscular',
    observaciones: 'Cargas moderadas con progresión semanal, 3 a 4 días por semana con descanso entre grupos musculares.',
    ejercicios: [
      { ejercicio: 'Press de pecho en máquina', series: 4, repeticiones: '8-10', observaciones: 'Control en la bajada' },
      { ejercicio: 'Sentadilla con barra', series: 4, repeticiones: '8-10', observaciones: 'Supervisión del entrenador' },
      { ejercicio: 'Jalón al pecho', series: 3, repeticiones: '10-12', observaciones: '' },
      { ejercicio: 'Press militar con mancuernas', series: 3, repeticiones: '10', observaciones: '' },
      { ejercicio: 'Curl de bíceps', series: 3, repeticiones: '12', observaciones: '' }
    ]
  },
  resistencia: {
    nombre: 'Rutina inicial: resistencia',
    observaciones: 'Trabajo aeróbico progresivo y fuerza ligera de alta repetición, 4 días por semana.',
    ejercicios: [
      { ejercicio: 'Trote continuo en banda', series: 1, repeticiones: '30 min', observaciones: 'Aumentar 5 min por semana' },
      { ejercicio: 'Elíptica', series: 1, repeticiones: '15 min', observaciones: '' },
      { ejercicio: 'Zancadas alternadas', series: 3, repeticiones: '20', observaciones: 'Peso corporal' },
      { ejercicio: 'Flexiones de brazos', series: 3, repeticiones: '12-15', observaciones: 'Apoyo de rodillas si es necesario' },
      { ejercicio: 'Saltos de cuerda', series: 4, repeticiones: '1 min', observaciones: 'Descanso de 30 s' }
    ]
  }
};
const OBJETIVOS = Object.keys(RECOMENDACIONES);

module.exports = { hoy, ahora, sumarDias, fechaValida, estadoEfectivo, RECOMENDACIONES, OBJETIVOS };
