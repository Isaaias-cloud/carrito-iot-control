import { formatCommandLabel, isRecord } from './utils.js';

const MAX_HISTORY_ROWS = 10;

function timestampValue(value) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function validateHistoryList(payload, vehicleId) {
  if (!Array.isArray(payload)) throw new Error('El historial remoto no es una lista.');

  return payload.map((item) => {
    if (!isRecord(item)) throw new Error('El historial contiene un registro inválido.');
    if (Number(item.id_vehiculo) !== Number(vehicleId)) throw new Error('El historial contiene otro vehículo.');
    if (!Number.isInteger(Number(item.id_historial)) || Number(item.id_historial) <= 0) {
      throw new Error('El historial contiene un ID persistente inválido.');
    }
    if (typeof item.comando !== 'string' || !item.comando.trim()) {
      throw new Error('El historial contiene un movimiento sin nombre.');
    }
    if (typeof item.fecha_hora !== 'string' || !item.fecha_hora.trim()) {
      throw new Error('El historial contiene un movimiento sin fecha_hora.');
    }
    return {
      id_historial: Number(item.id_historial),
      id_vehiculo: Number(item.id_vehiculo),
      comando: formatCommandLabel(item.comando),
      codigo: item.codigo ?? null,
      id_comando: item.id_comando ?? null,
      fecha_hora: item.fecha_hora,
      origen: typeof item.origen === 'string' ? item.origen : null,
    };
  });
}

export function latestHistoryRows(records, limit = MAX_HISTORY_ROWS) {
  const unique = new Map();
  for (const record of records) {
    if (!unique.has(record.id_historial)) unique.set(record.id_historial, record);
  }
  return [...unique.values()]
    .sort((left, right) => {
      const idDifference = right.id_historial - left.id_historial;
      return idDifference || timestampValue(right.fecha_hora) - timestampValue(left.fecha_hora);
    })
    .slice(0, Math.min(MAX_HISTORY_ROWS, Math.max(0, limit)));
}

