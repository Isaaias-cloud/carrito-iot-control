import { ApiError } from './rest-client.js';
import { ENDPOINTS } from './config.js';

const INVENTORY_STATES = ['INVENTARIO', 'EXHIBICION', 'VENDIDA', 'MANTENIMIENTO', 'BAJA'];

function arrayPayload(value) {
  return Array.isArray(value) ? value : [];
}

function valueOf(form, name) {
  return form.elements.namedItem(name)?.value?.trim() || '';
}

function optionalValue(form, name) {
  const value = valueOf(form, name);
  return value || null;
}

function numberValue(form, name) {
  return Number(valueOf(form, name));
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('es-MX');
}

function cell(row, value, className = '') {
  const element = document.createElement('td');
  if (className) element.className = className;
  element.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
  row.append(element);
  return element;
}

function emptyRow(tbody, columns, message) {
  tbody.replaceChildren();
  const row = document.createElement('tr');
  const cellElement = document.createElement('td');
  cellElement.colSpan = columns;
  cellElement.className = 'admin-empty';
  cellElement.textContent = message;
  row.append(cellElement);
  tbody.append(row);
}

export class AdminController {
  constructor({ api } = {}) {
    this.api = api;
    this.root = document.getElementById('admin-view');
    this.message = document.getElementById('admin-message');
    this.models = [];
    this.units = [];
    this.clients = [];
    this.assignments = [];
    this.dashboard = null;
    this.selectedUnitId = null;
    this.editingModelId = null;
    this.editingUnitId = null;
    this.auditOffset = 0;
    this.initialized = false;
  }

  setVisible(visible) {
    if (this.root) this.root.hidden = !visible;
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;
    document.getElementById('admin-refresh')?.addEventListener('click', () => { void this.load(); });
    document.getElementById('admin-model-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.createModel(event.currentTarget);
    });
    document.getElementById('admin-model-cancel')?.addEventListener('click', () => this.resetModelForm());
    document.getElementById('admin-unit-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.createUnit(event.currentTarget);
    });
    document.getElementById('admin-unit-cancel')?.addEventListener('click', () => this.resetUnitForm());
    document.getElementById('admin-client-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.createClient(event.currentTarget);
    });
    document.getElementById('admin-assignment-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.createAssignment(event.currentTarget);
    });
    document.getElementById('admin-command-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.createCommand(event.currentTarget);
    });
    document.getElementById('admin-operations-unit')?.addEventListener('change', (event) => {
      this.selectedUnitId = Number(event.target.value) || null;
      void this.loadUnitOperations();
    });
    document.getElementById('admin-capability-model')?.addEventListener('change', (event) => {
      void this.loadModelCommands(Number(event.target.value) || null);
    });
    document.getElementById('admin-audit-filter')?.addEventListener('change', () => {
      this.auditOffset = 0;
      void this.loadAudit();
    });
    document.getElementById('admin-audit-more')?.addEventListener('click', () => {
      this.auditOffset += 50;
      void this.loadAudit({ append: true });
    });
  }

  async load() {
    if (!this.api) return;
    this.init();
    this.setMessage('Actualizando datos administrativos…', 'info');
    this.setLoading(true);
    const results = await Promise.allSettled([
      this.api.getAdminDashboard(),
      this.api.getAdminModels(),
      this.api.getAdminUnits(),
      this.api.getAdminClients(),
      this.api.getAdminAssignments(),
      this.api.getAdminAudit(),
    ]);
    const [dashboard, models, units, clients, assignments, audit] = results;
    if (dashboard.status === 'fulfilled') {
      this.dashboard = dashboard.value;
      this.renderDashboard(this.dashboard);
    }
    if (models.status === 'fulfilled') {
      this.models = arrayPayload(models.value);
      this.renderModels();
      this.renderModelOptions();
    }
    if (units.status === 'fulfilled') {
      this.units = arrayPayload(units.value);
      this.renderUnits();
      this.renderUnitOptions();
      if (this.dashboard) this.renderDashboard(this.dashboard);
    }
    if (clients.status === 'fulfilled') {
      this.clients = arrayPayload(clients.value);
      this.renderClients();
      this.renderClientOptions();
    }
    if (assignments.status === 'fulfilled') {
      this.assignments = arrayPayload(assignments.value);
      this.renderAssignments();
    }
    if (audit.status === 'fulfilled') this.renderAudit(arrayPayload(audit.value), false);
    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected) this.setMessage(this.errorMessage(rejected.reason), 'error');
    else this.setMessage('Datos administrativos sincronizados.', 'success');
    this.setLoading(false);
    if (this.selectedUnitId) await this.loadUnitOperations();
  }

  async loadAudit({ append = false } = {}) {
    try {
      const filter = document.getElementById('admin-audit-filter')?.value || '';
      const rows = arrayPayload(await this.api.getAdminAudit({ offset: this.auditOffset, resourceType: filter }));
      this.renderAudit(rows, append);
    } catch (error) {
      this.setMessage(this.errorMessage(error), 'error');
    }
  }

  async loadUnitOperations() {
    const unitId = this.selectedUnitId;
    const commandsBody = document.getElementById('admin-commands-body');
    const demosBody = document.getElementById('admin-demos-body');
    if (!unitId) {
      emptyRow(commandsBody, 5, 'Selecciona una unidad para consultar comandos y demos.');
      emptyRow(demosBody, 4, 'Selecciona una unidad para consultar demos.');
      return;
    }
    try {
      const [commands, demos] = await Promise.all([
        this.api.request(ENDPOINTS.commands(unitId)),
        this.api.getDemos(unitId),
      ]);
      this.renderCommands(arrayPayload(commands));
      this.renderDemos(arrayPayload(demos));
    } catch (error) {
      this.setMessage(this.errorMessage(error), 'error');
      emptyRow(commandsBody, 5, 'No fue posible consultar los comandos de esta unidad.');
      emptyRow(demosBody, 4, 'No fue posible consultar las demos de esta unidad.');
    }
  }

  async loadModelCommands(modelId) {
    const body = document.getElementById('admin-capability-body');
    if (!modelId) {
      emptyRow(body, 3, 'Selecciona un modelo para administrar sus capacidades.');
      return;
    }
    try {
      this.renderModelCommands(arrayPayload(await this.api.getModelCommands(modelId)));
    } catch (error) {
      this.setMessage(this.errorMessage(error), 'error');
      emptyRow(body, 3, 'No fue posible consultar las capacidades del modelo.');
    }
  }

  async updateModelCommand(modelId, commandId, permitted, checkbox) {
    checkbox.disabled = true;
    try {
      await this.api.updateModelCommand(modelId, commandId, permitted);
      this.setMessage('Capacidad de comando actualizada.', 'success');
    } catch (error) {
      checkbox.checked = !permitted;
      this.setMessage(this.errorMessage(error), 'error');
    } finally {
      checkbox.disabled = false;
    }
  }

  async createModel(form) {
    await this.mutate(async () => {
      const payload = {
        clave: valueOf(form, 'clave'), nombre: valueOf(form, 'nombre'),
        descripcion: optionalValue(form, 'descripcion'), microcontrolador: optionalValue(form, 'microcontrolador'), activo: true,
      };
      if (this.editingModelId) {
        await this.api.updateAdminModel(this.editingModelId, { nombre: payload.nombre, descripcion: payload.descripcion, microcontrolador: payload.microcontrolador, activo: true });
      } else await this.api.createAdminModel(payload);
      this.resetModelForm();
      await this.load();
    }, this.editingModelId ? 'Modelo actualizado correctamente.' : 'Modelo creado correctamente.');
  }

  async createUnit(form) {
    await this.mutate(async () => {
      const payload = {
        id_modelo: numberValue(form, 'id_modelo'), identificador_unico: valueOf(form, 'identificador_unico'),
        nombre: valueOf(form, 'nombre'), descripcion: optionalValue(form, 'descripcion'),
        estado_inventario: valueOf(form, 'estado_inventario') || 'INVENTARIO', activo: true,
      };
      if (this.editingUnitId) await this.api.updateAdminUnit(this.editingUnitId, { id_modelo: payload.id_modelo, identificador_unico: payload.identificador_unico, estado_inventario: payload.estado_inventario });
      else await this.api.createAdminUnit(payload);
      this.resetUnitForm();
      await this.load();
    }, this.editingUnitId ? 'Unidad actualizada correctamente.' : 'Unidad registrada correctamente.');
  }

  async createClient(form) {
    await this.mutate(async () => {
      await this.api.createAdminClient({ email: valueOf(form, 'email'), nombre: valueOf(form, 'nombre'), password: valueOf(form, 'password'), activo: true, email_verificado: false });
      form.reset();
      await this.load();
    }, 'Cliente creado correctamente.');
  }

  async createAssignment(form) {
    await this.mutate(async () => {
      await this.api.createAdminAssignment({ id_vehiculo: numberValue(form, 'id_vehiculo'), id_usuario: numberValue(form, 'id_usuario'), motivo: optionalValue(form, 'motivo') });
      form.reset();
      await this.load();
    }, 'Asignación creada correctamente.');
  }

  async createCommand(form) {
    const unitId = this.selectedUnitId;
    if (!unitId) {
      this.setMessage('Selecciona una unidad antes de agregar un comando.', 'error');
      return;
    }
    await this.mutate(async () => {
      await this.api.createCommand({ id_vehiculo: unitId, nombre: valueOf(form, 'nombre'), codigo: numberValue(form, 'codigo'), descripcion: valueOf(form, 'descripcion') });
      form.reset();
      await this.loadUnitOperations();
    }, 'Comando agregado al catálogo de la unidad.');
  }

  async revokeAssignment(id) {
    const motivo = window.prompt('Motivo de revocación (opcional):', '') ?? '';
    await this.mutate(async () => {
      await this.api.revokeAdminAssignment(id, { motivo: motivo || null });
      await this.load();
    }, 'Asignación revocada correctamente.');
  }

  async editClient(client) {
    const nombre = window.prompt('Nombre del cliente:', client.nombre || '');
    if (nombre === null || !nombre.trim()) return;
    await this.mutate(async () => {
      await this.api.updateAdminClient(client.id_usuario, { nombre: nombre.trim(), activo: client.activo !== false, email_verificado: client.email_verificado === true });
      await this.load();
    }, 'Cliente actualizado correctamente.');
  }

  async deleteCommand(id) {
    if (!window.confirm('¿Eliminar este comando del catálogo?')) return;
    await this.mutate(async () => {
      await this.api.deleteCommand(id);
      await this.loadUnitOperations();
    }, 'Comando eliminado correctamente.');
  }

  async mutate(operation, successMessage) {
    try {
      await operation();
      this.setMessage(successMessage, 'success');
    } catch (error) {
      this.setMessage(this.errorMessage(error), 'error');
    }
  }

  renderDashboard(data) {
    const values = {
      vehicles: data?.vehiculos,
      units: data?.unidades_vehiculo,
      users: data?.usuarios,
      assignments: data?.asignaciones_vehiculo,
      demos: data?.demos,
      audit: data?.auditoria,
    };
    Object.entries(values).forEach(([key, value]) => {
      const target = document.getElementById(`metric-${key}`);
      if (target) target.textContent = value ?? '—';
    });
    const summary = document.getElementById('admin-inventory-summary');
    if (!summary) return;
    summary.replaceChildren();
    const counts = this.units.reduce((result, unit) => {
      const state = unit.estado_inventario || 'SIN ESTADO';
      result[state] = (result[state] || 0) + 1;
      return result;
    }, {});
    [...INVENTORY_STATES, 'SIN ESTADO'].forEach((state) => {
      const item = document.createElement('span');
      item.className = 'admin-state-chip';
      item.textContent = `${state}: ${counts[state] || 0}`;
      summary.append(item);
    });
  }

  renderModels() {
    const body = document.getElementById('admin-models-body');
    if (!body) return;
    const activeModels = document.getElementById('metric-models');
    if (activeModels) activeModels.textContent = this.models.filter((model) => model.activo !== false).length;
    body.replaceChildren();
    if (!this.models.length) return emptyRow(body, 6, 'No hay modelos registrados.');
    this.models.forEach((model) => {
      const row = document.createElement('tr');
      cell(row, model.id_modelo); cell(row, model.clave); cell(row, model.nombre); cell(row, model.microcontrolador); cell(row, model.activo ? 'Activo' : 'Inactivo');
      const action = cell(row, ''); const button = document.createElement('button'); button.className = 'btn btn-sm btn-outline-info'; button.type = 'button'; button.textContent = 'Editar'; button.addEventListener('click', () => this.startEditModel(model)); action.replaceChildren(button);
      body.append(row);
    });
  }

  renderUnits() {
    const body = document.getElementById('admin-units-body');
    if (!body) return;
    body.replaceChildren();
    if (!this.units.length) return emptyRow(body, 7, 'No hay unidades registradas.');
    this.units.forEach((unit) => {
      const row = document.createElement('tr');
      cell(row, unit.id_vehiculo); cell(row, unit.identificador_unico); cell(row, unit.nombre); cell(row, unit.modelo_nombre || unit.modelo_clave); cell(row, unit.estado_inventario); cell(row, unit.activo ? 'Activa' : 'Inactiva');
      const action = cell(row, ''); const button = document.createElement('button'); button.className = 'btn btn-sm btn-outline-info'; button.type = 'button'; button.textContent = 'Editar'; button.addEventListener('click', () => this.startEditUnit(unit)); action.replaceChildren(button);
      body.append(row);
    });
  }

  renderClients() {
    const body = document.getElementById('admin-clients-body');
    if (!body) return;
    body.replaceChildren();
    if (!this.clients.length) return emptyRow(body, 6, 'No hay clientes registrados.');
    this.clients.forEach((client) => {
      const row = document.createElement('tr');
      cell(row, client.id_usuario); cell(row, client.nombre); cell(row, client.email); cell(row, client.activo ? 'Activo' : 'Inactivo'); cell(row, client.email_verificado ? 'Sí' : 'Pendiente');
      const action = cell(row, ''); const button = document.createElement('button'); button.className = 'btn btn-sm btn-outline-info'; button.type = 'button'; button.textContent = 'Editar'; button.addEventListener('click', () => { void this.editClient(client); }); action.replaceChildren(button);
      body.append(row);
    });
  }

  renderAssignments() {
    const body = document.getElementById('admin-assignments-body');
    if (!body) return;
    body.replaceChildren();
    if (!this.assignments.length) return emptyRow(body, 7, 'No hay asignaciones registradas.');
    this.assignments.forEach((assignment) => {
      const row = document.createElement('tr');
      cell(row, assignment.id_asignacion); cell(row, assignment.vehiculo_nombre || assignment.id_vehiculo); cell(row, assignment.usuario_nombre || assignment.email || assignment.id_usuario); cell(row, assignment.tipo); cell(row, assignment.estado); cell(row, formatDate(assignment.inicia_en));
      const actionCell = cell(row, '');
      if (assignment.estado === 'ACTIVA') {
        const button = document.createElement('button');
        button.className = 'btn btn-sm btn-outline-warning'; button.type = 'button'; button.textContent = 'Revocar';
        button.addEventListener('click', () => { void this.revokeAssignment(assignment.id_asignacion); });
        actionCell.replaceChildren(button);
      }
      body.append(row);
    });
  }

  renderCommands(commands) {
    const body = document.getElementById('admin-commands-body');
    if (!body) return;
    body.replaceChildren();
    if (!commands.length) return emptyRow(body, 5, 'No hay comandos permitidos para esta unidad.');
    commands.forEach((command) => {
      const row = document.createElement('tr');
      cell(row, command.id_comando); cell(row, command.codigo); cell(row, command.nombre); cell(row, command.descripcion); cell(row, command.activo === false ? 'Inactivo' : 'Activo');
      const actionCell = cell(row, '');
      const button = document.createElement('button'); button.className = 'btn btn-sm btn-outline-danger'; button.type = 'button'; button.textContent = 'Eliminar';
      button.addEventListener('click', () => { void this.deleteCommand(command.id_comando); }); actionCell.replaceChildren(button); body.append(row);
    });
  }

  renderDemos(demos) {
    const body = document.getElementById('admin-demos-body');
    if (!body) return;
    body.replaceChildren();
    if (!demos.length) return emptyRow(body, 4, 'No hay demos empresariales para esta unidad.');
    demos.forEach((demo) => {
      const row = document.createElement('tr'); cell(row, demo.id_demo); cell(row, demo.nombre); cell(row, demo.descripcion); cell(row, demo.activo ? 'Activa' : 'Inactiva'); body.append(row);
    });
  }

  renderModelCommands(commands) {
    const body = document.getElementById('admin-capability-body');
    if (!body) return;
    body.replaceChildren();
    if (!commands.length) return emptyRow(body, 3, 'Este modelo no tiene comandos asociados.');
    commands.forEach((command) => {
      const row = document.createElement('tr');
      cell(row, command.codigo); cell(row, command.nombre);
      const action = cell(row, '');
      const label = document.createElement('label'); label.className = 'admin-check-label';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = command.permitido !== false; checkbox.setAttribute('aria-label', `Permitir ${command.nombre}`);
      checkbox.addEventListener('change', () => { void this.updateModelCommand(command.id_modelo, command.id_comando, checkbox.checked, checkbox); });
      label.append(checkbox, document.createTextNode(checkbox.checked ? ' Permitido' : ' Bloqueado'));
      action.replaceChildren(label); body.append(row);
    });
  }

  startEditModel(model) {
    const form = document.getElementById('admin-model-form');
    if (!form) return;
    this.editingModelId = model.id_modelo;
    form.elements.namedItem('clave').value = model.clave || '';
    form.elements.namedItem('nombre').value = model.nombre || '';
    form.elements.namedItem('descripcion').value = model.descripcion || '';
    form.elements.namedItem('microcontrolador').value = model.microcontrolador || '';
    document.getElementById('admin-model-submit').textContent = 'Guardar modelo';
    document.getElementById('admin-model-cancel').hidden = false;
    form.elements.namedItem('nombre').focus();
  }

  resetModelForm() {
    this.editingModelId = null;
    document.getElementById('admin-model-form')?.reset();
    const submit = document.getElementById('admin-model-submit'); if (submit) submit.textContent = 'Crear modelo';
    const cancel = document.getElementById('admin-model-cancel'); if (cancel) cancel.hidden = true;
  }

  startEditUnit(unit) {
    const form = document.getElementById('admin-unit-form');
    if (!form) return;
    this.editingUnitId = unit.id_vehiculo;
    form.elements.namedItem('id_modelo').value = unit.id_modelo;
    form.elements.namedItem('identificador_unico').value = unit.identificador_unico || '';
    form.elements.namedItem('nombre').value = unit.nombre || '';
    form.elements.namedItem('estado_inventario').value = unit.estado_inventario || 'INVENTARIO';
    form.elements.namedItem('descripcion').value = unit.descripcion || '';
    document.getElementById('admin-unit-submit').textContent = 'Guardar unidad';
    document.getElementById('admin-unit-cancel').hidden = false;
    form.elements.namedItem('identificador_unico').focus();
  }

  resetUnitForm() {
    this.editingUnitId = null;
    document.getElementById('admin-unit-form')?.reset();
    const submit = document.getElementById('admin-unit-submit'); if (submit) submit.textContent = 'Registrar unidad';
    const cancel = document.getElementById('admin-unit-cancel'); if (cancel) cancel.hidden = true;
  }

  renderAudit(rows, append = false) {
    const body = document.getElementById('admin-audit-body');
    if (!body) return;
    if (!append) body.replaceChildren();
    if (!rows.length && !append) return emptyRow(body, 7, 'No hay eventos de auditoría para el filtro seleccionado.');
    rows.forEach((event) => {
      const row = document.createElement('tr'); cell(row, event.id_auditoria); cell(row, formatDate(event.creado_en)); cell(row, event.actor_tipo); cell(row, event.accion); cell(row, event.recurso_tipo); cell(row, event.recurso_id); cell(row, event.id_usuario); body.append(row);
    });
    const more = document.getElementById('admin-audit-more');
    if (more) more.hidden = rows.length < 50;
  }

  renderModelOptions() {
    const select = document.getElementById('admin-unit-model');
    if (select) {
      select.replaceChildren();
      this.models.filter((model) => model.activo !== false).forEach((model) => {
        const option = document.createElement('option'); option.value = model.id_modelo; option.textContent = `${model.clave} · ${model.nombre}`; select.append(option);
      });
    }
    const capabilitySelect = document.getElementById('admin-capability-model');
    if (capabilitySelect) {
      const current = capabilitySelect.value;
      capabilitySelect.replaceChildren();
      const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Selecciona un modelo'; capabilitySelect.append(placeholder);
      this.models.forEach((model) => { const option = document.createElement('option'); option.value = model.id_modelo; option.textContent = `${model.clave} · ${model.nombre}`; capabilitySelect.append(option); });
      if ([...capabilitySelect.options].some((option) => option.value === current)) capabilitySelect.value = current;
    }
  }

  renderUnitOptions() {
    const selects = [document.getElementById('admin-assignment-unit'), document.getElementById('admin-operations-unit')];
    selects.forEach((select) => {
      if (!select) return;
      const current = select.value;
      select.replaceChildren();
      if (select.id === 'admin-operations-unit') {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Selecciona una unidad';
        select.append(placeholder);
      }
      this.units.forEach((unit) => { const option = document.createElement('option'); option.value = unit.id_vehiculo; option.textContent = `#${unit.id_vehiculo} · ${unit.nombre || unit.identificador_unico}`; select.append(option); });
      if ([...select.options].some((option) => option.value === current)) select.value = current;
    });
  }

  renderClientOptions() {
    const select = document.getElementById('admin-assignment-client');
    if (!select) return;
    const current = select.value; select.replaceChildren();
    this.clients.filter((client) => client.activo !== false).forEach((client) => { const option = document.createElement('option'); option.value = client.id_usuario; option.textContent = `${client.nombre} · ${client.email}`; select.append(option); });
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  }

  setLoading(isLoading) {
    const refresh = document.getElementById('admin-refresh');
    if (refresh) refresh.disabled = isLoading;
    if (this.root) this.root.dataset.loading = String(isLoading);
  }

  setMessage(message, state = 'info') {
    if (!this.message) return;
    this.message.textContent = message;
    this.message.dataset.state = state;
  }

  errorMessage(error) {
    if (error instanceof ApiError) return error.status === 403 ? '403: requiere permisos ADMIN o soporte vigente para esta unidad.' : `${error.status || 'Error'}: ${error.message}`;
    return error?.message || 'No se pudo completar la operación administrativa.';
  }
}
