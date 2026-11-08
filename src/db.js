// Capa de datos: SQLite (archivo local, sin servidor aparte).
// Usa el módulo SQLite incluido en Node.js (node:sqlite, Node 22.13 o superior),
// así no hay que compilar ni instalar ninguna dependencia nativa.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

function abrirDb(ruta) {
  const destino = ruta || path.join(__dirname, '..', 'data', 'gimnasio.db');
  if (destino !== ':memory:') fs.mkdirSync(path.dirname(destino), { recursive: true });
  const db = new DatabaseSync(destino);
  db.exec('PRAGMA foreign_keys = ON');
  // Ejecuta varias sentencias como una sola unidad: o se guardan todas o ninguna.
  db.transaction = (fn) => (...args) => {
    db.exec('BEGIN');
    try { const r = fn(...args); db.exec('COMMIT'); return r; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      documento TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      rol TEXT NOT NULL CHECK (rol IN ('cliente','entrenador','administrador')),
      objetivo TEXT CHECK (objetivo IN ('perdida_peso','ganancia_muscular','resistencia')),
      creado TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS planes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      duracion_dias INTEGER NOT NULL CHECK (duracion_dias > 0),
      precio INTEGER NOT NULL CHECK (precio >= 0)
    );
    CREATE TABLE IF NOT EXISTS membresias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      plan_id INTEGER NOT NULL REFERENCES planes(id),
      inicio TEXT NOT NULL,
      vencimiento TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','vencida','suspendida'))
    );
    CREATE TABLE IF NOT EXISTS pagos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      membresia_id INTEGER NOT NULL REFERENCES membresias(id),
      monto INTEGER NOT NULL CHECK (monto > 0),
      fecha TEXT NOT NULL,
      metodo TEXT NOT NULL DEFAULT 'efectivo'
    );
    CREATE TABLE IF NOT EXISTS accesos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER REFERENCES usuarios(id),
      documento TEXT NOT NULL,
      fecha_hora TEXT NOT NULL,
      permitido INTEGER NOT NULL,
      motivo TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rutinas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL REFERENCES usuarios(id),
      entrenador_id INTEGER NOT NULL REFERENCES usuarios(id),
      nombre TEXT NOT NULL,
      observaciones TEXT,
      creada TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rutina_ejercicios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rutina_id INTEGER NOT NULL REFERENCES rutinas(id) ON DELETE CASCADE,
      ejercicio TEXT NOT NULL,
      series INTEGER NOT NULL CHECK (series > 0),
      repeticiones TEXT NOT NULL,
      observaciones TEXT
    );
    CREATE TABLE IF NOT EXISTS avances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      fecha TEXT NOT NULL,
      peso REAL,
      cintura REAL,
      pecho REAL,
      ejercicio TEXT,
      carga_kg REAL
    );
  `);
  return db;
}

module.exports = { abrirDb };
