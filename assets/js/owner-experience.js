import { ApiError } from './rest-client.js';
import { ENDPOINTS } from './config.js';
import { formatError, showAlert } from './error-alerts.js';

function listValue(value) { return Array.isArray(value) ? value : []; }
function field(form, name) { return form.elements.namedItem(name)?.value?.trim() || ''; }
function numberField(form, name) { return Number(field(form, name)); }

function textCell(parent, value) {
  const element = document.createElement('span');
  element.textContent = value === null || value === undefined ? '—' : String(value);
  parent.append(element);
  return element;
}

export class OwnerExperience {
  constructor({ api, onVehicleSelected, onCommandsChanged } = {}) {
    this.api = api;
    this.onVehicleSelected = onVehicleSelected;
    this.onCommandsChanged = onCommandsChanged;
    this.profile = null;
    this.vehicles = [];
    this.commands = [];
    this.demos = [];
    this.selectedVehicle = null;
    this.selectedDemo = null;
    this.editingDemoId = null;
    this.supportTimer = null;
    this.root = document.getElementById('owner-experience');
    this.vehicleSelect = document.getElementById('vehicle-selector');
    this.message = document.getElementById('owner-message');
    this.supportMessage = document.getElementById('support-message');
  }

  init(profile) {
    this.profile = profile;
    if (!this.root) return;
    const roles = Array.isArray(profile?.roles) ? profile.roles : [];
    const visible = roles.includes('USUARIO') || roles.includes('ADMIN');
    document.querySelectorAll('[data-owner-access]').forEach((element) => { element.hidden = !visible; });
    this.root.hidden = !visible;
    document.querySelectorAll('[data-owner-only]').forEach((element) => { element.hidden = !roles.includes('USUARIO'); });
    if (!visible) return;
    this.vehicleSelect?.addEventListener('change', () => { void this.selectVehicle(this.vehicleSelect.value); });
    document.getElementById('support-form')?.addEventListener('submit', (event) => { event.preventDefault(); void this.grantSupport(event.currentTarget); });
    document.getElementById('owner-demo-form')?.addEventListener('submit', (event) => { event.preventDefault(); void this.saveDemo(event.currentTarget); });
    document.getElementById('owner-demo-cancel')?.addEventListener('click', () => this.resetDemoForm());
    document.getElementById('owner-step-form')?.addEventListener('submit', (event) => { event.preventDefault(); void this.addStep(event.currentTarget); });
    document.getElementById('owner-demo-run')?.addEventListener('click', () => { void this.executeDemo(); });
    document.getElementById('owner-demo-delete')?.addEventListener('click', () => { void this.deleteSelectedDemo(); });
    void this.loadVehicles();
  }

  async loadVehicles() {
    try {
      this.vehicles = listValue(await this.api.getMyVehicles());
      // Un ADMIN sin asignación también debe poder operar el inventario.
      let roles = Array.isArray(this.profile?.roles) ? this.profile.roles : [];
      if (!roles.length) {
        const perfil = await this.api.getMe();
        roles = Array.isArray(perfil?.roles) ? perfil.roles : [];
      }
      if (!this.vehicles.length && roles.includes('ADMIN')) {
        this.vehicles = listValue(await this.api.getVehicles()).map((vehicle) => ({
          id_vehiculo: vehicle.id_vehiculo,
          vehiculo_nombre: vehicle.nombre,
          identificador_unico: vehicle.identificador_unico || '',
          modelo_nombre: vehicle.modelo,
          acceso_tipo: 'ADMIN',
        }));
      }
      this.renderVehicleOptions();
      if (!this.vehicles.length) {
        this.setMessage('No tienes unidades disponibles. Solicita una asignación o un consentimiento de soporte vigente.', 'info');
        this.onVehicleSelected?.(null);
        return;
      }
      const current = this.vehicles.find((vehicle) => Number(vehicle.id_vehiculo) === Number(this.selectedVehicle?.id_vehiculo));
      await this.selectVehicle((current || this.vehicles[0]).id_vehiculo);
    } catch (error) {
      this.setMessage(this.errorMessage(error), 'error');
      this.onVehicleSelected?.(null);
    }
  }

  renderVehicleOptions() {
    if (!this.vehicleSelect) return;
    this.vehicleSelect.replaceChildren();
    if (!this.vehicles.length) {
      const option = document.createElement('option'); option.value = ''; option.textContent = 'Sin unidades disponibles'; option.selected = true; this.vehicleSelect.append(option); return;
    }
    this.vehicles.forEach((vehicle) => {
      const option = document.createElement('option');
      option.value = vehicle.id_vehiculo;
      option.textContent = `${vehicle.vehiculo_nombre} · ${vehicle.identificador_unico || 'unidad'} · ${vehicle.acceso_tipo || 'PROPIETARIO'}`;
      this.vehicleSelect.append(option);
    });
  }

  async selectVehicle(vehicleId) {
    const vehicle = this.vehicles.find((item) => Number(item.id_vehiculo) === Number(vehicleId));
    if (!vehicle) return;
    this.selectedVehicle = vehicle;
    if (this.vehicleSelect) this.vehicleSelect.value = String(vehicle.id_vehiculo);
    this.setMessage(`Unidad activa: ${vehicle.vehiculo_nombre} · ${vehicle.modelo_nombre}`, 'success');
    await this.onVehicleSelected?.(Number(vehicle.id_vehiculo));
    await this.loadContext();
  }

  async loadContext() {
    const vehicleId = this.selectedVehicle?.id_vehiculo;
    if (!vehicleId) return;
    const commandsPromise = this.api.request(ENDPOINTS.commands(vehicleId));
    const supportPromise = this.isOwner() ? this.api.getVehicleSupport(vehicleId).catch(() => []) : Promise.resolve(
      this.selectedVehicle?.acceso_tipo === 'SOPORTE' && this.selectedVehicle.finaliza_en
        ? [{ id_autorizacion: this.selectedVehicle.id_asignacion, estado: 'ACTIVA', expira_en: this.selectedVehicle.finaliza_en }]
        : [],
    );
    const [commands, support] = await Promise.all([commandsPromise, supportPromise]);
    this.commands = listValue(commands);
    this.onCommandsChanged?.(this.commands);
    const stepCommand = document.querySelector('#owner-step-form select[name="id_comando"]');
    if (stepCommand) this.populateCommandSelect(stepCommand);
    this.renderSupport(listValue(support));
    if (this.isOwner()) {
      await this.loadSupportAdmins();
      await this.loadDemos();
    }
  }

  isOwner() { return Array.isArray(this.profile?.roles) && this.profile.roles.includes('USUARIO') && this.selectedVehicle?.acceso_tipo !== 'SOPORTE'; }

  async loadSupportAdmins() {
    try {
      const select = document.getElementById('support-admin');
      if (!select) return;
      const admins = listValue(await this.api.getSupportAdmins());
      select.replaceChildren();
      admins.forEach((admin) => { const option = document.createElement('option'); option.value = admin.id_usuario; option.textContent = `${admin.nombre} · ${admin.email}`; select.append(option); });
    } catch (error) { this.setSupportMessage(this.errorMessage(error), 'error'); }
  }

  renderSupport(rows) {
    const active = rows.find((row) => row.estado === 'ACTIVA' && new Date(row.expira_en).getTime() > Date.now());
    const supportPanel = document.getElementById('support-panel');
    const form = document.getElementById('support-form');
    if (supportPanel) supportPanel.hidden = !this.selectedVehicle;
    if (form) form.hidden = Boolean(active) || !this.isOwner();
    if (active) {
      this.setSupportMessage(`Soporte autorizado hasta ${new Date(active.expira_en).toLocaleString('es-MX')}. Tiempo restante: ${this.remaining(active.expira_en)}.`, 'success');
      this.startSupportTimer(active);
      const revoke = document.getElementById('support-revoke');
      if (revoke) { revoke.hidden = false; revoke.onclick = () => { void this.revokeSupport(active.id_autorizacion); }; }
    } else {
      this.stopSupportTimer();
      this.setSupportMessage(this.isOwner() ? 'No hay una autorización de soporte activa.' : 'Acceso de soporte temporal para esta unidad.', 'info');
      const revoke = document.getElementById('support-revoke'); if (revoke) revoke.hidden = true;
    }
  }

  startSupportTimer(authorization) {
    this.stopSupportTimer();
    this.supportTimer = window.setInterval(() => {
      if (new Date(authorization.expira_en).getTime() <= Date.now()) { this.stopSupportTimer(); void this.loadContext(); return; }
      this.setSupportMessage(`Soporte autorizado hasta ${new Date(authorization.expira_en).toLocaleString('es-MX')}. Tiempo restante: ${this.remaining(authorization.expira_en)}.`, 'success');
    }, 1000);
  }

  stopSupportTimer() { if (this.supportTimer) window.clearInterval(this.supportTimer); this.supportTimer = null; }
  remaining(value) { const seconds = Math.max(0, Math.floor((new Date(value).getTime() - Date.now()) / 1000)); return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`; }

  async grantSupport(form) {
    if (!this.selectedVehicle) return;
    try {
      await this.api.grantVehicleSupport(this.selectedVehicle.id_vehiculo, { id_admin: Number(field(form, 'id_admin')), motivo: field(form, 'motivo') });
      form.reset(); await this.loadContext();
    } catch (error) { this.setSupportMessage(this.errorMessage(error), 'error'); }
  }

  async revokeSupport(id) {
    try { await this.api.revokeVehicleSupport(this.selectedVehicle.id_vehiculo, id); await this.loadContext(); }
    catch (error) { this.setSupportMessage(this.errorMessage(error), 'error'); }
  }

  async loadDemos() {
    try { this.demos = listValue(await this.api.getOwnerDemos(this.selectedVehicle.id_vehiculo)); this.renderDemos(); }
    catch (error) { this.setMessage(this.errorMessage(error), 'error'); }
  }

  renderDemos() {
    const list = document.getElementById('owner-demos-list'); if (!list) return;
    list.replaceChildren();
    if (!this.demos.length) { const empty = document.createElement('p'); empty.className = 'owner-empty'; empty.textContent = 'Aún no tienes demos privadas para esta unidad.'; list.append(empty); this.hideDemoEditor(); return; }
    this.demos.forEach((demo) => {
      const card = document.createElement('article'); card.className = 'owner-demo-card';
      const title = document.createElement('h4'); title.textContent = demo.nombre; card.append(title);
      textCell(card, `${demo.pasos} pasos · ${demo.duracion_total_ms}/${demo.duracion_max_ms} ms`);
      const actions = document.createElement('div'); actions.className = 'owner-demo-actions';
      [['Editar', () => this.startEditDemo(demo)], ['Seleccionar', () => { void this.selectDemo(demo); }], ['Ejecutar', () => { void this.executeDemo(demo); }], ['Eliminar', () => { void this.deleteDemo(demo); }]].forEach(([label, handler]) => { const button = document.createElement('button'); button.className = 'btn btn-sm btn-outline-info'; button.type = 'button'; button.textContent = label; button.addEventListener('click', handler); actions.append(button); });
      card.append(actions); list.append(card);
    });
    if (this.selectedDemo) void this.selectDemo(this.selectedDemo);
  }

  async saveDemo(form) {
    try {
      const body = { nombre: field(form, 'nombre'), descripcion: field(form, 'descripcion') || null, duracion_max_ms: 300000, max_pasos: 100 };
      if (this.editingDemoId) await this.api.updateOwnerDemo(this.editingDemoId, { ...body, activo: true });
      else await this.api.createOwnerDemo({ ...body, id_vehiculo: this.selectedVehicle.id_vehiculo });
      this.resetDemoForm(); await this.loadDemos();
    } catch (error) { this.setMessage(this.errorMessage(error), 'error'); }
  }

  startEditDemo(demo) {
    const form = document.getElementById('owner-demo-form'); if (!form) return;
    this.editingDemoId = demo.id_demo; form.elements.namedItem('nombre').value = demo.nombre || ''; form.elements.namedItem('descripcion').value = demo.descripcion || '';
    document.getElementById('owner-demo-submit').textContent = 'Guardar demo'; document.getElementById('owner-demo-cancel').hidden = false;
  }

  resetDemoForm() { this.editingDemoId = null; document.getElementById('owner-demo-form')?.reset(); const submit = document.getElementById('owner-demo-submit'); if (submit) submit.textContent = 'Crear demo'; const cancel = document.getElementById('owner-demo-cancel'); if (cancel) cancel.hidden = true; }

  async deleteDemo(demo) {
    if (!window.confirm(`¿Eliminar la demo «${demo.nombre}»?`)) return;
    try { await this.api.deleteOwnerDemo(demo.id_demo); this.hideDemoEditor(); await this.loadDemos(); }
    catch (error) { this.setMessage(this.errorMessage(error), 'error'); }
  }

  async selectDemo(demo) {
    this.selectedDemo = demo;
    const editor = document.getElementById('owner-demo-editor'); if (editor) editor.hidden = false;
    const title = document.getElementById('owner-demo-title'); if (title) title.textContent = `${demo.nombre} · pasos`;
    try { this.renderSteps(listValue(await this.api.getOwnerDemoMovements(demo.id_demo))); }
    catch (error) { this.setMessage(this.errorMessage(error), 'error'); }
  }

  hideDemoEditor() { const editor = document.getElementById('owner-demo-editor'); if (editor) editor.hidden = true; this.selectedDemo = null; }

  populateCommandSelect(select, selected = '') {
    select.replaceChildren();
    this.commands.filter((command) => command.activo !== false).forEach((command) => { const option = document.createElement('option'); option.value = command.id_comando; option.textContent = `${command.codigo} · ${command.nombre}`; option.selected = String(command.id_comando) === String(selected); select.append(option); });
  }

  renderSteps(steps) {
    const list = document.getElementById('owner-demo-steps'); if (!list) return;
    const ordenados = [...steps].sort((a, b) => Number(a.orden) - Number(b.orden));
    list.replaceChildren();
    if (!ordenados.length) { const empty = document.createElement('p'); empty.className = 'owner-empty'; empty.textContent = 'Agrega el primer paso de la secuencia.'; list.append(empty); }
    ordenados.forEach((step) => {
      const form = document.createElement('form'); form.className = 'owner-step-row';
      form.innerHTML = '<label>Orden<input name="orden" type="number" min="1" max="100" required></label><label>Comando<select name="id_comando"></select></label><label>Duración ms<input name="duracion_ms" type="number" min="0" max="300000" required></label><label>Pausa ms<input name="pausa_ms" type="number" min="0" max="300000" required></label><button class="btn btn-sm btn-outline-info" type="submit">Guardar</button><button class="btn btn-sm btn-outline-danger" type="button">Eliminar</button>';
      form.elements.namedItem('orden').value = step.orden; form.elements.namedItem('duracion_ms').value = step.duracion_ms; form.elements.namedItem('pausa_ms').value = step.pausa_ms; this.populateCommandSelect(form.elements.namedItem('id_comando'), step.id_comando);
      form.addEventListener('submit', (event) => { event.preventDefault(); void this.updateStep(step.id_demo_movimiento, form); }); form.querySelector('button[type="button"]').addEventListener('click', () => { void this.deleteStep(step.id_demo_movimiento); }); list.append(form);
    });
    // Sugerencia editable: siguiente orden libre tras el último paso visible.
    const siguiente = ordenados.reduce((max, step) => Math.max(max, Number(step.orden) || 0), 0) + 1;
    const campoOrden = document.getElementById('owner-step-form')?.elements.namedItem('orden');
    if (campoOrden) campoOrden.value = String(Math.min(siguiente, 100));
  }

  async addStep(form) {
    if (!this.selectedDemo) return;
    try { await this.api.createOwnerDemoMovement(this.selectedDemo.id_demo, { id_comando: numberField(form, 'id_comando'), orden: numberField(form, 'orden'), duracion_ms: numberField(form, 'duracion_ms'), pausa_ms: numberField(form, 'pausa_ms') }); form.reset(); await this.selectDemo(this.selectedDemo); await this.loadDemos(); }
    catch (error) { this.setMessage(this.errorMessage(error), 'error'); }
  }

  async updateStep(id, form) {
    try { await this.api.updateOwnerDemoMovement(id, { id_comando: numberField(form, 'id_comando'), orden: numberField(form, 'orden'), duracion_ms: numberField(form, 'duracion_ms'), pausa_ms: numberField(form, 'pausa_ms') }); await this.selectDemo(this.selectedDemo); await this.loadDemos(); }
    catch (error) { this.setMessage(this.errorMessage(error), 'error'); }
  }

  async deleteStep(id) { try { await this.api.deleteOwnerDemoMovement(id); await this.selectDemo(this.selectedDemo); await this.loadDemos(); } catch (error) { this.setMessage(this.errorMessage(error), 'error'); } }

  async executeDemo(demo = this.selectedDemo) {
    if (!demo) return;
    try { await this.api.executeDemo({ id_demo: demo.id_demo, id_vehiculo: this.selectedVehicle.id_vehiculo }); this.setMessage(`Demo «${demo.nombre}» enviada. DETENER conserva la cancelación inmediata.`, 'success'); }
    catch (error) { this.setMessage(this.errorMessage(error), 'error'); }
  }

  setMessage(message, state = 'info') {
    if (this.message) { this.message.textContent = message; this.message.dataset.state = state; }
    if (state === 'error') showAlert(message, 'error', { mirror: true });
  }
  setSupportMessage(message, state = 'info') {
    if (this.supportMessage) { this.supportMessage.textContent = message; this.supportMessage.dataset.state = state; }
    if (state === 'error') showAlert(message, 'error', { mirror: true });
  }
  errorMessage(error) { return error instanceof ApiError ? formatError(error, 'Mis vehículos') : error?.message || 'No se pudo completar la operación.'; }
}
