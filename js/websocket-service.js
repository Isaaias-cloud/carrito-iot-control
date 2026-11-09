import { APP_CONFIG } from './config.js';
import { parseJsonMessage } from './utils.js';

export class VehicleWebSocket {
  constructor({ url, onStateChange, onMessage, onError } = {}) {
    this.url = url;
    this.onStateChange = onStateChange;
    this.onMessage = onMessage;
    this.onError = onError;
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
      this.socket = new WebSocket(this.url);
      this.socket.addEventListener('open', () => {
        this.reconnectAttempt = 0;
        this.setState('online', 'En línea');
      });
      this.socket.addEventListener('message', (event) => this.handleMessage(event.data));
      this.socket.addEventListener('error', (event) => {
        this.onError?.(event);
        this.setState('disconnected', 'Error de conexión');
      });
      this.socket.addEventListener('close', () => {
        this.socket = null;
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
