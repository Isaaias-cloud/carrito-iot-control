import { ApiError } from './rest-client.js';

export class AuthUI {
  constructor({ session, api, onAuthenticated, onLogout, onGuest } = {}) {
    this.session = session;
    this.api = api;
    this.onAuthenticated = onAuthenticated;
    this.onLogout = onLogout;
    this.onGuest = onGuest;
    this.dialog = document.getElementById('auth-dialog');
    this.form = document.getElementById('auth-form');
    this.email = document.getElementById('auth-email');
    this.password = document.getElementById('auth-password');
    this.message = document.getElementById('auth-message');
    this.submit = document.getElementById('auth-submit');
    this.userName = document.getElementById('auth-user-name');
    this.userRole = document.getElementById('auth-user-role');
    this.logoutButton = document.getElementById('auth-logout');
    this.guestButtons = document.querySelectorAll('[data-guest-entry]');
  }

  init() {
    this.form?.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.login();
    });
    this.logoutButton?.addEventListener('click', () => { void this.logout(); });
    this.guestButtons.forEach((button) => button.addEventListener('click', () => {
      if (this.onGuest) this.onGuest();
      else this.setMessage('El acceso de invitado no está disponible.', 'info');
    }));
  }

  async restore() {
    if (!this.session.restore()) {
      this.open();
      return false;
    }
    if (this.session.isGuest()) {
      this.session.setProfile({ id_usuario: null, email: '', nombre: 'Invitado', roles: ['INVITADO'], activo: true, email_verificado: false });
      this.renderProfile(this.session.profile);
      return true;
    }
    try {
      const profile = await this.api.request('/auth/me');
      this.session.setProfile(profile);
      this.renderProfile(profile);
      return true;
    } catch {
      this.session.clear({ silent: true });
      this.open();
      return false;
    }
  }

  async login() {
    const email = this.email?.value.trim();
    const password = this.password?.value || '';
    if (!email || !password) {
      this.setMessage('Escribe correo y contraseña.', 'error');
      return;
    }
    this.setBusy(true);
    this.setMessage('Validando sesión…', 'info');
    try {
      const profile = await this.session.login(this.api, email, password);
      this.renderProfile(profile);
      this.close();
      this.onAuthenticated?.(profile);
    } catch (error) {
      this.setMessage(error instanceof ApiError ? error.message : 'No se pudo iniciar sesión.', 'error');
    } finally {
      this.setBusy(false);
    }
  }

  async logout() {
    this.setBusy(true);
    try {
      if (this.session.isGuest()) {
        try { await this.api.finishGuestSession(); } finally { this.session.clear({ silent: true }); }
      } else await this.session.logout(this.api);
    } finally {
      this.setBusy(false);
      this.onLogout?.();
    }
  }

  renderProfile(profile) {
    const roles = Array.isArray(profile?.roles) ? profile.roles : [];
    if (this.userName) this.userName.textContent = profile?.nombre || profile?.email || 'Sesión activa';
    if (this.userRole) this.userRole.textContent = roles.join(' · ') || 'SIN ROL';
    document.body.dataset.role = roles[0] || 'UNKNOWN';
    this.guestButtons.forEach((button) => { button.hidden = true; });
    document.querySelectorAll('[data-role="ADMIN"]').forEach((element) => {
      element.hidden = !roles.includes('ADMIN');
    });
    document.querySelectorAll('[data-auth-only]').forEach((element) => { element.hidden = false; });
  }

  open() {
    if (this.dialog && !this.dialog.open) this.dialog.showModal();
    document.querySelectorAll('[data-auth-only]').forEach((element) => { element.hidden = true; });
    this.email?.focus();
  }

  close() {
    if (this.dialog?.open) this.dialog.close();
  }

  setBusy(busy) {
    if (this.submit) this.submit.disabled = busy;
    if (this.email) this.email.disabled = busy;
    if (this.password) this.password.disabled = busy;
  }

  setMessage(message, type = 'info') {
    if (!this.message) return;
    this.message.textContent = message;
    this.message.dataset.state = type;
  }
}
