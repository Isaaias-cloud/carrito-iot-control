import { formatCommandLabel, formatDate, safeText, createElement } from './utils.js';

const STATUS_CLASSES = new Set(['online', 'offline', 'checking', 'unknown']);
const MAX_VISIBLE_TOASTS = 3;

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
    this.demoSelect = document.getElementById('demo-select');
    this.runDemoButton = document.getElementById('btn-run-demo');
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
    this.buttonTimers = new WeakMap();
    this.demoMovementToast = null;
    this.demoMovementTimer = null;
    this.actionsDisabled = false;
    this.demoAvailable = false;
    this.demoExecuting = false;

    Object.values(this.actionButtons).forEach((button) => {
      button?.setAttribute('aria-pressed', 'false');
    });
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

  updateRdsStatus(status, detail = '') {
    const normalizedState = STATUS_CLASSES.has(status) ? status : 'unknown';
    const labels = {
      online: 'RDS OK',
      offline: 'RDS OFF',
      checking: 'RDS…',
      unknown: 'RDS ?',
    };
    this.setStatus('rds', {
      state: normalizedState,
      label: labels[normalizedState],
      detail: safeText(detail, labels[normalizedState]),
    });
  }

  renderDemoOptions(demos) {
    if (!this.demoSelect) return 0;

    const options = [];
    for (const demo of Array.isArray(demos) ? demos : []) {
      if (!demo || typeof demo !== 'object') continue;
      const demoId = Number(demo.id_demo ?? demo.id);
      if (!Number.isInteger(demoId) || demoId <= 0) continue;

      const name = safeText(demo.nombre ?? demo.name, `DEMO ${demoId}`);
      const description = safeText(demo.descripcion ?? demo.description, '');
      const option = document.createElement('option');
      option.value = String(demoId);
      option.textContent = description ? `#${demoId} · ${name} — ${description}` : `#${demoId} · ${name}`;
      option.title = description || name;
      options.push(option);
    }

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = options.length > 0;
    placeholder.selected = true;
    placeholder.textContent = options.length > 0 ? 'Selecciona una DEMO' : 'No hay DEMOs disponibles';
    this.demoSelect.replaceChildren(placeholder, ...options);
    this.demoSelect.value = '';
    this.demoAvailable = options.length > 0;
    this.demoSelect.disabled = !this.demoAvailable;
    if (this.runDemoButton) this.runDemoButton.disabled = true;
    return options.length;
  }

  setDemoSelectionReady(isReady) {
    if (!this.runDemoButton || this.demoExecuting) return;
    this.runDemoButton.disabled = !this.demoAvailable || !isReady;
  }

  setDemoExecuting(isExecuting, message = '') {
    this.demoExecuting = Boolean(isExecuting);
    if (this.demoSelect) this.demoSelect.disabled = this.demoExecuting || !this.demoAvailable;
    if (!this.runDemoButton) return;

    this.runDemoButton.disabled = this.demoExecuting || !this.demoAvailable || !this.demoSelect?.value;
    this.runDemoButton.title = message || 'Ejecutar DEMO seleccionada';
    this.runDemoButton.setAttribute('aria-busy', String(this.demoExecuting));
    this.runDemoButton.setAttribute('aria-label', this.demoExecuting ? 'Ejecutando DEMO' : 'Ejecutar DEMO seleccionada');
    const label = this.runDemoButton.querySelector('.btn-label-inline');
    if (label) label.textContent = this.demoExecuting ? 'Ejecutando…' : 'Ejecutar';
  }

  setActionButtonsDisabled(disabled) {
    this.actionsDisabled = Boolean(disabled);
    Object.values(this.actionButtons).forEach((button) => {
      if (button) button.disabled = this.actionsDisabled;
    });
  }

  setActionActive(action, isActive) {
    const activeButton = this.actionButtons[action];
    if (!activeButton) return false;

    const active = Boolean(isActive);
    const setButtonState = (button, value) => {
      button.classList.toggle('is-active', value);
      button.setAttribute('aria-pressed', String(value));
    };

    if (active && action === 'off') {
      ['sound', 'speed', 'light'].forEach((otherAction) => {
        const button = this.actionButtons[otherAction];
        if (button) setButtonState(button, false);
      });
    }
    if (active && action !== 'off') {
      const offButton = this.actionButtons.off;
      if (offButton) setButtonState(offButton, false);
    }

    setButtonState(activeButton, active);
    return active;
  }

  toggleActionActive(action) {
    const button = this.actionButtons[action];
    if (!button) return false;
    return this.setActionActive(action, !button.classList.contains('is-active'));
  }

  getActionStatesSnapshot() {
    return Object.fromEntries(Object.entries(this.actionButtons).map(([action, button]) => [
      action,
      Boolean(button?.classList.contains('is-active')),
    ]));
  }

  restoreActionStates(snapshot = {}) {
    Object.entries(this.actionButtons).forEach(([action, button]) => {
      if (!button) return;
      const active = Boolean(snapshot[action]);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  markButton(button, state) {
    if (!button) return;
    const previousTimer = this.buttonTimers.get(button);
    if (previousTimer) window.clearTimeout(previousTimer);
    button.dataset.state = state;
    if (state === 'sending') button.disabled = true;

    const timer = window.setTimeout(() => {
      if (this.buttonTimers.get(button) !== timer) return;
      this.buttonTimers.delete(button);
      if (!button.isConnected) return;
      delete button.dataset.state;
      button.disabled = this.actionsDisabled;
    }, 900);
    this.buttonTimers.set(button, timer);
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

  showDemoMovement({ demoId, step, total, commandName, durationMs = 0, pauseMs = 0 } = {}) {
    if (!this.toastRegion) return;

    if (!this.demoMovementToast) {
      this.demoMovementToast = document.createElement('div');
      this.demoMovementToast.className = 'demo-step-toast';
      this.demoMovementToast.setAttribute('role', 'status');
      this.demoMovementToast.setAttribute('aria-live', 'polite');
      this.toastRegion.prepend(this.demoMovementToast);
    }

    const numericStep = Number(step);
    const numericTotal = Number(total);
    const safeStep = Number.isFinite(numericStep) ? numericStep : 0;
    const safeTotal = Number.isFinite(numericTotal) && numericTotal > 0 ? numericTotal : 0;
    const progress = safeTotal > 0 ? Math.min(1, Math.max(0, safeStep / safeTotal)) : 0;

    const label = document.createElement('span');
    label.className = 'demo-step-toast__label';
    label.textContent = `DEMO #${safeText(demoId, '?')} · Paso ${safeStep}/${safeTotal || '?'}`;

    const command = document.createElement('strong');
    command.className = 'demo-step-toast__command';
    command.textContent = formatCommandLabel(commandName, 'Movimiento');

    const progressTrack = document.createElement('div');
    progressTrack.className = 'demo-step-toast__progress';
    progressTrack.setAttribute('role', 'progressbar');
    progressTrack.setAttribute('aria-label', 'Progreso de DEMO');
    progressTrack.setAttribute('aria-valuemin', '0');
    progressTrack.setAttribute('aria-valuemax', String(safeTotal || 1));
    progressTrack.setAttribute('aria-valuenow', String(safeStep));

    const progressBar = document.createElement('span');
    progressBar.className = 'demo-step-toast__progress-bar';
    progressBar.style.width = `${progress * 100}%`;
    progressTrack.append(progressBar);

    this.demoMovementToast.replaceChildren(label, command, progressTrack);

    if (this.demoMovementTimer) window.clearTimeout(this.demoMovementTimer);
    const hideAfterMs = (Number(durationMs) || 1000) + (Number(pauseMs) || 300) + 1500;
    this.demoMovementTimer = window.setTimeout(() => this.clearDemoMovement(), hideAfterMs);
  }

  clearDemoMovement() {
    if (this.demoMovementTimer) window.clearTimeout(this.demoMovementTimer);
    this.demoMovementTimer = null;
    this.demoMovementToast?.remove();
    this.demoMovementToast = null;
  }

  toast(message, type = 'info') {
    if (!this.toastRegion) return;
    const activeToasts = [...this.toastRegion.querySelectorAll('.app-toast')];
    while (activeToasts.length >= MAX_VISIBLE_TOASTS) {
      activeToasts.shift()?.remove();
    }
    const toast = createElement('div', `app-toast app-toast--${type}`, message);
    this.toastRegion.append(toast);
    window.setTimeout(() => toast.remove(), 1800);
  }
}
