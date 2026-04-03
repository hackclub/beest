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
  let editingProject = $state<any>(null);

  let projectName = $state('');
  let projectDesc = $state('');
  let projectType = $state('');
  let codeUrl = $state('');
  let demoUrl = $state('');
  let readmeUrl = $state('');
  let screenshotFiles = $state<(File | null)[]>([null, null]);
  let screenshotPreviews = $state<string[]>(['', '']);
  let activeScreenshot = $state(0);
  let hackatimeProject = $state<string[]>([]);
  let isUpdateProject = $state(false);
  let otherHcProgram = $state(false);
  let otherHcProgramName = $state('');
  let usedAi = $state(false);
  let aiUseDescription = $state('');
  let projects = $state<any[]>([]);
  let hackatimeProjects = $state<string[]>([]);
  let hackatimeLoading = $state(false);
  let hackatimeOpen = $state(false);
  let submitting = $state(false);
  let formError = $state('');
  let auditLog = $state<{ action: string; label: string; createdAt: string }[]>([]);
  let totalHours = $state(0);
  let hoursByStatus = $state<Record<string, number>>({});
  let displayHours = $state(0);
  let displayByStatus = $state<Record<string, number>>({});
  const GOAL_HOURS = 40;

  function animateProgress(targetHours: number, targetByStatus: Record<string, number>) {
    const duration = 1200;
    const start = performance.now();
    const statuses = Object.keys(targetByStatus);

    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
      displayHours = Math.round(targetHours * ease * 10) / 10;
      const current: Record<string, number> = {};
      for (const s of statuses) {
        current[s] = targetByStatus[s] * ease;
      }
      displayByStatus = current;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  let keystrokes = $state(0);
  let canSubmit = $derived(projectName.trim() !== '' && projectDesc.trim() !== '' && projectType !== '' && !submitting);
  let hasScreenshots = $derived(screenshotPreviews[0] !== '' || screenshotPreviews[1] !== '');
  let canSubmitForReview = $derived(
    projectName.trim() !== '' &&
    projectDesc.trim() !== '' &&
    projectType !== '' &&
    codeUrl.trim() !== '' &&
    readmeUrl.trim() !== '' &&
    demoUrl.trim() !== '' &&
    hackatimeProject.length > 0 &&
    hasScreenshots &&
    !submitting
  );
  let projectCols = $derived(Math.ceil(Math.sqrt(projects.length)));

  // Review checklist
  let reviewProject = $state<any>(null);
  let checkOpenSource = $state(false);
  let checkDemoable = $state(false);
  let checkReadme = $state(false);
  let checkHackatime = $state(false);
  let checkStartedOrUpdated = $state(false);
  let canConfirmReview = $derived(checkOpenSource && checkDemoable && checkReadme && checkHackatime && checkStartedOrUpdated && !submitting);

  function resetForm() {
    creatingProject = false;
    editingProject = null;
    reviewProject = null;
    projectName = '';
    projectDesc = '';
    projectType = '';
    codeUrl = '';
    demoUrl = '';
    readmeUrl = '';
    screenshotFiles = [null, null];
    screenshotPreviews = ['', ''];
    activeScreenshot = 0;
    hackatimeProject = [];
    hackatimeOpen = false;
    isUpdateProject = false;
    otherHcProgram = false;
    otherHcProgramName = '';
    usedAi = false;
    aiUseDescription = '';
    keystrokes = 0;
    formError = '';
    checkOpenSource = false;
    checkDemoable = false;
    checkReadme = false;
    checkHackatime = false;
    checkStartedOrUpdated = false;
  }

  function openCreateProject() {
    resetForm();
    creatingProject = true;
  }

  function openEditProject(project: any) {
    resetForm();
    editingProject = project;
    projectName = project.name ?? '';
    projectDesc = project.description ?? '';
    projectType = project.projectType ?? '';
    codeUrl = project.codeUrl ?? '';
    demoUrl = project.demoUrl ?? '';
    readmeUrl = project.readmeUrl ?? '';
    hackatimeProject = Array.isArray(project.hackatimeProjectName) ? project.hackatimeProjectName : project.hackatimeProjectName ? [project.hackatimeProjectName] : [];
    isUpdateProject = project.isUpdate ?? false;
    otherHcProgram = !!(project.otherHcProgram);
    otherHcProgramName = project.otherHcProgram ?? '';
    screenshotPreviews = [project.screenshot1Url ?? '', project.screenshot2Url ?? ''];
    usedAi = !!(project.aiUse);
    aiUseDescription = project.aiUse ?? '';
  }

  function cancelCreateProject() {
    resetForm();
  }

  function handleScreenshot(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
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

  async function fetchProjects() {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        projects = Array.isArray(data) ? data : [];
      }
    } catch { /* silent */ }
  }

  async function fetchProjectHours() {
    try {
      const res = await fetch('/api/projects/hours');
      if (res.ok) {
        const data = await res.json();
        totalHours = data.hours ?? 0;
        hoursByStatus = data.byStatus ?? {};
        animateProgress(totalHours, hoursByStatus);
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
    const iso = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z';
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
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

      const isEdit = !!editingProject;
      const url = isEdit ? `/api/projects/${editingProject.id}` : '/api/projects';
      const method = isEdit ? 'PATCH' : 'POST';

      const body: any = {
        name: projectName,
        description: projectDesc,
        projectType,
        codeUrl: codeUrl || null,
        readmeUrl: readmeUrl || null,
        demoUrl: demoUrl || null,
        hackatimeProjectName: hackatimeProject.length > 0 ? hackatimeProject : null,
        isUpdate: isUpdateProject,
        otherHcProgram: otherHcProgram ? otherHcProgramName || null : null,
        aiUse: usedAi ? aiUseDescription || null : null,
      };
      if (screenshots.length) body.screenshots = screenshots;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
        formError = msg || `Server error (${res.status})`;
        submitting = false;
        return;
      }

      resetForm();
      fetchProjects();
      fetchAuditLog();
      fetchProjectHours();
    } catch {
      formError = 'Something went wrong. Please try again.';
    }
    submitting = false;
  }

  async function submitForReview() {
    if (!editingProject || !canSubmitForReview) return;
    formError = '';
    submitting = true;

    try {
      const screenshots: string[] = [];
      for (const file of screenshotFiles) {
        if (file) screenshots.push(await fileToDataUri(file));
      }

      const body: any = {
        name: projectName,
        description: projectDesc,
        projectType,
        codeUrl: codeUrl || null,
        readmeUrl: readmeUrl || null,
        demoUrl: demoUrl || null,
        hackatimeProjectName: hackatimeProject.length > 0 ? hackatimeProject : null,
        isUpdate: isUpdateProject,
        otherHcProgram: otherHcProgram ? otherHcProgramName || null : null,
        aiUse: usedAi ? aiUseDescription || null : null,
      };
      if (screenshots.length) body.screenshots = screenshots;

      const res = await fetch(`/api/projects/${editingProject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
        formError = msg || `Server error (${res.status})`;
        submitting = false;
        return;
      }

      reviewProject = data;
      editingProject = null;
      creatingProject = false;
      fetchProjects();
      fetchAuditLog();
      fetchProjectHours();
    } catch {
      formError = 'Something went wrong. Please try again.';
    }
    submitting = false;
  }

  async function confirmReview() {
    if (!reviewProject || !canConfirmReview) return;
    submitting = true;
    formError = '';
    try {
      const res = await fetch(`/api/projects/${reviewProject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'unreviewed' })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        formError = Array.isArray(data.message) ? data.message.join(', ') : data.message || `Server error (${res.status})`;
        submitting = false;
        return;
      }
      resetForm();
      fetchProjects();
      fetchAuditLog();
    } catch {
      formError = 'Something went wrong. Please try again.';
    }
    submitting = false;
  }

  async function deleteProject(id: string) {
    if (!confirm('Delete this project? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        resetForm();
        fetchProjects();
        fetchAuditLog();
        fetchProjectHours();
      }
    } catch { /* silent */ }
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
    if (reviewProject) resetForm();
    activeSection = id;
  }

  onMount(() => {
    let loaded = 0;
    for (const src of ['/images/tile.webp', '/images/tile2.webp', '/images/tile3.webp']) {
      const img = new Image();
      img.src = src;
      img.onload = () => { if (++loaded === 3) tileLoaded = true; };
    }
    fetchProjects();
    fetchHackatimeProjects();
    fetchAuditLog();
    fetchProjectHours();
  });
</script>

<div class="home" class:tile-loaded={tileLoaded}>

  <!-- Mobile warning -->
  <div class="mobile-warning">
    <div class="mobile-warning-inner">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mobile-warning-icon">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <p class="mobile-warning-text">
        <strong>#BEEST</strong> is built for desktop. For the best experience, please visit on a computer.
      </p>
    </div>
  </div>

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

    {#if creatingProject || editingProject}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="create-project-form" onkeydown={() => keystrokes++}>
      <div class="form-header">
        <button class="form-cancel" onclick={resetForm}>&times;</button>
      </div>

      <div class="form-grid">
        <div class="form-group">
          <label class="form-label" for="project-name">Project Name <span class="required">*</span></label>
          <input id="project-name" type="text" class="form-input" maxlength={50} placeholder="My Awesome Project" bind:value={projectName} />
          <div class="form-caption-row">
            <span class="form-caption">Give your project a name</span>
            <span class="form-charcount" class:over={projectName.length >= 50}>{projectName.length}/50</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="project-desc">Description <span class="required">*</span></label>
          <textarea id="project-desc" class="form-input form-textarea" maxlength={300} placeholder={"Project goal:\nMy tech stack:\nHow long it took:"} bind:value={projectDesc}></textarea>
          <div class="form-caption-row">
            <span class="form-caption">Describe your idea</span>
            <span class="form-charcount" class:over={projectDesc.length >= 300}>{projectDesc.length}/300</span>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="code-url">Code URL</label>
            <input id="code-url" type="url" class="form-input" placeholder="https://github.com/hackclub/" bind:value={codeUrl} />
            <span class="form-caption">Link to your source code (GitHub, GitLab, etc)</span>
          </div>
          <div class="form-group">
            <label class="form-label" for="readme-url">README URL</label>
            <input id="readme-url" type="url" class="form-input" placeholder="https://github.com/hackclub/hackclub/blob/main/README.md" bind:value={readmeUrl} />
            <span class="form-caption">Link to your project's README file</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="demo-url">Demo URL</label>
          <input id="demo-url" type="url" class="form-input" placeholder="https://hackclub.com" bind:value={demoUrl} />
          <span class="form-caption">Link to a live demo or playable version</span>
        </div>

        <div class="form-row form-row-top">
          <div class="form-group screenshot-group">
            <label class="form-label" for="screenshot">Screenshots</label>
            <div class="screenshot-row">
              <div class="screenshot-controls">
                <label class="upload-btn" for="screenshot">
                  <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span class="upload-btn-text">Upload</span>
                </label>
                <div class="screenshot-tabs">
                  <button type="button" class="screenshot-tab" class:active={activeScreenshot === 0} onclick={() => { activeScreenshot = 0; }}>1</button>
                  <button type="button" class="screenshot-tab" class:active={activeScreenshot === 1} class:disabled-field={!screenshotPreviews[1]} disabled={!screenshotPreviews[1]} onclick={() => { activeScreenshot = 1; }}>2</button>
                </div>
              </div>
              <div class="screenshot-box">
                {#if screenshotPreviews[activeScreenshot]}
                  <img src={screenshotPreviews[activeScreenshot]} alt="Preview {activeScreenshot + 1}" class="screenshot-preview" />
                  <button class="screenshot-remove" onclick={() => { screenshotFiles[activeScreenshot] = null; screenshotPreviews[activeScreenshot] = ''; if (activeScreenshot === 1) activeScreenshot = 0; }}>&times;</button>
                {/if}
              </div>
            </div>
            <input id="screenshot" type="file" accept="image/*" class="form-file-hidden" onchange={handleScreenshot} />
            <span class="form-caption">Upload up to 2 screenshots</span>
          </div>

          <div class="form-group ai-use-group">
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="form-label">AI Use</label>
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="form-checkbox ai-checkbox">
              <input type="checkbox" bind:checked={usedAi} />
              <span>Was this project made with AI? (Up to 30% is okay)</span>
            </label>
            <label class="form-label ai-sub-label" class:disabled-label={!usedAi} for="ai-use-desc">How did you use AI?</label>
            <textarea id="ai-use-desc" class="form-input form-textarea ai-textarea" class:disabled-field={!usedAi} maxlength={200} disabled={!usedAi} placeholder="I used AI to help with ideation by bouncing ideas around, I also used it to decide the architecture of the platform and fix bugs but most of the code is my original work." bind:value={aiUseDescription}></textarea>
            <div class="form-caption-row">
              <span class="form-caption" class:disabled-label={!usedAi}>Describe how AI was used in this project</span>
              <span class="form-charcount" class:disabled-label={!usedAi} class:over={aiUseDescription.length >= 200}>{aiUseDescription.length}/200</span>
            </div>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="project-type">Project Type <span class="required">*</span></label>
            <select id="project-type" class="form-input form-select" bind:value={projectType}>
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
          <div class="form-group hackatime-group">
            <label class="form-label">Hackatime Project/s</label>
            <div class="hackatime-row">
              <div class="hackatime-select-wrap">
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="hackatime-trigger" onclick={() => { hackatimeOpen = !hackatimeOpen; }}>
                  {#if hackatimeProject.length === 0}
                    <span class="hackatime-placeholder">Select projects</span>
                  {:else}
                    <span class="hackatime-selected">{hackatimeProject.join(', ')}</span>
                  {/if}
                </div>
                {#if hackatimeOpen}
                  <div class="hackatime-dropdown">
                    {#if hackatimeLoading}
                      <span class="hackatime-empty">Loading...</span>
                    {:else if hackatimeProjects.length === 0}
                      <span class="hackatime-empty">No projects found</span>
                    {:else}
                      {#each hackatimeProjects as proj}
                        <label class="hackatime-option">
                          <input type="checkbox" checked={hackatimeProject.includes(proj)} onchange={(e) => {
                            const target = e.target as HTMLInputElement;
                            if (target.checked) {
                              hackatimeProject = [...hackatimeProject, proj];
                            } else {
                              hackatimeProject = hackatimeProject.filter((p) => p !== proj);
                            }
                          }} />
                          <span>{proj}</span>
                        </label>
                      {/each}
                    {/if}
                  </div>
                {/if}
              </div>
              <button type="button" class="refresh-btn" onclick={fetchHackatimeProjects} disabled={hackatimeLoading} title="Refresh Hackatime projects">
                <svg class="refresh-icon" class:spinning={hackatimeLoading} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div class="form-row">
          <label class="form-checkbox">
            <input type="checkbox" bind:checked={isUpdateProject} />
            <span class="noselect">This is an update to an existing project</span>
          </label>
          <label class="form-checkbox">
            <input type="checkbox" bind:checked={otherHcProgram} />
            <span class="noselect">This is submitted to another Hack Club program</span>
          </label>
        </div>

      </div>

      {#if formError}
        <p class="form-error">{formError}</p>
      {/if}

      <div class="form-bottom-row">
        {#if otherHcProgram}
        <div class="form-group other-program-group">
          <label class="form-label" for="other-program">Which program?</label>
          <input id="other-program" type="text" class="form-input" maxlength={255} placeholder="e.g. Boba Drops, Arcade" bind:value={otherHcProgramName} />
        </div>
        {/if}
        <div class="form-actions">
          {#if editingProject}
            <button class="form-btn-delete" onclick={() => deleteProject(editingProject.id)}>Delete</button>
          {/if}
          <button class="form-btn-submit" disabled={!canSubmit} onclick={submitProject}>
            {#if submitting}{editingProject ? 'Saving...' : 'Creating...'}{:else}{editingProject ? 'Save Changes' : 'Create Project'}{/if}
          </button>
          {#if editingProject}
            <div class="submit-review-wrap">
              <button
                class="form-btn-review"
                class:ready={canSubmitForReview}
                disabled={!canSubmitForReview}
                onclick={submitForReview}
              >
                Submit
              </button>
              {#if !canSubmitForReview}
                <span class="review-tooltip">Fill out all sections before submitting</span>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <svg class="form-gear form-gear-1" style="transform: rotate({keystrokes * 3}deg)" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g fill="#6c6659"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t (t)}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#635a4e"/>
      </svg>
      <svg class="form-gear form-gear-2" style="transform: rotate({-keystrokes * 2 + 22.5}deg)" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g fill="#7f796d"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t (t)}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#635a4e"/>
      </svg>
      <svg class="form-gear form-gear-3" style="transform: rotate({keystrokes * 4}deg)" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g fill="#6c6659"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t (t)}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#635a4e"/>
      </svg>
    </div>
    {/if}

    {#if reviewProject}
    <section class="section section-review">
      <div class="section-inner">
        <button class="form-cancel review-close" onclick={resetForm}>&times;</button>
        <h2 class="section-title">Submit "{reviewProject.name}" for Review</h2>
        <div class="review-checklist">
          <label class="review-check">
            <input type="checkbox" bind:checked={checkOpenSource} />
            <span>My project is open source with a cloneable repository</span>
          </label>
          <label class="review-check">
            <input type="checkbox" bind:checked={checkDemoable} />
            <span>My project is demo-able (someone with no coding experience can use it)</span>
          </label>
          <label class="review-check">
            <input type="checkbox" bind:checked={checkReadme} />
            <span>My project has a ReadMe describing the features and tech stack, and how to contribute</span>
          </label>
          <label class="review-check">
            <input type="checkbox" bind:checked={checkHackatime} />
            <span>I have recorded my time with Hackatime as faithfully as possible, not inflating or manipulating hours using bots, scripts or hacks. I understand that purposeful cheating can result in a ban from all Hack Club programs</span>
          </label>
          <label class="review-check">
            <input type="checkbox" bind:checked={checkStartedOrUpdated} />
            <span>I started this project later than April 2nd, 2025, or shipped a significant update to an old project</span>
          </label>
        </div>
        {#if formError}
          <p class="form-error">{formError}</p>
        {/if}
        <button class="action-btn review-submit-btn" disabled={!canConfirmReview} onclick={confirmReview}>
          {#if submitting}Submitting...{:else}Submit for Review{/if}
        </button>
        <p class="review-note">Review means a human is looking over your project and checking that the code is functional, not AI generated and that the demo works. It could take around a week (hopefully less) for us to get around to your project, at which point we will offer feedback or approve your time spent. In rare cases where we believe you have unintentionally exaggerated your hours, we may approve a percentage of your hours.</p>
      </div>
    </section>
    {/if}

    {#if !creatingProject && !editingProject && !reviewProject && activeSection === 'projects'}
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
            <span class="key-item"><span class="key-swatch changes-needed"></span>Changes Needed</span>
            <span class="key-item"><span class="key-swatch unshipped"></span>Unshipped</span>
          </div>
        </div>

        <div class="progress-bar-wrap">
          <div class="progress-labels">
            <span class="progress-hours">{displayHours}h</span>
            <span class="progress-goal">{(hoursByStatus['approved'] ?? 0) >= GOAL_HOURS ? 'Qualified!' : `${GOAL_HOURS}h approved to qualify`}</span>
          </div>
          <div class="progress-track">
            {#each ['approved', 'unreviewed', 'changes_needed', 'unshipped'] as status}
              {@const pct = Math.min(((displayByStatus[status] ?? 0) / GOAL_HOURS) * 100, 100)}
              {@const label = status === 'changes_needed' ? 'Changes Needed' : status.charAt(0).toUpperCase() + status.slice(1)}
              {#if pct > 0}
                <div class="progress-fill {status}" style="width: {pct}%" title="{Math.round((hoursByStatus[status] ?? 0) * 10) / 10}h {label}"></div>
              {/if}
            {/each}
          </div>
          <div class="progress-ticks">
            <span>0</span>
            <span>10</span>
            <span>20</span>
            <span>30</span>
            <span>40</span>
          </div>
        </div>

        <div class="projects-box" class:has-projects={projects.length > 0} style:--cols={projectCols}>
          {#if projects.length === 0}
            <p class="empty-text">No projects yet. Start building to earn hours!</p>
            <button class="action-btn" onclick={openCreateProject}>Create a Project</button>
          {:else}
            {#each projects as project}
              <div class="project-card" role="button" tabindex="0" onclick={() => openEditProject(project)} onkeydown={(e) => { if (e.key === 'Enter') openEditProject(project); }}>
                {#if project.screenshot1Url}
                  <img class="project-thumb" src={project.screenshot1Url} alt="{project.name} screenshot" />
                {/if}
                <div class="project-info">
                  <div class="project-header-row">
                    <h3 class="project-name">{project.name}</h3>
                    <span class="project-type-badge">{project.projectType}</span>
                    <span class="project-status-badge {project.status}">{project.status === 'changes_needed' ? 'Changes Needed' : project.status}</span>
                  </div>
                  <p class="project-desc">{project.description}</p>
                  <div class="project-links">
                    {#if project.codeUrl}
                      <a href={project.codeUrl} target="_blank" rel="noopener noreferrer" class="project-link">Code</a>
                    {/if}
                    {#if project.demoUrl}
                      <a href={project.demoUrl} target="_blank" rel="noopener noreferrer" class="project-link">Demo</a>
                    {/if}
                    {#if project.readmeUrl}
                      <a href={project.readmeUrl} target="_blank" rel="noopener noreferrer" class="project-link">README</a>
                    {/if}
                    {#if project.hackatimeProjectName?.length}
                      <span class="project-hackatime">Hackatime: {Array.isArray(project.hackatimeProjectName) ? project.hackatimeProjectName.join(', ') : project.hackatimeProjectName}</span>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
            <button class="action-btn new-project-btn" onclick={openCreateProject}>+ New Project</button>
          {/if}
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
                  <div class="timeline-dot {entry.action === 'project_created' ? 'shipped' : entry.action === 'project_submitted' ? 'submitted' : entry.action === 'project_updated' ? 'updated' : 'feedback'}"></div>
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
              <span class="news-date">Apr 3</span>
              <p class="news-text">Beest is soft launched! You can start making progress toward the event while I iron out the bugs! Thanks for helping me through beta -Euan.</p>
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
    bottom: 0;
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
    overflow-y: auto;
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
    border: 3px solid transparent;
    border-bottom: 6px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: #cbc1ae;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 24px;
    letter-spacing: 0.04em;
    text-align: left;
    cursor: inherit;
    transition: background 150ms ease, color 150ms ease, transform 0.1s ease, border-bottom-width 0.1s ease, border-color 150ms ease;
  }

  .nav-btn:hover {
    background: rgba(230, 244, 254, 0.08);
    color: #e6f4fe;
    border-color: rgba(230, 244, 254, 0.12);
  }

  .nav-btn:active {
    transform: translateY(3px);
    border-bottom-width: 3px;
  }

  .nav-btn.active {
    background: rgba(230, 244, 254, 0.12);
    color: #e6f4fe;
    border-color: rgba(230, 244, 254, 0.18);
    border-bottom-color: #c48382;
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
    margin-left: 210px;
    display: flex;
    flex-direction: column;
  }

  /* ── sections ────────────────────────────────────── */
  .section {
    position: relative;
    padding: 48px 48px 32px 150px;
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

  .tile-loaded .section-projects::after,
  .tile-loaded .section-settings::after,
  .tile-loaded .create-project-form::after {
    background-image: url('/images/tile.webp');
  }

  .tile-loaded .section-shop::after,
  .tile-loaded .section-leaderboard::after {
    background-image: url('/images/tile2.webp');
  }

  .tile-loaded .section-explore::after {
    background-image: url('/images/tile3.webp');
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
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
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

  .timeline-dot.submitted {
    background: #5a9e6f;
    border-color: #5a9e6f;
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
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 17px;
    text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
    color: #e6f4fe;
    line-height: 1.4;
  }

  .timeline-empty {
    font-family: "Sunny Mood", "Courier New", monospace;
    color: rgba(230, 244, 254, 0.4);
    font-size: 17px;
    font-style: italic;
    text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
  }

  .timeline-time {
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 14px;
    text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
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
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 14px;
    text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
    color: #e6f4fe;
    white-space: nowrap;
    flex-shrink: 0;
    padding-top: 2px;
  }

  .news-text {
    margin: 0;
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 17px;
    text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
    color: #cbc1ae;
    line-height: 1.4;
  }

  /* ── create project form ─────────────────────────── */
  .create-project-form {
    background: #635a4e;
    padding: 48px 48px 32px 150px;
    min-height: 100vh;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: 100%;
    position: relative;
    overflow-x: clip;
  }

  .create-project-form::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.12;
    mix-blend-mode: overlay;
    background-size: 512px 512px;
    background-repeat: repeat;
  }

  .form-grid,
  .form-header {
    max-width: 1050px;
  }

  .form-header {
    display: contents;
  }

  .form-cancel {
    position: absolute;
    top: 16px;
    right: 16px;
    background: none;
    border: none;
    font-size: 64px;
    font-weight: 900;
    color: #cbc1ae;
    cursor: pointer;
    padding: 4px 12px;
    line-height: 1;
    z-index: 1;
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
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 24px;
    align-items: end;
  }

  .form-checkbox {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    font-family: "Courier New", monospace;
    font-size: 15px;
    color: #cbc1ae;
  }

  .noselect {
    user-select: none;
    -webkit-user-select: none;
  }

  .form-checkbox input[type="checkbox"] {
    appearance: none;
    width: 20px;
    height: 20px;
    border: 2px solid rgba(230, 244, 254, 0.3);
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.2);
    cursor: pointer;
    flex-shrink: 0;
    position: relative;
  }

  .form-checkbox input[type="checkbox"]:checked {
    background: #93b4cd;
    border-color: #93b4cd;
  }

  .form-checkbox input[type="checkbox"]:checked::after {
    content: '';
    position: absolute;
    left: 5px;
    top: 1px;
    width: 6px;
    height: 11px;
    border: solid #fff;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
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
    font-size: 19px;
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
    padding: 14px 36px 14px 14px;
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
    flex: 1;
    background: rgba(0, 0, 0, 0.2);
    border: 3px solid rgba(230, 244, 254, 0.2);
    border-bottom: 7px solid rgba(230, 244, 254, 0.25);
    cursor: pointer;
    transition: background 150ms ease, transform 0.1s ease, border-bottom-width 0.1s ease, border-color 150ms ease;
  }

  .upload-btn:hover {
    background: rgba(0, 0, 0, 0.3);
    border-color: rgba(230, 244, 254, 0.35);
  }

  .upload-btn:active {
    transform: translateY(4px);
    border-bottom-width: 3px;
  }

  .upload-btn-text {
    font-family: "Courier New", monospace;
    font-size: 13px;
    color: #cbc1ae;
  }

  .screenshot-controls {
    display: flex;
    flex-direction: column;
    width: 120px;
    flex-shrink: 0;
    gap: 8px;
  }

  .screenshot-tabs {
    display: flex;
    gap: 6px;
  }

  .screenshot-tab {
    flex: 1;
    padding: 8px 0;
    font-family: "Courier New", monospace;
    font-size: 15px;
    font-weight: bold;
    color: #cbc1ae;
    background: rgba(0, 0, 0, 0.2);
    border: 2px solid rgba(230, 244, 254, 0.15);
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease;
  }

  .screenshot-tab:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.3);
    border-color: rgba(230, 244, 254, 0.3);
  }

  .screenshot-tab.active {
    background: rgba(147, 180, 205, 0.2);
    border-color: #93b4cd;
    color: #e6f4fe;
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

  .form-row-top {
    align-items: stretch;
  }

  .ai-use-group {
    flex: 1;
  }

  .ai-sub-label {
    font-size: 13px;
  }

  .ai-checkbox {
    margin-bottom: 10px;
  }

  .ai-textarea {
    min-height: 80px;
    flex: 1;
  }

  .disabled-field {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .disabled-label {
    opacity: 0.35;
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
    display: none;
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

  .form-bottom-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 24px;
    margin-top: 24px;
    max-width: 1050px;
  }

  .other-program-group {
    flex: 1;
    min-width: 0;
  }

  .form-actions {
    display: flex;
    gap: 12px;
    margin-left: auto;
    flex-shrink: 0;
  }

  .form-btn-delete {
    padding: 10px 24px;
    background: none;
    border: 3px solid #c48382;
    border-bottom: 7px solid #a06a69;
    border-radius: 4px;
    font-family: "Courier New", monospace;
    font-size: 15px;
    font-weight: 700;
    color: #c48382;
    cursor: pointer;
    margin-right: auto;
    transition: background 150ms ease, color 150ms ease, transform 0.1s ease, border-bottom-width 0.1s ease;
  }

  .form-btn-delete:hover {
    background: #c48382;
    color: #fff;
  }

  .form-btn-delete:active {
    transform: translateY(4px);
    border-bottom-width: 3px;
  }

  .form-btn-submit {
    padding: 10px 28px;
    background: #c48382;
    border: 3px solid #a06a69;
    border-bottom: 7px solid #8a5857;
    border-radius: 4px;
    font-family: "Courier New", monospace;
    font-size: 15px;
    font-weight: 700;
    color: #fff;
    cursor: pointer;
    box-shadow: 4px 4px 0 #3a3832;
    transition: transform 0.1s ease, box-shadow 0.1s ease, border-bottom-width 0.1s ease;
  }

  .form-btn-submit:hover:not(:disabled) {
    transform: translate(-1px, -1px);
    box-shadow: 5px 5px 0 #3a3832;
  }

  .form-btn-submit:active:not(:disabled) {
    transform: translateY(4px);
    border-bottom-width: 3px;
    box-shadow: 2px 1px 0 #3a3832;
  }

  .form-btn-submit:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .submit-review-wrap {
    position: relative;
  }

  .form-btn-review {
    padding: 10px 28px;
    background: #7f796d;
    border: 3px solid #6a655a;
    border-bottom: 7px solid #5a5549;
    border-radius: 4px;
    font-family: "Courier New", monospace;
    font-size: 15px;
    font-weight: 700;
    color: #fff;
    cursor: not-allowed;
    opacity: 0.5;
    transition: background 200ms ease, opacity 200ms ease, transform 0.1s ease, border-bottom-width 0.1s ease, box-shadow 0.1s ease;
  }

  .form-btn-review.ready {
    background: #5a9e6f;
    border-color: #488a5a;
    border-bottom-color: #3a7a4a;
    cursor: pointer;
    opacity: 1;
    box-shadow: 4px 4px 0 #3a3832;
  }

  .form-btn-review.ready:hover {
    background: #4a8e5f;
    transform: translate(-1px, -1px);
    box-shadow: 5px 5px 0 #3a3832;
  }

  .form-btn-review.ready:active {
    transform: translateY(4px);
    border-bottom-width: 3px;
    box-shadow: 2px 1px 0 #3a3832;
  }

  .review-tooltip {
    display: none;
    position: absolute;
    bottom: calc(100% + 8px);
    right: 0;
    background: #3a3832;
    color: #cbc1ae;
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 14px;
    padding: 8px 12px;
    white-space: nowrap;
    text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.3);
    clip-path: polygon(2% 0%, 98% 3%, 100% 97%, 0% 100%);
  }

  .submit-review-wrap:hover .review-tooltip {
    display: block;
  }

  .required {
    color: #c48382;
    font-size: 36px;
    vertical-align: baseline;
    line-height: 1;
    display: inline-block;
    transform: translateY(6px);
  }

  .hackatime-group {
    position: relative;
  }

  .hackatime-row {
    display: flex;
    gap: 8px;
    align-items: stretch;
  }

  .hackatime-select-wrap {
    position: relative;
    flex: 1;
  }

  .hackatime-trigger {
    padding: 10px 14px;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(230, 244, 254, 0.15);
    cursor: pointer;
    height: 100%;
    display: flex;
    align-items: center;
    overflow: hidden;
    font-family: "Courier New", monospace;
    font-size: 15px;
    color: #e6f4fe;
    transition: border-color 150ms ease;
    clip-path: polygon(
      0% 6%, 4% 0%, 8% 4%, 14% 1%, 20% 5%, 28% 0%, 35% 3%, 42% 1%, 50% 5%, 58% 0%, 65% 4%, 72% 1%, 80% 5%, 86% 0%, 92% 3%, 96% 1%, 100% 4%,
      99.5% 50%,
      100% 94%, 96% 100%, 92% 96%, 86% 100%, 80% 95%, 72% 100%, 65% 97%, 58% 100%, 50% 95%, 42% 100%, 35% 97%, 28% 100%, 20% 96%, 14% 100%, 8% 97%, 4% 100%, 0% 95%,
      0.5% 50%
    );
  }

  .hackatime-placeholder {
    font-family: "Courier New", monospace;
    font-size: 14px;
    color: #7f796d;
  }

  .hackatime-selected {
    font-family: "Courier New", monospace;
    font-size: 14px;
    color: #cbc1ae;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hackatime-dropdown {
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    max-height: 200px;
    overflow-y: auto;
    padding: 4px 0;
    background: #fff;
    border: 1px solid #ddd;
    border-bottom: none;
    border-radius: 3px 3px 0 0;
  }

  .hackatime-option {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-family: "Courier New", monospace;
    font-size: 13px;
    color: #222;
    padding: 5px 8px;
  }

  .hackatime-option:hover {
    background: #f0f0f0;
  }

  .hackatime-option input[type="checkbox"] {
    appearance: none;
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    min-width: 14px;
    border: 1px solid #999;
    border-radius: 2px;
    background: #fff;
    cursor: pointer;
  }

  .hackatime-option input[type="checkbox"]:checked {
    background: #222;
    border-color: #222;
  }

  .hackatime-empty {
    font-family: "Courier New", monospace;
    font-size: 13px;
    color: #999;
    padding: 5px 8px;
    padding: 4px;
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
    max-width: 1050px;
    box-sizing: border-box;
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
    display: flex;
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
    min-width: 4px;
  }

  .progress-fill.approved { background: #93b4cd; }
  .progress-fill.unreviewed { background: #cbc1ae; }
  .progress-fill.changes_needed { background: #d4a55a; }
  .progress-fill.unshipped { background: #c48382; }

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
    display: grid;
    grid-template-columns: auto auto;
    gap: 8px 28px;
    flex-shrink: 0;
    padding-top: 6px;
  }

  .key-item {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 20px;
    text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
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

  .key-swatch.changes-needed {
    background: #d4a55a;
  }

  .key-swatch.unshipped {
    background: #c48382;
  }

  .projects-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 20px;
    border: 4px dashed rgba(230, 244, 254, 0.2);
    border-radius: 8px;
    text-align: center;
    flex: 1;
    gap: 16px;
  }

  .projects-box.has-projects {
    display: grid;
    grid-template-columns: repeat(var(--cols, 1), 1fr);
    align-items: stretch;
    justify-content: start;
    max-height: min(60vh, 600px);
    overflow-y: auto;
    overflow-x: hidden;
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
    border: 3px solid #a06a69;
    border-bottom: 8px solid #8a5857;
    box-shadow: 4px 4px 0 #3a3832;
    transition: transform 0.1s ease, box-shadow 0.1s ease, border-bottom-width 0.1s ease;
  }

  .action-btn:hover {
    transform: translate(-1px, -1px);
    box-shadow: 5px 5px 0 #3a3832;
  }

  .action-btn:active {
    transform: translateY(5px);
    border-bottom-width: 3px;
    box-shadow: 2px 1px 0 #3a3832;
  }

  /* ── review checklist ─────────────────────────────── */
  .section-review .section-inner {
    max-width: 700px;
    position: relative;
    user-select: none;
    -webkit-user-select: none;
  }

  .review-close {
    position: absolute;
    top: -8px;
    right: 0;
  }

  .review-note {
    font-family: "Courier New", monospace;
    font-size: 14px;
    color: #9e9888;
    line-height: 1.6;
    margin: 16px 0 28px;
  }

  .review-checklist {
    display: flex;
    flex-direction: column;
    gap: 18px;
    margin-bottom: 28px;
  }

  .review-check {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    cursor: pointer;
    font-family: "Courier New", monospace;
    font-size: 15px;
    color: #cbc1ae;
    line-height: 1.5;
  }

  .review-check input[type="checkbox"] {
    appearance: none;
    -webkit-appearance: none;
    width: 22px;
    height: 22px;
    min-width: 22px;
    border: 3px solid #6c6659;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.2);
    cursor: pointer;
    margin-top: 2px;
    transition: background 150ms ease, border-color 150ms ease;
  }

  .review-check input[type="checkbox"]:checked {
    background: #5a9e6f;
    border-color: #488a5a;
  }

  .review-check input[type="checkbox"]:checked::after {
    content: '\2713';
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    width: 100%;
    height: 100%;
  }

  .review-submit-btn {
    display: block;
    width: 100%;
    padding: 16px;
    font-size: 20px;
    text-align: center;
  }

  .review-submit-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* ── project cards ──────────────────────────────── */
  .project-card {
    display: flex;
    gap: 16px;
    min-width: 0;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(230, 244, 254, 0.1);
    padding: 16px;
    text-align: left;
    clip-path: polygon(
      0% 4%, 2% 0%, 5% 3%, 98% 1%, 100% 5%,
      100% 96%, 98% 100%, 2% 98%, 0% 100%, 0% 4%
    );
    cursor: pointer;
    transition: background 150ms ease;
  }

  .project-card:hover {
    background: rgba(0, 0, 0, 0.3);
  }

  .project-thumb {
    width: 100px;
    height: 100px;
    object-fit: cover;
    flex-shrink: 0;
    clip-path: polygon(2% 0%, 98% 3%, 100% 97%, 0% 100%);
  }

  .project-info {
    flex: 1;
    min-width: 0;
  }

  .project-header-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 6px;
  }

  .project-name {
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: clamp(20px, 2vw, 26px);
    color: #e6f4fe;
    margin: 0;
    letter-spacing: 0.02em;
    text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.4);
  }

  .project-type-badge {
    font-family: "Courier New", monospace;
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #635a4e;
    background: #cbc1ae;
    padding: 4px 12px;
    clip-path: polygon(4% 0%, 96% 4%, 100% 96%, 0% 100%);
  }

  .project-status-badge {
    font-family: "Courier New", monospace;
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #fff;
    padding: 4px 12px;
    clip-path: polygon(4% 0%, 96% 4%, 100% 96%, 0% 100%);
  }

  .project-status-badge.unshipped {
    background: #c48382;
  }

  .project-status-badge.unreviewed {
    background: #cbc1ae;
    color: #635a4e;
  }

  .project-status-badge.changes_needed {
    background: #d4a55a;
    color: #635a4e;
  }

  .project-status-badge.approved {
    background: #93b4cd;
    color: #635a4e;
  }

  .project-desc {
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 18px;
    text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
    color: #cbc1ae;
    margin: 0 0 10px;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .project-links {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }

  .project-link {
    font-family: "Courier New", monospace;
    font-size: 13px;
    font-weight: 700;
    color: #93b4cd;
    text-decoration: none;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .project-link:hover {
    color: #e6f4fe;
  }

  .project-hackatime {
    font-family: "Courier New", monospace;
    font-size: 13px;
    color: #7f796d;
  }

  .new-project-btn {
    grid-column: 1 / -1;
    justify-self: center;
    align-self: start;
    width: fit-content;
    margin-top: 8px;
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 17px;
    text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
    padding: 8px 20px;
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

  /* ── mobile warning ───────────────────────────────── */
  .mobile-warning {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: #4b4840;
    align-items: center;
    justify-content: center;
    padding: 32px;
  }

  .mobile-warning-inner {
    text-align: center;
    max-width: 360px;
  }

  .mobile-warning-icon {
    width: 48px;
    height: 48px;
    color: #c48382;
    margin-bottom: 20px;
  }

  .mobile-warning-text {
    font-family: "Courier New", monospace;
    font-size: 16px;
    color: #cbc1ae;
    line-height: 1.5;
    margin: 0;
  }

  .mobile-warning-text strong {
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 20px;
    color: #e6f4fe;
  }

  @media (max-width: 600px) {
    .mobile-warning {
      display: flex;
    }

    .sidebar,
    .main {
      display: none;
    }
  }

  /* ── responsive ─────────────────────────────────── */
  @media (min-width: 1200px) {
    .form-gear {
      display: block;
    }
  }

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
      border-width: 2px;
      border-bottom-width: 4px;
    }

    .nav-btn:active {
      transform: translateY(2px);
      border-bottom-width: 2px;
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
