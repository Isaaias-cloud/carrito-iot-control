# Control y monitoreo del vehículo IoT

Frontend estático Mobile First para controlar y monitorear en tiempo real el vehículo `1`, identificado por la API como **Excavadora IoT**. El proyecto no contiene backend propio, no accede directamente a MySQL/RDS y está preparado para publicarse en GitHub Pages.

La aplicación conserva dos vistas dentro del mismo documento:

- `#control`: joysticks, acciones manuales, `DETENER` y ejecución de DEMO.
- `#monitor`: último movimiento reportado y los diez registros persistidos más recientes.

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
| `index.html` | Shell semántico, vistas `CONTROL`/`MONITOREO`, IDs de UI, favicon, Bootstrap y módulo principal. |
| `styles.css` | Tema visual, estados activos, toasts, layout responsive y adaptación a `100dvh`. |
| `config.js` | URLs, vehículo, zona horaria, timeouts, intervalos y límites de reconexión. |
| `app.js` | Orquestación de CONTROL, joysticks, teclado, botones, DEMO, pulso de acciones, telemetría WSS e inicialización. |
| `ui.js` | Render seguro de CONTROL, indicadores, botones activos, DEMO, toasts estándar y pasos DEMO. |
| `domain.js` | Validación/indexación del catálogo, alias de comandos, payloads y reglas de DETENER. |
| `rest-client.js` | `fetch`, timeout, `AbortController`, CORS, parseo JSON, errores HTTP e historial/RDS/DEMO. |
| `connectivity.js` | Comprobación de API y RDS, más monitor periódico de conectividad. |
| `navigation.js` | Cambio de vista por hash, `aria-current`, `hidden`, título y enlace de salto. |
| `monitoring.js` | Carga inicial, catálogo, último estado, historial, eventos WSS y sincronización REST. |
| `monitoring-state.js` | Validación y normalización de estado REST y eventos WSS. |
| `monitoring-ui.js` | Render seguro de tarjeta, fechas, estado WSS y tabla de historial. |
| `history.js` | Validación, orden, deduplicación y límite de registros históricos. |
| `vehicle-session.js` | Fachada compartida para suscriptores de mensajes, estados y errores WSS. |
| `websocket-service.js` | Apertura, recepción, cierre, errores y reconexión exponencial del WSS. |
| `utils.js` | Validaciones, texto seguro, formateo de comandos/fechas, JSON y creación de elementos. |

## Configuración real

Los valores actuales de `assets/js/config.js` son:

```js
apiBaseUrl: 'https://api-iot-26.duckdns.org'
websocketUrl: 'wss://api-iot-26.duckdns.org/ws/vehiculo/1'
vehicleId: 1
studentName: 'Isaaias Arrieta Prado'
displayTimeZone: 'America/Mexico_City'
requestTimeoutMs: 10000
historySyncDelayMs: 450
connectivityCheckIntervalMs: 60000
websocketReconnectBaseMs: 1000
websocketReconnectMaxMs: 15000
```

El frontend no contiene tokens, claves AWS, credenciales MySQL ni encabezados de autorización. `RestClient` usa `mode: 'cors'` y `credentials: 'omit'`; cualquier autenticación adicional debe ser definida por el backend antes de incorporarse.

## Endpoints REST consumidos

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/` | Salud de la API; se espera `status: ok`. |
| `GET` | `/health/db` | Diagnóstico RDS; se espera `status: ok`, `rds: connected`, `database: mysql`. |
| `GET` | `/vehiculos/{id}` | Nombre e identidad del vehículo. |
| `GET` | `/comandos/vehiculo/{id}` | Catálogo activo de comandos. |
| `GET` | `/estado/vehiculo/{id}` | Último estado reportado. |
| `GET` | `/vehiculos/{id}/historial` | Registros persistidos para la tabla de diez filas. |
| `GET` | `/demos/vehiculo/{id}` | Catálogo de DEMOs. |
| `POST` | `/vehiculos/{id}/comando` | Envío de comandos manuales y `DETENER`. |
| `POST` | `/demos/ejecutar` | Inicio de una DEMO. |

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

Los módulos ES no deben abrirse con `file://`. Desde la raíz del proyecto:

```bash
python -m http.server 5500
```

Después abre:

```text
http://localhost:5500/#control
http://localhost:5500/#monitor
```

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

1. Carga de `#control` y `#monitor`.
2. Joysticks táctiles/puntero y teclado; confirmar `DETENER` al liberar.
3. Botones centrales: estado `.is-active`, exclusión de `Apagar`, pulso de 500 ms y paro automático.
4. DEMO: verificar notificación WSS paso/total, comando y progreso.
5. Cinco toasts estándar: solo deben quedar tres; `.demo-step-toast` no cuenta para el límite.
6. Carga de estado e historial; confirmar máximo diez filas y nombres legibles.
7. Evento WSS desde otra pestaña o cliente independiente.
8. Pérdida/reconexión WSS y sincronización REST.
9. Estados independientes de API, RDS y WSS.
10. Pruebas en escritorio, móvil portrait y móvil landscape, incluyendo footer y créditos.

## Publicación en GitHub Pages

1. Mantén la estructura `assets/` y los paths relativos.
2. Publica el repositorio o la carpeta configurada en **Settings → Pages**.
3. Comprueba que `index.html`, CSS, módulos JS y favicon cargan bajo la subruta.
4. Usa una URL HTTPS de Pages; el frontend utiliza HTTPS para REST y WSS para evitar mixed content.
5. Confirma que el backend permite el origen exacto de Pages mediante CORS.
6. Ejecuta una prueba WSS independiente con Postman, Thunder Client o una extensión WebSocket.

## Limitaciones y seguridad

- No hay conexión directa del navegador con RDS.
- No hay administración, CRUD, tablas nuevas ni procedimientos almacenados en este repositorio.
- No hay integración física confirmable con ESP8266/ESP32 desde el frontend actual.
- El backend no expone una operación de cancelación de DEMO en el contrato documentado; `DETENER` es un comando de paro, no una confirmación de cancelación de secuencia.
- Un HTTP 2xx demuestra aceptación de la API, y un evento WSS demuestra publicación; ninguno demuestra por sí solo ejecución física.
- La URL final de GitHub Pages y su autorización CORS deben comprobarse antes de publicar.
- Los endpoints externos y su disponibilidad pueden cambiar; este README documenta el contrato observado y la integración presente en el código.

## Créditos

Desarrollado por **Isaaias Arrieta Prado · 2026**.
