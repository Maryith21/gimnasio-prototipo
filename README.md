# Gimnasio · Prototipo funcional

Sistema web para la **gestión de membresías, el control de acceso y el seguimiento de rutinas** en un gimnasio.
Prototipo funcional de la Actividad 4 del curso Proyecto de Software (Universidad Iberoamericana), construido sobre
la formulación de la Actividad 2.

## Funcionalidades

| Rol | Qué puede hacer |
|---|---|
| Administrador | Crear usuarios, registrar membresías y pagos, suspender/reactivar membresías, validar el ingreso en recepción, ver reportes (membresías, ingresos, asistencia) |
| Entrenador | Ver clientes, crear y editar rutinas (con ejercicios, series, repeticiones y observaciones), usar la rutina inicial sugerida, consultar el progreso del cliente |
| Cliente | Ver su membresía, definir su objetivo, ver sus rutinas y la rutina inicial sugerida, registrar su peso, medidas y cargas y ver su evolución |

Reglas de negocio implementadas (criterios de aceptación de la Actividad 2): no entra quien tenga la membresía vencida o
suspendida; solo entrenador/administrador modifican rutinas; solo el administrador registra pagos y cambia estados; los
avances se guardan con fecha y en orden cronológico; se sugiere una rutina según el objetivo (reglas, sin aprendizaje
automático); no puede haber dos membresías activas para un usuario; los reportes salen de los datos almacenados.

## Requisitos

- [Node.js](https://nodejs.org) **22.13 o superior** (incluye `npm`; verifica con `node -v`)
- Git (para clonar el repositorio)

No necesitas instalar ni configurar una base de datos: usa el SQLite que ya trae Node.js y crea el archivo sola
(carpeta `data/`). No hay dependencias que compilar.

## Instalación y ejecución

```bash
git clone https://github.com/Maryith21/gimnasio-prototipo.git
cd gimnasio-prototipo
npm install
npm start
```

Abre <http://localhost:3000>. En el primer arranque se crean datos de demostración.
Para usar otro puerto: `PORT=4000 npm start` (en Windows PowerShell: `$env:PORT=4000; npm start`).

### Usuarios de prueba

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | admin@gimnasio.test | Admin123* |
| Entrenador | entrenador@gimnasio.test | Entrena123* |
| Cliente (membresía activa) | laura@gimnasio.test | Cliente123* |
| Cliente (membresía vencida) | andres@gimnasio.test | Cliente123* |
| Cliente (sin membresía) | sofia@gimnasio.test | Cliente123* |

Documentos para probar el control de acceso: Laura `1000000003`, Andrés `1000000004`, Sofía `1000000005`.

Para reiniciar los datos de demostración, detén el servidor y borra la carpeta `data/`.

## Pruebas

```bash
npm test
```

Ejecuta 13 pruebas de aceptación automatizadas (una por cada criterio de aceptación de la Actividad 2, más pruebas de
seguridad, validaciones y las mejoras del refinamiento) contra una base de datos en memoria.

## Estructura

```
src/db.js       esquema SQLite (node:sqlite)
src/app.js      API REST (rutas, roles, reglas de negocio)
src/util.js     fechas y reglas de recomendación
src/seed.js     datos de demostración
src/server.js   arranque del servidor
public/         interfaz web (HTML, CSS y JavaScript sin frameworks)
test/           pruebas de aceptación
```

## Limitaciones del prototipo

El pago se registra manualmente (sin pasarela), el control de acceso se hace desde la aplicación web en recepción
(sin hardware) y hay una sola sede. Antes de un uso real habría que definir la variable `JWT_SECRET`, cambiar las
contraseñas de demostración y publicar el sistema tras HTTPS.
