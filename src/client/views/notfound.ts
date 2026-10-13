import { h } from '../dom.js';
import type { View } from '../router.js';
import { button } from '../components/ui.js';

export function notFoundView(message = 'Cette page n’existe pas — ou pas encore.', back = '/'): View {
  return {
    name: '404',
    title: 'Introuvable',
    el: h('div.page.page--404', null,
      h('div.lost', null,
        h('p.lost-code', { 'aria-hidden': 'true' }, '4', h('span.lost-mark', null, h('i'), h('i')), '4'),
        h('h1', null, 'Petite ', h('em', null, 'pause'), '.'),
        h('p', null, message),
        button('Revenir', { href: back, icon: 'left' }),
      ),
    ),
  };
}
