<!-- src/routes/home/+page.svelte -->
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

  let activeSection = $state('projects');
  let tileLoaded = $state(false);
  let creatingProject = $state(false);

  let projectName = $state('');
  let projectDesc = $state('');
  let projectType = $state('');
  let codeUrl = $state('');
  let demoUrl = $state('');
  let readmeUrl = $state('');
  let screenshotFiles = $state<(File | null)[]>([null, null]);
  let screenshotPreviews = $state<string[]>(['', '']);
  let hackatimeProject = $state('');
  let hackatimeProjects = $state<string[]>([]);
  let hackatimeLoading = $state(false);
  let submitting = $state(false);
  let formError = $state('');
  let auditLog = $state<{ action: string; label: string; createdAt: string }[]>([]);
  let totalHours = $state(0);
  const GOAL_HOURS = 40;
  let progressPct = $derived(Math.min((totalHours / GOAL_HOURS) * 100, 100));
  let focusedField = $state(0);
  let canSubmit = $derived(projectName.trim() !== '' && projectDesc.trim() !== '' && projectType !== '' && !submitting);

  function openCreateProject() {
    creatingProject = true;
  }

  function cancelCreateProject() {
    creatingProject = false;
    projectName = '';
    projectDesc = '';
    projectType = '';
    codeUrl = '';
    demoUrl = '';
    readmeUrl = '';
    screenshotFiles = [null, null];
    screenshotPreviews = ['', ''];
    hackatimeProject = '';
  }

  function handleScreenshot(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      formError = 'Screenshot must be under 5 MB';
      input.value = '';
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
      formError = 'Screenshot must be a PNG, JPEG, GIF, or WebP image';
      input.value = '';
      return;
    }
    const idx = screenshotPreviews[0] === '' ? 0 : 1;
    screenshotFiles[idx] = file;
    screenshotPreviews[idx] = URL.createObjectURL(file);
    formError = '';
    input.value = '';
  }

  function fileToDataUri(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function fetchProjectHours() {
    try {
      const res = await fetch('/api/projects/hours');
      if (res.ok) {
        const data = await res.json();
        totalHours = data.hours ?? 0;
      }
    } catch { /* silent */ }
  }

  async function fetchAuditLog() {
    try {
      const res = await fetch('/api/audit-log');
      if (res.ok) {
        const data = await res.json();
        auditLog = Array.isArray(data) ? data : [];
      }
    } catch { /* silent */ }
  }

  function timeAgo(dateStr: string): string {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w ago`;
  }

  async function fetchHackatimeProjects() {
    hackatimeLoading = true;
    try {
      const res = await fetch('/api/hackatime/projects');
      if (res.ok) {
        const data = await res.json();
        hackatimeProjects = data.projects ?? [];
      }
    } catch { /* silently fail — dropdown stays empty */ }
    hackatimeLoading = false;
  }

  async function submitProject() {
    if (!canSubmit) return;
    formError = '';
    submitting = true;

    try {
      const screenshots: string[] = [];
      for (const file of screenshotFiles) {
        if (file) screenshots.push(await fileToDataUri(file));
      }

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectName,
          description: projectDesc,
          projectType,
          codeUrl: codeUrl || undefined,
          readmeUrl: readmeUrl || undefined,
          demoUrl: demoUrl || undefined,
          screenshots: screenshots.length ? screenshots : undefined,
          hackatimeProjectName: hackatimeProject || undefined
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        formError = data.message || 'Failed to create project';
        submitting = false;
        return;
      }

      cancelCreateProject();
      fetchAuditLog();
    } catch {
      formError = 'Something went wrong. Please try again.';
    }
    submitting = false;
  }


  const shopItems = [
    { src: '/images/shop/blahaj.webp', caption: 'Blahaj Plush', hours: 40 },
    { src: '/images/shop/flight-stipend.webp', caption: 'Flight Stipend', hours: 40 },
    { src: '/images/shop/framework.webp', caption: 'Framework Laptop', hours: 200 },
    { src: '/images/shop/headphones.webp', caption: 'Headphones', hours: 80 },
    { src: '/images/shop/polaroid.webp', caption: 'Polaroid Camera', hours: 60 },
    { src: '/images/shop/poster.webp', caption: 'Beest Poster', hours: 20 },
    { src: '/images/shop/printer.webp', caption: '3D Printer', hours: 150 },
    { src: '/images/shop/stickers.webp', caption: 'Sticker Pack', hours: 10 }
  ];

  const navItems = [
    { id: 'projects', label: 'Projects' },
    { id: 'shop', label: 'Shop' },
    { id: 'explore', label: 'Explore' },
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'faq', label: 'FAQ' },
    { id: 'settings', label: 'Settings' },
    { id: 'tutorial', label: 'Tutorial' }
  ];

  function navigate(id: string) {
    if (id === 'faq') { window.location.href = '/FAQ'; return; }
    if (id === 'tutorial') { window.location.href = '/tutorial'; return; }
    if (creatingProject) cancelCreateProject();
    activeSection = id;
  }

  onMount(() => {
    const tileImg = new Image();
    tileImg.src = '/images/tile.webp';
    tileImg.onload = () => { tileLoaded = true; };
    fetchHackatimeProjects();
    fetchAuditLog();
    fetchProjectHours();
  });
</script>

<div class="home" class:tile-loaded={tileLoaded}>

  <!-- Sidebar -->
  <nav class="sidebar pinned" aria-label="Home navigation">
    <div class="sidebar-panel">
      <div class="sidebar-content">
        <a href="/" class="sidebar-brand">#BEEST</a>
        <p class="sidebar-greeting">Hey {(data.user.name ?? 'there!').split(' ')[0]}</p>
        <ul class="sidebar-nav">
          {#each navItems as item}
            <li>
              <button
                class="nav-btn"
                class:active={activeSection === item.id}
                onclick={() => navigate(item.id)}
              >
                {item.label}
              </button>
            </li>
          {/each}
        </ul>
        <a href="https://forms.hackclub.com/beest-stickers" target="_blank" rel="noopener" class="sticker-promo">
          <img src="/images/sticker.webp" alt="Beest sticker" class="sticker-img" />
          <span class="sticker-text">Get Stickers</span>
        </a>
        <div class="sidebar-footer">
          <a href="/api/auth/logout" class="logout-link">Log Out</a>
        </div>
      </div>
    </div>
    <div class="teeth outer" aria-hidden="true"></div>
    <div class="teeth inner" aria-hidden="true"></div>
    <div class="expand-hint" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 18l6-6-6-6" />
      </svg>
    </div>
  </nav>

  <!-- Main content -->
  <main class="main">

    {#if creatingProject}
    <div class="create-project-form">
      <div class="form-header">
        <h2 class="form-title">Create a Project</h2>
        <button class="form-cancel" onclick={cancelCreateProject}>&times;</button>
      </div>

      <div class="form-grid">
        <div class="form-group">
          <label class="form-label" for="project-name">Project Name <span class="required">*</span></label>
          <input id="project-name" type="text" class="form-input" maxlength={50} placeholder="My Awesome Project" bind:value={projectName} onfocus={() => focusedField = 0} />
          <div class="form-caption-row">
            <span class="form-caption">Give your project a name</span>
            <span class="form-charcount" class:over={projectName.length >= 50}>{projectName.length}/50</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="project-desc">Description <span class="required">*</span></label>
          <textarea id="project-desc" class="form-input form-textarea" maxlength={300} placeholder={"Project goal:\nMy tech stack:\nHow long it took:"} bind:value={projectDesc} onfocus={() => focusedField = 1}></textarea>
          <div class="form-caption-row">
            <span class="form-caption">Describe your idea</span>
            <span class="form-charcount" class:over={projectDesc.length >= 300}>{projectDesc.length}/300</span>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="code-url">Code URL</label>
            <input id="code-url" type="url" class="form-input" placeholder="https://github.com/hackclub/" bind:value={codeUrl} onfocus={() => focusedField = 2} />
            <span class="form-caption">Link to your source code (GitHub, GitLab, etc)</span>
          </div>
          <div class="form-group">
            <label class="form-label" for="readme-url">README URL</label>
            <input id="readme-url" type="url" class="form-input" placeholder="https://github.com/hackclub/hackclub/blob/main/README.md" bind:value={readmeUrl} onfocus={() => focusedField = 3} />
            <span class="form-caption">Link to your project's README file</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="demo-url">Demo URL</label>
          <input id="demo-url" type="url" class="form-input" placeholder="https://hackclub.com" bind:value={demoUrl} onfocus={() => focusedField = 4} />
          <span class="form-caption">Link to a live demo or playable version</span>
        </div>

        <div class="form-group">
          <label class="form-label" for="screenshot">Screenshots</label>
          <div class="screenshot-row">
            <label class="upload-btn" for="screenshot">
              <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span class="upload-btn-text">Upload</span>
            </label>
            <div class="screenshot-box">
              {#if screenshotPreviews[0]}
                <img src={screenshotPreviews[0]} alt="Preview 1" class="screenshot-preview" />
                <button class="screenshot-remove" onclick={() => { screenshotFiles[0] = null; screenshotPreviews[0] = ''; }}>&times;</button>
              {/if}
            </div>
            <div class="screenshot-box">
              {#if screenshotPreviews[1]}
                <img src={screenshotPreviews[1]} alt="Preview 2" class="screenshot-preview" />
                <button class="screenshot-remove" onclick={() => { screenshotFiles[1] = null; screenshotPreviews[1] = ''; }}>&times;</button>
              {/if}
            </div>
          </div>
          <input id="screenshot" type="file" accept="image/*" class="form-file-hidden" onchange={handleScreenshot} />
          <span class="form-caption">Show off with a banner or screenshot</span>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="project-type">Project Type <span class="required">*</span></label>
            <select id="project-type" class="form-input form-select" bind:value={projectType} onfocus={() => focusedField = 5}>
              <option value="" disabled selected>Select a type</option>
              <option value="web">Web Playable</option>
              <option value="windows">Windows Playable</option>
              <option value="mac">Mac Playable</option>
              <option value="linux">Linux Playable</option>
              <option value="cross-platform">Cross Platform Compatible</option>
              <option value="python">Python</option>
              <option value="android">Android Playable</option>
              <option value="ios">iOS Playable</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="hackatime">Hackatime Project/s</label>
            <div class="hackatime-row">
              <select id="hackatime" class="form-input form-select" bind:value={hackatimeProject} onfocus={() => focusedField = 6}>
                <option value="" disabled selected>Select a project</option>
                {#if hackatimeLoading}
                  <option value="" disabled>Loading...</option>
                {:else if hackatimeProjects.length === 0}
                  <option value="" disabled>No projects found</option>
                {:else}
                  {#each hackatimeProjects as proj}
                    <option value={proj}>{proj}</option>
                  {/each}
                {/if}
              </select>
              <button type="button" class="refresh-btn" onclick={fetchHackatimeProjects} disabled={hackatimeLoading} title="Refresh Hackatime projects">
                <svg class="refresh-icon" class:spinning={hackatimeLoading} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {#if formError}
        <p class="form-error">{formError}</p>
      {/if}

      <div class="form-actions">
        <button class="form-btn-cancel" onclick={cancelCreateProject}>Cancel</button>
        <button class="form-btn-submit" disabled={!canSubmit} onclick={submitProject}>
          {#if submitting}Creating...{:else}Create Project{/if}
        </button>
      </div>

      <svg class="form-gear form-gear-1" style="transform: rotate({focusedField * 30}deg)" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g fill="#6c6659"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t (t)}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#635a4e"/>
      </svg>
      <svg class="form-gear form-gear-2" style="transform: rotate({-focusedField * 45 + 22.5}deg)" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g fill="#7f796d"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t (t)}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#635a4e"/>
      </svg>
      <svg class="form-gear form-gear-3" style="transform: rotate({focusedField * 60}deg)" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g fill="#6c6659"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t (t)}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#635a4e"/>
      </svg>
    </div>
    {/if}

    {#if !creatingProject && activeSection === 'projects'}
    <section class="section section-projects">
      <div class="section-inner">
        <div class="section-header">
          <div>
            <h2 class="section-title">My Projects</h2>
            <p class="section-subtitle">Track your progress and hours.</p>
          </div>
          <div class="progress-key">
            <span class="key-item"><span class="key-swatch approved"></span>Approved</span>
            <span class="key-item"><span class="key-swatch unreviewed"></span>Unreviewed</span>
            <span class="key-item"><span class="key-swatch unshipped"></span>Unshipped</span>
          </div>
        </div>

        <div class="progress-bar-wrap">
          <div class="progress-labels">
            <span class="progress-hours">{totalHours}h</span>
            <span class="progress-goal">{totalHours >= GOAL_HOURS ? 'Qualified!' : `${GOAL_HOURS}h to qualify`}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill unshipped" style="width: {progressPct}%"></div>
          </div>
          <div class="progress-ticks">
            <span>0</span>
            <span>10</span>
            <span>20</span>
            <span>30</span>
            <span>40</span>
          </div>
        </div>

        <div class="projects-empty">
          <p class="empty-text">No projects yet. Start building to earn hours!</p>
          <button class="action-btn" onclick={openCreateProject}>Create a Project</button>
        </div>

        <div class="bottom-row">
        <div class="action-log">
          <h3 class="action-log-title">Action Log</h3>
          <div class="timeline">
            {#if auditLog.length === 0}
              <p class="timeline-empty">No activity yet.</p>
            {:else}
              {#each auditLog as entry}
                <div class="timeline-item">
                  <div class="timeline-dot {entry.action === 'project_created' ? 'shipped' : entry.action === 'project_updated' ? 'updated' : 'feedback'}"></div>
                  <div class="timeline-content">
                    <p class="timeline-label">{entry.label}</p>
                    <span class="timeline-time">{timeAgo(entry.createdAt)}</span>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>

        <div class="news-box">
          <h3 class="news-title">News</h3>
          <div class="news-list">
            <div class="news-item">
              <span class="news-date">Mar 28</span>
              <p class="news-text">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
            </div>
            <div class="news-item">
              <span class="news-date">Mar 22</span>
              <p class="news-text">Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
            </div>
            <div class="news-item">
              <span class="news-date">Mar 15</span>
              <p class="news-text">Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.</p>
            </div>
            <div class="news-item">
              <span class="news-date">Mar 10</span>
              <p class="news-text">Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.</p>
            </div>
          </div>
        </div>
        </div>
      </div>
    </section>
    {/if}

    {#if activeSection === 'shop'}
    <section class="section section-shop">
      <div class="section-inner">
        <div class="shop-header">
          <div>
            <h2 class="section-title">Earn Prizes</h2>
            <p class="section-subtitle">Build projects, earn hours, unlock rewards.</p>
          </div>
          <div class="shoppable-box">
            <span class="shoppable-label">Shoppable Hours</span>
            <span class="shoppable-value">0h</span>
          </div>
        </div>
        <p class="shop-warning">Hours spent on shop detract from hours qualifying for event.</p>
        <div class="shop-grid">
          {#each shopItems as item}
            <article class="shop-card">
              <div class="shop-card-img">
                <img src={item.src} alt={item.caption} loading="lazy" decoding="async" />
              </div>
              <div class="shop-card-body">
                <p class="shop-card-name">{item.caption}</p>
                <p class="shop-card-cost">{item.hours}h</p>
              </div>
            </article>
          {/each}
        </div>
      </div>
    </section>
    {/if}

    {#if activeSection === 'explore'}
    <section class="section section-explore">
      <div class="section-inner">
        <h2 class="section-title">Explore</h2>
        <p class="section-subtitle">Discover what others are building, get inspiration!</p>
        <div class="explore-placeholder">
          <p class="coming-soon">Awaiting the first projects...</p>
          <div class="explore-grid">
            {#each Array(6) as _}
              <div class="explore-card-skeleton">
                <div class="skeleton-img"></div>
                <div class="skeleton-line wide"></div>
                <div class="skeleton-line narrow"></div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </section>
    {/if}

    {#if activeSection === 'leaderboard'}
    <section class="section section-leaderboard">
      <div class="section-inner">
        <div class="leaderboard-head">
          <div>
            <h2 class="section-title">Leaderboard</h2>
            <p class="section-subtitle">Top builders by hours logged.</p>
          </div>
          <div class="lb-total-users">
            <span class="lb-total-label">Total Users</span>
            <span class="lb-total-value">0</span>
          </div>
        </div>
        <div class="leaderboard-table">
          <div class="leaderboard-header">
            <span class="lb-rank">#</span>
            <span class="lb-name">Builder</span>
            <span class="lb-hours">Hours</span>
          </div>
          {#each Array(10) as _, i}
            <div class="leaderboard-row" class:top-three={i < 3}>
              <span class="lb-rank">{i + 1}</span>
              <span class="lb-name skeleton-text"></span>
              <span class="lb-hours skeleton-text short"></span>
            </div>
          {/each}
        </div>
        <p class="coming-soon">Awaiting the first projects...</p>
      </div>
    </section>
    {/if}

    {#if activeSection === 'settings'}
    <section class="section section-settings">
      <div class="section-inner">
        <h2 class="section-title settings-title">Settings</h2>
        <div class="settings-links">
          <a href="https://email-tools.hackclub.com/" target="_blank" rel="noopener" class="settings-link">
            <h3 class="settings-link-title">Email Preferences</h3>
            <p class="settings-link-desc">Manage your Hack Club email subscriptions and notifications.</p>
          </a>
          <a href="https://hackclub.com/privacy-and-terms/" target="_blank" rel="noopener" class="settings-link">
            <h3 class="settings-link-title">Privacy &amp; Terms</h3>
            <p class="settings-link-desc">Read our privacy policy and terms of service.</p>
          </a>
          <a href="https://hackclub.com/safeguarding-policy/" target="_blank" rel="noopener" class="settings-link">
            <h3 class="settings-link-title">Safeguarding Policy</h3>
            <p class="settings-link-desc">How we keep our community safe.</p>
          </a>
          <a href="https://hackclub.enterprise.slack.com/archives/C0AQ4T1CWH2" target="_blank" rel="noopener" class="settings-link">
            <h3 class="settings-link-title">Get Help</h3>
            <p class="settings-link-desc">Ask questions in #beest-help on Slack.</p>
          </a>
          <a href="https://security.hackclub.com/" target="_blank" rel="noopener" class="settings-link">
            <h3 class="settings-link-title">Bug Bounty</h3>
            <p class="settings-link-desc">Report a bug, earn a bounty.</p>
          </a>
          <a href="/api/auth/logout" class="settings-link settings-link-logout">
            <h3 class="settings-link-title">Log Out</h3>
            <p class="settings-link-desc">Sign out of your account.</p>
          </a>
        </div>
      </div>
    </section>
    {/if}

  </main>
</div>

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

  /* ── globals ─────────────────────────────────────── */
  :global(html) {
    scroll-behavior: smooth;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    background: #4b4840;
    filter: saturate(1.5);
  }

  /* ── layout ──────────────────────────────────────── */
  .home {
    display: flex;
    min-height: 100vh;
  }

  /* ── sidebar ─────────────────────────────────────── */
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    width: 100px;
    height: 100vh;
    z-index: 100;
    transition: width 300ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .sidebar:hover,
  .sidebar.pinned {
    width: 280px;
  }

  .sidebar-panel {
    position: absolute;
    top: 0;
    left: 0;
    width: calc(100% - 70px);
    max-width: 0;
    height: 100%;
    background: #4b4840;
    overflow: hidden;
    transition: max-width 300ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .sidebar:hover .sidebar-panel,
  .sidebar.pinned .sidebar-panel {
    max-width: 280px;
  }

  .teeth {
    position: absolute;
    top: 0;
    right: 0;
    height: 100%;
    pointer-events: none;
  }

  .teeth.inner {
    width: 40px;
    background: #6c6659;
    z-index: 3;
    clip-path: polygon(
      0% 0%,
      65% 0%,
      80% 10%,
      55% 22%,
      90% 35%,
      50% 48%,
      85% 60%,
      58% 72%,
      95% 85%,
      70% 100%,
      0% 100%
    );
  }

  .teeth.outer {
    width: 80px;
    background: #4b4840;
    z-index: 4;
    clip-path: polygon(
      0% 0%,
      70% 0%,
      55% 15%,
      88% 28%,
      60% 42%,
      92% 55%,
      52% 68%,
      82% 80%,
      58% 92%,
      65% 100%,
      0% 100%
    );
  }

  .expand-hint {
    position: fixed;
    bottom: 32px;
    left: 12px;
    width: 40px;
    height: 40px;
    color: #cbc1ae;
    z-index: 200;
    opacity: 0.7;
    transition: opacity 200ms ease;
    pointer-events: none;
  }

  .expand-hint svg {
    width: 100%;
    height: 100%;
  }

  .sidebar:hover .expand-hint,
  .sidebar.pinned .expand-hint {
    opacity: 0;
  }

  .sidebar-content {
    position: relative;
    z-index: 5;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding: 28px 20px 20px;
    box-sizing: border-box;
    opacity: 0;
    transform: translateX(-40px);
    transition: opacity 150ms ease, transform 250ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .sidebar:hover .sidebar-content,
  .sidebar.pinned .sidebar-content {
    opacity: 1;
    transform: translateX(0);
    transition: opacity 200ms ease 150ms, transform 300ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .sidebar-brand {
    display: block;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 32px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #e6f4fe;
    text-decoration: none;
    margin-bottom: 4px;
    line-height: 1;
  }

  .sidebar-brand:hover {
    color: #ffffff;
  }

  .sidebar-greeting {
    margin: 0 0 28px;
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 14px;
    color: #cbc1ae;
    letter-spacing: 0.02em;
  }

  .sidebar-nav {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 20px;
    flex: 1;
  }

  .nav-btn {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 14px 14px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #cbc1ae;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 24px;
    letter-spacing: 0.04em;
    text-align: left;
    cursor: inherit;
    transition: background 150ms ease, color 150ms ease;
  }

  .nav-btn:hover {
    background: rgba(230, 244, 254, 0.08);
    color: #e6f4fe;
  }

  .nav-btn.active {
    background: rgba(230, 244, 254, 0.12);
    color: #e6f4fe;
  }

  .sticker-promo {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    text-decoration: none;
    margin-top: auto;
    padding: 12px 0;
    transition: opacity 150ms ease;
  }

  .sticker-promo:hover {
    opacity: 0.8;
  }

  .sticker-img {
    width: 150px;
    height: auto;
    border-radius: 16px;
  }

  .sticker-text {
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 22px;
    color: #cbc1ae;
    letter-spacing: 0.04em;
  }

  .sidebar-footer {
    margin-top: 0;
    padding-top: 24px;
  }

  .logout-link {
    display: block;
    color: #c48382;
    font-family: "Courier New", monospace;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-decoration: none;
    padding: 12px 14px;
    text-align: center;
    border-top: 1px solid rgba(196, 131, 130, 0.2);
    transition: color 150ms ease;
  }

  .logout-link:hover {
    color: #e6f4fe;
  }

  /* ── main ────────────────────────────────────────── */
  .main {
    flex: 1;
    margin-left: 80px;
    display: flex;
    flex-direction: column;
  }

  /* ── sections ────────────────────────────────────── */
  .section {
    position: relative;
    padding: 48px 48px 32px;
    height: 100vh;
    box-sizing: border-box;
    overflow: hidden;
  }

  .section::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.12;
    mix-blend-mode: overlay;
    background-size: 512px 512px;
    background-repeat: repeat;
  }

  .tile-loaded .section::after {
    background-image: url('/images/tile.webp');
  }

  .section-inner {
    position: relative;
    z-index: 1;
    max-width: 1100px;
    margin: 0 auto;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .section-title {
    margin: 0 0 6px;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: clamp(28px, 3vw, 42px);
    letter-spacing: 0.04em;
    color: #e6f4fe;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  }

  .section-subtitle {
    margin: 0 0 32px;
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: clamp(14px, 1.2vw, 17px);
    color: #cbc1ae;
    letter-spacing: 0.02em;
  }

  /* ── bottom row ───────────────────────────────────── */
  .bottom-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 28px;
    margin-top: 24px;
    flex: 1;
    min-height: 0;
  }

  .action-log,
  .news-box {
    display: flex;
    flex-direction: column;
    padding: 24px;
    border: 1px solid rgba(230, 244, 254, 0.1);
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.15);
    min-height: 0;
    overflow: hidden;
  }

  .timeline,
  .news-list {
    overflow-y: auto;
    min-height: 0;
    flex: 1;
    -webkit-mask-image: linear-gradient(to bottom, black 65%, transparent 100%);
    mask-image: linear-gradient(to bottom, black 65%, transparent 100%);
  }

  .action-log-title,
  .news-title {
    margin: 0 0 16px;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: clamp(18px, 2vw, 24px);
    color: #e6f4fe;
    letter-spacing: 0.04em;
  }

  .timeline {
    position: relative;
    padding-left: 28px;
  }

  .timeline::before {
    content: '';
    position: absolute;
    top: 6px;
    bottom: 6px;
    left: 7px;
    width: 2px;
    background: rgba(230, 244, 254, 0.15);
  }

  .timeline-item {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding-bottom: 24px;
  }

  .timeline-item:last-child {
    padding-bottom: 0;
  }

  .timeline-dot {
    position: absolute;
    left: -28px;
    top: 4px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid;
    flex-shrink: 0;
  }

  .timeline-dot.shipped {
    background: #93b4cd;
    border-color: #93b4cd;
  }

  .timeline-dot.feedback {
    background: #cbc1ae;
    border-color: #cbc1ae;
  }

  .timeline-dot.updated {
    background: #c48382;
    border-color: #c48382;
  }

  .timeline-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .timeline-label {
    margin: 0;
    font-family: "Courier New", monospace;
    font-size: 14px;
    color: #e6f4fe;
    line-height: 1.4;
  }

  .timeline-empty {
    color: rgba(230, 244, 254, 0.4);
    font-size: 14px;
    font-style: italic;
  }

  .timeline-time {
    font-family: "Courier New", monospace;
    font-size: 12px;
    color: #7f796d;
  }

  /* ── news ─────────────────────────────────────────── */
  .news-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .news-item {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }

  .news-date {
    font-family: "Courier New", monospace;
    font-size: 12px;
    color: #e6f4fe;
    white-space: nowrap;
    flex-shrink: 0;
    padding-top: 2px;
  }

  .news-text {
    margin: 0;
    font-family: "Courier New", monospace;
    font-size: 14px;
    color: #cbc1ae;
    line-height: 1.4;
  }

  /* ── create project form ─────────────────────────── */
  .create-project-form {
    background: #635a4e;
    padding: 48px 48px 32px 300px;
    min-height: 100vh;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: 100%;
    position: relative;
    overflow: hidden;
  }

  .form-grid,
  .form-header {
    max-width: 1050px;
  }

  .form-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 28px;
  }

  .form-title {
    margin: 0;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: clamp(24px, 2.5vw, 36px);
    color: #e6f4fe;
    letter-spacing: 0.04em;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  }

  .form-cancel {
    background: none;
    border: none;
    font-size: 28px;
    color: #cbc1ae;
    cursor: pointer;
    padding: 4px 8px;
    line-height: 1;
  }

  .form-cancel:hover {
    color: #e6f4fe;
  }

  .form-grid {
    display: flex;
    flex-direction: column;
    gap: 22px;
    flex: 1;
    overflow: hidden;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    align-items: end;
  }

  .form-caption-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .form-caption {
    font-family: "Courier New", monospace;
    font-size: 13px;
    color: #cbc1ae;
  }

  .form-charcount {
    font-family: "Courier New", monospace;
    font-size: 12px;
    color: #7f796d;
  }

  .form-charcount.over {
    color: #c48382;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-label {
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 16px;
    color: #cbc1ae;
    letter-spacing: 0.04em;
  }

  .form-input {
    padding: 10px 14px;
    border: 1px solid rgba(230, 244, 254, 0.15);
    border-radius: 0;
    font-family: "Courier New", monospace;
    font-size: 15px;
    color: #e6f4fe;
    background: rgba(0, 0, 0, 0.2);
    transition: border-color 150ms ease;
    clip-path: polygon(
      0% 6%, 4% 0%, 8% 4%, 14% 1%, 20% 5%, 28% 0%, 35% 3%, 42% 1%, 50% 5%, 58% 0%, 65% 4%, 72% 1%, 80% 5%, 86% 0%, 92% 3%, 96% 1%, 100% 4%,
      99.5% 50%,
      100% 94%, 96% 100%, 92% 96%, 86% 100%, 80% 95%, 72% 100%, 65% 97%, 58% 100%, 50% 95%, 42% 100%, 35% 97%, 28% 100%, 20% 96%, 14% 100%, 8% 97%, 4% 100%, 0% 95%,
      0.5% 50%
    );
  }

  .form-input::placeholder {
    color: #7f796d;
  }

  .form-input:focus {
    outline: none;
    background: rgba(0, 0, 0, 0.3);
  }

  .form-textarea {
    min-height: 60px;
    resize: none;
  }

  .form-select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23cbc1ae' stroke-width='2' fill='none'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    background-color: rgba(0, 0, 0, 0.2);
    padding-right: 36px;
  }

  .form-select option {
    background: #4b4840;
    color: #e6f4fe;
  }

  .screenshot-row {
    display: flex;
    gap: 16px;
    height: 220px;
  }

  .upload-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 160px;
    flex-shrink: 0;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(230, 244, 254, 0.15);
    cursor: pointer;
    transition: background 150ms ease;
  }

  .upload-btn:hover {
    background: rgba(0, 0, 0, 0.3);
  }

  .upload-btn-text {
    font-family: "Courier New", monospace;
    font-size: 13px;
    color: #cbc1ae;
  }

  .screenshot-box {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px dashed rgba(230, 244, 254, 0.25);
    background: rgba(0, 0, 0, 0.1);
    position: relative;
  }

  .screenshot-remove {
    position: absolute;
    top: 6px;
    right: 6px;
    background: rgba(0, 0, 0, 0.5);
    border: none;
    color: #e6f4fe;
    font-size: 18px;
    width: 24px;
    height: 24px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .screenshot-remove:hover {
    background: #c48382;
  }

  .screenshot-preview {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .upload-icon {
    width: 36px;
    height: 36px;
    color: #cbc1ae;
  }

  .form-file-hidden {
    display: none;
  }

  .form-gear {
    position: absolute;
    right: -80px;
    pointer-events: none;
    transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .form-gear-1 {
    top: 10%;
    width: 210px;
    height: 210px;
    right: -105px;
  }

  .form-gear-2 {
    top: 36%;
    width: 320px;
    height: 320px;
    right: -160px;
  }

  .form-gear-3 {
    top: 75%;
    width: 190px;
    height: 190px;
    right: -95px;
  }

  .form-actions {
    position: fixed;
    bottom: 32px;
    right: 48px;
    display: flex;
    gap: 12px;
    z-index: 10;
  }

  .form-btn-cancel {
    padding: 10px 24px;
    background: none;
    border: 2px solid rgba(230, 244, 254, 0.2);
    border-radius: 4px;
    font-family: "Courier New", monospace;
    font-size: 15px;
    font-weight: 700;
    color: #cbc1ae;
    cursor: pointer;
    transition: background 150ms ease;
  }

  .form-btn-cancel:hover {
    background: rgba(230, 244, 254, 0.08);
  }

  .form-btn-submit {
    padding: 10px 28px;
    background: #c48382;
    border: none;
    border-radius: 4px;
    font-family: "Courier New", monospace;
    font-size: 15px;
    font-weight: 700;
    color: #fff;
    cursor: pointer;
    box-shadow: 4px 4px 0 #3a3832;
    transition: transform 100ms ease, box-shadow 100ms ease;
  }

  .form-btn-submit:hover:not(:disabled) {
    transform: translate(-1px, -1px);
    box-shadow: 5px 5px 0 #3a3832;
  }

  .form-btn-submit:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .required {
    color: #c48382;
    font-size: 36px;
    vertical-align: baseline;
    line-height: 1;
    display: inline-block;
    transform: translateY(6px);
  }

  .hackatime-row {
    display: flex;
    gap: 8px;
    align-items: stretch;
  }

  .hackatime-row .form-select {
    flex: 1;
  }

  .refresh-btn {
    background: #4b4840;
    border: 2px solid #6c6659;
    border-radius: 6px;
    padding: 0 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }

  .refresh-btn:hover:not(:disabled) {
    background: #5a564d;
  }

  .refresh-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .refresh-icon {
    width: 18px;
    height: 18px;
    color: #cbc1ae;
  }

  .refresh-icon.spinning {
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .form-error {
    color: #c48382;
    font-size: 14px;
    margin: 8px 0 0;
    padding: 8px 12px;
    background: rgba(196, 131, 130, 0.1);
    border: 1px solid rgba(196, 131, 130, 0.3);
    border-radius: 6px;
  }

  /* ── shop ────────────────────────────────────────── */
  .section-shop {
    background: #56494a;
  }

  .shop-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
  }

  .shoppable-box {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    flex-shrink: 0;
  }

  .shoppable-label {
    font-family: "Courier New", monospace;
    font-size: 13px;
    color: #e6f4fe;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  .shoppable-value {
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: clamp(28px, 3vw, 40px);
    color: #e6f4fe;
    letter-spacing: 0.04em;
  }

  .shop-warning {
    margin: 32px 0 32px;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: clamp(22px, 2.5vw, 32px);
    color: #c48382;
    font-weight: 700;
    text-decoration: underline;
  }

  .shop-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 24px;
  }

  .shop-card {
    background: #f0ebe5;
    border: 1px solid #4b4840;
    box-shadow: 5px 5px 0 #3a3832;
    transition: transform 150ms ease, box-shadow 150ms ease;
    filter: saturate(0.667);
  }

  .shop-card:hover {
    transform: translate(-2px, -2px);
    box-shadow: 7px 7px 0 #3a3832;
  }

  .shop-card-img {
    padding: 10px 10px 0;
  }

  .shop-card-img img {
    width: 100%;
    aspect-ratio: 4 / 5;
    object-fit: contain;
    display: block;
    border: 1px solid #6c6659;
    background: #e6f4fe;
  }

  .shop-card-body {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 8px 12px 10px;
    gap: 8px;
  }

  .shop-card-name {
    margin: 0;
    font-family: "Courier New", monospace;
    font-size: 14px;
    color: #4b4840;
    line-height: 1.3;
  }

  .shop-card-cost {
    margin: 0;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 16px;
    color: #c48382;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* ── projects ────────────────────────────────────── */
  .section-projects {
    background: #635a4e;
    padding-top: 48px;
  }

  .progress-bar-wrap {
    margin-top: 16px;
    margin-bottom: 32px;
  }

  .progress-labels {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 8px;
  }

  .progress-hours {
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: clamp(28px, 3vw, 40px);
    color: #cbc1ae;
    letter-spacing: 0.04em;
  }

  .progress-goal {
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: clamp(28px, 3vw, 40px);
    color: #cbc1ae;
    letter-spacing: 0.04em;
  }

  .progress-track {
    width: 100%;
    height: 28px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(230, 244, 254, 0.1);
    overflow: hidden;
    border-radius: 0;
    clip-path: polygon(
      0% 8%, 5% 0%, 10% 6%, 15% 2%, 20% 7%, 25% 1%, 30% 5%, 35% 0%, 40% 8%, 45% 2%, 50% 6%, 55% 1%, 60% 7%, 65% 3%, 70% 8%, 75% 0%, 80% 5%, 85% 2%, 90% 7%, 95% 1%, 100% 5%,
      100% 92%, 95% 100%, 90% 94%, 85% 98%, 80% 93%, 75% 100%, 70% 95%, 65% 98%, 60% 93%, 55% 100%, 50% 94%, 45% 99%, 40% 93%, 35% 100%, 30% 95%, 25% 99%, 20% 93%, 15% 100%, 10% 95%, 5% 99%, 0% 93%
    );
  }

  .progress-fill {
    height: 100%;
    background: #c48382;
    border-radius: 3px;
    min-width: 4px;
    transition: width 600ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .progress-ticks {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    font-family: "Courier New", monospace;
    font-size: 13px;
    font-weight: 700;
    color: #cbc1ae;
    letter-spacing: 0.02em;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    margin-bottom: 8px;
  }

  .section-header .section-title {
    margin-bottom: 2px;
  }

  .section-header .section-subtitle {
    margin-bottom: 0;
  }

  .progress-key {
    display: flex;
    gap: 28px;
    flex-shrink: 0;
    padding-top: 6px;
  }

  .key-item {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: "Courier New", monospace;
    font-size: 17px;
    color: #cbc1ae;
    text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
  }

  .key-swatch {
    width: 18px;
    height: 18px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .key-swatch.approved {
    background: #93b4cd;
  }

  .key-swatch.unreviewed {
    background: #cbc1ae;
  }

  .key-swatch.unshipped {
    background: #c48382;
  }

  .projects-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 20px;
    border: 4px dashed rgba(230, 244, 254, 0.2);
    border-radius: 8px;
    text-align: center;
    flex: 1;
  }

  .empty-text {
    margin: 20px 0 32px;
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 24px;
    color: #cbc1ae;
    letter-spacing: 0.02em;
    text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
  }

  .action-btn {
    display: inline-block;
    padding: 10px 28px;
    background: #c48382;
    color: #fff;
    font-family: "Courier New", monospace;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-decoration: none;
    text-transform: uppercase;
    border: none;
    box-shadow: 4px 4px 0 #3a3832;
    transition: transform 100ms ease, box-shadow 100ms ease;
  }

  .action-btn:hover {
    transform: translate(-1px, -1px);
    box-shadow: 5px 5px 0 #3a3832;
  }

  /* ── explore ─────────────────────────────────────── */
  .section-explore {
    background: #3a3832;
  }

  .explore-placeholder {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .explore-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 28px;
    opacity: 0.35;
  }

  .explore-card-skeleton {
    background: rgba(230, 244, 254, 0.06);
    border: 1px solid rgba(230, 244, 254, 0.08);
    padding: 12px;
    border-radius: 4px;
  }

  .skeleton-img {
    width: 100%;
    aspect-ratio: 4 / 3;
    background: rgba(230, 244, 254, 0.06);
    border-radius: 3px;
    margin-bottom: 10px;
  }

  .skeleton-line {
    height: 10px;
    background: rgba(230, 244, 254, 0.08);
    border-radius: 2px;
    margin-bottom: 6px;
  }

  .skeleton-line.wide {
    width: 80%;
  }

  .skeleton-line.narrow {
    width: 50%;
  }

  /* ── leaderboard ─────────────────────────────────── */
  .section-leaderboard {
    background: #4b4840;
  }

  .leaderboard-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
  }

  .lb-total-users {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    flex-shrink: 0;
  }

  .lb-total-label {
    font-family: "Courier New", monospace;
    font-size: 13px;
    color: #e6f4fe;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  .lb-total-value {
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: clamp(28px, 3vw, 40px);
    color: #e6f4fe;
    letter-spacing: 0.04em;
  }

  .leaderboard-table {
    display: flex;
    flex-direction: column;
    max-width: 600px;
  }

  .leaderboard-header {
    display: flex;
    align-items: center;
    padding: 10px 16px;
    border-bottom: 2px solid rgba(230, 244, 254, 0.15);
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 16px;
    color: #7f796d;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .leaderboard-row {
    display: flex;
    align-items: center;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(230, 244, 254, 0.06);
  }

  .leaderboard-row.top-three .lb-rank {
    color: #c48382;
    font-weight: 700;
  }

  .lb-rank {
    width: 40px;
    flex-shrink: 0;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 18px;
    color: #cbc1ae;
  }

  .lb-name {
    flex: 1;
    font-family: "Courier New", monospace;
    font-size: 15px;
    color: #e6f4fe;
  }

  .lb-hours {
    width: 60px;
    text-align: right;
    flex-shrink: 0;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 18px;
    color: #cbc1ae;
  }

  .skeleton-text {
    display: inline-block;
    height: 14px;
    width: 60%;
    background: rgba(230, 244, 254, 0.08);
    border-radius: 2px;
  }

  .skeleton-text.short {
    width: 30px;
    margin-left: auto;
  }

  .coming-soon {
    margin: 0;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: clamp(32px, 4vw, 52px);
    color: #e6f4fe;
    letter-spacing: 0.06em;
    text-shadow: 0 3px 10px rgba(0, 0, 0, 0.6);
    text-transform: uppercase;
  }

  /* ── settings ────────────────────────────────────── */
  .section-settings {
    background: #4b4840;
  }

  .settings-links {
    display: flex;
    flex-direction: column;
    gap: 48px;
    max-width: 480px;
  }

  .settings-title {
    text-decoration: underline;
    margin-bottom: 32px;
  }

  .settings-link {
    display: block;
    text-decoration: none;
  }

  .settings-link:hover .settings-link-title {
    text-decoration: underline;
  }

  .settings-link-title {
    margin: 0 0 6px;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 26px;
    color: #e6f4fe;
    letter-spacing: 0.04em;
    text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
  }

  .settings-link-desc {
    margin: 0;
    font-family: "Courier New", monospace;
    font-size: 17px;
    color: #cbc1ae;
    line-height: 1.4;
    text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
  }

  .settings-link-logout .settings-link-title {
    color: #c48382;
  }

  /* ── mobile ──────────────────────────────────────── */
  @media (max-width: 900px) {
    .sidebar {
      position: fixed;
      top: auto;
      bottom: 0;
      left: 0;
      width: 100%;
      height: auto;
      z-index: 200;
      background: #4b4840;
      border-top: 1px solid rgba(230, 244, 254, 0.1);
      transition: none;
    }

    .sidebar:hover {
      width: 100%;
    }

    .teeth,
    .sidebar-panel {
      display: none;
    }

    .sidebar-content {
      flex-direction: row;
      align-items: center;
      padding: 0;
      width: 100%;
      opacity: 1;
      transition: none;
    }

    .sidebar-brand,
    .sidebar-greeting,
    .sidebar-footer {
      display: none;
    }

    .sidebar-nav {
      flex-direction: row;
      justify-content: space-around;
      width: 100%;
      padding: 6px 4px;
      gap: 0;
    }

    .nav-btn {
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 8px 4px;
      font-size: 10px;
      border-radius: 4px;
    }


    .main {
      margin-left: 0;
      padding-bottom: 72px;
      transition: none;
    }

    .sidebar:hover ~ .main {
      margin-left: 0;
    }

    .section {
      padding: 40px 20px 48px;
    }

    .shop-grid {
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 14px;
    }

    .explore-grid {
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: 12px;
    }

  }
</style>
