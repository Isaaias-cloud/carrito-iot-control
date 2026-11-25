import { APP_CONFIG, ENDPOINTS } from './config.js';
import { isRecord } from './utils.js';

export async function fetchWithTimeout(url, { timeoutMs = APP_CONFIG.requestTimeoutMs, signal, ...options } = {}) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  const abortForwarder = () => controller.abort();

  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abortForwarder, { once: true });

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortForwarder);
  }
}

export class ApiError extends Error {
  constructor(message, { status = 0, details = null, cause = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.cause = cause;
  }
}

export class RestClient {
  constructor({ baseUrl, timeoutMs = APP_CONFIG.requestTimeoutMs, authSession = null } = {}) {
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
    this.authSession = authSession;
  }

  async request(path, { method = 'GET', body, signal, auth = true, retryAuth = true } = {}) {
    try {
      const headers = body === undefined
        ? { Accept: 'application/json' }
        : { Accept: 'application/json', 'Content-Type': 'application/json' };
      const accessToken = auth ? this.authSession?.getAccessToken() : null;
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const response = await fetchWithTimeout(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
        timeoutMs: this.timeoutMs,
        mode: 'cors',
        credentials: 'omit',
      });
      const payload = await this.parseResponse(response);
      if (!response.ok) {
        if (auth && this.authSession?.isGuest?.() && response.status === 401) {
          this.authSession.clear();
        }
        if (response.status === 401 && auth && retryAuth && this.authSession?.getRefreshToken()) {
          try {
            await this.authSession.refresh(this);
            return await this.request(path, { method, body, signal, auth, retryAuth: false });
          } catch {
            this.authSession.clear();
          }
        }
        throw new ApiError(this.friendlyHttpError(response.status), { status: response.status, details: payload });
      }
      return payload;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error?.name === 'AbortError') {
        throw new ApiError('La solicitud tardó demasiado o fue cancelada.', { cause: error });
      }
      throw new ApiError('No se pudo contactar al servidor. Revisa la red y CORS del origen de GitHub Pages.', { cause: error });
    }
  }

  async checkRdsHealth() {
    return this.request(ENDPOINTS.healthDb());
  }

  async getHistory(vehicleId) {
    return this.request(ENDPOINTS.history(vehicleId));
  }

  async getDemos(vehicleId) {
    return this.request(`/demos/vehiculo/${encodeURIComponent(Number(vehicleId))}`);
  }

  async executeDemo(payload) {
    return this.request('/demos/ejecutar', {
      method: 'POST',
      body: payload,
    });
  }

  async getMe() {
    return this.request(ENDPOINTS.me());
  }

  async getAdminDashboard() {
    return this.request(ENDPOINTS.adminDashboard());
  }

  async getAdminModels({ limit = 100, offset = 0, search = '' } = {}) {
    return this.request(`${ENDPOINTS.adminModels()}?limit=${limit}&offset=${offset}${search ? `&search=${encodeURIComponent(search)}` : ''}`);
  }

  async createAdminModel(body) {
    return this.request(ENDPOINTS.adminModels(), { method: 'POST', body });
  }

  async updateAdminModel(id, body) {
    return this.request(ENDPOINTS.adminModel(id), { method: 'PUT', body });
  }

  async getAdminUnits({ limit = 100, offset = 0, state = '' } = {}) {
    return this.request(`${ENDPOINTS.adminUnits()}?limit=${limit}&offset=${offset}${state ? `&estado=${encodeURIComponent(state)}` : ''}`);
  }

  async createAdminUnit(body) {
    return this.request(ENDPOINTS.adminUnits(), { method: 'POST', body });
  }

  async updateAdminUnit(id, body) {
    return this.request(ENDPOINTS.adminUnit(id), { method: 'PUT', body });
  }

  async getAdminClients({ limit = 100, offset = 0, search = '' } = {}) {
    return this.request(`${ENDPOINTS.adminClients()}?limit=${limit}&offset=${offset}${search ? `&search=${encodeURIComponent(search)}` : ''}`);
  }

  async createAdminClient(body) {
    return this.request(ENDPOINTS.adminClients(), { method: 'POST', body });
  }

  async updateAdminClient(id, body) {
    return this.request(ENDPOINTS.adminClient(id), { method: 'PUT', body });
  }

  async getAdminAssignments({ limit = 100, offset = 0, vehicleId = '' } = {}) {
    return this.request(`${ENDPOINTS.adminAssignments()}?limit=${limit}&offset=${offset}${vehicleId ? `&id_vehiculo=${vehicleId}` : ''}`);
  }

  async createAdminAssignment(body) {
    return this.request(ENDPOINTS.adminAssignments(), { method: 'POST', body });
  }

  async revokeAdminAssignment(id, body = {}) {
    return this.request(ENDPOINTS.adminRevokeAssignment(id), { method: 'POST', body });
  }

  async getAdminAudit({ limit = 50, offset = 0, resourceType = '' } = {}) {
    return this.request(`${ENDPOINTS.adminAudit()}?limit=${limit}&offset=${offset}${resourceType ? `&recurso_tipo=${encodeURIComponent(resourceType)}` : ''}`);
  }

  async createCommand(body) {
    return this.request('/comandos/', { method: 'POST', body });
  }

  async deleteCommand(id) {
    return this.request(`/comandos/${id}`, { method: 'DELETE' });
  }

  async getMyVehicles() {
    return this.request(ENDPOINTS.myVehicles());
  }

  async getSupportAdmins() {
    return this.request(ENDPOINTS.supportAdmins());
  }

  async getVehicleSupport(vehicleId) {
    return this.request(ENDPOINTS.vehicleSupport(vehicleId));
  }

  async grantVehicleSupport(vehicleId, body) {
    return this.request(ENDPOINTS.vehicleSupport(vehicleId), { method: 'POST', body });
  }

  async revokeVehicleSupport(vehicleId, authorizationId) {
    return this.request(`${ENDPOINTS.vehicleSupport(vehicleId)}/${authorizationId}`, { method: 'DELETE' });
  }

  async getOwnerDemos(vehicleId = '') {
    const query = vehicleId ? `?id_vehiculo=${encodeURIComponent(Number(vehicleId))}` : '';
    return this.request(`${ENDPOINTS.ownerDemos()}${query}`);
  }

  async createOwnerDemo(body) {
    return this.request(ENDPOINTS.ownerDemos(), { method: 'POST', body });
  }

  async updateOwnerDemo(id, body) {
    return this.request(ENDPOINTS.ownerDemo(id), { method: 'PUT', body });
  }

  async deleteOwnerDemo(id) {
    return this.request(ENDPOINTS.ownerDemo(id), { method: 'DELETE' });
  }

  async getOwnerDemoMovements(id) {
    return this.request(ENDPOINTS.ownerDemoMovements(id));
  }

  async createOwnerDemoMovement(id, body) {
    return this.request(ENDPOINTS.ownerDemoMovements(id), { method: 'POST', body });
  }

  async updateOwnerDemoMovement(id, body) {
    return this.request(ENDPOINTS.ownerDemoMovement(id), { method: 'PUT', body });
  }

  async deleteOwnerDemoMovement(id) {
    return this.request(ENDPOINTS.ownerDemoMovement(id), { method: 'DELETE' });
  }

  async updateModelCommand(modelId, commandId, permitido) {
    return this.request(ENDPOINTS.adminModelCommand(modelId, commandId), {
      method: 'PATCH',
      body: { permitido: Boolean(permitido) },
    });
  }

  async getGuestVehicles() {
    return this.request(ENDPOINTS.guestVehicles(), { auth: false, retryAuth: false });
  }

  async createGuestSession(vehicleId) {
    return this.request(ENDPOINTS.guestSession(), { method: 'POST', body: { id_vehiculo: Number(vehicleId) }, auth: false, retryAuth: false });
  }

  async finishGuestSession() {
    return this.request(ENDPOINTS.guestFinish(), { method: 'POST', body: {}, auth: true, retryAuth: false });
  }

  async getModelCommands(modelId) {
    return this.request(ENDPOINTS.adminModelCommands(modelId));
  }

  async parseResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;
    try {
      return await response.json();
    } catch (error) {
      throw new ApiError('El servidor respondió con JSON inválido.', { status: response.status, cause: error });
    }
  }

  friendlyHttpError(status) {
    if (status === 401) return 'La sesión expiró o no es válida. Inicia sesión de nuevo.';
    if (status === 403) return 'No tienes autorización para este recurso.';
    if (status === 400) return 'La API rechazó la operación.';
    if (status === 404) return 'La operación o recurso no existe en la API.';
    if (status === 409) return 'La API indicó un conflicto con el estado actual.';
    if (status === 422) return 'Los datos no cumplen el contrato de la API.';
    if (status === 429) return 'Demasiados intentos. Espera antes de volver a intentar.';
    if (status >= 500) return 'El servidor AWS no pudo completar la operación.';
    return `La API respondió con HTTP ${status}.`;
  }
}

export function validateHealth(payload) {
  return isRecord(payload) && payload.status === 'ok';
}

export function validateRdsHealth(payload) {
  return isRecord(payload)
    && payload.status === 'ok'
    && payload.rds === 'connected'
    && payload.database === 'mysql';
}

export function validateCommandList(payload) {
  return Array.isArray(payload) && payload.every((item) => isRecord(item) && Number.isInteger(item.id_comando));
}
