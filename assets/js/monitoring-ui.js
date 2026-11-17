import { formatDateParts, safeText } from './utils.js';

export class MonitoringUI {
  constructor() {
    this.vehicleName = document.getElementById('monitor-vehicle-name');
    this.connectionMessage = document.getElementById('monitor-connection-message');
    this.latestCard = document.getElementById('latest-movement-card');
    this.latestCommand = document.getElementById('latest-command');
    this.latestCode = document.getElementById('latest-code');
    this.latestDate = document.getElementById('latest-date');
    this.latestTime = document.getElementById('latest-time');
    this.latestSource = document.getElementById('latest-source');
    this.latestStage = document.getElementById('latest-stage');
    this.historyBody = document.getElementById('history-body');
    this.historyMessage = document.getElementById('history-message');
    this.historySync = document.getElementById('history-sync');
  }

  setVehicleName(name) {
    if (this.vehicleName && name) this.vehicleName.textContent = safeText(name);
  }

  setConnectionState(state, detail = '') {
    const labels = {
      online: 'Sesión WSS en línea',
      connecting: 'Conectando o reconectando WSS',
      disconnected: 'Desconectado',
    };
    if (!this.connectionMessage) return;
    this.connectionMessage.textContent = detail || labels[state] || 'Estado WSS desconocido';
    this.connectionMessage.dataset.state = state;
  }

  setLatestLoading() {
    if (this.latestCard) this.latestCard.dataset.state = 'loading';
    if (this.latestCommand) this.latestCommand.textContent = 'Cargando…';
    if (this.latestCode) this.latestCode.hidden = true;
    if (this.latestDate) this.latestDate.textContent = '—';
    if (this.latestTime) this.latestTime.textContent = '—';
    if (this.latestSource) this.latestSource.textContent = 'Consultando estado reportado por API';
    if (this.latestStage) this.latestStage.textContent = 'Cargando';
  }

  setLatestUnavailable(message, state = 'error') {
    if (this.latestCard) this.latestCard.dataset.state = state;
    if (this.latestCommand) this.latestCommand.textContent = state === 'disconnected' ? 'Desconectado' : state === 'empty' ? 'Sin movimientos' : 'Error';
    if (this.latestCode) this.latestCode.hidden = true;
    if (this.latestDate) this.latestDate.textContent = '—';
    if (this.latestTime) this.latestTime.textContent = '—';
    if (this.latestSource) this.latestSource.textContent = safeText(message, 'No se pudo consultar el último estado.');
    if (this.latestStage) this.latestStage.textContent = state === 'disconnected' ? 'Desconectado' : 'Error';
  }

  renderLatest(movement) {
    if (!movement) return this.setLatestUnavailable('Sin movimiento reportado.', 'empty');
    if (this.latestCard) this.latestCard.dataset.state = 'ready';
    if (this.latestCommand) this.latestCommand.textContent = movement.command || `Comando #${safeText(movement.commandId)}`;
    if (this.latestCode) {
      const hasCode = movement.code !== null && movement.code !== undefined && movement.code !== '';
      this.latestCode.hidden = !hasCode;
      this.latestCode.textContent = hasCode ? `Código ${safeText(movement.code)}` : '';
    }
    const parts = formatDateParts(movement.timestamp);
    if (this.latestDate) this.latestDate.textContent = parts.date;
    if (this.latestTime) this.latestTime.textContent = parts.time;
    if (this.latestSource) this.latestSource.textContent = movement.source;
    if (this.latestStage) this.latestStage.textContent = movement.stage;
  }

  setHistoryLoading() {
    if (this.historyMessage) {
      this.historyMessage.hidden = false;
      this.historyMessage.dataset.state = 'loading';
      this.historyMessage.textContent = 'Cargando movimientos…';
    }
    if (this.historyBody) this.historyBody.replaceChildren();
  }

  setHistoryError(message) {
    if (!this.historyMessage) return;
    this.historyMessage.hidden = false;
    this.historyMessage.dataset.state = 'error';
    this.historyMessage.textContent = `Error: ${safeText(message, 'No se pudo consultar el historial.')}`;
  }

  renderHistory(records) {
    if (!this.historyBody) return;
    const rows = records.map((record, index) => {
      const row = document.createElement('tr');
      const number = document.createElement('th');
      number.scope = 'row';
      number.textContent = String(index + 1);
      const command = document.createElement('td');
      command.textContent = safeText(record.comando);
      const date = document.createElement('td');
      const dateParts = formatDateParts(record.fecha_hora);
      date.textContent = dateParts.date;
      const time = document.createElement('td');
      time.textContent = dateParts.time;
      row.append(number, command, date, time);
      return row;
    });
    this.historyBody.replaceChildren(...rows);
    if (this.historyMessage) {
      this.historyMessage.hidden = records.length > 0;
      this.historyMessage.dataset.state = records.length > 0 ? 'ready' : 'empty';
      this.historyMessage.textContent = records.length > 0 ? '' : 'Sin registros.';
    }
  }

  setHistorySyncLabel(message) {
    if (this.historySync) this.historySync.textContent = safeText(message, 'Historial consultado por API');
  }
}
