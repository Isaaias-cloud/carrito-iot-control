import { APP_CONFIG, ENDPOINTS } from './config.js';
import { validateHistoryList, latestHistoryRows } from './history.js';
import { validateVehicleEvent, validateVehicleState, normalizeRestState, normalizeWssEvent, movementMarker } from './monitoring-state.js';
import { MonitoringUI } from './monitoring-ui.js';

export class MonitoringController {
  constructor({ api, session, vehicleId = APP_CONFIG.vehicleId } = {}) {
    this.api = api;
    this.session = session;
    this.vehicleId = Number(vehicleId);
    this.ui = new MonitoringUI();
    this.latestMovement = null;
    this.historyRows = [];
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

  async loadInitialData() {
    const token = ++this.initialLoadToken;
    const wssSequenceAtStart = this.wssEventSequence;
    const [stateResult, historyResult] = await Promise.allSettled([
      this.api.request(ENDPOINTS.state(this.vehicleId)),
      this.requestHistory(),
    ]);

    if (token !== this.initialLoadToken) return;

    if (stateResult.status === 'fulfilled') {
      try {
        const state = validateVehicleState(stateResult.value, this.vehicleId);
        const movement = normalizeRestState(state);
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
      this.historyRows = latestHistoryRows(validated);
      this.ui.renderHistory(this.historyRows);
      this.ui.setHistorySyncLabel(`API · ${this.historyRows.length} de máximo 10 registros`);
    } catch (error) {
      this.ui.setHistoryError(error.message);
    }
  }

  handleWssMessage(payload) {
    const validEvent = validateVehicleEvent(payload, this.vehicleId);
    if (!validEvent) return;
    const movement = normalizeWssEvent(validEvent);
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
