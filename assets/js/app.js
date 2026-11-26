import { APP_CONFIG, ENDPOINTS } from './config.js';
import { ApiError, RestClient, validateCommandList } from './rest-client.js';
import { ControlUI } from './ui.js';
import { commandForCenterAction, commandForJoystickDirection, commandPayload, getStopCommand, indexActiveCommands, validateDemoPayload } from './domain.js';
import { formatCommandLabel, isRecord, safeText } from './utils.js';
import { checkApiHealth, checkRdsHealth, startConnectivityMonitor } from './connectivity.js';
import { NavigationController } from './navigation.js';
import { MonitoringController } from './monitoring.js';
import { VehicleSession } from './vehicle-session.js';
import { websocketUrl } from './config.js';
import { AuthSession } from './auth-session.js';
import { AuthUI } from './auth-ui.js';
import { AdminController } from './admin.js';
import { OwnerExperience } from './owner-experience.js';
import { GuestExperience } from './guest-experience.js';

const authSession = new AuthSession();
const api = new RestClient({ baseUrl: APP_CONFIG.apiBaseUrl, authSession });
let selectedVehicleId = null;
const vehicleSession = new VehicleSession({
  url: () => selectedVehicleId ? websocketUrl(selectedVehicleId, authSession.getAccessToken()) : null,
  onAuthFailure: () => { if (authSession.isGuest()) authSession.clear(); },
});
const ui = new ControlUI();
const ACTION_PULSE_MS = 500;
let commandIndex = { byName: new Map(), byId: new Map(), all: [] };
let vehicleState = { conectado: true };
let activeRequest = null;
let pendingCommand = null;
let lastCompletedCommand = { id: null, at: 0 };
let demoExecuting = false;
let actionPulseTimer = null;

const joystickState = {
  left: { pointerId: null, direction: 'neutral' },
  right: { pointerId: null, direction: 'neutral' },
};

function getConnectedFlag() {
  return typeof vehicleState.conectado === 'boolean' ? vehicleState.conectado : true;
}

function setBusy(isBusy) {
  ui.setActionButtonsDisabled(isBusy);
}

function cancelActionPulse() {
  if (actionPulseTimer === null) return;
  window.clearTimeout(actionPulseTimer);
  actionPulseTimer = null;
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
    if (!selectedVehicleId) {
      ui.toast('Selecciona una unidad antes de enviar comandos.', 'error');
      return false;
    }
    const response = await api.request(ENDPOINTS.sendCommand(selectedVehicleId), {
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
    if (!isStop) ui.toast(`${formatCommandLabel(command.nombre, 'Comando')} aceptado por la API.`, 'success');
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
  cancelActionPulse();
  ui.clearDemoMovement();
  for (const joystick of ['left', 'right']) {
    joystickState[joystick].direction = 'neutral';
    resetJoystickVisual(joystick);
  }
  return handleCommandExecution(getStopCommand(commandIndex), { isStop: true });
}

async function handleCenterActionClick(action) {
  cancelActionPulse();
  const previousStates = ui.getActionStatesSnapshot();
  ui.toggleActionActive(action);

  const command = commandForCenterAction(commandIndex, action);
  const accepted = await handleCommandExecution(command, { button: ui.actionButtons[action] });
  if (!accepted) {
    ui.restoreActionStates(previousStates);
    return false;
  }

  actionPulseTimer = window.setTimeout(() => {
    actionPulseTimer = null;
    monitoring.registerAutoStop();
    void handleCommandExecution(getStopCommand(commandIndex), { isStop: true });
  }, ACTION_PULSE_MS);
  return true;
}

async function runSelectedDemo() {
  if (demoExecuting) return;
  const demoId = ui.demoSelect?.value;
  if (!demoId) {
    ui.toast('Selecciona una DEMO antes de ejecutarla.', 'error');
    return;
  }

  let payload;
  try {
    payload = validateDemoPayload(demoId, selectedVehicleId);
  } catch (error) {
    ui.toast(error.message || 'La DEMO seleccionada no es válida.', 'error');
    return;
  }

  demoExecuting = true;
  const selectedOption = ui.demoSelect?.selectedOptions?.[0];
  const demoLabel = safeText(selectedOption?.textContent, `DEMO #${payload.id_demo}`);
  ui.setDemoExecuting(true, `Ejecutando ${demoLabel}`);

  try {
    const response = await api.executeDemo(payload);
    const details = [];
    if (isRecord(response) && response.total_movimientos !== undefined) {
      details.push(`total de movimientos: ${safeText(response.total_movimientos)}`);
    }
    if (isRecord(response) && response.movimientos_ejecutados !== undefined) {
      details.push(`ejecutados: ${safeText(response.movimientos_ejecutados)}`);
    }
    ui.toast(`${demoLabel} aceptada por la API${details.length ? ` · ${details.join(' · ')}` : '.'}`, 'success');
  } catch (error) {
    ui.toast(error?.message || 'No se pudo ejecutar la DEMO.', 'error');
  } finally {
    demoExecuting = false;
    ui.setDemoExecuting(false, 'La DEMO terminó o no pudo ejecutarse.');
  }
}

async function applyJoystickDirection(joystick, direction) {
  cancelActionPulse();
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

function setupControls() {
  setupPointerJoystick('left');
  setupPointerJoystick('right');
  ui.stopButton?.addEventListener('click', () => stopVehicle());
  ui.demoSelect?.addEventListener('change', () => ui.setDemoSelectionReady(Boolean(ui.demoSelect.value)));
  ui.runDemoButton?.addEventListener('click', () => { void runSelectedDemo(); });
  Object.entries(ui.actionButtons).forEach(([action, button]) => {
    button?.addEventListener('click', () => { void handleCenterActionClick(action); });
  });
  window.addEventListener('blur', () => stopVehicle());
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopVehicle(); });
}

async function loadVehicleData(vehicleId = selectedVehicleId) {
  if (!vehicleId) return;
  const [vehicleResult, commandsResult, stateResult, demosResult] = await Promise.allSettled([
    api.request(ENDPOINTS.vehicle(vehicleId)),
    api.request(ENDPOINTS.commands(vehicleId)),
    api.request(ENDPOINTS.state(vehicleId)),
    api.getDemos(vehicleId),
  ]);
  if (vehicleResult.status === 'fulfilled' && isRecord(vehicleResult.value)) {
    ui.setIdentity({ name: vehicleResult.value.nombre, id: vehicleResult.value.id_vehiculo, studentName: APP_CONFIG.studentName });
  }
  if (commandsResult.status === 'fulfilled' && validateCommandList(commandsResult.value)) {
    try {
      commandIndex = indexActiveCommands(commandsResult.value, vehicleId);
      monitoring.setCommandIndex(commandIndex);
      ui.setActionButtonsDisabled(false);
    } catch (error) { ui.toast(error.message, 'error'); }
  } else {
    ui.toast('No se pudo cargar el catálogo de comandos.', 'error');
  }
  if (stateResult.status === 'fulfilled' && isRecord(stateResult.value)) vehicleState = stateResult.value;
  if (demosResult.status === 'fulfilled' && Array.isArray(demosResult.value)) {
    if (ui.renderDemoOptions(demosResult.value) === 0) ui.toast('No hay DEMOs disponibles para este vehículo.', 'info');
  } else {
    ui.renderDemoOptions([]);
    ui.toast('No se pudo cargar el catálogo de DEMOs.', 'error');
  }
}

async function checkApiAndLoadData() {
  if (await checkApiHealth(api, ui)) await loadVehicleData();
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
  if (isRecord(message) && message.id_vehiculo !== undefined && Number(message.id_vehiculo) !== Number(selectedVehicleId)) return;
  if (isRecord(message) && typeof message.conectado === 'boolean') vehicleState = { ...vehicleState, conectado: message.conectado };
  if (
    isRecord(message)
    && message.event === 'nuevo_movimiento'
    && String(message.origen ?? '').toUpperCase() === 'DEMO'
  ) {
    const catalogCommandName = commandIndex.byId.get(Number(message.id_comando))?.nombre;
    ui.showDemoMovement({
      demoId: message.id_demo,
      step: message.paso,
      total: message.total,
      commandName: formatCommandLabel(message.comando, catalogCommandName || `Movimiento #${message.id_comando}`),
      durationMs: message.duracion_ms,
      pauseMs: message.pausa_ms,
    });
  }
  ui.renderEvent(message);
}

function startWebSocket() {
  vehicleSession.subscribe({
    onStateChange: handleWsState,
    onMessage: handleWsMessage,
    onError: () => ui.toast('WebSocket WSS reportó un error; se intentará reconectar.', 'error'),
  });
  if (selectedVehicleId) vehicleSession.connect();
}

async function selectVehicle(vehicleId) {
  const nextVehicleId = Number(vehicleId);
  if (!Number.isInteger(nextVehicleId) || nextVehicleId <= 0) {
    selectedVehicleId = null;
    vehicleSession.disconnect();
    ui.setActionButtonsDisabled(true);
    monitoring.setVehicle(0);
    return;
  }
  if (selectedVehicleId === nextVehicleId) return;
  cancelActionPulse();
  if (selectedVehicleId) await stopVehicle();
  vehicleSession.disconnect();
  selectedVehicleId = nextVehicleId;
  ui.setActionButtonsDisabled(true);
  monitoring.setVehicle(selectedVehicleId);
  ui.setIdentity({ id: selectedVehicleId, studentName: APP_CONFIG.studentName });
  await loadVehicleData(selectedVehicleId);
  vehicleSession.connect();
}

const navigation = new NavigationController({
  links: document.querySelectorAll('[data-view-link]'),
  views: document.querySelectorAll('[data-view]'),
  skipLink: document.querySelector('.skip-link'),
});
const monitoring = new MonitoringController({ api, session: vehicleSession, vehicleId: 0 });
const admin = new AdminController({ api });
let guestExperience;
const ownerExperience = new OwnerExperience({
  api,
  onVehicleSelected: selectVehicle,
  onCommandsChanged: (commands) => {
    if (!selectedVehicleId || !validateCommandList(commands)) return;
    commandIndex = indexActiveCommands(commands, selectedVehicleId);
    monitoring.setCommandIndex(commandIndex);
  },
});
const authUi = new AuthUI({
  session: authSession,
  api,
  onAuthenticated: startAuthenticated,
  onLogout: () => window.location.reload(),
  onGuest: () => { void guestExperience?.open(); },
});

guestExperience = new GuestExperience({
  api,
  session: authSession,
  onAuthenticated: (profile) => { authUi.close(); startAuthenticated(profile); },
});

let applicationStarted = false;

function startAuthenticated(profile) {
  if (applicationStarted) return;
  applicationStarted = true;
  const roles = Array.isArray(profile?.roles) ? profile.roles : [];
  if (roles.includes('INVITADO')) selectedVehicleId = authSession.getGuestVehicleId();
  const allowedViews = roles.includes('ADMIN') ? ['control', 'monitor', 'admin'] : ['control', 'monitor'];
  navigation.setAllowedViews(allowedViews);
  authUi.renderProfile(profile);
  admin.setVisible(roles.includes('ADMIN'));
  admin.init();
  ui.setIdentity({ id: selectedVehicleId || '—', studentName: APP_CONFIG.studentName });
  ui.setActionButtonsDisabled(true);
  ui.setStatus('ws', { state: 'checking', label: 'WSS…', detail: 'Abriendo sesión WSS real…' });
  ui.setStatus('api', { state: 'checking', label: 'API…', detail: 'Comprobando API…' });
  navigation.init();
  monitoring.init({ load: false });
  setupControls();
  startWebSocket();
  startConnectivityMonitor({ api, ui });
  void checkRdsHealth(api, ui);
  void checkApiHealth(api, ui, { notify: false });
  if (roles.includes('USUARIO') || roles.includes('ADMIN')) ownerExperience.init(profile);
  if (roles.includes('INVITADO') && selectedVehicleId) {
    guestExperience.activate(authSession.tokens);
    void loadVehicleData(selectedVehicleId);
  }
  if (roles.includes('ADMIN')) void admin.load();
}

authSession.addEventListener('expired', () => {
  vehicleSession.disconnect();
  ui.setActionButtonsDisabled(true);
  window.location.reload();
});

authUi.init();
guestExperience.init();
void authUi.restore().then((restored) => {
  if (restored) startAuthenticated(authSession.profile);
  else authUi.open();
});
