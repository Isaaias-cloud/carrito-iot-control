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

export function formatDate(value) {
  if (!value) return 'Sin marca temporal';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return safeText(value);
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(parsed);
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
