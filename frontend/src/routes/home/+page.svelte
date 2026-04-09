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
  import confetti from 'canvas-confetti';

  let { data } = $props();

  let mobileWarningDismissed = $state(false);
  let activeSection = $state('projects');
  let tileLoaded = $state(false);
  let customCursorEnabled = $state(typeof localStorage !== 'undefined' ? localStorage.getItem('customCursor') !== 'off' : true);
  let creatingProject = $state(false);
  let editingProject = $state<any>(null);
  type ProjectReview = { id: string; status: 'approved' | 'changes_needed'; feedback: string | null; reviewerName: string | null; createdAt: string };
  let editingProjectReviews = $state<ProjectReview[]>([]);
  let editingProjectReviewsLoading = $state(false);

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
  let catImages = $state<Record<string, string>>({});
  let hackatimeProjects = $state<string[]>([]);
  let hackatimeLoading = $state(false);
  let hackatimeOpen = $state(false);
  let submitting = $state(false);
  let formError = $state('');
  let auditLog = $state<{ action: string; label: string; createdAt: string }[]>([]);
  let newsItems = $state<{ id: string; text: string; displayDate: string }[]>([]);
  let leaderboard = $state<{ name: string; hours: number }[]>([]);
  let leaderboardLoading = $state(true);
  let exploreProjects = $state<{ id: string; name: string; description: string; projectType: string; screenshot1Url: string | null; screenshot2Url: string | null; codeUrl: string | null; demoUrl: string | null; hours: number; builderName: string }[]>([]);
  let exploreLoading = $state(true);

  // Explore card screenshot index (per project)
  let cardImgIdx = $state<Record<string, number>>({});

  // Project detail view
  let detailProject = $state<any>(null);
  let detailLoading = $state(false);
  let detailComments = $state<{ id: string; body: string; authorName: string; authorId: string; createdAt: string }[]>([]);
  let detailCommentsLoading = $state(false);
  let detailCommentText = $state('');
  let detailCommentSubmitting = $state(false);
  let detailActiveImg = $state(0);
  let stickerLink = $state<string | null>(null);

  // Shop state
  type ShopItemType = { id: string; name: string; description: string; imageUrl: string; priceHours: number; stock: number | null; sortOrder: number; estimatedShip: string | null };
  let shopItems = $state<ShopItemType[]>([]);
  let shopLoading = $state(false);
  let shopLoaded = $state(false);
  let selectedShopItem = $state<ShopItemType | null>(null);
  let shopQuantity = $state(1);
  let userPipes = $state(0);
  let purchaseLoading = $state(false);
  let purchaseError = $state('');
  let purchaseSuccess = $state('');

  // Fulfillment updates state
  type FulfillmentUpdateType = { id: string; orderId: string; itemName: string; message: string; isRead: boolean; createdAt: string };
  let fulfillmentUpdates = $state<FulfillmentUpdateType[]>([]);
  let fulfillmentLoading = $state(false);
  let unreadCount = $state(0);
  let nicknameInput = $state(data.user.nickname ?? '');
  let nicknameSaving = $state(false);
  let totalBuilders = $state(0);
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
  let projectCols = $derived(Math.min(2, Math.ceil(Math.sqrt(projects.length))));

  // Review checklist
  let reviewProject = $state<any>(null);
  let checkOpenSource = $state(false);
  let checkDemoable = $state(false);
  let checkReadme = $state(false);
  let checkHackatime = $state(false);
  let checkStartedOrUpdated = $state(false);
  let canConfirmReview = $derived(checkOpenSource && checkDemoable && checkReadme && checkHackatime && checkStartedOrUpdated && !submitting);
  let reviewSubmitted = $state(false);
  let reviewSubmittedName = $state('');

  // Resubmit state (approved projects)
  let resubmitChangeDesc = $state('');
  let resubmitMinHours = $state(false);
  let resubmitLoading = $state(false);

  // Shipping eligibility
  let shippingCheck = $state<{ hasAddress: boolean; hasBirthdate: boolean; eligible: boolean; addressPortalUrl: string } | null>(null);
  let shippingCheckLoading = $state(false);
  let showShippingPrompt = $state(false);

  function resetForm() {
    creatingProject = false;
    editingProject = null;
    reviewProject = null;
    reviewSubmitted = false;
    reviewSubmittedName = '';
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
    resubmitChangeDesc = '';
    resubmitMinHours = false;
    resubmitLoading = false;
    editingProjectReviews = [];
    editingProjectReviewsLoading = false;
  }

  async function fetchProjectReviews(projectId: string) {
    editingProjectReviews = [];
    editingProjectReviewsLoading = true;
    try {
      const res = await fetch(`/api/projects/${projectId}/reviews`);
      if (res.ok) {
        const data = await res.json();
        editingProjectReviews = Array.isArray(data) ? data : [];
      }
    } catch { /* silent */ }
    editingProjectReviewsLoading = false;
  }

  async function resubmitProject() {
    if (!editingProject || !resubmitChangeDesc.trim() || !resubmitMinHours || resubmitLoading) return;
    resubmitLoading = true;
    formError = '';

    // Check shipping eligibility before proceeding
    const eligible = await checkShippingEligibility();
    if (!eligible) {
      resubmitLoading = false;
      return;
    }

    try {
      const res = await fetch(`/api/projects/${editingProject.id}/resubmit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changeDescription: resubmitChangeDesc.trim(),
          minHoursConfirmed: resubmitMinHours,
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        formError = Array.isArray(data.message) ? data.message.join(', ') : data.message || `Server error (${res.status})`;
        resubmitLoading = false;
        return;
      }
      reviewSubmittedName = editingProject.name;
      reviewSubmitted = true;
      resetForm();
      launchConfetti();
      fetchProjects();
      fetchAuditLog();
      fetchProjectHours();
    } catch {
      formError = 'Something went wrong. Please try again.';
    }
    resubmitLoading = false;
  }

  function launchConfetti() {
    const colors = ['#5a9e6f', '#93b4cd', '#cbc1ae', '#c48382', '#809fb7', '#e6f4fe'];
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 },
      colors,
    });
    // Second burst slightly delayed for a fuller effect
    setTimeout(() => {
      confetti({
        particleCount: 60,
        spread: 100,
        origin: { y: 0.5, x: 0.35 },
        colors,
      });
      confetti({
        particleCount: 60,
        spread: 100,
        origin: { y: 0.5, x: 0.65 },
        colors,
      });
    }, 200);
  }

  function openCreateProject() {
    resetForm();
    creatingProject = true;
  }

  function openEditProject(project: any) {
    resetForm();
    editingProject = project;
    fetchProjectReviews(project.id);
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
        // Fetch cat placeholder images for projects without screenshots
        for (const p of projects) {
          if (!p.screenshot1Url) {
            fetch('/api/cat').then(r => r.json()).then(d => {
              if (d?.url) catImages = { ...catImages, [p.id]: d.url };
            }).catch(() => {});
          }
        }
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

  async function fetchLeaderboard() {
    leaderboardLoading = true;
    try {
      const res = await fetch('/api/leaderboard');
      if (res.ok) {
        const data = await res.json();
        leaderboard = Array.isArray(data.leaderboard) ? data.leaderboard : [];
        totalBuilders = data.totalUsers ?? 0;
      }
    } catch { /* silent */ }
    leaderboardLoading = false;
  }

  async function fetchExploreProjects() {
    exploreLoading = true;
    try {
      const res = await fetch('/api/projects/explore');
      if (res.ok) {
        exploreProjects = await res.json();
      }
    } catch { /* silent */ }
    exploreLoading = false;
  }

  async function openProjectDetail(projectId: string) {
    detailProject = null;
    detailComments = [];
    detailCommentText = '';
    detailActiveImg = 0;
    detailLoading = true;
    detailCommentsLoading = true;
    try {
      const [projRes, commRes] = await Promise.all([
        fetch(`/api/projects/explore/${projectId}`),
        fetch(`/api/projects/explore/${projectId}/comments`),
      ]);
      if (projRes.ok) detailProject = await projRes.json();
      if (commRes.ok) detailComments = await commRes.json();
    } catch { /* silent */ }
    detailLoading = false;
    detailCommentsLoading = false;
  }

  function closeProjectDetail() {
    detailProject = null;
    detailComments = [];
    detailCommentText = '';
  }

  async function submitComment() {
    if (!detailProject || detailCommentSubmitting) return;
    const body = detailCommentText.trim();
    if (!body) return;
    detailCommentSubmitting = true;
    try {
      const res = await fetch(`/api/projects/explore/${detailProject.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        detailCommentText = '';
        // Refresh comments
        const commRes = await fetch(`/api/projects/explore/${detailProject.id}/comments`);
        if (commRes.ok) detailComments = await commRes.json();
      }
    } catch { /* silent */ }
    detailCommentSubmitting = false;
  }

  async function deleteComment(commentId: string) {
    if (!detailProject) return;
    try {
      const res = await fetch(`/api/projects/explore/${detailProject.id}/comments/${commentId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        detailComments = detailComments.filter((c) => c.id !== commentId);
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

  async function fetchNews() {
    try {
      const res = await fetch('/api/news');
      if (res.ok) {
        const data = await res.json();
        newsItems = Array.isArray(data) ? data : [];
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
      // Only send screenshots if the user uploaded new files.
      // When editing, screenshotFiles are null for existing URLs — don't wipe them.
      const hasNewFiles = screenshotFiles.some(f => f !== null);
      if (hasNewFiles) {
        body.screenshots = screenshots;
      } else if (!isEdit) {
        // New project with no screenshots — send empty array
        body.screenshots = [];
      }
      // When editing with no new files: omit screenshots entirely to preserve existing ones

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

  async function checkShippingEligibility(): Promise<boolean> {
    shippingCheckLoading = true;
    try {
      const res = await fetch('/api/auth/shipping-eligibility');
      if (res.ok) {
        shippingCheck = await res.json();
        if (!shippingCheck?.eligible) {
          showShippingPrompt = true;
          return false;
        }
        return true;
      }
    } catch { /* silent */ }
    shippingCheckLoading = false;
    return true; // don't block on network errors
  }

  async function submitForReview() {
    if (!editingProject || !canSubmitForReview) return;
    formError = '';
    submitting = true;

    // Check shipping eligibility before proceeding
    const eligible = await checkShippingEligibility();
    if (!eligible) {
      submitting = false;
      return;
    }

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
      // Only send screenshots if the user uploaded new files — preserve existing ones otherwise
      const hasNewFiles = screenshotFiles.some(f => f !== null);
      if (hasNewFiles) {
        body.screenshots = screenshots;
      }

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
      reviewSubmittedName = reviewProject.name;
      reviewSubmitted = true;
      reviewProject = null;
      launchConfetti();
      fetchProjects();
      fetchAuditLog();
    } catch {
      formError = 'Something went wrong. Please try again.';
    }
    submitting = false;
  }

  async function convertToDraft(id: string) {
    if (!confirm('Converting to draft will remove you from the review queue. Continue?')) return;
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'unshipped' })
      });
      if (res.ok) {
        resetForm();
        fetchProjects();
        fetchAuditLog();
      }
    } catch { /* silent */ }
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


  async function fetchShopItems() {
    if (shopLoaded) return;
    shopLoading = true;
    try {
      const res = await fetch('/api/shop');
      if (res.ok) shopItems = await res.json();
      shopLoaded = true;
    } catch { /* silent */ }
    shopLoading = false;
  }

  function openShopItem(item: ShopItemType) {
    selectedShopItem = item;
    shopQuantity = 1;
  }

  function closeShopItem() {
    selectedShopItem = null;
  }


  let faqOpenIndex: number | null = $state(null);
  const faqItems = [
    { q: 'What is Beest?', a: 'Beest is a Hack Club hackathon/event in the Netherlands! Participants qualify by building any project and documenting the process, and those who qualify fly to the Netherlands to build their own beests (mechanical animals!). The event is themed around Strandbeests, a kinetic sculpture developed in the netherlands by Theo Jansen. Participants will have the opportunity to go to a strandbeest exhibit!' },
    { q: 'Who can participate?', a: 'Any teens 13-19 or in high school can participate. We can also provide flight stipends for international students to get to the event.' },
    { q: 'How much does it cost?', a: 'Beest is completely free to participate in! All costs for the event are covered, including food, accomodation, day-off travel and merchandise. Additionally participants can earn stipends for visa application fees and flight costs.' },
    { q: 'Where and when does Beest take place?', a: '[TBD]' },
    { q: 'How do I qualify?', a: "Build an open source coding or hardware project! Anything you can dream up is possible, just make the project you want to exist. Please don't AI generate the project, instead focus on making something fun, silly, useful to you or a project that forces you to learn something new. 40 hours of tracked work will automatically qualify you, and working for additional hours will contribute $10/hr toward your flight cost or visa application fees." },
    { q: 'What should I bring?', a: 'A laptop, a sleeping bag, clothes, a charger, a mobile phone... A more conclusive list will be sent out closer to the event.' },
    { q: 'Do I need prior engineering or building experience?', a: 'No! Hack Club is all about learning by doing, so we welcome builders of all experience levels. We will provide resources and support to help you build your mechanical animal, and we can help you in the #beest channel on Slack!' },
    { q: 'What is a Strandbeest?', a: 'A Strandbeest is a kinetic sculpture that walks using wind power. They are made from lightweight materials like PVC pipe and can range in size from small tabletop models to large structures that can walk on the beach.' },
    { q: 'I have more questions — how do I get in touch?', a: 'Contact us in the #beest channel on Hack Club Slack or email euan@hackclub.com!' }
  ];

  const navItems = [
    { id: 'projects', label: 'Projects' },
    { id: 'shop', label: 'Shop' },
    { id: 'explore', label: 'Explore' },
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'faq', label: 'FAQ' },
    { id: 'me', label: 'Me' },
    { id: 'tutorial', label: 'Tutorial' }
  ];

  function navigate(id: string) {
    if (id === 'tutorial') { window.location.href = '/tutorial'; return; }
    if (creatingProject || editingProject || reviewProject) resetForm();
    activeSection = id;
    if (id === 'shop') { fetchShopItems(); fetchPipes(); }
    if (id === 'me') { fetchFulfillmentUpdates(); markFulfillmentRead(); }
  }

  async function fetchPipes() {
    try {
      const res = await fetch('/api/shop/pipes');
      if (res.ok) {
        const data = await res.json();
        userPipes = data.pipes ?? 0;
      }
    } catch { /* silent */ }
  }

  async function purchaseItem() {
    if (!selectedShopItem || purchaseLoading) return;
    purchaseError = '';
    purchaseSuccess = '';
    purchaseLoading = true;
    try {
      const res = await fetch('/api/shop/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopItemId: selectedShopItem.id, quantity: shopQuantity })
      });
      const data = await res.json();
      if (!res.ok) {
        purchaseError = data.message || 'Purchase failed';
      } else {
        purchaseSuccess = `Ordered ${shopQuantity}x ${selectedShopItem.name}!`;
        userPipes = data.remainingPipes;
        // Refresh shop items (stock may have changed)
        fetchShopItems();
        // Refresh unread count
        fetchUnreadCount();
        setTimeout(() => { closeShopItem(); purchaseSuccess = ''; }, 2000);
      }
    } catch {
      purchaseError = 'Network error — try again';
    }
    purchaseLoading = false;
  }

  async function fetchFulfillmentUpdates() {
    fulfillmentLoading = true;
    try {
      const res = await fetch('/api/shop/fulfillment');
      if (res.ok) fulfillmentUpdates = await res.json();
    } catch { /* silent */ }
    fulfillmentLoading = false;
  }

  async function markFulfillmentRead() {
    try {
      await fetch('/api/shop/fulfillment/read', { method: 'POST' });
      unreadCount = 0;
    } catch { /* silent */ }
  }

  async function fetchUnreadCount() {
    try {
      const res = await fetch('/api/shop/fulfillment/unread');
      if (res.ok) {
        const data = await res.json();
        unreadCount = data.count ?? 0;
      }
    } catch { /* silent */ }
  }

  async function saveNickname() {
    const val = nicknameInput.trim();
    if (!val || val === data.user.nickname) return;
    nicknameSaving = true;
    try {
      const res = await fetch('/api/auth/nickname', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: val })
      });
      if (res.ok) {
        data.user.nickname = val;
      }
    } catch { /* ignore */ }
    nicknameSaving = false;
  }

  async function fetchStickerLink() {
    try {
      const res = await fetch('/api/onboarding/sticker-link');
      if (res.ok) {
        const data = await res.json();
        stickerLink = data.link ?? null;
      }
    } catch { /* ignore */ }
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
    fetchNews();
    fetchProjectHours();
    fetchLeaderboard();
    fetchExploreProjects();
    fetchStickerLink();
    fetchPipes();
    fetchUnreadCount();
  });
</script>

<div class="home" class:tile-loaded={tileLoaded} class:mobile-warning-active={!mobileWarningDismissed}>

  <!-- Mobile warning -->
  {#if !mobileWarningDismissed}
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
      <button class="mobile-warning-dismiss" onclick={() => mobileWarningDismissed = true}>Continue anyway</button>
    </div>
  </div>
  {/if}

  <!-- Sidebar -->
  <nav class="sidebar pinned" aria-label="Home navigation">
    <div class="sidebar-panel">
      <div class="sidebar-content">
        <a href="/" class="sidebar-brand">#BEEST</a>
        <p class="sidebar-greeting">Hey {data.user.nickname ?? data.user.name ?? 'there!'}</p>
        <ul class="sidebar-nav">
          {#each navItems as item}
            <li>
              <button
                class="nav-btn"
                class:active={activeSection === item.id}
                onclick={() => navigate(item.id)}
              >
                {item.label}
                {#if item.id === 'me' && unreadCount > 0}
                  <span class="nav-notif"></span>
                {/if}
              </button>
            </li>
          {/each}
          {#if data.role === 'Super Admin'}
            <li><a href="/admin" class="nav-btn nav-link">Admin</a></li>
          {:else if data.role === 'Reviewer' || data.role === 'Fraud Reviewer'}
            <li><a href="/admin" class="nav-btn nav-link">Review</a></li>
          {/if}
        </ul>
        {#if stickerLink}
        <a href={stickerLink} target="_blank" rel="noopener" class="sticker-promo">
          <img src="/images/sticker.webp" alt="Beest sticker" class="sticker-img" />
          <span class="sticker-text">Get Stickers</span>
        </a>
        {/if}
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

    {#if editingProject?.status === 'approved'}
    <!-- Approved project: read-only summary + resubmit form -->
    <section class="section section-resubmit">
      <div class="section-inner">
        <button class="form-cancel" onclick={resetForm}>&times;</button>

        <div class="approved-summary">
          <div class="approved-summary-row">
            {#if editingProject.screenshot1Url}
              <img class="approved-summary-thumb" src={editingProject.screenshot1Url} alt="Screenshot" />
            {/if}
            <div class="approved-summary-info">
              <h3 class="approved-summary-title">{editingProject.name}</h3>
              <span class="project-status-badge approved">approved</span>
              <p class="approved-summary-desc">{editingProject.description}</p>
              <div class="approved-summary-meta">
                <span>{editingProject.projectType}</span>
                {#if editingProject.codeUrl}<a href={editingProject.codeUrl} target="_blank" rel="noopener">Code</a>{/if}
                {#if editingProject.demoUrl}<a href={editingProject.demoUrl} target="_blank" rel="noopener">Demo</a>{/if}
                {#if editingProject.readmeUrl}<a href={editingProject.readmeUrl} target="_blank" rel="noopener">README</a>{/if}
              </div>
            </div>
          </div>
        </div>

        {#if editingProjectReviews.length > 0}
          <div class="review-feedback-list">
            <h3 class="review-feedback-heading">Review history</h3>
            {#each editingProjectReviews as review}
              <div class="review-feedback-card review-feedback-{review.status}">
                <div class="review-feedback-header">
                  <span class="review-feedback-badge {review.status}">{review.status === 'changes_needed' ? 'Changes Needed' : 'Approved'}</span>
                  {#if review.reviewerName}
                    <span class="review-feedback-reviewer">by {review.reviewerName}</span>
                  {/if}
                  <span class="review-feedback-date">{new Date(review.createdAt).toLocaleDateString()}</span>
                </div>
                {#if review.feedback}
                  <p class="review-feedback-text">{review.feedback}</p>
                {:else}
                  <p class="review-feedback-text review-feedback-empty">No feedback provided.</p>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        <div class="resubmit-section">
          <h2 class="section-title">Resubmit for Review</h2>
          <p class="section-subtitle">Ship an update to this approved project to earn more Pipes.</p>

          <div class="resubmit-form">
            <label class="resubmit-label" for="resubmit-desc">Describe changes made since last approval <span class="required">*</span></label>
            <textarea
              id="resubmit-desc"
              class="form-input form-textarea resubmit-textarea"
              maxlength={500}
              placeholder="What did you build or improve?"
              bind:value={resubmitChangeDesc}
            ></textarea>
            <div class="form-caption-row">
              <span class="form-caption">Be specific about what changed</span>
              <span class="form-charcount" class:over={resubmitChangeDesc.length >= 500}>{resubmitChangeDesc.length}/500</span>
            </div>

            <label class="review-check resubmit-check">
              <input type="checkbox" bind:checked={resubmitMinHours} />
              <span>I have worked for at least 3 hours since the last ship</span>
            </label>

            {#if formError}
              <p class="form-error">{formError}</p>
            {/if}

            <button
              class="form-btn-review resubmit-btn"
              class:ready={resubmitChangeDesc.trim() && resubmitMinHours}
              disabled={!resubmitChangeDesc.trim() || !resubmitMinHours || resubmitLoading}
              onclick={resubmitProject}
            >
              {resubmitLoading ? 'Resubmitting...' : 'Resubmit'}
            </button>
          </div>
        </div>
      </div>
    </section>
    {:else if creatingProject || editingProject}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="create-project-form" onkeydown={() => keystrokes++}>
      <div class="form-header">
        <button class="form-cancel" onclick={resetForm}>&times;</button>
      </div>

      {#if editingProject && editingProjectReviews.length > 0}
        <div class="review-feedback-list">
          <h3 class="review-feedback-heading">
            {#if editingProject.status === 'changes_needed'}Reviewer requested changes{:else}Review history{/if}
          </h3>
          {#each editingProjectReviews as review}
            <div class="review-feedback-card review-feedback-{review.status}">
              <div class="review-feedback-header">
                <span class="review-feedback-badge {review.status}">{review.status === 'changes_needed' ? 'Changes Needed' : 'Approved'}</span>
                {#if review.reviewerName}
                  <span class="review-feedback-reviewer">by {review.reviewerName}</span>
                {/if}
                <span class="review-feedback-date">{new Date(review.createdAt).toLocaleDateString()}</span>
              </div>
              {#if review.feedback}
                <p class="review-feedback-text">{review.feedback}</p>
              {:else}
                <p class="review-feedback-text review-feedback-empty">No feedback provided.</p>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

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
          <input id="other-program" type="text" class="form-input" maxlength={255} placeholder="e.g. Boba Drops, Flavortown" bind:value={otherHcProgramName} />
        </div>
        {/if}
        {#if editingProject?.status === 'unreviewed'}
          <div class="in-review-notice">
            <p class="in-review-text">This project is currently in review. You can still work on it and track hours, but you can't resubmit until it's been reviewed.</p>
            <button class="form-btn-draft" onclick={() => convertToDraft(editingProject.id)}>
              Convert to Draft
            </button>
          </div>
        {/if}
        <div class="form-actions">
          {#if editingProject && editingProject.status !== 'approved'}
            <button class="form-btn-delete" onclick={() => deleteProject(editingProject.id)}>Delete</button>
          {/if}
          <button class="form-btn-submit" disabled={!canSubmit || editingProject?.status === 'unreviewed'} onclick={submitProject}>
            {#if submitting}{editingProject ? 'Saving...' : 'Creating...'}{:else}{editingProject ? 'Save Changes' : 'Create Project'}{/if}
          </button>
          {#if editingProject && editingProject.status !== 'unreviewed'}
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

    {#if showShippingPrompt && shippingCheck}
    <section class="section section-review">
      <div class="section-inner">
        <button class="form-cancel review-close" onclick={() => { showShippingPrompt = false; }}>&times;</button>
        <h2 class="section-title">Complete Your Profile</h2>
        <p class="shipping-prompt-text">Before submitting for review, we need your shipping details so we can send you prizes. Please fill out the missing info in your Hack Club Auth settings:</p>
        <div class="shipping-prompt-items">
          {#if !shippingCheck.hasAddress}
            <div class="shipping-prompt-item missing">
              <span class="shipping-icon">&#x2717;</span>
              <span>Shipping address not set</span>
            </div>
          {:else}
            <div class="shipping-prompt-item done">
              <span class="shipping-icon">&#x2713;</span>
              <span>Shipping address</span>
            </div>
          {/if}
          {#if !shippingCheck.hasBirthdate}
            <div class="shipping-prompt-item missing">
              <span class="shipping-icon">&#x2717;</span>
              <span>Birthdate not set</span>
            </div>
          {:else}
            <div class="shipping-prompt-item done">
              <span class="shipping-icon">&#x2713;</span>
              <span>Birthdate</span>
            </div>
          {/if}
        </div>
        <a class="action-btn shipping-portal-btn" href={shippingCheck.addressPortalUrl} target="_blank" rel="noopener noreferrer">
          Update on Hack Club Auth
        </a>
        <p class="shipping-prompt-note">After updating your info, log out and log back in to refresh your profile, then try submitting again.</p>
      </div>
    </section>
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
      </div>
    </section>
    {/if}

    {#if reviewSubmitted}
    <section class="section section-review">
      <div class="section-inner review-success">
        <h2 class="section-title">"{reviewSubmittedName}" Submitted!</h2>
        <p class="review-note">Review means a human is looking over your project and checking that the code is functional, not AI generated and that the demo works. It could take around a week (hopefully less) for us to get around to your project, at which point we will offer feedback or approve your time spent. In rare cases where we believe you have unintentionally exaggerated your hours, we may approve a percentage of your hours.</p>
        <button class="action-btn review-understood-btn" onclick={resetForm}>
          Understood
        </button>
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
            <span class="progress-goal">{(hoursByStatus['approved'] ?? 0) >= GOAL_HOURS ? `${GOAL_HOURS}h approved` : `${GOAL_HOURS}h to qualify`}</span>
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
              {@const isMobile = project.projectType === 'android' || project.projectType === 'ios'}
              <div class="project-card status-{project.status}" class:landscape={!isMobile} role="button" tabindex="0" onclick={() => openEditProject(project)} onkeydown={(e) => { if (e.key === 'Enter') openEditProject(project); }}>
                {#if project.screenshot1Url}
                  <img class="project-thumb" src={project.screenshot1Url} alt="{project.name} screenshot" />
                {:else if catImages[project.id]}
                  <div class="cat-placeholder">
                    <img class="project-thumb project-thumb-cat" src={catImages[project.id]} alt="Placeholder cat" />
                    <span class="cat-caption">placeholder cat - upload your project screenshot instead</span>
                  </div>
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
          {/if}
        </div>
        {#if projects.length > 0}
          <button class="action-btn new-project-btn" onclick={openCreateProject}>+ New Project</button>
        {/if}

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
            {#if newsItems.length === 0}
              <p class="news-empty">No news yet.</p>
            {:else}
              {#each newsItems as item}
                <div class="news-item">
                  <span class="news-date">{new Date(item.displayDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <p class="news-text">{item.text}</p>
                </div>
              {/each}
            {/if}
          </div>
        </div>
        </div>
      </div>
    </section>
    {/if}

    {#if activeSection === 'shop'}
    <section class="section section-shop">
      <div class="section-inner">
        <div class="shop-container">
          <div class="shop-header-border">
            <div class="shop-header">
              <div>
                <h2 class="section-title">Earn Prizes</h2>
                <p class="section-subtitle">Build projects, earn hours, unlock rewards.</p>
              </div>
              <div class="pipes-box">
                <img src="/images/pipes.png" alt="Pipes" class="pipe-img" />
                <div class="pipes-box-text">
                  <span class="pipes-box-label">Pipes</span>
                  <span class="pipes-box-value">{userPipes}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="shop-warning-banner">
            <div class="shop-warning-track">
              {#each {length: 8} as _}
                <span class="shop-warning-text">1 approved hour = 1 pipe, spend pipes on prizes&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;</span>
              {/each}
            </div>
          </div>
          {#if shopLoading}
            <div class="shop-grid">
              {#each Array(6) as _}
                <div class="shop-card-skeleton">
                  <div class="skeleton-img"></div>
                  <div class="skeleton-line wide"></div>
                  <div class="skeleton-line narrow"></div>
                </div>
              {/each}
            </div>
          {:else if shopItems.length === 0}
            <p class="coming-soon">No items in the shop yet.</p>
          {:else}
            <div class="shop-grid">
              {#each shopItems as item}
                <button class="shop-card" onclick={() => openShopItem(item)} type="button">
                  <div class="shop-card-img">
                    <img src={item.imageUrl} alt={item.name} loading="lazy" decoding="async" />
                  </div>
                  <div class="shop-card-body">
                    <p class="shop-card-name">{item.name}</p>
                    <p class="shop-card-desc">{item.description}</p>
                    <div class="shop-card-footer">
                      <p class="shop-card-cost">{item.priceHours} Pipes</p>
                      {#if item.stock !== null}
                        <span class="shop-card-stock" class:low={item.stock <= 3}>{item.stock} left</span>
                      {/if}
                    </div>
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </section>

    <!-- Fullscreen shop item modal -->
    {#if selectedShopItem}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="shop-modal-overlay" onclick={closeShopItem} onkeydown={(e) => { if (e.key === 'Escape') closeShopItem(); }}>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="shop-modal" onclick={(e) => e.stopPropagation()}>
        <button class="shop-modal-close" onclick={closeShopItem} type="button" aria-label="Close">&times;</button>
        <div class="shop-modal-content">
          <div class="shop-modal-img">
            <img src={selectedShopItem.imageUrl} alt={selectedShopItem.name} />
          </div>
          <div class="shop-modal-details">
            <h2 class="shop-modal-name">{selectedShopItem.name}</h2>
            <p class="shop-modal-desc">{selectedShopItem.description}</p>

            <div class="shop-modal-price-row">
              <span class="shop-modal-price">{selectedShopItem.priceHours} Pipes</span>
              {#if selectedShopItem.stock !== null}
                <span class="shop-modal-stock" class:low={selectedShopItem.stock <= 3}>{selectedShopItem.stock} in stock</span>
              {:else}
                <span class="shop-modal-stock unlimited">Unlimited</span>
              {/if}
            </div>

            {#if selectedShopItem.estimatedShip}
              <div class="shop-modal-ship">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ship-icon"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                <span>{selectedShopItem.estimatedShip}</span>
              </div>
            {/if}

            <div class="shop-modal-qty">
              <span class="shop-modal-qty-label">Quantity</span>
              <div class="shop-modal-qty-controls">
                <button
                  class="qty-btn"
                  type="button"
                  onclick={() => { if (shopQuantity > 1) shopQuantity--; }}
                  disabled={shopQuantity <= 1}
                >-</button>
                <span class="qty-value">{shopQuantity}</span>
                <button
                  class="qty-btn"
                  type="button"
                  onclick={() => {
                    if (selectedShopItem!.stock === null || shopQuantity < selectedShopItem!.stock) shopQuantity++;
                  }}
                  disabled={selectedShopItem.stock !== null && shopQuantity >= selectedShopItem.stock}
                >+</button>
              </div>
            </div>

            <div class="shop-modal-total">
              <span>Total:</span>
              <span class="shop-modal-total-value">{selectedShopItem.priceHours * shopQuantity} Pipes</span>
            </div>

            {#if purchaseSuccess}
              <div class="shop-modal-success">{purchaseSuccess}</div>
            {:else if userPipes >= selectedShopItem.priceHours * shopQuantity}
              <button class="shop-modal-buy" type="button" onclick={purchaseItem} disabled={purchaseLoading}>
                <span class="buy-text">{purchaseLoading ? 'Ordering...' : 'Redeem'}</span>
              </button>
              {#if purchaseError}
                <p class="shop-modal-error">{purchaseError}</p>
              {/if}
            {:else}
              <div class="shop-modal-cant-afford">
                <p>You need <strong>{(selectedShopItem.priceHours * shopQuantity) - userPipes}</strong> more Pipes to redeem this.</p>
                <p class="shop-modal-keep-building">Keep building!</p>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
    {/if}
    {/if}

    {#if activeSection === 'explore'}
    <section class="section section-explore">
      <div class="section-inner">
        <h2 class="section-title">Explore</h2>
        <p class="section-subtitle">Discover what others are building, get inspiration!</p>
        {#if exploreLoading}
          <div class="explore-placeholder">
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
        {:else if exploreProjects.length === 0}
          <p class="coming-soon">Awaiting the first projects...</p>
        {:else}
          <div class="explore-grid explore-grid-live">
            {#each exploreProjects as ep}
              <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
              <div class="explore-card" onclick={() => openProjectDetail(ep.id)} role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter') openProjectDetail(ep.id); }}>
                {#if ep.screenshot1Url || ep.screenshot2Url}
                  <div class="explore-img-wrap">
                    <img class="explore-img" src={(cardImgIdx[ep.id] ?? 0) === 0 ? (ep.screenshot1Url ?? ep.screenshot2Url) : ep.screenshot2Url} alt="{ep.name}" />
                    {#if ep.screenshot1Url && ep.screenshot2Url}
                      <button
                        class="explore-arrow explore-arrow-left"
                        type="button"
                        onclick={(e) => { e.stopPropagation(); cardImgIdx = { ...cardImgIdx, [ep.id]: 0 }; }}
                        aria-label="Previous screenshot"
                      >&#8249;</button>
                      <button
                        class="explore-arrow explore-arrow-right"
                        type="button"
                        onclick={(e) => { e.stopPropagation(); cardImgIdx = { ...cardImgIdx, [ep.id]: 1 }; }}
                        aria-label="Next screenshot"
                      >&#8250;</button>
                      <div class="explore-dots">
                        <span class="explore-dot" class:explore-dot-active={(cardImgIdx[ep.id] ?? 0) === 0}></span>
                        <span class="explore-dot" class:explore-dot-active={(cardImgIdx[ep.id] ?? 0) === 1}></span>
                      </div>
                    {/if}
                  </div>
                {/if}
                <div class="explore-card-body">
                  <div class="explore-card-header">
                    <h3 class="explore-card-name">{ep.name}</h3>
                    <span class="explore-card-type">{ep.projectType}</span>
                  </div>
                  <p class="explore-card-desc">{ep.description}</p>
                  <div class="explore-card-meta">
                    <span class="explore-card-builder">by {ep.builderName}</span>
                    {#if ep.hours > 0}
                      <span class="explore-card-hours">{ep.hours.toFixed(1)}h</span>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </section>
    {/if}

    <!-- Project detail overlay -->
    {#if detailProject}
    <div class="detail-overlay" role="dialog" aria-modal="true">
      <div class="detail-backdrop" onclick={closeProjectDetail} onkeydown={(e) => e.key === 'Escape' && closeProjectDetail()} role="button" tabindex="-1"></div>
      <div class="detail-panel">
        <button class="detail-close" onclick={closeProjectDetail} type="button" aria-label="Close">&times;</button>

        <!-- Image gallery -->
        <div class="detail-gallery">
          {#if detailProject.screenshot1Url || detailProject.screenshot2Url}
            {@const screenshots = [detailProject.screenshot1Url, detailProject.screenshot2Url].filter(Boolean) as string[]}
            <div class="detail-img-wrap">
              <img
                class="detail-img"
                src={screenshots[detailActiveImg] ?? screenshots[0]}
                alt="{detailProject.name} screenshot {detailActiveImg + 1}"
              />
              {#if screenshots.length > 1}
                <button class="detail-arrow detail-arrow-left" onclick={() => detailActiveImg = detailActiveImg === 0 ? screenshots.length - 1 : detailActiveImg - 1} type="button" aria-label="Previous screenshot">&#8249;</button>
                <button class="detail-arrow detail-arrow-right" onclick={() => detailActiveImg = (detailActiveImg + 1) % screenshots.length} type="button" aria-label="Next screenshot">&#8250;</button>
                <div class="detail-img-dots">
                  {#each screenshots as _, i}
                    <span class="detail-dot" class:detail-dot-active={detailActiveImg === i}></span>
                  {/each}
                </div>
              {/if}
            </div>
          {:else}
            <div class="detail-img-wrap detail-no-img">
              <span>No screenshots</span>
            </div>
          {/if}
        </div>

        <!-- Project info -->
        <div class="detail-info">
          <div class="detail-header">
            <h2 class="detail-name">{detailProject.name}</h2>
            <span class="detail-type">{detailProject.projectType}</span>
          </div>
          <p class="detail-builder">by {detailProject.builderName}</p>
          {#if detailProject.hours > 0}
            <p class="detail-hours">{detailProject.hours.toFixed(1)} hours</p>
          {/if}
          <p class="detail-desc">{detailProject.description}</p>

          <!-- Chunky action buttons -->
          <div class="detail-actions">
            {#if detailProject.demoUrl}
              <a href={detailProject.demoUrl} target="_blank" rel="noopener noreferrer" class="detail-btn detail-btn-demo">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                View Demo
              </a>
            {/if}
            {#if detailProject.codeUrl}
              <a href={detailProject.codeUrl} target="_blank" rel="noopener noreferrer" class="detail-btn detail-btn-code">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                Source Code
              </a>
            {/if}
          </div>
        </div>

        <!-- Comments -->
        <div class="detail-comments">
          <h3 class="detail-comments-title">Comments</h3>

          <div class="detail-comment-form">
            <textarea
              class="detail-comment-input"
              bind:value={detailCommentText}
              placeholder="Leave a comment..."
              maxlength="500"
              rows="3"
            ></textarea>
            <div class="detail-comment-form-footer">
              <span class="detail-comment-charcount">{detailCommentText.length}/500</span>
              <button
                class="detail-comment-submit"
                onclick={submitComment}
                disabled={detailCommentSubmitting || detailCommentText.trim().length === 0}
                type="button"
              >
                {detailCommentSubmitting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>

          {#if detailCommentsLoading}
            <p class="detail-comments-loading">Loading comments...</p>
          {:else if detailComments.length === 0}
            <p class="detail-comments-empty">No comments yet. Be the first!</p>
          {:else}
            <div class="detail-comments-list">
              {#each detailComments as comment}
                <div class="detail-comment">
                  <div class="detail-comment-header">
                    <span class="detail-comment-author">{comment.authorName}</span>
                    <span class="detail-comment-date">{new Date(comment.createdAt).toLocaleDateString()}</span>
                    {#if comment.authorId === data.user.uid || detailProject.ownerId === data.user.uid || data.role}
                      <button class="detail-comment-delete" onclick={() => deleteComment(comment.id)} type="button" title="Delete comment">&times;</button>
                    {/if}
                  </div>
                  <p class="detail-comment-body">{comment.body}</p>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
    {/if}

    {#if activeSection === 'leaderboard'}
    <section class="section section-leaderboard">
      <div class="section-inner">
        <div class="leaderboard-head">
          <div>
            <h2 class="section-title">Leaderboard</h2>
            <p class="section-subtitle">Top builders by approved hours.</p>
          </div>
          <div class="lb-total-users">
            <span class="lb-total-label">Builders</span>
            <span class="lb-total-value">{leaderboardLoading ? '—' : totalBuilders}</span>
          </div>
        </div>
        <div class="leaderboard-table">
          <div class="leaderboard-header">
            <span class="lb-rank">#</span>
            <span class="lb-name">Builder</span>
            <span class="lb-hours">Hours</span>
          </div>
          {#if leaderboardLoading}
            {#each Array(10) as _, i}
              <div class="leaderboard-row">
                <span class="lb-rank">{i + 1}</span>
                <span class="lb-name skeleton-text"></span>
                <span class="lb-hours skeleton-text short"></span>
              </div>
            {/each}
          {:else if leaderboard.length > 0}
            {#each leaderboard as entry, i}
              <div class="leaderboard-row" class:top-three={i < 3}>
                <span class="lb-rank">{i + 1}</span>
                <span class="lb-name">{entry.name}</span>
                <span class="lb-hours">{entry.hours}h</span>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </section>
    {/if}

    {#if activeSection === 'faq'}
    <section class="section section-faq">
      <div class="faq-page">
        <svg class="side-gear side-gear-l1" style="transform: rotate({(faqOpenIndex !== null ? (faqOpenIndex + 1) * 45 : 0) * 0.5}deg)" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <g fill="#6c6659"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t (t)}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#4b4840"/>
        </svg>
        <svg class="side-gear side-gear-l2" style="transform: rotate({(faqOpenIndex !== null ? (faqOpenIndex + 1) * 45 : 0) * -1.8 + 22.5}deg)" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <g fill="#7f796d"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t (t)}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#4b4840"/>
        </svg>
        <svg class="side-gear side-gear-l3" style="transform: rotate({(faqOpenIndex !== null ? (faqOpenIndex + 1) * 45 : 0) * 2.5}deg)" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <g fill="#6c6659"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t (t)}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#4b4840"/>
        </svg>
        <svg class="side-gear side-gear-r1" style="transform: rotate({(faqOpenIndex !== null ? (faqOpenIndex + 1) * 45 : 0) * -1.3}deg)" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <g fill="#6c6659"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t (t)}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#4b4840"/>
        </svg>
        <svg class="side-gear side-gear-r2" style="transform: rotate({(faqOpenIndex !== null ? (faqOpenIndex + 1) * 45 : 0) * 0.3 + 22.5}deg)" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <g fill="#7f796d"><circle cx="50" cy="50" r="30"/>{#each Array(8) as _, t (t)}<rect x="43" y="4" width="14" height="22" rx="3" transform="rotate({t*45} 50 50)"/>{/each}</g><circle cx="50" cy="50" r="12" fill="#4b4840"/>
        </svg>

        <h2 class="faq-title">Frequently Asked Questions</h2>
        <p class="faq-intro">I'm sure you have lots of questions! Below is the most common ones I see, but if you need more help please email euan@hackclub.com or use the dedicated slack channel #beest-help</p>

        <div class="faq-list">
          {#each faqItems as faq, i (faq.q)}
            <button
              class="faq-item"
              class:open={faqOpenIndex === i}
              onclick={() => faqOpenIndex = faqOpenIndex === i ? null : i}
              aria-expanded={faqOpenIndex === i}
            >
              <div class="faq-question">
                <span>{faq.q}</span>
                <span class="faq-icon" class:rotated={faqOpenIndex === i}>+</span>
              </div>
              {#if faqOpenIndex === i}
                <div class="faq-answer">
                  <p>{faq.a}</p>
                </div>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    </section>
    {/if}

    {#if activeSection === 'me'}
    <section class="section section-settings">
      <div class="section-inner">
        <h2 class="section-title settings-title">Me</h2>

        <div class="me-columns">
          <div class="me-left">
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

          <div class="me-right">
            <div class="account-card">
              <h3 class="account-card-heading">Preferences</h3>
              <label class="pref-toggle">
                <input
                  type="checkbox"
                  checked={customCursorEnabled}
                  onchange={(e) => {
                    customCursorEnabled = e.currentTarget.checked;
                    if (customCursorEnabled) {
                      localStorage.removeItem('customCursor');
                      document.documentElement.classList.add('custom-cursor');
                    } else {
                      localStorage.setItem('customCursor', 'off');
                      document.documentElement.classList.remove('custom-cursor');
                    }
                  }}
                />
                <span class="pref-label-text">Custom cursor</span>
              </label>
            </div>

            <div class="account-card">
              <h3 class="account-card-heading">Your Account</h3>
              <div class="account-fields">
                <div class="account-field">
                  <span class="account-label">Name</span>
                  <span class="account-value">{data.user.name ?? '—'}</span>
                </div>
                <div class="account-field">
                  <span class="account-label">Nickname</span>
                  <form class="nickname-form" onsubmit={(e) => { e.preventDefault(); saveNickname(); }}>
                    <input
                      type="text"
                      class="nickname-input"
                      maxlength="50"
                      bind:value={nicknameInput}
                    />
                    {#if nicknameInput.trim() && nicknameInput.trim() !== (data.user.nickname ?? '')}
                      <button type="submit" class="nickname-save" disabled={nicknameSaving}>
                        {nicknameSaving ? '...' : 'Save'}
                      </button>
                    {/if}
                  </form>
                </div>
                <div class="account-field">
                  <span class="account-label">Email</span>
                  <span class="account-value">{data.user.email ?? '—'}</span>
                </div>
                <div class="account-field">
                  <span class="account-label">Slack ID</span>
                  <span class="account-value">{data.user.slack_id ?? '—'}</span>
                </div>
              </div>
            </div>
            <div class="account-card fulfillment-card">
              <h3 class="account-card-heading">Fulfillment Updates</h3>
              {#if fulfillmentLoading}
                <p class="fulfillment-empty">Loading...</p>
              {:else if fulfillmentUpdates.length === 0}
                <p class="fulfillment-empty">No updates yet. Place an order from the Shop to see updates here!</p>
              {:else}
                <div class="fulfillment-list">
                  {#each fulfillmentUpdates as update}
                    <div class="fulfillment-item" class:fulfillment-unread={!update.isRead}>
                      <div class="fulfillment-item-header">
                        <span class="fulfillment-item-name">{update.itemName}</span>
                        <span class="fulfillment-item-date">{new Date(update.createdAt).toLocaleDateString()}</span>
                      </div>
                      <p class="fulfillment-item-msg">{update.message}</p>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
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

  .nav-link {
    text-decoration: none;
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
    max-width: calc(100vw - 210px);
    display: flex;
    flex-direction: column;
  }

  /* ── sections ────────────────────────────────────── */
  .section {
    position: relative;
    padding: 48px 48px 32px 150px;
    box-sizing: border-box;
    overflow: hidden;
    display: flex;
    flex-direction: column;
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
  .tile-loaded .section-resubmit::after,
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
    width: 100%;
    max-width: 1600px;
    margin: 0 auto;
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
    align-items: start;
    gap: 28px;
    margin-top: 24px;
  }

  .action-log,
  .news-box {
    display: flex;
    flex-direction: column;
    padding: 24px;
    border: 1px solid rgba(230, 244, 254, 0.1);
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.15);
    max-height: 420px;
    overflow: hidden;
  }

  .timeline,
  .news-list {
    overflow-y: auto;
    min-height: 0;
    flex: 1;
    -webkit-mask-image: linear-gradient(to bottom, black 80%, transparent 100%);
    mask-image: linear-gradient(to bottom, black 80%, transparent 100%);
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
    max-width: 1500px;
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
    max-width: 1500px;
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

  .in-review-notice {
    background: rgba(203, 193, 174, 0.15);
    border: 2px solid #cbc1ae;
    clip-path: polygon(0% 2%, 3% 0%, 97% 1%, 100% 3%, 99% 97%, 96% 100%, 4% 99%, 0% 96%);
    padding: 12px 16px;
    overflow-wrap: break-word;
    word-wrap: break-word;
    width: 100%;
    margin-bottom: 8px;
  }

  .in-review-text {
    margin: 0;
    font-family: "Courier New", monospace;
    font-size: 14px;
    color: #cbc1ae;
    line-height: 1.4;
    text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
  }

  .form-btn-draft {
    margin-top: 12px;
    padding: 8px 20px;
    background: none;
    border: 2px solid #cbc1ae;
    border-bottom: 5px solid #9e9888;
    border-radius: 4px;
    font-family: "Courier New", monospace;
    font-size: 13px;
    font-weight: 700;
    color: #cbc1ae;
    cursor: pointer;
    transition: background 200ms ease, transform 0.1s ease, border-bottom-width 0.1s ease;
  }

  .form-btn-draft:hover {
    background: rgba(203, 193, 174, 0.1);
    transform: translate(-1px, -1px);
  }

  .form-btn-draft:active {
    transform: translateY(3px);
    border-bottom-width: 2px;
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

  /* ── Resubmit section ─────────────────────────── */
  .section-resubmit {
    background: #4b4840;
  }

  .approved-summary {
    padding: 24px 28px;
    background: rgba(0, 0, 0, 0.25);
    clip-path: polygon(0% 2%, 2% 0%, 98% 1%, 100% 3%, 99% 97%, 97% 100%, 3% 99%, 0% 96%);
    margin-bottom: 40px;
  }

  .approved-summary-row {
    display: flex;
    gap: 20px;
    align-items: flex-start;
  }

  .approved-summary-thumb {
    width: 140px;
    height: 90px;
    object-fit: cover;
    border-radius: 4px;
    opacity: 0.85;
    flex-shrink: 0;
  }

  .approved-summary-info {
    flex: 1;
    min-width: 0;
  }

  .approved-summary-title {
    margin: 0 12px 0 0;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 32px;
    color: #e6f4fe;
    display: inline;
    vertical-align: middle;
  }

  .approved-summary-desc {
    margin: 10px 0 8px;
    font-family: "Courier New", monospace;
    font-size: 16px;
    color: #cbc1ae;
    line-height: 1.4;
  }

  .approved-summary-meta {
    display: flex;
    gap: 14px;
    font-family: "Courier New", monospace;
    font-size: 14px;
    color: #7f796d;
    flex-wrap: wrap;
  }

  .approved-summary-meta a {
    color: #93b4cd;
    text-decoration: none;
  }

  .approved-summary-meta a:hover {
    text-decoration: underline;
  }

  .review-feedback-list {
    margin: 0 0 32px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 720px;
  }

  .review-feedback-heading {
    margin: 0 0 4px;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 22px;
    color: #e6f4fe;
    text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.3);
  }

  .review-feedback-card {
    padding: 16px 20px;
    background: rgba(0, 0, 0, 0.3);
    border-left: 4px solid #7f796d;
    clip-path: polygon(0% 3%, 2% 0%, 98% 2%, 100% 5%, 99% 96%, 97% 100%, 3% 99%, 0% 95%);
  }

  .review-feedback-changes_needed {
    border-left-color: #d4a55a;
  }

  .review-feedback-approved {
    border-left-color: #5a9e6f;
  }

  .review-feedback-header {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }

  .review-feedback-badge {
    font-family: "Courier New", monospace;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 3px 10px;
    border-radius: 3px;
    background: rgba(212, 165, 90, 0.2);
    color: #d4a55a;
  }

  .review-feedback-badge.approved {
    background: rgba(90, 158, 111, 0.2);
    color: #5a9e6f;
  }

  .review-feedback-reviewer {
    font-family: "Courier New", monospace;
    font-size: 13px;
    color: #cbc1ae;
  }

  .review-feedback-date {
    font-family: "Courier New", monospace;
    font-size: 12px;
    color: #7f796d;
    margin-left: auto;
  }

  .review-feedback-text {
    margin: 0;
    font-family: "Courier New", monospace;
    font-size: 15px;
    color: #e6f4fe;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  .review-feedback-empty {
    color: #7f796d;
    font-style: italic;
  }

  .resubmit-section {
    margin-bottom: 24px;
  }

  .resubmit-form {
    margin-top: 24px;
    max-width: 600px;
  }

  .resubmit-label {
    display: block;
    margin-bottom: 10px;
    font-family: "Courier New", monospace;
    font-size: 17px;
    color: #93b4cd;
    text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.3);
  }

  .resubmit-textarea {
    font-size: 16px;
    min-height: 100px;
  }

  .resubmit-check {
    margin: 20px 0;
    font-size: 16px;
  }

  .resubmit-btn {
    font-size: 18px;
    padding: 14px 36px;
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
    max-width: 1500px;
    box-sizing: border-box;
  }

  /* ── shop ────────────────────────────────────────── */
  .section-shop {
    background: #56494a;
    overflow-y: auto;
  }

  .section-shop::after {
    position: fixed;
    inset: 0;
    z-index: 2;
  }

  .section-shop .section-inner {
    height: auto;
    z-index: 3;
  }

  .shop-header-border {
    background: #1a1a1a;
    padding: 2px;
    clip-path: polygon(0% 1%, 1% 0%, 4% 1%, 8% 0%, 14% 1%, 20% 0%, 28% 1%, 36% 0%, 44% 1%, 52% 0%, 60% 1%, 68% 0%, 76% 1%, 84% 0%, 90% 1%, 96% 0%, 100% 1%, 100% 99%, 96% 100%, 90% 99%, 84% 100%, 76% 99%, 68% 100%, 60% 99%, 52% 100%, 44% 99%, 36% 100%, 28% 99%, 20% 100%, 14% 99%, 8% 100%, 4% 99%, 1% 100%, 0% 99%);
  }

  .shop-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    background: #6c6659;
    padding: 24px 28px;
  }

  .pipes-box {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(0, 0, 0, 0.25);
    padding: 10px 18px;
    flex-shrink: 0;
    clip-path: polygon(0% 3%, 2% 0%, 98% 1%, 100% 4%, 99% 96%, 97% 100%, 3% 99%, 0% 95%);
  }

  .pipe-img {
    width: 32px;
    height: 32px;
    object-fit: contain;
    flex-shrink: 0;
  }

  .pipes-box-text {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .pipes-box-label {
    font-family: "Courier New", monospace;
    font-size: 11px;
    color: #7f796d;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .pipes-box-value {
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 28px;
    color: #e6f4fe;
    letter-spacing: 0.04em;
    line-height: 1;
    text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
  }

  .shop-warning-banner {
    margin: 56px -120px 56px;
    background: #c48382;
    padding: 16px 0;
    transform: rotate(-3deg);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
    border-top: 2px solid #1a1a1a;
    border-bottom: 2px solid #1a1a1a;
    overflow: hidden;
    white-space: nowrap;
  }

  .shop-warning-track {
    display: inline-flex;
    transform: translateX(-9.0%);
  }

  .shop-warning-text {
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: clamp(18px, 2.2vw, 28px);
    color: #1a1a1a;
    font-weight: 700;
    letter-spacing: 0.02em;
    flex-shrink: 0;
  }

  @keyframes marquee-scroll {
    0% { transform: translateX(-50%); }
    100% { transform: translateX(0); }
  }

  .shop-container {
    background: #8a7f6f;
    padding: 32px;
    clip-path: polygon(0% 0.5%, 2% 0%, 6% 0.5%, 10% 0%, 16% 0.4%, 22% 0%, 28% 0.5%, 34% 0%, 40% 0.4%, 46% 0%, 52% 0.5%, 58% 0%, 64% 0.4%, 70% 0%, 76% 0.5%, 82% 0%, 88% 0.4%, 94% 0%, 98% 0.5%, 100% 0%, 100% 5%, 99.4% 10%, 100% 16%, 99.5% 22%, 100% 28%, 99.4% 34%, 100% 40%, 99.5% 46%, 100% 52%, 99.4% 58%, 100% 64%, 99.5% 70%, 100% 76%, 99.4% 82%, 100% 88%, 99.5% 94%, 100% 99.5%, 98% 100%, 94% 99.5%, 88% 100%, 82% 99.6%, 76% 100%, 70% 99.5%, 64% 100%, 58% 99.6%, 52% 100%, 46% 99.5%, 40% 100%, 34% 99.6%, 28% 100%, 22% 99.5%, 16% 100%, 10% 99.6%, 6% 100%, 2% 99.5%, 0% 100%, 0% 94%, 0.5% 88%, 0% 82%, 0.6% 76%, 0% 70%, 0.5% 64%, 0% 58%, 0.6% 52%, 0% 46%, 0.5% 40%, 0% 34%, 0.6% 28%, 0% 22%, 0.5% 16%, 0% 10%, 0.6% 5%);
  }

  .shop-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 28px;
  }

  .shop-card {
    background: #cbc1ae;
    border: 3px solid #3a3832;
    box-shadow: 6px 6px 0 #3a3832;
    transition: transform 150ms ease, box-shadow 150ms ease;
    filter: saturate(0.667);
    clip-path: polygon(0% 1%, 2% 0%, 5% 1%, 10% 0%, 20% 1%, 30% 0%, 40% 1%, 50% 0%, 60% 1%, 70% 0%, 80% 1%, 90% 0%, 95% 1%, 98% 0%, 100% 1%, 100% 99%, 98% 100%, 95% 99%, 90% 100%, 80% 99%, 70% 100%, 60% 99%, 50% 100%, 40% 99%, 30% 100%, 20% 99%, 10% 100%, 5% 99%, 2% 100%, 0% 99%);
  }

  .shop-card:hover {
    transform: translate(-3px, -3px);
    box-shadow: 9px 9px 0 #3a3832;
  }

  .shop-card-img {
    padding: 16px 16px 0;
  }

  .shop-card-img img {
    width: 100%;
    aspect-ratio: 4 / 5;
    object-fit: contain;
    display: block;
    border: 2px solid #4b4840;
    background: #f0ebe5;
  }

  .shop-card-body {
    padding: 14px 18px 16px;
  }

  .shop-card-name {
    margin: 0 0 4px;
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 20px;
    color: #4b4840;
    line-height: 1.3;
    font-weight: 600;
  }

  .shop-card-desc {
    margin: 0 0 8px;
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 15px;
    color: #1a1a1a;
    line-height: 1.4;
  }

  .shop-card {
    cursor: pointer;
    text-align: left;
    font: inherit;
    padding: 0;
    appearance: none;
    -webkit-appearance: none;
  }

  .shop-card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .shop-card-cost {
    margin: 0;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 20px;
    color: #c48382;
  }

  .shop-card-stock {
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 13px;
    color: #6c6659;
    background: rgba(0,0,0,0.15);
    padding: 2px 8px;
    border-radius: 4px;
  }

  .shop-card-stock.low {
    color: #c48382;
    background: rgba(196, 131, 130, 0.15);
    font-weight: 700;
  }

  .shop-card-skeleton {
    background: rgba(255,255,255,0.05);
    border: 2px solid rgba(255,255,255,0.08);
    padding: 16px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .shop-card-skeleton .skeleton-img {
    width: 100%;
    aspect-ratio: 4/5;
    background: rgba(255,255,255,0.06);
    margin-bottom: 12px;
  }

  .shop-card-skeleton .skeleton-line {
    height: 14px;
    background: rgba(255,255,255,0.06);
    margin-bottom: 8px;
    border-radius: 4px;
  }

  .shop-card-skeleton .skeleton-line.wide { width: 80%; }
  .shop-card-skeleton .skeleton-line.narrow { width: 40%; }

  /* ── shop modal ── */
  .shop-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(6px);
    animation: fadeIn 200ms ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .shop-modal {
    position: relative;
    background: #cbc1ae;
    border: 4px solid #3a3832;
    box-shadow: 12px 12px 0 #3a3832;
    max-width: 860px;
    width: 90vw;
    max-height: 90vh;
    overflow-y: auto;
    clip-path: polygon(0% 1%, 1.5% 0%, 4% 0.8%, 8% 0%, 14% 0.6%, 20% 0%, 28% 0.8%, 36% 0%, 44% 0.6%, 52% 0%, 60% 0.8%, 68% 0%, 76% 0.6%, 84% 0%, 90% 0.8%, 96% 0%, 98.5% 0.6%, 100% 0%, 100% 99%, 98.5% 100%, 96% 99.2%, 90% 100%, 84% 99.4%, 76% 100%, 68% 99.2%, 60% 100%, 52% 99.4%, 44% 100%, 36% 99.2%, 28% 100%, 20% 99.4%, 14% 100%, 8% 99.2%, 4% 100%, 1.5% 99.4%, 0% 100%);
    animation: modalSlide 250ms ease;
  }

  @keyframes modalSlide {
    from { transform: translateY(30px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .shop-modal-close {
    position: absolute;
    top: 12px;
    right: 16px;
    background: none;
    border: none;
    font-size: 32px;
    color: #4b4840;
    cursor: pointer;
    z-index: 2;
    line-height: 1;
    padding: 4px 8px;
  }

  .shop-modal-close:hover { color: #c48382; }

  .shop-modal-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
  }

  .shop-modal-img {
    padding: 28px;
    background: #f0ebe5;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .shop-modal-img img {
    width: 100%;
    max-height: 420px;
    object-fit: contain;
  }

  .shop-modal-details {
    padding: 36px 32px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .shop-modal-name {
    margin: 0;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: clamp(24px, 3vw, 36px);
    color: #4b4840;
    line-height: 1.2;
  }

  .shop-modal-desc {
    margin: 0;
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 16px;
    color: #1a1a1a;
    line-height: 1.5;
  }

  .shop-modal-price-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .shop-modal-price {
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 28px;
    color: #c48382;
  }

  .shop-modal-stock {
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 14px;
    padding: 3px 10px;
    border-radius: 4px;
    background: rgba(0,0,0,0.1);
    color: #4b4840;
  }

  .shop-modal-stock.low { color: #c48382; font-weight: 700; }
  .shop-modal-stock.unlimited { color: #809fb7; }

  .shop-modal-ship {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 14px;
    color: #6c6659;
  }

  .ship-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .shop-modal-qty {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .shop-modal-qty-label {
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 16px;
    color: #4b4840;
  }

  .shop-modal-qty-controls {
    display: flex;
    align-items: center;
    gap: 0;
    border: 3px solid #3a3832;
  }

  .qty-btn {
    width: 40px;
    height: 40px;
    background: #8a7f6f;
    border: none;
    color: #e6f4fe;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 22px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 120ms ease;
  }

  .qty-btn:hover:not(:disabled) { background: #6c6659; }
  .qty-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .qty-btn:active:not(:disabled) {
    transform: scale(0.92);
  }

  .qty-value {
    width: 48px;
    text-align: center;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 20px;
    color: #4b4840;
    background: #e6e0d4;
    height: 40px;
    line-height: 40px;
    border-left: 2px solid #3a3832;
    border-right: 2px solid #3a3832;
  }

  .shop-modal-total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 16px;
    color: #4b4840;
    padding-top: 8px;
    border-top: 2px dashed rgba(0,0,0,0.15);
  }

  .shop-modal-total-value {
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 24px;
    color: #c48382;
  }

  .shop-modal-buy {
    width: 100%;
    padding: 16px;
    background: #809fb7;
    border: 3px solid #3a3832;
    box-shadow: 4px 4px 0 #3a3832;
    color: #1a1a1a;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 22px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
    clip-path: polygon(0% 2%, 2% 0%, 6% 2%, 12% 0%, 20% 1.5%, 30% 0%, 40% 2%, 50% 0%, 60% 1.5%, 70% 0%, 80% 2%, 88% 0%, 94% 1.5%, 98% 0%, 100% 2%, 100% 98%, 98% 100%, 94% 98.5%, 88% 100%, 80% 98%, 70% 100%, 60% 98.5%, 50% 100%, 40% 98%, 30% 100%, 20% 98.5%, 12% 100%, 6% 98%, 2% 100%, 0% 98%);
  }

  .shop-modal-buy:hover {
    transform: translate(-2px, -2px);
    box-shadow: 6px 6px 0 #3a3832;
    background: #93b4cd;
  }

  .shop-modal-buy:active {
    transform: translate(2px, 2px);
    box-shadow: 1px 1px 0 #3a3832;
  }

  .buy-sparkle {
    font-size: 18px;
    animation: sparkle-pulse 1.5s ease-in-out infinite;
  }

  @keyframes sparkle-pulse {
    0%, 100% { opacity: 0.6; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.2); }
  }

  .shop-modal-cant-afford {
    text-align: center;
    padding: 16px;
    background: rgba(196, 131, 130, 0.1);
    border: 2px solid rgba(196, 131, 130, 0.3);
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 15px;
    color: #4b4840;
  }

  .shop-modal-cant-afford p { margin: 4px 0; }

  .shop-modal-keep-building {
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 18px;
    color: #c48382;
  }

  @media (max-width: 700px) {
    .shop-modal-content {
      grid-template-columns: 1fr;
    }
    .shop-modal-img {
      padding: 16px;
    }
    .shop-modal-img img {
      max-height: 260px;
    }
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
    min-height: 240px;
    gap: 16px;
  }

  .projects-box.has-projects {
    display: grid;
    grid-template-columns: repeat(var(--cols, 1), 1fr);
    align-items: stretch;
    justify-content: start;
    min-height: 0;
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

  /* ── shipping eligibility prompt ────────────────── */
  .shipping-prompt-text {
    font-family: "Courier New", monospace;
    font-size: 15px;
    color: #cbc1ae;
    line-height: 1.6;
    margin-bottom: 20px;
  }

  .shipping-prompt-items {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 24px;
  }

  .shipping-prompt-item {
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: "Courier New", monospace;
    font-size: 15px;
    padding: 10px 14px;
    clip-path: polygon(1% 0%, 99% 2%, 100% 98%, 0% 100%);
  }

  .shipping-prompt-item.missing {
    background: rgba(196, 131, 130, 0.2);
    border: 2px solid #c48382;
    color: #c48382;
  }

  .shipping-prompt-item.done {
    background: rgba(90, 158, 111, 0.15);
    border: 2px solid #5a9e6f;
    color: #5a9e6f;
  }

  .shipping-icon {
    font-size: 18px;
    font-weight: 700;
    min-width: 20px;
    text-align: center;
  }

  .shipping-portal-btn {
    display: block;
    width: 100%;
    padding: 16px;
    font-size: 18px;
    text-align: center;
    text-decoration: none;
    background: #5a9e6f;
    border: 3px solid #488a5a;
    border-bottom: 7px solid #3a7a4a;
    color: #fff;
    font-family: "Courier New", monospace;
    font-weight: 700;
    cursor: pointer;
    clip-path: polygon(0% 3%, 3% 0%, 97% 2%, 100% 5%, 100% 95%, 97% 100%, 3% 98%, 0% 95%);
    transition: background 200ms ease, transform 0.1s ease;
  }

  .shipping-portal-btn:hover {
    background: #4a8e5f;
    transform: translate(-1px, -1px);
  }

  .shipping-prompt-note {
    font-family: "Courier New", monospace;
    font-size: 13px;
    color: #9e9888;
    line-height: 1.5;
    margin-top: 16px;
    text-align: center;
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

  /* ── review success state ───────────────────────── */
  .review-success {
    text-align: center;
  }

  .review-success .section-title {
    margin-bottom: 8px;
  }

  .review-success .review-note {
    text-align: left;
  }

  .review-understood-btn {
    display: block;
    width: 100%;
    padding: 16px;
    font-size: 20px;
    text-align: center;
    background: #5a9e6f;
    border: 3px solid #488a5a;
    border-bottom: 7px solid #3a7a4a;
    color: #fff;
    font-family: "Courier New", monospace;
    font-weight: 700;
    cursor: pointer;
    clip-path: polygon(0% 3%, 3% 0%, 97% 2%, 100% 5%, 100% 95%, 97% 100%, 3% 98%, 0% 95%);
    transition: background 200ms ease, transform 0.1s ease, border-bottom-width 0.1s ease, box-shadow 0.1s ease;
    box-shadow: 4px 4px 0 #3a3832;
  }

  .review-understood-btn:hover {
    background: #4a8e5f;
    transform: translate(-1px, -1px);
    box-shadow: 5px 5px 0 #3a3832;
  }

  .review-understood-btn:active {
    transform: translateY(4px);
    border-bottom-width: 3px;
    box-shadow: 2px 1px 0 #3a3832;
  }

  /* ── project cards ──────────────────────────────── */
  .project-card {
    display: flex;
    gap: 20px;
    min-width: 0;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(230, 244, 254, 0.15);
    padding: 28px 20px 20px;
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
    object-fit: cover;
    flex-shrink: 0;
    border-radius: 4px;
    max-width: 50%;
  }

  .cat-placeholder {
    display: flex;
    flex-direction: column;
    align-self: stretch;
    overflow: hidden;
  }

  .cat-placeholder {
    width: 30%;
  }

  .cat-placeholder .project-thumb {
    width: 100% !important;
    flex: 1 1 0;
    min-height: 0;
    max-width: none;
  }

  .cat-placeholder .cat-caption {
    flex-shrink: 0;
  }

  .project-thumb-cat {
    opacity: 0.7;
  }

  .cat-caption {
    font-size: 0.7rem;
    color: white;
    opacity: 0;
    text-align: center;
    margin-top: 4px;
    font-style: italic;
    transition: opacity 150ms ease;
  }

  .project-card:hover .cat-caption {
    opacity: 0.5;
  }

  /* portrait: mobile apps — side thumbnail */
  .project-card:not(.landscape) .project-thumb {
    width: 30%;
    align-self: stretch;
  }

  /* landscape: web/desktop — 16:9 aspect ratio */
  .project-card.landscape .project-thumb {
    aspect-ratio: 16 / 9;
    width: 50%;
    height: auto;
    align-self: flex-start;
  }

  .project-info {
    flex: 1;
    min-width: 0;
  }

  .project-header-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 12px;
    margin-bottom: 6px;
  }

  .project-name {
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: clamp(22px, 2.2vw, 30px);
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
    font-size: 20px;
    text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
    color: #cbc1ae;
    margin: 0 0 12px;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 3;
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
    align-self: center;
    width: fit-content;
    margin-top: 12px;
    flex-shrink: 0;
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

  .explore-grid-live {
    opacity: 1;
  }

  .explore-card {
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(230, 244, 254, 0.12);
    border-radius: 4px;
    overflow: hidden;
    clip-path: polygon(
      0% 3%, 1.5% 0%, 4% 2%, 96% 1%, 100% 4%,
      100% 97%, 98% 100%, 2% 98%, 0% 100%, 0% 3%
    );
    transition: background 150ms ease;
    cursor: pointer;
    padding: 0;
    text-align: left;
    font: inherit;
    color: inherit;
    width: 100%;
  }

  .explore-card:hover {
    background: rgba(0, 0, 0, 0.35);
  }

  .explore-img-wrap {
    position: relative;
    overflow: hidden;
  }

  .explore-img {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    display: block;
  }

  .explore-arrow {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(0, 0, 0, 0.5);
    border: none;
    color: #e6f4fe;
    font-size: 22px;
    width: 28px;
    height: 36px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 150ms;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .explore-img-wrap:hover .explore-arrow {
    opacity: 1;
  }

  .explore-arrow:hover {
    background: rgba(0, 0, 0, 0.7);
  }

  .explore-arrow-left {
    left: 0;
    border-radius: 0 4px 4px 0;
  }

  .explore-arrow-right {
    right: 0;
    border-radius: 4px 0 0 4px;
  }

  .explore-dots {
    position: absolute;
    bottom: 6px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 6px;
  }

  .explore-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: rgba(230, 244, 254, 0.3);
    transition: background 150ms;
  }

  .explore-dot-active {
    background: #e6f4fe;
  }

  .explore-card-body {
    padding: 14px 16px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .explore-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .explore-card-name {
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 22px;
    color: #e6f4fe;
    text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
    margin: 0;
  }

  .explore-card-type {
    font-family: "Courier New", monospace;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #3a3832;
    background: #cbc1ae;
    padding: 3px 8px;
    clip-path: polygon(4% 0%, 96% 4%, 100% 96%, 0% 100%);
  }

  .explore-card-desc {
    font-family: "Courier New", monospace;
    font-size: 13px;
    color: rgba(230, 244, 254, 0.7);
    line-height: 1.4;
    margin: 0;
  }

  .explore-card-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: "Courier New", monospace;
    font-size: 12px;
    color: rgba(230, 244, 254, 0.45);
  }

  .explore-card-hours {
    font-weight: 700;
    color: #93b4cd;
  }

  .explore-card-links {
    display: flex;
    gap: 10px;
    margin-top: 4px;
  }

  .explore-link {
    font-family: "Courier New", monospace;
    font-size: 13px;
    font-weight: 700;
    color: #93b4cd;
    text-decoration: none;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .explore-link:hover {
    color: #e6f4fe;
  }

  /* ── project detail overlay ──────────────────────── */
  .detail-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .detail-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
  }

  .detail-panel {
    position: relative;
    background: #3a3832;
    border: 2px solid rgba(230, 244, 254, 0.15);
    max-width: 820px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    clip-path: polygon(
      0% 2%, 1% 0%, 3% 1.5%, 97% 0.5%, 99% 0%, 100% 2%,
      100% 98%, 99% 100%, 97% 98.5%, 3% 99.5%, 1% 100%, 0% 98%
    );
    padding: 0;
  }

  .detail-close {
    position: absolute;
    top: 16px;
    right: 20px;
    z-index: 10;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(230, 244, 254, 0.2);
    color: #e6f4fe;
    font-size: 28px;
    width: 40px;
    height: 40px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    clip-path: polygon(8% 0%, 92% 4%, 100% 92%, 4% 100%);
    transition: background 150ms;
  }

  .detail-close:hover {
    background: rgba(196, 131, 130, 0.4);
  }

  /* Gallery */
  .detail-gallery {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: rgba(0, 0, 0, 0.3);
  }

  .detail-img-wrap {
    position: relative;
    width: 100%;
    max-height: 460px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .detail-img {
    width: 100%;
    height: 100%;
    max-height: 460px;
    object-fit: contain;
    display: block;
  }

  .detail-no-img {
    height: 200px;
    color: rgba(230, 244, 254, 0.3);
    font-family: "Courier New", monospace;
    font-size: 14px;
  }

  .detail-arrow {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(0, 0, 0, 0.5);
    color: #e6f4fe;
    border: none;
    font-size: 32px;
    line-height: 1;
    padding: 8px 12px;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.15s;
    z-index: 2;
  }
  .detail-arrow:hover { background: rgba(0, 0, 0, 0.75); }
  .detail-arrow-left { left: 8px; }
  .detail-arrow-right { right: 8px; }

  .detail-img-dots {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 8px;
  }
  .detail-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.35);
  }
  .detail-dot-active {
    background: #e6f4fe;
  }

  /* Info */
  .detail-info {
    padding: 24px 32px 20px;
  }

  .detail-header {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .detail-name {
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 32px;
    color: #e6f4fe;
    text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
    margin: 0;
  }

  .detail-type {
    font-family: "Courier New", monospace;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #3a3832;
    background: #cbc1ae;
    padding: 4px 10px;
    clip-path: polygon(4% 0%, 96% 4%, 100% 96%, 0% 100%);
  }

  .detail-builder {
    font-family: "Courier New", monospace;
    font-size: 14px;
    color: rgba(230, 244, 254, 0.5);
    margin: 6px 0 0;
  }

  .detail-hours {
    font-family: "Courier New", monospace;
    font-size: 15px;
    font-weight: 700;
    color: #93b4cd;
    margin: 4px 0 0;
  }

  .detail-desc {
    font-family: "Courier New", monospace;
    font-size: 14px;
    color: rgba(230, 244, 254, 0.75);
    line-height: 1.6;
    margin: 16px 0 0;
  }

  /* Chunky action buttons */
  .detail-actions {
    display: flex;
    gap: 16px;
    margin-top: 24px;
    flex-wrap: wrap;
  }

  .detail-btn {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 18px;
    font-weight: 700;
    text-decoration: none;
    padding: 16px 32px;
    border: 2px solid;
    cursor: pointer;
    transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
    clip-path: polygon(
      0% 6%, 2% 0%, 5% 4%, 95% 1%, 98% 0%, 100% 5%,
      100% 94%, 98% 100%, 95% 96%, 5% 99%, 2% 100%, 0% 95%
    );
  }

  .detail-btn:hover {
    transform: translateY(-2px) scale(1.02);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
  }

  .detail-btn:active {
    transform: translateY(1px) scale(0.98);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  }

  .detail-btn-demo {
    background: #93b4cd;
    border-color: #809fb7;
    color: #1a1a1a;
  }

  .detail-btn-demo:hover {
    background: #a8c6db;
  }

  .detail-btn-code {
    background: rgba(230, 244, 254, 0.08);
    border-color: rgba(230, 244, 254, 0.2);
    color: #e6f4fe;
  }

  .detail-btn-code:hover {
    background: rgba(230, 244, 254, 0.15);
  }

  /* Comments */
  .detail-comments {
    padding: 20px 32px 32px;
    border-top: 1px solid rgba(230, 244, 254, 0.08);
  }

  .detail-comments-title {
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 22px;
    color: #e6f4fe;
    text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
    margin: 0 0 16px;
  }

  .detail-comment-form {
    margin-bottom: 20px;
  }

  .detail-comment-input {
    width: 100%;
    box-sizing: border-box;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(230, 244, 254, 0.15);
    color: #e6f4fe;
    font-family: "Courier New", monospace;
    font-size: 13px;
    padding: 12px 14px;
    resize: vertical;
    min-height: 60px;
    clip-path: polygon(
      0% 4%, 1% 0%, 99% 2%, 100% 0%, 100% 96%, 99% 100%, 1% 98%, 0% 100%
    );
  }

  .detail-comment-input::placeholder {
    color: rgba(230, 244, 254, 0.3);
  }

  .detail-comment-input:focus {
    outline: none;
    border-color: #93b4cd;
  }

  .detail-comment-form-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 8px;
  }

  .detail-comment-charcount {
    font-family: "Courier New", monospace;
    font-size: 11px;
    color: rgba(230, 244, 254, 0.3);
  }

  .detail-comment-submit {
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 15px;
    font-weight: 700;
    background: #93b4cd;
    color: #1a1a1a;
    border: none;
    padding: 10px 24px;
    cursor: pointer;
    clip-path: polygon(3% 0%, 97% 4%, 100% 96%, 0% 100%);
    transition: background 120ms, transform 120ms;
  }

  .detail-comment-submit:hover:not(:disabled) {
    background: #a8c6db;
    transform: translateY(-1px);
  }

  .detail-comment-submit:active:not(:disabled) {
    transform: translateY(1px);
  }

  .detail-comment-submit:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .detail-comments-loading,
  .detail-comments-empty {
    font-family: "Courier New", monospace;
    font-size: 13px;
    color: rgba(230, 244, 254, 0.35);
    margin: 0;
  }

  .detail-comments-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .detail-comment {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(230, 244, 254, 0.06);
    padding: 12px 16px;
    clip-path: polygon(
      0% 3%, 1% 0%, 99% 2%, 100% 0%, 100% 97%, 99% 100%, 1% 98%, 0% 100%
    );
  }

  .detail-comment-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 6px;
  }

  .detail-comment-author {
    font-family: "Courier New", monospace;
    font-size: 13px;
    font-weight: 700;
    color: #cbc1ae;
  }

  .detail-comment-date {
    font-family: "Courier New", monospace;
    font-size: 11px;
    color: rgba(230, 244, 254, 0.3);
  }

  .detail-comment-delete {
    margin-left: auto;
    background: none;
    border: none;
    color: #c48382;
    font-size: 18px;
    cursor: pointer;
    padding: 0 4px;
    opacity: 0.5;
    transition: opacity 120ms;
  }

  .detail-comment-delete:hover {
    opacity: 1;
  }

  .detail-comment-body {
    font-family: "Courier New", monospace;
    font-size: 13px;
    color: rgba(230, 244, 254, 0.7);
    line-height: 1.5;
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
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

  /* ── faq ─────────────────────────────────────────── */
  .section-faq {
    background: #4b4840;
    padding: 0;
    overflow-y: auto;
  }

  .faq-page {
    background: #4b4840;
    min-height: 100%;
    padding: 2rem 1.5rem;
    position: relative;
    overflow-x: clip;
  }

  .faq-page::after {
    content: '';
    position: absolute;
    inset: 0;
    background: url('/images/tile.webp') repeat;
    opacity: 0.06;
    mix-blend-mode: overlay;
    pointer-events: none;
  }

  .faq-page > * {
    position: relative;
    z-index: 1;
  }

  .faq-title {
    font-family: "Stone Breaker", "Courier New", monospace;
    color: #cbc1ae;
    font-size: 3rem;
    text-align: center;
    margin: 0 0 1rem;
  }

  .faq-intro {
    font-family: "Courier New", monospace;
    color: #cbc1ae;
    text-align: center;
    max-width: 600px;
    margin: 0 auto 2.5rem;
    font-size: 1.05rem;
    line-height: 1.6;
    opacity: 0.85;
  }

  .faq-list {
    max-width: 720px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .faq-item {
    background: #3a3530;
    border: 2px solid #2e2a26;
    border-radius: 8px;
    padding: 0;
    cursor: pointer;
    text-align: left;
    width: 100%;
    font-family: inherit;
    color: inherit;
    transition: background 0.2s, box-shadow 0.2s;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3), 0 8px 20px rgba(0, 0, 0, 0.25);
  }

  .faq-item:hover {
    background: #4b4840;
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.35), 0 12px 28px rgba(0, 0, 0, 0.3);
  }

  .faq-item.open {
    background: #3a3530;
    border-color: #cbc1ae;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.4), 0 16px 36px rgba(0, 0, 0, 0.3);
  }

  .faq-question {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.25rem;
    font-family: "Sunny Mood", "Courier New", monospace;
    font-size: 1.2rem;
    color: #e6e2da;
    gap: 1rem;
  }

  .faq-icon {
    font-family: "Courier New", monospace;
    font-size: 1.5rem;
    color: #e6e2da;
    flex-shrink: 0;
    transition: transform 0.25s ease;
    line-height: 1;
  }

  .faq-icon.rotated {
    transform: rotate(45deg);
  }

  .faq-answer {
    padding: 0 1.25rem 1rem;
  }

  .faq-answer p {
    font-family: "Courier New", monospace;
    color: #e6e2da;
    font-size: 0.9rem;
    line-height: 1.7;
    margin: 0;
  }

  .side-gear {
    position: absolute;
    z-index: 3;
    pointer-events: none;
    width: 200px;
    height: 200px;
    transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .side-gear-l1 { left: -115px; top: 10%; }
  .side-gear-l2 { left: -130px; top: 40%; width: 240px; height: 240px; }
  .side-gear-l3 { left: -115px; top: 72%; }
  .side-gear-r1 { right: -115px; top: 20%; }
  .side-gear-r2 { right: -130px; top: 53%; width: 240px; height: 240px; }

  /* ── settings ────────────────────────────────────── */
  .section-settings {
    background: #4b4840;
    overflow-y: auto;
  }

  .account-card {
    max-width: 480px;
    margin-top: 48px;
    padding: 24px 28px;
    background: rgba(0, 0, 0, 0.25);
    clip-path: polygon(0% 2%, 3% 0%, 97% 1%, 100% 3%, 99% 97%, 96% 100%, 4% 99%, 0% 96%);
  }

  .account-card-heading {
    margin: 0 0 20px;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 26px;
    color: #e6f4fe;
    letter-spacing: 0.04em;
    text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
  }

  .account-fields {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .account-field {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 16px;
  }

  .account-label {
    font-family: "Courier New", monospace;
    font-size: 15px;
    color: #93b4cd;
    text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.3);
    flex-shrink: 0;
  }

  .account-value {
    font-family: "Courier New", monospace;
    font-size: 15px;
    color: #cbc1ae;
    text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.3);
    text-align: right;
    word-break: break-all;
  }

  .nickname-form {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .nickname-input {
    font-family: "Courier New", monospace;
    font-size: 15px;
    color: #cbc1ae;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(203, 193, 174, 0.3);
    padding: 4px 8px;
    text-align: right;
    width: 160px;
  }

  .nickname-input:focus {
    outline: none;
    border-color: #93b4cd;
  }

  .nickname-save {
    font-family: "Courier New", monospace;
    font-size: 13px;
    color: #e6f4fe;
    background: rgba(147, 180, 205, 0.25);
    border: 1px solid #93b4cd;
    padding: 4px 10px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .nickname-save:hover {
    background: rgba(147, 180, 205, 0.4);
  }

  .nickname-save:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .pref-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
  }

  .pref-toggle input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: #93b4cd;
    cursor: pointer;
  }

  .pref-label-text {
    font-family: "Courier New", monospace;
    font-size: 15px;
    color: #cbc1ae;
    text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.3);
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

  /* ── Me page columns ─────────────────────────────── */
  .me-columns {
    display: flex;
    gap: 48px;
    align-items: flex-start;
  }

  .me-left {
    flex: 1;
    min-width: 0;
  }

  .me-right {
    flex: 1;
    min-width: 0;
  }

  .fulfillment-card {
    max-width: none;
    position: sticky;
    top: 24px;
  }

  .fulfillment-empty {
    font-family: "Courier New", monospace;
    font-size: 15px;
    color: #7f796d;
    margin: 0;
  }

  .fulfillment-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 600px;
    overflow-y: auto;
  }

  .fulfillment-item {
    padding: 12px 14px;
    background: rgba(0, 0, 0, 0.15);
    clip-path: polygon(0% 3%, 2% 0%, 98% 1%, 100% 4%, 99% 96%, 97% 100%, 3% 99%, 0% 95%);
  }

  .fulfillment-unread {
    border-left: 3px solid #93b4cd;
  }

  .fulfillment-item-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 6px;
  }

  .fulfillment-item-name {
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 18px;
    color: #e6f4fe;
    letter-spacing: 0.03em;
    text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.3);
  }

  .fulfillment-item-date {
    font-family: "Courier New", monospace;
    font-size: 12px;
    color: #7f796d;
  }

  .fulfillment-item-msg {
    margin: 0;
    font-family: "Courier New", monospace;
    font-size: 14px;
    color: #cbc1ae;
    line-height: 1.4;
    text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.3);
  }

  /* ── Nav notification dot ────────────────────────── */
  .nav-btn {
    position: relative;
  }

  .nav-notif {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 10px;
    height: 10px;
    background: #c48382;
    border-radius: 50%;
    box-shadow: 0 0 6px rgba(196, 131, 130, 0.6);
    pointer-events: none;
  }

  /* ── Shop purchase feedback ──────────────────────── */
  .shop-modal-error {
    margin: 8px 0 0;
    font-family: "Courier New", monospace;
    font-size: 14px;
    color: #c48382;
    text-align: center;
  }

  .shop-modal-success {
    padding: 14px;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 22px;
    color: #93b4cd;
    text-align: center;
    text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
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
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 18px;
    color: #cbc1ae;
    line-height: 1.5;
    margin: 0;
  }

  .mobile-warning-text strong {
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 20px;
    color: #e6f4fe;
  }

  .mobile-warning-dismiss {
    margin-top: 24px;
    padding: 10px 28px;
    font-family: "Stone Breaker", "Courier New", monospace;
    font-size: 16px;
    color: #e6f4fe;
    background: rgba(230, 244, 254, 0.1);
    border: 1px solid rgba(230, 244, 254, 0.25);
    border-radius: 6px;
    cursor: pointer;
  }

  @media (max-width: 600px) {
    .mobile-warning {
      display: flex;
    }

    .mobile-warning-active .sidebar,
    .mobile-warning-active .main {
      display: none;
    }
  }

  /* ── responsive ─────────────────────────────────── */
  @media (min-width: 1200px) {
    .form-gear {
      display: block;
    }
    .create-project-form {
      padding-right: 200px;
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

    .side-gear {
      display: none;
    }

    .faq-title {
      font-size: 2rem;
    }

    .faq-intro {
      font-size: 0.95rem;
    }

    .faq-page {
      padding: 2.5rem 1rem;
    }

    .faq-question {
      font-size: 1rem;
      padding: 0.85rem 1rem;
    }

    .faq-answer {
      padding: 0 1rem 0.85rem;
    }

    .faq-item {
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25), 0 4px 10px rgba(0, 0, 0, 0.2);
    }

    .shop-container {
      padding: 16px;
    }

    .shop-grid {
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 14px;
    }

    .shop-warning-banner {
      margin: 20px -80px 20px;
      padding: 8px 0;
    }

    .explore-grid {
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: 12px;
    }

    .detail-overlay {
      padding: 0;
    }

    .detail-panel {
      max-height: 100vh;
      clip-path: none;
      border: none;
    }

    .detail-info {
      padding: 20px 16px 16px;
    }

    .detail-comments {
      padding: 16px 16px 24px;
    }

    .detail-name {
      font-size: 24px;
    }

    .detail-btn {
      padding: 14px 22px;
      font-size: 15px;
      width: 100%;
      justify-content: center;
    }

    .detail-actions {
      flex-direction: column;
    }

  }


</style>
