import { APP_CONFIG } from './config.js';

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function assertPositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${label} no es válido.`);
  }
  return number;
}

export function safeText(value, fallback = '—') {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

export function formatCommandLabel(name, fallback = '') {
  return safeText(name, fallback)
    .replace(/\_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasExplicitTimeZone(value) {
  return typeof value === 'string' && /(Z|[+-]\d{2}:?\d{2})$/i.test(value);
}

function rawDateParts(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return {
    date: `${match[3]}/${match[2]}/${match[1]}`,
    time: `${match[4]}:${match[5]}:${match[6] || '00'}`,
  };
}

export function formatDate(value) {
  if (!value) return 'Sin marca temporal';
  if (!hasExplicitTimeZone(value)) {
    const raw = rawDateParts(value);
    if (raw) return `${raw.date}, ${raw.time}`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return safeText(value);
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: APP_CONFIG.displayTimeZone,
  }).format(parsed);
}

export function formatDateParts(value) {
  if (!value) return { date: 'Sin fecha', time: 'Sin hora' };
  if (!hasExplicitTimeZone(value)) {
    const raw = rawDateParts(value);
    if (raw) return raw;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: 'Fecha no válida', time: safeText(value) };
  const formatter = new Intl.DateTimeFormat('es-MX', {
    timeZone: APP_CONFIG.displayTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const values = Object.fromEntries(formatter.formatToParts(parsed).map(({ type, value: part }) => [type, part]));
  return {
    date: `${values.day}/${values.month}/${values.year}`,
    time: `${values.hour}:${values.minute}:${values.second}`,
  };
}

export function normalizeName(value) {
  return String(value ?? '').trim().toUpperCase();
}

export function parseJsonMessage(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
}

export function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
