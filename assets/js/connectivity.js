import { APP_CONFIG, ENDPOINTS } from './config.js';
import { validateHealth, validateRdsHealth } from './rest-client.js';
import { safeText } from './utils.js';

export async function checkApiHealth(api, ui, { notify = true } = {}) {
  ui.setStatus('api', { state: 'checking', label: 'API…', detail: 'Consultando GET /' });
  try {
    const health = await api.request(ENDPOINTS.health());
    if (!validateHealth(health)) throw new Error('La respuesta de health no coincide con el contrato observado.');
    ui.setStatus('api', {
      state: 'online',
      label: 'API OK',
      detail: `API ${safeText(health.version, 'sin versión')} disponible`,
    });
    return true;
  } catch (error) {
    ui.setStatus('api', { state: 'offline', label: 'API OFF', detail: error.message || 'No se pudo consultar el API.' });
    if (notify) ui.toast(error.message || 'No se pudo consultar el API.', 'error');
    return false;
  }
}

export async function checkRdsHealth(api, ui) {
  ui.updateRdsStatus('checking', 'Consultando GET /health/db…');
  try {
    const health = await api.checkRdsHealth();
    if (!validateRdsHealth(health)) throw new Error('El diagnóstico RDS no coincide con el contrato observado.');
    ui.updateRdsStatus('online', 'RDS MySQL conectado según el diagnóstico del backend.');
    return true;
  } catch (error) {
    ui.updateRdsStatus('offline', error?.message || 'No se pudo verificar RDS.');
    return false;
  }
}

export function startConnectivityMonitor({ api, ui, intervalMs = APP_CONFIG.connectivityCheckIntervalMs } = {}) {
  let stopped = false;
  let timerId = null;

  const check = async () => {
    if (stopped) return;
    await Promise.allSettled([
      checkApiHealth(api, ui, { notify: false }),
      checkRdsHealth(api, ui),
    ]);
  };

  timerId = window.setInterval(check, intervalMs);
  return () => {
    stopped = true;
    if (timerId) window.clearInterval(timerId);
  };
}
