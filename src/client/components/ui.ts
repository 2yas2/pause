import { h, icon, type Child, type IconName } from '../dom.js';
import { inMyList, toggleMyList } from '../store.js';

/** Section avec rangée défilante horizontale et flèches. */
export function row(opts: { title: string; kicker?: string; link?: { href: string; label: string }; items: HTMLElement[]; kind?: 'poster' | 'epcard' }): HTMLElement {
  const track = h('div.row-track', { role: 'list' }, opts.items.map((el) => (el.setAttribute('role', 'listitem'), el)));
  const scrollBy = (dir: number) => track.scrollBy({ left: dir * track.clientWidth * 0.85, behavior: 'smooth' });
  const prev = h<HTMLButtonElement>('button.row-arrow.row-arrow--prev', { type: 'button', 'aria-label': 'Précédent', onclick: () => scrollBy(-1) }, icon('left'));
  const next = h<HTMLButtonElement>('button.row-arrow.row-arrow--next', { type: 'button', 'aria-label': 'Suivant', onclick: () => scrollBy(1) }, icon('right'));

  const update = () => {
    const max = track.scrollWidth - track.clientWidth - 4;
    prev.disabled = track.scrollLeft <= 4;
    next.disabled = track.scrollLeft >= max;
    section.classList.toggle('has-overflow', max > 0);
  };
  track.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(update).observe(track);

  const section = h('section.row.reveal' + (opts.kind ? `.row--${opts.kind}` : ''), null,
    sectionHead(opts.title, opts.kicker, opts.link),
    h('div.row-viewport', null, prev, track, next),
  );
  return section;
}

export function sectionHead(title: string, kicker?: string, link?: { href: string; label: string }): HTMLElement {
  return h('header.section-head', null,
    h('div', null,
      kicker ? h('span.kicker', null, kicker) : null,
      h('h2', null, title),
    ),
    link ? h('a.section-link', { href: link.href }, link.label, icon('arrow')) : null,
  );
}

export function button(label: Child, opts: { icon?: IconName; variant?: 'primary' | 'glass' | 'ghost'; href?: string; onclick?: (e: MouseEvent) => void; attrs?: Record<string, unknown> } = {}) {
  const tag = opts.href ? 'a' : 'button';
  return h(`${tag}.btn.btn--${opts.variant ?? 'primary'}`, { href: opts.href, type: opts.href ? undefined : 'button', onclick: opts.onclick, ...opts.attrs },
    opts.icon ? icon(opts.icon) : null,
    h('span', null, label),
  );
}

export function chip(label: string, active: boolean, onclick: () => void): HTMLElement {
  return h('button.chip' + (active ? '.is-active' : ''), { type: 'button', 'aria-pressed': String(active), onclick }, label);
}

/* ---------- Notifications ---------- */

export function toast(opts: { title: string; body?: string; href?: string; action?: string; art?: string | null; icon?: IconName; timeout?: number }) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const close = () => {
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  };
  const el = h('div.toast', null,
    opts.art ? h('img.toast-art', { src: opts.art, alt: '' }) : h('span.toast-icon', null, icon(opts.icon ?? 'sparkle')),
    h('div.toast-body', null, h('strong', null, opts.title), opts.body ? h('span', null, opts.body) : null),
    opts.href ? h('a.toast-action', { href: opts.href, onclick: close }, opts.action ?? 'Voir') : null,
    h('button.toast-close', { type: 'button', 'aria-label': 'Fermer', onclick: close }, icon('close')),
  );
  host.append(el);
  window.setTimeout(close, opts.timeout ?? 7000);
}

/* ---------- Fenêtre modale ---------- */

export function modal(content: HTMLElement, opts: { label: string; wide?: boolean } = { label: 'Fenêtre' }) {
  const previous = document.activeElement as HTMLElement | null;
  const close = () => {
    overlay.classList.add('is-leaving');
    document.removeEventListener('keydown', onKey);
    window.setTimeout(() => {
      overlay.remove();
      previous?.focus();
    }, 220);
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
  const overlay = h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.label, onclick: (e: MouseEvent) => e.target === overlay && close() },
    h('div.modal-panel' + (opts.wide ? '.modal-panel--wide' : ''), null,
      h('button.modal-close', { type: 'button', 'aria-label': 'Fermer', onclick: close }, icon('close')),
      content,
    ),
  );
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  overlay.querySelector<HTMLElement>('button, input, a, iframe')?.focus();
  return close;
}

/** Fait apparaître les sections au défilement. */
export function observeReveal(root: HTMLElement) {
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      }),
    { rootMargin: '0px 0px -8% 0px' },
  );
  root.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}

/** Bouton « Ma liste » qui se met à jour lui-même. */
export function listButton(slug: string, compact = false): HTMLElement {
  const b = h<HTMLButtonElement>('button.btn.btn--glass.btn-list' + (compact ? '.btn--icon' : ''), { type: 'button' });
  const paint = () => {
    const on = inMyList(slug);
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? 'Retirer de ma liste' : 'Ajouter à ma liste');
    b.replaceChildren(icon(on ? 'check' : 'plus'), compact ? '' : h('span', null, on ? 'Dans ma liste' : 'Ma liste'));
  };
  b.addEventListener('click', (e) => {
    e.preventDefault();
    const on = toggleMyList(slug);
    paint();
    toast({ title: on ? 'Ajouté à votre liste' : 'Retiré de votre liste', icon: 'bookmark', timeout: 2600 });
  });
  paint();
  return b;
}
