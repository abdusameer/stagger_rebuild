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


  /* ---------- Hero video: poster first, fade in only once frames are playing ---------- */
  function initHeroVideo() {
    const video = $('[data-hero-video]');
    if (!video || !heroMedia) return;
    if (!motionOK()) {
      video.removeAttribute('autoplay');
      video.preload = 'metadata';
      video.pause();
      return;
    }
    let inView = true;
    const markPlaying = () => heroMedia.classList.add('is-playing');
    const tryPlay = () => {
      if (!inView || document.hidden || !video.paused) return;
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    };
    video.addEventListener('playing', markPlaying);
    video.addEventListener('canplay', tryPlay);
    if (!video.paused && video.readyState > 2) markPlaying();
    tryPlay();

    const unlock = () => { tryPlay(); ['pointerdown', 'keydown', 'touchstart'].forEach((t) => removeEventListener(t, unlock)); };
    ['pointerdown', 'keydown', 'touchstart'].forEach((t) => addEventListener(t, unlock, { passive: true }));

    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (inView) tryPlay(); else video.pause();
    }, { rootMargin: '50% 0px' }).observe(heroMedia);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) video.pause(); else tryPlay();
    });
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
    const st = ScrollTrigger.create({
      trigger: track,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => setActive(Math.min(n - 1, Math.floor(self.progress * n))),
    });
    const cleanup = () => {
      st.kill();
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
    gsap.to('.hero__video', {
      scale: 1.02,
      ease: 'none',
      scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: true },
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

    mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
      section.classList.add('is-sequenced');
      const { st, cleanup } = sequence({
        track,
        items,
        onChange: (i) => buttons.forEach((b, k) => b.setAttribute('aria-current', String(k === i))),
      });
      const progress = ScrollTrigger.create({
        trigger: track, start: 'top top', end: 'bottom bottom',
        onUpdate: (self) => { bar.style.transform = `scaleX(${self.progress.toFixed(4)})`; },
      });
      const onJump = (e) => {
        const i = Number(e.currentTarget.dataset.drinkJump);
        scrollToTarget(st.start + (st.end - st.start) * ((i + 0.5) / n));
      };
      buttons.forEach((b) => b.addEventListener('click', onJump));
      ScrollTrigger.refresh();
      return () => {
        section.classList.remove('is-sequenced');
        cleanup();
        progress.kill();
        buttons.forEach((b) => { b.removeEventListener('click', onJump); b.removeAttribute('aria-current'); });
        bar.style.transform = '';
      };
    });

    mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference) and (pointer: fine)', () =>
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

    mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
      section.classList.add('is-sequenced');
      const { cleanup } = sequence({
        track,
        items: chapters,
        onChange: (i) => {
          stage.dataset.chapter = String(i);
          index.forEach((li, k) => li.classList.toggle('is-active', k === i));
        },
      });
      ScrollTrigger.refresh();
      return () => {
        section.classList.remove('is-sequenced');
        cleanup();
        delete stage.dataset.chapter;
        index.forEach((li) => li.classList.remove('is-active'));
      };
    });

    mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference) and (pointer: fine)', () =>
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

    mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
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
      const st = ScrollTrigger.create({
        trigger: track, start: 'top top', end: 'bottom bottom',
        onUpdate: (self) => setActive(Math.min(objects.length - 1, Math.floor(self.progress * objects.length))),
      });
      ScrollTrigger.refresh();
      return () => {
        section.classList.remove('is-sequenced');
        st.kill();
        objects.forEach((el) => el.classList.remove('is-in', 'is-active'));
      };
    });
  }

  /* ---------- Coffee: cup → beans → roast → product ---------- */
  function initCoffee(mm) {
    const section = $('[data-coffee]');
    if (!section) return;
    const track = $('[data-cstory]', section);
    const stage = $('[data-cstory-stage]', section);
    const chapters = $$('[data-cchap]', section);
    const index = $$('.cstory__index li', section);

    mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
      section.classList.add('is-sequenced');
      const { cleanup } = sequence({
        track,
        items: chapters,
        onChange: (i) => index.forEach((li, k) => li.classList.toggle('is-active', k === i)),
      });
      ScrollTrigger.refresh();
      return () => {
        section.classList.remove('is-sequenced');
        cleanup();
        index.forEach((li) => li.classList.remove('is-active'));
      };
    });

    // A soft sunlight pool rather than a cursor glow.
    mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference) and (pointer: fine)', () =>
      studioLight(stage, { reach: 0.14, lerp: 0.03 }));
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
  initHeroVideo();
  initVideos();
  initMap();

  if (!hasGSAP) { initOverlaps(); return; }
  gsap.registerPlugin(ScrollTrigger);
  initThemes();

  if (motionOK()) {
    initLenis();
    initReveals();
    initHero();
  }
  initOverlaps();

  const mm = gsap.matchMedia();
  initHeroStage(mm);
  initDrinks(mm);
  initMatcha(mm);
  initShop(mm);
  initCoffee(mm);
  initFades();
  initPress();

  addEventListener('load', () => { measureSplit(); ScrollTrigger.refresh(); });
  document.fonts && document.fonts.ready.then(() => ScrollTrigger.refresh());
})();
