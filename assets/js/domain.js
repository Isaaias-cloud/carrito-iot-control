import { COMMAND_NAMES } from './config.js';
import { assertPositiveInteger, isRecord, normalizeName } from './utils.js';

export const JOYSTICK_COMMAND_ALIASES = Object.freeze({
  left: Object.freeze({
    up: ['AVANZAR'],
    down: ['RETROCEDER'],
    left: ['IZQUIERDA', 'GIRA_IZQUIERDA', 'GIRAR_IZQUIERDA'],
    right: ['DERECHA', 'GIRAR_DERECHA', 'GIRA_DERECHA'],
  }),
  right: Object.freeze({
    up: ['SUBIR_PALA', 'PALA_ARRIBA', 'MIRAR_ARRIBA'],
    down: ['BAJAR_PALA', 'PALA_ABAJO', 'MIRAR_ABAJO'],
    left: ['GIRAR_PALA_IZQ', 'GIRAR_PALA_IZQUIERDA', 'VOLTEAR_PALA_IZQUIERDA'],
    right: ['GIRAR_PALA_DER', 'GIRAR_PALA_DERECHA', 'VOLTEAR_PALA_DERECHA'],
  }),
});

export const CENTER_ACTION_ALIASES = Object.freeze({
  sound: ['RUIDO', 'CLAXON', 'ACTIVAR_RUIDO'],
  speed: ['VELOCIDAD', 'CAMBIAR_VELOCIDAD'],
  light: ['LUZ', 'ACTIVAR_LUZ', 'ENCENDER_LUZ'],
  off: ['APAGAR'],
});

export function validateCommand(command, vehicleId) {
  if (!isRecord(command)) throw new Error('El comando remoto no tiene un formato válido.');
  assertPositiveInteger(command.id_comando, 'El ID del comando');
  if (command.id_vehiculo !== undefined && command.id_vehiculo !== null && Number(command.id_vehiculo) !== Number(vehicleId)) {
    throw new Error('El comando pertenece a otro vehículo.');
  }
  if (typeof command.nombre !== 'string' || !command.nombre.trim()) throw new Error('El comando no tiene nombre.');
  if (command.activo !== undefined && command.activo !== true) throw new Error('El comando está inactivo.');
  return command;
}

export function indexActiveCommands(payload, vehicleId) {
  if (!Array.isArray(payload)) throw new Error('El catálogo de comandos no es una lista.');
  const byName = new Map();
  const byId = new Map();
  for (const item of payload) {
    const command = validateCommand(item, vehicleId);
    if (command.activo === false) continue;
    byName.set(normalizeName(command.nombre), command);
    byId.set(Number(command.id_comando), command);
  }
  return { byName, byId, all: [...byId.values()] };
}

export function findCommandByAliases(index, aliases) {
  const normalizedAliases = aliases.map(normalizeName);
  for (const alias of normalizedAliases) {
    const exact = index.byName.get(alias);
    if (exact) return exact;
  }
  return index.all.find((command) => {
    const name = normalizeName(command.nombre);
    return normalizedAliases.some((alias) => name.includes(alias));
  }) ?? null;
}

export function commandForJoystickDirection(index, joystick, direction) {
  const aliases = JOYSTICK_COMMAND_ALIASES[joystick]?.[direction];
  return aliases ? findCommandByAliases(index, aliases) : null;
}

export function commandForCenterAction(index, action) {
  const aliases = CENTER_ACTION_ALIASES[action];
  return aliases ? findCommandByAliases(index, aliases) : null;
}

export function getStopCommand(index) {
  return findCommandByAliases(index, [COMMAND_NAMES.stop]);
}

export function commandPayload(command, connected, origin = 'MANUAL') {
  return { id_comando: Number(command.id_comando), conectado: Boolean(connected), origen: origin };
}

export function validateDemoPayload(demoId, vehicleId) {
  const normalizedDemoId = Number(demoId);
  const normalizedVehicleId = Number(vehicleId);
  assertPositiveInteger(normalizedDemoId, 'El ID de la DEMO');
  assertPositiveInteger(normalizedVehicleId, 'El ID del vehículo');
  return { id_demo: normalizedDemoId, id_vehiculo: normalizedVehicleId };
}
