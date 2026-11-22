import { VehicleWebSocket } from './websocket-service.js';

export class VehicleSession {
  constructor({ url, onAuthFailure } = {}) {
    this.socket = new VehicleWebSocket({
      url,
      onAuthFailure,
      onStateChange: (state) => this.stateListeners.forEach((listener) => listener(state)),
      onMessage: (message) => this.messageListeners.forEach((listener) => listener(message)),
      onError: (error) => this.errorListeners.forEach((listener) => listener(error)),
    });
    this.stateListeners = new Set();
    this.messageListeners = new Set();
    this.errorListeners = new Set();
    this.started = false;
  }

  subscribe({ onStateChange, onMessage, onError } = {}) {
    if (onStateChange) this.stateListeners.add(onStateChange);
    if (onMessage) this.messageListeners.add(onMessage);
    if (onError) this.errorListeners.add(onError);
    return () => {
      if (onStateChange) this.stateListeners.delete(onStateChange);
      if (onMessage) this.messageListeners.delete(onMessage);
      if (onError) this.errorListeners.delete(onError);
    };
  }

  connect() {
    if (this.started) return;
    this.started = true;
    this.socket.connect();
  }

  disconnect() {
    this.started = false;
    this.socket.disconnect();
  }
}
