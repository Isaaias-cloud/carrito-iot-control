export const APP_CONFIG = Object.freeze({
  apiBaseUrl: 'https://api-iot-26.duckdns.org',
  websocketUrl: 'wss://api-iot-26.duckdns.org/ws/vehiculo/1',
  vehicleId: 1,
  studentName: 'Isaaias Arrieta Prado',
  requestTimeoutMs: 10000,
  websocketReconnectBaseMs: 1000,
  websocketReconnectMaxMs: 15000,
});

export const ENDPOINTS = Object.freeze({
  health: () => '/',
  vehicle: (id) => `/vehiculos/${id}`,
  state: (id) => `/estado/vehiculo/${id}`,
  commands: (id) => `/comandos/vehiculo/${id}`,
  sendCommand: (id) => `/vehiculos/${id}/comando`,
});

export const COMMAND_NAMES = Object.freeze({
  forward: 'AVANZAR',
  left: 'GIRA_IZQUIERDA',
  reverse: 'RETROCEDER',
  right: 'GIRAR_DERECHA',
  stop: 'DETENER',
});
