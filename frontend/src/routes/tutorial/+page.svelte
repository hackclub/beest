<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { beforeNavigate } from '$app/navigation';

  let { data } = $props();

  let scrollY = $state(0);
  let innerHeight = $state(800);

  let slackStatus = $state(data.onboarding.slack);
  let slackRefreshing = $state(false);

  async function refreshSlack() {
    slackRefreshing = true;
    try {
      const res = await fetch('/api/onboarding/status');
      if (res.ok) {
        const status = await res.json();
        slackStatus = status.slack;
      }
    } finally {
      slackRefreshing = false;
    }
  }

  // Scrollymation plays in reverse scroll direction — scroll UP to progress
  const scrollLength = $derived(innerHeight * 10);
  const maxScroll = $derived(innerHeight * 13);
  const progress = $derived(Math.min(Math.max((maxScroll - scrollY) / scrollLength, 0), 1));

  // SVG text draw progress — starts after clouds are off screen, finishes by end
  const drawProgress = $derived(Math.min(Math.max((progress - 0.4) / 0.5, 0), 1));

  // Beest rises from bottom after text finishes drawing
  const beestProgress = $derived(Math.min(Math.max((progress - 0.7) / 0.15, 0), 1));
  const beestY = $derived((1 - beestProgress) * 100);

  // Clouds start overlapped, then split apart, drift up, and scale up
  const translateX = $derived(progress * 110);
  const translateY = $derived(progress * -15);
  const scale = $derived(1 + progress * 0.3);

  // Show enter button once all scroll animations are done
  let transitioned = $state(false);
  let skyEl: HTMLElement;
  let locked = $state(false);
  const showEnter = $derived(progress >= 1 && !transitioned);

  async function enterSky() {
    transitioned = true;
    await tick();
    // Start one section below landing, animate scroll up to landing
    const landingPos = skyEl.offsetTop + skyEl.offsetHeight - innerHeight * 2;
    const startPos = landingPos + innerHeight;
    window.scrollTo(0, startPos);
    await tick();
    const duration = 2400;
    const startTime = performance.now();
    function animateScroll(now: number) {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      window.scrollTo(0, startPos + (landingPos - startPos) * ease);
      if (t < 1) {
        requestAnimationFrame(animateScroll);
      } else {
        locked = true;
        tick().then(() => {
          if (skyEl) {
            window.scrollTo(0, skyEl.offsetTop + skyEl.offsetHeight - innerHeight * 2);
          }
        });
      }
    }
    requestAnimationFrame(animateScroll);
  }

  // Prevent scrolling past the bottom back into the scrollymation
  $effect(() => {
    if (locked && skyEl) {
      const bottom = skyEl.offsetTop + skyEl.offsetHeight - innerHeight;
      if (scrollY > bottom) {
        window.scrollTo(0, bottom);
      }
    }
  });

  // 4 content sections + 1 landing = 5 sky colors, bottom matches sky.png
  const skyColors = [
    '#1e3a5f', '#3d6e99', '#5b72a0', '#7b6fa8', '#2e3563',
  ];

  // Evenly spaced gradient stops
  const gradientStops = skyColors
    .map((c, i) => `${c} ${(i / (skyColors.length - 1)) * 100}%`)
    .join(', ');

  // Scroll indicator fades out as user starts scrolling up
  const indicatorOpacity = $derived(Math.min(Math.max(1 - progress * 5, 0), 1));

  // Cloud rows at section boundaries — alternate left/right, embedded in page edge
  const numSections = skyColors.length;
  const clouds: { top: number; left: number; opacity: number }[] = [];
  for (let i = 2; i < numSections - 1; i++) {
    const top = (i / numSections) * 100;
    const fromLeft = i % 2 === 1;
    clouds.push({ top, left: fromLeft ? -15 : 60, opacity: 0.6 });
  }

  // Cloud filter: gets warmer/brighter further down
  function cloudFilter(topPct: number): string {
    const t = topPct / 100;
    return `hue-rotate(${t * 25}deg) brightness(${1 + t * 0.5}) saturate(${1 + t * 0.3})`;
  }

  // Section navigation
  const sections = ['Go!', 'Create a Project', 'Connect Hackatime', 'Join Slack', 'Beach'];
  const sectionMultipliers = [1, 2, 3, 4, 5]; // innerHeight multipliers within sky-scroll

  const activeSection = $derived.by(() => {
    if (!skyEl || !locked) return -1;
    const offset = scrollY - skyEl.offsetTop;
    for (let i = sectionMultipliers.length - 1; i >= 0; i--) {
      if (offset >= (sectionMultipliers[i] - 0.5) * innerHeight) return i;
    }
    return 0;
  });

  let navigating = $state(false);

  function goToSection(index: number) {
    if (!skyEl || navigating) return;
    navigating = true;
    const target = skyEl.offsetTop + sectionMultipliers[index] * innerHeight;
    window.scrollTo({ top: target, behavior: 'smooth' });
    // Safety timeout — always unlock after 2s max
    const timeout = setTimeout(() => { navigating = false; }, 2000);
    const check = () => {
      if (Math.abs(scrollY - target) < 2) {
        clearTimeout(timeout);
        navigating = false;
      } else {
        requestAnimationFrame(check);
      }
    };
    requestAnimationFrame(check);
  }

  // Block manual scrolling once in sky sections
  function blockScroll(e: Event) {
    if (locked || showEnter) e.preventDefault();
  }

  const scrollKeys = new Set(['ArrowUp', 'ArrowDown', 'Space', 'PageUp', 'PageDown', 'Home', 'End']);
  function blockKeys(e: KeyboardEvent) {
    if ((locked || showEnter) && scrollKeys.has(e.code)) e.preventDefault();
  }

  function cleanupListeners() {
    window.removeEventListener('wheel', blockScroll);
    window.removeEventListener('touchmove', blockScroll);
    window.removeEventListener('keydown', blockKeys);
  }

  beforeNavigate(cleanupListeners);

  // Measure total path length of all letter paths once mounted
  let pathEls: SVGPathElement[] = [];
  let totalLength = $state(0);

  onMount(() => {
    window.addEventListener('wheel', blockScroll, { passive: false });
    window.addEventListener('touchmove', blockScroll, { passive: false });
    window.addEventListener('keydown', blockKeys);

    if (data.stage != null) {
      // Skip scrollymation and jump directly to the requested section
      transitioned = true;
      locked = true;
      tick().then(() => {
        if (skyEl) {
          window.scrollTo(0, skyEl.offsetTop + sectionMultipliers[data.stage!] * innerHeight);
        }
      });
    } else {
      // Start at the bottom so user scrolls UP to play the scrollymation
      window.scrollTo(0, innerHeight * 13);
    }

    totalLength = pathEls.reduce((sum, p) => sum + p.getTotalLength(), 0);
    let cumulative = 0;
    for (const p of pathEls) {
      const len = p.getTotalLength();
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
      p.dataset.length = `${len}`;
      p.dataset.start = `${cumulative}`;
      cumulative += len;
    }

    return cleanupListeners;
  });

  // Update each path's offset based on scroll progress
  $effect(() => {
    if (!totalLength) return;
    const drawn = drawProgress * totalLength;
    for (const p of pathEls) {
      const len = Number(p.dataset.length);
      const start = Number(p.dataset.start);
      const pathDrawn = Math.min(Math.max(drawn - start, 0), len);
      p.style.strokeDashoffset = `${len - pathDrawn}`;
    }
  });
</script>

<svelte:window bind:scrollY bind:innerHeight />

<div class="scroll-container" class:hidden={locked} class:collapsed={transitioned}>
  <div class="tile-bg" class:hidden={locked || transitioned}></div>
  <div class="sticky-frame">
    <svg class="draw-text" viewBox="0 0 1000 130" xmlns="http://www.w3.org/2000/svg">
      <path bind:this={pathEls[0]} d="M20,20 Q28,65 35,100 Q40,70 48,45 Q52,60 58,100 Q65,65 72,20" />
      <path bind:this={pathEls[1]} d="M88,60 Q90,40 108,40 Q125,42 122,60 L88,62 Q86,88 108,90 Q120,88 125,78" />
      <path bind:this={pathEls[2]} d="M138,18 Q136,58 140,98" />
      <path bind:this={pathEls[3]} d="M172,42 Q155,42 155,65 Q158,92 175,90" />
      <path bind:this={pathEls[4]} d="M192,65 Q192,40 210,40 Q228,42 228,65 Q228,90 210,92 Q192,90 192,65" />
      <path bind:this={pathEls[5]} d="M248,92 Q246,58 248,45 Q252,38 265,38 Q278,40 278,52 L278,92 M278,52 Q282,38 295,38 Q308,40 308,52 L308,92" />
      <path bind:this={pathEls[6]} d="M325,60 Q328,40 345,40 Q362,42 360,60 L325,62 Q322,88 345,90 Q358,88 362,78" />
      <path bind:this={pathEls[7]} d="M405,25 Q402,58 405,92 Q408,100 418,98 M392,45 L422,45" />
      <path bind:this={pathEls[8]} d="M438,65 Q438,40 455,40 Q472,42 472,65 Q472,90 455,92 Q438,90 438,65" />
      <path bind:this={pathEls[9]} d="M512,105 Q510,62 512,18 Q514,15 535,15 L548,15 Q568,18 568,35 Q566,52 548,52 L512,50" />
      <path bind:this={pathEls[10]} d="M512,50 L550,52 Q575,55 572,75 Q570,92 550,90 L530,88 Q512,85 512,105" />
      <path bind:this={pathEls[11]} d="M592,60 Q595,40 612,40 Q630,42 628,60 L592,62 Q590,88 612,90 Q625,88 630,78" />
      <path bind:this={pathEls[12]} d="M648,60 Q650,40 668,40 Q685,42 682,60 L648,62 Q645,88 668,90 Q680,88 685,78" />
      <path bind:this={pathEls[13]} d="M712,50 Q705,38 702,50 Q698,60 714,65 Q730,72 726,85 Q722,98 710,92" />
      <path bind:this={pathEls[14]} d="M745,25 Q742,58 745,92 Q748,100 758,98 M732,45 L762,45" />
    </svg>
    {#if showEnter}
      <button class="enter-btn" onclick={enterSky}>Enter</button>
    {/if}
    <img
      src="/images/beest2.webp"
      alt=""
      class="beest"
      style="transform: translateY({beestY}%); opacity: {beestProgress};"
    />
    <img src="/images/Beach.webp" alt="" class="layer beach" />
    <img src="/images/Water%20swooosh.webp" alt="" class="layer water" />
    <img
      src="/images/cloud-left.webp"
      alt=""
      class="cloud cloud-left"
      style="transform: translate({-translateX}vw, {translateY}vh) scale({scale});"
    />
    <img
      src="/images/cloud-right.webp"
      alt=""
      class="cloud cloud-right"
      style="transform: translate({translateX}vw, {translateY}vh) scale({scale});"
    />
    {#if indicatorOpacity > 0}
      <div class="scroll-indicator" style="opacity: {indicatorOpacity};">
        <div class="scroll-arrow"></div>
        <div class="scroll-arrow delay"></div>
        <span class="scroll-label">Scroll up</span>
      </div>
    {/if}
  </div>
</div>

{#if transitioned}
<div class="sky-scroll" style="height: {innerHeight * 6}px;" bind:this={skyEl}>
  <div class="sky-tile"></div>
  <div class="sky-tint" style="background: linear-gradient(to bottom, {gradientStops});"></div>
  {#each clouds as cloud}
    <img
      src="/images/cloud.webp"
      alt=""
      class="scattered-cloud"
      style="
        top: {cloud.top}%;
        left: {cloud.left}%;
        opacity: {cloud.opacity};
        filter: {cloudFilter(cloud.top)};
      "
    />
  {/each}
  <img
    src="/images/cloud.webp"
    alt=""
    class="go-cloud"
    style="top: {innerHeight + innerHeight * 0.35}px;"
  />
  <!-- Section 0: Go! (top — last seen) -->
  <div class="section-content go-section" style="top: {innerHeight}px;">
    <h2 class="section-title">Go!</h2>
    <p class="section-paragraph">You're all set to build — community and prizes await you, but if you ever get stuck you can always replay this tutorial, read the <a href="/faq" class="section-link">FAQ</a> or ask in <a href="https://hackclub.enterprise.slack.com/archives/C0AQ4T1CWH2" target="_blank" rel="noopener" class="section-link">#beest-help</a> on Slack.</p>
    <a href="/home" class="action-btn go-home-btn">Go to Home</a>
  </div>

  <!-- Section 1: Create a Project -->
  <div class="section-content" style="top: {innerHeight * 2}px;">
    <h2 class="section-title">Create a Project</h2>
    <div class="projects-row">
      <button class="project-card create-card">
        <span class="create-icon">+</span>
        <span class="create-label">Create Project</span>
      </button>
    </div>
  </div>

  <!-- Section 2: Connect Hackatime -->
  <div class="section-content" style="top: {innerHeight * 3}px;">
    <h2 class="section-title">Connect Hackatime</h2>
    <p class="section-paragraph">Track your build time and unlock rewards by connecting Hackatime to your project.</p>
    {#if data.onboarding.hackatime}
      <button class="action-btn complete-btn" onclick={() => goToSection(1)}>Complete! Move on?</button>
    {:else}
      <form method="POST" action="/api/auth/hackatime/start">
        <button type="submit" class="action-btn">Connect Hackatime</button>
      </form>
    {/if}
  </div>

  <img
    src="/images/cloud.webp"
    alt=""
    class="projects-cloud"
    style="top: {innerHeight * 4}px;"
  />
  <!-- Section 3: Join Slack (bottom — first seen after landing) -->
  <div class="section-content" style="top: {innerHeight * 4}px;">
    <h2 class="section-title">Join Slack</h2>
    {#if slackStatus === 'full_member'}
      <p class="section-paragraph">It looks like you are already on the Hack Club Slack! We're so glad to have you :)</p>
      <button class="action-btn complete-btn" onclick={() => goToSection(2)}>Move on</button>
    {:else if slackStatus === 'guest'}
      <p class="section-paragraph">It looks like you haven't fully joined our Slack, that's where the magic happens. Check your email, join the conversation and then try hitting refresh.</p>
      <div class="slack-actions">
        <a href="https://hackclub.com/slack/" target="_blank" rel="noopener" class="action-btn">Join Slack</a>
        <button class="action-btn refresh-btn" disabled={slackRefreshing} onclick={refreshSlack}>
          {slackRefreshing ? 'Checking...' : 'Refresh'}
        </button>
      </div>
      <button class="skip-btn" onclick={() => goToSection(2)}>I'll do this later</button>
    {:else}
      <p class="section-paragraph">Join the Hack Club Slack to meet other builders, get help, and share your progress.</p>
      <div class="slack-actions">
        <a href="https://hackclub.com/slack/" target="_blank" rel="noopener" class="action-btn">Join Slack</a>
        <button class="action-btn refresh-btn" disabled={slackRefreshing} onclick={refreshSlack}>
          {slackRefreshing ? 'Checking...' : 'Refresh'}
        </button>
      </div>
      <button class="skip-btn" onclick={() => goToSection(2)}>I'll do this later</button>
    {/if}
  </div>
  <div class="sky-hero">
    <img src="/images/beest2.webp" alt="" class="hero-beest" />
    <img src="/images/Beach.webp" alt="" class="hero-beach" />
    <img src="/images/Water%20swooosh.webp" alt="" class="hero-water" />
  </div>
</div>
{#if locked}
<nav class="section-tabs" class:nav-locked={navigating}>
  {#each sections as name, i}
    <button class="section-tab" class:active={activeSection === i} onclick={() => goToSection(i)}>{name}</button>
  {/each}
</nav>
{/if}
{/if}

<style>
  .scroll-container {
    height: 1400vh;
    background: #2e3563;
  }

  .scroll-container.collapsed {
    height: 200vh;
  }

  .sticky-frame {
    position: sticky;
    top: 0;
    height: 100vh;
    width: 100%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: url('/images/sky.webp') center / cover no-repeat;
    transition: transform 1.2s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 1;
  }

  .enter-btn {
    position: absolute;
    top: 22%;
    left: 5%;
    z-index: 5;
    background: rgba(255, 255, 255, 0.15);
    border: 2px solid rgba(255, 255, 255, 0.6);
    color: white;
    font-size: 1.2rem;
    padding: 0.8rem 2.5rem;
    border-radius: 2rem;
    cursor: pointer;
    backdrop-filter: blur(8px);
    animation: fade-in 0.6s ease;
  }

  .enter-btn:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  @keyframes fade-in {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .draw-text {
    position: absolute;
    top: 5%;
    left: 5%;
    width: 50vw;
    z-index: 0;
  }

  .draw-text path {
    fill: none;
    stroke: white;
    stroke-width: 5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .beest {
    position: absolute;
    bottom: 0;
    right: 5%;
    height: 70vh;
    object-fit: contain;
    will-change: transform;
    z-index: 10;
  }

  .layer {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    object-fit: cover;
    object-position: bottom;
  }

  .beach {
    width: 120%;
    left: -10%;
    bottom: -5vh;
    transform: scale(1.3);
    transform-origin: bottom center;
  }

  .cloud {
    position: absolute;
    width: 100vw;
    height: 100vh;
    object-fit: cover;
    will-change: transform;
    margin-top: -30vh;
  }

  .tile-bg {
    position: fixed;
    inset: 0;
    background: url('/images/bg-tile.webp') repeat;
    z-index: -1;
  }


  /* ── Scroll indicator ── */
  .scroll-indicator {
    position: absolute;
    bottom: 5vh;
    left: 2rem;
    z-index: 12;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    pointer-events: none;
  }

  .scroll-arrow {
    width: 1.8rem;
    height: 1.8rem;
    border-left: 5px solid white;
    border-top: 5px solid white;
    transform: rotate(45deg);
    animation: bounce-up 1.6s ease-in-out infinite;
    opacity: 0.8;
  }

  .scroll-arrow.delay {
    animation-delay: 0.2s;
    opacity: 0.5;
  }

  @keyframes bounce-up {
    0%, 100% { transform: rotate(45deg) translateX(0) translateY(0); }
    50% { transform: rotate(45deg) translateX(-6px) translateY(-6px); }
  }

  .scroll-label {
    color: white;
    font-size: 1.3rem;
    font-weight: bold;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    margin-top: 0.8rem;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.7);
  }

  .hidden {
    display: none !important;
  }

  /* ── Sky scroll area ── */
  .sky-scroll {
    position: relative;
    overflow: hidden;
  }


  .sky-tile {
    position: absolute;
    inset: 0;
    background: url('/images/bg-tile.webp') repeat;
  }

  .sky-tint {
    position: absolute;
    inset: 0;
    mix-blend-mode: color;
  }

  .projects-cloud {
    position: absolute;
    right: -10%;
    width: 40vw;
    height: auto;
    z-index: 2;
    pointer-events: none;
  }

  .go-cloud {
    position: absolute;
    left: 55%;
    transform: translateX(calc(-50% + 40px)) translateY(-15%);
    width: 80vw;
    height: auto;
    z-index: 1;
    pointer-events: none;
  }

  .sky-hero {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 100vh;
    background: url('/images/sky.webp') center / cover no-repeat;
    z-index: 1;
    overflow: hidden;
  }

  .hero-beest {
    position: absolute;
    bottom: 0;
    right: 5%;
    height: 70vh;
    object-fit: contain;
    z-index: 3;
  }

  .hero-beach {
    position: absolute;
    bottom: -5vh;
    left: -10%;
    width: 120%;
    object-fit: cover;
    object-position: bottom;
    transform: scale(1.3);
    transform-origin: bottom center;
    z-index: 2;
  }

  .hero-water {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    object-fit: cover;
    object-position: bottom;
    z-index: 2;
  }

  .scattered-cloud {
    position: absolute;
    width: 55vw;
    height: auto;
    pointer-events: none;
    z-index: 1;
  }

  .section-content {
    position: absolute;
    left: 0;
    width: 100%;
    height: 100vh;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 8vw;
    box-sizing: border-box;
  }

  .section-title {
    color: white;
    font-size: 2.5rem;
    margin-bottom: 2rem;
    text-align: center;
  }

  .go-section .section-title,
  .go-section .section-paragraph,
  .go-section .section-link {
    color: black;
    font-weight: bold;
  }

  .go-home-btn {
    text-decoration: none;
    background: #47453f;
    color: white;
    font-weight: bold;
  }

  .go-home-btn:hover {
    background: #5a574f;
  }

  .go-section .section-title,
  .go-section .section-paragraph {
    text-shadow: 2px 2px 0 rgba(71, 69, 63, 0.35);
  }

  /* ── Your Projects ── */
  .projects-row {
    display: flex;
    gap: 2rem;
    justify-content: center;
  }

  .project-card {
    background: white;
    border: 2px dashed #ccc;
    border-radius: 1rem;
    padding: 2rem;
    width: 260px;
    height: 340px;
    color: #222;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
  }

  .project-card:hover {
    border-color: #999;
    background: #f8f8f8;
  }

  .create-icon {
    font-size: 4rem;
    font-weight: 300;
    line-height: 1;
    color: #999;
    margin-bottom: 1rem;
  }

  .create-label {
    font-size: 1.1rem;
    color: #666;
  }


  .section-paragraph {
    color: white;
    font-size: 1.15rem;
    line-height: 1.8;
    max-width: 550px;
    text-align: center;
    margin-bottom: 2rem;
  }

  .section-link {
    color: white;
    text-decoration: underline;
  }

  .section-link:hover {
    opacity: 0.8;
  }

  .action-btn {
    background: white;
    color: #222;
    border: none;
    font-size: 1.1rem;
    padding: 0.8rem 2.5rem;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .action-btn:hover {
    background: #eee;
  }

  .complete-btn {
    background: #4ade80;
    color: #14532d;
    font-weight: bold;
  }

  .complete-btn:hover {
    background: #86efac;
  }

  .slack-actions {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .refresh-btn {
    background: rgba(255, 255, 255, 0.15);
    color: white;
    border: 2px solid rgba(255, 255, 255, 0.4);
    backdrop-filter: blur(8px);
  }

  .refresh-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.3);
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .skip-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.9rem;
    margin-top: 1rem;
    cursor: pointer;
    text-decoration: underline;
  }

  .skip-btn:hover {
    color: rgba(255, 255, 255, 0.8);
  }

  .section-tabs {
    position: fixed;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    z-index: 20;
    display: flex;
    flex-direction: column;
  }

  .nav-locked {
    pointer-events: none;
  }

  .section-tab {
    background: white;
    border: none;
    border-bottom: 1px solid #eee;
    color: #333;
    font-size: 0.85rem;
    padding: 0.7rem 1rem 0.7rem 1.2rem;
    cursor: pointer;
    text-align: right;
    white-space: nowrap;
    transition: background 0.2s, color 0.2s;
  }

  .section-tab:first-child {
    border-radius: 0.4rem 0 0 0;
  }

  .section-tab:last-child {
    border-radius: 0 0 0 0.4rem;
    border-bottom: none;
  }

  .section-tab.active {
    background: #222;
    color: white;
  }

  .section-tab:hover:not(.active) {
    background: #f0f0f0;
  }
</style>
