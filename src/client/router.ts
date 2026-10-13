/** Routeur d'application (History API), avec transitions de vue. */

export interface RouteContext {
  params: Record<string, string>;
  query: URLSearchParams;
  /** Enregistre une fonction de nettoyage appelée en quittant la page. */
  onLeave: (fn: () => void) => void;
}

export interface View {
  el: HTMLElement;
  title?: string;
  /** Nom de route (classe sur <body>, onglet actif). */
  name: string;
}

type Handler = (ctx: RouteContext) => Promise<View> | View;

interface Route {
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

const routes: Route[] = [];
let notFound: Handler = () => ({ el: document.createElement('div'), name: '404' });
let cleanups: Array<() => void> = [];
let navId = 0;

export function route(path: string, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp(
    '^' +
      path.replace(/\/:(\w+)/g, (_, key: string) => {
        keys.push(key);
        return '/([^/]+)';
      }) +
      '/?$',
  );
  routes.push({ pattern, keys, handler });
}

export const fallback = (handler: Handler) => (notFound = handler);

export function navigate(url: string, { replace = false } = {}) {
  if (url === location.pathname + location.search && !replace) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  history[replace ? 'replaceState' : 'pushState']({}, '', url);
  void render();
}

/** Met à jour l'URL (filtres…) sans recharger la page. */
export const setQuery = (query: URLSearchParams) => {
  const qs = query.toString();
  history.replaceState({}, '', location.pathname + (qs ? `?${qs}` : ''));
};

const progress = () => document.getElementById('route-progress');

export async function render() {
  const id = ++navId;
  const app = document.getElementById('app')!;
  const { pathname, search } = location;

  let handler = notFound;
  let params: Record<string, string> = {};
  for (const r of routes) {
    const m = r.pattern.exec(pathname);
    if (m) {
      handler = r.handler;
      params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
      break;
    }
  }

  const pending: Array<() => void> = [];
  const bar = progress();
  const barTimer = window.setTimeout(() => bar?.classList.add('is-active'), 120);

  let view: View;
  try {
    view = await handler({ params, query: new URLSearchParams(search), onLeave: (fn) => pending.push(fn) });
  } catch (err) {
    console.error(err);
    view = await notFound({ params, query: new URLSearchParams(search), onLeave: (fn) => pending.push(fn) });
  } finally {
    clearTimeout(barTimer);
    bar?.classList.remove('is-active');
  }
  if (id !== navId) {
    pending.forEach((fn) => fn());
    return; // une navigation plus récente a pris le relais
  }

  const swap = () => {
    cleanups.forEach((fn) => fn());
    cleanups = pending;
    app.replaceChildren(view.el);
    document.title = view.title ? `${view.title} — pause.` : 'pause. — Streaming';
    document.body.dataset.route = view.name;
    document.querySelectorAll<HTMLElement>('[data-nav]').forEach((a) => {
      const active = a.dataset.nav === view.name;
      a.classList.toggle('is-active', active);
      if (active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
  };

  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (doc.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) doc.startViewTransition(swap);
  else swap();
}

export function startRouter() {
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith('/api/') || /\.\w+$/.test(url.pathname)) return;
    e.preventDefault();
    navigate(url.pathname + url.search);
  });
  window.addEventListener('popstate', () => void render());
  void render();
}
