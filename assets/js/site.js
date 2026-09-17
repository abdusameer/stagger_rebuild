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

  function measureSplit() {
    if (!heroTitle || !heroMedia || !lightCopy) return;
    const t = heroTitle.getBoundingClientRect();
    const m = heroMedia.getBoundingClientRect();
    lightCopy.style.setProperty('--split', `${Math.max(0, m.left - t.left)}px`);
    const bottomClip = Math.max(0, t.bottom - m.bottom);
    lightCopy.style.clipPath = `inset(0 0 ${bottomClip}px ${Math.max(0, m.left - t.left)}px)`;
  }
  measureSplit();
  addEventListener('resize', measureSplit, { passive: true });
  document.fonts && document.fonts.ready.then(measureSplit);

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
      gsap.from(words, {
        yPercent: 110,
        duration: 1,
        ease: 'power4.out',
        stagger: 0.055,
        scrollTrigger: { trigger: el, start: 'top 86%', once: true },
      });
    });

    gsap.set('[data-reveal]', { autoAlpha: 0 });
    ScrollTrigger.batch('[data-reveal]', {
      start: 'top 90%',
      once: true,
      onEnter: (batch) => gsap.fromTo(batch, { autoAlpha: 0, y: 28 }, {
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
      scale: 1.06,
      ease: 'none',
      scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: true },
    });

    gsap.to('.footer__un .lt', {
      '--y': 0,
      ease: 'none',
      scrollTrigger: { trigger: '.footer', start: 'top 80%', end: 'top 20%', scrub: 0.8 },
    });
  }

  /* ---------- Signature drinks sequence ---------- */
  function initDrinks(mm) {
    const section = $('[data-drinks]');
    if (!section) return;
    const track = $('[data-drinks-track]', section);
    const items = $$('[data-drink]', section);
    const buttons = $$('[data-drink-jump]', section);
    const bar = $('[data-drinks-bar]', section);
    const n = items.length;
    section.style.setProperty('--n', n);

    mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
      section.classList.add('is-sequenced');
      let current = -1;
      const setActive = (i) => {
        if (i === current) return;
        current = i;
        items.forEach((el, k) => {
          el.classList.toggle('is-active', k === i);
          el.classList.toggle('is-past', k < i);
          el.setAttribute('aria-hidden', String(k !== i));
        });
        buttons.forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
      };
      setActive(0);

      const st = ScrollTrigger.create({
        trigger: track,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          setActive(Math.min(n - 1, Math.floor(self.progress * n)));
          bar.style.transform = `scaleX(${self.progress})`;
        },
      });

      const onJump = (e) => {
        const i = Number(e.currentTarget.dataset.drinkJump);
        const y = st.start + (st.end - st.start) * ((i + 0.5) / n);
        scrollToTarget(y);
      };
      buttons.forEach((b) => b.addEventListener('click', onJump));
      ScrollTrigger.refresh();

      return () => {
        section.classList.remove('is-sequenced');
        items.forEach((el) => { el.classList.remove('is-active', 'is-past'); el.removeAttribute('aria-hidden'); });
        buttons.forEach((b) => b.removeEventListener('click', onJump));
        bar.style.transform = '';
      };
    });
  }

  /* ---------- Matcha ritual ---------- */
  function initMatcha(mm) {
    const section = $('[data-matcha]');
    if (!section) return;
    mm.add('(min-width: 761px) and (prefers-reduced-motion: no-preference)', () => {
      section.classList.add('is-sequenced');
      const triggers = $$('[data-statement]', section).map((el) => ScrollTrigger.create({
        trigger: el, start: 'top 62%', end: 'bottom 38%', toggleClass: 'is-active',
      }));
      const zoom = gsap.fromTo('[data-matcha-img]', { scale: 1.08 }, {
        scale: 1, ease: 'none',
        scrollTrigger: { trigger: section, start: 'top bottom', end: 'center center', scrub: true },
      });
      return () => {
        section.classList.remove('is-sequenced');
        triggers.forEach((t) => t.kill());
        zoom.scrollTrigger && zoom.scrollTrigger.kill();
      };
    });
  }

  /* ---------- Boot ---------- */
  initVideos();
  initMap();

  if (!hasGSAP) return;
  gsap.registerPlugin(ScrollTrigger);
  initThemes();

  if (motionOK()) {
    initLenis();
    initReveals();
    initHero();
  }

  const mm = gsap.matchMedia();
  initDrinks(mm);
  initMatcha(mm);

  addEventListener('load', () => { measureSplit(); ScrollTrigger.refresh(); });
  document.fonts && document.fonts.ready.then(() => ScrollTrigger.refresh());
})();
