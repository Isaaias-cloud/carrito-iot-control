import { APP_CONFIG } from './config.js';
import { parseJsonMessage } from './utils.js';
import { showAlert, formatWsClose } from './error-alerts.js';

export class VehicleWebSocket {
  constructor({ url, onStateChange, onMessage, onError, onAuthFailure } = {}) {
    this.url = url;
    this.onStateChange = onStateChange;
    this.onMessage = onMessage;
    this.onError = onError;
    this.onAuthFailure = onAuthFailure;
    this.socket = null;
    this.closedByUser = false;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
  }

  connect() {
    this.closedByUser = false;
    this.clearReconnectTimer();
    this.setState('connecting', 'Conectando…');
    try {
      const resolvedUrl = typeof this.url === 'function' ? this.url() : this.url;
      if (!resolvedUrl) throw new Error('No hay sesión válida para abrir WSS.');
      this.socket = new WebSocket(resolvedUrl);
      this.socket.addEventListener('open', () => {
        this.reconnectAttempt = 0;
        this.setState('online', 'En línea');
      });
      this.socket.addEventListener('message', (event) => this.handleMessage(event.data));
      this.socket.addEventListener('error', (event) => {
        showAlert('No se pudo conectar con el WebSocket (WSS). Se reintentará automáticamente.', 'error', { mirror: true });
        this.onError?.(event);
        this.setState('disconnected', 'Error de conexión');
      });
      this.socket.addEventListener('close', (event) => {
        this.socket = null;
        if ([4401, 4403].includes(event.code)) {
          showAlert(formatWsClose(event.code), 'error');
          this.onAuthFailure?.(event.code);
        } else if (!this.closedByUser && event.code !== 1000 && event.code !== 1001) {
          showAlert(`Conexión WSS caída (código ${event.code}). Reintentando…`, 'error', { mirror: true });
        }
        if (this.closedByUser) {
          this.setState('disconnected', 'Desconectado');
          return;
        }
        this.setState('connecting', 'Reconectando…');
        this.scheduleReconnect();
      });
    } catch (error) {
      this.onError?.(error);
      this.setState('disconnected', 'No disponible');
      this.scheduleReconnect();
    }
  }

  disconnect() {
    this.closedByUser = true;
    this.clearReconnectTimer();
    this.socket?.close();
    this.socket = null;
    this.setState('disconnected', 'Desconectado');
  }

  scheduleReconnect() {
    if (this.closedByUser || this.reconnectTimer) return;
    const delay = Math.min(APP_CONFIG.websocketReconnectBaseMs * 2 ** this.reconnectAttempt, APP_CONFIG.websocketReconnectMaxMs);
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  handleMessage(data) {
    const payload = parseJsonMessage(data);
    this.onMessage?.(payload);
  }

  setState(state, detail) {
    this.onStateChange?.({ state, detail });
  }
}
