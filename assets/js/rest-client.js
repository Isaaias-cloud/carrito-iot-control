import { APP_CONFIG } from './config.js';
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
  constructor({ baseUrl, timeoutMs = APP_CONFIG.requestTimeoutMs } = {}) {
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }

  async request(path, { method = 'GET', body, signal } = {}) {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}${path}`, {
        method,
        headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
        timeoutMs: this.timeoutMs,
        mode: 'cors',
        credentials: 'omit',
      });
      const payload = await this.parseResponse(response);
      if (!response.ok) {
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
    return this.request('/health/db');
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
    if (status === 400) return 'La API rechazó la operación.';
    if (status === 404) return 'La operación o recurso no existe en la API.';
    if (status === 409) return 'La API indicó un conflicto con el estado actual.';
    if (status === 422) return 'Los datos no cumplen el contrato de la API.';
    if (status >= 500) return 'El servidor AWS no pudo completar la operación.';
    return `La API respondió con HTTP ${status}.`;
  }
}

export function validateHealth(payload) {
  return isRecord(payload) && payload.status === 'ok';
}

export function validateCommandList(payload) {
  return Array.isArray(payload) && payload.every((item) => isRecord(item) && Number.isInteger(item.id_comando));
}
