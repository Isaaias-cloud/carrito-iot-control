# Control de vehículo IoT

Frontend estático, Mobile First y sin backend propio para controlar el vehículo `1` mediante el API FastAPI existente. Está pensado para publicarse directamente en GitHub Pages.

## Contrato validado

Validé mediante consultas HTTPS de solo lectura el `openapi.json` y estos recursos del API el 9 de noviembre de 2026:

- Base: `https://api-iot-26.duckdns.org`
- Health real: `GET /` → `status: ok`, versión `2.1.0`.
- Vehículo: `GET /vehiculos/1` → `Excavadora IoT`, ESP8266.
- Comandos: `GET /comandos/vehiculo/1` → catálogo activo con `DETENER`, movimiento y acciones auxiliares.
- DEMO: `GET /demos/vehiculo/1` → `Demo principal` y `Recorrido corto`.
- Ejecución: `POST /demos/ejecutar` con `{ "id_demo": 1, "id_vehiculo": 1 }`.
- Movimiento: `POST /vehiculos/1/comando` con `{ "id_comando": 2, "conectado": true, "origen": "MANUAL" }`.
- WebSocket: `wss://api-iot-26.duckdns.org/ws/vehiculo/1`.

No se usa el endpoint HTTP `http://3.223.103.55:8000/demos/ejecutar` porque produciría mixed content desde GitHub Pages HTTPS; el contrato OpenAPI disponible expone `POST /demos/ejecutar` en el host HTTPS.

El API no expone una operación de cancelación de DEMO. Por eso «Solicitar DETENER» envía el comando real `DETENER`, informa la limitación y no promete que el backend haya cancelado la secuencia. El API tampoco expone un diagnóstico RDS; el indicador queda correctamente en «Sin verificar».

## Arquitectura y flujo de datos

```text
UI semántica (index.html)
       │ eventos Pointer/Keyboard/Click
       ▼
app.js ──────────────── websocket-service.js ── WSS real
  │  │
  │  └───────────────── ui.js (render seguro con textContent)
  │
  ├── domain.js (catálogo, mapeo direcciones, validación, prioridad DETENER)
  └── rest-client.js ── Fetch + timeout + parseo + errores ── API FastAPI/AWS
                                                        │
                                                        └── RDS solo detrás del backend
```

1. Al cargar, la interfaz abre WSS y consulta `GET /`, vehículo, catálogo, DEMO y estado.
2. El catálogo remoto define qué botones y direcciones están disponibles; no hay IDs de comando inventados.
3. Una transición del joystick dispara como máximo un POST por cambio de dirección. Neutral, cancelación, pérdida del puntero y botón rojo solicitan `DETENER`.
4. Todos los controles usan el mismo `sendCommand()` y `POST /vehiculos/{id}/comando`.
5. La DEMO se inicia con un único `POST /demos/ejecutar`; el navegador no reproduce ni almacena sus pasos.
6. Los eventos WSS se muestran como telemetría de la sesión del navegador. WSS o API disponible no se presentan como confirmación de conexión física del ESP8266.

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
        ├── app.js               # Orquestación, eventos y estados de la pantalla
        ├── config.js            # URLs, vehículo, timeouts y nombre del alumno
        ├── domain.js            # Reglas de dominio y catálogo remoto
        ├── rest-client.js       # Cliente Fetch modular
        ├── ui.js                # Render y accesibilidad de la interfaz
        ├── utils.js             # Validaciones y utilidades seguras
        └── websocket-service.js # Apertura, reconexión y eventos WSS
```

## Configuración

Edita solo `assets/js/config.js` para cambiar el vehículo o el crédito del footer:

```js
studentName: 'Nombre completo real del alumno'
```

No hay contraseñas, tokens, credenciales AWS ni conexiones MySQL en el frontend. El `conectado` enviado al contrato es un dato de la operación REST; no se interpreta como prueba de hardware físico.

## Ejecución local

Los módulos ES no deben abrirse con `file://`. Usa cualquier servidor estático, por ejemplo:

```bash
python -m http.server 5500
```

Abre `http://localhost:5500/`. Para un servidor equivalente de Node se puede usar `npx serve .`, sin agregarlo al proyecto.

El navegador debe permitir CORS desde el origen local. Para GitHub Pages, el backend debe autorizar el origen exacto `https://<usuario>.github.io` o `https://<usuario>.github.io/<repositorio>` según la configuración real del despliegue. CORS no es autenticación.

En una comprobación de solo lectura del 9 de noviembre de 2026, el preflight de `POST /vehiculos/1/comando` respondió `200`, `Access-Control-Allow-Origin: *` y permitió `content-type`; la configuración puede cambiar y debe verificarse también con la URL final de Pages.

## Publicación en GitHub Pages

1. Crea un repositorio y copia estos archivos conservando la carpeta `assets/`.
2. Reemplaza `studentName` en `assets/js/config.js`.
3. Verifica localmente los módulos y la consola del navegador.
4. Publica la rama o carpeta seleccionada desde **Settings → Pages**.
5. Abre la URL HTTPS de Pages y confirma que cargan `assets/favicon.svg`, `assets/css/styles.css` y `assets/js/app.js` bajo la subruta.
6. Solicita al backend CORS para esa URL, si todavía no está autorizado.
7. Comprueba que WSS conecta y que no se intenta abrir ningún recurso `http://`.

Todos los paths son relativos (`./...`) para funcionar en una subruta de GitHub Pages.

## Prueba independiente de WebSocket

La sesión del navegador permanece abierta en `wss://api-iot-26.duckdns.org/ws/vehiculo/1`. En Postman, Thunder Client o una extensión WebSocket:

1. Abre una conexión WSS independiente a esa URL.
2. Abre el frontend en otra pestaña.
3. Espera el indicador «En línea» en ambas sesiones.
4. Presiona `AVANZAR`, otro movimiento y `DETENER` en el frontend.
5. Comprueba que llegan eventos asociados al vehículo `1`, `id_comando`, `conectado`, `origen` y `timestamp` cuando el backend los publique.
6. Para DEMO, registra hora de inicio, observa N eventos `nuevo_movimiento`, espera la respuesta de `POST /demos/ejecutar` y verifica sus contadores `total_movimientos` y `movimientos_ejecutados`.
7. Si presionas DETENER durante una DEMO, verifica el evento de DETENER y recuerda que el contrato actual no ofrece una cancelación de DEMO confirmable.

Un HTTP 2xx y un evento WSS solo prueban aceptación/publicación en el backend; no prueban ejecución física.

## Casos de prueba

### Joystick y teclado

- Arrastra hacia cada dirección disponible: se envía un POST solo al entrar en la dirección.
- Mantén el puntero quieto: no se generan POST por píxel ni por frame.
- Regresa a la zona neutral o suelta: el knob vuelve al centro y se envía DETENER.
- Cancela el gesto, cambia de pestaña o pierde el puntero: se solicita DETENER.
- Enfoca el joystick con teclado y prueba flechas/WASD, incluyendo `keyup`.
- Cambia rápidamente de dirección: el envío se serializa y DETENER aborta la solicitud local pendiente con prioridad.

### Botones y errores

- Confirma que solo aparecen comandos activos devueltos por el API.
- Haz doble click: no deben existir dos POST simultáneos del mismo control.
- Desconecta la red: aparece mensaje de error y el estado se vuelve visible.
- Devuelve 422/404/5xx en un entorno controlado: el mensaje es amigable y no se inserta JSON como HTML.

### DEMO

- Selecciona cada DEMO y confirma que la descripción proviene del API.
- Inicia una DEMO y verifica que el navegador no ejecuta timers ni inventa pasos.
- Intenta iniciar otra mientras corre: el botón permanece deshabilitado.
- Presiona Solicitar DETENER: se envía DETENER y se comunica honestamente la ausencia de endpoint de cancelación.

### Responsive y accesibilidad

- Prueba móvil vertical/horizontal, tableta y escritorio.
- Comprueba que no haya scroll horizontal, que el footer no se superponga y que los controles táctiles tengan áreas cómodas.
- Navega con Tab, activa controles con teclado y revisa foco visible, contraste y mensajes `aria-live`.
- Comprueba el favicon y todos los recursos en la URL final de GitHub Pages.

## Checklist de seguridad y calidad

- [x] HTTPS para REST y WSS para tiempo real; sin mixed content intencional.
- [x] Sin secretos, tokens privilegiados, credenciales AWS/RDS o conexión MySQL en cliente.
- [x] Sin acceso directo a RDS y sin endpoint `/health` inventado.
- [x] JSON remoto validado antes de usarlo; texto renderizado con `textContent`.
- [x] `AbortController`, timeout, errores HTTP y solicitudes tardías gestionados.
- [x] `DETENER` con prioridad y catálogo dinámico; no se inventan IDs ni pasos.
- [x] Indicadores separados para WSS, API y RDS; RDS permanece «Sin verificar» sin diagnóstico real.
- [x] Favicon propio y footer responsivo con crédito configurable.
- [ ] Confirmar en el backend CORS, métodos autorizados y origen exacto de GitHub Pages.
- [ ] Sustituir `[Nombre completo del alumno]` en `assets/js/config.js`.
- [ ] Ejecutar la prueba WSS independiente y validar comportamiento físico cuando el hardware esté conectado.

## Commits sugeridos

```text
feat: crear shell mobile first del control IoT
feat: integrar catálogo, comandos y DEMO con API FastAPI
feat: agregar sesión WebSocket con reconexión
docs: documentar contrato, publicación y pruebas
```
