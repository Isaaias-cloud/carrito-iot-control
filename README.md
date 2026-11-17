# Control y monitoreo de vehículo IoT

Frontend estático, Mobile First y sin backend propio para controlar y monitorear el vehículo `1` mediante el API FastAPI existente. Está pensado para publicarse directamente en GitHub Pages.

## Contrato validado

El contrato de CONTROL fue validado mediante consultas HTTPS de solo lectura y los contratos de MONITOREO fueron confirmados con respuestas reales del API el 11 de noviembre de 2026:

- Base: `https://api-iot-26.duckdns.org`
- Health real: `GET /` → `status: ok`, versión `2.1.0`.
- Vehículo: `GET /vehiculos/1` → `Excavadora IoT`, ESP8266.
- Comandos: `GET /comandos/vehiculo/1` → catálogo activo con `DETENER`, movimiento y acciones auxiliares.
- DEMO: `GET /demos/vehiculo/1` → `Demo principal` y `Recorrido corto`.
- Ejecución: `POST /demos/ejecutar` con `{ "id_demo": 1, "id_vehiculo": 1 }`.
- Movimiento: `POST /vehiculos/1/comando` con `{ "id_comando": 2, "conectado": true, "origen": "MANUAL" }`.
- Último estado: `GET /estado/vehiculo/1` devuelve `id_vehiculo`, `id_comando`, `conectado`, `fecha_hora`, `vehiculo`, `comando`, `codigo` y `fecha_actualizacion`.
- Historial: `GET /vehiculos/1/historial` devuelve registros persistidos con `id_historial`, `id_vehiculo`, `comando`, `codigo`, `id_comando`, `fecha_hora` y `origen`.
- Diagnóstico RDS: `GET /health/db` devuelve `{"status":"ok","rds":"connected","database":"mysql"}`.
- WebSocket: `wss://api-iot-26.duckdns.org/ws/vehiculo/1`.

No se usa el endpoint HTTP `http://3.223.103.55:8000/demos/ejecutar` porque produciría mixed content desde GitHub Pages HTTPS; el contrato OpenAPI disponible expone `POST /demos/ejecutar` en el host HTTPS.

El API no expone una operación de cancelación de DEMO. Por eso «Solicitar DETENER» envía el comando real `DETENER`, informa la limitación y no promete que el backend haya cancelado la secuencia. El diagnóstico RDS sí está disponible mediante `/health/db`; el frontend solo marca RDS como disponible cuando la respuesta coincide exactamente con el contrato observado.

## Arquitectura y flujo de datos

```text
UI semántica (index.html)
       │ hash navigation
       ├── CONTROL (app.js + ui.js)
       └── MONITOREO (monitoring.js + monitoring-ui.js)
                    │
                    ├── GET estado ───────┐
                    ├── GET historial ─────┼── rest-client.js ── HTTPS ── FastAPI/AWS
                    └── evento WSS ────────┘                       │
                                                                    └── RDS detrás del backend

vehicle-session.js mantiene una única conexión WSS compartida por ambas vistas.
```

1. Al cargar, la interfaz abre una única sesión WSS y consulta `GET /`, vehículo, catálogo, DEMO y los datos de MONITOREO.
2. El catálogo remoto define qué botones y direcciones están disponibles; no hay IDs de comando inventados.
3. Una transición del joystick dispara como máximo un POST por cambio de dirección. Neutral, cancelación, pérdida del puntero y botón rojo solicitan `DETENER`.
4. Todos los controles usan el mismo `sendCommand()` y `POST /vehiculos/{id}/comando`.
5. La DEMO se inicia con un único `POST /demos/ejecutar`; el navegador no reproduce ni almacena sus pasos.
6. Los eventos WSS se muestran como telemetría de la sesión del navegador. WSS o API disponible no se presentan como confirmación de conexión física del ESP8266.
7. MONITOREO usa `fecha_actualizacion` para el estado actual y `id_historial` para ordenar y deduplicar los registros persistidos.
8. Un evento WSS actualiza la tarjeta inmediatamente. La tabla solo se actualiza después de una nueva consulta controlada al historial REST; los pasos DEMO no se insertan localmente.

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
        ├── app.js               # CONTROL y orquestación compartida
        ├── config.js            # URLs, vehículo, timeouts y nombre del alumno
        ├── connectivity.js      # Indicadores independientes API y RDS
        ├── domain.js            # Reglas de dominio y catálogo remoto
        ├── history.js            # Validación, orden y límite del historial
        ├── monitoring.js         # Orquestación de MONITOREO
        ├── monitoring-state.js  # Validación y normalización de estado/WSS
        ├── monitoring-ui.js     # Render seguro de tarjeta e historial
        ├── navigation.js         # Navegación CONTROL/MONITOREO
        ├── rest-client.js       # Cliente Fetch modular
        ├── ui.js                # Render y accesibilidad de la interfaz
        ├── utils.js             # Validaciones y utilidades seguras
        ├── vehicle-session.js   # Sesión WSS compartida
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

En una comprobación de solo lectura del 9 de noviembre de 2026, el preflight de `POST /vehiculos/1/comando` respondió `200`, `Access-Control-Allow-Origin: *` y permitió `content-type`; la configuración puede cambiar y debe verificarse también con la URL final de Pages. Las respuestas de estado, historial y RDS fueron confirmadas el 11 de noviembre de 2026.

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

### MONITOREO y reconciliación

- Carga inicial: abrir `#monitor`, comprobar que la tarjeta usa `GET /estado/vehiculo/1` y que la tabla muestra como máximo diez filas de `GET /vehiculos/1/historial`.
- El orden visible se basa en `id_historial` descendente; el frontend no crea filas persistentes ni elimina registros del backend.
- Comando desde CONTROL: enviar un movimiento y comprobar el evento WSS en la tarjeta. Después de la sincronización REST, verificar si el movimiento aparece en historial.
- Segunda pestaña o cliente WSS: producir un comando externo y comprobar que la primera pestaña actualiza MONITOREO sin recargar.
- Más de diez movimientos: comprobar que solo se muestran diez y que los registros antiguos siguen existiendo en el API.
- Duplicados y orden: repetir el mismo evento WSS y comprobar que no se agrega una fila local; la tabla se reconstruye únicamente desde `id_historial`.
- Pérdida y reconexión WSS: simular desconexión, comprobar «Desconectado»/«Reconectando» y verificar una resincronización REST al volver «En línea».
- DEMO: comprobar que sus pasos pueden actualizar la tarjeta, pero no se agregan a la tabla salvo que el historial REST los devuelva explícitamente.
- Fecha y hora: comparar la tarjeta y tabla con `fecha_actualizacion`/`fecha_hora`; los valores con zona explícita se convierten a `America/Mexico_City` y los valores sin zona se muestran literalmente como hora del backend, porque el contrato no documenta una zona para esos campos.
- Salud: comprobar API mediante `/`, RDS mediante `/health/db` y WSS mediante el estado real de la sesión. Ninguno sustituye a los otros.

Evidencia recomendada: captura de la tarjeta antes y después del evento, consola de red con las respuestas REST, cliente WSS independiente mostrando el mismo evento, y captura del historial antes/después de la sincronización. La ejecución física del ESP8266/ESP32 queda pendiente hasta contar con hardware y telemetría de presencia.

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
- [x] Indicadores separados para WSS, API y RDS; RDS se valida con `/health/db` sin conectarse directamente a MySQL.
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
