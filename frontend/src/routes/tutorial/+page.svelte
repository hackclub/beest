<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { beforeNavigate } from '$app/navigation';

  let { data } = $props();

  let scrollY = $state(0);
  let innerHeight = $state(800);

  let slackStatus = $state(data.onboarding.slack);
  let slackRefreshing = $state(false);
  let twoEmailsChecked = $state(false);

  async function confirmTwoEmails() {
    const res = await fetch('/api/onboarding/two-emails', { method: 'POST' });
    if (res.ok) goToSection(2);
  }

  // Create project form
  let showProjectForm = $state(false);
  let projectName = $state('');
  let projectDesc = $state('');
  let projectType = $state('');
  let projectSubmitting = $state(false);
  let projectError = $state('');
  let projectCreated = $state(data.onboarding.project);
  const canCreateProject = $derived(projectName.trim() && projectDesc.trim() && projectType);

  async function createProject() {
    if (!canCreateProject || projectSubmitting) return;
    projectSubmitting = true;
    projectError = '';
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectName.trim(),
          description: projectDesc.trim(),
          projectType,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        projectError = body?.message ?? 'Something went wrong';
        return;
      }
      projectCreated = true;
      showProjectForm = false;
    } finally {
      projectSubmitting = false;
    }
  }

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

  // Time-based animation progress (0 → 1) instead of scroll-driven
  const ANIM_DURATION = 3000; // ms for full intro animation
  let progress = $state(0);
  let animStartTime = $state(0);

  // SVG text draw progress — starts after clouds are off screen, finishes by end
  const drawProgress = $derived(Math.min(Math.max((progress - 0.4) / 0.5, 0), 1));

  // Beest rises from bottom after text finishes drawing
  const beestProgress = $derived(Math.min(Math.max((progress - 0.7) / 0.15, 0), 1));
  const beestY = $derived((1 - beestProgress) * 100);

  // Clouds start overlapped, then split apart, drift up, and scale up
  const translateX = $derived(progress * 110);
  const translateY = $derived(progress * -15);
  const scale = $derived(1 + progress * 0.3);

  let transitioned = $state(false);
  let skyEl = $state<HTMLElement>();
  let locked = $state(false);
  const showStart = $derived(progress >= 1 && !transitioned);

  let animRunning = $state(false);

  function startIntroAnimation() {
    animRunning = true;
    animStartTime = performance.now();
    function step(now: number) {
      if (!animRunning) return;
      const elapsed = now - animStartTime;
      progress = Math.min(elapsed / ANIM_DURATION, 1);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        animRunning = false;
      }
    }
    requestAnimationFrame(step);
  }

  function skipIntro() {
    if (!animRunning) return;
    animRunning = false;
    progress = 1;
  }

  async function enterSky() {
    transitioned = true;
    await tick();
    // Start one section below landing, animate scroll up to landing
    const landingPos = skyEl!.offsetTop + skyEl!.offsetHeight - innerHeight * 2;
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
      const top = skyEl.offsetTop + innerHeight;
      const bottom = skyEl.offsetTop + skyEl.offsetHeight - innerHeight;
      if (scrollY < top) {
        window.scrollTo(0, top);
      } else if (scrollY > bottom) {
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

  // Block manual scrolling once in sky sections — only allow programmatic nav
  function blockScroll(e: Event) {
    if (locked && !navigating) e.preventDefault();
  }

  const scrollKeys = new Set(['ArrowUp', 'ArrowDown', 'Space', 'PageUp', 'PageDown', 'Home', 'End']);
  function blockKeys(e: KeyboardEvent) {
    if (locked && scrollKeys.has(e.code)) e.preventDefault();
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
      // Skip intro animation and jump directly to the requested section
      progress = 1;
      transitioned = true;
      locked = true;
      tick().then(() => {
        if (skyEl) {
          window.scrollTo(0, skyEl.offsetTop + sectionMultipliers[data.stage!] * innerHeight);
        }
      });
    } else {
      // Auto-play the intro animation
      window.scrollTo(0, 0);
      setTimeout(startIntroAnimation, 500);
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

<div class="scroll-container" class:hidden={locked}>
  <div class="tile-bg" class:hidden={locked || transitioned}></div>
  <div class="sticky-frame" role="button" tabindex="0" onclick={skipIntro} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') skipIntro(); }}>
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
    {#if showStart}
      <button class="start-btn" onclick={enterSky}>Start</button>
    {/if}
    <img
      src="/images/beest2.webp"
      alt=""
      class="beest"
      decoding="async"
      style="transform: translateY({beestY}%); opacity: {beestProgress};"
    />
    <img src="/images/Beach.webp" alt="" class="layer beach" decoding="async" />
    <img src="/images/Water%20swooosh.webp" alt="" class="layer water" decoding="async" />
    <img
      src="/images/cloud-left.webp"
      alt=""
      class="cloud cloud-left"
      decoding="async"
      style="transform: translate({-translateX}vw, {translateY}vh) scale({scale});"
    />
    <img
      src="/images/cloud-right.webp"
      alt=""
      class="cloud cloud-right"
      decoding="async"
      style="transform: translate({translateX}vw, {translateY}vh) scale({scale});"
    />
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
      loading="lazy"
      decoding="async"
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
    loading="lazy"
    decoding="async"
    style="top: {innerHeight + innerHeight * 0.35}px;"
  />
  <!-- Section 0: Go! (top — last seen) -->
  <div class="section-content go-section" style="top: {innerHeight}px;">
    <div class="go-box">
      <p class="section-paragraph">You're all set! If you get stuck you can replay this tutorial, read the <a href="/faq" class="section-link">FAQ</a> or ask in <a href="https://hackclub.enterprise.slack.com/archives/C0AQ4T1CWH2" target="_blank" rel="noopener" class="section-link">#beest-help</a>.</p>
      <a href="/home" class="action-btn go-home-btn" data-sveltekit-reload>GO!</a>
    </div>
  </div>

  <!-- Section 1: Create a Project -->
  <div class="section-content" style="top: {innerHeight * 2}px;">
    <h2 class="section-title">Create a Project</h2>
    <p class="section-paragraph">Tell us your idea! It doesn't have to be related to the beest, make an automation you've always wanted or a game for you and your friends. Make anything! (Just not AI slop or college projects, we only want to reward creativity and real learning.)</p>
    {#if projectCreated && !showProjectForm}
      <button class="action-btn complete-btn" onclick={() => goToSection(0)}>Project created! Move on?</button>
    {:else if showProjectForm}
      <div class="project-form">
        <label class="form-label" for="tut-name">Project Name</label>
        <input id="tut-name" class="form-field" type="text" maxlength="50" bind:value={projectName} placeholder="My cool project" />

        <label class="form-label" for="tut-desc">Description</label>
        <textarea id="tut-desc" class="form-field form-textarea" maxlength="300" bind:value={projectDesc} placeholder="What does it do?"></textarea>

        <label class="form-label" for="tut-type">Project Type</label>
        <select id="tut-type" class="form-field" bind:value={projectType}>
          <option value="" disabled selected>Select a type</option>
          <option value="web">Web</option>
          <option value="windows">Windows</option>
          <option value="mac">Mac</option>
          <option value="linux">Linux</option>
          <option value="cross-platform">Cross Platform</option>
          <option value="python">Python</option>
          <option value="android">Android</option>
          <option value="ios">iOS</option>
        </select>

        {#if projectError}
          <p class="form-error">{projectError}</p>
        {/if}

        <div class="form-actions">
          <button class="create-submit-btn" disabled={!canCreateProject || projectSubmitting} onclick={createProject}>
            {projectSubmitting ? 'Creating...' : 'Create'}
          </button>
          <button class="skip-btn" onclick={() => { showProjectForm = false; }}>Cancel</button>
        </div>
      </div>
    {:else}
      <button class="project-card create-card" onclick={() => { showProjectForm = true; }}>
        <span class="create-icon">+</span>
        <span class="create-label">Create Project</span>
      </button>
    {/if}
  </div>

  <!-- Section 2: Connect Hackatime -->
  <div class="section-content" style="top: {innerHeight * 3}px;">
    <h2 class="section-title">Connect Hackatime</h2>
    <p class="section-paragraph">We want to reward you for time spent building, so we made Hackatime! Its like a smart stopwatch that automatically tracks how long you code for, and it works in all your existing code editors. To be rewarded for your work youll need to set up an account on <a href="https://hackatime.hackclub.com" target="_blank" rel="noopener" class="section-link">hackatime.hackclub.com</a> and then hit connect to link it to Beest!</p>
    {#if data.onboarding.hackatime}
      <button class="action-btn complete-btn" onclick={() => goToSection(1)}>Complete! Move on?</button>
    {:else}
      <form method="POST" action="/api/auth/hackatime/start">
        <button type="submit" class="action-btn">Connect Hackatime</button>
      </form>
      <button class="skip-btn" onclick={() => goToSection(1)}>I'll do this later</button>
    {/if}
  </div>

  <img
    src="/images/cloud.webp"
    alt=""
    class="projects-cloud"
    loading="lazy"
    decoding="async"
    style="top: {innerHeight * 4}px;"
  />
  <!-- Section 3: Join Slack (bottom — first seen after landing) -->
  <div class="section-content" style="top: {innerHeight * 4}px;">
    <h2 class="section-title">Join Slack</h2>
    {#if slackStatus === 'full_member'}
      <p class="section-paragraph">It looks like you are already on the Hack Club Slack! We're so glad to have you :)</p>
      <button class="action-btn complete-btn" onclick={() => goToSection(2)}>Move on</button>
    {:else if slackStatus === 'guest'}
      <p class="section-paragraph">Hey! It looks like you are new to our community! Check your email for a message from Slack, then follow the instructions in #welcome-to-hack-club. Slack is where everyone is talking - theres 100 THOUSAND technical teens waiting to hear from you.</p>
      <button class="action-btn" class:complete-btn={twoEmailsChecked} class:refresh-btn={!twoEmailsChecked} disabled={slackRefreshing && !twoEmailsChecked} onclick={twoEmailsChecked ? confirmTwoEmails : refreshSlack}>
        {twoEmailsChecked ? 'Got it, Move on!' : slackRefreshing ? 'Checking...' : 'Refresh'}
      </button>
      <label class="two-emails-label">
        <input type="checkbox" bind:checked={twoEmailsChecked} />
        I use Hack Club Slack on a different email
      </label>
      <button class="skip-btn" onclick={() => goToSection(2)}>I'll do this later</button>
    {:else}
      <p class="section-paragraph">Join the Hack Club Slack to meet other builders, get help, and share your progress.</p>
      <button class="action-btn" class:complete-btn={twoEmailsChecked} class:refresh-btn={!twoEmailsChecked} disabled={slackRefreshing && !twoEmailsChecked} onclick={twoEmailsChecked ? confirmTwoEmails : refreshSlack}>
        {twoEmailsChecked ? 'Got it, Move on!' : slackRefreshing ? 'Checking...' : 'Refresh'}
      </button>
      <label class="two-emails-label">
        <input type="checkbox" bind:checked={twoEmailsChecked} />
        I use Hack Club Slack on a different email
      </label>
      <button class="skip-btn" onclick={() => goToSection(2)}>I'll do this later</button>
    {/if}
  </div>
  <div class="sky-hero">
    <img src="/images/beest2.webp" alt="" class="hero-beest" loading="lazy" decoding="async" />
    <img src="/images/Beach.webp" alt="" class="hero-beach" loading="lazy" decoding="async" />
    <img src="/images/Water%20swooosh.webp" alt="" class="hero-water" loading="lazy" decoding="async" />
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
  :global(body) {
    margin: 0;
    padding: 0;
    filter: none !important;
  }

  @font-face {
    font-family: "Sunny Mood";
    src: url("/fonts/SunnyMood.woff2") format("woff2");
    font-weight: normal;
    font-style: normal;
    font-display: swap;
  }

  .scroll-container {
    height: 100vh;
    background: #2e3563;
  }

  .start-btn {
    position: absolute;
    top: 22%;
    left: 5%;
    z-index: 5;
    background: white;
    border: 4px solid #222;
    border-bottom: 8px solid #222;
    color: #222;
    font-size: 1.2rem;
    font-weight: bold;
    padding: 0.8rem 2.5rem;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: transform 0.1s, border-bottom-width 0.1s;
    user-select: none;
  }

  .start-btn:hover {
    background: #f5f5f5;
  }

  .start-btn:active {
    transform: translateY(4px);
    border-bottom-width: 4px;
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
    width: 90vw;
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
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 3rem;
    margin-bottom: 2rem;
    text-align: center;
    text-shadow: 3px 3px 6px rgba(0, 0, 0, 0.6);
  }

  .go-box {
    background: white;
    border: 3px solid #222;
    border-radius: 0.6rem;
    padding: 0.8rem 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: fit-content;
    margin-top: 9rem;
  }

  .go-box .section-paragraph {
    margin-bottom: 1rem;
    max-width: 500px;
    text-wrap: balance;
  }

  .go-section .section-paragraph,
  .go-section .section-link {
    color: #222;
    font-weight: bold;
    text-shadow: none;
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


  /* ── Create Project Form ── */
  .project-form {
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    border: 3px solid #222;
    border-radius: 0.6rem;
    padding: 1.5rem;
    background: white;
    color: #222;
    margin: 0 auto;
  }

  .form-label {
    color: #222;
    font-size: 0.95rem;
    font-weight: bold;
    margin-top: 0.5rem;
  }

  .form-field {
    width: 100%;
    padding: 0.7rem 0.9rem;
    font-size: 1rem;
    border: 3px solid #222;
    border-radius: 0.4rem;
    background: white;
    color: #222;
    box-sizing: border-box;
  }

  .form-field:focus {
    outline: none;
    border-color: #222;
  }

  .form-textarea {
    resize: vertical;
    min-height: 80px;
  }

  select.form-field {
    appearance: none;
    cursor: pointer;
  }

  .form-error {
    color: #ff6b6b;
    font-size: 0.9rem;
    margin: 0;
  }

  .form-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1.5rem;
  }

  .create-submit-btn {
    background: white;
    color: #222;
    border: 4px solid #222;
    border-bottom: 8px solid #222;
    border-radius: 0.5rem;
    font-size: 1.1rem;
    font-weight: bold;
    padding: 0.8rem 2.5rem;
    cursor: pointer;
    transition: transform 0.1s, border-bottom-width 0.1s;
    user-select: none;
  }

  .create-submit-btn:hover:not(:disabled) {
    background: #f5f5f5;
  }

  .create-submit-btn:active:not(:disabled) {
    transform: translateY(4px);
    border-bottom-width: 4px;
  }

  .create-submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .project-card {
    background: white;
    border: 4px solid #222;
    border-bottom: 8px solid #222;
    border-radius: 1rem;
    padding: 2rem;
    width: 260px;
    height: 170px;
    color: #222;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    margin: 0 auto;
    transition: transform 0.1s, border-bottom-width 0.1s;
    user-select: none;
  }

  .project-card:hover {
    background: #f5f5f5;
  }

  .project-card:active {
    transform: translateY(4px);
    border-bottom-width: 4px;
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
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 1.3rem;
    line-height: 1.8;
    max-width: 550px;
    text-align: center;
    margin-bottom: 2rem;
    text-shadow: 3px 3px 6px rgba(0, 0, 0, 0.6);
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
    border: 4px solid #222;
    border-bottom: 8px solid #222;
    font-size: 1.1rem;
    font-weight: bold;
    padding: 0.8rem 2.5rem;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: transform 0.1s, border-bottom-width 0.1s;
    user-select: none;
  }

  .action-btn:hover {
    background: #f5f5f5;
  }

  .action-btn:active {
    transform: translateY(4px);
    border-bottom-width: 4px;
  }

  .complete-btn {
    background: #4ade80;
    color: #14532d;
    border-color: #14532d;
  }

  .complete-btn:hover {
    background: #86efac;
  }

  .refresh-btn {
    background: white;
    color: #222;
    border-color: #222;
  }

  .refresh-btn:hover:not(:disabled) {
    background: #f5f5f5;
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .two-emails-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.9rem;
    margin-top: 1rem;
    cursor: pointer;
    user-select: none;
  }

  .two-emails-label input {
    cursor: pointer;
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
