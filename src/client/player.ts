import { h, icon, type IconName } from './dom.js';
import { clock } from './format.js';
import { fallbackArt, imgUrl } from './media.js';
import { settings, updateSettings } from './store.js';

/**
 * Lecteur vidéo sur mesure : contrôles, raccourcis clavier, reprise,
 * vitesse, image dans l'image, plein écran, épisode suivant automatique.
 * Lit les MP4/WebM nativement et les flux HLS (.m3u8) via hls.js si nécessaire.
 */

export interface PlayerOptions {
  src: string | null;
  poster: string | null;
  seed: string;
  title: string;
  subtitle: string;
  file: string;
  startAt?: number;
  next?: { href: string; label: string; art: string | null } | null;
  onProgress?: (t: number, d: number) => void;
  onNext?: () => void;
}

export interface Player {
  el: HTMLElement;
  destroy: () => void;
}

const HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface HlsInstance {
  loadSource(src: string): void;
  attachMedia(video: HTMLVideoElement): void;
  destroy(): void;
  on(event: string, cb: (e: unknown, data: { fatal?: boolean }) => void): void;
}
interface HlsStatic {
  new (): HlsInstance;
  isSupported(): boolean;
  Events: { ERROR: string };
}

let hlsLoader: Promise<HlsStatic | null> | null = null;
function loadHls(): Promise<HlsStatic | null> {
  hlsLoader ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = HLS_CDN;
    s.async = true;
    s.onload = () => resolve((window as unknown as { Hls?: HlsStatic }).Hls ?? null);
    s.onerror = () => resolve(null);
    document.head.append(s);
  });
  return hlsLoader;
}

export function createPlayer(opts: PlayerOptions): Player {
  const cfg = settings();
  const video = h<HTMLVideoElement>('video.player-video', { playsinline: true, preload: 'metadata' });
  video.volume = cfg.volume;
  video.muted = cfg.muted;
  const posterSrc = imgUrl(opts.poster);
  let hls: HlsInstance | null = null;
  let hideTimer: number | undefined;
  let saveTimer = 0;
  let countdown: number | undefined;

  const ctrl = (name: IconName, label: string, onclick: () => void, cls = '') =>
    h<HTMLButtonElement>('button.pbtn' + (cls ? '.' + cls : ''), { type: 'button', 'aria-label': label, title: label, onclick }, icon(name));

  /* ----- Éléments ----- */
  const playBtn = ctrl('play', 'Lecture (k)', () => toggle());
  const muteBtn = ctrl('volume', 'Muet (m)', () => {
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) video.volume = 0.6;
  });
  const volume = h<HTMLInputElement>('input.player-volume', { type: 'range', min: '0', max: '1', step: '0.02', 'aria-label': 'Volume' });
  volume.addEventListener('input', () => {
    video.volume = Number(volume.value);
    video.muted = video.volume === 0;
  });
  const time = h('span.player-time.mono', null, '0:00 / 0:00');
  const fsBtn = ctrl('expand', 'Plein écran (f)', () => toggleFullscreen());
  const pipBtn = 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled ? ctrl('pip', 'Image dans l’image', () => togglePip()) : null;

  const speedLabel = h('span.player-speed-label.mono', null, `${cfg.speed}×`);
  const speedMenu = h('div.player-menu', { role: 'menu', hidden: true },
    h('p.player-menu-title', null, 'Vitesse'),
    SPEEDS.map((s) =>
      h('button.player-menu-item', { type: 'button', role: 'menuitemradio', 'data-speed': s, onclick: () => setSpeed(s) }, s === 1 ? 'Normale' : `${s}×`),
    ),
    h('label.player-menu-toggle', null,
      h('input', { type: 'checkbox', checked: cfg.autoplay, onchange: (e: Event) => updateSettings({ autoplay: (e.target as HTMLInputElement).checked }) }),
      h('span', null, 'Lecture auto de l’épisode suivant'),
    ),
  );
  const speedBtn = h('button.pbtn.pbtn--text', { type: 'button', 'aria-label': 'Réglages', 'aria-haspopup': 'menu', onclick: (e: MouseEvent) => {
    e.stopPropagation();
    speedMenu.hidden = !speedMenu.hidden;
  } }, icon('gear'), speedLabel);

  const nextBtn = opts.next ? ctrl('next', `Épisode suivant (n)`, () => opts.onNext?.()) : null;

  const buffered = h('div.tl-buffered');
  const played = h('div.tl-played');
  const thumb = h('div.tl-thumb');
  const hoverTime = h('div.tl-hover.mono');
  const timeline = h('div.player-timeline', { role: 'slider', tabindex: '0', 'aria-label': 'Progression', 'aria-valuemin': '0' },
    h('div.tl-rail', null, buffered, played),
    thumb,
    hoverTime,
  );

  const flash = h('div.player-flash', { 'aria-hidden': 'true' });
  const skipBtn = h('button.player-skip', { type: 'button', hidden: true, onclick: () => seek(video.currentTime + 85) }, icon('skip'), 'Passer l’intro');
  const resumeChip = h('div.player-resume', { hidden: true });
  const nextOverlay = h('div.player-next', { hidden: true });

  const big = h('button.player-big', { type: 'button', 'aria-label': 'Lecture', onclick: () => toggle() }, icon('play'));

  const el = h('div.player', { tabindex: '0', 'data-state': 'idle', 'aria-label': `Lecteur — ${opts.title}` },
    video,
    h('div.player-poster', { style: { background: fallbackArt(opts.seed) } }, posterSrc ? h('img', { src: posterSrc, alt: '' }) : null),
    h('div.player-spinner', { 'aria-hidden': 'true' }),
    big,
    flash,
    h('div.player-top', null, h('strong', null, opts.title), h('span', null, opts.subtitle)),
    skipBtn,
    resumeChip,
    nextOverlay,
    h('div.player-controls', null,
      timeline,
      h('div.player-bar', null,
        h('div.player-group', null,
          playBtn,
          ctrl('back10', 'Reculer de 10 s (j)', () => seek(video.currentTime - 10)),
          ctrl('fwd10', 'Avancer de 10 s (l)', () => seek(video.currentTime + 10)),
          h('div.player-vol', null, muteBtn, volume),
          time,
        ),
        h('div.player-group', null, nextBtn, h('div.player-menu-wrap', null, speedBtn, speedMenu), pipBtn, fsBtn),
      ),
    ),
  );

  /* ----- Pas de flux : écran d'attente ----- */
  if (!opts.src) {
    el.dataset.state = 'nostream';
    el.append(
      h('div.player-placeholder', null,
        h('div.placeholder-orb', { 'aria-hidden': 'true' }, h('span'), h('span')),
        h('p.kicker', null, 'Flux en préparation'),
        h('h2', null, 'Cet épisode arrive ', h('em', null, 'très bientôt'), '.'),
        h('p', null, 'Le fichier est bien détecté, mais sa diffusion n’est pas encore branchée.'),
        h('dl.placeholder-meta.mono', null,
          h('div', null, h('dt', null, 'Fichier'), h('dd', null, opts.file || '—')),
          h('div', null, h('dt', null, 'À compléter'), h('dd', null, 'src/server/stream.ts → resolveStreamUrl()')),
        ),
      ),
    );
    return { el, destroy: () => undefined };
  }

  /* ----- Source ----- */
  const attach = async (src: string) => {
    const isHls = /\.m3u8(\?|$)/i.test(src);
    if (isHls && !video.canPlayType('application/vnd.apple.mpegurl')) {
      const Hls = await loadHls();
      if (Hls?.isSupported()) {
        hls = new Hls();
        hls.on(Hls.Events.ERROR, (_e, data) => data.fatal && fail());
        hls.loadSource(src);
        hls.attachMedia(video);
        return;
      }
    }
    video.src = src;
  };
  const fail = () => {
    el.dataset.state = 'error';
    if (!el.querySelector('.player-error')) {
      el.append(h('div.player-error', null, icon('signal'), h('strong', null, 'Lecture impossible'), h('span', null, 'Le flux ne répond pas ou son format n’est pas pris en charge.')));
    }
  };
  video.addEventListener('error', fail);
  void attach(opts.src);

  /* ----- Actions ----- */
  function toggle() {
    if (video.paused || video.ended) void video.play().catch(() => undefined);
    else video.pause();
  }
  function seek(t: number) {
    if (!Number.isFinite(video.duration)) return;
    const target = Math.max(0, Math.min(video.duration - 0.5, t));
    const delta = target - video.currentTime;
    video.currentTime = target;
    if (Math.abs(delta) >= 1) showFlash(delta > 0 ? 'fwd10' : 'back10', `${delta > 0 ? '+' : '−'}${Math.round(Math.abs(delta))} s`);
  }
  function setSpeed(s: number) {
    video.playbackRate = s;
    speedLabel.textContent = `${s}×`;
    updateSettings({ speed: s });
    speedMenu.querySelectorAll<HTMLElement>('[data-speed]').forEach((b) => b.classList.toggle('is-active', Number(b.dataset.speed) === s));
    speedMenu.hidden = true;
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => undefined);
  }
  async function togglePip() {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      /* non pris en charge */
    }
  }
  function showFlash(name: IconName, label: string) {
    flash.replaceChildren(icon(name), h('span', null, label));
    flash.classList.remove('is-on');
    void flash.offsetWidth;
    flash.classList.add('is-on');
  }
  const wake = () => {
    el.classList.remove('is-idle');
    clearTimeout(hideTimer);
    if (!video.paused) hideTimer = window.setTimeout(() => speedMenu.hidden && el.classList.add('is-idle'), 2600);
  };

  /* ----- Évènements vidéo ----- */
  const paintVolume = () => {
    const v = video.muted ? 0 : video.volume;
    volume.value = String(v);
    volume.style.setProperty('--v', String(v));
    muteBtn.replaceChildren(icon(v === 0 ? 'mute' : v < 0.5 ? 'volumeLow' : 'volume'));
    updateSettings({ volume: video.volume, muted: video.muted });
  };
  const paintTime = () => {
    const d = video.duration || 0;
    const t = video.currentTime || 0;
    played.style.width = d ? `${(t / d) * 100}%` : '0';
    thumb.style.left = d ? `${(t / d) * 100}%` : '0';
    time.textContent = `${clock(t)} / ${clock(d)}`;
    timeline.setAttribute('aria-valuenow', String(Math.round(t)));
    timeline.setAttribute('aria-valuemax', String(Math.round(d)));
    timeline.setAttribute('aria-valuetext', `${clock(t)} sur ${clock(d)}`);
    skipBtn.hidden = !(t > 3 && t < 150 && d > 600);
  };

  video.addEventListener('play', () => {
    el.dataset.state = 'playing';
    playBtn.replaceChildren(icon('pause'));
    big.replaceChildren(icon('pause'));
    el.classList.add('has-started');
    nextOverlay.hidden = true;
    clearInterval(countdown);
    wake();
  });
  video.addEventListener('pause', () => {
    if (el.dataset.state !== 'error') el.dataset.state = 'paused';
    playBtn.replaceChildren(icon('play'));
    big.replaceChildren(icon('play'));
    el.classList.remove('is-idle');
    save();
  });
  video.addEventListener('waiting', () => el.classList.add('is-loading'));
  video.addEventListener('playing', () => el.classList.remove('is-loading'));
  video.addEventListener('canplay', () => el.classList.remove('is-loading'));
  video.addEventListener('volumechange', paintVolume);
  video.addEventListener('timeupdate', () => {
    paintTime();
    if (Date.now() - saveTimer > 5000) save();
  });
  video.addEventListener('progress', () => {
    const d = video.duration;
    if (!d || !video.buffered.length) return;
    buffered.style.width = `${(video.buffered.end(video.buffered.length - 1) / d) * 100}%`;
  });
  video.addEventListener('loadedmetadata', () => {
    video.playbackRate = cfg.speed;
    paintTime();
    const start = opts.startAt ?? 0;
    if (start > 5 && start < video.duration - 15) {
      video.currentTime = start;
      resumeChip.hidden = false;
      resumeChip.replaceChildren(
        h('span', null, `Reprise à ${clock(start)}`),
        h('button', { type: 'button', onclick: () => {
          video.currentTime = 0;
          resumeChip.hidden = true;
        } }, 'Recommencer'),
      );
      window.setTimeout(() => (resumeChip.hidden = true), 6000);
    }
  });
  video.addEventListener('ended', () => {
    save();
    if (!opts.next) return;
    let left = 8;
    const autoplay = settings().autoplay;
    const label = h('span.mono', null, autoplay ? `dans ${left} s` : '');
    nextOverlay.hidden = false;
    nextOverlay.replaceChildren(
      h('a.player-next-card', { href: opts.next.href },
        h('span.player-next-art', { style: { background: fallbackArt(opts.seed + 'n') } }, opts.next.art ? h('img', { src: imgUrl(opts.next.art), alt: '' }) : null, h('i.player-next-ring')),
        h('span.player-next-text', null, h('small', null, 'À suivre'), h('strong', null, opts.next.label), label),
      ),
      h('button.btn.btn--glass', { type: 'button', onclick: () => {
        clearInterval(countdown);
        nextOverlay.hidden = true;
      } }, 'Annuler'),
    );
    if (autoplay) {
      nextOverlay.classList.add('is-counting');
      countdown = window.setInterval(() => {
        left--;
        label.textContent = `dans ${left} s`;
        if (left <= 0) {
          clearInterval(countdown);
          opts.onNext?.();
        }
      }, 1000);
    }
  });

  const save = () => {
    saveTimer = Date.now();
    if (video.duration && video.currentTime > 0) opts.onProgress?.(video.currentTime, video.duration);
  };

  /* ----- Barre de progression ----- */
  const ratioAt = (e: PointerEvent) => {
    const r = timeline.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  let dragging = false;
  timeline.addEventListener('pointerdown', (e) => {
    dragging = true;
    timeline.setPointerCapture(e.pointerId);
    el.classList.add('is-scrubbing');
    video.currentTime = ratioAt(e) * (video.duration || 0);
  });
  timeline.addEventListener('pointermove', (e) => {
    const x = ratioAt(e);
    hoverTime.textContent = clock(x * (video.duration || 0));
    hoverTime.style.left = `${x * 100}%`;
    if (dragging) video.currentTime = x * (video.duration || 0);
  });
  timeline.addEventListener('pointerup', () => {
    dragging = false;
    el.classList.remove('is-scrubbing');
  });
  timeline.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') seek(video.currentTime + 5);
    else if (e.key === 'ArrowLeft') seek(video.currentTime - 5);
    else return;
    e.preventDefault();
    e.stopPropagation();
  });

  /* ----- Interactions générales ----- */
  video.addEventListener('click', () => toggle());
  video.addEventListener('dblclick', () => toggleFullscreen());
  el.addEventListener('pointermove', wake);
  el.addEventListener('pointerleave', () => !video.paused && el.classList.add('is-idle'));
  document.addEventListener('click', closeMenu);
  function closeMenu(e: MouseEvent) {
    if (!speedMenu.hidden && !speedMenu.contains(e.target as Node)) speedMenu.hidden = true;
  }
  const onFs = () => {
    el.classList.toggle('is-fullscreen', document.fullscreenElement === el);
    fsBtn.replaceChildren(icon(document.fullscreenElement === el ? 'shrink' : 'expand'));
  };
  document.addEventListener('fullscreenchange', onFs);

  const onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.matches('input:not([type=range]), textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('.search-overlay, .modal')) return;
    const k = e.key.toLowerCase();
    const actions: Record<string, () => void> = {
      ' ': toggle,
      k: toggle,
      arrowright: () => seek(video.currentTime + 5),
      arrowleft: () => seek(video.currentTime - 5),
      l: () => seek(video.currentTime + 10),
      j: () => seek(video.currentTime - 10),
      arrowup: () => {
        video.muted = false;
        video.volume = Math.min(1, video.volume + 0.05);
        showFlash('volume', `${Math.round(video.volume * 100)} %`);
      },
      arrowdown: () => {
        video.volume = Math.max(0, video.volume - 0.05);
        showFlash(video.volume === 0 ? 'mute' : 'volumeLow', `${Math.round(video.volume * 100)} %`);
      },
      m: () => (video.muted = !video.muted),
      f: toggleFullscreen,
      n: () => opts.next && opts.onNext?.(),
    };
    const fn = actions[k] ?? (/^[0-9]$/.test(k) ? () => seek((Number(k) / 10) * video.duration) : undefined);
    if (!fn) return;
    if (k === ' ' && target.matches('button, a')) return;
    e.preventDefault();
    fn();
    wake();
  };
  document.addEventListener('keydown', onKey);

  setSpeed(cfg.speed);
  speedMenu.hidden = true;
  paintVolume();

  return {
    el,
    destroy: () => {
      save();
      clearTimeout(hideTimer);
      clearInterval(countdown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('fullscreenchange', onFs);
      hls?.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
    },
  };
}
