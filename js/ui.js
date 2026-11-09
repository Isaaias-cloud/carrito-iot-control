import { formatDate, safeText, createElement } from './utils.js';

const STATUS_CLASSES = new Set(['online', 'offline', 'checking', 'unknown']);

export class ControlUI {
  constructor() {
    this.vehicleName = document.getElementById('vehicle-name');
    this.vehicleId = document.getElementById('vehicle-id');
    this.studentName = document.getElementById('student-name');
    this.leftJoystick = document.getElementById('joystick-left');
    this.rightJoystick = document.getElementById('joystick-right');
    this.leftKnob = document.getElementById('joystick-knob-left');
    this.rightKnob = document.getElementById('joystick-knob-right');
    this.leftReadout = document.getElementById('left-direction-readout');
    this.rightReadout = document.getElementById('right-direction-readout');
    this.stopButton = document.getElementById('stop-button');
    this.actionButtons = {
      sound: document.getElementById('btn-sound'),
      speed: document.getElementById('btn-speed'),
      light: document.getElementById('btn-light'),
      off: document.getElementById('btn-off'),
    };
    this.eventContent = document.getElementById('event-content');
    this.toastRegion = document.getElementById('toast-region');
    this.statuses = {
      ws: document.getElementById('status-ws-pill'),
      api: document.getElementById('status-api-pill'),
      rds: document.getElementById('status-rds-pill'),
    };
    this.actionsDisabled = false;
  }

  setIdentity({ name, id, studentName }) {
    if (name && this.vehicleName) this.vehicleName.textContent = name;
    if (id && this.vehicleId) this.vehicleId.textContent = String(id);
    if (studentName && this.studentName) this.studentName.textContent = studentName;
  }

  updateLeftJoystickVisual(x = 0, y = 0) {
    this.updateJoystickVisual(this.leftKnob, x, y);
  }

  updateRightJoystickVisual(x = 0, y = 0) {
    this.updateJoystickVisual(this.rightKnob, x, y);
  }

  updateJoystickVisual(knob, x, y) {
    if (!knob) return;
    knob.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  setLeftDirectionReadout(direction = 'Neutral') {
    if (this.leftReadout) this.leftReadout.textContent = direction;
  }

  setRightDirectionReadout(direction = 'Neutral') {
    if (this.rightReadout) this.rightReadout.textContent = direction;
  }

  setStatus(name, { state, label, detail = '' }) {
    const pill = this.statuses[name];
    if (!pill) return;
    const normalizedState = STATUS_CLASSES.has(state) ? state : 'unknown';
    pill.className = `status-pill status-pill--${normalizedState}`;
    pill.textContent = label;
    pill.title = detail || label;
    pill.setAttribute('aria-label', `${name.toUpperCase()}: ${detail || label}`);
  }

  setActionButtonsDisabled(disabled) {
    this.actionsDisabled = Boolean(disabled);
    Object.values(this.actionButtons).forEach((button) => {
      if (button) button.disabled = this.actionsDisabled;
    });
  }

  markButton(button, state) {
    if (!button) return;
    button.dataset.state = state;
    if (state === 'sending') button.disabled = true;
    window.setTimeout(() => {
      if (!button.isConnected) return;
      delete button.dataset.state;
      button.disabled = this.actionsDisabled;
    }, 900);
  }

  renderEvent(event) {
    if (!this.eventContent) return;
    if (!event || typeof event !== 'object') {
      this.eventContent.textContent = safeText(event, 'Mensaje WSS no estructurado');
      return;
    }
    const parts = [
      safeText(event.event, 'evento'),
      event.id_comando === undefined ? null : `cmd #${safeText(event.id_comando)}`,
      event.origen ? safeText(event.origen) : null,
      event.timestamp ? formatDate(event.timestamp) : null,
    ].filter(Boolean);
    this.eventContent.textContent = parts.join(' · ');
  }

  toast(message, type = 'info') {
    if (!this.toastRegion) return;
    const toast = createElement('div', `app-toast app-toast--${type}`, message);
    this.toastRegion.append(toast);
    window.setTimeout(() => toast.remove(), 5200);
  }
}
