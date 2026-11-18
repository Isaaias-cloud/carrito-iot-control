import { APP_CONFIG, ENDPOINTS } from './config.js';
import { CENTER_ACTION_ALIASES, indexActiveCommands } from './domain.js';
import { validateHistoryList, latestHistoryRows } from './history.js';
import { validateCommandList } from './rest-client.js';
import { validateVehicleEvent, validateVehicleState, normalizeRestState, normalizeWssEvent, movementMarker } from './monitoring-state.js';
import { MonitoringUI } from './monitoring-ui.js';
import { formatCommandLabel, normalizeName } from './utils.js';

function movementTimestamp(movement) {
  const value = movement?.timestamp ?? movement?.fecha_hora;
  if (!value) return Number.NaN;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function visualCommandName(movement) {
  return normalizeName(formatCommandLabel(movement?.command ?? movement?.comando, ''));
}

function comparableCommandName(name) {
  return normalizeName(name).replace(/_/g, ' ');
}

function centerActionNames() {
  return Object.values(CENTER_ACTION_ALIASES)
    .flat()
    .map((alias) => comparableCommandName(alias));
}

const CENTER_ACTION_NAMES = new Set(centerActionNames());

function isStopMovement(movement) {
  const name = visualCommandName(movement);
  return name === 'DETENER' || name === 'STOP';
}

function isCenterActionMovement(movement) {
  return CENTER_ACTION_NAMES.has(comparableCommandName(visualCommandName(movement)));
}

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
    this.suppressAutoStopUntil = 0;
    this.autoStopTimestamps = [];
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

  registerAutoStop() {
    const timestamp = Date.now();
    this.suppressAutoStopUntil = timestamp + 3000;
    this.autoStopTimestamps.push(timestamp);
    if (this.autoStopTimestamps.length > 20) this.autoStopTimestamps.splice(0, this.autoStopTimestamps.length - 20);
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

    if (historyResult.status === 'fulfilled') {
      this.applyHistory(historyResult.value);
    } else {
      this.ui.setHistoryError(historyResult.reason?.message);
    }

    if (stateResult.status === 'fulfilled') {
      try {
        const state = validateVehicleState(stateResult.value, this.vehicleId);
        const movement = this.enrichMovementWithCatalog(normalizeRestState(state));
        const wssArrivedWhileLoading = this.wssEventSequence > wssSequenceAtStart;
        const relatedAction = this.findRelatedCenterAction(this.historyRows, movement);
        const stateToRender = isStopMovement(movement) && relatedAction ? relatedAction : movement;
        const suppressCurrentAutoStop = isStopMovement(stateToRender) && Date.now() <= this.suppressAutoStopUntil;
        if (!wssArrivedWhileLoading && !suppressCurrentAutoStop && (!this.latestMovement || movementMarker(stateToRender) >= movementMarker(this.latestMovement))) {
          this.latestMovement = stateToRender;
          this.ui.renderLatest(stateToRender);
        }
        if (state.vehiculo) this.ui.setVehicleName(state.vehiculo);
      } catch (error) {
        this.ui.setLatestUnavailable(error.message, 'error');
      }
    } else if (!this.latestMovement) {
      this.ui.setLatestUnavailable(stateResult.reason?.message, 'error');
    }
  }

  applyHistory(payload) {
    try {
      const validated = validateHistoryList(payload, this.vehicleId);
      const enrichedRows = validated.map((row) => this.enrichMovementWithCatalog(row));
      const chronologicalRows = [...enrichedRows].sort((left, right) => movementTimestamp(left) - movementTimestamp(right));
      const filteredRows = enrichedRows.filter((row) => !this.shouldFilterAutoStop(row, chronologicalRows));
      this.historyRows = latestHistoryRows(filteredRows);
      this.ui.renderHistory(this.historyRows);
      this.ui.setHistorySyncLabel(`API · ${this.historyRows.length} de máximo 10 registros`);
    } catch (error) {
      this.ui.setHistoryError(error.message);
    }
  }

  shouldFilterAutoStop(movement, chronologicalRows) {
    if (!isStopMovement(movement)) return false;

    const timestamp = movementTimestamp(movement);
    const nearRegisteredAutoStop = Number.isFinite(timestamp)
      && this.autoStopTimestamps.some((autoStopTimestamp) => Math.abs(timestamp - autoStopTimestamp) <= 3000);
    if (nearRegisteredAutoStop) return true;

    const index = chronologicalRows.indexOf(movement);
    const previousMovement = index > 0 ? chronologicalRows[index - 1] : null;
    const previousTimestamp = movementTimestamp(previousMovement);
    const difference = timestamp - previousTimestamp;
    return Boolean(
      previousMovement
      && isCenterActionMovement(previousMovement)
      && Number.isFinite(difference)
      && difference >= 0
      && difference <= 2500,
    );
  }

  findRelatedCenterAction(rows, movement) {
    if (!isStopMovement(movement) || !Array.isArray(rows)) return null;
    const timestamp = movementTimestamp(movement);
    if (!Number.isFinite(timestamp)) return null;
    return rows
      .filter((row) => isCenterActionMovement(row))
      .map((row) => ({ row, difference: timestamp - movementTimestamp(row) }))
      .filter(({ difference }) => Number.isFinite(difference) && difference >= 0 && difference <= 2500)
      .sort((left, right) => right.difference - left.difference)[0]?.row ?? null;
  }

  handleWssMessage(payload) {
    const validEvent = validateVehicleEvent(payload, this.vehicleId);
    if (!validEvent) return;
    const movement = this.enrichMovementWithCatalog(normalizeWssEvent(validEvent));
    if (isStopMovement(movement) && Date.now() <= this.suppressAutoStopUntil) return;
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
