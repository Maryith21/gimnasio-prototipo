const [mayor, menor] = process.versions.node.split('.').map(Number);
if (mayor < 22 || (mayor === 22 && menor < 13)) {
  console.error(`Este proyecto necesita Node.js 22.13 o superior (tienes ${process.versions.node}). Descárgalo en https://nodejs.org`);
  process.exit(1);
}
const { abrirDb } = require('./db');
const { createApp } = require('./app');
const { sembrar } = require('./seed');

const db = abrirDb(process.env.DB_PATH);
if (sembrar(db)) console.log('Base de datos nueva: se cargaron datos de demostración.');
const puerto = process.env.PORT || 3000;
createApp(db).listen(puerto, () => console.log(`Gimnasio listo en http://localhost:${puerto}`));
