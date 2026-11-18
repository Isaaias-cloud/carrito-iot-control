import { formatCommandLabel, isRecord } from './utils.js';

function validTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return Number.isNaN(new Date(value).getTime()) ? null : value;
}

export function validateVehicleState(payload, vehicleId) {
  if (!isRecord(payload) || Number(payload.id_vehiculo) !== Number(vehicleId)) {
    throw new Error('El último estado no pertenece al vehículo configurado.');
  }
  return payload;
}

export function validateVehicleEvent(payload, vehicleId) {
  if (!isRecord(payload) || Number(payload.id_vehiculo) !== Number(vehicleId)) return null;
  if (typeof payload.event !== 'string' || !payload.event.trim()) return null;
  const timestamp = validTimestamp(payload.timestamp);
  if (!timestamp) return null;
  return payload;
}

export function normalizeRestState(payload) {
  return {
    vehicleId: Number(payload.id_vehiculo),
    command: formatCommandLabel(payload.comando, '') || null,
    commandId: payload.id_comando ?? null,
    code: payload.codigo ?? null,
    timestamp: validTimestamp(payload.fecha_actualizacion) || validTimestamp(payload.fecha_hora),
    source: 'REST',
    stage: 'Estado reportado por API',
    isDemo: false,
  };
}

export function normalizeWssEvent(payload) {
  return {
    vehicleId: Number(payload.id_vehiculo),
    command: formatCommandLabel(payload.comando, '') || null,
    commandId: payload.id_comando ?? null,
    code: payload.codigo ?? null,
    timestamp: payload.timestamp,
    source: 'WSS',
    stage: 'Publicado por WSS; persistencia pendiente de confirmar por REST',
    isDemo: payload.id_demo !== undefined || payload.paso !== undefined || payload.total !== undefined,
    event: payload.event,
  };
}

export function movementMarker(movement) {
  if (!movement) return Number.NEGATIVE_INFINITY;
  const timestamp = movement.timestamp ? new Date(movement.timestamp).getTime() : Number.NEGATIVE_INFINITY;
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}
