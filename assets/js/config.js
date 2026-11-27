const isLocalHost = typeof globalThis.location !== 'undefined'
  && ['localhost', '127.0.0.1'].includes(globalThis.location.hostname);
const forcedEnvironment = typeof globalThis.location !== 'undefined'
  ? new URLSearchParams(globalThis.location.search).get('env')
  : null;
const isLocal = forcedEnvironment === 'local' || (forcedEnvironment !== 'production' && isLocalHost);

const ENVIRONMENTS = Object.freeze({
  local: Object.freeze({
    apiBaseUrl: 'http://127.0.0.1:8000',
    websocketBaseUrl: 'ws://127.0.0.1:8000',
  }),
  production: Object.freeze({
    apiBaseUrl: 'https://api-iot-26.duckdns.org',
    websocketBaseUrl: 'wss://api-iot-26.duckdns.org',
  }),
});

const environment = isLocal ? ENVIRONMENTS.local : ENVIRONMENTS.production;

export const APP_CONFIG = Object.freeze({
  environment: isLocal ? 'local' : 'production',
  apiBaseUrl: environment.apiBaseUrl,
  websocketBaseUrl: environment.websocketBaseUrl,
  studentName: 'Isaaias Arrieta Prado',
  displayTimeZone: 'America/Mexico_City',
  requestTimeoutMs: 10000,
  historySyncDelayMs: 450,
  connectivityCheckIntervalMs: 60000,
  websocketReconnectBaseMs: 1000,
  websocketReconnectMaxMs: 15000,
  sessionStorageKey: 'iot_car_session_v1',
  authRequired: true,
});

export function websocketUrl(vehicleId, accessToken) {
  const url = new URL(`/ws/vehiculo/${encodeURIComponent(Number(vehicleId))}`, APP_CONFIG.websocketBaseUrl);
  if (accessToken) url.searchParams.set('token', accessToken);
  return url.toString();
}

export const ENDPOINTS = Object.freeze({
  login: () => '/auth/login',
  refresh: () => '/auth/refresh',
  logout: () => '/auth/logout',
  me: () => '/auth/me',
  health: () => '/',
  healthDb: () => '/health/db',
  vehicle: (id) => `/vehiculos/${id}`,
  state: (id) => `/estado/vehiculo/${id}`,
  history: (id) => `/vehiculos/${id}/historial`,
  commands: (id) => `/comandos/vehiculo/${id}`,
  sendCommand: (id) => `/vehiculos/${id}/comando`,
  movimientos: (id) => `/movimientos/vehiculo/${id}`,
  movimientoCreate: () => '/movimientos/',
  movimiento: (id) => `/movimientos/${id}`,
  movimientoEjecutar: () => '/movimientos/ejecutar',
  adminDashboard: () => '/admin/dashboard',
  adminModels: () => '/admin/modelos',
  adminModel: (id) => `/admin/modelos/${id}`,
  adminUnits: () => '/admin/unidades',
  adminUnit: (id) => `/admin/unidades/${id}`,
  adminClients: () => '/admin/clientes',
  adminClient: (id) => `/admin/clientes/${id}`,
  adminAssignments: () => '/admin/asignaciones',
  adminRevokeAssignment: (id) => `/admin/asignaciones/${id}/revocar`,
  adminAudit: () => '/admin/auditoria',
  adminModelCommand: (modelId, commandId) => `/admin/modelos/${modelId}/comandos/${commandId}`,
  adminModelCommands: (modelId) => `/admin/modelos/${modelId}/comandos`,
  myVehicles: () => '/me/vehiculos',
  supportAdmins: () => '/me/soporte/admins',
  vehicleSupport: (id) => `/me/vehiculos/${id}/soporte`,
  ownerDemos: () => '/me/demos',
  ownerDemo: (id) => `/me/demos/${id}`,
  ownerDemoMovements: (id) => `/me/demos/${id}/movimientos`,
  ownerDemoMovement: (id) => `/me/demos/movimientos/${id}`,
  guestVehicles: () => '/invitado/vehiculos',
  guestSession: () => '/invitado/sesion',
  guestFinish: () => '/invitado/sesion/finalizar',
});

export const COMMAND_NAMES = Object.freeze({
  forward: 'AVANZAR',
  left: 'GIRA_IZQUIERDA',
  reverse: 'RETROCEDER',
  right: 'GIRAR_DERECHA',
  stop: 'DETENER',
});
