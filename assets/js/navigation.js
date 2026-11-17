export class NavigationController {
  constructor({ links, views, skipLink } = {}) {
    this.links = [...(links || [])];
    this.views = [...(views || [])];
    this.skipLink = skipLink;
    this.onHashChange = () => this.render(this.currentView());
  }

  init() {
    window.addEventListener('hashchange', this.onHashChange);
    if (!window.location.hash) window.history.replaceState(null, '', '#control');
    this.render(this.currentView(), { focus: false });
  }

  currentView() {
    const requested = window.location.hash.replace(/^#/, '');
    return this.views.some((view) => view.dataset.view === requested) ? requested : 'control';
  }

  render(activeView, { focus = true } = {}) {
    const normalizedView = this.views.some((view) => view.dataset.view === activeView) ? activeView : 'control';
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
    document.title = normalizedView === 'monitor' ? 'Monitoreo · Vehículo IoT' : 'Control · Vehículo IoT';
    const activeElement = this.views.find((view) => view.dataset.view === normalizedView);
    if (focus && activeElement) activeElement.focus({ preventScroll: true });
  }
}
