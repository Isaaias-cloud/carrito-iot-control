import { APP_CONFIG, ENDPOINTS } from './config.js';

function safeParse(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function parseUtcDate(value) {
  if (!value) return new Date(NaN);
  if (value instanceof Date) return value;
  const raw = String(value).trim();
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  return new Date(hasTimezone ? raw : `${raw.replace(' ', 'T')}Z`);
}

export class AuthSession extends EventTarget {
  constructor({ storage = globalThis.sessionStorage } = {}) {
    super();
    this.storage = storage;
    this.tokens = null;
    this.profile = null;
  }

  restore() {
    const raw = this.storage?.getItem(APP_CONFIG.sessionStorageKey);
    const parsed = raw ? safeParse(raw) : null;
    if (!parsed?.access_token || (!parsed?.refresh_token && !parsed?.guest)) {
      this.clear({ silent: true });
      return false;
    }
    if (parsed.guest && parsed.expira_en && parseUtcDate(parsed.expira_en).getTime() <= Date.now()) {
      this.clear({ silent: true });
      return false;
    }
    this.tokens = parsed;
    return true;
  }

  getAccessToken() {
    return this.tokens?.access_token || null;
  }

  getRefreshToken() {
    return this.tokens?.refresh_token || null;
  }

  isGuest() { return Boolean(this.tokens?.guest); }
  getGuestVehicleId() { return this.tokens?.guest ? Number(this.tokens.id_vehiculo) : null; }

  isAuthenticated() {
    return Boolean(this.getAccessToken());
  }

  setTokens(tokens) {
    if (!tokens?.access_token || !tokens?.refresh_token) throw new Error('La API devolvió una sesión incompleta.');
    this.tokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type || 'bearer',
      expires_in: Number(tokens.expires_in) || 0,
    };
    this.storage?.setItem(APP_CONFIG.sessionStorageKey, JSON.stringify(this.tokens));
    this.dispatchEvent(new CustomEvent('change', { detail: this.tokens }));
  }

  setGuestSession(session) {
    if (!session?.access_token || !session?.id_vehiculo || !session?.id_sesion_invitado) throw new Error('La API devolvió una reserva de invitado incompleta.');
    this.tokens = {
      access_token: session.access_token,
      refresh_token: null,
      token_type: session.token_type || 'bearer',
      expires_in: Number(session.expires_in) || 300,
      guest: true,
      id_vehiculo: Number(session.id_vehiculo),
      id_sesion_invitado: Number(session.id_sesion_invitado),
      expira_en: session.expira_en,
    };
    this.profile = { id_usuario: null, email: '', nombre: 'Invitado', roles: ['INVITADO'], activo: true, email_verificado: false };
    this.storage?.setItem(APP_CONFIG.sessionStorageKey, JSON.stringify(this.tokens));
    this.dispatchEvent(new CustomEvent('change', { detail: this.tokens }));
  }

  setProfile(profile) {
    this.profile = profile;
    this.dispatchEvent(new CustomEvent('profile', { detail: profile }));
  }

  clear({ silent = false } = {}) {
    this.tokens = null;
    this.profile = null;
    this.storage?.removeItem(APP_CONFIG.sessionStorageKey);
    if (!silent) this.dispatchEvent(new CustomEvent('expired'));
  }

  async login(api, email, password) {
    const tokens = await api.request(ENDPOINTS.login(), {
      method: 'POST',
      body: { email, password },
      auth: false,
      retryAuth: false,
    });
    this.setTokens(tokens);
    const profile = await api.request(ENDPOINTS.me(), { auth: true, retryAuth: false });
    this.setProfile(profile);
    return profile;
  }

  async refresh(api) {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) throw new Error('No existe refresh token.');
    const tokens = await api.request(ENDPOINTS.refresh(), {
      method: 'POST',
      body: { refresh_token: refreshToken },
      auth: false,
      retryAuth: false,
    });
    this.setTokens(tokens);
    return tokens;
  }

  async logout(api) {
    try {
      if (this.isAuthenticated()) {
        await api.request(ENDPOINTS.logout(), {
          method: 'POST',
          body: { refresh_token: this.getRefreshToken() },
          auth: true,
          retryAuth: false,
        });
      }
    } finally {
      this.clear({ silent: true });
    }
  }
}
