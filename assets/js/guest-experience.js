import { ApiError } from './rest-client.js';
import { formatError, showAlert } from './error-alerts.js';

function items(value) { return Array.isArray(value) ? value : []; }

export class GuestExperience {
  constructor({ api, session, onAuthenticated } = {}) {
    this.api = api;
    this.session = session;
    this.onAuthenticated = onAuthenticated;
    this.catalog = document.getElementById('guest-vehicles');
    this.message = document.getElementById('guest-message');
    this.banner = document.getElementById('guest-banner');
    this.timer = document.getElementById('guest-timer');
    this.finishButton = document.getElementById('guest-finish');
    this.interval = null;
    this.sessionData = null;
  }

  init() {
    this.finishButton?.addEventListener('click', () => { void this.finish(); });
    if (this.session.isGuest()) this.activate(this.session.tokens);
  }

  async open() {
    const dialog = document.getElementById('auth-dialog');
    if (dialog && !dialog.open) dialog.showModal();
    const panel = document.getElementById('guest-catalog');
    if (panel) panel.hidden = false;
    this.setMessage('Consultando unidades de exhibición…', 'info');
    try { this.renderCatalog(items(await this.api.getGuestVehicles())); }
    catch (error) { this.setMessage(this.errorMessage(error), 'error'); }
  }

  renderCatalog(vehicles) {
    if (!this.catalog) return;
    this.catalog.replaceChildren();
    if (!vehicles.length) { const empty = document.createElement('p'); empty.className = 'guest-empty'; empty.textContent = 'No hay unidades de exhibición disponibles en este momento.'; this.catalog.append(empty); return; }
    vehicles.forEach((vehicle) => {
      const card = document.createElement('article'); card.className = 'guest-vehicle-card';
      const title = document.createElement('h3'); title.textContent = vehicle.vehiculo_nombre; card.append(title);
      const detail = document.createElement('p'); detail.textContent = `${vehicle.identificador_unico} · ${vehicle.modelo_nombre}`; card.append(detail);
      const state = document.createElement('span'); state.className = `guest-state guest-state--${String(vehicle.estado).toLowerCase()}`; state.textContent = vehicle.estado === 'DISPONIBLE' ? 'Disponible' : `Ocupada${vehicle.libera_en ? ` · libera ${new Date(vehicle.libera_en).toLocaleTimeString('es-MX')}` : ''}`; card.append(state);
      if (vehicle.estado === 'DISPONIBLE') { const button = document.createElement('button'); button.className = 'btn btn-sm btn-primary'; button.type = 'button'; button.textContent = 'Reservar 5 minutos'; button.addEventListener('click', () => { void this.reserve(vehicle.id_vehiculo, button); }); card.append(button); }
      this.catalog.append(card);
    });
  }

  async reserve(vehicleId, button) {
    button.disabled = true;
    try {
      this.sessionData = await this.api.createGuestSession(vehicleId);
      this.session.setGuestSession(this.sessionData);
      this.activate(this.sessionData);
      document.getElementById('auth-dialog')?.close();
      this.onAuthenticated?.(this.session.profile);
    } catch (error) {
      button.disabled = false;
      this.setMessage(this.errorMessage(error), 'error');
      void this.open();
    }
  }

  activate(data) {
    this.sessionData = data;
    if (this.banner) this.banner.hidden = false;
    this.updateTimer();
    if (this.interval) window.clearInterval(this.interval);
    this.interval = window.setInterval(() => this.updateTimer(), 1000);
  }

  updateTimer() {
    let expiry = this.sessionData?.expira_en || this.session.tokens?.expira_en;
    // El backend serializa datetimes UTC sin sufijo: new Date() los tomaría
    // como hora local y el contador saldría con horas de desfase.
    if (typeof expiry === 'string' && !/(Z|[+-]\d{2}:\d{2})$/.test(expiry)) expiry += 'Z';
    const seconds = Math.max(0, Math.floor((new Date(expiry).getTime() - Date.now()) / 1000));
    if (this.timer) this.timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    if (seconds <= 0) { this.setMessage('La sesión de exhibición terminó y la unidad fue liberada.', 'info'); void this.finish({ expired: true }); }
  }

  async finish({ expired = false } = {}) {
    if (this.interval) window.clearInterval(this.interval);
    this.interval = null;
    try { if (!expired && this.session.isGuest()) await this.api.finishGuestSession(); }
    catch (error) { if (!(error instanceof ApiError && [401, 403].includes(error.status))) this.setMessage(this.errorMessage(error), 'error'); }
    finally {
      this.session.clear({ silent: true });
      if (this.banner) this.banner.hidden = true;
      window.location.reload();
    }
  }

  setMessage(message, state = 'info') {
    if (this.message) { this.message.textContent = message; this.message.dataset.state = state; }
    if (state === 'error') showAlert(message, 'error', { mirror: true });
  }
  errorMessage(error) { return error instanceof ApiError ? formatError(error, 'Modo invitado') : error?.message || 'No se pudo reservar la unidad.'; }
}
