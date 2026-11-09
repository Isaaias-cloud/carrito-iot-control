import { APP_CONFIG, ENDPOINTS } from './config.js';
import { ApiError, RestClient, validateCommandList, validateHealth } from './rest-client.js';
import { VehicleWebSocket } from './websocket-service.js';
import { ControlUI } from './ui.js';
import { commandForCenterAction, commandForJoystickDirection, commandPayload, getStopCommand, indexActiveCommands } from './domain.js';
import { isRecord, safeText } from './utils.js';

const api = new RestClient({ baseUrl: APP_CONFIG.apiBaseUrl });
const ui = new ControlUI();
let commandIndex = { byName: new Map(), byId: new Map(), all: [] };
let vehicleState = { conectado: true };
let activeRequest = null;
let pendingCommand = null;
let lastCompletedCommand = { id: null, at: 0 };

const joystickState = {
  left: { pointerId: null, direction: 'neutral' },
  right: { pointerId: null, direction: 'neutral' },
};

const KEY_BINDINGS = Object.freeze({
  w: { joystick: 'left', direction: 'up' },
  a: { joystick: 'left', direction: 'left' },
  s: { joystick: 'left', direction: 'down' },
  d: { joystick: 'left', direction: 'right' },
  ArrowUp: { joystick: 'right', direction: 'up' },
  ArrowLeft: { joystick: 'right', direction: 'left' },
  ArrowDown: { joystick: 'right', direction: 'down' },
  ArrowRight: { joystick: 'right', direction: 'right' },
});

const keyboardDirections = { left: new Set(), right: new Set() };

function getConnectedFlag() {
  return typeof vehicleState.conectado === 'boolean' ? vehicleState.conectado : true;
}

function setBusy(isBusy) {
  ui.setActionButtonsDisabled(isBusy);
}

function joystickLabel(direction) {
  return direction === 'neutral' ? 'Neutral' : direction.toUpperCase();
}

function setJoystickReadout(joystick, direction) {
  if (joystick === 'left') ui.setLeftDirectionReadout(joystickLabel(direction));
  else ui.setRightDirectionReadout(joystickLabel(direction));
}

function resetJoystickVisual(joystick) {
  if (joystick === 'left') ui.updateLeftJoystickVisual(0, 0);
  else ui.updateRightJoystickVisual(0, 0);
  setJoystickReadout(joystick, 'neutral');
}

async function handleCommandExecution(command, { button = null, isStop = false } = {}) {
  if (!command) {
    ui.toast(isStop ? 'DETENER no está disponible en el catálogo remoto.' : 'Esta función no está disponible en el catálogo remoto.', 'error');
    return false;
  }
  if (activeRequest && !isStop) {
    if (pendingCommand?.command.id_comando === command.id_comando) return false;
    pendingCommand = { command, button };
    return false;
  }
  if (isStop && activeRequest?.isStop) return false;
  if (!isStop && lastCompletedCommand.id === command.id_comando && Date.now() - lastCompletedCommand.at < 350) return false;
  if (isStop) {
    pendingCommand = null;
    activeRequest?.controller.abort();
  }

  const controller = new AbortController();
  const requestToken = Symbol('command');
  activeRequest = { controller, requestToken, isStop };
  if (button) ui.markButton(button, 'sending');
  setBusy(!isStop);

  try {
    const response = await api.request(ENDPOINTS.sendCommand(APP_CONFIG.vehicleId), {
      method: 'POST',
      body: commandPayload(command, getConnectedFlag()),
      signal: controller.signal,
    });
    if (!isRecord(response) || Number(response.id_comando) !== Number(command.id_comando)) {
      throw new Error('La respuesta del comando no coincide con la solicitud.');
    }
    vehicleState = { ...vehicleState, conectado: response.conectado };
    if (!isStop) lastCompletedCommand = { id: command.id_comando, at: Date.now() };
    if (button) ui.markButton(button, 'accepted');
    if (!isStop) ui.toast(`${safeText(command.nombre)} aceptado por la API.`, 'success');
    return true;
  } catch (error) {
    if (button) ui.markButton(button, 'error');
    if (!(error instanceof ApiError && error.cause?.name === 'AbortError')) ui.toast(error.message || 'No se pudo enviar el comando.', 'error');
    return false;
  } finally {
    if (activeRequest?.requestToken !== requestToken) return;
    activeRequest = null;
    setBusy(false);
    const next = pendingCommand;
    pendingCommand = null;
    if (next && !isStop) window.queueMicrotask(() => handleCommandExecution(next.command, { button: next.button }));
  }
}

async function stopVehicle() {
  keyboardDirections.left.clear();
  keyboardDirections.right.clear();
  for (const joystick of ['left', 'right']) {
    joystickState[joystick].direction = 'neutral';
    resetJoystickVisual(joystick);
  }
  return handleCommandExecution(getStopCommand(commandIndex), { isStop: true });
}

async function applyJoystickDirection(joystick, direction) {
  const state = joystickState[joystick];
  if (state.direction === direction) return;
  state.direction = direction;
  setJoystickReadout(joystick, direction);
  if (direction === 'neutral') return;
  const command = commandForJoystickDirection(commandIndex, joystick, direction);
  if (!command) {
    ui.toast(`No existe un comando de ${joystick === 'left' ? 'movimiento' : 'pala'} para ${joystickLabel(direction)} en el catálogo remoto.`, 'error');
    return;
  }
  await handleCommandExecution(command);
}

function directionFromPointer(element, event) {
  const rect = element.getBoundingClientRect();
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  const distance = Math.hypot(dx, dy);
  const deadZone = rect.width * 0.16;
  const maxDistance = rect.width * 0.3;
  if (distance <= deadZone) return { direction: 'neutral', x: 0, y: 0 };
  const ratio = Math.min(distance, maxDistance) / Math.max(distance, 1);
  return {
    direction: Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'down' : 'up'),
    x: dx * ratio,
    y: dy * ratio,
  };
}

function updateJoystickFromPointer(joystick, event) {
  const element = joystick === 'left' ? ui.leftJoystick : ui.rightJoystick;
  const result = directionFromPointer(element, event);
  if (joystick === 'left') ui.updateLeftJoystickVisual(result.x, result.y);
  else ui.updateRightJoystickVisual(result.x, result.y);
  applyJoystickDirection(joystick, result.direction);
}

function releaseJoystick(joystick, pointerId = null) {
  const state = joystickState[joystick];
  if (pointerId !== null && state.pointerId !== pointerId) return;
  const element = joystick === 'left' ? ui.leftJoystick : ui.rightJoystick;
  const capturedPointer = state.pointerId;
  state.pointerId = null;
  if (capturedPointer !== null && element?.hasPointerCapture?.(capturedPointer)) element.releasePointerCapture(capturedPointer);
  resetJoystickVisual(joystick);
  stopVehicle();
}

function setupPointerJoystick(joystick) {
  const element = joystick === 'left' ? ui.leftJoystick : ui.rightJoystick;
  if (!element) return;
  element.addEventListener('pointerdown', (event) => {
    const state = joystickState[joystick];
    if (state.pointerId !== null) return;
    event.preventDefault();
    state.pointerId = event.pointerId;
    element.setPointerCapture?.(event.pointerId);
    updateJoystickFromPointer(joystick, event);
  });
  element.addEventListener('pointermove', (event) => {
    if (joystickState[joystick].pointerId === event.pointerId) updateJoystickFromPointer(joystick, event);
  });
  element.addEventListener('pointerup', (event) => releaseJoystick(joystick, event.pointerId));
  element.addEventListener('pointercancel', (event) => releaseJoystick(joystick, event.pointerId));
  element.addEventListener('lostpointercapture', (event) => releaseJoystick(joystick, event.pointerId));
}

function setupKeyboard() {
  document.addEventListener('keydown', (event) => {
    const binding = KEY_BINDINGS[event.key.toLowerCase()] || KEY_BINDINGS[event.key];
    if (!binding || event.repeat) return;
    event.preventDefault();
    keyboardDirections[binding.joystick].add(binding.direction);
    applyJoystickDirection(binding.joystick, binding.direction);
  });
  document.addEventListener('keyup', (event) => {
    const binding = KEY_BINDINGS[event.key.toLowerCase()] || KEY_BINDINGS[event.key];
    if (!binding) return;
    event.preventDefault();
    const activeDirections = keyboardDirections[binding.joystick];
    activeDirections.delete(binding.direction);
    if (activeDirections.size === 0) releaseJoystick(binding.joystick);
    else applyJoystickDirection(binding.joystick, [...activeDirections].at(-1));
  });
}

function setupControls() {
  setupPointerJoystick('left');
  setupPointerJoystick('right');
  setupKeyboard();
  ui.stopButton?.addEventListener('click', () => stopVehicle());
  Object.entries(ui.actionButtons).forEach(([action, button]) => {
    button?.addEventListener('click', () => handleCommandExecution(commandForCenterAction(commandIndex, action), { button }));
  });
  window.addEventListener('blur', () => stopVehicle());
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopVehicle(); });
}

async function loadVehicleData() {
  const [vehicleResult, commandsResult, stateResult] = await Promise.allSettled([
    api.request(ENDPOINTS.vehicle(APP_CONFIG.vehicleId)),
    api.request(ENDPOINTS.commands(APP_CONFIG.vehicleId)),
    api.request(ENDPOINTS.state(APP_CONFIG.vehicleId)),
  ]);
  if (vehicleResult.status === 'fulfilled' && isRecord(vehicleResult.value)) {
    ui.setIdentity({ name: vehicleResult.value.nombre, id: vehicleResult.value.id_vehiculo, studentName: APP_CONFIG.studentName });
  }
  if (commandsResult.status === 'fulfilled' && validateCommandList(commandsResult.value)) {
    try {
      commandIndex = indexActiveCommands(commandsResult.value, APP_CONFIG.vehicleId);
      ui.setActionButtonsDisabled(false);
    } catch (error) { ui.toast(error.message, 'error'); }
  } else {
    ui.toast('No se pudo cargar el catálogo de comandos.', 'error');
  }
  if (stateResult.status === 'fulfilled' && isRecord(stateResult.value)) vehicleState = stateResult.value;
}

async function checkApiAndLoadData() {
  ui.setStatus('api', { state: 'checking', label: 'API…', detail: 'Consultando GET /' });
  try {
    const health = await api.request(ENDPOINTS.health());
    if (!validateHealth(health)) throw new Error('La respuesta de health no coincide con el contrato observado.');
    ui.setStatus('api', { state: 'online', label: 'API OK', detail: `API ${safeText(health.version, 'sin versión')} disponible` });
    await loadVehicleData();
  } catch (error) {
    ui.setStatus('api', { state: 'offline', label: 'API OFF', detail: error.message || 'No se pudo consultar el API.' });
    ui.toast(error.message || 'No se pudo consultar el API.', 'error');
  }
}

function handleWsState({ state, detail }) {
  const states = {
    online: { state: 'online', label: 'WSS OK' },
    connecting: { state: 'checking', label: detail === 'Reconectando…' ? 'WSS ↻' : 'WSS…' },
    disconnected: { state: 'offline', label: 'WSS OFF' },
  };
  ui.setStatus('ws', { ...(states[state] ?? states.disconnected), detail });
}

function handleWsMessage(message) {
  if (isRecord(message) && message.id_vehiculo !== undefined && Number(message.id_vehiculo) !== APP_CONFIG.vehicleId) return;
  if (isRecord(message) && typeof message.conectado === 'boolean') vehicleState = { ...vehicleState, conectado: message.conectado };
  ui.renderEvent(message);
}

function startWebSocket() {
  const socket = new VehicleWebSocket({
    url: APP_CONFIG.websocketUrl,
    onStateChange: handleWsState,
    onMessage: handleWsMessage,
    onError: () => ui.toast('WebSocket WSS reportó un error; se intentará reconectar.', 'error'),
  });
  socket.connect();
}

ui.setIdentity({ id: APP_CONFIG.vehicleId, studentName: APP_CONFIG.studentName });
ui.setActionButtonsDisabled(true);
ui.setStatus('ws', { state: 'checking', label: 'WSS…', detail: 'Abriendo sesión WSS real…' });
ui.setStatus('api', { state: 'checking', label: 'API…', detail: 'Comprobando API…' });
ui.setStatus('rds', { state: 'unknown', label: 'RDS ?', detail: 'Sin diagnóstico público en la API' });
setupControls();
startWebSocket();
checkApiAndLoadData();
