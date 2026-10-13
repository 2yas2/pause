/** Mini-outil de création de DOM, sans framework. */

export type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown>;

/**
 * h('div.card.is-new', { onclick, 'data-id': 3 }, 'texte', autreNoeud)
 * Les attributs `html` injectent du HTML de confiance (icônes SVG internes).
 */
export function h<T extends HTMLElement = HTMLElement>(selector: string, attrs?: Attrs | null, ...children: Child[]): T {
  const [tag, ...classes] = selector.split('.');
  const el = document.createElement(tag || 'div') as T;
  if (classes.length) el.className = classes.join(' ');

  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') el.className = [el.className, value].filter(Boolean).join(' ');
      else if (key === 'html') el.innerHTML = String(value);
      else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
      else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (key.startsWith('--')) el.style.setProperty(key, String(value));
      else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

/** Élément SVG depuis la bibliothèque d'icônes. */
export const icon = (name: keyof typeof ICONS, cls = ''): HTMLElement =>
  h('span.icon' + (cls ? '.' + cls : ''), { html: ICONS[name], 'aria-hidden': 'true' });

const svg = (body: string, fill = false) =>
  `<svg viewBox="0 0 24 24" ${fill ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'}>${body}</svg>`;

export const ICONS = {
  play: svg('<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.4-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/>', true),
  pause: svg('<rect x="6" y="4" width="4.2" height="16" rx="1.2"/><rect x="13.8" y="4" width="4.2" height="16" rx="1.2"/>', true),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  left: svg('<path d="m15 18-6-6 6-6"/>'),
  right: svg('<path d="m9 18 6-6-6-6"/>'),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  star: svg('<path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/>', true),
  volume: svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>'),
  volumeLow: svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6"/>'),
  mute: svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>'),
  expand: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  shrink: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  pip: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1" fill="currentColor"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  back10: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><text x="12" y="15.5" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-family="Inter Tight,sans-serif" font-weight="600">10</text>'),
  fwd10: svg('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/><text x="12" y="15.5" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-family="Inter Tight,sans-serif" font-weight="600">10</text>'),
  next: svg('<path d="M5 4.5v15l11-7.5z" fill="currentColor"/><path d="M19 5v14"/>'),
  prev: svg('<path d="M19 4.5v15L8 12z" fill="currentColor"/><path d="M5 5v14"/>'),
  skip: svg('<path d="m5 5 7 7-7 7M13 5l7 7-7 7"/>'),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  film: svg('<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4"/>'),
  sparkle: svg('<path d="M12 3c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7z"/>', true),
  bookmark: svg('<path d="M6 3h12v18l-6-4-6 4z"/>'),
  bookmarkFill: svg('<path d="M6 3h12v18l-6-4-6 4z"/>', true),
  folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  terminal: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>'),
  signal: svg('<path d="M2 12h3l3-8 4 16 3-8h7"/>'),
  sort: svg('<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>'),
  eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  external: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  refresh: svg('<path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4"/>'),
} as const;

export type IconName = keyof typeof ICONS;

/** Rend la page plus réactive : debounce simple. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: number | undefined;
  return (...args: A) => {
    clearTimeout(t);
    t = window.setTimeout(() => fn(...args), ms);
  };
}
