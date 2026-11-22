export class NavigationController {
  constructor({ links, views, skipLink } = {}) {
    this.links = [...(links || [])];
    this.views = [...(views || [])];
    this.skipLink = skipLink;
    this.allowedViews = null;
    this.onHashChange = () => this.render(this.currentView());
  }

  setAllowedViews(views) {
    this.allowedViews = new Set(views || []);
    this.render(this.currentView(), { focus: false });
  }

  init() {
    window.addEventListener('hashchange', this.onHashChange);
    if (!window.location.hash) window.history.replaceState(null, '', '#control');
    this.render(this.currentView(), { focus: false });
  }

  currentView() {
    const requested = window.location.hash.replace(/^#/, '');
    return this.canView(requested) ? requested : 'control';
  }

  canView(viewName) {
    return this.views.some((view) => view.dataset.view === viewName)
      && (!this.allowedViews || this.allowedViews.has(viewName));
  }

  render(activeView, { focus = true } = {}) {
    const normalizedView = this.canView(activeView) ? activeView : 'control';
    this.views.forEach((view) => {
      const isActive = view.dataset.view === normalizedView;
      view.hidden = !isActive;
      view.setAttribute('aria-hidden', String(!isActive));
    });
    this.links.forEach((link) => {
      const isActive = link.dataset.viewLink === normalizedView;
      link.classList.toggle('is-active', isActive);
      if (isActive) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    if (this.skipLink) this.skipLink.href = normalizedView === 'monitor' ? '#monitor-view' : '#main-content';
    document.title = normalizedView === 'monitor'
      ? 'Monitoreo · Vehículo IoT'
      : normalizedView === 'admin' ? 'Administración · Vehículo IoT' : 'Control · Vehículo IoT';
    const activeElement = this.views.find((view) => view.dataset.view === normalizedView);
    if (focus && activeElement) activeElement.focus({ preventScroll: true });
  }
}
