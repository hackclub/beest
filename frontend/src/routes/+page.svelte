<!-- src/routes/+page.svelte -->
 <!-- Color Pallet
  #c48382 - Light Red
  #93b4cd - Light Blue
  #4b4840 - Dark Gray
  #6c6659 - Medium Gray
  #7f796d - Light Gray
  #cbc1ae - Beige
  #809fb7 - Light Steel Blue
  #e6f4fe - Light Cyan
  #ffffff - White
 
 -->

<script lang="ts">
  import { onMount } from 'svelte';

  let { data } = $props();
  const authenticated = data.authenticated;

  let scrollY = $state(0);
  let showScrollHint = $state(false);
  const scrollHintVisible = $derived(showScrollHint && scrollY < 10);
  const PARALLAX_TRAVEL = 700;
  // ease-out: parallax decelerates near the end for a smoother hero→content transition
  const rawProgress = $derived(Math.min(scrollY / PARALLAX_TRAVEL, 1));
  const easedProgress = $derived(rawProgress * (2 - rawProgress));

  // Time-based hero animation: waiting → animating → done
  let animPhase = $state<'waiting' | 'animating' | 'done'>('waiting');
  let animValue = $state(0); // 0→1 during animation

  const animEased = $derived(animPhase === 'animating' ? animValue * (2 - animValue) : animPhase === 'done' ? 1 : 0);
  const progress = $derived(Math.max(easedProgress, animEased));
  const pxRemaining = $derived(PARALLAX_TRAVEL * (1 - progress));
  const postScroll = $derived(Math.max(scrollY - PARALLAX_TRAVEL, 0));
  let heroHeight = $state(0);
  let dutch = $state(false);
  let diagramEl: HTMLElement;
  let diagramTop = $state(0);


  onMount(() => {
    const updateTop = () => {
      if (diagramEl) diagramTop = diagramEl.getBoundingClientRect().top + window.scrollY;
    };
    updateTop();
    window.addEventListener('resize', updateTop);

    const hintTimer = setTimeout(() => { showScrollHint = true; }, 3000);

    // Lazy-load the tile texture after first paint
    const tileImg = new Image();
    tileImg.src = '/images/tile.webp';
    tileImg.onload = () => document.documentElement.classList.add('tile-loaded');

    // Hero entrance animation: 1s pause, then 2.5s parallax reveal, then auto-scroll
    let animRaf: number;
    const animDelay = setTimeout(() => {
      animPhase = 'animating';
      const duration = 2500;
      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = now - start;
        animValue = Math.min(elapsed / duration, 1);
        if (animValue < 1) {
          animRaf = requestAnimationFrame(tick);
        } else {
          animPhase = 'done';
        }
      };
      animRaf = requestAnimationFrame(tick);
    }, 1000);

    return () => {
      window.removeEventListener('resize', updateTop);
      clearTimeout(hintTimer);
      clearTimeout(animDelay);
      cancelAnimationFrame(animRaf);
    };
  });


  // 0 -> 1 as the diagram scrolls through the viewport
  const vh = $derived(typeof window !== 'undefined' ? window.innerHeight : 800);
  const annotate = $derived(Math.min(Math.max((scrollY - diagramTop + vh * 0.75) / (vh * 0.8), 0), 1));

  const showA = $derived(annotate > 0);
  const showB = $derived(annotate > 0.25);
  const showC = $derived(annotate > 0.45);

  const subtitleEN = 'Code a project, fly to the Netherlands, build a mechanical animal!';
  const subtitleNL = 'Programmeer een project, kom naar Scheveningen, bouw een mechanisch dier!';
  const subtitle = $derived(dutch ? subtitleNL : subtitleEN);

  let winW = $state(0);
  let winH = $state(0);

  // Shrink the big strandbeest layer (6.webp) just enough that its flag
  // clears the .hero-crop top-crop. Mirrors the CSS reserve: 200px in the
  // 901–1400px range, 260px above that. The flag's top sits at ~5% of the
  // layer's height; scaling from the top-center origin (with the feet
  // re-planted via translateY) moves it down to (1 - 0.95 × scale).
  const beestScale = $derived.by(() => {
    if (!winW || !winH || winW <= 900) return 0.88;
    const natural = winW * 0.5625;
    const reserve = winW <= 1400 ? 200 : 260;
    const visible = Math.min(natural, winH - reserve);
    const cropFrac = Math.max(0, 1 - visible / natural);
    const fit = (1 - cropFrac - 0.03) / 0.95;
    return Math.min(0.88, Math.max(0.6, fit));
  });

  const eventPhotos = [
    { src: '/images/frames/75 teens at Campfire Flagship.webp', caption: '75 teens at Campfire Flagship' },
    { src: '/images/frames/Teen hackers at Assemble.webp', caption: 'Teen hackers at Assemble' },
    { src: '/images/frames/Winners of Parthenon Hackathon.webp', caption: 'Winners of Parthenon Hackathon' },
    { src: '/images/frames/Teens at a local game Jam.webp', caption: 'Teens at a local game Jam' },
    { src: '/images/frames/Hackathon on an island.webp', caption: 'Hackathon on an island' },
    { src: '/images/frames/hackers debugging together.webp', caption: 'Hackers debugging together' }
  ];
  let currentPhoto = $state(0);

  onMount(() => {
    const photoInterval = setInterval(() => {
      currentPhoto = (currentPhoto + 1) % eventPhotos.length;
    }, 3000);
    return () => clearInterval(photoInterval);
  });

  let topEmail = $state('');
  let bottomEmail = $state('');
  let topStatus = $state<'idle' | 'sending' | 'error'>('idle');
  let bottomStatus = $state<'idle' | 'sending' | 'error'>('idle');

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const topValid = $derived(emailRe.test(topEmail.trim()));
  const bottomValid = $derived(emailRe.test(bottomEmail.trim()));

  function submitRsvp(
    email: string,
    setStatus: (s: 'idle' | 'sending' | 'error') => void
  ) {
    const cleaned = email.trim().replace(/[<>"'&\\]/g, '');
    if (!cleaned || !emailRe.test(cleaned)) {
      setStatus('error');
      return;
    }
    setStatus('sending');

    // Navigate to server endpoint — it handles state, cookies, and redirect
    window.location.href = `/api/auth/login?email=${encodeURIComponent(cleaned)}`;
  }

  async function submitAuthenticatedRsvp(
    setStatus: (s: 'idle' | 'sending' | 'error') => void
  ) {
    setStatus('sending');
    try {
      const res = await fetch('/api/auth/rsvp', { method: 'POST' });
      if (res.ok) {
        window.location.href = '/home';
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }

  const shopItems = [
    { src: '/images/shop/blahaj.webp', caption: 'Blåhaj Plush' },
    { src: '/images/shop/flight-stipend.webp', caption: 'Flight Stipend' },
    { src: '/images/shop/framework.webp', caption: 'Framework Laptop' },
    { src: '/images/shop/headphones.webp', caption: 'Headphones' },
    { src: '/images/shop/polaroid.webp', caption: 'Instax Camera' },
    { src: '/images/shop/poster.webp', caption: 'Beest Poster' },
    { src: '/images/shop/printer.webp', caption: '3D Printer' },
    { src: '/images/shop/stickers.webp', caption: 'Sticker Pack' }
  ];

  // Wall of Fame
  const wallOfFameProjects: {
    title: string;
    author: string;
    description: string;
    link: string;
    image?: string;
    alt?: string;
  }[] = [
    {
      title: 'Seaward',
      author: 'moaaz',
      description:
        'A 3D game where the player is in the form of a boat aiming for victory.',
      link: 'https://moaazkamel.itch.io/seaward',
      image: '/images/fame/seaward.webp',
      alt: 'Seaward gameplay: a low-poly boat weaving between canyon gates'
    },
    {
      title: 'vp3',
      author: 'Violet',
      description:
        'TUI music player',
      link: 'https://github.com/vivithequeen/vp3/releases/tag/v1',
      image: '/images/fame/vp3.webp',
      alt: 'vp3 playing an album in the terminal, with cover art rendered as ASCII'
    },
    {
      title: 'Speedtickers',
      author: 'Juan',
      description:
        'Speedrun your way trough short yet difficult levels before the timer hits zero.',
      link: 'https://juanes10201.itch.io/speedtickers-latest',
      image: '/images/fame/speedtickers.webp',
      alt: 'Speedtickers cover art: a blue character sliding across a neon grid'
    },
    {
      title: 'Beest Cli',
      author: 'Peleg',
      description:
        'Beest.hackclub.com but in CLI!',
      link: 'https://beest.peleg2210.me/'
    },
  ];

  // three copies so the belt can loop seamlessly by exactly one copy's width
  const fameBelt = [...wallOfFameProjects, ...wallOfFameProjects, ...wallOfFameProjects];
</script>


<svelte:window bind:scrollY bind:innerWidth={winW} bind:innerHeight={winH} />

<div class="scroll-hint" class:visible={scrollHintVisible}>
  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 5v14M5 12l7 7 7-7" />
  </svg>
</div>

<div class="saturate-wrap" style="--sy:{scrollY}">
<div class="page-wrap">

<!-- decorative pipes -->
<div class="pipe pipe-l1" title="strandbeest fossil"></div>
<div class="pipe pipe-r1" title="strandbeest fossil"></div>
<div class="pipe pipe-l2" title="strandbeest fossil"></div>
<div class="pipe pipe-r2" title="strandbeest fossil"></div>

<div class="top-bg">
<div class="hero-scroll-space">
<div class="hero-wrap">
  <a class="hc-flag" href="https://hackclub.com" target="_blank" rel="noreferrer" aria-label="Hack Club">
    <img src="/images/hack-club-flag.svg" alt="" decoding="async" />
  </a>
  <div class="hero-mobile">
    <img
      src="/images/hero-1024w.webp"
      alt="Hero"
      fetchpriority="high"
      decoding="async"
    />
    <svg class="hero-strata" viewBox="0 0 1440 80" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <polygon points="0,38 60,35 120,40 180,32 240,28 300,25 340,30 380,26 440,22 500,26 560,30 620,24 680,28 720,35 780,40 840,44 880,40 940,46 1000,50 1060,46 1100,42 1140,48 1200,52 1260,48 1300,44 1340,50 1400,46 1440,42 1440,80 0,80" fill="#4b4840" />
    </svg>
  </div>
  <div class="hero-crop">
  <div class="hero-parallax" bind:clientHeight={heroHeight}>
    {#each [
      { src: '', x: 0, rot: 0, scale: 0, drift: 0, isBg: true },
      { src: '/images/beest-cropped/2.webp', x: 0, rot: 0.003, scale: 0.0003, drift: 0.02, offsetY: -60 },
      { src: '/images/beest-cropped/3.webp', x: 0, rot: 0, scale: 0, drift: 0.04, crop: { left: 0, top: 53.5926, width: 100, height: 46.4074 } },
      { src: '/images/beest-cropped/4.webp', x: 0, rot: 0, scale: 0, drift: 0.06, crop: { left: 0, top: 64.6667, width: 44.5625, height: 21.9259 } },
      { src: '/images/beest-cropped/5.webp', x: 0, rot: 0, scale: 0, drift: 0.08, crop: { left: 13.7708, top: 67.2222, width: 86.2292, height: 32.7778 } },
      { src: '/images/beest-cropped/6.webp', x: 0.06, rot: 0, scale: 0, drift: 0.10, baseScale: beestScale },
      { src: '/images/beest-cropped/7.webp', x: 0.06, rot: 0, scale: 0, drift: 0.04, stretchX: 0.00015, crop: { left: 0, top: 57.5556, width: 89.5625, height: 42.4444 } },
      { src: '/images/beest-cropped/8.webp', x: 0, rot: 0, scale: 0, drift: 0.08, crop: { left: 3.625, top: 79.1852, width: 25, height: 10.0741 } },
      { src: '/images/beest-cropped/9.webp', x: 0, rot: 0, scale: 0, drift: 0.08, crop: { left: 10.1667, top: 60.4444, width: 88.4375, height: 36.2593 } },
      { src: '/images/beest-cropped/10.webp', x: 0, rot: 0, scale: 0, drift: 0.16, crop: { left: 37.3333, top: 46.8519, width: 62.6667, height: 53.1481 } },
      { src: '/images/beest-cropped/11.webp', x: 0, rot: 0, scale: 0, drift: 0.20, offsetY: 10, crop: { left: 65.625, top: 72.0741, width: 34.375, height: 27.9259 } },
    ] as layer, i}
      {#if layer.isBg}
        <div
          class="hero-layer hero-layer-bg"
          style="z-index: {i};"
        ></div>
      {:else}
        <img
          src={layer.src}
          alt=""
          class="hero-layer"
          class:hero-layer-cropped={!!layer.crop}
          style="z-index: {i}; transform-origin: top center; {layer.crop ? `left: ${layer.crop.left}%; top: ${layer.crop.top}%; width: ${layer.crop.width}%; height: ${layer.crop.height}%;` : ''} transform: translateX({pxRemaining * layer.x}px) translateY({(layer.offsetY ?? 0) + heroHeight * (1 - (layer.baseScale ?? 1)) - postScroll * layer.drift}px) rotate({pxRemaining * layer.rot}deg) scale({(layer.baseScale ?? 1) * (1 + pxRemaining * layer.scale)}) scaleX({1 + pxRemaining * (layer.stretchX ?? 0)}) scaleY({heroHeight ? layer.crop ? 1 + (postScroll * layer.drift) / (heroHeight * layer.crop.height / 100) : (heroHeight + postScroll * layer.drift) / heroHeight : 1});"
          fetchpriority={i === 0 ? 'high' : 'auto'}
          loading={i <= 2 ? 'eager' : 'lazy'}
          decoding="async"
        />
      {/if}
    {/each}
    <svg class="hero-strata" viewBox="0 0 1440 80" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <polygon points="0,38 60,35 120,40 180,32 240,28 300,25 340,30 380,26 440,22 500,26 560,30 620,24 680,28 720,35 780,40 840,44 880,40 940,46 1000,50 1060,46 1100,42 1140,48 1200,52 1260,48 1300,44 1340,50 1400,46 1440,42 1440,80 0,80" fill="#4b4840" />
    </svg>
  </div>
  </div><!-- hero-crop -->
  <div class="hero-overlay">
    <div class="hero-copy">
      <h1 class="hero-title"><img class="hero-logo" src="/images/beest-logo.webp" alt="Beest" fetchpriority="high" decoding="async" /></h1>
      <div class="hero-credit">from Euan Ripper, ascpixi, and guac md</div>
      <p class="hero-subtitle">{subtitle}</p>
      <p class="hero-closed">PROGRAM CLOSED</p>
    </div>
    <div class="hero-signup" aria-label="Sign Up">
      <p class="signup-note">&#10003; Signing up puts you on our email list, you can remove yourself <a href="https://email-tools.hackclub.com/" target="_blank" rel="noreferrer">here</a>.</p>
      {#if authenticated}
        <div class="signup-form">
          <button
            type="button"
            class="signup-btn valid"
            class:sending={topStatus === 'sending'}
            disabled={topStatus === 'sending'}
            onclick={() => submitAuthenticatedRsvp((s) => topStatus = s)}
          >
            {#if topStatus === 'sending'}Sending...{:else}Start{/if}
          </button>
        </div>
      {:else}
        <div class="signup-form">
          <input class="signup-input" type="email" placeholder="you@example.com" aria-label="Email" bind:value={topEmail} onkeydown={(e) => { if (e.key === 'Enter' && topValid && topStatus !== 'sending') submitRsvp(topEmail, (s) => topStatus = s); }} />
          <button
            type="button"
            class="signup-btn"
            class:valid={topValid}
            class:sending={topStatus === 'sending'}
            disabled={!topValid || topStatus === 'sending'}
            onclick={() => submitRsvp(topEmail, (s) => topStatus = s)}
          >
            {#if topStatus === 'sending'}Sending...{:else}Sign Up{/if}
          </button>
        </div>
      {/if}
      {#if topStatus === 'error'}<p class="signup-error">Something went wrong, please try again.</p>{/if}
    </div>
  </div>

</div>
</div>

<!-- spacer band the absolutely-positioned hero overlay (title + sign-up) hangs into -->
<section class="sticker-cta" aria-hidden="true"></section>

  </div>

<div class="rock-strata strata-with-gears" style="background:#4b4840" aria-hidden="true">
  <svg viewBox="0 0 1440 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <polygon points="0,45 160,28 320,55 480,22 640,50 800,18 960,48 1120,30 1280,52 1440,35 1440,100 0,100" fill="#786e5c" />
    <polygon points="0,62 200,50 380,72 540,44 700,68 860,40 1020,66 1180,46 1340,64 1440,55 1440,100 0,100" fill="#786e5c" />
  </svg>
  <svg class="strata-gear gear-cw" style="left:4%" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g fill="#7f796d"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#4b4840"/>
  </svg>
  <svg class="strata-gear strata-gear--lg gear-ccw" style="left:28%" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g fill="#6c6659"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#4b4840"/>
  </svg>
  <svg class="strata-gear gear-cw" style="right:20%" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g fill="#7f796d"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#4b4840"/>
  </svg>
  <svg class="strata-gear strata-gear--lg gear-ccw" style="right:2%" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g fill="#6c6659"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#4b4840"/>
  </svg>
</div>

<section class="what-is-this" id="what-is-this">
  <h2>What is this?</h2>
  <p>
    Beest is a <a href="https://hackclub.com" target="_blank" rel="noreferrer">Hack Club</a> Event
    running <strong>August 19–21</strong> in the Netherlands.
    We're flying 30 teens out to build walking mechanisms on the same beach the famous
    Strandbeest was constructed. A strandbeest is a kinetic sculpture - a giant walking mechanism of
    pipe and cloth (no motors), and we'll be going to watch the display of the strandbeests
    during the event! Everything (including flights, food and accommodation) is totally free for
    teenagers who qualify by building a project. Can't come? We're also providing funding and prizes
    for every teen who ships a technical project.
  </p>
</section>

<div class="rock-strata" style="background:#786e5c" aria-hidden="true">
  <svg viewBox="0 0 1440 120" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <polygon points="0,40 140,25 300,55 440,20 580,50 720,15 860,48 1000,28 1140,58 1280,22 1440,45 1440,120 0,120" fill="#5e5648" />
    <polygon points="0,65 160,50 320,78 460,45 600,72 760,48 900,80 1040,52 1180,82 1320,55 1440,70 1440,120 0,120" fill="#635a4e" />
  </svg>
</div>

<section class="wall-of-fame" id="wall-of-fame">
  <h2>Wall of Fame</h2>
  <p class="wall-of-fame-subtitle">
    Some of the best builds from the Beest community :D
  </p>

  <div class="fame-carousel" role="region" aria-label="Wall of Fame projects">
    <div class="fame-belt">
      {#each fameBelt as project, i}
        {@const dup = i >= wallOfFameProjects.length}
        <article class="fame-item" aria-hidden={dup}>
          <div class="fame-shot">
            {#if project.image}
              <img src={project.image} alt={dup ? '' : project.alt ?? `Screenshot of ${project.title}`} loading="lazy" decoding="async" />
            {:else}
              <div class="fame-terminal" role="img" aria-label="Terminal session of {project.title}">
                <div class="term-bar"><span></span><span></span><span></span><p>peleg@beest ~ </p></div>
                <pre class="term-body"><span class="t-dim">$</span> beest stats
<span class="t-blue">┌─ peleg ──────────────────┐</span>
<span class="t-blue">│</span> hours logged       52.4h <span class="t-blue">│</span>
<span class="t-blue">│</span> pipes earned          52 <span class="t-blue">│</span>
<span class="t-blue">│</span> projects shipped       1 <span class="t-blue">│</span>
<span class="t-blue">└──────────────────────────┘</span>
<span class="t-dim">$</span> beest devlog post "it walks!"
<span class="t-ok">✓ devlog posted</span>
<span class="t-dim">$</span> <span class="term-cursor">█</span></pre>
              </div>
            {/if}
          </div>
          <div class="fame-plate">
            <h3>{project.title}</h3>
            <p class="fame-author">by {project.author}</p>
            <p class="fame-description">{project.description}</p>
            <a class="fame-link" href={project.link} target="_blank" rel="noreferrer" tabindex={dup ? -1 : undefined}>View project</a>
          </div>
        </article>
      {/each}
    </div>
  </div>
</section>

<div class="rock-strata" style="background:#635a4e" aria-hidden="true">
  <svg viewBox="0 0 1440 120" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <polygon points="0,35 160,55 320,28 480,60 640,20 800,52 960,30 1120,58 1280,22 1440,45 1440,120 0,120" fill="#544d42" />
    <polygon points="0,58 200,72 360,50 520,78 680,44 840,74 1000,48 1160,70 1320,52 1440,65 1440,120 0,120" fill="#56494a" />
  </svg>
</div>

<div class="sticker-bg">
<section class="sticker-row">
  <div class="diagram" bind:this={diagramEl} style="--r:{annotate}">

    <div class="sticker">
      <img src="/images/beest.gif" alt="Strandbeest animation" loading="lazy" decoding="async" />
    </div>

    <div class="callout c1" class:visible={showA}>
      <p>Sails capture the wind to move the strandbeest</p>
    </div>

    <div class="callout c2" class:visible={showB}>
      <p>The arrangement of PVC pipes rotate to plot out a 'walk'</p>
    </div>

    <div class="callout c3" class:visible={showC}>
      <p>The strandbeest walks on many legs</p>
    </div>
  </div>
</section>

</div>

<div class="rock-strata strata-with-gears" style="background:#56494a" aria-hidden="true">
  <svg viewBox="0 0 1440 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <polygon points="0,35 180,55 340,20 500,48 660,12 820,42 980,18 1140,52 1300,25 1440,40 1440,100 0,100" fill="#635a4e" />
    <polygon points="0,58 140,72 300,50 460,78 620,46 780,68 940,44 1100,74 1260,48 1440,62 1440,100 0,100" fill="#635a4e" />
  </svg>
  <svg class="strata-gear strata-gear--lg gear-ccw" style="left:10%" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g fill="#6c6659"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#56494a"/>
  </svg>
  <svg class="strata-gear gear-cw" style="left:42%" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g fill="#7f796d"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#56494a"/>
  </svg>
  <svg class="strata-gear gear-ccw" style="right:8%" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g fill="#6c6659"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#56494a"/>
  </svg>
</div>

<div class="info-bg">
<section class="info-section">
  <div class="info-block">
    <h2>Am I Eligible?</h2>
    <p>
      If you are a teen, yes! The only criteria is being a teenager and building a real open-source
      software/hardware project for 40 hours. We can help you get a visa, cover the cost of your flight
      or hop on a call with parents! If you aren't sure, join the slack and ask - and if you can't make
      it, stay for the community! Hack Club is much bigger than Beest, we run events like this every
      few weeks!
    </p>
  </div>
  <div class="info-block">
    <h2>I can't make it :/</h2>
    <p>
      You can still win! Alongside the event you can get prizes for logging hours. Every hour you code
      earns you 1 Pipe, and you spend Pipes in the shop on rewards like laptops,
      tablets, headphones and merch. These will be delivered straight to you and require no money
      transfer! Everything is earned just by working on a project. You can see some of the prize
      selection here ↓
    </p>
  </div>
</section>
</div>

<div class="rock-strata" style="background:#635a4e" aria-hidden="true">
  <svg viewBox="0 0 1440 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <polygon points="0,30 180,45 340,20 500,48 660,22 820,52 980,28 1140,50 1300,25 1440,40 1440,100 0,100" fill="#544d42" />
    <polygon points="0,55 140,68 300,50 460,72 620,48 780,70 940,45 1100,65 1260,52 1440,62 1440,100 0,100" fill="#47453f" />
  </svg>
</div>

<div class="carousel-section" aria-label="Shop carousel preview">
  <h2 class="carousel-title">Earn Prizes!</h2>
  

  <div class="shop-carousel-bg">
    <div class="carousel-belt-bg">
      {#each [...shopItems, ...shopItems, ...shopItems, ...shopItems] as item}
        <article class="carousel-card bg-card">
          <img src={item.src} alt={item.caption} loading="lazy" decoding="async" />
          <p class="card-caption">{item.caption}</p>
        </article>
      {/each}
    </div>
  </div>

  <div class="shop-carousel">
    <div class="carousel-belt">
      {#each [...shopItems, ...shopItems, ...shopItems, ...shopItems] as item}
        <article class="carousel-card">
          <img src={item.src} alt={item.caption} loading="lazy" decoding="async" />
          <p class="card-caption">{item.caption}</p>
        </article>
      {/each}
    </div>
  </div>
</div>

<section class="hackclub-section">
  <div class="hackclub-inner">
    <div class="hackclub-text">
      <h2>Is Hack Club for real?</h2>
      <p>
        Yes - and we do this kind of stuff all the time! Hack Club is a non-profit organization and a
        community of 100k+ teenage makers. We run events online and in-person that reward people making
        open source projects. Thanks to our donors we are always running crazy events at no cost for
        teens. Previously we ran;
      </p>
    </div>
    <div class="hackclub-photos">
      <div class="photo-stack">
        <div class="photo-frame frame-back-2"></div>
        <div class="photo-frame frame-back-1"></div>
        <div class="photo-frame frame-front">
          <img src={eventPhotos[currentPhoto].src} alt={eventPhotos[currentPhoto].caption} loading="lazy" decoding="async" />
        </div>
      </div>
      <p class="photo-caption">{eventPhotos[currentPhoto].caption}</p>
    </div>
  </div>
  <p class="faq-link">More Questions? <a href="/FAQ">Read the FAQ</a></p>
</section>

</div>

<div class="rock-strata" style="background:#47453f" aria-hidden="true">
  <svg viewBox="0 0 1440 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <polygon points="0,32 160,48 320,26 480,52 640,22 800,50 960,28 1120,54 1280,30 1440,44 1440,100 0,100" fill="#5e5648" />
    <polygon points="0,58 200,70 360,52 520,74 680,48 840,72 1000,50 1160,68 1320,54 1440,62 1440,100 0,100" fill="#6c6659" />
  </svg>
</div>

<section class="bottom-rsvp">
  <div class="bottom-rsvp-inner">
    <aside class="rsvp-box" aria-label="Sign Up">
      <svg class="rsvp-border" preserveAspectRatio="none"><rect x="1.5" y="1.5" width="calc(100% - 3px)" height="calc(100% - 3px)" rx="0" ry="0" /></svg>
      <h2>Sign Up / Log In</h2>
      {#if authenticated}
        <button
          type="button"
          class="rsvp-btn valid"
          class:sending={bottomStatus === 'sending'}
          disabled={bottomStatus === 'sending'}
          onclick={() => submitAuthenticatedRsvp((s) => bottomStatus = s)}
        >
          {#if bottomStatus === 'sending'}Sending...{:else}Start{/if}
        </button>
      {:else}
        <input type="email" placeholder="you@example.com" aria-label="Email" bind:value={bottomEmail} onkeydown={(e) => { if (e.key === 'Enter' && bottomValid && bottomStatus !== 'sending') submitRsvp(bottomEmail, (s) => bottomStatus = s); }} />
        <button
          type="button"
          class="rsvp-btn"
          class:valid={bottomValid}
          class:sending={bottomStatus === 'sending'}
          disabled={!bottomValid || bottomStatus === 'sending'}
          onclick={() => submitRsvp(bottomEmail, (s) => bottomStatus = s)}
        >
          {#if bottomStatus === 'sending'}Sending...{:else}Sign Up{/if}
        </button>
      {/if}
      {#if bottomStatus === 'error'}<p class="rsvp-error">Something went wrong, please try again.</p>{/if}
      <p class="updates">&#10003; Signing up puts you on our email list, you can remove yourself <a href="https://email-tools.hackclub.com/" target="_blank" rel="noreferrer">here</a>.</p>
      <p class="rsvp-note">
        We will ask for an address to ship physical rewards to, please use a real address or opt out since we send real hardware! You can always
        <a href="https://hackclub.com/privacy-and-terms/" target="_blank" rel="noreferrer">view our privacy policy</a>.
      </p>
    </aside>
    <div class="bottom-rsvp-text">
      <h2>What Qualifies?</h2>
      <p>Hack Club uses an in-house time tracking tool to measure and validate time spent on projects. <a href="https://hackatime.hackclub.com" target="_blank" rel="noreferrer">Hackatime</a> supports all major IDEs and text editors, but we also have <a href="https://lapse.hackclub.com" target="_blank" rel="noreferrer">Lapse</a> for recording timelapses of hardware projects.</p>
      <p>A qualifying project can be anything you want, but it must meet the following conditions:</p>
      <ul>
        <li>Open Source Forever</li>
        <li>Functional as laid out in project description</li>
        <li>Included ReadMe.md</li>
        <li>Accessible to any user without need of prior experience or setup</li>
        <li>Time spent recorded faithfully through <a href="https://hackatime.hackclub.com" target="_blank" rel="noreferrer">Hackatime</a></li>
      </ul>
    </div>
  </div>
</section>

<div class="rock-strata" style="background:#6c6659" aria-hidden="true">
  <svg viewBox="0 0 1440 120" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <polygon points="0,35 160,55 320,28 480,60 640,20 800,52 960,30 1120,58 1280,22 1440,45 1440,120 0,120" fill="#56494a" />
    <polygon points="0,58 200,72 360,50 520,78 680,44 840,74 1000,48 1160,70 1320,52 1440,65 1440,120 0,120" fill="#4b4840" />
    <polygon points="0,80 140,90 300,75 460,95 620,72 780,92 940,78 1100,96 1260,82 1440,88 1440,120 0,120" fill="#23221f" />
    <polygon points="0,95 180,100 340,92 500,105 660,90 820,100 980,94 1140,102 1300,96 1440,100 1440,120 0,120" fill="#000" />
  </svg>
</div>

<footer class="site-footer">
  <div class="footer-content">
    <img class="footer-logo" src="/images/beest-logo.webp" alt="Beest" loading="lazy" decoding="async" />
    <p class="footer-heading">a project by <a href="https://hackclub.com" target="_blank" rel="noreferrer">Hack Club</a></p>
    <p class="footer-about">
      Hack Club is a 501(c)(3) nonprofit and network of 100k+ technical high schoolers. We believe
      you learn best by building, so we're creating community and providing grants so you can make
      awesome projects. At Hack Club, students aren't just learning - they're
      <span class="footer-shipping">shipping</span>.
    </p>
    <div class="footer-columns">
      <div class="footer-col">
        <h3>beest</h3>
        <a href="#what-is-this">what is beest</a>
        <a href="#wall-of-fame">wall of fame</a>
        <a href="/FAQ">faq</a>
      </div>
      <div class="footer-col">
        <h3>resources</h3>
        <a href="https://hackclub.com/slack" target="_blank" rel="noreferrer">join our slack</a>
        <a href="https://hackatime.hackclub.com" target="_blank" rel="noreferrer">hackatime</a>
        <a href="https://github.com/hackclub" target="_blank" rel="noreferrer">github</a>
        <a href="https://forms.hackclub.com/bounty" target="_blank" rel="noreferrer">fulfillment bounty</a>
      </div>
      <div class="footer-col">
        <h3>hack club</h3>
        <a href="https://hackclub.com/philosophy/" target="_blank" rel="noreferrer">philosophy</a>
        <a href="https://hackclub.com/team/" target="_blank" rel="noreferrer">our team &amp; board</a>
        <a href="https://hackclub.com/brand/" target="_blank" rel="noreferrer">branding</a>
        <a href="https://hackclub.com/donate/" target="_blank" rel="noreferrer">donate</a>
        <a href="https://hackclub.com/privacy-and-terms/" target="_blank" rel="noreferrer">privacy &amp; terms</a>
      </div>
    </div>
  </div>
  <p class="footer-love">made with <a href="https://hackclub.com/philosophy/" target="_blank" rel="noopener noreferrer">&lt;3</a> by <a href="https://github.com/EDRipper" target="_blank" rel="noopener noreferrer">teens</a> for <a href="https://slack.hackclub.com" target="_blank" rel="noopener noreferrer">teens</a></p>
  <svg class="footer-cog gear-cw" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g fill="#7f796d"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#000"/>
  </svg>
</footer>

</div><!-- saturate-wrap -->


<style>
  @font-face {
    font-family: "Stone Breaker";
    src: url("/fonts/Stone Breaker.woff2") format("woff2");
    font-weight: normal;
    font-style: normal;
    font-display: swap;
  }

  @font-face {
    font-family: "Sunny Mood";
    src: url("/fonts/SunnyMood.woff2") format("woff2");
    font-weight: normal;
    font-style: normal;
    font-display: swap;
  }

  .top-bg {
    background: #4b4840;
  }

  /* ── decorative pipes ───────────────────────────── */
  .page-wrap {
    position: relative;
    /* clip, not hidden — hidden would make this a scroll container and
       promote overflow-y to auto; clip just crops the rotated belts and
       decorative pipes without ever allowing horizontal scroll. */
    overflow-x: clip;
  }

  .pipe {
    position: absolute;
    background: #8a8279;
    border-radius: 6px;
    z-index: 0;
    cursor: help;
  }
  .pipe::after {
    content: '';
    position: absolute;
    background: #9e958a;
    border-radius: 4px;
  }

  /* left pipes */
  .pipe-l1 {
    width: 280px; height: 28px;
    top: 48%; left: -100px;
    transform: rotate(-7deg);
    opacity: 0.6;
    z-index: 1;
  }
  .pipe-l1::after {
    width: 18px; height: 40px;
    right: -3px; top: -6px;
    border-radius: 4px;
  }

  .pipe-l2 {
    width: 240px; height: 24px;
    top: 76%; left: -80px;
    transform: rotate(5deg);
    opacity: 0.55;
    z-index: 1;
  }
  .pipe-l2::after {
    width: 16px; height: 36px;
    right: -3px; top: -6px;
    border-radius: 4px;
  }

  /* right pipes */
  .pipe-r1 {
    width: 260px; height: 26px;
    top: 60%; right: -90px;
    transform: rotate(-10deg);
    opacity: 0.6;
    z-index: 1;
  }
  .pipe-r1::after {
    width: 16px; height: 38px;
    left: -3px; top: -6px;
    border-radius: 4px;
  }

  .pipe-r2 {
    width: 220px; height: 22px;
    top: 71%; right: -70px;
    transform: rotate(8deg);
    opacity: 0.5;
  }
  .pipe-r2::after {
    width: 14px; height: 32px;
    left: -2px; top: -5px;
    border-radius: 4px;
  }

  .hero-scroll-space {
    position: relative;
  }

  .hero-mobile {
    display: none;
    position: relative;
    line-height: 0;
  }

  .hero-mobile img {
    display: block;
    width: 100%;
    height: auto;
  }

  .hero-wrap {
    position: relative;
    line-height: 0;
    z-index: 1;
  }

  .scroll-hint {
    position: fixed;
    bottom: 40px;
    right: 40px;
    z-index: 100;
    opacity: 0;
    transition: opacity 0.6s ease;
    animation: bounce-arrow 1.5s ease-in-out infinite;
    pointer-events: none;
  }

  .scroll-hint.visible {
    opacity: 0.8;
  }

  @keyframes bounce-arrow {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(8px); }
  }

  .hero-parallax {
    position: relative;
    width: 100%;
    aspect-ratio: 4800 / 2700;
    overflow: hidden;
  }

  .hero-layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    will-change: transform;
    pointer-events: none;
  }
  .hero-layer-cropped {
    inset: auto;
    object-fit: fill;
  }
  .hero-layer-bg {
    background: linear-gradient(to bottom, #8aadc8 0%, #99b7cf 25%, #a9c3d8 50%, #b0c9dc 75%);
  }

  .hero-overlay {
    /* the wordmark's letter frame starts ~17% into the logo image (the gear
       sits to its left); the text rows below indent by the same amount so
       everything aligns to the letters, not the gear */
    --logo-w: clamp(280px, 30vw, 480px);
    --logo-indent: calc(var(--logo-w) * 0.17);
    --closed-size: clamp(22px, 2.4vw, 34px);
    position: absolute;
    /* hangs below the hero so the whole block sits on the brown ground */
    inset: auto clamp(48px, 7vw, 160px) -120px;
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    justify-content: space-between;
    gap: clamp(32px, 5vw, 80px);
    /* above the strata svg (z 12), which would otherwise paint over the top
       of the logo where it overlaps the rock band */
    z-index: 13;
    /* transparent overlay lets clicks fall through to the parallax; the
       sign-up box re-enables events on itself */
    pointer-events: none;
    line-height: normal;
  }

  .hero-copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    min-width: 0;
    /* PROGRAM CLOSED adds a row here. The overlay is bottom-anchored, so
       without this the column grows upward and shoves the logo and tagline off
       the brown ground onto the sea. At line-height 1 the row is exactly its
       font-size, so hanging the column that much lower (plus the gap) keeps
       every row above it exactly where it was designed to sit. Negative margin
       rather than a bigger overlay offset, so the sign-up box stays put. */
    margin-bottom: calc(-1 * (var(--closed-size) + 10px));
  }

  /* bare sign-up: email + button docked to the right of the wordmark */
  .hero-signup {
    pointer-events: auto;
    position: relative;
    flex: 0 0 clamp(320px, 32vw, 440px);
  }

  /* the input and button are each tilted a touch and the button laps over the
     input's edge, like two parts pinned on by hand */
  .signup-form {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 6px 4px;
  }

  .signup-input {
    flex: 1 1 auto;
    min-width: 0;
    position: relative;
    z-index: 1;
    box-sizing: border-box;
    padding: 13px 12px;
    border: 2px solid #4b4840;
    background: #e6f4fe;
    color: #4b4840;
    font-size: 18px;
    font-family: "Courier New", monospace;
    cursor: text;
    rotate: -2deg;
  }

  .signup-input::placeholder {
    color: #6c6659;
  }

  /* chunky "hardware key" that presses down on hover/click */
  .signup-btn {
    flex: 0 0 auto;
    min-width: 150px;
    position: relative;
    z-index: 2;
    margin-left: -18px;
    rotate: 2.5deg;
    translate: 0 10px;
    border: 2px solid #4b4840;
    background: #AD9E83;
    color: #4C483D;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 22px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 12px 18px;
    cursor: not-allowed;
    box-shadow: 4px 4px 0 #4b4840;
    transition: transform 0.12s ease-out, box-shadow 0.12s ease-out, background 0.2s;
  }

  /* enabled: the disabled palette inverted, dark fill with taupe text;
     taupe border so the dark key stands out against the ground */
  .signup-btn.valid {
    background: #4C483D;
    color: #AD9E83;
    border-color: #AD9E83;
    cursor: pointer;
  }

  .signup-btn.valid:hover {
    background: #5a5648;
    transform: translate(2px, 2px);
    box-shadow: 2px 2px 0 #4b4840;
  }

  .signup-btn.valid:active {
    transform: translate(4px, 4px);
    box-shadow: 0 0 0 #4b4840;
  }

  .signup-btn.sending {
    background: #809fb7;
    color: #f3e9d6;
    cursor: wait;
    transform: translate(4px, 4px);
    box-shadow: 0 0 0 #4b4840;
  }

  /* floats above the input row, fades in only while the box holds focus;
     :focus-within keeps the "remove yourself here" link reachable */
  .signup-note {
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    margin: 0 0 10px;
    padding: 10px 12px;
    background: rgba(0, 0, 0, 0.32);
    border: 1px solid rgba(230, 244, 254, 0.15);
    color: #e6f4fe;
    font-family: "Courier New", monospace;
    font-size: 14px;
    line-height: 1.4;
    opacity: 0;
    transform: translateY(4px);
    transition: opacity 0.22s ease-out, transform 0.22s ease-out;
    pointer-events: none;
  }

  .hero-signup:focus-within .signup-note {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  .signup-note a,
  .signup-note a:visited {
    color: #93b4cd;
    text-decoration: underline;
  }

  .signup-error {
    margin: 8px 0 0;
    color: #000000;
    font-size: 14px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }

  /* signature credit — directly under the logo, on the brown, deliberately
     dimmer than the tagline below it */
  .hero-credit {
    margin: 0 0 0 var(--logo-indent);
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: clamp(16px, 1.6vw, 24px);
    color: #cbc1ae;
    letter-spacing: 0.04em;
    line-height: 1;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }

  .hero-subtitle {
    margin: 4px 0 0 var(--logo-indent);
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: clamp(19px, 2vw, 28px);
    color: #ffffff;
    letter-spacing: 0.03em;
    line-height: 1.4;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55), 0 2px 10px rgba(0, 0, 0, 0.4);
  }

  /* BEEST has ended — its own row under the tagline, sharing that indent.
     Reads as a stamp over the tagline, not a second headline. */
  .hero-closed {
    margin: 0 0 0 var(--logo-indent);
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: var(--closed-size);
    font-weight: 700;
    letter-spacing: 0.08em;
    line-height: 1;
    color: #c48382;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55), 0 2px 10px rgba(0, 0, 0, 0.4);
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  .hero-title {
    margin: 0;
    flex-shrink: 0;
    line-height: 0;
  }

  .hero-logo {
    display: block;
    width: var(--logo-w);
    height: auto;
    filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.35));
  }

  /* Whenever the 16:9 hero leaves too little room for the text block, the
     text sinks below the fold. Anchor the artwork to the bottom and crop it
     from the top ("move the background up") so the beach, the text on the
     brown rock, and breathing room below it all fit in the first screenful.
     Applies wherever the desktop parallax hero renders — both the bottom-
     pinned overlay (>1400px) and the in-flow overlay (901–1400px), which
     needs a similar ~260px below the artwork. */
  @media (min-width: 901px) {
    .hero-crop {
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      max-height: calc(100vh - 260px);
      max-height: calc(100svh - 260px);
      overflow: clip;
    }

    .hero-crop .hero-parallax {
      flex: 0 0 auto;
    }
  }

  /* Between 901–1400px the smaller viewport can spare less room below the
     artwork; the bottom-pinned text block overlaps the art more instead. */
  @media (min-width: 901px) and (max-width: 1400px) {
    .hero-crop {
      max-height: calc(100vh - 200px);
      max-height: calc(100svh - 200px);
    }
  }

  /* ── hack club flag ─────────────────────────────── */
  .hc-flag {
    position: absolute;
    top: clamp(16px, 1.8vw, 30px);
    left: clamp(20px, 4vw, 64px);
    z-index: 20;
    width: clamp(96px, 9vw, 150px);
    line-height: 0;
    transform-origin: center;
    transition: transform 0.3s ease;
  }

  .hc-flag:hover,
  .hc-flag:focus-visible {
    transform: scale(1.09);
  }

  .hc-flag img {
    display: block;
    width: 100%;
    height: auto;
    filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.3));
  }

  .hero-strata {
    position: absolute;
    bottom: -4px;
    left: 0;
    width: 100%;
    height: 80px;
    display: block;
    z-index: 12;
  }

  :global(html) {
    scroll-behavior: smooth;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    background-color: #47453f;
  }

  .saturate-wrap {
    --sy: 0;
    filter: saturate(1.5);
  }

  .what-is-this,
  .sticker-bg,
  .info-bg,
  .hackclub-section,
  .bottom-rsvp {
    content-visibility: auto;
    contain-intrinsic-size: auto 500px;
  }

  .top-bg,
  .what-is-this,
  .info-bg,
  .sticker-bg,
  .carousel-section,
  .hackclub-section,
  .bottom-rsvp,
  .rock-strata,
  .site-footer {
    position: relative;
    margin-top: -1px;
  }

  .sticker-cta::after,
  .what-is-this::after,
  .wall-of-fame::after,
  .info-bg::after,
  .sticker-bg::after,
  .carousel-section::after,
  .hackclub-section::after,
  .bottom-rsvp::after,
  .rock-strata::after,
  .site-footer::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.12;
    mix-blend-mode: overlay;
    background-size: 512px 512px;
    background-repeat: repeat;
  }

  .sticker-cta::after {
    left: 50%;
    right: auto;
    width: 100vw;
    transform: translateX(-50%);
    -webkit-mask-image: linear-gradient(to bottom, transparent, black 200px);
    mask-image: linear-gradient(to bottom, transparent, black 200px);
  }

  :global(.tile-loaded) .sticker-cta::after,
  :global(.tile-loaded) .what-is-this::after,
  :global(.tile-loaded) .wall-of-fame::after,
  :global(.tile-loaded) .info-bg::after,
  :global(.tile-loaded) .sticker-bg::after,
  :global(.tile-loaded) .carousel-section::after,
  :global(.tile-loaded) .hackclub-section::after,
  :global(.tile-loaded) .bottom-rsvp::after,
  :global(.tile-loaded) .rock-strata::after,
  :global(.tile-loaded) .site-footer::after {
    background-image: url('/images/tile.webp');
  }

  /* ── rock strata ────────────────────────────────── */
  .rock-strata {
    display: block;
    width: 100%;
    line-height: 0;
    margin: -4px 0;
    padding: 0;
    position: relative;
    z-index: 1;
  }

  .rock-strata svg:not(.strata-gear) {
    display: block;
    width: 100%;
    height: 100px;
  }

  /* ── sign-up CTA ─────────────────────────────────── */
  .sticker-cta {
    position: relative;
    display: flex;
    align-items: stretch;
    justify-content: center;
    gap: 64px;
    padding: 240px 72px 96px;
    max-width: 1400px;
    margin: 0 auto;
  }


  .strata-with-gears {
    position: relative;
    overflow: visible;
    z-index: 0;
  }

  .strata-gear {
    position: absolute;
    bottom: 0;
    width: 150px;
    height: 150px;
    will-change: transform;
    z-index: -1;
    pointer-events: none;
  }

  .strata-gear--lg {
    width: 200px;
    height: 200px;
  }

  .gear-cw {
    transform: translateY(20%) rotate(calc(var(--sy) * 0.1deg));
  }

  .gear-ccw {
    transform: translateY(20%) rotate(calc(var(--sy) * -0.1deg + 22.5deg));
  }

  .footer-cog.gear-cw {
    transform: rotate(calc(var(--sy) * 0.1deg));
  }

  /* ── wall of fame ───────────────────────────────── */
  .wall-of-fame {
    background: #635a4e;
    padding: 88px 48px 108px;
    color: #e6f4fe;
    font-family: "Courier New", monospace;
    position: relative;
    z-index: 1;
  }

  .wall-of-fame h2 {
    margin: 0 auto 18px;
    max-width: 1100px;
    color: #ddd7cf;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: clamp(28px, 3vw, 52px);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-shadow: 0 2px 5px rgba(0, 0, 0, 0.55);
  }

  .wall-of-fame-subtitle {
    max-width: 1100px;
    margin: 0 auto 44px;
    color: #ddd7cf;
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: clamp(18px, 1.7vw, 24px);
    line-height: 1.6;
    letter-spacing: 0.02em;
    text-shadow: 0 2px 5px rgba(0, 0, 0, 0.55);
  }

  /* full-bleed auto-scrolling belt, same idiom as the shop carousel */
  .fame-carousel {
    position: relative;
    z-index: 1;
    margin: 12px -48px 0;
    overflow: hidden;
    overflow: clip;
    /* breathing room for the crooked frames and the overhanging plates */
    padding: 30px 0 56px;
  }

  .fame-belt {
    display: flex;
    width: max-content;
    animation: fame-scroll 60s linear infinite;
  }

  /* pausable so "View project" is actually clickable / tabbable */
  .fame-carousel:hover .fame-belt,
  .fame-carousel:focus-within .fame-belt {
    animation-play-state: paused;
  }

  @keyframes fame-scroll {
    from { transform: translateX(0); }
    to { transform: translateX(calc(-100% / 3)); }
  }

  @media (prefers-reduced-motion: reduce) {
    .fame-belt {
      animation: none;
    }

    .fame-carousel {
      overflow-x: auto;
    }
  }

  .fame-item {
    position: relative;
    flex-shrink: 0;
    width: min(560px, 78vw);
    /* margin instead of flex gap so the belt is exactly 3 copies wide and
       the -100%/3 loop point lands seamlessly */
    margin-right: 64px;
  }

  .fame-item:nth-child(odd) .fame-shot {
    transform: rotate(-1.1deg);
  }

  .fame-item:nth-child(even) .fame-shot {
    transform: rotate(0.9deg);
  }

  .fame-shot {
    position: relative;
    aspect-ratio: 16 / 10;
    background: #23221f;
    border: 3px solid #4b4840;
    box-shadow: 8px 10px 0 rgba(35, 34, 31, 0.55);
    overflow: clip;
    container-type: inline-size;
  }

  .fame-shot img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* terminal mock for CLI projects with no screenshot */
  .fame-terminal {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: #23221f;
    color: #cbc1ae;
    font-family: "Courier New", monospace;
  }

  .term-bar {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 10px 14px;
    background: #4b4840;
    border-bottom: 1px solid #23221f;
  }

  .term-bar span {
    width: 11px;
    height: 11px;
    border-radius: 999px;
    background: #7f796d;
  }

  .term-bar span:first-child { background: #c48382; }
  .term-bar span:nth-child(2) { background: #cbc1ae; }
  .term-bar span:nth-child(3) { background: #93b4cd; }

  .term-bar p {
    margin: 0 0 0 8px;
    font-size: 13px;
    color: #cbc1ae;
    letter-spacing: 0.03em;
  }

  .term-body {
    flex: 1;
    margin: 0;
    padding: 3.4cqi 4cqi;
    font-size: clamp(12px, 2.6cqi, 19px);
    line-height: 1.7;
    overflow: clip;
  }

  .t-dim { color: #7f796d; }
  .t-blue { color: #93b4cd; }
  .t-ok { color: #a3b579; }

  .term-cursor {
    animation: blink 0.7s step-end infinite;
  }

  /* caption plate pinned over the screenshot's lower-right corner */
  .fame-plate {
    position: absolute;
    right: -18px;
    bottom: -30px;
    z-index: 2;
    width: min(60%, 290px);
    box-sizing: border-box;
    background: rgba(240, 235, 229, 0.97);
    border: 1px solid #4b4840;
    box-shadow: 5px 5px 0 rgba(75, 72, 64, 0.95);
    padding: 13px 16px 14px;
    color: #4b4840;
    transform: rotate(-2.4deg);
  }

  .fame-item:nth-child(even) .fame-plate {
    transform: rotate(1.8deg);
  }

  .fame-plate h3 {
    margin: 0;
    font-family: "Stone Breaker", "Courier New", monospace;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    font-size: 20px;
    line-height: 1.1;
    color: #000000;
  }

  .fame-author {
    margin: 4px 0 0;
    font-size: 16px;
    color: #6c6659;
    font-family: "Sunny Mood", "Courier New", monospace;
  }

  .fame-description {
    margin: 8px 0 0;
    font-size: 17px;
    line-height: 1.35;
    letter-spacing: 0.01em;
    color: #4b4840;
    font-family: "Sunny Mood", "Courier New", monospace;
  }

  .fame-link {
    display: inline-block;
    margin-top: 12px;
    padding: 8px 12px;
    border: 1px solid #4b4840;
    background: #93b4cd;
    color: #ffffff;
    font-size: 14px;
    font-family: "Courier New", monospace;
    font-weight: 700;
    text-decoration: none;
    box-shadow: 3px 3px 0 rgba(75, 72, 64, 0.95);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .fame-link:hover {
    transform: translate(-1px, -1px);
    box-shadow: 4px 4px 0 rgba(75, 72, 64, 0.95);
  }

  /* ── what-is-this ───────────────────────────────── */
  .what-is-this {
    padding: 80px 48px 72px;
    color: #e6f4fe;
    font-family: "Courier New", monospace;
    background: #786e5c;
  }


  .what-is-this h2 {
    max-width: 1100px;
    margin: 0 auto 20px;
    color: #ddd7cf;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: clamp(28px, 3vw, 42px);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-shadow: 0 2px 5px rgba(0, 0, 0, 0.55);
  }

  .what-is-this p {
    max-width: 1100px;
    margin: 0 auto;
    color: #ddd7cf;
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: clamp(20px, 2vw, 26px);
    line-height: 1.55;
    letter-spacing: 0.02em;
    text-shadow: 0 2px 5px rgba(0, 0, 0, 0.55);
  }

  .what-is-this a,
  .what-is-this a:visited {
    color: #809fb7;
    text-decoration-color: #809fb7;
  }

  /* ── info sections ──────────────────────────────── */
  .info-bg {
    background: #635a4e;
  }

  .info-section {
    max-width: 1100px;
    margin: 0 auto;
    padding: 72px 64px 96px;
    display: flex;
    gap: 72px;
  }

  .info-block {
    flex: 1;
    color: #e6f4fe;
    font-family: "Courier New", monospace;
  }

  .info-block h2 {
    margin: 0 0 24px;
    color: #ddd7cf;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: clamp(22px, 2.4vw, 34px);
    letter-spacing: 0.04em;
    text-shadow: 0 2px 5px rgba(0, 0, 0, 0.55);
    text-transform: uppercase;
  }

  .info-block p {
    margin: 0;
    color: #ddd7cf;
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: clamp(19px, 1.8vw, 24px);
    line-height: 1.55;
    letter-spacing: 0.02em;
    text-shadow: 0 2px 5px rgba(0, 0, 0, 0.55);
  }

  /* ── layout ─────────────────────────────────────── */
  .sticker-bg {
    background: #56494a;
  }

  .sticker-row {
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 40px;
    max-width: 1100px;
    margin: 0 auto;
    padding: 64px 48px 80px;
  }

  .diagram {
    flex: 0 0 auto;
    position: relative;
    width: min(980px, 100%);
    min-height: 460px;
    container-type: inline-size;
  }

  .rsvp-box {
    position: relative;
    z-index: 1;
    flex: 0 0 380px;
    box-sizing: border-box;
    min-height: 420px;
    padding: 24px;
    background: #7f796d;
    border: none;
    color: #4b4840;
    font-family: "Courier New", monospace;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  }

  .rsvp-border {
    position: absolute;
    inset: -3px;
    width: calc(100% + 6px);
    height: calc(100% + 6px);
    pointer-events: none;
    overflow: visible;
  }

  .rsvp-border rect {
    fill: none;
    stroke: #000000;
    stroke-width: 3;
    stroke-dasharray: 20 12;
    animation: march 30s linear infinite;
    animation-play-state: paused;
  }

  .rsvp-box:hover .rsvp-border rect {
    animation-play-state: running;
  }

  @keyframes march {
    to { stroke-dashoffset: -1000; }
  }

  .rsvp-box h2 {
    margin: 0 0 16px;
    color: #4b4840;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 32px;
    line-height: 1;
    letter-spacing: 0.04em;
  }

  .rsvp-box input[type='email'] {
    width: 100%;
    box-sizing: border-box;
    margin: 0 0 14px;
    padding: 14px 12px;
    border: 1px solid #cbc1ae;
    background: #e6f4fe;
    color: #4b4840;
    font-size: 18px;
    font-family: inherit;
    cursor: text;
  }

  .rsvp-box input[type='email']::placeholder {
    color: #6c6659;
  }

  /* chunky "hardware" button: a hard offset shadow reads as a physical key
     that presses down on hover/click — matches the hand-built mechanical theme */
  .rsvp-box button {
    width: 100%;
    border: 2px solid #4b4840;
    background: #a89f8d;
    color: #4b4840;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 26px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 12px;
    cursor: not-allowed;
    box-shadow: 4px 4px 0 #4b4840;
    transition: transform 0.12s ease-out, box-shadow 0.12s ease-out, background 0.2s;
  }

  .rsvp-box button.valid {
    background: #b5443f;
    color: #f3e9d6;
    cursor: pointer;
  }

  .rsvp-box button.valid:hover {
    background: #c15049;
    transform: translate(2px, 2px);
    box-shadow: 2px 2px 0 #4b4840;
  }

  .rsvp-box button.valid:active {
    transform: translate(4px, 4px);
    box-shadow: 0 0 0 #4b4840;
  }

  .rsvp-box button.sending {
    background: #809fb7;
    color: #f3e9d6;
    cursor: wait;
    transform: translate(4px, 4px);
    box-shadow: 0 0 0 #4b4840;
  }

  .rsvp-error {
    margin: 8px 0 0;
    color: #000000;
    font-size: 14px;
  }

  /* only surfaces while the sign-up box holds focus; :focus-within keeps the
     "remove yourself here" link reachable (focusing it counts as within) */
  .updates {
    display: none;
    margin: 14px 0 0;
    color: #e6f4fe;
    font-size: 14px;
    line-height: 1.4;
  }

  .rsvp-box:focus-within .updates {
    display: block;
  }

  .updates a,
  .updates a:visited {
    color: #93b4cd;
    text-decoration: underline;
  }

  .rsvp-note {
    margin: 20px 0 0;
    color: #e6f4fe;
    font-family: "Courier New", monospace;
    font-size: 14px;
    line-height: 1.35;
    background: rgba(0, 0, 0, 0.25);
    padding: 12px 14px;
    border: 1px solid rgba(230, 244, 254, 0.15);
  }

  .rsvp-note a,
  .rsvp-note a:visited,
  .rsvp-note a:hover,
  .rsvp-note a:active {
    color: #809fb7;
    text-decoration-color: #809fb7;
  }

  .sticker {
    position: relative;
    width: 49%;
    aspect-ratio: 1;
  }

  .sticker img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }


  .callout {
    position: absolute;
    max-width: 35cqi;
    color: #e6f4fe;
    font-family: "Courier New", monospace;
    font-size: clamp(14px, 1.8cqi, 18px);
    letter-spacing: 0.03em;
    line-height: 1.35;
    opacity: 0;
    transform: translateY(10px);
    transition: opacity 260ms ease, transform 260ms ease;
  }

  .callout p {
    margin: 0;
    padding: 12px 14px;
    font-family: "Courier New", monospace;
    border: 1px solid rgba(230, 244, 254, 0.35);
    background: #6c6659;
    backdrop-filter: blur(1.5px);
  }

  .callout::before {
    content: '';
    position: absolute;
    height: 1px;
    background: linear-gradient(90deg, rgba(147, 180, 205, 0), #93b4cd 35%, #e6f4fe);
    opacity: calc(0.35 + (var(--r) * 0.65));
  }

  .callout::after {
    content: '';
    position: absolute;
    width: 1px;
    background: linear-gradient(180deg, rgba(147, 180, 205, 0), #e6f4fe);
    opacity: calc(0.35 + (var(--r) * 0.65));
  }

  .callout.visible {
    opacity: 1;
    transform: translateY(0);
  }

  .c1 {
    left: 55%;
    top: 7%;
  }

  .c1::before {
    left: calc(-1 * (55cqi - 24.5cqi));
    width: calc(55cqi - 24.5cqi);
    top: 18px;
    background: linear-gradient(90deg, #93b4cd, #e6f4fe);
  }

  .c1::after {
    height: 70px;
    left: calc(-1 * (55cqi - 24.5cqi));
    top: 18px;
    background: linear-gradient(180deg, #93b4cd, rgba(147, 180, 205, 0));
  }

  .c2 {
    left: 58%;
    top: 43%;
  }

  .c2::before {
    left: calc(-1 * (58cqi - 49cqi));
    width: calc(58cqi - 49cqi);
    top: 20px;
  }

  .c3 {
    left: 55%;
    top: 76%;
  }

  .c3::before {
    left: calc(-1 * (55cqi - 24.5cqi));
    width: calc(55cqi - 24.5cqi);
    top: 19px;
    background: linear-gradient(90deg, #93b4cd, #e6f4fe);
  }

  .c3::after {
    height: 70px;
    left: calc(-1 * (55cqi - 24.5cqi));
    bottom: calc(100% - 20px);
    background: linear-gradient(180deg, rgba(147, 180, 205, 0), #93b4cd);
  }

  .carousel-section {
    position: relative;
    z-index: 2;
    /* No overflow property here on purpose: the belt wrappers clip themselves
       (overflow: clip below) and .page-wrap clips the page horizontally.
       Any overflow value on this section either creates a scroll container or
       (Safari, with mixed clip/visible axes) clips the rotated belts to a
       plain rectangle instead of letting them bleed over the strata. */
    padding: 100px 0 100px;
    display: grid;
    grid-template: 1fr / 1fr;
    background: #47453f;
  }

  .carousel-title {
    position: absolute;
    left: 55%;
    top: 10%;
    transform: translate(-50%, -50%) rotate(-12deg);
    z-index: 3;
    margin: 0;
    color: #e6f4fe;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: clamp(32px, 4vw, 56px);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .carousel-subtitle {
    position: absolute;
    left: 55%;
    top: 18%;
    transform: translate(-50%, -50%) rotate(-12deg);
    z-index: 3;
    margin: 0;
    color: #ddd7cf;
    font-family: "Courier New", monospace;
    font-size: clamp(14px, 1.6vw, 20px);
    letter-spacing: 0.03em;
  }

  .shop-carousel,
  .shop-carousel-bg {
    grid-area: 1 / 1;
    /* clip, not hidden: hidden makes these scroll containers, so find-in-page,
       drag-selection, or programmatic scrollIntoView can shove the belts
       sideways with no way back. clip can never scroll. min-width: 0 is
       required with clip — without a scroll container the grid item's
       automatic minimum size would stretch the track to the belt's width. */
    overflow: hidden;
    overflow: clip;
    min-width: 0;
    width: calc(100% + 28vw);
    margin-left: -14vw;
    margin-right: -14vw;
  }

  .shop-carousel {
    transform: rotate(-12deg);
    padding: 24px 0 32px;
    z-index: 1;
    align-self: center;
  }

  .shop-carousel-bg {
    transform: rotate(12deg);
    padding: 30px 0 20px;
    z-index: 0;
    align-self: center;
  }

  .carousel-belt,
  .carousel-belt-bg {
    display: flex;
    gap: 36px;
    width: max-content;
  }

  .carousel-belt {
    animation: shop-scroll-left 36s linear infinite;
  }

  .carousel-belt-bg {
    animation: shop-scroll-right 46s linear infinite;
  }

  .carousel-section:has(.shop-carousel:hover) .carousel-belt,
  .carousel-section:has(.shop-carousel:hover) .carousel-belt-bg,
  .carousel-section:has(.shop-carousel-bg:hover) .carousel-belt,
  .carousel-section:has(.shop-carousel-bg:hover) .carousel-belt-bg {
    animation-play-state: paused;
  }

  .carousel-card {
    width: 250px;
    flex-shrink: 0;
    background: #f0ebe5;
    border: 1px solid #4b4840;
    box-shadow: 6px 6px 0 #4b4840;
    padding: 12px 12px 10px;
    filter: saturate(0.667);
  }

  .bg-card {
    width: 170px;
    background: #6c6659;
    border-color: #4b4840;
    box-shadow: 3px 3px 0 #4b4840;
    padding: 10px 10px 8px;
  }

  .bg-card .card-caption {
    color: #cbc1ae;
    font-size: 14px;
  }

  .carousel-card img {
    width: 100%;
    aspect-ratio: 4 / 5;
    height: auto;
    object-fit: contain;
    border: 1px solid #6c6659;
    background: #e6f4fe;
    display: block;
  }

  .card-caption {
    margin: 8px 0 0;
    color: #4b4840;
    font-family: "Courier New", monospace;
    font-size: 16px;
    line-height: 1.25;
    text-align: center;
  }

  @keyframes shop-scroll-left {
    from { transform: translateX(0); }
    to { transform: translateX(-25%); }
  }

  @keyframes shop-scroll-right {
    from { transform: translateX(-25%); }
    to { transform: translateX(0); }
  }

  @media (max-width: 1400px) {
    .pipe { display: none; }

    .sticker-cta {
      gap: 32px;
      /* the hero text block hangs 120px into this section */
      padding: 176px 40px 80px;
    }

    .sticker-row {
      flex-direction: column;
      padding: 48px 20px 180px;
    }

    .diagram {
      min-height: 0;
      width: min(700px, 100%);
      margin: 0 auto;
    }

    .rsvp-box {
      flex: 0 0 360px;
    }

    .info-section {
      flex-direction: column;
      gap: 56px;
      padding: 60px 48px 72px;
    }

    .carousel-section {
      padding: 24px 0 90px;
    }

    .carousel-title {
      display: none;
    }

    .shop-carousel,
    .shop-carousel-bg {
      width: calc(100% + 44vw);
      margin-left: -22vw;
      margin-right: -22vw;
    }

    .carousel-card {
      width: 120px;
      padding: 6px 6px 5px;
    }

    .bg-card {
      width: 90px;
      padding: 5px 5px 4px;
    }

    .carousel-belt,
    .carousel-belt-bg {
      gap: 16px;
    }

    .card-caption {
      font-size: 11px;
    }
  }

  @media (max-width: 900px) {
    /* the hero overlay flows inline here, so the desktop spacer band the
       absolute overlay hung into is no longer needed */
    .sticker-cta {
      display: none;
    }

    .rsvp-box {
      flex: 0 1 auto;
      align-self: center;
      max-width: 420px;
      width: 100%;
    }
  }

  /* ── footer ──────────────────────────────────────── */
  .site-footer {
    position: relative;
    overflow: hidden;
    background: #000;
    padding: 64px clamp(48px, 8vw, 160px) 44px;
    color: #7f796d;
    font-family: "Sunny Mood", "Courier New", monospace;
  }

  .footer-content {
    max-width: 1100px;
    margin: 0 auto;
    text-align: left;
  }

  .footer-logo {
    display: block;
    margin: 0 0 26px;
    width: min(210px, 55vw);
    height: auto;
  }

  .footer-heading {
    margin: 0 0 22px;
    font-size: clamp(22px, 2vw, 28px);
    letter-spacing: 0.03em;
    color: #e6f4fe;
  }

  .footer-heading a,
  .footer-heading a:visited {
    color: #93b4cd;
    text-decoration: underline;
    text-underline-offset: 4px;
  }

  .footer-heading a:hover {
    color: #e6f4fe;
  }

  .footer-about {
    margin: 0;
    max-width: 62ch;
    font-size: clamp(16px, 1.3vw, 19px);
    line-height: 1.65;
    letter-spacing: 0.02em;
    color: #cbc1ae;
  }

  .footer-shipping {
    color: #c48382;
  }

  .footer-columns {
    display: flex;
    flex-wrap: wrap;
    gap: 32px 110px;
    margin-top: 52px;
  }

  .footer-col {
    min-width: 150px;
  }

  .footer-col h3 {
    margin: 0 0 16px;
    font-family: inherit;
    font-size: 20px;
    font-weight: normal;
    letter-spacing: 0.04em;
    color: #c48382;
  }

  .footer-col a,
  .footer-col a:visited {
    display: block;
    margin-bottom: 12px;
    color: #7f796d;
    font-size: 17px;
    letter-spacing: 0.03em;
    text-decoration: none;
    transition: color 200ms ease;
  }

  .footer-col a:hover {
    color: #cbc1ae;
  }

  .footer-love {
    margin: 32px 0 0;
    font-size: 18px;
    color: #7f796d;
    text-align: left;
  }

  .footer-love a,
  .footer-love a:visited,
  .footer-love a:hover,
  .footer-love a:active {
    color: #93b4cd;
  }

  .footer-cog {
    position: absolute;
    bottom: -60px;
    right: -60px;
    width: 200px;
    height: 200px;
    will-change: transform;
  }

  /* ── bottom RSVP ─────────────────────────────────── */
  /* ── hack club section ────────────────────────────── */
  .hackclub-section {
    background: #47453f;
    padding: 96px 48px 0;
  }

  .hackclub-inner {
    display: flex;
    gap: 48px;
    max-width: 1196px;
    margin: 0 auto;
  }

  .faq-link {
    width: 100%;
    text-align: center;
    color: #ddd7cf;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 36px;
    letter-spacing: 0.04em;
    padding: 48px 0;
    margin: 0;
    text-shadow: 0 2px 5px rgba(0, 0, 0, 0.55);
  }

  .faq-link a,
  .faq-link a:visited {
    color: #93b4cd;
  }

  .faq-link a:hover {
    color: #e6f4fe;
  }

  .hackclub-text {
    flex: 1;
    color: #e6f4fe;
    font-family: "Courier New", monospace;
  }

  .hackclub-text h2 {
    margin: 35px 0 16px;
    color: #ddd7cf;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: clamp(22px, 2.4vw, 34px);
    text-shadow: 0 2px 5px rgba(0, 0, 0, 0.55);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .hackclub-text p {
    margin: 0;
    color: #ddd7cf;
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: clamp(19px, 1.8vw, 24px);
    line-height: 1.55;
    letter-spacing: 0.02em;
    text-shadow: 0 2px 5px rgba(0, 0, 0, 0.55);
  }

  .hackclub-photos {
    flex: 0 0 400px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .photo-stack {
    position: relative;
    width: 360px;
    height: 280px;
  }

  .photo-frame {
    position: absolute;
    width: 360px;
    height: 260px;
    background: #6c6659;
    border: 3px solid #4b4840;
    box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.3);
  }

  .frame-back-2 {
    top: 0;
    left: 0;
    transform: rotate(-4deg);
    background: #5e5648;
  }

  .frame-back-1 {
    top: 4px;
    left: 6px;
    transform: rotate(2deg);
    background: #6c6659;
  }

  .frame-front {
    top: 8px;
    left: 3px;
    transform: rotate(-1deg);
    background: #e6f4fe;
    overflow: hidden;
  }

  .frame-front img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: opacity 400ms ease;
  }

  .photo-caption {
    margin: 16px 0 0;
    text-align: center;
    font-family: "Courier New", monospace;
    font-size: 15px;
    color: #cbc1ae;
    letter-spacing: 0.03em;
    font-style: italic;
  }

  /* ── bottom RSVP ─────────────────────────────────── */
  .bottom-rsvp {
    background: #6c6659;
    position: relative;
    overflow: hidden;
    padding: 56px 48px 64px;
  }

  .bottom-rsvp-inner {
    display: flex;
    gap: 48px;
    max-width: 1100px;
    margin: 0 auto;
  }

  .bottom-rsvp-text {
    flex: 1;
    color: #e6f4fe;
    font-family: "Courier New", monospace;
  }

  .bottom-rsvp-text h2 {
    margin: 0 0 16px;
    color: #ddd7cf;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: clamp(22px, 2.4vw, 34px);
    text-shadow: 0 2px 5px rgba(0, 0, 0, 0.55);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .bottom-rsvp-text p {
    margin: 0 0 12px;
    color: #ddd7cf;
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: clamp(15px, 1.4vw, 19px);
    line-height: 1.55;
    text-shadow: 0 2px 5px rgba(0, 0, 0, 0.55);
  }

  .bottom-rsvp-text ul {
    margin: 0;
    padding-left: 20px;
    color: #ddd7cf;
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: clamp(15px, 1.4vw, 19px);
    line-height: 1.75;
    text-shadow: 0 2px 5px rgba(0, 0, 0, 0.55);
  }

  .bottom-rsvp-text a,
  .bottom-rsvp-text a:visited {
    color: #93b4cd;
    text-decoration: underline;
  }

  .bottom-rsvp-text a:hover {
    color: #e6f4fe;
  }

  .bottom-rsvp .rsvp-box {
    flex: 0 0 380px;
    align-self: flex-start;
    z-index: 1;
  }

  @media (max-width: 900px) {
    .sticker-cta::after,
    .what-is-this::after,
    .wall-of-fame::after,
    .info-bg::after,
    .sticker-bg::after,
    .carousel-section::after,
    .hackclub-section::after,
    .bottom-rsvp::after,
    .rock-strata::after,
    .site-footer::after {
      mix-blend-mode: normal;
      opacity: 0.05;
    }

    .hero-mobile {
      display: block;
    }

    .hero-scroll-space {
      height: auto;
    }

    .hero-wrap {
      position: relative;
    }

    .hero-parallax {
      display: none;
    }

    /* mobile: the overlay flows below the static hero image. Overriding
       --logo-w (not the img width) keeps the text indent aligned with the
       wordmark's letter frame. */
    .hero-overlay {
      --logo-w: min(72vw, 420px);
      position: relative;
      inset: auto;
      flex-direction: column;
      align-items: stretch;
      padding: 18px 24px 48px;
      gap: 20px;
    }

    .hero-copy {
      margin-bottom: 0;
    }

    .hero-signup {
      flex: 0 1 auto;
      align-self: center;
      width: 100%;
      max-width: 420px;
    }

    /* no empty hero art to float over here, so the notice sits in flow above
       the input (its space reserved) and just fades — never over the tagline */
    .signup-note {
      position: static;
      margin: 0 0 12px;
      transform: none;
    }

    .scroll-hint {
      display: none;
    }

    .hackclub-section {
      padding: 40px 20px 0;
    }

    .hackclub-inner {
      flex-direction: column;
    }

    .hackclub-photos {
      flex: 0 0 auto;
    }

    .photo-stack {
      width: 300px;
      height: 240px;
    }

    .photo-frame {
      width: 300px;
      height: 220px;
    }

    .diagram {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .sticker {
      width: min(78vw, 400px);
    }

    .callout {
      position: static;
      max-width: 100%;
      margin-top: 14px;
      opacity: 1 !important;
      transform: none !important;
    }

    .callout::before {
      width: 38px;
      right: auto;
      left: -44px;
      top: 50%;
      transform: translateY(-50%);
    }

    .callout::after {
      display: none;
    }

    .bottom-rsvp {
      padding: 40px 20px 48px;
    }

    .footer-cog {
      width: 130px;
      height: 130px;
      bottom: -40px;
      right: -40px;
    }

    .footer-love {
      padding-right: 60px;
    }

    .rsvp-box {
      max-width: 360px;
    }
  }

</style>
