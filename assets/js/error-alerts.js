/**
 * Alertas visibles y centralizadas.
 * Muestra el motivo real del fallo (incluido el `detail` del backend) en un
 * banner fijo con role="alert", ademas de los toasts existentes.
 */

const ALERT_ID = 'global-alert';
let lastAt = 0;

const STATUS_TEXT = Object.freeze({
  400: 'La API rechazó la solicitud.',
  401: 'La sesión expiró o no es válida.',
  403: 'No tienes permiso para esta operación.',
  404: 'El recurso solicitado no existe.',
  409: 'Conflicto con el estado actual del recurso.',
  422: 'Los datos enviados no cumplen el contrato de la API.',
  429: 'Demasiados intentos. Espera antes de volver a intentarlo.',
  500: 'Error interno del servidor.',
  503: 'Servicio no disponible. Revisa la conexión con la base de datos.',
});

const WS_TEXT = Object.freeze({
  4401: 'El WebSocket requiere un token válido.',
  4403: 'Permiso revocado o expirado en el WebSocket.',
});

function detailText(details) {
  if (details === null || details === undefined) return '';
  if (typeof details === 'string') return details.trim();
  if (Array.isArray(details)) {
    return details.map((item) => item?.msg ?? item?.message ?? String(item)).join('; ');
  }
  if (typeof details === 'object') {
    if (details.detail !== undefined) return detailText(details.detail);
    if (details.message !== undefined) return String(details.message);
    try { return JSON.stringify(details); } catch { return ''; }
  }
  return String(details);
}

export function formatWsClose(code) {
  const numeric = Number(code);
  return WS_TEXT[numeric] || `La conexión WSS se cerró (código ${numeric || 'desconocido'}).`;
}

export function formatError(error, context = '') {
  if (error === null || error === undefined) return 'Error desconocido.';
  if (typeof error === 'string') return error;
  if (typeof error === 'number') return formatWsClose(error);

  const status = Number(error.status) || 0;
  const raw = String(error.message || '').trim();
  const detail = detailText(error.details ?? error.detail);

  let text;
  if (status) {
    const base = STATUS_TEXT[status] || `La API respondió con HTTP ${status}.`;
    text = detail ? `${base} Detalle: ${detail}` : `${base}${raw ? ` ${raw}` : ''}`;
  } else if (error.cause?.name === 'AbortError' || /tard|timeout/i.test(raw)) {
    text = 'La solicitud tardó demasiado o se canceló. Revisa tu conexión.';
  } else {
    text = raw || 'No se pudo conectar con el servidor.';
  }
  return context ? `${context}: ${text}` : text;
}

export function recentlyShown(windowMs = 1200) {
  return typeof performance !== 'undefined' && performance.now() - lastAt < windowMs;
}

export function showAlert(message, type = 'error', { mirror = false } = {}) {
  const text = String(message ?? '').trim();
  if (!text) return;
  if (mirror && recentlyShown()) return;

  const root = document.getElementById(ALERT_ID);
  if (!root) return;

  lastAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  root.replaceChildren();
  root.className = `global-alert global-alert--${type}`;
  root.hidden = false;

  const icon = document.createElement('span');
  icon.className = 'global-alert__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = type === 'error' ? '⚠' : 'ℹ';

  const body = document.createElement('span');
  body.className = 'global-alert__text';
  body.textContent = text;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'global-alert__close';
  close.setAttribute('aria-label', 'Cerrar aviso');
  close.textContent = '×';
  close.addEventListener('click', () => {
    root.hidden = true;
    root.replaceChildren();
  });

  root.append(icon, body, close);

  if (type !== 'error') {
    window.setTimeout(() => {
      if (body.textContent === text) {
        root.hidden = true;
        root.replaceChildren();
      }
    }, 5000);
  }
}

export function showError(error, context = '') {
  showAlert(formatError(error, context), 'error');
}
