(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const motionOK = () => !reduced.matches;
  const hasGSAP = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  const nav = $('[data-nav]');
  let lenis = null;

  /* ---------- Smooth scroll ---------- */
  function initLenis() {
    if (!motionOK() || typeof window.Lenis === 'undefined' || !hasGSAP) return;
    lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.95 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  function scrollToTarget(target, offset = 0) {
    if (lenis) lenis.scrollTo(target, { offset, duration: 1.2 });
    else {
      const y = typeof target === 'number' ? target : target.getBoundingClientRect().top + scrollY + offset;
      scrollTo({ top: y, behavior: motionOK() ? 'smooth' : 'auto' });
    }
  }

  /* ---------- Navigation ---------- */
  const drawer = $('[data-drawer]');
  const toggle = $('[data-nav-toggle]');

  function setDrawer(open) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('.sr-only').textContent = open ? 'Close navigation' : 'Open navigation';
    drawer.hidden = !open;
    document.body.style.overflow = open ? 'hidden' : '';
    document.body.classList.toggle('drawer-open', open);
    if (lenis) open ? lenis.stop() : lenis.start();
    if (open) drawer.querySelector('a').focus();
  }

  toggle.addEventListener('click', () => setDrawer(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden) { setDrawer(false); toggle.focus(); }
  });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    const target = id === '#top' ? document.body : $(id);
    if (!target) return;
    e.preventDefault();
    if (!drawer.hidden) setDrawer(false);
    scrollToTarget(id === '#top' ? 0 : target, id === '#top' ? 0 : -8);
    history.replaceState(null, '', id);
  });

  const onScrollNav = () => nav.classList.toggle('is-scrolled', scrollY > 24);
  addEventListener('scroll', onScrollNav, { passive: true });
  onScrollNav();

  /* ---------- Hero title split: light copy only over the video ---------- */
  const heroTitle = $('[data-hero-title]');
  const heroMedia = $('[data-hero-media]');
  const lightCopy = $('[data-ttl-light]');

  const heroStage = $('[data-hero-stage]');

  function measureSplit() {
    if (!heroTitle || !heroStage || !lightCopy) return;
    const t = heroTitle.getBoundingClientRect();
    // Measure the stage, not the spinning disc: a rotating square reports a larger box.
    const d = heroStage.getBoundingClientRect();
    if (!d.width) return;
    // The stage is a circle, so the light copy is clipped to that circle.
    const r = d.width / 2;
    lightCopy.style.clipPath = `circle(${r.toFixed(1)}px at ${(d.left + r - t.left).toFixed(1)}px ${(d.top + r - t.top).toFixed(1)}px)`;
  }
  measureSplit();
  addEventListener('resize', measureSplit, { passive: true });
  document.fonts && document.fonts.ready.then(measureSplit);


  /* ---------- Scrubbed footage: scroll sets a target, the frame eases toward it ---------- */
  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

  // Seeks are coalesced: one currentTime write per frame, never while a seek is in flight,
  // and never before the metadata (duration) exists.
  function scrubber(video, { stiffness = 5, onFrame } = {}) {
    let target = 0, cur = 0, raf = 0, last = 0;
    const frame = 1 / 60;
    const ready = () => video.readyState >= 1 && isFinite(video.duration) && video.duration > 0;
    const tick = (now) => {
      const dt = Math.min(0.064, last ? (now - last) / 1000 : 0.016);
      last = now;
      cur += (target - cur) * (1 - Math.exp(-dt * stiffness));
      if (Math.abs(target - cur) < 0.0004) cur = target;
      const t = onFrame ? onFrame(cur) : null;
      let pending = false;
      if (t != null && ready()) {
        const want = clamp(t, 0, video.duration - 0.04);
        if (Math.abs(video.currentTime - want) > frame) {
          if (!video.seeking) video.currentTime = want;
          pending = true;
        }
      }
      raf = cur !== target || pending ? requestAnimationFrame(tick) : 0;
      if (!raf) last = 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const onReady = () => { video.dispatchEvent(new Event('scrubready')); kick(); };
    if (ready()) onReady(); else video.addEventListener('loadedmetadata', onReady, { once: true });
    video.addEventListener('seeked', kick);
    return {
      set(v) { if (v === target) return; target = v; kick(); },
      get value() { return cur; },
      stop() { cancelAnimationFrame(raf); raf = 0; },
    };
  }

  // Picks the <source> whose media query matches and assigns it directly. GitHub Pages serves
  // byte ranges, so seeking works without holding the file in memory (safer on iOS).
  function attachFilm(video, url) {
    const sources = $$('source', video);
    const pick = sources.find((el) => !el.media || matchMedia(el.media).matches) || sources[0];
    url = url || (pick && (pick.dataset.src || pick.getAttribute('src')));
    sources.forEach((el) => el.remove());
    if (!url) return;
    video.muted = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.preload = 'auto';
    video.src = url;
    video.load();
  }

  /* ---------- Hero: one motion system — slow idle drift plus scroll momentum ---------- */
  // The loop file is cross-faded end-to-start, so playback always moves forward and never seams.
  // Scroll speed raises the playback rate; damping carries it back down to the idle rate.
  function initHeroVideo() {
    const video = $('[data-hero-video]');
    const hero = $('[data-hero]');
    if (!video || !heroMedia || !hero) return;
    attachFilm(video);
    const IDLE = 0.32, MAX = 1.35;
    let rate = IDLE, boost = 0, lastY = scrollY, lastT = 0, raf = 0, visible = true;
    let heroH = hero.offsetHeight;

    const play = () => {
      if (!visible || document.hidden) return;
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    };
    video.addEventListener('playing', () => heroMedia.classList.add('is-playing'));
    video.addEventListener('loadeddata', () => { video.playbackRate = rate; play(); });
    // Low Power Mode blocks autoplay until a real tap; the poster holds until then.
    const unlock = () => { play(); if (!video.paused) ['touchend', 'click', 'keydown'].forEach((t) => removeEventListener(t, unlock)); };
    ['touchend', 'click', 'keydown'].forEach((t) => addEventListener(t, unlock, { passive: true }));

    const tick = (now) => {
      const dt = Math.min(0.1, lastT ? (now - lastT) / 1000 : 0.016);
      lastT = now;
      const y = scrollY;
      const v = Math.abs(y - lastY) / dt; // px per second
      lastY = y;
      // Momentum: velocity pushes the boost up quickly, then it decays slowly back to idle.
      const want = motionOK() ? Math.min(1, v / 1600) : 0;
      boost += (want - boost) * (1 - Math.exp(-dt * (want > boost ? 5 : 1.1)));
      const target = IDLE + (MAX - IDLE) * boost;
      rate += (target - rate) * (1 - Math.exp(-dt * 3));
      if (Math.abs(video.playbackRate - rate) > 0.008 && video.readyState >= 2) video.playbackRate = rate;
      if (motionOK()) video.style.transform = `scale(${(1 + 0.03 * clamp(y / heroH)).toFixed(4)})`;
      raf = visible && !document.hidden ? requestAnimationFrame(tick) : 0;
      if (!raf) lastT = 0;
    };
    const start = () => { if (!raf) raf = requestAnimationFrame(tick); play(); };
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start(); else video.pause();
    }, { rootMargin: '10% 0px' }).observe(hero);
    document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); else start(); });
    addEventListener('resize', () => { heroH = hero.offsetHeight; }, { passive: true });
    start();
  }

  /* ---------- Video: play only when visible ---------- */
  function initVideos() {
    const videos = $$('[data-video]');
    if (!motionOK()) {
      videos.forEach((v) => { v.removeAttribute('autoplay'); v.pause(); });
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) {
          if (target.preload === 'none') target.preload = 'auto';
          const p = target.play();
          if (p) p.catch(() => {});
        } else {
          target.pause();
        }
      });
    }, { rootMargin: '120px 0px', threshold: 0.05 });
    videos.forEach((v) => io.observe(v));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) videos.forEach((v) => v.pause());
    });
  }

  /* ---------- Map (lazy) ---------- */
  function loadAsset(tag, attrs) {
    return new Promise((res, rej) => {
      const el = document.createElement(tag);
      Object.assign(el, attrs);
      el.onload = res; el.onerror = rej;
      document.head.appendChild(el);
    });
  }

  function initMap() {
    const el = $('[data-map]');
    if (!el) return;
    const io = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      try {
        await Promise.all([
          loadAsset('link', { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css' }),
          loadAsset('script', { src: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js' }),
        ]);
      } catch { return; }
      const lat = parseFloat(el.dataset.lat);
      const lng = parseFloat(el.dataset.lng);
      const fallback = el.querySelector('.map-fallback');
      const mapEl = document.createElement('div');
      mapEl.style.cssText = 'position:absolute;inset:0';
      mapEl.setAttribute('aria-label', 'Map showing Stagger Coffee on W 8th St, Koreatown, Los Angeles');
      mapEl.setAttribute('role', 'region');
      el.appendChild(mapEl);
      const map = L.map(mapEl, {
        center: [lat + 0.0012, lng - 0.0022],
        zoom: 16,
        scrollWheelZoom: false,
        attributionControl: true,
        zoomControl: false,
        dragging: !L.Browser.mobile,
        tap: false,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);
      L.marker([lat, lng], {
        icon: L.divIcon({ className: 'map-pin', html: '<span></span><b>Stagger</b>', iconSize: [0, 0] }),
        keyboard: false,
        title: 'Stagger Coffee',
      }).addTo(map);
      if (fallback) fallback.remove();
    }, { rootMargin: '600px 0px' });
    io.observe(el);
  }


  /* ---------- Light copy of a heading wherever it crosses its photograph ---------- */
  const overlaps = [];

  function buildOverlap(el) {
    if (el.querySelector('.overlap-light')) return el.querySelector('.overlap-light');
    const media = $(el.dataset.overlap);
    if (!media) return null;
    const layer = document.createElement('span');
    layer.className = 'overlap-light';
    layer.setAttribute('aria-hidden', 'true');
    [...el.childNodes].forEach((n) => {
      if (n.nodeType === Node.ELEMENT_NODE && n.classList.contains('sr-only')) return;
      const c = n.cloneNode(true);
      if (c.nodeType === Node.ELEMENT_NODE) c.removeAttribute('aria-hidden');
      layer.appendChild(c);
    });
    el.appendChild(layer);
    overlaps.push({ el, media, layer });
    measureOverlap({ el, media, layer });
    return layer;
  }

  // Layout offsets ignore transforms, so reveal animations never throw the boundary off.
  function measureOverlap({ el, media, layer }) {
    const top = media.offsetTop - el.offsetTop;
    const left = media.offsetLeft - el.offsetLeft;
    const right = (el.offsetLeft + el.offsetWidth) - (media.offsetLeft + media.offsetWidth);
    const bottom = (el.offsetTop + el.offsetHeight) - (media.offsetTop + media.offsetHeight);
    layer.style.clipPath = `inset(${Math.max(0, top)}px ${Math.max(0, right)}px ${Math.max(0, bottom)}px ${Math.max(0, left)}px)`;
  }

  function initOverlaps() {
    $$('[data-overlap]').forEach(buildOverlap);
    if (!overlaps.length) return;
    const remeasure = () => overlaps.forEach(measureOverlap);
    const ro = new ResizeObserver(remeasure);
    overlaps.forEach(({ el, media }) => { ro.observe(el); ro.observe(media); });
    document.fonts && document.fonts.ready.then(remeasure);
  }

  /* ---------- Studio light: slow, damped response to a fine pointer ---------- */
  function studioLight(stage, { reach = 0.2, drift = 0, lerp = 0.06, lift = 1 } = {}) {
    let rect = null, raf = 0;
    const t = { x: 0, y: 0, nx: 0, ny: 0, s: 1 };
    const c = { x: 0, y: 0, nx: 0, ny: 0, s: 1 };
    const write = () => {
      stage.style.setProperty('--lx', `${c.x.toFixed(1)}px`);
      stage.style.setProperty('--ly', `${c.y.toFixed(1)}px`);
      if (drift) {
        stage.style.setProperty('--dx', (c.nx * drift).toFixed(2));
        stage.style.setProperty('--dy', (c.ny * drift).toFixed(2));
        stage.style.setProperty('--ds', c.s.toFixed(4));
      }
    };
    const tick = () => {
      let settled = true;
      for (const k of ['x', 'y', 'nx', 'ny', 's']) {
        c[k] += (t[k] - c[k]) * lerp;
        if (Math.abs(t[k] - c[k]) > (k === 'x' || k === 'y' ? 0.2 : 0.0005)) settled = false;
      }
      write();
      raf = settled ? 0 : requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const onEnter = () => { rect = stage.getBoundingClientRect(); stage.classList.add('is-lit'); t.s = lift; kick(); };
    const onMove = (e) => {
      if (!rect) rect = stage.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      t.x = px * rect.width * reach;
      t.y = py * rect.height * reach;
      t.nx = px * 2;
      t.ny = py * 2;
      kick();
    };
    const onLeave = () => { stage.classList.remove('is-lit'); Object.assign(t, { x: 0, y: 0, nx: 0, ny: 0, s: 1 }); kick(); };
    const invalidate = () => { rect = null; };
    stage.addEventListener('pointerenter', onEnter);
    stage.addEventListener('pointermove', onMove, { passive: true });
    stage.addEventListener('pointerleave', onLeave);
    addEventListener('scroll', invalidate, { passive: true });
    addEventListener('resize', invalidate, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      stage.removeEventListener('pointerenter', onEnter);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerleave', onLeave);
      removeEventListener('scroll', invalidate);
      removeEventListener('resize', invalidate);
      stage.classList.remove('is-lit');
      ['--lx', '--ly', '--dx', '--dy', '--ds'].forEach((v) => stage.style.removeProperty(v));
    };
  }

  /* ---------- Scroll conductor: progress of a tall track, independent of any library ---------- */
  const watchers = new Set();
  let watchRaf = 0;
  function runWatchers() {
    watchRaf = 0;
    const vh = innerHeight;
    const reads = [...watchers].map((w) => {
      const r = w.track.getBoundingClientRect();
      return [w, clamp(-r.top / Math.max(1, r.height - vh))];
    });
    reads.forEach(([w, p]) => { if (p !== w.p) { w.p = p; w.cb(p); } });
  }
  const requestWatch = () => { if (!watchRaf) watchRaf = requestAnimationFrame(runWatchers); };
  addEventListener('scroll', requestWatch, { passive: true });
  addEventListener('resize', () => { watchers.forEach((w) => { w.p = -1; }); requestWatch(); }, { passive: true });
  function watch(track, cb) {
    const w = { track, cb, p: -1 };
    watchers.add(w);
    requestWatch();
    return {
      get start() { return track.getBoundingClientRect().top + scrollY; },
      get end() { return track.getBoundingClientRect().top + scrollY + track.offsetHeight - innerHeight; },
      kill() { watchers.delete(w); },
    };
  }

  /* ---------- Scroll sequence: one active chapter at a time ---------- */
  function sequence({ track, items, onChange }) {
    const n = items.length;
    let current = -1;
    const setActive = (i) => {
      if (i === current) return;
      current = i;
      items.forEach((el, k) => {
        el.classList.toggle('is-active', k === i);
        el.classList.toggle('is-past', k < i);
        el.setAttribute('aria-hidden', String(k !== i));
      });
      onChange && onChange(i);
    };
    setActive(0);
    const st = watch(track, (p) => {
      const x = p * n;
      const i = Math.min(n - 1, Math.floor(x));
      setActive(i);
      track.style.setProperty('--cp', clamp(x - i).toFixed(3));
    });
    const cleanup = () => {
      st.kill();
      track.style.removeProperty('--cp');
      items.forEach((el) => { el.classList.remove('is-active', 'is-past'); el.removeAttribute('aria-hidden'); });
    };
    return { st, cleanup };
  }

  /* ---------- Themes: body colour follows the chapter ---------- */
  function initThemes() {
    if (!hasGSAP) return;
    root.classList.add('themed');
    $$('main [data-theme]').forEach((section) => {
      ScrollTrigger.create({
        trigger: section,
        start: 'top 55%',
        end: 'bottom 55%',
        onToggle: (self) => { if (self.isActive) document.body.dataset.theme = section.dataset.theme; },
      });
    });
    ScrollTrigger.create({
      trigger: '.footer',
      start: 'top 55%',
      onEnter: () => { document.body.dataset.theme = 'milk'; },
    });
  }

  /* ---------- Split headings ---------- */
  function splitWords(el) {
    const label = el.textContent.replace(/\s+/g, ' ').trim();
    const nodes = [...el.childNodes];
    el.textContent = '';
    const wrap = (content) => {
      const w = document.createElement('span');
      w.className = 'w';
      w.setAttribute('aria-hidden', 'true');
      const inner = document.createElement('span');
      if (typeof content === 'string') inner.textContent = content; else inner.appendChild(content);
      w.appendChild(inner);
      return w;
    };
    nodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        node.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) el.appendChild(document.createTextNode(' '));
          else el.appendChild(wrap(part));
        });
      } else {
        el.appendChild(wrap(node));
      }
    });
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = label;
    el.prepend(sr);
    return $$('.w > span', el);
  }

  function initReveals() {
    $$('[data-split]').forEach((el) => {
      const words = splitWords(el);
      const layer = el.hasAttribute('data-overlap') ? buildOverlap(el) : null;
      const targets = layer ? [...words, ...$$('.w > span', layer)] : words;
      gsap.from(targets, {
        yPercent: 110,
        duration: 1,
        ease: 'power4.out',
        stagger: (i) => (i % words.length) * 0.055,
        scrollTrigger: { trigger: el, start: 'top 86%', once: true },
      });
    });

    gsap.set('[data-reveal]', { autoAlpha: 0 });
    ScrollTrigger.batch('[data-reveal]', {
      start: 'top 90%',
      once: true,
      onEnter: (batch) => gsap.fromTo(batch, { autoAlpha: 0, y: 10 }, {
        autoAlpha: 1, y: 0, duration: 1.1, ease: 'power3.out', stagger: 0.09, overwrite: true,
      }),
    });
  }

  /* ---------- Hero intro + settle ---------- */
  function initHero() {
    const tl = gsap.timeline({ defaults: { ease: 'power4.out' }, onComplete: measureSplit });
    tl.from(nav, { y: -14, autoAlpha: 0, duration: 0.9 }, 0)
      .from(heroMedia, { clipPath: 'inset(100% 0% 0% 0%)', duration: 1.4, ease: 'power4.inOut' }, 0)
      .from('.hero__title .hl__in', { yPercent: 108, duration: 1.15, stagger: 0.085 }, 0.35)
      .from('.hero__top > *', { y: 16, autoAlpha: 0, duration: 0.9, stagger: 0.08 }, 0.7)
      .from('.hero__coords', { autoAlpha: 0, duration: 1 }, 1.1);

    // The brand idea, literally: staggered letters settle onto the baseline as you leave the hero.
    gsap.to('.hero__title .lt', {
      '--y': 0,
      ease: 'none',
      scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: '45% top', scrub: 0.8 },
    });
    gsap.to('.hero__title [data-the]', {
      '--the-x': '0px',
      ease: 'none',
      scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: '45% top', scrub: 0.8 },
    });

    // The circle drifts a little toward equilibrium as the hero leaves.
    const stage = $('[data-hero-stage]');
    if (stage) {
      gsap.to(stage, {
        x: -26, y: 22, scale: 1.015,
        ease: 'none',
        scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: 0.9, onUpdate: measureSplit },
      });
    }

    gsap.to('.footer__un .lt', {
      '--y': 0,
      ease: 'none',
      scrollTrigger: { trigger: '.footer', start: 'top 80%', end: 'top 20%', scrub: 0.8 },
    });
  }

  /* ---------- Signature drinks: one framed scene per drink ---------- */
  function initDrinks(mm) {
    const section = $('[data-drinks]');
    if (!section) return;
    const track = $('[data-drinks-track]', section);
    const stage = $('[data-drinks-stage]', section);
    const items = $$('[data-drink]', section);
    const buttons = $$('[data-drink-jump]', section);
    const bar = $('[data-drinks-bar]', section);
    const n = items.length;
    section.style.setProperty('--n', n);

    // The stages are structural, not decorative: they run on every device, touch included.
    (() => {
      section.classList.add('is-sequenced');
      const { st, cleanup } = sequence({
        track,
        items,
        onChange: (i) => buttons.forEach((b, k) => b.setAttribute('aria-current', String(k === i))),
      });
      const progress = watch(track, (p) => { bar.style.transform = `scaleX(${p.toFixed(4)})`; });
      const onJump = (e) => {
        const i = Number(e.currentTarget.dataset.drinkJump);
        scrollToTarget(st.start + (st.end - st.start) * ((i + 0.5) / n));
      };
      buttons.forEach((b) => b.addEventListener('click', onJump));
      return () => {
        section.classList.remove('is-sequenced');
        cleanup();
        progress.kill();
        buttons.forEach((b) => { b.removeEventListener('click', onJump); b.removeAttribute('aria-current'); });
        bar.style.transform = '';
      };
    })();

    mm && mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference) and (pointer: fine)', () =>
      studioLight(stage, { reach: 0.22, drift: 6, lerp: 0.055, lift: 1.01 }));
  }

  /* ---------- Matcha ritual: drink → product → ingredient ---------- */
  function initMatcha(mm) {
    const section = $('[data-matcha]');
    if (!section) return;
    const track = $('[data-mstory]', section);
    const stage = $('[data-mstory-stage]', section);
    const chapters = $$('[data-mchap]', section);
    const index = $$('.mstory__index li', section);

    // The stages are structural, not decorative: they run on every device, touch included.
    (() => {
      section.classList.add('is-sequenced');
      const { cleanup } = sequence({
        track,
        items: chapters,
        onChange: (i) => {
          stage.dataset.chapter = String(i);
          index.forEach((li, k) => li.classList.toggle('is-active', k === i));
        },
      });
      return () => {
        section.classList.remove('is-sequenced');
        cleanup();
        delete stage.dataset.chapter;
        index.forEach((li) => li.classList.remove('is-active'));
      };
    })();

    mm && mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference) and (pointer: fine)', () =>
      studioLight(stage, { reach: 0.16, lerp: 0.035 }));

  }

  /* ---------- Normal-flow fades (used where a section is not pinned) ---------- */
  function initFades() {
    if (!motionOK()) return;
    root.classList.add('fade-ready');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -10% 0px' });
    $$('[data-fade]').forEach((el) => io.observe(el));
  }

  /* ---------- Matcha shop: assembling the ritual ---------- */
  function initShop(mm) {
    const section = $('[data-mshop]');
    if (!section) return;
    const track = $('[data-mshop-track]', section);
    const objects = $$('[data-mobj]', section);
    const stepNum = $('[data-mshop-step]', section);
    const stepName = $('[data-mshop-name]', section);
    const names = objects.map((o) => o.querySelector('.mobj__name').textContent.trim());

    // The stages are structural, not decorative: they run on every device, touch included.
    (() => {
      section.classList.add('is-sequenced');
      let current = -1;
      const setActive = (i) => {
        if (i === current) return;
        current = i;
        // Objects accumulate: everything up to the current step stays on the table.
        objects.forEach((el, k) => {
          el.classList.toggle('is-in', k <= i);
          el.classList.toggle('is-active', k === i);
        });
        stepNum.textContent = String(i + 1).padStart(2, '0');
        stepName.textContent = names[i];
      };
      setActive(0);
      const st = watch(track, (p) => setActive(Math.min(objects.length - 1, Math.floor(p * objects.length))));
      return () => {
        section.classList.remove('is-sequenced');
        st.kill();
        objects.forEach((el) => el.classList.remove('is-in', 'is-active'));
      };
    })();
  }

  /* ---------- Coffee: one film, seven beats ---------- */
  // Scroll progress (0–1) → film time, piecewise so each beat gets the footage it describes.
  const FILM = [[0, 0], [0.40, 4.8], [0.50, 5.6], [0.66, 7.8], [0.705, 7.8], [0.72, 7.95], [0.84, 9.36], [1, 9.36]];
  const BEATS = [0, 0.12, 0.26, 0.40, 0.50, 0.66, 0.84];
  const NOTES = [0.50, 0.555, 0.61];
  const ramp = (p, a, b) => clamp((p - a) / (b - a));
  const ease = (x) => x * x * (3 - 2 * x);
  function filmTime(p) {
    for (let i = 1; i < FILM.length; i++) {
      const [p1, t1] = FILM[i];
      if (p <= p1) { const [p0, t0] = FILM[i - 1]; return t0 + (t1 - t0) * ((p - p0) / (p1 - p0 || 1)); }
    }
    return FILM[FILM.length - 1][1];
  }

  function initCoffee(mm) {
    const section = $('[data-coffee]');
    if (!section) return;
    const track = $('[data-cstory]', section);
    const stage = $('[data-cstory-stage]', section);
    const film = $('.cfilm', section);
    const video = $('[data-cfilm]', section);
    const beats = $$('[data-cbeat]', section);
    const notes = $$('[data-note]', section);
    const meter = $('[data-cmeter]', section);
    const count = $('[data-ccount]', section);

    // The stages are structural, not decorative: they run on every device, touch included.
    (() => {
      section.classList.add('is-sequenced');
      let beat = -1, s = null;
      const setBeat = (i) => {
        if (i === beat) return;
        beat = i;
        beats.forEach((el, k) => {
          el.classList.toggle('is-active', k === i);
          el.classList.toggle('is-past', k < i);
          el.setAttribute('aria-hidden', String(k !== i));
        });
        count.textContent = String(i + 1).padStart(2, '0');
      };
      const render = (p) => {
        let i = 0;
        while (i < BEATS.length - 1 && p >= BEATS[i + 1]) i++;
        setBeat(i);
        notes.forEach((li, k) => li.classList.toggle('is-in', p >= NOTES[k]));
        const reveal = ease(ramp(p, 0.655, 0.715));
        const prod = ease(ramp(p, 0.80, 0.90));
        stage.style.setProperty('--reveal', reveal.toFixed(4));
        stage.style.setProperty('--push', ramp(p, 0.72, 0.86).toFixed(4));
        stage.style.setProperty('--prod', prod.toFixed(4));
        // The still close-up covers the cut, then hands back to the moving footage.
        stage.classList.toggle('is-revealing', reveal > 0 && p < 0.724);
        stage.classList.toggle('has-prod', prod > 0);
        // Over the close-up the type turns light; it returns to ink as the product arrives.
        stage.classList.toggle('is-dark', p >= 0.69 && p < 0.815);
        meter.style.transform = `scaleX(${p.toFixed(4)})`;
        return filmTime(p);
      };
      setBeat(0);
      render(0);

      // Fetch the film only when the section is close.
      const load = () => {
        if (video.dataset.loaded) return;
        video.dataset.loaded = '1';
        // Phones get a portrait cut of the film (sharper, same centre) with matching stills.
        const portrait = matchMedia('(max-aspect-ratio: 9/16)').matches;
        const kind = portrait ? 'portrait' : '1920';
        const base = 'stagger/video/coffee/bean-story-';
        video.poster = `${base}poster-${kind}.webp`;
        film.style.backgroundImage = `url("${base}poster-${kind}.webp")`;
        $('.cfilm__macro', film).src = `${base}macro-${kind}.webp`;
        attachFilm(video, `${base}${kind}.mp4`);
        const shown = () => film.classList.add('is-ready');
        video.addEventListener('loadeddata', shown, { once: true });
        video.addEventListener('seeked', shown, { once: true });
        s = scrubber(video, { stiffness: 4.2, onFrame: render });
        s.set(last);
      };
      const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { load(); io.disconnect(); } }, { rootMargin: '150% 0px' });
      io.observe(section);

      let last = 0;
      const st = watch(track, (p) => { last = p; if (s) s.set(p); else render(p); });
      return () => {
        section.classList.remove('is-sequenced');
        st.kill(); io.disconnect();
        if (s) s.stop();
        beats.forEach((el) => { el.classList.remove('is-active', 'is-past'); el.removeAttribute('aria-hidden'); });
        notes.forEach((li) => li.classList.remove('is-in'));
        stage.classList.remove('is-revealing', 'has-prod', 'is-dark');
        ['--reveal', '--push', '--prod'].forEach((v) => stage.style.removeProperty(v));
      };
    })();
  }

  /* ---------- Press: expand the verified features ---------- */
  function initPress() {
    const toggle = $('[data-press-toggle]');
    if (!toggle) return;
    const press = toggle.closest('.press');
    const label = $('[data-press-label]', toggle);
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      press.classList.toggle('is-open', !open);
      label.textContent = open ? 'Read the features' : 'Hide the features';
      if (hasGSAP) ScrollTrigger.refresh();
    });
  }

  /* ---------- Depth: photographs drift inside their frames, frames open as they arrive ---------- */
  function initDepth(mm) {
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      $$('[data-depth]').forEach((fig) => {
        const media = fig.querySelector('img, video');
        if (!media) return;
        gsap.fromTo(media, { yPercent: -5, scale: 1.12 }, {
          yPercent: 5, scale: 1.04, ease: 'none',
          scrollTrigger: { trigger: fig, start: 'top bottom', end: 'bottom top', scrub: true },
        });
      });
      $$('[data-unmask]').forEach((fig) => {
        gsap.fromTo(fig, { clipPath: 'inset(9% 7% 9% 7%)' }, {
          clipPath: 'inset(0% 0% 0% 0%)', ease: 'none',
          scrollTrigger: { trigger: fig, start: 'top 96%', end: 'top 40%', scrub: 0.6 },
        });
      });
      const press = $$('.press__list li');
      if (press.length) {
        gsap.from(press, {
          y: 22, autoAlpha: 0, duration: 0.9, ease: 'power3.out', stagger: 0.07,
          scrollTrigger: { trigger: '.press__list', start: 'top 88%', once: true },
        });
      }
    });
    // Phones: the second column of objects travels a little slower than the first.
    mm.add('(max-width: 760px) and (prefers-reduced-motion: no-preference)', () => {
      const even = $$('.object:nth-child(even) > a');
      if (!even.length) return;
      gsap.fromTo(even, { y: 36 }, {
        y: -36, ease: 'none',
        scrollTrigger: { trigger: '.objects__list', start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });
  }

  /* ---------- Hero stage: spin only while on screen, respond to a fine pointer ---------- */
  function initHeroStage(mm) {
    const hero = $('[data-hero]');
    if (!hero) return;
    if (motionOK()) {
      new IntersectionObserver(([e]) => hero.classList.toggle('is-live', e.isIntersecting), { rootMargin: '10% 0px' }).observe(hero);
    }
    mm && mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference) and (pointer: fine)', () =>
      studioLight(hero, { reach: 0.12, drift: 5, lerp: 0.05, lift: 1.01 }));
  }

  /* ---------- Boot ---------- */
  // Core storytelling first: it needs no animation library, so a blocked CDN or a phone
  // with Reduce Motion on still gets the sticky stages and the films.
  const mm = hasGSAP ? gsap.matchMedia() : null;
  initHeroVideo();
  initVideos();
  initMap();
  initDrinks(mm);
  initMatcha(mm);
  initShop(mm);
  initCoffee(mm);
  initHeroStage(mm);
  initFades();
  initPress();

  if (!hasGSAP) { initOverlaps(); return; }
  gsap.registerPlugin(ScrollTrigger);
  initThemes();
  if (motionOK()) {
    initLenis();
    initReveals();
    initHero();
  }
  initOverlaps();
  initDepth(mm);

  addEventListener('load', () => { measureSplit(); ScrollTrigger.refresh(); requestWatch(); });
  document.fonts && document.fonts.ready.then(() => { ScrollTrigger.refresh(); requestWatch(); });
})();
