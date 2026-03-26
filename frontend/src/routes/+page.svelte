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

  let scrollY = $state(0);
  const PARALLAX_TRAVEL = 500;
  const pxRemaining = $derived(PARALLAX_TRAVEL - Math.min(scrollY, PARALLAX_TRAVEL));
  const postScroll = $derived(Math.max(scrollY - PARALLAX_TRAVEL, 0));
  let heroHeight = $state(0);
  let dutch = $state(false);
  let freeVisible = $state(false);
  let freeEl: HTMLElement;
  let diagramEl: HTMLElement;
  let diagramTop = $state(0);

  onMount(() => {
    const observer = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        freeVisible = true;
        observer.disconnect();
      }
    }, { threshold: 0.5 });
    observer.observe(freeEl);

    const updateTop = () => {
      if (diagramEl) diagramTop = diagramEl.getBoundingClientRect().top + window.scrollY;
    };
    updateTop();
    window.addEventListener('resize', updateTop);

    // Lazy-load the tile texture after first paint
    const tileImg = new Image();
    tileImg.src = '/images/tile.webp';
    tileImg.onload = () => document.documentElement.classList.add('tile-loaded');

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateTop);
    };
  });

  // 0 -> 1 as the diagram scrolls through the viewport
  const vh = $derived(typeof window !== 'undefined' ? window.innerHeight : 800);
  const annotate = $derived(Math.min(Math.max((scrollY - diagramTop + vh * 0.75) / (vh * 0.8), 0), 1));

  const showA = $derived(annotate > 0.1);
  const showB = $derived(annotate > 0.4);
  const showC = $derived(annotate > 0.7);

  const subtitleEN = 'Code a project, Fly to the Netherlands, Build a mechanical animal!';
  const subtitleNL = 'Programmeer een project, kom naar Scheveningen, bouw een mechanisch dier!';
  let subtitleText = $state('');

  $effect(() => {
    const target = dutch ? subtitleNL : subtitleEN;
    let i = 0;
    subtitleText = '';
    let timeout: ReturnType<typeof setTimeout>;
    const typeNext = () => {
      i++;
      subtitleText = target.slice(0, i);
      if (i >= target.length) return;
      const delay = target[i - 1] === ',' ? 350 + Math.random() * 100 : 35 + Math.random() * 25;
      timeout = setTimeout(typeNext, delay);
    };
    timeout = setTimeout(typeNext, 60);
    return () => clearTimeout(timeout);
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
  let topUpdates = $state(true);
  let bottomUpdates = $state(true);
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

  const shopItems = [
    { src: '/images/shop/blahaj.webp', caption: 'Blåhaj Plush' },
    { src: '/images/shop/flight-stipend.webp', caption: 'Flight Stipend' },
    { src: '/images/shop/framework.webp', caption: 'Framework Laptop' },
    { src: '/images/shop/headphones.webp', caption: 'Headphones' },
    { src: '/images/shop/polaroid.webp', caption: 'Polaroid Camera' },
    { src: '/images/shop/poster.webp', caption: 'Beest Poster' },
    { src: '/images/shop/printer.webp', caption: '3D Printer' },
    { src: '/images/shop/stickers.webp', caption: 'Sticker Pack' }
  ];
</script>

<svelte:window bind:scrollY />

<div class="saturate-wrap">
<div class="page-wrap">

<!-- decorative pipes -->
<div class="pipe pipe-l1" title="strandbeest fossil"></div>
<div class="pipe pipe-r1" title="strandbeest fossil"></div>
<div class="pipe pipe-l2" title="strandbeest fossil"></div>
<div class="pipe pipe-r2" title="strandbeest fossil"></div>

<div class="top-bg">
<div class="hero-scroll-space">
<div class="hero-wrap">
  <div class="hero-parallax" bind:clientHeight={heroHeight}>
    {#each [
      { src: '/images/beest/1.webp', x: 0, rot: 0, scale: 0, drift: 0 },
      { src: '/images/beest/2.webp', x: 0, rot: 0.006, scale: 0.0003, drift: 0.02, offsetY: -60 },
      { src: '/images/beest/3.webp', x: 0, rot: 0, scale: 0, drift: 0.04 },
      { src: '/images/beest/4.webp', x: 0, rot: 0, scale: 0, drift: 0.06 },
      { src: '/images/beest/5.webp', x: 0, rot: 0, scale: 0, drift: 0.08 },
      { src: '/images/beest/6.webp', x: 0.06, rot: 0, scale: 0, drift: 0.10 },
      { src: '/images/beest/7.webp', x: 0.06, rot: 0, scale: 0, drift: 0.04, stretchX: 0.00015 },
      { src: '/images/beest/8.webp', x: 0, rot: 0, scale: 0, drift: 0.08 },
      { src: '/images/beest/9.webp', x: 0, rot: 0, scale: 0, drift: 0.08 },
      { src: '/images/beest/10.webp', x: 0, rot: 0, scale: 0, drift: 0.16 },
      { src: '/images/beest/11.webp', x: 0, rot: 0, scale: 0, drift: 0.20 },
    ] as layer, i}
      <img
        src={layer.src}
        alt=""
        class="hero-layer"
        style="z-index: {i}; transform-origin: top center; transform: translateX({pxRemaining * layer.x}px) translateY({(layer.offsetY ?? 0) - postScroll * layer.drift}px) rotate({pxRemaining * layer.rot}deg) scale({1 + pxRemaining * layer.scale}) scaleX({1 + pxRemaining * (layer.stretchX ?? 0)}) scaleY({heroHeight ? (heroHeight + postScroll * layer.drift) / heroHeight : 1});"
        fetchpriority={i === 0 ? 'high' : 'auto'}
        loading={i <= 2 ? 'eager' : 'lazy'}
        decoding="async"
      />
    {/each}
    <svg class="hero-strata" viewBox="0 0 1440 80" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <polygon points="0,38 60,35 120,40 180,32 240,28 300,25 340,30 380,26 440,22 500,26 560,30 620,24 680,28 720,35 780,40 840,44 880,40 940,46 1000,50 1060,46 1100,42 1140,48 1200,52 1260,48 1300,44 1340,50 1400,46 1440,42 1440,80 0,80" fill="#4b4840" />
    </svg>
  </div>
  <div class="hero-overlay">
    <h1 class="hero-title">#BEEST</h1>
    <p class="hero-subtitle">{subtitleText}<span class="cursor">|</span></p>
  </div>
</div>
</div>

<section class="sticker-cta">
  <div class="cta-group">
    <div class="cta-sticker">
      <img src="/images/sticker.webp" alt="Beest sticker" loading="lazy" decoding="async" />
    </div>
    <div class="cta-content">
      {#if dutch}
        <p class="cta-line">RSVP VÓÓR DE</p>
        <p class="cta-line">LANCERING,</p>
        <p class="cta-line">KRIJG EEN</p>
        <p class="cta-line"><span bind:this={freeEl} class:rainbow={freeVisible} style="--i:0">G</span><span class:rainbow={freeVisible} style="--i:1">R</span><span class:rainbow={freeVisible} style="--i:2">A</span><span class:rainbow={freeVisible} style="--i:3">T</span><span class:rainbow={freeVisible} style="--i:4">I</span><span class:rainbow={freeVisible} style="--i:5">S</span></p>
        <p class="cta-line">STICKERS</p>
      {:else}
        <p class="cta-line">RSVP before</p>
        <p class="cta-line">launch,</p>
        <p class="cta-line">get a <span bind:this={freeEl} class:rainbow={freeVisible} style="--i:0">f</span><span class:rainbow={freeVisible} style="--i:1">r</span><span class:rainbow={freeVisible} style="--i:2">e</span><span class:rainbow={freeVisible} style="--i:3">e</span></p>
        <p class="cta-line">sticker</p>
      {/if}
    </div>
  </div>
  <aside class="rsvp-box" aria-label="RSVP">
    <svg class="rsvp-border" preserveAspectRatio="none"><rect x="1.5" y="1.5" width="calc(100% - 3px)" height="calc(100% - 3px)" rx="0" ry="0" /></svg>
    <h2>RSVP</h2>
    <input type="email" placeholder="you@example.com" aria-label="Email" bind:value={topEmail} />
    <button
      type="button"
      class="rsvp-btn"
      class:valid={topValid}
      class:sending={topStatus === 'sending'}
      disabled={!topValid || topStatus === 'sending'}
      onclick={() => submitRsvp(topEmail, (s) => topStatus = s)}
    >
      {#if topStatus === 'sending'}Sending...{:else}RSVP{/if}
    </button>
    {#if topStatus === 'error'}<p class="rsvp-error">Something went wrong, please try again.</p>{/if}
    <label class="updates">
      <input type="checkbox" bind:checked={topUpdates} />
      <span>recieve email updates</span>
    </label>
    <p class="rsvp-note">
      We will ask for an address to send the stickers to, Please use a real address or opt out since we send real stickers! You can always
      <a href="https://hackclub.com/privacy-and-terms/" target="_blank" rel="noreferrer">view our privacy policy</a>.
    </p>
  </aside>
</section>

  </div>

<div class="rock-strata strata-with-gears" style="background:#4b4840" aria-hidden="true">
  <svg viewBox="0 0 1440 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <polygon points="0,45 160,28 320,55 480,22 640,50 800,18 960,48 1120,30 1280,52 1440,35 1440,100 0,100" fill="#786e5c" />
    <polygon points="0,62 200,50 380,72 540,44 700,68 860,40 1020,66 1180,46 1340,64 1440,55 1440,100 0,100" fill="#786e5c" />
  </svg>
  <svg class="strata-gear" style="left:4%; bottom:0; transform:translateY(20%) rotate({scrollY * 0.1}deg); opacity:1" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g fill="#7f796d"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#4b4840"/>
  </svg>
  <svg class="strata-gear strata-gear--lg" style="left:28%; bottom:0; transform:translateY(20%) rotate({-scrollY * 0.1 + 22.5}deg); opacity:1" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g fill="#6c6659"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#4b4840"/>
  </svg>
  <svg class="strata-gear" style="right:20%; bottom:0; transform:translateY(20%) rotate({scrollY * 0.1}deg); opacity:1" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g fill="#7f796d"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#4b4840"/>
  </svg>
  <svg class="strata-gear strata-gear--lg" style="right:2%; bottom:0; transform:translateY(20%) rotate({-scrollY * 0.1 + 22.5}deg); opacity:1" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g fill="#6c6659"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#4b4840"/>
  </svg>
</div>

<section class="what-is-this">
  <h2>What is this?</h2>
  <p>
    Beest is a <a href="https://hackclub.com" target="_blank" rel="noreferrer">Hack Club</a> program.
    A Beest (Strandbeest) is a sail powered mechanical animal constructed of just fabric, plastic pipes,
    zip ties and recycled plastic bottles. I think they are the coolest thing ever, and if you agree,
    you can join me in building one! Everything (including flights, food and accommodation) is totally
    free for teenagers who qualify by building a project. From [Date] to [Date] you and [X] teens will
    fly to the Netherlands to build a StrandBeest, present it to the creator of strandbeests and watch
    him exhibit the full collection!
  </p>
</section>

<div class="rock-strata" style="background:#786e5c" aria-hidden="true">
  <svg viewBox="0 0 1440 120" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <polygon points="0,40 140,25 300,55 440,20 580,50 720,15 860,48 1000,28 1140,58 1280,22 1440,45 1440,120 0,120" fill="#5e5648" />
    <polygon points="0,65 160,50 320,78 460,45 600,72 760,48 900,80 1040,52 1180,82 1320,55 1440,70 1440,120 0,120" fill="#56494a" />
  </svg>
</div>

<div class="sticker-bg">
<section class="sticker-row">
  <div class="diagram" bind:this={diagramEl} style="--r:{annotate}">
    <div class="sticker">
      <img src="/images/beest.webp" alt="Strandbeest animation" loading="lazy" decoding="async" />
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
  <svg class="strata-gear strata-gear--lg" style="left:10%; bottom:0; transform:translateY(20%) rotate({-scrollY * 0.1 + 22.5}deg); opacity:1" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g fill="#6c6659"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#56494a"/>
  </svg>
  <svg class="strata-gear" style="left:42%; bottom:0; transform:translateY(20%) rotate({scrollY * 0.1}deg); opacity:1" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g fill="#7f796d"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#56494a"/>
  </svg>
  <svg class="strata-gear" style="right:8%; bottom:0; transform:translateY(20%) rotate({-scrollY * 0.1 + 22.5}deg); opacity:1" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g fill="#6c6659"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#56494a"/>
  </svg>
</div>

<div class="info-bg">
<section class="info-section">
  <div class="info-block">
    <h2>Am I Eligible?</h2>
    <p>
      If you are a teen, yes! The only criteria is being a teenager and building a real open-source
      software/hardware project for Y hours. We can help you get a visa, cover the cost of your flight
      or hop on a call with parents! If you aren't sure, join the slack and ask - and if you can't make
      it, stay for the community! Hack Club is much bigger than Beest, we run events like this every
      few weeks!
    </p>
  </div>
  <div class="info-block">
    <h2>I can't make it :/</h2>
    <p>
      You can still win! Alongside the event you can get prizes for logging hours. We will have a shop
      packed with rewards like laptops, tablets, headphones and merch. These will be delivered straight
      to you and require no money transfer! Everything is earned just by working on a project. You can
      see some of the prize selection here ↓
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
    <aside class="rsvp-box" aria-label="RSVP">
      <svg class="rsvp-border" preserveAspectRatio="none"><rect x="1.5" y="1.5" width="calc(100% - 3px)" height="calc(100% - 3px)" rx="0" ry="0" /></svg>
      <h2>RSVP</h2>
      <input type="email" placeholder="you@example.com" aria-label="Email" bind:value={bottomEmail} />
      <button
        type="button"
        class="rsvp-btn"
        class:valid={bottomValid}
        class:sending={bottomStatus === 'sending'}
        disabled={!bottomValid || bottomStatus === 'sending'}
        onclick={() => submitRsvp(bottomEmail, (s) => bottomStatus = s)}
      >
        {#if bottomStatus === 'sending'}Sending...{:else}RSVP{/if}
      </button>
      {#if bottomStatus === 'error'}<p class="rsvp-error">Something went wrong, please try again.</p>{/if}
      <label class="updates">
        <input type="checkbox" bind:checked={bottomUpdates} />
        <span>recieve email updates</span>
      </label>
      <p class="rsvp-note">
        We will ask for an address to send the stickers to, Please use a real address or opt out since we send real stickers! You can always
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
    <p class="footer-brand">Beest</p>
    <p class="footer-tagline">A <a href="https://hackclub.com" target="_blank" rel="noreferrer">Hack Club</a> program</p>
    <div class="footer-links">
      <a href="https://hackclub.com/slack" target="_blank" rel="noreferrer">Slack</a>
      <a href="https://github.com/hackclub" target="_blank" rel="noreferrer">GitHub</a>
      <a href="https://hackclub.com/privacy-and-terms/" target="_blank" rel="noreferrer">Privacy</a>
    </div>
  </div>
  <p class="footer-love">made with &lt;3 by teens for teens</p>
  <svg class="footer-cog" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="transform: rotate({scrollY * 0.1}deg)">
    <g fill="#7f796d"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#000"/>
  </svg>
</footer>

</div><!-- saturate-wrap -->

<button class="translate-btn" onclick={() => dutch = !dutch} aria-label="Toggle Dutch translation">
  {dutch ? '🇬🇧 EN' : '🇳🇱 NL'}
</button>

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
    height: calc(100vh + 500px);
    position: relative;
  }

  .hero-wrap {
    position: sticky;
    top: 0;
    line-height: 0;
    z-index: 1;
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

  .hero-overlay {
    position: absolute;
    inset: auto 48px -130px 48px;
    display: flex;
    flex-direction: row;
    align-items: baseline;
    gap: 24px;
    z-index: 1;
    pointer-events: none;
    line-height: normal;
    flex-wrap: wrap;
  }

  .hero-subtitle {
    margin: 0;
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: clamp(19px, 2vw, 28px);
    color: #e6f4fe;
    letter-spacing: 0.03em;
    line-height: 1.4;
    text-decoration: underline;
    text-underline-offset: 4px;
    white-space: nowrap;
  }

  .cursor {
    animation: blink 0.7s step-end infinite;
    text-decoration: none;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  .hero-title {
    margin: 0;
    flex-shrink: 0;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: clamp(52px, 8vw, 128px);
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #e6f4fe;
    line-height: 1;
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

  .top-bg::after,
  .what-is-this::after,
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
    opacity: 0.08;
    mix-blend-mode: overlay;
    background-size: 512px 512px;
    background-repeat: repeat;
  }

  :global(.tile-loaded) .top-bg::after,
  :global(.tile-loaded) .what-is-this::after,
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
    height: 80px;
  }

  /* ── sign-up CTA ─────────────────────────────────── */
  .sticker-cta {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    gap: 48px;
    padding: 240px 48px 64px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .cta-group {
    display: flex;
    align-items: center;
    gap: 48px;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(230, 244, 254, 0.15);
    padding: 24px 24px 24px 36px;
    margin-bottom: 48px;
  }

  .cta-sticker {
    width: 380px;
    height: 380px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    filter: drop-shadow(10px 12px 16px rgba(0, 0, 0, 0.45));
    animation: sticker-wiggle 3s ease-in-out infinite;
  }

  .cta-sticker:hover {
    animation-play-state: paused;
  }

  @keyframes sticker-wiggle {
    0%, 100% { transform: rotate(10deg); }
    50% { transform: rotate(4deg); }
  }

  .cta-sticker img {
    display: block;
    width: 85%;
    height: 85%;
    object-fit: contain;
  }

  .cta-content {
    flex: 1;
    min-width: 0;
  }

  .cta-line {
    margin: 0;
    color: #e6f4fe;
    font-family: "Andale Mono", "Lucida Console", monospace;
    font-size: clamp(28px, 3.5vw, 52px);
    line-height: 1.15;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .rainbow {
    animation: rainbow 3s linear calc(var(--i) * 0.15s) 7 both;
  }

  @keyframes rainbow {
    0%   { color: #ff0000; }
    10%  { color: #ff8800; }
    20%  { color: #ffff00; }
    30%  { color: #00cc00; }
    40%  { color: #0088ff; }
    50%  { color: #aa00ff; }
    60%  { color: #ff0000; }
    70%  { color: #ff8800; }
    80%  { color: #ffff00; }
    90%  { color: #e6f4fe; }
    100% { color: #e6f4fe; }
  }

  .strata-with-gears {
    position: relative;
    overflow: visible;
    z-index: 0;
  }

  .strata-gear {
    position: absolute;
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

  /* ── what-is-this ───────────────────────────────── */
  .what-is-this {
    padding: 56px 48px 48px;
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
    max-width: 1196px;
    margin: 0 auto;
    padding: 24px 48px 56px;
    display: flex;
    gap: 48px;
  }

  .info-block {
    flex: 1;
    color: #e6f4fe;
    font-family: "Courier New", monospace;
  }

  .info-block h2 {
    margin: 0 0 16px;
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
    padding: 40px 48px 64px;
  }

  .diagram {
    flex: 0 0 auto;
    position: relative;
    width: min(980px, 100%);
    min-height: 460px;
  }

  .rsvp-box {
    position: relative;
    flex: 0 0 380px;
    align-self: flex-start;
    box-sizing: border-box;
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
  }

  .rsvp-box input[type='email']::placeholder {
    color: #6c6659;
  }

  .rsvp-box button {
    width: 100%;
    border: 1px solid #4b4840;
    background: #c48382;
    color: #ffffff;
    font-family: inherit;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 14px 12px;
    cursor: not-allowed;
    transition: background 0.25s, color 0.25s, transform 0.15s;
  }

  .rsvp-box button.valid {
    background: #e05550;
    color: #ffffff;
    cursor: pointer;
  }

  .rsvp-box button.valid:hover {
    background: #d4918f;
  }

  .rsvp-box button.sending {
    background: #809fb7;
    color: #ffffff;
    cursor: wait;
  }

  .rsvp-error {
    margin: 8px 0 0;
    color: #000000;
    font-size: 14px;
  }

  .updates {
    margin-top: 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: #4b4840;
    font-size: 16px;
  }

  .updates input[type='checkbox'] {
    width: 18px;
    height: 18px;
    accent-color: #c48382;
  }

  .rsvp-note {
    margin: 56px 0 0;
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
    width: 480px;
    height: 480px;
  }

  .sticker img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }


  .callout {
    position: absolute;
    max-width: 340px;
    color: #e6f4fe;
    font-family: "Courier New", monospace;
    font-size: 18px;
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
    left: 600px;
    top: 34px;
  }

  .c1::before {
    width: 190px;
    right: 100%;
    top: 18px;
    background: linear-gradient(90deg, #93b4cd, #e6f4fe);
  }

  .c1::after {
    height: 70px;
    right: calc(100% + 190px);
    top: 18px;
    background: linear-gradient(180deg, #93b4cd, rgba(147, 180, 205, 0));
  }

  .c2 {
    left: 640px;
    top: 204px;
  }

  .c2::before {
    width: 230px;
    right: 100%;
    top: 20px;
  }

  .c3 {
    left: 600px;
    top: 365px;
  }

  .c3::before {
    width: 190px;
    right: 100%;
    top: 19px;
    background: linear-gradient(90deg, #93b4cd, #e6f4fe);
  }

  .c3::after {
    height: 70px;
    right: calc(100% + 190px);
    bottom: calc(100% - 20px);
    background: linear-gradient(180deg, rgba(147, 180, 205, 0), #93b4cd);
  }

  .carousel-section {
    position: relative;
    overflow-x: clip;
    overflow-y: visible;
    padding: 80px 0 80px;
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

  .shop-carousel,
  .shop-carousel-bg {
    grid-area: 1 / 1;
    overflow: hidden;
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
    filter: none;
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
      flex-direction: column;
      gap: 32px;
      padding: 100px 20px 60px;
    }

    .hero-overlay {
      position: relative;
      inset: auto;
      padding: 16px 20px 0;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .hero-subtitle {
      white-space: normal;
    }

    .cta-sticker {
      width: min(60vw, 260px);
      height: min(60vw, 260px);
    }

    .sticker-row {
      flex-direction: column;
      padding: 48px 20px 180px;
    }

    .diagram {
      min-height: 0;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .callout {
      opacity: 1 !important;
      transform: none !important;
    }

    .rsvp-box {
      flex: 0 1 auto;
    }

    .sticker {
      width: min(78vw, 400px);
      height: min(78vw, 400px);
    }

    .callout {
      position: static;
      max-width: 100%;
      margin-top: 14px;
    }

    .callout::before {
      width: 38px;
      right: auto;
      left: -44px;
      top: 50%;
      transform: translateY(-50%);
    }

    .info-section {
      flex-direction: column;
      gap: 24px;
      padding: 24px 20px 40px;
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

  /* ── footer ──────────────────────────────────────── */
  .site-footer {
    position: relative;
    overflow: hidden;
    background: #000;
    padding: 48px 48px 40px;
    color: #7f796d;
    font-family: "Courier New", monospace;
  }

  .footer-content {
    max-width: 1100px;
    margin: 0 auto;
    text-align: center;
  }

  .footer-brand {
    margin: 0 0 6px;
    font-size: clamp(24px, 2.5vw, 36px);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #cbc1ae;
  }

  .footer-tagline {
    margin: 0 0 24px;
    font-size: clamp(14px, 1.2vw, 18px);
    letter-spacing: 0.03em;
  }

  .footer-tagline a,
  .footer-tagline a:visited {
    color: #809fb7;
    text-decoration-color: #809fb7;
  }

  .footer-links {
    display: flex;
    justify-content: center;
    gap: 32px;
  }

  .footer-links a,
  .footer-links a:visited {
    color: #7f796d;
    font-size: 15px;
    letter-spacing: 0.03em;
    text-decoration: none;
    transition: color 200ms ease;
  }

  .footer-links a:hover {
    color: #cbc1ae;
  }

  .footer-love {
    margin: 32px 0 0;
    font-size: 18px;
    color: #7f796d;
    text-align: left;
  }

  .footer-cog {
    position: absolute;
    bottom: -60px;
    right: -60px;
    width: 200px;
    height: 200px;
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

    .bottom-rsvp {
      padding: 40px 20px 48px;
    }

    .cta-group {
      flex-direction: column;
      gap: 20px;
      padding: 16px;
      margin-left: 0;
      margin-right: 0;
      width: 100%;
      box-sizing: border-box;
    }
  }

  .translate-btn {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
    background: #4b4840;
    color: #cbc1ae;
    border: 2px solid #7f796d;
    border-radius: 12px;
    padding: 10px 16px;
    font-family: inherit;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    transition: background 0.2s, transform 0.15s;
  }
  .translate-btn:hover {
    background: #6c6659;
    transform: scale(1.05);
  }
</style>
