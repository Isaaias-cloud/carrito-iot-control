# Control y monitoreo del vehículo IoT

Frontend estático Mobile First para controlar y monitorear en tiempo real el vehículo `1`, identificado por la API como **Excavadora IoT**. El proyecto no contiene backend propio, no accede directamente a MySQL/RDS y está preparado para publicarse en GitHub Pages.

La aplicación conserva tres vistas dentro del mismo documento, todas detrás de la sesión emitida por FastAPI:

- `#control`: joysticks, acciones manuales, `DETENER` y ejecución de DEMO.
- `#monitor`: último movimiento reportado y los diez registros persistidos más recientes.
- `#admin`: dashboard, modelos, unidades, clientes, asignaciones, demos/comandos y auditoría para el rol `ADMIN`.

La autenticación usa `POST /auth/login`, renovación controlada con `POST /auth/refresh`, perfil mediante `GET /auth/me` y cierre con `POST /auth/logout`. Los tokens se conservan únicamente en `sessionStorage`; el backend sigue siendo la autoridad para autenticación, RBAC, propiedad, soporte y reservas.

La navegación usa hash (`#control` / `#monitor`) y una única sesión WSS compartida por ambas vistas.

## Funcionalidades actuales

### Vista de Control (`#control`)

- Joystick izquierdo para desplazamiento del chasis, con pointer/touch y teclado `W`, `A`, `S`, `D`.
- Joystick derecho para pala/cámara, con pointer/touch y flechas direccionales.
- Al liberar un joystick, cancelar el gesto, perder el foco o cambiar de pestaña se solicita el comando remoto `DETENER`.
- Botones centrales `Ruido`, `Velocidad`, `Luz` y `Apagar`.
  - Mantienen un estado visual fijo mediante `.is-active` y `aria-pressed`.
  - `Apagar` es mutuamente excluyente con las otras tres acciones.
  - Cada acción manual se envía como pulso de `500 ms` y después solicita `DETENER` automáticamente.
  - El pulso se cancela si comienza otra acción, un movimiento de joystick o un paro manual.
- Botón general `DETENER` con prioridad sobre solicitudes manuales pendientes.
- Catálogo remoto de comandos: los botones y direcciones se resuelven mediante `id_comando` y nombres activos devueltos por la API; no se inventan IDs.
- DEMO:
  - Selección desde `GET /demos/vehiculo/{id}`.
  - Inicio mediante `POST /demos/ejecutar`.
  - El navegador no reproduce la secuencia ni crea pasos simulados.
  - Cada evento WSS `nuevo_movimiento` con origen `DEMO` actualiza una única notificación superior con `DEMO #N · Paso X/Y`, nombre del comando y progreso.
  - La notificación de paso se limpia al presionar `DETENER` y se oculta automáticamente usando `duracion_ms`, `pausa_ms` y un margen de 1500 ms.
- Las notificaciones estándar `.app-toast` se limitan a tres visibles simultáneamente; la notificación `.demo-step-toast` se administra por separado.

### Vista de Monitoreo (`#monitor`)

- Tarjeta **Último movimiento reportado**.
  - Carga inicial desde `GET /estado/vehiculo/{id}`.
  - Actualización inmediata al recibir un evento WSS válido del mismo vehículo.
  - Evita que una respuesta REST antigua sustituya un evento WSS recibido durante la carga.
  - Muestra comando, código cuando existe, fecha/hora, fuente y etapa reportada.
- Tabla **Últimos diez movimientos persistidos**.
  - Fuente exclusiva: `GET /vehiculos/{id}/historial`.
  - Valida `id_historial` e `id_vehiculo`.
  - Ordena por `id_historial` descendente, elimina IDs repetidos y limita el resultado a diez filas.
  - No agrega directamente eventos WSS a la tabla y no elimina registros de RDS.
  - Después de un evento individual WSS o una reconexión, realiza una sincronización REST controlada.
- Los nombres de los comandos se enriquecen con el catálogo remoto y se formatean visualmente reemplazando `_` por espacios. La normalización interna de búsqueda permanece en `domain.js`.
- Los pasos DEMO pueden actualizar la tarjeta, pero solo aparecen en la tabla si el historial REST los devuelve explícitamente.

### Estado y telemetría

### Sesión y roles

- La SPA permanece oculta hasta restaurar o iniciar sesión correctamente.
- `ADMIN` puede abrir `ADMINISTRACIÓN`; `USUARIO` solo recibe `CONTROL` y `MONITOREO`.
- La entrada visible «Modo invitado» queda preparada para la Etapa 7 y no crea una sesión ficticia.
- Todas las peticiones protegidas llevan `Authorization: Bearer`; un `401` intenta una renovación una sola vez y luego solicita nuevo login.
- El WSS recibe `?token=<access_token>` y se desconecta al expirar la sesión.
- Un `403` de una unidad `VENDIDA` se muestra como error de autorización; la UI no intenta sustituir el consentimiento de soporte.

El encabezado muestra tres indicadores independientes:

- `WSS`: estado de la sesión WebSocket del navegador (`Conectando`, `En línea`, `Reconectando`, `Desconectado`).
- `API`: resultado del endpoint de salud `GET /`.
- `RDS`: resultado del diagnóstico real `GET /health/db`; solo se marca disponible con `status: ok`, `rds: connected` y `database: mysql`.

El footer muestra el último evento WSS recibido y conserva el crédito: **Desarrollado por Isaaias Arrieta Prado · 2026**.

La sesión WSS del navegador no demuestra que un ESP8266/ESP32 esté conectado ni que el vehículo haya ejecutado físicamente un comando. Esa confirmación requiere telemetría o heartbeat del dispositivo, que no forma parte de este frontend.

## Arquitectura

```text
index.html
├── shell compartido: navegación, vehículo, indicadores y footer
├── #control
│   ├── app.js
│   └── ui.js
└── #monitor
    ├── monitoring.js
    ├── monitoring-state.js
    ├── history.js
    └── monitoring-ui.js

CONTROL y MONITOREO
          │
          ├── RestClient ── HTTPS/REST ── FastAPI/AWS ── RDS MySQL
          └── VehicleSession ── WSS ── FastAPI/AWS
```

`vehicle-session.js` crea una sola instancia compartida de `VehicleWebSocket`. `app.js` la usa para telemetría y `monitoring.js` para el estado y la reconciliación.

## Árbol del proyecto

```text
front-end/
├── index.html
├── README.md
└── assets/
    ├── favicon.svg
    ├── css/
    │   └── styles.css
    └── js/
        ├── app.js
        ├── admin.js
        ├── auth-session.js
        ├── auth-ui.js
        ├── owner-experience.js
        ├── guest-experience.js
        ├── config.js
        ├── connectivity.js
        ├── domain.js
        ├── history.js
        ├── monitoring-state.js
        ├── monitoring-ui.js
        ├── monitoring.js
        ├── navigation.js
        ├── rest-client.js
        ├── ui.js
        ├── utils.js
        ├── vehicle-session.js
        └── websocket-service.js
```

### Responsabilidad de cada archivo

| Archivo | Responsabilidad |
| --- | --- |
| `index.html` | Shell semántico, vistas `CONTROL`/`MONITOREO`/`ADMINISTRACIÓN`, login, favicon, Bootstrap y módulo principal. |
| `styles.css` | Tema visual, estados activos, toasts, layout responsive, autenticación, tablas y adaptación a `100dvh`. |
| `config.js` | Detección local/producción, URLs, vehículo, zona horaria, timeouts e intervalos. `?env=local` fuerza el backend local. |
| `app.js` | Orquestación autenticada de CONTROL, joysticks, DEMO, monitoreo, WSS y administración. |
| `auth-session.js` | Tokens de sesión en `sessionStorage`, login, refresh, perfil y logout. |
| `auth-ui.js` | Modal de login, identidad visible, rol, logout y acceso invitado preparado. |
| `admin.js` | Dashboard y CRUD administrativos con `/admin/*`, comandos/demos por unidad y auditoría. |
| `owner-experience.js` | Selector dinámico de unidades, soporte temporal y CRUD/ejecución de demos privadas. |
| `guest-experience.js` | Catálogo público, reserva de exhibición, temporizador de 05:00 y finalización segura. |
| `ui.js` | Render seguro de CONTROL, indicadores, botones activos, DEMO, toasts estándar y pasos DEMO. |
| `domain.js` | Validación/indexación del catálogo, alias de comandos, payloads y reglas de DETENER. |
| `rest-client.js` | `fetch`, timeout, `AbortController`, CORS, Bearer, refresh ante `401`, errores HTTP y endpoints REST. |
| `connectivity.js` | Comprobación de API y RDS, más monitor periódico de conectividad. |
| `navigation.js` | Cambio de vista por hash, permisos visibles por rol, `aria-current`, `hidden`, título y enlace de salto. |
| `monitoring.js` | Carga inicial, catálogo, último estado, historial, eventos WSS y sincronización REST. |
| `monitoring-state.js` | Validación y normalización de estado REST y eventos WSS. |
| `monitoring-ui.js` | Render seguro de tarjeta, fechas, estado WSS y tabla de historial. |
| `history.js` | Validación, orden, deduplicación y límite de registros históricos. |
| `vehicle-session.js` | Fachada compartida para suscriptores de mensajes, estados, errores y cierre WSS. |
| `websocket-service.js` | Apertura, recepción, cierre, errores y reconexión exponencial del WSS. |
| `utils.js` | Validaciones, texto seguro, formateo de comandos/fechas, JSON y creación de elementos. |

## Configuración real

`assets/js/config.js` detecta `localhost`/`127.0.0.1` y usa local automáticamente. En GitHub Pages usa producción. También puede forzarse local con `?env=local` o producción con `?env=production`:

```js
local: {
  apiBaseUrl: 'http://127.0.0.1:8000',
  websocketBaseUrl: 'ws://127.0.0.1:8000'
}
production: {
  apiBaseUrl: 'https://api-iot-26.duckdns.org',
  websocketBaseUrl: 'wss://api-iot-26.duckdns.org'
}
studentName: 'Isaaias Arrieta Prado'
displayTimeZone: 'America/Mexico_City'
requestTimeoutMs: 10000
historySyncDelayMs: 450
connectivityCheckIntervalMs: 60000
websocketReconnectBaseMs: 1000
websocketReconnectMaxMs: 15000
```

El frontend no contiene secretos, claves AWS ni credenciales MySQL. Los tokens de sesión se guardan temporalmente en `sessionStorage`, se envían como Bearer y no sustituyen la autorización aplicada por FastAPI.

## Endpoints REST consumidos

| Método | Ruta | Uso |
| --- | --- | --- |
| `POST` | `/auth/login` | Inicio de sesión. |
| `POST` | `/auth/refresh` | Renovación del access token. |
| `POST` | `/auth/logout` | Revocación de sesión. |
| `GET` | `/auth/me` | Perfil y roles actuales. |
| `GET` | `/` | Salud de la API; se espera `status: ok`. |
| `GET` | `/health/db` | Diagnóstico RDS; se espera `status: ok`, `rds: connected`, `database: mysql`. |
| `GET` | `/vehiculos/{id}` | Nombre e identidad del vehículo. |
| `GET` | `/comandos/vehiculo/{id}` | Catálogo activo de comandos. |
| `GET` | `/estado/vehiculo/{id}` | Último estado reportado. |
| `GET` | `/vehiculos/{id}/historial` | Registros persistidos para la tabla de diez filas. |
| `GET` | `/demos/vehiculo/{id}` | Catálogo de DEMOs. |
| `POST` | `/vehiculos/{id}/comando` | Envío de comandos manuales y `DETENER`. |
| `POST` | `/demos/ejecutar` | Inicio de una DEMO. |

La vista ADMINISTRACIÓN consume `GET/POST /admin/modelos`, `/admin/unidades`, `/admin/clientes`, `/admin/asignaciones`, `POST /admin/asignaciones/{id}/revocar`, `GET /admin/dashboard` y `GET /admin/auditoria`. Los comandos y demos se consultan por la unidad seleccionada mediante los endpoints existentes `/comandos/vehiculo/{id}` y `/demos/vehiculo/{id}`; si una unidad vendida requiere consentimiento de soporte, la API devuelve `403` y la interfaz lo comunica.

La experiencia del propietario consume `GET /me/vehiculos`, `GET /me/soporte/admins`, `GET/POST /me/vehiculos/{id}/soporte`, `DELETE /me/vehiculos/{id}/soporte/{id_autorizacion}`, además de `GET/POST/PUT/DELETE /me/demos` y sus rutas de movimientos. El selector nunca usa un vehículo fijo; al cambiarlo se recargan estado, historial, comandos y WSS.

El modo invitado consume `GET /invitado/vehiculos`, `POST /invitado/sesion` y `POST /invitado/sesion/finalizar`. Solo se muestran unidades `EXHIBICION`; la reserva bloquea el selector a una unidad durante 05:00 y permite únicamente control, monitoreo y demos de empresa.

### Payloads usados

Comando manual:

```json
{
  "id_comando": 2,
  "conectado": true,
  "origen": "MANUAL"
}
```

Ejecución de DEMO:

```json
{
  "id_demo": 1,
  "id_vehiculo": 1
}
```

El catálogo remoto contiene objetos con al menos `id_comando` y `nombre`; los comandos activos además deben cumplir la validación de `domain.js`.

## Contratos de estado, historial y WSS

Estado REST observado:

```json
{
  "id_vehiculo": 1,
  "id_comando": 14,
  "conectado": true,
  "fecha_hora": null,
  "vehiculo": "Excavadora IoT",
  "comando": "DETENER",
  "codigo": 0,
  "fecha_actualizacion": "2026-11-11T23:18:31"
}
```

Cada fila de historial usa `id_historial`, `id_vehiculo`, `comando`, `codigo`, `id_comando`, `fecha_hora` y `origen`. El frontend conserva los nombres del backend para la lógica y aplica formato visual para mostrar espacios en lugar de guiones bajos.

Evento WSS de movimiento DEMO observado:

```json
{
  "event": "nuevo_movimiento",
  "id_demo": 1,
  "id_vehiculo": 1,
  "paso": 5,
  "total": 8,
  "orden": 5,
  "id_comando": 8,
  "comando": "LUZ",
  "codigo": 8,
  "conectado": true,
  "origen": "DEMO",
  "timestamp": "2026-11-17T22:29:12.553076+00:00",
  "duracion_ms": 900,
  "pausa_ms": 250
}
```

Los mensajes WSS se reciben como JSON cuando el backend los publica. El frontend filtra por `id_vehiculo`, valida `event` y `timestamp` para Monitoreo, y muestra la telemetría en el footer. Un evento WSS es evidencia de publicación del backend, no de ejecución física.

## Diseño responsivo y accesibilidad

- `gamepad-wrapper` ocupa `100dvh` y mantiene `overflow: hidden` para que el footer no sea expulsado de la pantalla.
- `.app-view[hidden]` usa `display: none !important`, evitando que una vista oculta ocupe espacio.
- `gamepad-shell` es una cuadrícula de tres columnas en escritorio y landscape corto.
- En portrait móvil usa dos columnas y dos filas: acciones arriba y joysticks lado a lado.
- Los tamaños de joystick usan `--joystick-size` y `--knob-size`; la perilla permanece centrada con `calc()`.
- El footer conserva telemetría y créditos; en pantallas menores a `420px` reduce la tipografía sin ocultar `.student-credit`.
- Monitoreo conserva scroll vertical interno para su contenido.
- Existe enlace «Saltar al contenido», foco visible, `aria-live`, `aria-current`, nombres accesibles y controles activables por teclado.
- Los datos remotos se insertan con `textContent`; no se usa HTML remoto como plantilla.

## Ejecución local

Los módulos ES no deben abrirse con `file://`. Desde la carpeta `front-end`:

```bash
python -m http.server 5500
```

Con el backend de Etapa 6 ejecutándose en otra terminal (`python-apis`):

```powershell
cd ..\python-apis
Copy-Item .env.example .env
# Completa .env con las credenciales RDS y JWT_SECRET requeridas por el backend.
uvicorn app.main:app --reload --port 8000
```

En una segunda terminal, dentro de `front-end`, abre:

```text
http://localhost:5500/?env=local#control
http://localhost:5500/?env=local#monitor
http://localhost:5500/?env=local#admin
```

Inicia sesión con el `ADMIN` creado mediante `python -m app.scripts.create_admin` y prueba con un `USUARIO` propietario. Verifica selector vacío, cambio entre unidades, soporte de 30 minutos, revocación, creación de demo, límites de 100 pasos/300000 ms, aislamiento entre usuarios y ejecución con `DETENER`. También puede probar producción en `https://isaaias-cloud.github.io/carrito-iot-control/`.

También puede utilizarse Live Server de VS Code. El backend debe permitir CORS para el origen local y para la URL final de GitHub Pages. CORS no constituye autenticación.

## Verificación técnica

Comprobar sintaxis JavaScript desde PowerShell:

```powershell
Get-ChildItem assets/js -Filter *.js | ForEach-Object { node --check $_.FullName }
```

Comprobar el diff:

```bash
git diff --check
```

Pruebas funcionales recomendadas:

1. Login válido/inválido, restauración de sesión, refresh ante `401` y logout.
2. Carga de `#control`, `#monitor` y `#admin` según el rol.
3. Dashboard ADMIN con métricas reales y estados de inventario.
4. Alta de modelo, unidad, cliente, asignación y revocación; validar mensajes `409`/`422`.
5. Consulta de comandos/demos por unidad y mensaje `403` cuando falta soporte.
6. Selector `Mis vehículos`, recarga de estado/historial/comandos y reconexión WSS aislada.
7. Soporte: autorización, contador, expiración y revocación.
8. Demos privadas: alta, edición, pasos, eliminación, ejecución y rechazo de comando no permitido.
9. Invitado: catálogo `EXHIBICION`, reserva exclusiva, temporizador 05:00, finalización y liberación por cierre/expiración.
10. Invitado bloqueado en `/me/*`, `/admin/*`, demos privadas y otras unidades.
11. Auditoría paginada/filtrable y estados vacíos.
12. Joysticks táctiles/puntero y teclado; confirmar `DETENER` al liberar.
13. Botones centrales: estado `.is-active`, exclusión de `Apagar`, pulso de 500 ms y paro automático.
14. DEMO: verificar notificación WSS paso/total, comando y progreso.
15. Cinco toasts estándar: solo deben quedar tres; `.demo-step-toast` no cuenta para el límite.
16. Carga de estado e historial; confirmar máximo diez filas y nombres legibles.
17. Pérdida/reconexión WSS, estados API/RDS/WSS y pruebas mobile first.

## Publicación en GitHub Pages

1. Mantén la estructura `assets/` y los paths relativos.
2. Publica el repositorio o la carpeta configurada en **Settings → Pages**.
3. Comprueba que `index.html`, CSS, módulos JS y favicon cargan bajo la subruta.
4. Usa una URL HTTPS de Pages; el frontend utiliza HTTPS para REST y WSS para evitar mixed content.
5. Confirma que el backend permite el origen exacto de Pages mediante CORS.
6. Ejecuta una prueba WSS independiente con Postman, Thunder Client o una extensión WebSocket.

## Limitaciones y seguridad

- No hay conexión directa del navegador con RDS.
- La administración se limita a los endpoints publicados por FastAPI; comandos y demos se consultan por las rutas legacy protegidas y no se duplican datos en el navegador.
- No hay integración física confirmable con ESP8266/ESP32 desde el frontend actual.
- El backend no expone una operación de cancelación de DEMO en el contrato documentado; `DETENER` es un comando de paro, no una confirmación de cancelación de secuencia.
- Un HTTP 2xx demuestra aceptación de la API, y un evento WSS demuestra publicación; ninguno demuestra por sí solo ejecución física.
- La URL final de GitHub Pages y su autorización CORS deben comprobarse antes de publicar.
- Los endpoints externos y su disponibilidad pueden cambiar; este README documenta el contrato observado y la integración presente en el código.

## Créditos

Desarrollado por **Isaaias Arrieta Prado · 2026**.
