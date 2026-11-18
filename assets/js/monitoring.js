import { APP_CONFIG, ENDPOINTS } from './config.js';
import { indexActiveCommands } from './domain.js';
import { validateHistoryList, latestHistoryRows } from './history.js';
import { validateCommandList } from './rest-client.js';
import { validateVehicleEvent, validateVehicleState, normalizeRestState, normalizeWssEvent, movementMarker } from './monitoring-state.js';
import { MonitoringUI } from './monitoring-ui.js';
import { formatCommandLabel } from './utils.js';

export class MonitoringController {
  constructor({ api, session, vehicleId = APP_CONFIG.vehicleId } = {}) {
    this.api = api;
    this.session = session;
    this.vehicleId = Number(vehicleId);
    this.ui = new MonitoringUI();
    this.latestMovement = null;
    this.historyRows = [];
    this.commandsById = new Map();
    this.historyRequest = null;
    this.historyTimer = null;
    this.initialLoadToken = 0;
    this.wssEventSequence = 0;
    this.unsubscribe = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;
    this.ui.setLatestLoading();
    this.ui.setHistoryLoading();
    this.unsubscribe = this.session.subscribe({
      onMessage: (message) => this.handleWssMessage(message),
      onStateChange: (state) => this.handleWssState(state),
    });
    void this.loadInitialData();
  }

  setCommandIndex(commandIndex) {
    this.commandsById = commandIndex?.byId instanceof Map ? commandIndex.byId : new Map();

    if (this.latestMovement) {
      this.latestMovement = this.enrichMovementWithCatalog(this.latestMovement);
      this.ui.renderLatest(this.latestMovement);
    }
    if (this.historyRows.length > 0) {
      this.historyRows = this.historyRows.map((row) => this.enrichMovementWithCatalog(row));
      this.ui.renderHistory(this.historyRows);
    }
  }

  enrichMovementWithCatalog(item) {
    if (!item || typeof item !== 'object') return item;

    const movement = { ...item };
    const commandId = movement.commandId
      ?? movement.id_comando
      ?? movement.code
      ?? movement.codigo;
    const currentName = formatCommandLabel(movement.command ?? movement.comando, '');
    if ('command' in movement) movement.command = currentName || null;
    if ('comando' in movement) movement.comando = currentName || null;

    const catalogCommand = this.commandsById.get(Number(commandId));
    if (!catalogCommand || typeof catalogCommand.nombre !== 'string' || !catalogCommand.nombre.trim()) return movement;

    const isGenericName = !currentName || /^(comando|movimiento)\s*#?\s*\d+$/i.test(currentName);
    if (!isGenericName) return movement;

    const catalogName = formatCommandLabel(catalogCommand.nombre, '');
    movement.command = catalogName;
    movement.comando = catalogName;
    return movement;
  }

  async loadInitialData() {
    const token = ++this.initialLoadToken;
    const wssSequenceAtStart = this.wssEventSequence;
    const [stateResult, historyResult, commandsResult] = await Promise.allSettled([
      this.api.request(ENDPOINTS.state(this.vehicleId)),
      this.requestHistory(),
      this.api.request(ENDPOINTS.commands(this.vehicleId)),
    ]);

    if (token !== this.initialLoadToken) return;

    if (commandsResult.status === 'fulfilled' && validateCommandList(commandsResult.value)) {
      try {
        this.setCommandIndex(indexActiveCommands(commandsResult.value, this.vehicleId));
      } catch {
        this.commandsById = new Map();
      }
    }

    if (stateResult.status === 'fulfilled') {
      try {
        const state = validateVehicleState(stateResult.value, this.vehicleId);
        const movement = this.enrichMovementWithCatalog(normalizeRestState(state));
        const wssArrivedWhileLoading = this.wssEventSequence > wssSequenceAtStart;
        if (!wssArrivedWhileLoading && (!this.latestMovement || movementMarker(movement) >= movementMarker(this.latestMovement))) {
          this.latestMovement = movement;
          this.ui.renderLatest(movement);
        }
        if (state.vehiculo) this.ui.setVehicleName(state.vehiculo);
      } catch (error) {
        this.ui.setLatestUnavailable(error.message, 'error');
      }
    } else if (!this.latestMovement) {
      this.ui.setLatestUnavailable(stateResult.reason?.message, 'error');
    }

    if (historyResult.status === 'fulfilled') {
      this.applyHistory(historyResult.value);
    } else {
      this.ui.setHistoryError(historyResult.reason?.message);
    }
  }

  applyHistory(payload) {
    try {
      const validated = validateHistoryList(payload, this.vehicleId);
      this.historyRows = latestHistoryRows(validated).map((row) => this.enrichMovementWithCatalog(row));
      this.ui.renderHistory(this.historyRows);
      this.ui.setHistorySyncLabel(`API · ${this.historyRows.length} de máximo 10 registros`);
    } catch (error) {
      this.ui.setHistoryError(error.message);
    }
  }

  handleWssMessage(payload) {
    const validEvent = validateVehicleEvent(payload, this.vehicleId);
    if (!validEvent) return;
    const movement = this.enrichMovementWithCatalog(normalizeWssEvent(validEvent));
    this.wssEventSequence += 1;
    this.latestMovement = movement;
    this.ui.renderLatest(movement);
    if (!movement.isDemo) this.scheduleHistorySync();
  }

  handleWssState({ state, detail } = {}) {
    this.ui.setConnectionState(state, detail);
    if (state === 'online') this.scheduleHistorySync(200);
  }

  scheduleHistorySync(delay = APP_CONFIG.historySyncDelayMs) {
    if (this.historyTimer) window.clearTimeout(this.historyTimer);
    this.historyTimer = window.setTimeout(() => {
      this.historyTimer = null;
      void this.syncHistory();
    }, delay);
  }

  async syncHistory() {
    return this.requestHistory()
      .then((payload) => this.applyHistory(payload))
      .catch((error) => this.ui.setHistoryError(error.message));
  }

  requestHistory() {
    if (this.historyRequest) return this.historyRequest;
    this.historyRequest = this.api.getHistory(this.vehicleId).finally(() => {
      this.historyRequest = null;
    });
    return this.historyRequest;
  }

  destroy() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.historyTimer) window.clearTimeout(this.historyTimer);
    this.historyTimer = null;
  }
}
