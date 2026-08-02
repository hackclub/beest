<script lang="ts">
	import DauChart from './DauChart.svelte';
	import SignupsChart from './SignupsChart.svelte';
	import UserFunnel from './UserFunnel.svelte';
	import ProjectHourBreakdown from '$lib/components/ProjectHourBreakdown.svelte';
	import TimelapsePanel from '$lib/components/admin/TimelapsePanel.svelte';
	import CardGrantModal from '$lib/components/admin/CardGrantModal.svelte';
	import ItemBuyersModal from '$lib/components/admin/ItemBuyersModal.svelte';
	import SiloGrantModal from '$lib/components/admin/SiloGrantModal.svelte';
	import { onMount, tick } from 'svelte';
	import { replaceState } from '$app/navigation';

	let { data } = $props();
	interface UserSummary {
		id: string;
		hcaSub: string;
		name: string | null;
		nickname: string | null;
		slackId: string | null;
		email: string;
		hackatimeConnected: boolean;
		perms: string | null;
		createdAt: string;
	}

	interface UserDetail extends UserSummary {
		twoEmails: boolean;
		updatedAt: string;
		perms: string | null;
		pipes: number;
		activeSessions: number;
		projects: { id: string; name: string; status: string; projectType: string; createdAt: string }[];
		orders: { id: string; itemName: string; quantity: number; pipesSpent: number; status: string; createdAt: string }[];
		auditLogs: { id: string; action: string; label: string; createdAt: string }[];
	}

	interface NewsItem {
		id: string;
		text: string;
		displayDate: string;
	}

	interface MyClaimItem {
		id: string;
		name: string;
		status: string;
		projectType: string;
		claimedAt: string;
		expiresAt: string;
	}

	let myClaims: MyClaimItem[] = $state([]);
	let myClaimsLoading = $state(false);

	// Display labels for a user's stated intent (why they're here).
	const INTENT_LABELS: Record<string, string> = {
		Hackathon: 'Hackathon',
		Shop: 'Shop',
		Browsing: 'Browsing',
		Both: 'Hackathon + Shop',
	};


	// Fulfiller is reviewer-tier for the tab layout (Projects + Leaderboard, none
	// of the Super-Admin-only tabs), but additionally gets the Fulfillment tab via
	// canFulfill below. It has no audit access.
	const isReviewer = $derived(
		data.role === 'Reviewer' || data.role === 'Fraud Reviewer' || data.role === 'Fulfiller'
	);
	const isSuperAdmin = $derived(data.role === 'Super Admin');
	const canBan = $derived(data.role === 'Super Admin' || data.role === 'Fraud Reviewer');
	const canFulfill = $derived(data.role === 'Super Admin' || data.role === 'Fulfiller');
	let justificationEl = $state<HTMLTextAreaElement | null>(null);
	let userFeedbackEl = $state<HTMLTextAreaElement | null>(null);
	let persistentUserNoteEl = $state<HTMLTextAreaElement | null>(null);
	let internalNoteEl = $state<HTMLTextAreaElement | null>(null);
	let activeTab = $state('users');
	let users: UserSummary[] = $state([]);
	let loading = $state(true);
	let userSearch = $state('');
	let permsFilter = $state('');
	let selectedUser: UserSummary | null = $state(null);
	let userDetail = $state<UserDetail | null>(null);
	let detailLoading = $state(false);
	let showPermsDropdown = $state(false);
	let actionLoading = $state('');
	let lightMode = $state(false);
	let showHackatimeFiles = $state(false);
	let showLookoutVideos = $state(false);
	// News state
	let newsItems: NewsItem[] = $state([]);
	let newsLoading = $state(false);
	let editingNews: NewsItem | null = $state(null);
	let newNewsText = $state('');
	let newNewsDate = $state('');
	let newsSaving = $state(false);

	// Events state
	interface AdminEvent {
		id: string;
		title: string;
		description: string | null;
		hostedBy: string | null;
		hostedByName: string | null;
		hostedBySlackId: string | null;
		startAt: string;
		endAt: string | null;
		url: string | null;
	}
	let eventItems: AdminEvent[] = $state([]);
	let eventsLoading = $state(false);
	let editingEvent: AdminEvent | null = $state(null);
	let newEventTitle = $state('');
	let newEventDescription = $state('');
	let newEventHostedBy = $state('');
	let newEventStartAt = $state('');
	let newEventEndAt = $state('');
	let newEventUrl = $state('');
	let eventSaving = $state(false);

	function toEventApiDate(value: string) {
		if (!value) return null;
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date.toISOString();
	}

	function isTypingTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		const tag = target.tagName.toLowerCase();
		return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
	}

	function focusAndSelect(el: HTMLTextAreaElement | HTMLInputElement | null) {
		if (!el) return;
		el.focus();
		el.select();
	}

	function toDateTimeLocalValue(value: string | null) {
		if (!value) return '';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
		return offsetDate.toISOString().slice(0, 16);
	}

	function shortenHackatimePath(path: string): string {
		if (!path) return path;

		const normalized = path.replace(/\\/g, '/');
		const parts = normalized.split('/').filter(Boolean);
		const projectFolderNames = ['beest', 'frontend', 'backend'];

		const rootIndex = parts.findIndex((part) =>
			projectFolderNames.includes(part.toLowerCase()),
		);

		if (rootIndex >= 0) {
			return parts.slice(rootIndex).join('/');
		}

		if (parts.length <= 4) {
			return parts.join('/');
		}

		return parts.slice(-4).join('/');
	}

	// Projects state
	interface ProjectSummary {
		id: string;
		name: string;
		description: string;
		projectType: string;
		status: string;
		codeUrl: string | null;
		demoUrl: string | null;
		readmeUrl: string | null;
		screenshot1Url: string | null;
		screenshot2Url: string | null;
		hackatimeProjectName: string[];
		isUpdate: boolean;
		isGolden: boolean;
		otherHcProgram: string | null;
		aiUse: string | null;
		createdAt: string;
		updatedAt: string;
		user: { id: string; name: string | null; slackId: string | null; reviewerUserNote: string | null; watchlisted: boolean; coolBuilder: boolean; intent: string | null; hasGoldenProject: boolean };
		latestSubmission: { id: string; changeDescription: string | null; minHoursConfirmed: boolean; reviewerNote: string | null; status: string; createdAt: string } | null;
		claimedByReviewerId: string | null;
		claimedByReviewerName: string | null;
		claimedAt: string | null;
		joeProfileUrl: string | null;
		joeHackatimeUrl: string | null;
	}

	interface StatusCounts {
		unshipped: number;
		unreviewed: number;
		changes_needed: number;
		approved: number;
		rejected: number;
	}

	let allProjects: ProjectSummary[] = $state([]);
	let statusCounts: StatusCounts = $state({ unshipped: 0, unreviewed: 0, changes_needed: 0, approved: 0, rejected: 0 });
	let projectsLoading = $state(false);
	let projectStatusFilter = $state(data.role === 'Super Admin' ? '' : 'unreviewed');
	let projectTypeFilter = $state('');
	let projectSearch = $state('');
	// Queue ordering: 'wait' = longest in the wait queue first (oldest), 'newest' =
	// most recently created first, 'hours' = largest Hackatime hours first.
	// projectHours is a projectId→hours map fetched from the backend (unreviewed
	// set) so we can sort by hours without per-project fetches.
	let projectSort = $state<'wait' | 'newest' | 'hours'>('wait');
	let projectHours = $state<Record<string, number>>({});
	// Filter the queue to a single user intent (why the builder is here).
	let projectIntentFilter = $state('');
	// Slide-over panel listing the current reviewer's claimed projects.
	let claimsDrawerOpen = $state(false);
	// Deep-linked project id (?project=…) to open once the list has loaded, so the
	// selection is shareable.
	let pendingDeepLinkProjectId = $state<string | null>(null);

	// Inline "View in audit" embed (super admin only). Reuses the audit service's
	// /panel embed: we mint a single-use ctx server-side and POST it into a named
	// iframe so the id never rides in a URL (mirrors the second-pass panel).
	const auditSvcUrl = $derived(((data.auditSvcUrl as string | undefined) ?? '').replace(/\/+$/, ''));
	const auditSvcOrigin = $derived.by(() => {
		try {
			return new URL(auditSvcUrl).origin;
		} catch {
			return '';
		}
	});
	const AUDIT_FRAME_NAME = 'beest-review-audit-embed';
	let auditFrameEl = $state<HTMLIFrameElement | null>(null);
	let showAuditEmbed = $state(false);
	let auditEmbedProjectId = $state<string | null>(null);
	let auditEmbedError = $state<string | null>(null);
	let auditEmbedHeight = $state(560);

	// Hackatime detail expansion
	interface HackatimeDetail {
		totalHours: number;
		aiHours: number;
		nonAiHours: number;
		earliestHeartbeat: number | null;
		startDate: string | null;
		previousApprovedHours: number;
		previousInternalHours: number;
		trustLevel: string | null;
		linkedBanned: boolean;
		linkedEmail: string | null;
		linkedSlackUid: string | null;
		beestEmail: string | null;
		beestSlackId: string | null;
		emailMismatch: boolean;
		hackatimeProjects: { name: string; hours: number; languages: string[]; firstHeartbeat: number | null }[];
		categories?: { name: string; totalSeconds: number; percent: number }[];
		unifiedDuplicate: boolean;
		unifiedError: boolean;
		fileBreakdown: { file: string; hours: number }[];
	}
	let expandedProjectId = $state<string | null>(null);
	let hackatimeData = $state<HackatimeDetail | null>(null);
	let hackatimeLoading = $state(false);
	let overrideJustification = $state('');
	let lastAutoJustification = $state('');
	let userFeedback = $state('');
	let internalNote = $state('');
	let persistentUserNote = $state('');
	let hideReviewerName = $state(false);
	// "Mark as golden" checkbox — applies on approval; grants the author review
	// -queue priority and black-market shop access.
	let markGolden = $state(false);
	let reviewSubmitting = $state(false);
	let customHours = $state(0);
	let userFacingHours = $state(0);

	type QuickRejectReason = {
		id: string;
		label: string;
		userFeedback: string;
		internalNote?: string;
	};

	const QUICK_REJECT_REASONS: QuickRejectReason[] = [
		{
			id: 'not_enough_work',
			label: 'Not enough work',
			userFeedback:
				'This does not look like enough new work for a ship yet. Please build it out more, then resubmit with a clearer description of what changed.',
			internalNote: 'Quick reject: not enough visible/new work.'
		},
		{
			id: 'broken_or_unusable',
			label: 'Broken / unusable',
			userFeedback:
				'I could not meaningfully test the project because it appears broken, incomplete, or unusable. Please fix the main flow and resubmit.',
			internalNote: 'Quick reject: project could not be meaningfully tested.'
		},
		{
			id: 'missing_demo',
			label: 'No demo / hard to test',
			userFeedback:
				'I could not tell how to run or try the project. Please add a working demo, clearer setup instructions, or screenshots that show the project functioning.',
			internalNote: 'Quick reject: insufficient demo/testability.'
		},
		{
			id: 'low_effort',
			label: 'Low effort',
			userFeedback:
				'This feels too small or low-effort for approval right now. Please add more original functionality, polish, or depth before resubmitting.',
			internalNote: 'Quick reject: low-effort submission.'
		},
		{
			id: 'mostly_template',
			label: 'Template / tutorial',
			userFeedback:
				'This appears to be mostly a template, tutorial, starter project, or lightly modified existing code. Please add substantial original work before resubmitting.',
			internalNote: 'Quick reject: mostly template/tutorial/starter code.'
		},
		{
			id: 'ai_generated',
			label: 'Mostly AI-generated',
			userFeedback:
				'This appears to rely too heavily on AI-generated code or content without enough original work and breaks the 30% AI Rule. Please make meaningful changes yourself and explain what you built.',
			internalNote: 'Quick reject: likely excessive AI-generated work.'
		},
		{
			id: 'duplicate',
			label: 'Duplicate / already shipped',
			userFeedback:
				'This looks too similar to a previous submission or already-approved project. Please only resubmit when there is significant new work to review.',
			internalNote: 'Quick reject: duplicate or insufficiently changed resubmission.'
		},
		{
			id: 'wrong_program',
			label: 'Not eligible',
			userFeedback:
				'This project does not appear to fit the eligible project criteria for Beest. Please check the guidelines and resubmit something that matches the requirements.',
			internalNote: 'Quick reject: eligibility concern.'
		}
	];

	let selectedQuickRejectReason = $state('');
	let lastQuickRejectUserFeedback = $state('');
	let lastQuickRejectInternalNote = $state('');

	// Reviewer must add their own reasoning beyond the auto-generated template
	// (~180 chars) before approving or rejecting. Server enforces the same floor.
	const JUSTIFICATION_MIN = 250;
	let justificationOk = $derived(overrideJustification.trim().length >= JUSTIFICATION_MIN);
	let justificationCharsRemaining = $derived(
		Math.max(0, JUSTIFICATION_MIN - overrideJustification.trim().length),
	);

	let selectedProject = $derived(allProjects.find((p) => p.id === expandedProjectId) ?? null);
	let otherProjectsForUser = $derived(
		selectedProject
			? allProjects
					.filter((p) => p.user.id === selectedProject.user.id && p.id !== selectedProject.id)
					.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
			: [],
	);
	let projScreenIdx = $state(0);

	interface ReviewRecord {
		id: string;
		status: string;
		feedback: string | null;
		internalNote?: string | null;
		overrideJustification: string | null;
		reviewerName: string | null;
		hideReviewerName: boolean;
		createdAt: string;
	}
	let pastReviews = $state<ReviewRecord[]>([]);

	type DevlogRecord = {
		id: string;
		projectId: string | null;
		userId: string;
		userName: string | null;
		title: string;
		text: string;
		imageUrls: string[];
		lookout: {
			status: string;
			trackedSeconds: number | null;
			videoUrl: string | null;
			thumbnailUrl: string | null;
		} | null;
		approved: boolean;
		approvedHours: number | null;
		createdAt: string;
	};
	let projectDevlogs = $state<DevlogRecord[]>([]);
	type LookoutSessionRecord = {
		id: string;
		name: string | null;
		status: string;
		trackedSeconds: number | null;
		videoUrl: string | null;
		thumbnailUrl: string | null;
		createdAt: string | null;
	};
	let projectLookout = $state<{ sessions: LookoutSessionRecord[]; totalTrackedSeconds: number; completeCount: number } | null>(null);
	// Lapse time (complete sessions only) folded into the project's total time.
	let lookoutHours = $derived(
		projectLookout ? Math.round((projectLookout.totalTrackedSeconds / 3600) * 10) / 10 : 0
	);
	let devlogLightbox = $state<string | null>(null);
	function openDevlogLightbox(url: string) { devlogLightbox = url; }
	function closeDevlogLightbox() { devlogLightbox = null; }
	function onDevlogLightboxKey(e: KeyboardEvent) { if (e.key === 'Escape') closeDevlogLightbox(); }

	function fmtLookoutTracked(secs: number | null): string {
		if (!secs || secs <= 0) return '';
		const h = Math.floor(secs / 3600);
		const m = Math.floor((secs % 3600) / 60);
		return h > 0 ? `${h}h ${m}m tracked` : `${m}m tracked`;
	}

	async function loadProjectDevlogs(projectId: string) {
		try {
			const res = await fetch(`/api/admin/projects/${projectId}/devlogs`);
			if (res.ok) projectDevlogs = await res.json();
			else projectDevlogs = [];
		} catch {
			projectDevlogs = [];
		}
	}

	let devlogHoursDraft = $state<Record<string, string>>({});
	let devlogReviewLoading = $state('');

	let devlogApprovedHours = $derived(
  		projectDevlogs.reduce((s, d) => s + (d.approved ? (d.approvedHours ?? 0) : 0), 0)
	);

	async function reviewDevlog(dl: DevlogRecord, approved: boolean){
		const raw = devlogHoursDraft[dl.id] ?? String(dl.approvedHours ?? '');
		const hours = parseFloat(raw);
		devlogReviewLoading = dl.id;
		try{
    		const res = await fetch(`/api/admin/devlogs/${dl.id}/review`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json'},
      			body: JSON.stringify({ approved, approvedHours: Number.isFinite(hours) ? hours : null }),
		});
		if (res.ok){
			const data = await res.json();
			dl.approved = data.approved;
			dl.approvedHours = data.approvedHours;
			if (expandedProjectId){
				const ht = await fetch(`/api/admin/projects/${expandedProjectId}/hackatime`);
       			 if (ht.ok) hackatimeData = await ht.json();
			}
		}
	}	finally{
		devlogReviewLoading = '';
	}
}

	async function loadProjectLookout(projectId: string) {
		try {
			const res = await fetch(`/api/admin/projects/${projectId}/lookout`);
			projectLookout = res.ok ? await res.json() : null;
		} catch {
			projectLookout = null;
		}
	}

	async function reviewProject(status: 'approved' | 'changes_needed' | 'rejected' | 'ban') {
		if (!expandedProjectId || reviewSubmitting) return;
		reviewSubmitting = true;
		try {
			const res = await fetch(`/api/admin/projects/${expandedProjectId}/review`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					status,
					feedback: userFeedback.trim() || null,
					internalNote: internalNote.trim() || null,
					userNote: persistentUserNote.trim() || null,
					hideReviewerName,
					overrideJustification: overrideJustification.trim() || null,
					overrideHours: userFacingHours,
					internalHours: customHours,
					golden: markGolden,
				}),
			});
			if (res.ok) {
				const proj = allProjects.find(p => p.id === expandedProjectId);
				if (proj) {
					proj.status = status;
					proj.user.reviewerUserNote = persistentUserNote.trim() || null;
					// Mirror the backend: golden is decided on approval, revoked
					// when an approval is overturned.
					if (status === 'approved') proj.isGolden = markGolden;
					else if (status === 'changes_needed' || status === 'rejected') proj.isGolden = false;
					const authorHasGolden = allProjects.some(p => p.user.id === proj.user.id && p.isGolden);
					for (const p of allProjects) {
						if (p.user.id === proj.user.id) p.user.hasGoldenProject = authorHasGolden;
					}
				}
				// Reload reviews
				await loadReviews(expandedProjectId);
			}
		} finally {
			reviewSubmitting = false;
		}
	}

	let markerBusy = $state(false);
	let markerError = $state<string | null>(null);
	async function toggleMarker(user: ProjectSummary['user'], kind: 'watchlist' | 'cool') {
		if (markerBusy) return;
		markerBusy = true;
		markerError = null;
		const endpoint = kind === 'watchlist' ? 'watchlist' : 'cool-builder';
		const key = kind === 'watchlist' ? 'watchlisted' : 'coolBuilder';
		const next = kind === 'watchlist' ? !user.watchlisted : !user.coolBuilder;
		try {
			const res = await fetch(`/api/admin/users/${user.id}/${endpoint}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ [key]: next }),
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(j.message || j.error || `HTTP ${res.status}`);
			// Reflect the authoritative (mutually-exclusive) result on every project
			// row owned by this user.
			for (const p of allProjects) {
				if (p.user.id === user.id) {
					p.user.watchlisted = !!j.watchlisted;
					p.user.coolBuilder = !!j.coolBuilder;
				}
			}
			allProjects = allProjects;
		} catch (e) {
			markerError = e instanceof Error ? e.message : String(e);
		} finally {
			markerBusy = false;
		}
	}

	async function loadReviews(projectId: string) {
		try {
			const res = await fetch(`/api/admin/projects/${projectId}/reviews`);
			if (res.ok) pastReviews = await res.json();
			else pastReviews = [];
		} catch {
			pastReviews = [];
		}
	}

	function buildJustification(adjustedHours: number, label: string) {
		if (!hackatimeData) return;
		// Don't clobber reviewer-edited text — only regenerate when the
		// textarea still matches the last auto-generated value (or is empty).
		if (overrideJustification !== '' && overrideJustification !== lastAutoJustification) {
			return;
		}
		const proj = allProjects.find(p => p.id === expandedProjectId);
		const updateNote = proj?.isUpdate ? ' (this is an update to an existing project)' : '';
		const htNames = (hackatimeData.hackatimeProjects ?? []).map(p => p.name).join(', ');
		const htNamesNote = htNames ? `\nHackatime projects: ${htNames}` : '';
		const prevHours = hackatimeData.previousApprovedHours ?? 0;
		// adjustedHours is the DELTA of new hours the reviewer is approving on this
		// ship (cumulative on an initial ship). Project total after this approval
		// is prevHours + adjustedHours.
		const deltaNote = prevHours > 0 ? `\nPreviously approved: ${prevHours}h — this ship's delta: ${adjustedHours}h (project total after: ${Math.round((prevHours + adjustedHours) * 10) / 10}h)` : '';
		const next = `the user tracked ${hackatimeData.totalHours} hours on the project through hackatime (${label} to ${adjustedHours}h of new work)${updateNote}${htNamesNote}${deltaNote}\n\nsigned off by ${data.user.name ?? 'unknown'}`;
		overrideJustification = next;
		lastAutoJustification = next;
	}

	function selectQuickRejectReason(reasonId: string) {
		selectedQuickRejectReason = reasonId;
		const reason = QUICK_REJECT_REASONS.find((r) => r.id === reasonId);
		if (reason) applyQuickReject(reason);
	}

	function adjustHours(factor: number) {
		if (!hackatimeData) return;
		// Reviewer is approving the DELTA (new hours since last approval) on a
		// reship, or the cumulative on an initial ship. The delta-of-Hackatime
		// is what they should be scaling.
		const prev = hackatimeData.previousInternalHours ?? 0;
		const deltaHt = Math.max(0, hackatimeData.totalHours - prev);
		const adjusted = Math.round(deltaHt * factor * 10) / 10;
		customHours = adjusted;
		const label = factor === 0.5 ? 'halved' : factor === 1/3 ? 'reduced to a third' : `reduced to ${Math.round(factor * 100)}%`;
		buildJustification(adjusted, label);
	}

	function replaceQuickRejectText(
		current: string,
		previousPreset: string,
		nextPreset: string,
		allPresets: string[],
	): string {
		const cleanCurrent = current.trim();
		const cleanNext = nextPreset.trim();
		const cleanPrevious = previousPreset.trim();

		if (!cleanCurrent) return cleanNext;
		if (cleanCurrent.includes(cleanNext)) return cleanCurrent;

		const presetToReplace =
			cleanPrevious && cleanCurrent.includes(cleanPrevious)
				? cleanPrevious
				: allPresets.find((preset) => preset.trim() && cleanCurrent.includes(preset.trim()))?.trim();

		if (presetToReplace) {
			return cleanCurrent
				.replace(presetToReplace, cleanNext)
				.replace(/\n{3,}/g, '\n\n')
				.trim();
		}

		return `${cleanNext}\n\n${cleanCurrent}`;
	}

	function applyQuickReject(reason: QuickRejectReason) {
		const userFeedbackPresets = QUICK_REJECT_REASONS.map((r) => r.userFeedback);
		const internalNotePresets = QUICK_REJECT_REASONS.map((r) => r.internalNote).filter((note): note is string => !!note);

		selectedQuickRejectReason = reason.id;
		userFeedback = replaceQuickRejectText(
			userFeedback,
			lastQuickRejectUserFeedback,
			reason.userFeedback,
			userFeedbackPresets,
		);
		if (reason.internalNote) {
			internalNote = replaceQuickRejectText(
				internalNote,
				lastQuickRejectInternalNote,
				reason.internalNote,
				internalNotePresets,
			);
		}
		lastQuickRejectUserFeedback = reason.userFeedback;
		lastQuickRejectInternalNote = reason.internalNote ?? '';
		queueMicrotask(() => userFeedbackEl?.focus());
	}

	function applyCustomHours() {
		if (!hackatimeData) return;
		const rounded = Math.round(customHours * 10) / 10;
		buildJustification(rounded, `adjusted`);
	}

	function buildInitialJustification(proj: ProjectSummary) {
		const updateNote = proj.isUpdate ? ' (this is an update to an existing project)' : '';
		const unifiedNote = !hackatimeData?.unifiedDuplicate && !hackatimeData?.unifiedError && proj.codeUrl
			? `\nAs of ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} this is the first submission of this code URL to unified.`
			: '';
		const htNames = (hackatimeData?.hackatimeProjects ?? []).map(p => p.name).join(', ');
		const htNamesNote = htNames ? `\nHackatime projects: ${htNames}` : '';
		const prevHours = hackatimeData?.previousApprovedHours ?? 0;
		// customHours is the DELTA of new hours the reviewer is approving on this
		// ship (cumulative on an initial ship). Project total after = prev + delta.
		const deltaNote = prevHours > 0 ? `\nPreviously approved: ${prevHours}h — this ship's delta: ${customHours}h (project total after: ${Math.round((prevHours + customHours) * 10) / 10}h)` : '';
		const next = `the user tracked ${hackatimeData?.totalHours ?? 0} hours on the project through hackatime${updateNote}${htNamesNote}${deltaNote}${unifiedNote}\n\nsigned off by ${data.user.name ?? 'unknown'}`;
		overrideJustification = next;
		lastAutoJustification = next;
	}

	async function selectProject(projectId: string) {
		if (expandedProjectId === projectId) {
			expandedProjectId = null;
			hackatimeData = null;
			userFeedback = '';
			internalNote = '';
			persistentUserNote = '';
			selectedQuickRejectReason = '';
			lastQuickRejectUserFeedback = '';
			lastQuickRejectInternalNote = '';
			hideReviewerName = false;
			markGolden = false;
			projectDevlogs = [];
			projectLookout = null;
			closeAuditEmbed();
			syncProjectUrl(null);
			return;
		}
		closeAuditEmbed();
		syncProjectUrl(projectId);
		expandedProjectId = projectId;
		projScreenIdx = 0;
		hackatimeData = null;
		userFeedback = '';
		internalNote = '';
		selectedQuickRejectReason = '';
		lastQuickRejectUserFeedback = '';
		lastQuickRejectInternalNote = '';
		overrideJustification = '';
		lastAutoJustification = '';
		hideReviewerName = false;
		showHackatimeFiles = false;
		pastReviews = [];
		projectDevlogs = [];
		projectLookout = null;

		const proj = allProjects.find(p => p.id === projectId);
		persistentUserNote = proj?.user?.reviewerUserNote ?? '';
		// Preserve an existing golden mark when re-reviewing (unchecking on an
		// approve review revokes it).
		markGolden = !!proj?.isGolden;
		loadReviews(projectId);
		loadProjectDevlogs(projectId);
		loadProjectLookout(projectId);
		if (proj?.status === 'unreviewed' || proj?.status === 'approved') {
			hackatimeLoading = true;
			try {
				const res = await fetch(`/api/admin/projects/${projectId}/hackatime`);
				if (res.ok) {
					hackatimeData = await res.json();
				} else {
					hackatimeData = { totalHours: 0, aiHours: 0, nonAiHours: 0, fileBreakdown: [], earliestHeartbeat: null, startDate: null, previousApprovedHours: 0, previousInternalHours: 0, hackatimeProjects: [], trustLevel: null, linkedBanned: false, linkedEmail: null, linkedSlackUid: null, beestEmail: null, beestSlackId: null, emailMismatch: false, unifiedDuplicate: false, unifiedError: true };
				}
			} catch {
				hackatimeData = { totalHours: 0, aiHours: 0, nonAiHours: 0, fileBreakdown: [], earliestHeartbeat: null, startDate: null, previousApprovedHours: 0, previousInternalHours: 0, hackatimeProjects: [], trustLevel: null, linkedBanned: false, linkedEmail: null, linkedSlackUid: null, beestEmail: null, beestSlackId: null, emailMismatch: false, unifiedDuplicate: false, unifiedError: true };
			} finally {
				hackatimeLoading = false;
				// Default the reviewer's inputs to the DELTA of new Hackatime work
				// since the last approval. For initial ships previousApprovedHours/
				// previousInternalHours are 0, so the delta = total cumulative.
				const totalHt = hackatimeData?.totalHours ?? 0;
				const prevOverride = hackatimeData?.previousApprovedHours ?? 0;
				const prevInternal = hackatimeData?.previousInternalHours ?? 0;
				customHours = Math.max(0, Math.round((totalHt - prevInternal) * 10) / 10);
				userFacingHours = Math.max(0, Math.round((totalHt - prevOverride) * 10) / 10);
				buildInitialJustification(proj);
			}
		}
	}

	function todayDateStr(): string {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	const PERMS_OPTIONS = ['User', 'Helper', 'Reviewer', 'Fraud Reviewer', 'Fulfiller', 'Super Admin', 'Banned'];

	// Roles only a Super Admin may grant or act upon — mirrors the backend guard.
	// Fulfillers can moderate regular builders but can't mint peers/Super Admins
	// or ban/demote someone who already holds one of those roles.
	const ELEVATED_PERMS = ['Fulfiller', 'Super Admin'];
	const assignablePerms = $derived(
		isSuperAdmin ? PERMS_OPTIONS : PERMS_OPTIONS.filter((p) => !ELEVATED_PERMS.includes(p))
	);
	const canActOnTarget = $derived(
		isSuperAdmin || !ELEVATED_PERMS.includes(userDetail?.perms ?? '')
	);

	const PROJECT_TYPES = ['web', 'windows', 'mac', 'linux', 'cross-platform', 'python', 'cad', 'hardware', 'android', 'ios', 'other'];

	let filteredProjects = $derived.by(() => {
		let result = allProjects;
		if (projectStatusFilter) {
			result = result.filter(p => p.status === projectStatusFilter);
		}
		if (projectTypeFilter) {
			result = result.filter(p => p.projectType === projectTypeFilter);
		}
		if (projectIntentFilter) {
			result = result.filter(p => p.user.intent === projectIntentFilter);
		}
		if (projectSearch.trim()) {
			const q = projectSearch.trim().toLowerCase();
			result = result.filter(p =>
				p.name.toLowerCase().includes(q) ||
				(p.user.name?.toLowerCase().includes(q)) ||
				(p.user.slackId?.toLowerCase().includes(q))
			);
		}
		// Copy before sorting so we never mutate allProjects in place.
		const sorted = [...result];
		if (projectSort === 'hours') {
			// Largest hours first; projects with no known hours sink to the bottom.
			sorted.sort((a, b) => (projectHours[b.id] ?? -1) - (projectHours[a.id] ?? -1));
		} else if (projectSort === 'newest') {
			// Most recently created first.
			sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
		} else {
			// Golden-project authors first (they earned queue priority), then
			// oldest submission first within each tier.
			sorted.sort((a, b) => {
				const goldenA = a.user.hasGoldenProject ? 1 : 0;
				const goldenB = b.user.hasGoldenProject ? 1 : 0;
				if (goldenA !== goldenB) return goldenB - goldenA;
				const timeA = a.latestSubmission?.createdAt ? new Date(a.latestSubmission.createdAt).getTime() : new Date(a.createdAt).getTime();
				const timeB = b.latestSubmission?.createdAt ? new Date(b.latestSubmission.createdAt).getTime() : new Date(b.createdAt).getTime();
				return timeA - timeB;
			});
		}
		return sorted;
	});

	function moveProject(delta: number) {
		if (!expandedProjectId || filteredProjects.length === 0) return;

		const currentIndex = filteredProjects.findIndex((p) => p.id === expandedProjectId);
		if (currentIndex === -1) {
			selectProject(filteredProjects[0].id);
			return;
		}

		const next = filteredProjects[currentIndex + delta];
		if (next) selectProject(next.id);
	}

	function openFirstProject() {
		if (!expandedProjectId && filteredProjects[0]) {
			selectProject(filteredProjects[0].id);
		}
	}

	function onReviewShortcut(e: KeyboardEvent) {
		if (isTypingTarget(e.target)) return;
		if (e.metaKey || e.ctrlKey || e.altKey) return;

		const key = e.key.toLowerCase();

		if (key === 'escape' && expandedProjectId) {
			e.preventDefault();
			selectProject(expandedProjectId);
			return;
		}

		if (key === 'j' || e.key === 'ArrowDown') {
			e.preventDefault();
			expandedProjectId ? moveProject(1) : openFirstProject();
			return;
		}

		if (key === 'k' || e.key === 'ArrowUp') {
			e.preventDefault();
			moveProject(-1);
			return;
		}

		if (!expandedProjectId) return;

		if (key === 'o') {
			e.preventDefault();
			focusAndSelect(justificationEl);
			return;
		}

		if (key === 'f') {
			e.preventDefault();
			focusAndSelect(userFeedbackEl);
			return;
		}

		if (key === 'n') {
			e.preventDefault();
			focusAndSelect(persistentUserNoteEl);
			return;
		}

		if (key === 'i') {
			e.preventDefault();
			focusAndSelect(internalNoteEl);
			return;
		}

		if (key === 'a') {
			e.preventDefault();
			if (!reviewSubmitting && justificationOk) reviewProject('approved');
			return;
		}

		if (key === 'r') {
			e.preventDefault();
			if (!reviewSubmitting && userFeedback.trim()) reviewProject('changes_needed');
			return;
		}

		if (key === 'b') {
			e.preventDefault();
			if (!reviewSubmitting && canBan && confirm('Ban this user and reject their project?')) {
				reviewProject('ban');
			}
			return;
		}

		if (key === 'h') {
			e.preventDefault();
			showHackatimeFiles = !showHackatimeFiles;
			return;
		}

		if (key === 'l') {
			e.preventDefault();
			lightMode = !lightMode;
			return;
		}

		if (key === '1') {
			e.preventDefault();
			projScreenIdx = 0;
			return;
		}

		if (key === '2') {
			e.preventDefault();
			projScreenIdx = 1;
		}
	}

	onMount(() => {
		window.addEventListener('keydown', onReviewShortcut);
		return () => window.removeEventListener('keydown', onReviewShortcut);
	});

	// Honour a ?project=… deep link: jump to the Projects tab and remember the id;
	// the effect below opens it once the list has loaded.
	onMount(() => {
		const pid = new URLSearchParams(window.location.search).get('project');
		if (pid) {
			pendingDeepLinkProjectId = pid;
			activeTab = 'projects';
		}
	});

	let deepLinkHandled = false;
	$effect(() => {
		if (deepLinkHandled || activeTab !== 'projects' || projectsLoading) return;
		const target = pendingDeepLinkProjectId;
		if (!target) return;
		if (allProjects.some((p) => p.id === target)) {
			deepLinkHandled = true;
			if (expandedProjectId !== target) selectProject(target);
		} else if (allProjects.length > 0) {
			// List loaded but the id isn't visible to this reviewer — give up quietly.
			deepLinkHandled = true;
		}
	});

	// Resize messages from the audit embed (origin-checked).
	onMount(() => {
		function onMessage(e: MessageEvent) {
			if (!auditSvcOrigin || e.origin !== auditSvcOrigin) return;
			const d = e.data;
			if (!d || d.source !== 'beest-audit') return;
			if (d.type === 'resize' && typeof d.height === 'number') {
				auditEmbedHeight = Math.max(200, Math.min(4000, Math.ceil(d.height)));
			}
		}
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	});

	const totalUsers = $derived(users.length);
	const totalHackatime = $derived(users.filter(u => u.hackatimeConnected).length);

	let unreviewedHours = $state<{
		totalHours: number;
		projectCount: number;
		approvalRate: number;
		decisionCount: number;
		predictedApprovedHours: number;
	} | null>(null);
	let unreviewedHoursLoading = $state(false);

	async function loadUnreviewedHours() {
		unreviewedHoursLoading = true;
		try {
			const res = await fetch('/api/admin/stats/unreviewed-hours');
			if (res.ok) unreviewedHours = await res.json();
		} finally {
			unreviewedHoursLoading = false;
		}
	}

	// One-shot golden backfill for cool builders (Super Admin only).
	let goldenBackfillBusy = $state(false);
	let goldenBackfillResult = $state<{ coolBuilders: number; processed: number; skipped: number; projectsMarked: number; dmsSent: number } | null>(null);
	let goldenBackfillError = $state<string | null>(null);
	async function backfillGoldenForCoolBuilders() {
		if (goldenBackfillBusy) return;
		if (!confirm('Mark all projects of every cool builder as golden and DM them? Builders who already have a golden project are skipped.')) return;
		goldenBackfillBusy = true;
		goldenBackfillError = null;
		goldenBackfillResult = null;
		try {
			const res = await fetch('/api/admin/golden/backfill-cool-builders', { method: 'POST' });
			const j = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(j.message || j.error || `HTTP ${res.status}`);
			goldenBackfillResult = j;
		} catch (e) {
			goldenBackfillError = e instanceof Error ? e.message : String(e);
		} finally {
			goldenBackfillBusy = false;
		}
	}

	// Pausing resubmission stops changes-needed builders from re-shipping into
	// the queue (used to clear a backlog). The changes-needed DM also gets a
	// callout while this is on — see backend reviewChangesNeededDm.
	let resubmissionPaused = $state(false);
	let resubmissionPausedLoading = $state(false);
	let resubmissionToggleBusy = $state(false);
	let resubmissionToggleError = $state<string | null>(null);

	async function loadResubmissionPaused() {
		resubmissionPausedLoading = true;
		try {
			const res = await fetch('/api/admin/settings/resubmission-paused');
			if (res.ok) resubmissionPaused = (await res.json()).paused === true;
		} finally {
			resubmissionPausedLoading = false;
		}
	}

	async function toggleResubmissionPaused() {
		if (resubmissionToggleBusy) return;
		const next = !resubmissionPaused;
		if (!confirm(next
			? 'Pause resubmission? Builders with changes-needed projects will not be able to resubmit until this is turned off.'
			: 'Resume resubmission?')) return;
		resubmissionToggleBusy = true;
		resubmissionToggleError = null;
		try {
			const res = await fetch('/api/admin/settings/resubmission-paused', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ paused: next })
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(j.message || j.error || `HTTP ${res.status}`);
			resubmissionPaused = j.paused === true;
		} catch (e) {
			resubmissionToggleError = e instanceof Error ? e.message : String(e);
		} finally {
			resubmissionToggleBusy = false;
		}
	}

	let filteredUsers = $derived.by(() => {
		let result = users;
		if (permsFilter) {
			result = result.filter(u => u.perms === permsFilter);
		}
		if (userSearch.trim()) {
			const q = userSearch.trim().toLowerCase();
			result = result.filter(u =>
				(u.name?.toLowerCase().includes(q)) ||
				(u.email?.toLowerCase().includes(q)) ||
				(u.slackId?.toLowerCase().includes(q))
			);
		}
		return result;
	});

	// Render the users table one page at a time — 3000 rows in the DOM janks the
	// tab. Pagination runs *after* filtering, so search/perms still match across
	// every loaded user (email is encrypted at rest, so it can't be searched in
	// SQL — the full list has to live client-side for search to work anyway).
	const USERS_PAGE_SIZE = 100;
	let usersPage = $state(1);
	// Any change to the search box or perms filter jumps back to the first page,
	// so a narrowed result set never leaves you stranded on an empty later page.
	$effect(() => {
		userSearch;
		permsFilter;
		usersPage = 1;
	});
	const userPageCount = $derived(Math.max(1, Math.ceil(filteredUsers.length / USERS_PAGE_SIZE)));
	const pagedUsers = $derived.by(() => {
		const start = (usersPage - 1) * USERS_PAGE_SIZE;
		return filteredUsers.slice(start, start + USERS_PAGE_SIZE);
	});

	// The full user list backs three tabs (Users, Stats cards, Events host picker)
	// and every one hits the same `/api/admin/users` — which server-side re-paginates
	// the entire Airtable perms table each call. Load it once and share it: skip the
	// refetch when it's already loaded, and collapse concurrent callers onto one
	// in-flight request. Pass `force` after a mutation to refresh deliberately.
	let usersLoaded = $state(false);
	let usersInflight: Promise<void> | null = null;

	function loadUsers(force = false): Promise<void> {
		if (!force && usersLoaded) return Promise.resolve();
		if (usersInflight) return usersInflight;
		loading = true;
		usersInflight = (async () => {
			try {
				const res = await fetch('/api/admin/users');
				if (res.ok) {
					users = await res.json();
					usersLoaded = true;
				}
			} finally {
				loading = false;
				usersInflight = null;
			}
		})();
		return usersInflight;
	}

	function userDisplayName(user: UserSummary) {
		return user.nickname || user.name || user.email || user.hcaSub;
	}

	function slackUserUrl(slackId: string) {
		return `https://hackclub.enterprise.slack.com/team/${encodeURIComponent(slackId)}`;
	}

	async function selectUser(user: UserSummary) {
		selectedUser = user;
		userDetail = null;
		showPermsDropdown = false;
		detailLoading = true;
		try {
			const res = await fetch(`/api/admin/users/${user.id}`);
			if (res.ok) userDetail = await res.json();
		} finally {
			detailLoading = false;
		}
	}

	// Since the list is now loaded once and reused across tabs, mutations that
	// change a listed field (perms, ban) must patch the in-memory row so the table
	// stays correct without a full refetch. Called after selectUser() refreshes
	// userDetail, so we copy the authoritative perms from there.
	function syncUserInList(userId: string) {
		if (!userDetail || userDetail.id !== userId) return;
		const perms = userDetail.perms;
		users = users.map((u) => (u.id === userId ? { ...u, perms } : u));
	}

	async function impersonateUser() {
		if (!selectedUser || !confirm(`Impersonate ${selectedUser.name ?? selectedUser.hcaSub}? You will browse the site as this user.`)) return;
		actionLoading = 'impersonate';
		try {
			const res = await fetch(`/api/admin/users/${selectedUser.id}/impersonate`, { method: 'POST' });
			if (res.ok) {
				// Full page navigation to pick up the new cookies
				window.location.replace('/home');
				return;
			}
			const err = await res.json().catch(() => ({}));
			alert(`Impersonation failed: ${res.status} ${err.error ?? ''}`);
		} finally {
			actionLoading = '';
		}
	}

	async function banUser() {
		if (!selectedUser || !confirm(`BAN this user? This will:\n- Set their Airtable status to Banned\n- Revoke all sessions\n- Redirect them to the /fraud ban page on any future login`)) return;
		actionLoading = 'ban';
		try {
			const res = await fetch(`/api/admin/users/${selectedUser.id}/ban`, { method: 'POST' });
			if (res.ok) {
				await selectUser(selectedUser);
				syncUserInList(selectedUser.id);
			}
		} finally {
			actionLoading = '';
		}
	}

	let pipesAdjustAmount = $state(0);
	let pipesAdjustReason = $state('');

	async function adjustPipes(sign: 1 | -1) {
		if (!selectedUser) return;
		const amount = Math.floor(Math.abs(pipesAdjustAmount));
		if (!Number.isFinite(amount) || amount <= 0) {
			alert('Enter a positive whole number of pipes.');
			return;
		}
		const delta = sign * amount;
		const verb = sign > 0 ? 'GRANT' : 'REVOKE';
		if (!confirm(`${verb} ${amount} pipes ${sign > 0 ? 'to' : 'from'} ${selectedUser.name ?? selectedUser.hcaSub}?`)) return;
		actionLoading = 'pipes';
		try {
			const res = await fetch(`/api/admin/users/${selectedUser.id}/pipes`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ delta, reason: pipesAdjustReason.trim() || null })
			});
			if (res.ok) {
				pipesAdjustAmount = 0;
				pipesAdjustReason = '';
				await selectUser(selectedUser);
			} else {
				const err = await res.json().catch(() => ({}));
				alert(`Pipes adjustment failed: ${err.message ?? res.statusText}`);
			}
		} finally {
			actionLoading = '';
		}
	}

	async function sendAttendInvite() {
		if (!selectedUser || !confirm(`Send ${selectedUser.name ?? selectedUser.hcaSub} an Attend invite for the in-person event?`)) return;
		actionLoading = 'attend-invite';
		try {
			const res = await fetch(`/api/admin/users/${selectedUser.id}/attend-invite`, { method: 'POST' });
			const data = await res.json().catch(() => ({}));
			if (res.ok && data.success) {
				alert('Attend invite sent.');
			} else {
				alert('Attend invite failed — check the Attend admin panel or try again shortly.');
			}
		} finally {
			actionLoading = '';
		}
	}

	async function updatePerms(perms: string) {
		if (!selectedUser || !confirm(`Change this user's permissions to "${perms}"?`)) return;
		actionLoading = 'perms';
		try {
			const res = await fetch(`/api/admin/users/${selectedUser.id}/perms`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ perms })
			});
			if (res.ok) {
				showPermsDropdown = false;
				await selectUser(selectedUser);
				syncUserInList(selectedUser.id);
			}
		} finally {
			actionLoading = '';
		}
	}

	function closeDetail() {
		selectedUser = null;
		userDetail = null;
		showPermsDropdown = false;
	}

	function formatDate(d: string) {
		return new Date(d).toLocaleDateString('en-US', {
			year: 'numeric', month: 'short', day: 'numeric',
			hour: '2-digit', minute: '2-digit'
		});
	}

	async function loadNews() {
		newsLoading = true;
		try {
			const res = await fetch('/api/admin/news');
			if (res.ok) newsItems = await res.json();
		} finally {
			newsLoading = false;
		}
	}

	async function createNews() {
		if (!newNewsText.trim() || !newNewsDate.trim()) return;
		newsSaving = true;
		try {
			const res = await fetch('/api/admin/news', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: newNewsText, displayDate: newNewsDate })
			});
			if (res.ok) {
				newNewsText = '';
				newNewsDate = '';
				await loadNews();
			}
		} finally {
			newsSaving = false;
		}
	}

	async function saveNewsEdit() {
		if (!editingNews) return;
		newsSaving = true;
		try {
			const res = await fetch(`/api/admin/news/${editingNews.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: editingNews.text, displayDate: editingNews.displayDate })
			});
			if (res.ok) {
				editingNews = null;
				await loadNews();
			}
		} finally {
			newsSaving = false;
		}
	}

	async function deleteNews(id: string) {
		if (!confirm('Delete this news item?')) return;
		newsSaving = true;
		try {
			const res = await fetch(`/api/admin/news/${id}`, { method: 'DELETE' });
			if (res.ok) await loadNews();
		} finally {
			newsSaving = false;
		}
	}

	async function loadEvents() {
		eventsLoading = true;
		try {
			const res = await fetch('/api/admin/events');
			if (res.ok) eventItems = await res.json();
		} finally {
			eventsLoading = false;
		}
	}

	function resetEventForm() {
		editingEvent = null;
		newEventTitle = '';
		newEventDescription = '';
		newEventHostedBy = '';
		newEventStartAt = '';
		newEventEndAt = '';
		newEventUrl = '';
	}

	async function createEvent() {
		const startAt = toEventApiDate(newEventStartAt);
		const endAt = toEventApiDate(newEventEndAt);
		if (!newEventTitle.trim() || !newEventHostedBy.trim() || !startAt) return;
		eventSaving = true;
		try {
			const res = await fetch('/api/admin/events', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: newEventTitle,
					description: newEventDescription,
					hostedBy: newEventHostedBy,
					startAt,
					endAt,
					url: newEventUrl,
				}),
			});
			if (res.ok) {
				resetEventForm();
				await loadEvents();
			}
		} finally {
			eventSaving = false;
		}
	}

	async function saveEventEdit() {
		if (!editingEvent) return;
		const startAt = toEventApiDate(newEventStartAt);
		const endAt = toEventApiDate(newEventEndAt);
		if (!newEventTitle.trim() || !newEventHostedBy.trim() || !startAt) return;
		eventSaving = true;
		try {
			const res = await fetch(`/api/admin/events/${editingEvent.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: newEventTitle,
					description: newEventDescription,
					hostedBy: newEventHostedBy,
					startAt,
					endAt,
					url: newEventUrl,
				}),
			});
			if (res.ok) {
				editingEvent = null;
				await loadEvents();
			}
		} finally {
			eventSaving = false;
		}
	}

	async function deleteEvent(id: string) {
		if (!confirm('Delete this event?')) return;
		eventSaving = true;
		try {
			const res = await fetch(`/api/admin/events/${id}`, { method: 'DELETE' });
			if (res.ok) await loadEvents();
		} finally {
			eventSaving = false;
		}
	}

	function editEvent(eventItem: AdminEvent) {
		editingEvent = { ...eventItem };
		newEventTitle = eventItem.title;
		newEventDescription = eventItem.description ?? '';
		newEventHostedBy = eventItem.hostedBySlackId ?? eventItem.hostedBy ?? '';
		newEventStartAt = toDateTimeLocalValue(eventItem.startAt);
		newEventEndAt = toDateTimeLocalValue(eventItem.endAt);
		newEventUrl = eventItem.url ?? '';
	}

	async function loadProjects() {
		projectsLoading = true;
		try {
			const res = await fetch('/api/admin/projects');
			if (res.ok) {
				const data = await res.json();
				allProjects = data.projects;
				statusCounts = data.statusCounts;
			}
		} finally {
			projectsLoading = false;
		}
		loadMyClaims();
	}

	// Projects the current reviewer has claimed (for the "My Claims" drawer).
	async function loadMyClaims() {
		myClaimsLoading = true;
		try {
			const res = await fetch('/api/admin/projects/my-claims');
			if (res.ok) myClaims = await res.json();
		} finally {
			myClaimsLoading = false;
		}
	}

	// Claim a project so other reviewers know it's being looked at. Returns false
	// (and alerts) when someone else already holds an active claim.
	async function claimProject(projectId: string): Promise<boolean> {
		const res = await fetch(`/api/admin/projects/${projectId}/claim`, { method: 'POST' });
		const body = await res.json().catch(() => ({}));
		if (!body.success) {
			alert(`Already claimed by ${body.claimedBy ?? 'another reviewer'}`);
			return false;
		}
		const idx = allProjects.findIndex((p) => p.id === projectId);
		if (idx !== -1) {
			allProjects[idx] = {
				...allProjects[idx],
				claimedByReviewerId: data.user.uid,
				claimedByReviewerName: body.reviewerName,
				claimedAt: new Date().toISOString(),
			};
		}
		loadMyClaims();
		return true;
	}

	async function releaseProjectClaim(projectId: string) {
		await fetch(`/api/admin/projects/${projectId}/claim`, { method: 'DELETE' });
		const idx = allProjects.findIndex((p) => p.id === projectId);
		if (idx !== -1) {
			allProjects[idx] = {
				...allProjects[idx],
				claimedByReviewerId: null,
				claimedByReviewerName: null,
				claimedAt: null,
			};
		}
		loadMyClaims();
	}

	// Human-readable "in 3h 20m" until a claim expires.
	function formatTimeRemaining(expiresAt: string): string {
		const ms = new Date(expiresAt).getTime() - Date.now();
		if (ms <= 0) return 'expired';
		const h = Math.floor(ms / 3_600_000);
		const m = Math.floor((ms % 3_600_000) / 60_000);
		return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
	}

	// Per-project Hackatime hours (unreviewed set) used by the "Most hours" sort.
	// Cheap + cached server-side; failures just leave the map empty.
	async function loadProjectHours() {
		try {
			const res = await fetch('/api/admin/projects/hours');
			if (res.ok) projectHours = await res.json();
		} catch {
			/* sort just falls back to no-hours ordering */
		}
	}

	// Reflect the open project in the URL (?project=…) so the view is shareable.
	function syncProjectUrl(projectId: string | null) {
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		if (projectId) url.searchParams.set('project', projectId);
		else url.searchParams.delete('project');
		try {
			replaceState(url, {});
		} catch {
			history.replaceState(history.state, '', url);
		}
	}

	function closeAuditEmbed() {
		showAuditEmbed = false;
		auditEmbedProjectId = null;
		auditEmbedError = null;
		auditEmbedHeight = 560;
	}

	// Mint a single-use audit context for the selected project and POST it into a
	// named iframe (ctx in the body, never the URL — same as the second-pass panel).
	async function openAuditEmbed() {
		const pid = expandedProjectId;
		if (!pid || !auditSvcUrl) return;
		auditEmbedError = null;
		auditEmbedProjectId = pid;
		showAuditEmbed = true;
		await tick();
		try {
			const res = await fetch(`/api/admin/audit/${pid}/iframe-context`, { method: 'POST' });
			const j = await res.json().catch(() => ({}));
			if (!res.ok || !j.ctx) throw new Error(j.message || j.error || `HTTP ${res.status}`);
			submitCtxToAuditFrame(j.ctx);
		} catch (e) {
			auditEmbedError = e instanceof Error ? e.message : String(e);
		}
	}

	function submitCtxToAuditFrame(ctx: string) {
		if (!auditFrameEl) return;
		const form = document.createElement('form');
		form.method = 'POST';
		form.action = `${auditSvcUrl}/panel`;
		form.target = AUDIT_FRAME_NAME;
		const field = (name: string, value: string) => {
			const input = document.createElement('input');
			input.type = 'hidden';
			input.name = name;
			input.value = value;
			form.appendChild(input);
		};
		field('ctx', ctx);
		field('light', lightMode ? '1' : '0');
		field('dys', '0');
		document.body.appendChild(form);
		form.submit();
		form.remove();
	}

	// Review leaderboard state
	interface LeaderboardRow {
		reviewerId: string;
		reviewerName: string | null;
		reviewerSlackId: string | null;
		total: number;
		approved: number;
		changesNeeded: number;
		banned: number;
		rejected: number;
		returned: number;
		approvalPercent: number;
	}
	let leaderboardRows: LeaderboardRow[] = $state([]);
	let leaderboardLoading = $state(false);
	let leaderboardWindow = $state<'24h' | '7d' | '30d' | 'all'>('7d');

	$effect(() => {
		void leaderboardWindow;
		if (activeTab === 'leaderboard') loadLeaderboard();
	});

	async function loadLeaderboard() {
		leaderboardLoading = true;
		try {
			const res = await fetch(`/api/admin/review-leaderboard?window=${leaderboardWindow}`);
			if (res.ok) {
				leaderboardRows = await res.json();
			}
		} finally {
			leaderboardLoading = false;
		}
	}

	// Shop state
	interface ShopItemAdmin {
		id: string;
		name: string;
		description: string;
		detailedDescription: string | null;
		imageUrl: string;
		priceHours: number;
		regionalPrices: Record<string, number> | null;
		stock: number | null;
		sortOrder: number;
		isActive: boolean;
		isFeatured: boolean;
		isSuperFeatured: boolean;
		isBlackMarket: boolean;
		isGrant: boolean;
		grantInstructions: string | null;
		estimatedShip: string | null;
	}
	let shopItemsList: ShopItemAdmin[] = $state([]);
	let shopLoading = $state(false);
	let shopSaving = $state(false);
	let editingShop: ShopItemAdmin | null = $state(null);
	let newShopName = $state('');
	let newShopDesc = $state('');
	let newShopDetailedDesc = $state('');
	let newShopImage = $state('');
	let newShopPrice = $state(0);
	let newShopRegional = $state('');
	// Text form of editingShop.regionalPrices, kept separately because the
	// map is edited as a "US:120, IN:80" string and parsed on save.
	let editingShopRegional = $state('');
	let newShopStock = $state('');
	let newShopShip = $state('');
	let newShopActive = $state(true);
	let newShopFeatured = $state(false);
	let newShopSuperFeatured = $state(false);
	let newShopBlackMarket = $state(false);
	let newShopIsGrant = $state(false);
	let newShopGrantInstructions = $state('');
	let dragIdx: number | null = $state(null);
	let dragOverIdx: number | null = $state(null);
	// Shop item whose buyer list is open in the ItemBuyersModal, if any.
	let buyersModalItem = $state<{ id: string; name: string } | null>(null);

	function formatRegionalPrices(rp: Record<string, number> | null): string {
		return Object.entries(rp ?? {}).map(([c, p]) => `${c}:${p}`).join(', ');
	}

	// Parses "US:120, IN:80" into a map; returns null for an empty string
	// (no overrides) and undefined when the text is malformed.
	function parseRegionalPricesInput(text: string): Record<string, number> | null | undefined {
		const out: Record<string, number> = {};
		for (const part of text.split(',')) {
			const p = part.trim();
			if (!p) continue;
			const idx = p.lastIndexOf(':');
			const country = idx > 0 ? p.slice(0, idx).trim().toUpperCase() : '';
			const price = idx > 0 ? Number(p.slice(idx + 1).trim()) : NaN;
			if (!country || !Number.isInteger(price) || price < 1) return undefined;
			out[country] = price;
		}
		return Object.keys(out).length ? out : null;
	}

	async function loadShop() {
		shopLoading = true;
		try {
			const res = await fetch('/api/admin/shop');
			if (res.ok) shopItemsList = await res.json();
		} finally {
			shopLoading = false;
		}
	}

	async function createShopItem() {
		if (!newShopName.trim() || !newShopDesc.trim() || !newShopImage.trim() || !newShopPrice) return;
		const regionalPrices = parseRegionalPricesInput(newShopRegional);
		if (regionalPrices === undefined) {
			alert('Regional prices must look like "US:120, IN:80" (positive whole numbers).');
			return;
		}
		shopSaving = true;
		try {
			const res = await fetch('/api/admin/shop', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: newShopName,
					description: newShopDesc,
					detailedDescription: newShopDetailedDesc.trim() || null,
					imageUrl: newShopImage,
					priceHours: newShopPrice,
					regionalPrices,
					stock: newShopStock.trim() === '' ? null : parseInt(newShopStock),
					estimatedShip: newShopShip.trim() || null,
					isActive: newShopActive,
					isFeatured: newShopFeatured,
					isSuperFeatured: newShopSuperFeatured,
					isBlackMarket: newShopBlackMarket,
					isGrant: newShopIsGrant,
					grantInstructions: newShopGrantInstructions.trim() || null
				})
			});
			if (res.ok) {
				newShopName = '';
				newShopDesc = '';
				newShopDetailedDesc = '';
				newShopImage = '';
				newShopPrice = 0;
				newShopRegional = '';
				newShopStock = '';
				newShopShip = '';
				newShopActive = true;
				newShopFeatured = false;
				newShopSuperFeatured = false;
				newShopBlackMarket = false;
				newShopIsGrant = false;
				newShopGrantInstructions = '';
				await loadShop();
			}
		} finally {
			shopSaving = false;
		}
	}

	async function saveShopEdit() {
		if (!editingShop) return;
		const regionalPrices = parseRegionalPricesInput(editingShopRegional);
		if (regionalPrices === undefined) {
			alert('Regional prices must look like "US:120, IN:80" (positive whole numbers).');
			return;
		}
		shopSaving = true;
		try {
			const res = await fetch(`/api/admin/shop/${editingShop.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: editingShop.name,
					description: editingShop.description,
					detailedDescription: editingShop.detailedDescription,
					imageUrl: editingShop.imageUrl,
					priceHours: editingShop.priceHours,
					regionalPrices,
					stock: editingShop.stock,
					estimatedShip: editingShop.estimatedShip,
					isActive: editingShop.isActive,
					isFeatured: editingShop.isFeatured,
					isSuperFeatured: editingShop.isSuperFeatured,
					isBlackMarket: editingShop.isBlackMarket,
					isGrant: editingShop.isGrant,
					grantInstructions: editingShop.grantInstructions
				})
			});
			if (res.ok) {
				editingShop = null;
				await loadShop();
			}
		} finally {
			shopSaving = false;
		}
	}

	async function deleteShopItem(id: string) {
		if (!confirm('Delete this shop item?')) return;
		shopSaving = true;
		try {
			const res = await fetch(`/api/admin/shop/${id}`, { method: 'DELETE' });
			if (res.ok) await loadShop();
		} finally {
			shopSaving = false;
		}
	}

	function handleDragStart(idx: number) {
		dragIdx = idx;
	}

	function handleDragOver(e: DragEvent, idx: number) {
		e.preventDefault();
		dragOverIdx = idx;
	}

	async function handleDrop(idx: number) {
		if (dragIdx === null || dragIdx === idx) {
			dragIdx = null;
			dragOverIdx = null;
			return;
		}
		const items = [...shopItemsList];
		const [moved] = items.splice(dragIdx, 1);
		items.splice(idx, 0, moved);
		shopItemsList = items;
		dragIdx = null;
		dragOverIdx = null;

		const reorderPayload = items.map((item, i) => ({ id: item.id, sortOrder: i }));
		try {
			await fetch('/api/admin/shop/reorder', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ items: reorderPayload })
			});
		} catch { /* silent */ }
	}

	function handleDragEnd() {
		dragIdx = null;
		dragOverIdx = null;
	}

	// Fulfillment state
	interface AdminOrder {
		id: string;
		userId: string;
		shopItemId: string;
		itemName: string;
		quantity: number;
		pipesSpent: number;
		status: string;
		hcbCardGrantId: string | null;
		siloGrantId: string | null;
		isGrant: boolean;
		createdAt: string;
		updatedAt: string;
		userName: string;
		userSlackId: string | null;
		userEmail: string | null;
		pendingSince: number | null;
	}
	let fulfillmentOrders: AdminOrder[] = $state([]);
	let fulfillmentLoading = $state(false);
	let fulfillmentItemFilter = $state('');
	let fulfillmentStatusFilter = $state('pending');
	let fulfillmentSortBy = $state<'oldest' | 'newest'>('oldest');
	// Fulfillment splits into two sub-views: the full orders table and a
	// dedicated bulk card-grant section (Super Admin only).
	let fulfillmentSubTab = $state<'orders' | 'grants'>('orders');
	let fulfillmentMsg = $state<Record<string, string>>({});
	let fulfillmentActionLoading = $state('');

	// HCB card grants
	type HcbStatus = {
		configured: boolean;
		connected: boolean;
		orgId: string | null;
		connectedByEmail: string | null;
		connectedAt: string | null;
		expiresAt: string | null;
	};
	let hcbStatus = $state<HcbStatus | null>(null);
	let grantModalOrder = $state<AdminOrder | null>(null);

	// SILO grants
	type SiloStatus = { configured: boolean };
	let siloStatus = $state<SiloStatus | null>(null);
	let siloGrantModalOrder = $state<AdminOrder | null>(null);

	async function loadSiloStatus() {
		try {
			const res = await fetch('/api/admin/silo/status');
			if (res.ok) siloStatus = await res.json();
		} catch {
			/* leave null */
		}
	}

	function onSiloGrantIssued() {
		loadFulfillment();
	}

	async function loadHcbStatus() {
		try {
			const res = await fetch('/api/admin/hcb/status');
			if (res.ok) hcbStatus = await res.json();
		} catch {
			/* leave null — banner just won't render */
		}
	}

	function onGrantIssued() {
		// Reflect the new grant + any status changes immediately.
		loadFulfillment();
	}

	type OrderDetail = {
		address: {
			streetAddress: string | null;
			locality: string | null;
			region: string | null;
			postalCode: string | null;
			country: string | null;
		} | null;
		phone: string | null;
		fulfillmentNotes : string | null;
		addressMissing: boolean;
		projects: { id: string; name: string; projectType: string | null; hours: number | null; approvedAt: string }[];
	};
	let expandedOrderId = $state<string | null>(null);
	let orderDetails = $state<Record<string, OrderDetail | 'loading' | 'error'>>({});
	let copiedKey = $state('');

	async function toggleOrderRow(orderId: string) {
		if (expandedOrderId === orderId) {
			expandedOrderId = null;
			return;
		}
		expandedOrderId = orderId;
		if (orderDetails[orderId] && orderDetails[orderId] !== 'error') return;
		orderDetails[orderId] = 'loading';
		try {
			const res = await fetch(`/api/admin/orders/${orderId}/detail`);
			if (!res.ok) {
				orderDetails[orderId] = 'error';
				return;
			}
			orderDetails[orderId] = await res.json();
		} catch {
			orderDetails[orderId] = 'error';
		}
	}

	function slackDmUrl(slackId: string | null): string | null {
		return slackId ? `https://slack.com/app_redirect?channel=${encodeURIComponent(slackId)}` : null;
	}

	async function copyAddressLine(key: string, value: string | null | undefined) {
		if (!value) return;
		try {
			await navigator.clipboard.writeText(value);
			copiedKey = key;
			setTimeout(() => { if (copiedKey === key) copiedKey = ''; }, 1200);
		} catch { /* clipboard blocked */ }
	}

	let fulfillmentItemOptions = $derived([...new Set(fulfillmentOrders.map(o => o.itemName))].sort());

	let filteredFulfillment = $derived.by(() => {
		let result = fulfillmentOrders;
		if (fulfillmentStatusFilter) {
			result = result.filter(o => o.status === fulfillmentStatusFilter);
		}
		if (fulfillmentItemFilter) {
			result = result.filter(o => o.itemName === fulfillmentItemFilter);
		}
		return result;
	});

	// ── Grant cards (bulk card grants) ──
	// A "grant card" order is one whose shop item is flagged as a grant item
	// (set in the shop panel). The grant amount is pipes spent × $5 (matches the
	// backend); this is a display estimate — the backend re-computes on issue.
	const GRANT_CENTS_PER_PIPE = 500;
	function grantCentsForOrder(o: AdminOrder): number {
		return o.pipesSpent * GRANT_CENTS_PER_PIPE;
	}
	function isGrantOrder(o: AdminOrder): boolean {
		return o.isGrant;
	}

	// Auto-sorted queue: pending grant orders that don't have a grant yet.
	let grantQueue = $derived(
		filteredFulfillment.filter((o) => o.status === 'pending' && isGrantOrder(o) && !o.hcbCardGrantId)
	);
	let grantQueueTotalCents = $derived(
		grantQueue.reduce((s, o) => s + grantCentsForOrder(o), 0)
	);

	// Batch controls: pre-auth is fixed ON server-side; one-time-use is the toggle.
	let grantBatchOneTimeUse = $state(true);
	let grantBatchRunning = $state(false);
	let grantBatchResults = $state<
		Array<{ orderId: string; itemName: string; ok: boolean; grantId?: string; error?: string; fulfilled?: boolean }>
	>([]);

	async function fulfillAllGrants() {
		if (grantQueue.length === 0) return;
		const confirmed = confirm(
			`Issue ${grantQueue.length} REAL card grant(s) totaling ` +
				`$${(grantQueueTotalCents / 100).toFixed(2)}?\n\n` +
				`Pre-authorization: required.  One-time use: ${grantBatchOneTimeUse ? 'ON' : 'OFF'}.\n` +
				`This moves real money and cannot be undone here.`
		);
		if (!confirmed) return;

		grantBatchRunning = true;
		grantBatchResults = [];
		try {
			const res = await fetch('/api/admin/hcb/card-grant/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					orderIds: grantQueue.map((o) => o.id),
					oneTimeUse: grantBatchOneTimeUse
				})
			});
			const body = await res.json().catch(() => ({}));
			if (res.ok) {
				grantBatchResults = body.results ?? [];
				await loadFulfillment(); // refresh — granted orders drop out of the queue
			} else {
				grantBatchResults = [
					{ orderId: '', itemName: '', ok: false, error: body?.message ?? 'Bulk grant failed' }
				];
			}
		} catch {
			grantBatchResults = [{ orderId: '', itemName: '', ok: false, error: 'Network error' }];
		} finally {
			grantBatchRunning = false;
		}
	}

	// For each pending order, count other pending orders by the same user for
	// the same shop item — these are mergeable into one fulfillment.
	let mergeableCounts = $derived.by(() => {
		const counts: Record<string, number> = {};
		const groups = new Map<string, string[]>();
		for (const o of fulfillmentOrders) {
			if (o.status !== 'pending' || !o.shopItemId) continue;
			const key = `${o.userId}::${o.shopItemId}`;
			const arr = groups.get(key);
			if (arr) arr.push(o.id);
			else groups.set(key, [o.id]);
		}
		for (const ids of groups.values()) {
			if (ids.length < 2) continue;
			for (const id of ids) counts[id] = ids.length - 1;
		}
		return counts;
	});

	async function loadFulfillment() {
		fulfillmentLoading = true;
		try {
			const params = new URLSearchParams();
			if (fulfillmentStatusFilter) params.set('status', fulfillmentStatusFilter);
			params.set('sortBy', fulfillmentSortBy);
			const qs = params.toString();
			const res = await fetch(`/api/admin/orders${qs ? `?${qs}` : ''}`);
			if (res.ok) fulfillmentOrders = await res.json();
		} finally {
			fulfillmentLoading = false;
		}
	}

	async function fulfillOrder(orderId: string) {
		if (!confirm('Mark this order as fulfilled? The user will be notified.')) return;
		fulfillmentActionLoading = orderId;
		try {
			const res = await fetch(`/api/admin/orders/${orderId}/fulfill`, { method: 'POST' });
			if (res.ok) await loadFulfillment();
		} finally {
			fulfillmentActionLoading = '';
		}
	}

	async function mergeOrder(order: AdminOrder) {
		const dupes = mergeableCounts[order.id] ?? 0;
		if (dupes < 1) return;
		if (!confirm(`Merge ${dupes} duplicate pending order(s) for ${order.userName} into this one? The merged orders are removed and the quantity is summed onto this order. The user is not notified.`)) return;
		fulfillmentActionLoading = order.id;
		try {
			const res = await fetch(`/api/admin/orders/${order.id}/merge`, { method: 'POST' });
			if (res.ok) await loadFulfillment();
		} finally {
			fulfillmentActionLoading = '';
		}
	}

	async function refundOrder(order: AdminOrder) {
		if (!confirm(`Refund ${order.quantity}x ${order.itemName} to ${order.userName}? This returns ${order.pipesSpent} Pipes, restocks the item, and removes the order.`)) return;
		fulfillmentActionLoading = order.id;
		try {
			const res = await fetch(`/api/admin/orders/${order.id}/refund`, { method: 'POST' });
			if (res.ok) await loadFulfillment();
		} finally {
			fulfillmentActionLoading = '';
		}
	}

	async function sendOrderMessage(orderId: string) {
		const msg = fulfillmentMsg[orderId]?.trim();
		if (!msg) return;
		fulfillmentActionLoading = orderId;
		try {
			const res = await fetch(`/api/admin/orders/${orderId}/message`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: msg })
			});
			if (res.ok) {
				fulfillmentMsg[orderId] = '';
			}
		} finally {
			fulfillmentActionLoading = '';
		}
	}

	function formatPendingTime(hours: number | null): string {
		if (hours === null) return '';
		if (hours < 1) return 'just now';
		if (hours < 24) return `${hours}h`;
		const days = Math.floor(hours / 24);
		return `${days}d ${hours % 24}h`;
	}

	$effect(() => {
		// Plain reviewers (Reviewer / Fraud Reviewer) have no Users tab; Fulfillers do.
		if (!canFulfill && activeTab === 'users') {
			activeTab = 'projects';
			return;
		}
		if (activeTab === 'users') { loadUsers(); }
		// Fulfillers see the charts/funnel only — the user-count cards and unreviewed
		// hours need Super-Admin-only endpoints (/users, /stats/unreviewed-hours).
		if (activeTab === 'stats' && isSuperAdmin) { loadUsers(); loadUnreviewedHours(); loadResubmissionPaused(); }
		if (activeTab === 'news') loadNews();
		if (activeTab === 'events') { loadEvents(); loadUsers(); }
		if (activeTab === 'projects') { loadProjects(); loadProjectHours(); }
		if (activeTab === 'shop') loadShop();
		if (activeTab === 'fulfillment') { loadFulfillment(); loadHcbStatus(); loadSiloStatus(); }
		if (activeTab === 'leaderboard') loadLeaderboard();
	});
</script>

<div class="admin-shell" class:light={lightMode}>
	<header class="admin-header">
		<h1>{isReviewer ? 'Review Panel' : 'Admin Panel'}</h1>
		<div style="display:flex;align-items:center;gap:0.75rem;">
			<button class="theme-toggle" onclick={() => lightMode = !lightMode}>{lightMode ? 'Dark' : 'Light'}</button>
			{#if isReviewer || isSuperAdmin}
				<button class="claims-drawer-btn" onclick={() => { claimsDrawerOpen = true; loadMyClaims(); }}>
					My Claims
					{#if myClaims.length > 0}
						<span class="claims-drawer-count">{myClaims.length}</span>
					{/if}
				</button>
			{/if}
			<span class="admin-user">Logged in as {data.user.name}</span>
		</div>
	</header>

	<nav class="admin-tabs">
		{#if canFulfill}
			<button class="tab" class:active={activeTab === 'users'} onclick={() => { activeTab = 'users'; closeDetail(); }}>Users</button>
			<button class="tab" class:active={activeTab === 'stats'} onclick={() => activeTab = 'stats'}>Stats</button>
			<button class="tab" class:active={activeTab === 'news'} onclick={() => activeTab = 'news'}>News</button>
		{/if}
		{#if isSuperAdmin}
			<button class="tab" class:active={activeTab === 'events'} onclick={() => activeTab = 'events'}>Events</button>
		{/if}
		{#if canFulfill}
			<button class="tab" class:active={activeTab === 'shop'} onclick={() => activeTab = 'shop'}>Shop</button>
			<button class="tab" class:active={activeTab === 'fulfillment'} onclick={() => activeTab = 'fulfillment'}>Fulfillment</button>
		{/if}
		<button class="tab" class:active={activeTab === 'projects'} onclick={() => activeTab = 'projects'}>Projects</button>
		<button class="tab" class:active={activeTab === 'leaderboard'} onclick={() => activeTab = 'leaderboard'}>Leaderboard</button>
		{#if isSuperAdmin}
			<a href="/admin/audit" class="tab tab-audit">Audit</a>
		{/if}
		<a href="/home" class="tab tab-home">Home</a>
	</nav>

	<main class="admin-content">
		{#if activeTab === 'users'}
			<div class="users-layout" class:has-detail={selectedUser}>
				<div class="users-table-wrap">
					<div class="users-toolbar">
						<input type="text" placeholder="Search by name, email or Slack ID..." bind:value={userSearch} class="users-search" />
						<select bind:value={permsFilter} class="users-perms-filter">
							<option value="">All Permissions</option>
							{#each PERMS_OPTIONS as perm}
								<option value={perm}>{perm}</option>
							{/each}
						</select>
					</div>
					{#if loading}
						<p class="loading">Loading users...</p>
					{:else}
						<table class="users-table">
							<thead>
								<tr>
									<th>Name</th>
									<th>Email</th>
									<th>Perms</th>
									<th>Slack ID</th>
									<th>Hackatime</th>
									<th>Joined</th>
								</tr>
							</thead>
							<tbody>
								{#each pagedUsers as user}
									<tr
										class:selected={selectedUser?.id === user.id}
										onclick={() => selectUser(user)}
									>
										<td>{user.name ?? '—'}</td>
										<td class="mono">{user.email}</td>
										<td><span class="badge" class:banned={user.perms === 'Banned'}>{user.perms ?? '—'}</span></td>
										<td class="mono">
											{#if user.slackId}
												<a class="slack-link" href={slackUserUrl(user.slackId)} target="_blank" rel="noopener noreferrer" onclick={(e) => e.stopPropagation()}>{user.slackId}</a>
											{:else}
												—
											{/if}
										</td>
										<td>{user.hackatimeConnected ? 'Yes' : 'No'}</td>
										<td>{formatDate(user.createdAt)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
						{#if filteredUsers.length === 0}
							<p class="empty">No users found.</p>
						{:else if userPageCount > 1}
							<div class="users-pagination">
								<button
									class="page-btn"
									disabled={usersPage <= 1}
									onclick={() => (usersPage = Math.max(1, usersPage - 1))}
								>Prev</button>
								<span class="page-info">
									{(usersPage - 1) * USERS_PAGE_SIZE + 1}–{Math.min(usersPage * USERS_PAGE_SIZE, filteredUsers.length)}
									of {filteredUsers.length}
								</span>
								<button
									class="page-btn"
									disabled={usersPage >= userPageCount}
									onclick={() => (usersPage = Math.min(userPageCount, usersPage + 1))}
								>Next</button>
							</div>
						{/if}
					{/if}
				</div>

				{#if selectedUser}
					<div class="detail-panel">
						<div class="detail-header">
							<h2>{selectedUser.name ?? 'Unknown'}</h2>
							<button class="close-btn" onclick={closeDetail}>&times;</button>
						</div>

						{#if detailLoading}
							<p class="loading">Loading...</p>
						{:else if userDetail}
							<div class="detail-sections">
								<section class="detail-section">
									<h3>Info</h3>
									<dl>
										<dt>ID</dt><dd class="mono">{userDetail.id}</dd>
										<dt>HCA Sub</dt><dd class="mono">{userDetail.hcaSub}</dd>
										<dt>Name</dt><dd>{userDetail.name ?? '—'}</dd>
										<dt>Email</dt><dd class="mono">{userDetail.email}</dd>
										<dt>Nickname</dt><dd>{userDetail.nickname ?? '—'}</dd>
										<dt>Slack ID</dt><dd class="mono">
											{#if userDetail.slackId}
												<a class="slack-link" href={slackUserUrl(userDetail.slackId)} target="_blank" rel="noopener noreferrer">{userDetail.slackId}</a>
											{:else}
												—
											{/if}
										</dd>
										<dt>Hackatime</dt><dd>{userDetail.hackatimeConnected ? 'Connected' : 'Not connected'}</dd>
										<dt>Perms</dt><dd><span class="badge" class:banned={userDetail.perms === 'Banned'}>{userDetail.perms ?? 'Unknown'}</span></dd>
										<dt>Active Sessions</dt><dd>{userDetail.activeSessions}</dd>
										<dt>Joined</dt><dd>{formatDate(userDetail.createdAt)}</dd>
									</dl>
								</section>

								<section class="detail-section">
									<h3>Actions</h3>
									<div class="actions">
										<div class="perms-action">
											<button class="btn btn-promote" onclick={() => showPermsDropdown = !showPermsDropdown} disabled={actionLoading !== '' || !canActOnTarget} title={!canActOnTarget ? 'Only Super Admins can change the role of a Fulfiller or Super Admin' : ''}>
												Promote / Change Role
											</button>
											{#if showPermsDropdown}
												<div class="perms-dropdown">
													{#each assignablePerms as perm}
														<button
															class="perms-option"
															class:current={userDetail.perms === perm}
															onclick={() => updatePerms(perm)}
															disabled={userDetail.perms === perm || actionLoading !== ''}
														>
															{perm}
														</button>
													{/each}
												</div>
											{/if}
										</div>

										<button class="btn btn-ban" onclick={banUser} disabled={actionLoading !== '' || userDetail.perms === 'Banned' || !canActOnTarget} title={!canActOnTarget ? 'Only Super Admins can ban a Fulfiller or Super Admin' : ''}>
											{actionLoading === 'ban' ? 'Banning...' : 'Ban User'}
										</button>

										{#if isSuperAdmin}
											<button class="btn btn-impersonate" onclick={impersonateUser} disabled={actionLoading !== '' || userDetail.perms === 'Banned'}>
												{actionLoading === 'impersonate' ? 'Starting...' : 'Impersonate'}
											</button>

											<button class="btn btn-promote" onclick={sendAttendInvite} disabled={actionLoading !== ''} title="Manually (re)send the Attend in-person event invite — use this when an automatic invite failed">
												{actionLoading === 'attend-invite' ? 'Sending...' : 'Send Attend Invite'}
											</button>
										{/if}
									</div>
								</section>

								{#if userDetail.projects?.length > 0}
									<section class="detail-section">
										<h3>Projects ({userDetail.projects.length})</h3>
										<div class="scrollable-table">
											<table class="mini-table">
												<thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Created</th></tr></thead>
												<tbody>
													{#each userDetail.projects as project}
														<tr>
															<td>{project.name}</td>
															<td>{project.projectType}</td>
															<td><span class="badge badge-{project.status}">{project.status}</span></td>
															<td>{formatDate(project.createdAt)}</td>
														</tr>
													{/each}
												</tbody>
											</table>
										</div>
									</section>
								{/if}

								<section class="detail-section">
									<h3>Pipes Balance: {userDetail.pipes ?? 0}</h3>
									{#if isSuperAdmin}
										<div class="pipes-adjust">
											<div class="pipes-adjust-row">
												<input
													type="number"
													min="1"
													step="1"
													placeholder="Amount"
													class="pipes-input"
													bind:value={pipesAdjustAmount}
													disabled={actionLoading !== ''}
												/>
												<input
													type="text"
													placeholder="Reason (optional)"
													class="pipes-input pipes-input-reason"
													bind:value={pipesAdjustReason}
													maxlength="200"
													disabled={actionLoading !== ''}
												/>
											</div>
											<div class="pipes-adjust-row">
												<button
													class="btn btn-pipes-grant"
													onclick={() => adjustPipes(1)}
													disabled={actionLoading !== '' || !pipesAdjustAmount || pipesAdjustAmount <= 0}
												>
													{actionLoading === 'pipes' ? 'Working…' : `Grant ${Math.max(0, Math.floor(Math.abs(pipesAdjustAmount || 0)))}`}
												</button>
												<button
													class="btn btn-pipes-revoke"
													onclick={() => adjustPipes(-1)}
													disabled={actionLoading !== '' || !pipesAdjustAmount || pipesAdjustAmount <= 0}
												>
													{actionLoading === 'pipes' ? 'Working…' : `Revoke ${Math.max(0, Math.floor(Math.abs(pipesAdjustAmount || 0)))}`}
												</button>
											</div>
										</div>
									{/if}
								</section>

								{#if userDetail.orders?.length > 0}
									<section class="detail-section">
										<h3>Orders</h3>
										<table class="mini-table">
											<thead><tr><th>Item</th><th>Qty</th><th>Pipes</th><th>Status</th><th>When</th></tr></thead>
											<tbody>
												{#each userDetail.orders as order}
													<tr>
														<td>{order.itemName}</td>
														<td>{order.quantity}</td>
														<td>{order.pipesSpent}</td>
														<td><span class="status-badge" class:status-pending={order.status === 'pending'} class:status-fulfilled={order.status === 'fulfilled'} class:status-cancelled={order.status === 'cancelled'}>{order.status}</span></td>
														<td>{formatDate(order.createdAt)}</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</section>
								{/if}

								{#if userDetail.auditLogs?.length > 0}
									<section class="detail-section">
										<h3>Audit Log</h3>
										<table class="mini-table">
											<thead><tr><th>Action</th><th>Label</th><th>When</th></tr></thead>
											<tbody>
												{#each userDetail.auditLogs as log}
													<tr>
														<td class="mono">{log.action}</td>
														<td>{log.label}</td>
														<td>{formatDate(log.createdAt)}</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</section>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{:else if activeTab === 'stats'}
			<div class="stats-section">
				<div class="stat-cards">
					{#if isSuperAdmin}
						<div class="stat-card">
							<span class="stat-value">{totalUsers}</span>
							<span class="stat-label">Logged-in Users</span>
						</div>
						<div class="stat-card">
							<span class="stat-value">{totalHackatime}</span>
							<span class="stat-label">Hackatime Linked</span>
						</div>
						<div class="stat-card" title="New Hackatime hours awaiting review across all unreviewed projects (excludes hours already approved on prior submissions). Cached for 60s.">
							<span class="stat-value">
								{#if unreviewedHours}
									{unreviewedHours.totalHours.toFixed(1)}
								{:else if unreviewedHoursLoading}
									…
								{:else}
									—
								{/if}
							</span>
							<span class="stat-label">
								Unreviewed Hours
								{#if unreviewedHours}
									<span class="stat-sub"> ({unreviewedHours.projectCount} project{unreviewedHours.projectCount === 1 ? '' : 's'})</span>
								{/if}
							</span>
						</div>
						<div class="stat-card" title="Per-decision approval rate across all historical project_reviews. 'changes_needed' and 'ban' both count as not-approved.">
							<span class="stat-value">
								{#if unreviewedHours && unreviewedHours.decisionCount > 0}
									{Math.round(unreviewedHours.approvalRate * 100)}%
								{:else if unreviewedHoursLoading}
									…
								{:else}
									—
								{/if}
							</span>
							<span class="stat-label">
								Approval Rate
								{#if unreviewedHours && unreviewedHours.decisionCount > 0}
									<span class="stat-sub"> ({unreviewedHours.decisionCount} decision{unreviewedHours.decisionCount === 1 ? '' : 's'})</span>
								{/if}
							</span>
						</div>
						<div class="stat-card" title="Unreviewed Hours × Approval Rate. Lower-bound estimate — ignores that 'changes_needed' projects often come back and get approved on a later pass.">
							<span class="stat-value">
								{#if unreviewedHours && unreviewedHours.decisionCount > 0}
									{unreviewedHours.predictedApprovedHours.toFixed(1)}
								{:else if unreviewedHoursLoading}
									…
								{:else}
									—
								{/if}
							</span>
							<span class="stat-label">Predicted Approved</span>
						</div>
					{/if}
				</div>
				<div class="stats-grid">
					<DauChart />
					<SignupsChart />
				</div>
				<UserFunnel />
				{#if isSuperAdmin}
					<div class="golden-backfill" class:golden-backfill-danger={resubmissionPaused}>
						<div class="golden-backfill-copy">
							<h3>Resubmission {resubmissionPaused ? 'paused' : 'open'}</h3>
							<p>When paused, builders with changes-needed projects can't resubmit, and get a note about the pause added to their changes-needed DM. Use this to clear the review queue.</p>
						</div>
						<button
							class="golden-backfill-btn"
							onclick={toggleResubmissionPaused}
							disabled={resubmissionToggleBusy || resubmissionPausedLoading}
						>
							{resubmissionToggleBusy ? 'Saving…' : resubmissionPaused ? 'Resume resubmission' : 'Pause resubmission'}
						</button>
						{#if resubmissionToggleError}
							<p class="golden-backfill-error">{resubmissionToggleError}</p>
						{/if}
					</div>
					<div class="golden-backfill">
						<div class="golden-backfill-copy">
							<h3>Backfill golden for cool builders <span class="gold-star">★</span></h3>
							<p>Marks every project of each cool builder golden (queue priority + black market) and DMs them. Builders who already have a golden project are skipped, so it's safe to re-run.</p>
						</div>
						<button class="golden-backfill-btn" onclick={backfillGoldenForCoolBuilders} disabled={goldenBackfillBusy}>
							{goldenBackfillBusy ? 'Backfilling…' : 'Backfill golden'}
						</button>
						{#if goldenBackfillResult}
							<p class="golden-backfill-result">
								Done — {goldenBackfillResult.processed} builder{goldenBackfillResult.processed === 1 ? '' : 's'} updated
								({goldenBackfillResult.projectsMarked} project{goldenBackfillResult.projectsMarked === 1 ? '' : 's'} marked golden,
								{goldenBackfillResult.dmsSent} DM{goldenBackfillResult.dmsSent === 1 ? '' : 's'} sent),
								{goldenBackfillResult.skipped} skipped of {goldenBackfillResult.coolBuilders} cool builder{goldenBackfillResult.coolBuilders === 1 ? '' : 's'}.
							</p>
						{/if}
						{#if goldenBackfillError}
							<p class="golden-backfill-error">{goldenBackfillError}</p>
						{/if}
					</div>
				{/if}
			</div>
		{:else if activeTab === 'news'}
			<div class="news-admin">
				<div class="news-form">
					<h3>Add News Item</h3>
					<div class="news-form-fields">
						<div class="news-date-row">
							<input type="date" bind:value={newNewsDate} class="news-input news-input-date" />
							<button class="btn btn-now" onclick={() => newNewsDate = todayDateStr()}>Now</button>
						</div>
						<textarea placeholder="News text..." bind:value={newNewsText} class="news-input news-input-text" rows="2"></textarea>
						<button class="btn btn-add-news" onclick={createNews} disabled={newsSaving || !newNewsText.trim() || !newNewsDate}>
							{newsSaving ? 'Saving...' : 'Add'}
						</button>
					</div>
				</div>

				{#if newsLoading}
					<p class="loading">Loading news...</p>
				{:else if newsItems.length === 0}
					<p class="empty">No news items yet.</p>
				{:else}
					<table class="users-table">
						<thead>
							<tr>
								<th>Date</th>
								<th>Text</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each newsItems as item}
								<tr>
									{#if editingNews?.id === item.id}
										<td><input type="date" bind:value={editingNews.displayDate} class="news-edit-input" /></td>
										<td><textarea bind:value={editingNews.text} class="news-edit-input news-edit-text" rows="2"></textarea></td>
										<td class="news-actions">
											<button class="btn btn-save" onclick={saveNewsEdit} disabled={newsSaving}>Save</button>
											<button class="btn btn-cancel" onclick={() => editingNews = null}>Cancel</button>
										</td>
									{:else}
										<td>{item.displayDate}</td>
										<td>{item.text}</td>
										<td class="news-actions">
											<button class="btn btn-edit" onclick={() => editingNews = { ...item }}>Edit</button>
											<button class="btn btn-delete" onclick={() => deleteNews(item.id)} disabled={newsSaving}>Delete</button>
										</td>
									{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	{:else if activeTab === 'events'}
		<div class="events-admin">
			<div class="news-form event-form">
				<h3>{editingEvent ? 'Edit Event' : 'Add Event'}</h3>
				<div class="event-form-fields">
					<input type="text" placeholder="Title" bind:value={newEventTitle} class="news-input event-title-input" />
					<input type="url" placeholder="URL (optional)" bind:value={newEventUrl} class="news-input event-url-input" />
					<select bind:value={newEventHostedBy} class="news-input event-hosted-input">
						<option value="">{loading && !usersLoaded ? 'Loading users...' : 'Hosted by'}</option>
						{#each users as user}
							{#if user.slackId}
								<option value={user.slackId}>{userDisplayName(user)} — {user.slackId}</option>
							{/if}
						{/each}
					</select>
					<textarea placeholder="Description" bind:value={newEventDescription} class="news-input news-input-text event-description-input" rows="3"></textarea>
					<div class="news-date-row event-date-row">
						<label for="event-start-at">Start</label>
						<input id="event-start-at" type="datetime-local" bind:value={newEventStartAt} class="news-input news-input-date" />
					</div>
					<div class="news-date-row event-date-row">
						<label for="event-end-at">End</label>
						<input id="event-end-at" type="datetime-local" bind:value={newEventEndAt} class="news-input news-input-date" />
					</div>
					<div class="news-form-actions event-form-actions">
						<button class="btn btn-add-news" onclick={editingEvent ? saveEventEdit : createEvent} disabled={eventSaving || !newEventTitle.trim() || !newEventHostedBy.trim() || !newEventStartAt.trim()}>
							{eventSaving ? 'Saving...' : editingEvent ? 'Save Event' : 'Add Event'}
						</button>
						{#if editingEvent}
							<button class="btn btn-cancel" onclick={resetEventForm} disabled={eventSaving}>Cancel</button>
						{/if}
					</div>
				</div>
			</div>

			{#if eventsLoading}
				<p class="loading">Loading events...</p>
			{:else if eventItems.length === 0}
				<p class="empty">No events yet.</p>
			{:else}
				<table class="users-table">
					<thead>
						<tr>
							<th>Start</th>
							<th>Title</th>
							<th>Hosted By</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each eventItems as evt}
							<tr>
								<td>{new Date(evt.startAt).toLocaleString()}</td>
								<td>{evt.title}</td>
								<td>
									{#if evt.hostedBySlackId}
										<a class="slack-link" href={slackUserUrl(evt.hostedBySlackId)} target="_blank" rel="noopener noreferrer">{evt.hostedByName ?? evt.hostedBySlackId}</a>
									{:else if evt.hostedBy}
										{evt.hostedByName ?? evt.hostedBy}
									{:else}
										—
									{/if}
								</td>
									<td class="news-actions">
									<button class="btn btn-edit" onclick={() => editEvent(evt)}>Edit</button>
									<button class="btn btn-delete" onclick={() => deleteEvent(evt.id)} disabled={eventSaving}>Delete</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	{:else if activeTab === 'fulfillment'}
			<div class="fulfillment-admin">
				{#if hcbStatus}
					<div class="hcb-banner" class:hcb-ok={hcbStatus.connected} class:hcb-warn={!hcbStatus.connected}>
						{#if !hcbStatus.configured}
							<span>⚠ HCB card grants are not configured on the server (set HCB_CLIENT_ID / HCB_ORG_ID).</span>
						{:else if !hcbStatus.connected}
							<span>HCB is not connected — card grants are disabled.</span>
							<a class="btn btn-sm btn-primary" href="/api/admin/hcb/connect" data-sveltekit-reload>Connect HCB</a>
						{:else}
							<span>
								✓ HCB connected{hcbStatus.orgId ? ` · org ${hcbStatus.orgId}` : ''}{hcbStatus.connectedByEmail ? ` · by ${hcbStatus.connectedByEmail}` : ''}
							</span>
							<a class="btn btn-sm" href="/api/admin/hcb/connect" data-sveltekit-reload>Reconnect</a>
						{/if}
					</div>
				{/if}
				{#if siloStatus}
					<div class="hcb-banner" class:hcb-ok={siloStatus.configured} class:hcb-warn={!siloStatus.configured}>
						{#if !siloStatus.configured}
							<span>⚠ SILO storage grants are not configured on the server (set SILO_API_KEY).</span>
						{:else}
							<span>✓ SILO storage grants enabled</span>
						{/if}
					</div>
				{/if}
				{#if isSuperAdmin}
					<div class="fulfillment-subtabs">
						<button class="fulfillment-subtab" class:active={fulfillmentSubTab === 'orders'} onclick={() => fulfillmentSubTab = 'orders'}>
							Orders
						</button>
						<button class="fulfillment-subtab" class:active={fulfillmentSubTab === 'grants'} onclick={() => {
							fulfillmentSubTab = 'grants';
							// Grants are always pending; make sure pending orders are loaded even
							// if the Orders view was left filtered to fulfilled/cancelled.
							if (fulfillmentStatusFilter && fulfillmentStatusFilter !== 'pending') {
								fulfillmentStatusFilter = 'pending';
								loadFulfillment();
							}
						}}>
							Bulk grants
							{#if grantQueue.length > 0}<span class="subtab-badge">{grantQueue.length}</span>{/if}
						</button>
					</div>
				{/if}

				<div class="fulfillment-toolbar">
					{#if !(isSuperAdmin && fulfillmentSubTab === 'grants')}
						<select bind:value={fulfillmentStatusFilter} class="users-perms-filter" onchange={() => loadFulfillment()}>
							<option value="">All Statuses</option>
							<option value="pending">Pending</option>
							<option value="fulfilled">Fulfilled</option>
							<option value="cancelled">Cancelled</option>
						</select>
					{/if}
					<select bind:value={fulfillmentItemFilter} class="users-perms-filter">
						<option value="">All Items</option>
						{#each fulfillmentItemOptions as item}
							<option value={item}>{item}</option>
						{/each}
					</select>
					{#if !(isSuperAdmin && fulfillmentSubTab === 'grants')}
						<select bind:value={fulfillmentSortBy} class="users-perms-filter" onchange={() => loadFulfillment()}>
							<option value="oldest">Oldest First</option>
							<option value="newest">Newest First</option>
						</select>
					{/if}
				</div>

				{#if isSuperAdmin && fulfillmentSubTab === 'grants'}
					{#if !hcbStatus?.connected}
						<p class="placeholder">Connect HCB to issue card grants.</p>
					{:else if grantQueue.length === 0}
						<p class="placeholder">No pending grants{fulfillmentItemFilter ? ` for “${fulfillmentItemFilter}”` : ''} right now.</p>
					{:else}
						<div class="grant-batch">
							<div class="grant-batch-head">
								<h3>Grant cards <span class="grant-batch-count">{grantQueue.length}</span></h3>
								<p class="grant-batch-sub">
									Every pending order for a grant-flagged item — review here and send together as HCB card grants.
								</p>
							</div>

							<ul class="grant-batch-list">
								{#each grantQueue as o}
									<li>
										<span class="grant-batch-item">{o.itemName}</span>
										<span class="grant-batch-user">{o.userName}{o.userEmail ? ` · ${o.userEmail}` : ''}</span>
										<span class="grant-batch-amt">${(grantCentsForOrder(o) / 100).toFixed(2)}</span>
									</li>
								{/each}
							</ul>

							<div class="grant-batch-controls">
								<label class="grant-batch-toggle">
									<input type="checkbox" bind:checked={grantBatchOneTimeUse} disabled={grantBatchRunning} />
									One-time use <span class="cg-hint">— card locks after the first transaction</span>
								</label>
								<span class="grant-batch-preauth">Pre-authorization: <strong>required</strong></span>
								<span class="grant-batch-total">Total ${(grantQueueTotalCents / 100).toFixed(2)}</span>
								<button class="btn btn-primary" onclick={fulfillAllGrants} disabled={grantBatchRunning}>
									{grantBatchRunning ? 'Issuing…' : `Fulfill all grants (${grantQueue.length})`}
								</button>
							</div>

							{#if grantBatchResults.length}
								<ul class="grant-batch-results">
									{#each grantBatchResults as r}
										<li class:ok={r.ok} class:fail={!r.ok}>
											{r.itemName ? `${r.itemName}: ` : ''}{r.ok
												? `✓ ${r.grantId}${r.fulfilled ? ' · fulfilled' : ' · grant issued, order left pending'}`
												: `✗ ${r.error ?? 'failed'}`}
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
				{:else if fulfillmentLoading}
					<p class="placeholder">Loading orders...</p>
				{:else if filteredFulfillment.length === 0}
					<p class="placeholder">No orders found.</p>
				{:else}
					<table class="admin-table">
						<thead>
							<tr>
								<th>Item</th>
								<th>User</th>
								<th>Qty</th>
								<th>Pipes</th>
								<th>Status</th>
								<th>Waiting</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each filteredFulfillment as order}
								{@const detail = orderDetails[order.id]}
								{@const isOpen = expandedOrderId === order.id}
								<tr class:fulfilled={order.status === 'fulfilled'} class:order-row={true} class:order-row-open={isOpen} onclick={() => toggleOrderRow(order.id)} onkeydown={(e) => { const tag = (e.target as HTMLElement).tagName; if ((e.key === 'Enter' || e.key === ' ') && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') { e.preventDefault(); toggleOrderRow(order.id); } }} tabindex="0" role="button" aria-expanded={isOpen}>
									<td><span class="order-row-toggle" aria-hidden="true">{isOpen ? '▾' : '▸'}</span> {order.itemName}</td>
									<td>{order.userName}{order.userEmail ? ` (${order.userEmail})` : ''}
										{#if order.userSlackId}
											<a class="order-slack-dm" href={slackDmUrl(order.userSlackId)} target="_blank" title={`DM ${order.userName} on Slack (${order.userSlackId})`} rel="noopener" onclick={(e) => e.stopPropagation()}>DM {order.userSlackId}</a>
										{/if}
									</td>
									<td>{order.quantity}</td>
									<td>{order.pipesSpent}</td>
									<td><span class="status-badge" class:status-pending={order.status === 'pending'} class:status-fulfilled={order.status === 'fulfilled'} class:status-cancelled={order.status === 'cancelled'}>{order.status}</span></td>
									<td>{order.pendingSince !== null ? formatPendingTime(order.pendingSince) : '—'}</td>
									<td class="fulfillment-actions" onclick={(e) => e.stopPropagation()}>
										{#if order.status === 'pending'}
											<button class="btn btn-sm btn-primary" onclick={() => fulfillOrder(order.id)} disabled={fulfillmentActionLoading === order.id}>
												{fulfillmentActionLoading === order.id ? '...' : 'Fulfill'}
											</button>
											{#if mergeableCounts[order.id]}
												<button class="btn btn-sm btn-merge" onclick={() => mergeOrder(order)} disabled={fulfillmentActionLoading === order.id} title="Combine this order with the other pending orders the user placed for the same item">
													{fulfillmentActionLoading === order.id ? '...' : `Merge (${mergeableCounts[order.id] + 1})`}
												</button>
											{/if}
										{/if}
										<button class="btn btn-sm btn-danger" onclick={() => refundOrder(order)} disabled={fulfillmentActionLoading === order.id}>
											{fulfillmentActionLoading === order.id ? '...' : 'Refund'}
										</button>
										{#if hcbStatus?.connected && order.isGrant}
											<button
												class="btn btn-sm btn-grant"
												onclick={() => (grantModalOrder = order)}
												disabled={!!order.hcbCardGrantId}
												title={order.hcbCardGrantId ? `Grant already issued (${order.hcbCardGrantId})` : 'Issue an HCB card grant for this order'}
											>{order.hcbCardGrantId ? 'Granted' : 'Card grant'}</button>
										{/if}
										{#if siloStatus?.configured}
											<button
												class="btn btn-sm btn-grant"
												onclick={() => (siloGrantModalOrder = order)}
												disabled={!!order.siloGrantId}
												title={order.siloGrantId ? `SILO grant already issued (${order.siloGrantId})` : 'Issue a SILO storage grant for this order'}
											>{order.siloGrantId ? 'Granted' : 'SILO grant'}</button>
										{/if}
										<div class="fulfillment-msg-row">
											<input
												type="text"
												placeholder="Custom message..."
												bind:value={fulfillmentMsg[order.id]}
												class="fulfillment-msg-input"
												maxlength="500"
											/>
											<button
												class="btn btn-sm"
												onclick={() => sendOrderMessage(order.id)}
												disabled={!fulfillmentMsg[order.id]?.trim() || fulfillmentActionLoading === order.id}
											>Send</button>
										</div>
									</td>
								</tr>
								{#if isOpen}
									<tr class="order-detail-row">
										<td colspan="7">
											{#if detail === 'loading' || detail === undefined}
												<div class="order-detail-loading">Loading order detail...</div>
											{:else if detail === 'error'}
												<div class="order-detail-error">Failed to load order detail. <button class="link-btn" onclick={() => toggleOrderRow(order.id)}>Retry</button></div>
											{:else}
												<div class="order-detail">
													{#if detail.fulfillmentNotes}
														<div class="order-detail-section order-note-callout">
															<h4 class="order-detail-heading">Buyer note</h4>
															<p class="order-note-text">{detail.fulfillmentNotes}</p>
														</div>
													{/if}
													<div class="order-detail-section">
														<h4 class="order-detail-heading">Shipping address <span class="order-detail-hint">(click any line to copy)</span></h4>
														{#if detail.addressMissing || !detail.address}
															<p class="order-detail-empty">No address on file in HCA. Ask the user to set one at auth.hackclub.com/portal/address.</p>
														{:else}
															<ul class="address-lines">
																{#each [
																	{ key: 'street', label: 'Street', value: detail.address.streetAddress },
																	{ key: 'locality', label: 'City', value: detail.address.locality },
																	{ key: 'region', label: 'Region', value: detail.address.region },
																	{ key: 'postal', label: 'Postal code', value: detail.address.postalCode },
																	{ key: 'country', label: 'Country', value: detail.address.country }
																] as line (line.key)}
																	{#if line.value}
																		{@const ck = `${order.id}:${line.key}`}
																		<li>
																			<button type="button" class="address-line" class:copied={copiedKey === ck} onclick={() => copyAddressLine(ck, line.value)} title="Click to copy">
																				<span class="address-label">{line.label}</span>
																				<span class="address-value">{line.value}</span>
																				<span class="address-copied">{copiedKey === ck ? 'copied!' : 'copy'}</span>
																			</button>
																		</li>
																	{/if}
																{/each}
																{#if detail.address.streetAddress || detail.address.locality}
																	{@const full = [
																		detail.address.streetAddress,
																		[detail.address.locality, detail.address.region].filter(Boolean).join(', '),
																		detail.address.postalCode,
																		detail.address.country
																	].filter(Boolean).join('\n')}
																	{@const ck = `${order.id}:full`}
																	<li>
																		<button type="button" class="address-line address-line-full" class:copied={copiedKey === ck} onclick={() => copyAddressLine(ck, full)} title="Copy full address">
																			<span class="address-label">All</span>
																			<span class="address-value">Copy full address</span>
																			<span class="address-copied">{copiedKey === ck ? 'copied!' : 'copy'}</span>
																		</button>
																	</li>
																{/if}
															</ul>
														{/if}
													</div>
													<div class="order-detail-section">
														<h4 class = "order-detail-heading">Contact</h4>
														{#if detail.phone}
															{@const ok =`${order.id}:phone`}
															<ul class = "address-lines">
																<li>
																	<button type="button" class="address-line" class:copied={copiedKey === ok} onclick={() => copyAddressLine(ok, detail.phone)} title="Click to copy">
																		<span class="address-label">Phone</span>
																		<span class="address-value">{detail.phone}</span>
																		<span class="address-copied">{copiedKey === ok ? 'copied!' : 'copy'}</span>
																	</button>
																</li>
															</ul>
														{:else}
															<p class="order-detail-empty">No phone number on file in HCA</p>
														{/if}
													</div>
													<div class="order-detail-section">
														<h4 class="order-detail-heading">Approved projects ({detail.projects.length})</h4>
														{#if detail.projects.length === 0}
															<p class="order-detail-empty">No approved projects yet.</p>
														{:else}
															<ul class="approved-projects">
																{#each detail.projects as p (p.id)}
																	<li>
																		<span class="approved-project-name">{p.name}</span>
																		{#if p.projectType}<span class="approved-project-type">{p.projectType}</span>{/if}
																		{#if p.hours != null}<span class="approved-project-hours">{p.hours}h</span>{/if}
																		<span class="approved-project-date">{formatDate(p.approvedAt)}</span>
																	</li>
																{/each}
															</ul>
														{/if}
													</div>
												</div>
											{/if}
										</td>
									</tr>
								{/if}
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		{:else if activeTab === 'shop'}
			<div class="shop-admin">
				<div class="shop-form">
					<h3>Add Shop Item</h3>
					<div class="shop-form-grid">
						<input type="text" placeholder="Name" bind:value={newShopName} class="shop-input" />
						<input type="text" placeholder="Image URL (e.g. /images/shop/item.webp)" bind:value={newShopImage} class="shop-input" />
						<textarea placeholder="Description (shown on card)" bind:value={newShopDesc} class="shop-input shop-textarea" rows="2"></textarea>
						<textarea placeholder="Detailed description (shown in popup only)" bind:value={newShopDetailedDesc} class="shop-input shop-textarea" rows="3"></textarea>
						<div class="shop-form-row">
							<label class="shop-field">
								<span>Price (hours)</span>
								<input type="number" min="1" bind:value={newShopPrice} class="shop-input shop-input-sm" />
							</label>
							<label class="shop-field">
								<span>Stock (blank = infinite)</span>
								<input type="text" placeholder="∞" bind:value={newShopStock} class="shop-input shop-input-sm" />
							</label>
							<label class="shop-field">
								<span>Est. shipping</span>
								<input type="text" placeholder="e.g. 2-3 weeks" bind:value={newShopShip} class="shop-input shop-input-sm" />
							</label>
							<label class="shop-field">
								<span>Regional prices (country:hours, matches HCA address)</span>
								<input type="text" placeholder="e.g. US:120, IN:80" bind:value={newShopRegional} class="shop-input" />
							</label>
						</div>
						<div class="shop-form-row">
							<label class="shop-checkbox">
								<input type="checkbox" bind:checked={newShopActive} />
								<span>Active (visible to users)</span>
							</label>
							<label class="shop-checkbox">
								<input type="checkbox" bind:checked={newShopFeatured} />
								<span>Featured (shown at the top)</span>
							</label>
							<label class="shop-checkbox">
								<input type="checkbox" bind:checked={newShopSuperFeatured} />
								<span>Super featured (the single spotlight item — replaces any current one)</span>
							</label>
							<label class="shop-checkbox">
								<input type="checkbox" bind:checked={newShopBlackMarket} />
								<span>Black market (golden-project authors only)</span>
							</label>
							<label class="shop-checkbox">
								<input type="checkbox" bind:checked={newShopIsGrant} />
								<span>Grant item (fulfilled by issuing an HCB card grant)</span>
							</label>
							{#if newShopIsGrant}
								<label class="shop-field" style="flex-basis:100%">
									<span>Grant instructions (shown to the recipient on the HCB grant, incl. pre-auth; blank = default)</span>
									<textarea bind:value={newShopGrantInstructions} class="shop-input shop-textarea" rows="3" placeholder="e.g. Use this grant only for … Upload a receipt in HCB for every purchase."></textarea>
								</label>
							{/if}
							<button class="btn btn-add-shop" onclick={createShopItem} disabled={shopSaving || !newShopName.trim() || !newShopImage.trim() || !newShopPrice}>
								{shopSaving ? 'Saving...' : 'Add Item'}
							</button>
						</div>
					</div>
				</div>

				{#if shopLoading}
					<p class="loading">Loading shop items...</p>
				{:else if shopItemsList.length === 0}
					<p class="empty">No shop items yet.</p>
				{:else}
					<div class="shop-items-list">
						{#each shopItemsList as item, idx}
							<div
								class="shop-item-row"
								class:dragging={dragIdx === idx}
								class:drag-over={dragOverIdx === idx}
								class:inactive={!item.isActive}
								draggable="true"
								role="listitem"
								ondragstart={() => handleDragStart(idx)}
								ondragover={(e) => handleDragOver(e, idx)}
								ondrop={() => handleDrop(idx)}
								ondragend={handleDragEnd}
							>
								<div class="shop-item-drag-handle" title="Drag to reorder">&#x2630;</div>
								{#if editingShop?.id === item.id}
									<div class="shop-item-edit">
										<input type="text" bind:value={editingShop.name} class="shop-input" />
										<input type="text" bind:value={editingShop.imageUrl} class="shop-input" placeholder="Image URL" />
										<textarea bind:value={editingShop.description} class="shop-input shop-textarea" rows="2" placeholder="Description (shown on card)"></textarea>
									<textarea bind:value={editingShop.detailedDescription} class="shop-input shop-textarea" rows="3" placeholder="Detailed description (shown in popup only)"></textarea>
										<div class="shop-form-row">
											<label class="shop-field">
												<span>Price (h)</span>
												<input type="number" min="1" bind:value={editingShop.priceHours} class="shop-input shop-input-sm" />
											</label>
											<label class="shop-field">
												<span>Stock</span>
												<input type="number" min="0" value={editingShop.stock ?? ''} oninput={(e) => { const v = (e.target as HTMLInputElement).value; editingShop!.stock = v === '' ? null : parseInt(v); }} class="shop-input shop-input-sm" placeholder="∞" />
											</label>
											<label class="shop-field">
												<span>Est. ship</span>
												<input type="text" bind:value={editingShop.estimatedShip} class="shop-input shop-input-sm" placeholder="e.g. 2-3 weeks" />
											</label>
											<label class="shop-field">
												<span>Regional prices</span>
												<input type="text" bind:value={editingShopRegional} class="shop-input" placeholder="e.g. US:120, IN:80" />
											</label>
										</div>
										<div class="shop-form-row">
											<label class="shop-checkbox">
												<input type="checkbox" bind:checked={editingShop.isActive} />
												<span>Active</span>
											</label>
											<label class="shop-checkbox">
												<input type="checkbox" bind:checked={editingShop.isFeatured} />
												<span>Featured</span>
											</label>
											<label class="shop-checkbox">
												<input type="checkbox" bind:checked={editingShop.isSuperFeatured} />
												<span>Super featured</span>
											</label>
											<label class="shop-checkbox">
												<input type="checkbox" bind:checked={editingShop.isBlackMarket} />
												<span>Black market</span>
											</label>
											<label class="shop-checkbox">
												<input type="checkbox" bind:checked={editingShop.isGrant} />
												<span>Grant item (HCB card grant)</span>
											</label>
											{#if editingShop.isGrant}
												<label class="shop-field" style="flex-basis:100%">
													<span>Grant instructions (shown to recipient; blank = default)</span>
													<textarea bind:value={editingShop.grantInstructions} class="shop-input shop-textarea" rows="3" placeholder="Use this grant only for … Upload a receipt in HCB."></textarea>
												</label>
											{/if}
											<div class="shop-edit-actions">
												<button class="btn btn-save" onclick={saveShopEdit} disabled={shopSaving}>Save</button>
												<button class="btn btn-cancel" onclick={() => editingShop = null}>Cancel</button>
											</div>
										</div>
									</div>
								{:else}
									<div class="shop-item-preview">
										<img src={item.imageUrl} alt={item.name} class="shop-item-thumb" />
										<div class="shop-item-info">
											<strong>{item.name}</strong>
											<span class="shop-item-meta">{item.priceHours}h{item.regionalPrices && Object.keys(item.regionalPrices).length ? ` (${formatRegionalPrices(item.regionalPrices)})` : ''} · {item.stock === null ? '∞' : item.stock} stock{item.estimatedShip ? ` · ${item.estimatedShip}` : ''}{item.isSuperFeatured ? ' · SUPER FEATURED' : ''}{item.isFeatured ? ' · FEATURED' : ''}{item.isBlackMarket ? ' · BLACK MARKET' : ''}{item.isGrant ? ' · GRANT' : ''}{!item.isActive ? ' · HIDDEN' : ''}</span>
										</div>
									</div>
									<div class="shop-item-actions">
										<button class="btn btn-edit" onclick={() => buyersModalItem = { id: item.id, name: item.name }}>Buyers</button>
										<button class="btn btn-edit" onclick={() => { editingShop = { ...item }; editingShopRegional = formatRegionalPrices(item.regionalPrices); }}>Edit</button>
										<button class="btn btn-delete" onclick={() => deleteShopItem(item.id)} disabled={shopSaving}>Delete</button>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{:else if activeTab === 'projects'}
			<div class="projects-admin">
				<div class="status-pills">
					{#if isSuperAdmin}
						<button class="pill" class:active={projectStatusFilter === ''} onclick={() => projectStatusFilter = ''}>
							All <span class="pill-count">{statusCounts.unshipped + statusCounts.unreviewed + statusCounts.changes_needed + statusCounts.approved + statusCounts.rejected}</span>
						</button>
						<button class="pill pill-unshipped" class:active={projectStatusFilter === 'unshipped'} onclick={() => projectStatusFilter = projectStatusFilter === 'unshipped' ? '' : 'unshipped'}>
							Unshipped <span class="pill-count">{statusCounts.unshipped}</span>
						</button>
					{/if}
					<button class="pill pill-unreviewed" class:active={projectStatusFilter === 'unreviewed'} onclick={() => projectStatusFilter = projectStatusFilter === 'unreviewed' && isSuperAdmin ? '' : 'unreviewed'}>
						Unreviewed <span class="pill-count">{statusCounts.unreviewed}</span>
					</button>
					<button class="pill pill-changes_needed" class:active={projectStatusFilter === 'changes_needed'} onclick={() => projectStatusFilter = projectStatusFilter === 'changes_needed' ? '' : 'changes_needed'}>
						Changes Needed <span class="pill-count">{statusCounts.changes_needed}</span>
					</button>
					<button class="pill pill-approved" class:active={projectStatusFilter === 'approved'} onclick={() => projectStatusFilter = projectStatusFilter === 'approved' ? '' : 'approved'}>
						Approved <span class="pill-count">{statusCounts.approved}</span>
					</button>
					<button class="pill pill-rejected" class:active={projectStatusFilter === 'rejected'} onclick={() => projectStatusFilter = projectStatusFilter === 'rejected' ? '' : 'rejected'}>
						Rejected <span class="pill-count">{statusCounts.rejected}</span>
					</button>
				</div>

				<div class="users-toolbar">
					<input type="text" placeholder="Search by project name, user name or Slack ID..." bind:value={projectSearch} class="users-search" />
					<select bind:value={projectTypeFilter} class="type-filter-select">
						<option value="">All Types</option>
						{#each PROJECT_TYPES as t}
							<option value={t}>{t}</option>
						{/each}
					</select>
					<select bind:value={projectIntentFilter} class="type-filter-select" title="Filter by intent">
						<option value="">All Intents</option>
						<option value="Hackathon">Hackathon</option>
						<option value="Shop">Shop</option>
						<option value="Both">Hackathon + Shop</option>
						<option value="Browsing">Browsing</option>
					</select>
					<select bind:value={projectSort} class="type-filter-select" title="Sort order">
						<option value="wait">Longest in queue</option>
						<option value="newest">Newest first</option>
						<option value="hours">Most hours</option>
					</select>
				</div>

				{#if projectsLoading}
					<p class="loading">Loading projects...</p>
				{:else}
					<div class="proj-split">
						<div class="proj-sidebar">
							{#if filteredProjects.length === 0}
								<p class="empty">No projects found.</p>
							{:else}
								{#each filteredProjects as project}
									<button
										class="proj-sidebar-item"
										class:active={expandedProjectId === project.id}
										onclick={() => selectProject(project.id)}
									>
										<span class="proj-sidebar-name">
											{project.name}
											{#if project.hackatimeProjectName?.length > 0}
												<span class="ht-pill" title="Hackatime linked: {project.hackatimeProjectName.join(', ')}">HT</span>
											{/if}
										</span>
										<span class="proj-sidebar-meta">
											{isSuperAdmin ? (project.user.name ?? '—') : (project.user.slackId ?? '—')}
											{#if project.isGolden}<span class="marker marker-gold marker-sm" title="Golden project">★</span>{:else if project.user.hasGoldenProject}<span class="marker marker-gold-author marker-sm" title="Author of a golden project — priority in queue">G</span>{/if}
										{#if project.user.watchlisted}<span class="marker marker-watch marker-sm" title="Watchlisted">W</span>{:else if project.user.coolBuilder}<span class="marker marker-cool marker-sm" title="Cool builder">★</span>{/if}
											{#if projectHours[project.id] != null}<span class="ht-hours" title="Hackatime hours logged">{projectHours[project.id]}h</span>{/if}
											{#if project.user.intent}<span class="user-intent-badge user-intent-badge--sm">{INTENT_LABELS[project.user.intent] ?? project.user.intent}</span>{/if}
											<span class="badge badge-{project.status} badge-sm">{project.status}</span>
											{#if project.claimedByReviewerId && project.claimedByReviewerId !== data.user.uid}
												<span class="claim-badge">Claimed by {project.claimedByReviewerName ?? 'someone'}</span>
											{:else if project.claimedByReviewerId === data.user.uid}
												<span class="claim-badge claim-badge--mine">Claimed by you</span>
											{/if}
										</span>
									</button>
								{/each}
							{/if}
						</div>

						<div class="proj-main">
							{#if selectedProject}
								<div class="proj-top-row">
									<div class="proj-top-info">
										<div class="proj-main-header">
											<h3 class="proj-main-title">{selectedProject.name}</h3>
											<span class="badge badge-{selectedProject.status}">{selectedProject.status}</span>

											<div class="joe-link-wrap">
												{#if selectedProject.joeProfileUrl}
													<a
														class="joe-link-btn"
														href={selectedProject.joeProfileUrl}
														target="_blank"
														rel="noopener noreferrer"
														title="Builder's fraud profile in Joe"
													>
														Joe Profile ↗
													</a>
												{/if}
												{#if selectedProject.joeHackatimeUrl}
													<a
														class="joe-link-btn joe-link-btn--alt"
														href={selectedProject.joeHackatimeUrl}
														target="_blank"
														rel="noopener noreferrer"
														title="Hackatime activity for this project in Joe"
													>
														Joe Hackatime ↗
													</a>
												{/if}
												{#if !selectedProject.joeProfileUrl && !selectedProject.joeHackatimeUrl}
													<span class="joe-link-btn joe-link-btn--disabled" title="No Hackatime or Slack identity on file for this builder">
														No Joe link
													</span>
												{/if}
												<span class="joe-link-note">HQ &amp; Fraud Squad only</span>
											</div>
										</div>

										<p class="proj-main-desc">{selectedProject.description}</p>

										<div class="proj-main-meta">
											<span>Type: <strong>{selectedProject.projectType}</strong></span>
											<span>
												User:
												<strong>{isSuperAdmin ? (selectedProject.user.name ?? '—') : ''}</strong>
												{#if selectedProject.user.slackId}
													{#if isSuperAdmin}
														(<a class="slack-link" href={slackUserUrl(selectedProject.user.slackId)} target="_blank" rel="noopener noreferrer">{selectedProject.user.slackId}</a>)
													{:else}
														<strong><a class="slack-link" href={slackUserUrl(selectedProject.user.slackId)} target="_blank" rel="noopener noreferrer">{selectedProject.user.slackId}</a></strong>
													{/if}
												{:else if !isSuperAdmin}
													<strong>—</strong>
												{/if}
											</span>
											<span>Update: <strong>{selectedProject.isUpdate ? 'Yes' : 'No'}</strong></span>
											<span>Created: <strong>{formatDate(selectedProject.createdAt)}</strong></span>
											{#if selectedProject.user.intent}
												<span>Intent: <span class="user-intent-badge">{INTENT_LABELS[selectedProject.user.intent] ?? selectedProject.user.intent}</span></span>
											{/if}
										</div>

										<div class="proj-claim-bar">
											{#if selectedProject.claimedByReviewerId === data.user.uid}
												<span class="claim-status claim-status--mine">
													Claimed by you{#if selectedProject.claimedAt} · expires {formatTimeRemaining(new Date(new Date(selectedProject.claimedAt).getTime() + 24 * 3600 * 1000).toISOString())}{/if}
												</span>
												<button class="btn-release-claim" onclick={() => releaseProjectClaim(selectedProject.id)}>
													Release Claim
												</button>
											{:else if selectedProject.claimedByReviewerId}
												<span class="claim-status claim-status--other">
													Claimed by {selectedProject.claimedByReviewerName ?? 'another reviewer'}
												</span>
												<button class="btn-claim btn-claim--override" onclick={() => claimProject(selectedProject.id)}>
													Claim Anyway
												</button>
											{:else}
												<span class="claim-status claim-status--free">Unclaimed</span>
												<button class="btn-claim" onclick={() => claimProject(selectedProject.id)}>
													Claim Project
												</button>
											{/if}
										</div>

										<div class="marker-controls">
											{#if selectedProject.isGolden}<span class="marker marker-gold">★ golden</span>{:else if selectedProject.user.hasGoldenProject}<span class="marker marker-gold-author">golden author</span>{/if}
										{#if selectedProject.user.watchlisted}<span class="marker marker-watch">watchlisted</span>{:else if selectedProject.user.coolBuilder}<span class="marker marker-cool">cool builder</span>{/if}
											<button type="button" class="marker-btn" class:on={selectedProject.user.watchlisted} disabled={markerBusy} onclick={() => toggleMarker(selectedProject.user, 'watchlist')}>
												{selectedProject.user.watchlisted ? '✓ Watchlisted' : 'Watchlist'}
											</button>
											<button type="button" class="marker-btn marker-btn-cool" class:on={selectedProject.user.coolBuilder} disabled={markerBusy} onclick={() => toggleMarker(selectedProject.user, 'cool')}>
												{selectedProject.user.coolBuilder ? '✓ Cool builder' : 'Cool builder'}
											</button>
											{#if markerError}<span class="marker-err">{markerError}</span>{/if}
										</div>

										<div class="ht-actions">
											{#if selectedProject.codeUrl}
												<a href={selectedProject.codeUrl} target="_blank" rel="noopener" class="ht-btn ht-btn-github">GitHub</a>
											{/if}
											{#if selectedProject.demoUrl}
												<a href={selectedProject.demoUrl} target="_blank" rel="noopener" class="ht-btn ht-btn-demo">Demo</a>
											{/if}
											{#if selectedProject.readmeUrl}
												<a href={selectedProject.readmeUrl} target="_blank" rel="noopener" class="ht-btn ht-btn-readme">README</a>
											{/if}
											{#if !selectedProject.codeUrl && !selectedProject.demoUrl && !selectedProject.readmeUrl}
												<span class="ht-empty">No links provided</span>
											{/if}
											{#if selectedProject.status === 'unreviewed'}
												<a href="https://hack-club-hq.gitbook.io/ysws-project-submission-guidelines/BLBRN8LIfoCZhFV6oMNR" target="_blank" rel="noopener" class="ht-btn ht-btn-docs">Open Docs</a>
											{/if}
											{#if isSuperAdmin && auditSvcUrl}
												<button
													type="button"
													class="ht-btn ht-btn-audit"
													onclick={() =>
														showAuditEmbed && auditEmbedProjectId === selectedProject.id
															? closeAuditEmbed()
															: openAuditEmbed()}
												>
													{showAuditEmbed && auditEmbedProjectId === selectedProject.id ? 'Hide audit' : 'View in audit'}
												</button>
											{/if}
										</div>
									</div>

									{#if selectedProject.screenshot1Url || selectedProject.screenshot2Url}
										<div class="proj-screenshots">
											<div class="proj-screenshot-viewer">
												<img
													src={projScreenIdx === 0 ? (selectedProject.screenshot1Url ?? selectedProject.screenshot2Url) : selectedProject.screenshot2Url}
													alt="Screenshot {projScreenIdx + 1}"
													class="proj-screenshot"
												/>
												{#if selectedProject.screenshot1Url && selectedProject.screenshot2Url}
													<button class="proj-screen-arrow proj-screen-arrow-left" type="button" onclick={() => projScreenIdx = 0} disabled={projScreenIdx === 0}>&#8249;</button>
													<button class="proj-screen-arrow proj-screen-arrow-right" type="button" onclick={() => projScreenIdx = 1} disabled={projScreenIdx === 1}>&#8250;</button>
													<div class="proj-screen-dots">
														<span class="proj-screen-dot" class:active={projScreenIdx === 0}></span>
														<span class="proj-screen-dot" class:active={projScreenIdx === 1}></span>
													</div>
												{/if}
											</div>
										</div>
									{/if}
								</div>

								{#if isSuperAdmin && showAuditEmbed && auditEmbedProjectId === selectedProject.id}
									<section class="audit-embed">
										<div class="audit-embed-head">
											<span>Hackatime heartbeats &amp; anomaly signals</span>
											<button type="button" class="audit-embed-close" onclick={closeAuditEmbed}>Close</button>
										</div>
										{#if auditEmbedError}
											<div class="audit-embed-error">audit panel failed to load: {auditEmbedError}</div>
										{:else}
											<iframe
												bind:this={auditFrameEl}
												name={AUDIT_FRAME_NAME}
												title="Heartbeat activity &amp; anomaly analysis"
												class="audit-embed-frame"
												style:height={`${auditEmbedHeight}px`}
												sandbox="allow-scripts allow-same-origin"
												referrerpolicy="no-referrer"
											></iframe>
										{/if}
									</section>
								{/if}

								{#if selectedProject.hackatimeProjectName?.length > 0}
									<div class="proj-info-row">
										<span class="proj-info-label">Hackatime Projects:</span>
										<span class="proj-info-value">{selectedProject.hackatimeProjectName.join(', ')}</span>
									</div>
								{/if}
								{#if selectedProject.otherHcProgram}
									<div class="proj-info-row">
										<span class="proj-info-label">Other HC Program:</span>
										<span class="proj-info-value">{selectedProject.otherHcProgram}</span>
									</div>
								{/if}
								{#if selectedProject.aiUse}
									<div class="proj-info-row">
										<span class="proj-info-label">AI Usage:</span>
										<span class="proj-info-value">{selectedProject.aiUse}</span>
									</div>
								{/if}

								{#if selectedProject.latestSubmission?.changeDescription}
									<div class="proj-info-row">
										<span class="proj-info-label">Resubmission Notes:</span>
										<span class="proj-info-value" style="white-space: pre-wrap">{selectedProject.latestSubmission.changeDescription}</span>
									</div>
									{#if selectedProject.latestSubmission.minHoursConfirmed}
										<div class="proj-info-row">
											<span class="proj-info-label">Min Hours:</span>
											<span class="proj-info-value">Confirmed 3+ hours since last ship</span>
										</div>
									{/if}
								{/if}

								{#if selectedProject.latestSubmission?.reviewerNote}
									<div class="proj-info-row">
										<span class="proj-info-label">Note to Reviewer:</span>
										<span class="proj-info-value" style="white-space: pre-wrap">{selectedProject.latestSubmission.reviewerNote}</span>
									</div>
								{/if}

								{#if otherProjectsForUser.length > 0}
									<section class="review-user-projects" aria-label="Other projects by this user">
										<div class="review-user-projects-head">
											<span>Other projects by this user</span>
											<span class="review-user-projects-count">{otherProjectsForUser.length}</span>
										</div>

										<div class="review-user-projects-list">
											{#each otherProjectsForUser as p (p.id)}
												<button 
													type="button"
													class="review-user-projects-row review-user-projects-link"
													onclick={async() => {
														if (expandedProjectId === p.id) return;
														projScreenIdx = 0;
														hackatimeData = null;
														pastReviews = [];
														projectDevlogs = [];
														projectLookout = null;
														await Promise.all([
															selectProject(p.id),
															loadReviews(p.id),
															loadProjectDevlogs(p.id),
															loadProjectLookout(p.id)
														]);
													}}
													>
													<div class="review-user-projects-main">
														<div class="review-user-projects-name">{p.name}</div>
														<div class="review-user-projects-meta">
															{p.projectType} · updated {formatDate(p.updatedAt)}
														</div>
													</div>

													<span class="badge badge-{p.status} review-user-projects-status">
														{p.status.replaceAll('_', ' ')}
													</span>
												</button>
											{/each}
										</div>

									</section>
								{:else}
									<section class="review-user-projects" aria-label="Other projects by this user">
										<div class="review-user-projects-head">
											<span>Other projects by this user</span>
											<span class="review-user-projects-count">0</span>
										</div>
										<div class="review-user-projects-empty">No other projects for this user.</div>
									</section>
								{/if}

								<TimelapsePanel projectId={selectedProject.id} />

								{#if selectedProject.status === 'unreviewed' || selectedProject.status === 'approved'}
									<hr class="proj-divider" />

									{#if hackatimeLoading}
										<span class="ht-loading">Loading Hackatime data...</span>
									{:else if hackatimeData}
										{@const rawTrust = hackatimeData.trustLevel?.toLowerCase() ?? ''}
										{@const displayTrust = !isSuperAdmin && rawTrust === 'yellow' ? 'blue' : rawTrust}
										<div class="ht-detail">
											<div class="ht-header">
												<span class="ht-trust">Trust Level: <strong class="trust-{displayTrust || 'unknown'}">{{ blue: 'standard', yellow: 'warned', red: 'banned' }[displayTrust] ?? hackatimeData.trustLevel ?? 'unknown'}</strong></span>
												<span class="ht-total">
													{Math.round((hackatimeData.totalHours + lookoutHours) * 10) / 10}h total
													{#if lookoutHours > 0}<span class="ht-total-note">(Hackatime {hackatimeData.totalHours}h + timelapse {lookoutHours}h)</span>{/if}
												</span>
												{#if hackatimeData.earliestHeartbeat}
													<span class="ht-earliest">first heartbeat: {new Date(hackatimeData.earliestHeartbeat * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
												{/if}
												{#if hackatimeData.previousApprovedHours > 0}
													<span class="ht-delta">prev approved: {hackatimeData.previousApprovedHours}h — new Hackatime since: {Math.round((hackatimeData.totalHours - hackatimeData.previousApprovedHours) * 10) / 10}h</span>
												{/if}
											</div>
											<div class="ht-breakdown-panel">
												<ProjectHourBreakdown
													title="Project Hackatime Hours"
													perProjectLabel="Linked project hours"
													totalHours={hackatimeData.totalHours}
													aiHours={hackatimeData.aiHours}
													nonAiHours={hackatimeData.nonAiHours}
													perProject={hackatimeData.hackatimeProjects.map((hp) => ({ name: hp.name, hours: hp.hours }))}
													startDate={hackatimeData.startDate}
												/>
												{#if projectLookout && lookoutHours > 0}
													<div class="ht-lookout-line">
														<span class="ht-lookout-label">Lookout timelapse ({projectLookout.completeCount} complete)</span>
														<span class="ht-lookout-hours">{lookoutHours}h</span>
													</div>
												{/if}
											</div>

											<div class="ht-files">
												<div class="ht-files-head">
													<div class="ht-files-heading">Hours by file</div>
													<button
														type="button"
														class="ht-files-toggle"
														onclick={() => (showHackatimeFiles = !showHackatimeFiles)}
														aria-expanded={showHackatimeFiles}
													>
														{showHackatimeFiles ? 'Hide' : 'Show'}
													</button>
												</div>

												{#if showHackatimeFiles}
													{#if hackatimeData.fileBreakdown?.length}
														<div class="ht-files-list">
															{#each hackatimeData.fileBreakdown as row}
																<div class="ht-file-row">
																	<span class="ht-file-name" title={row.file}>{shortenHackatimePath(row.file)}</span>
																	<span class="ht-file-hours">{row.hours}h</span>
																</div>
															{/each}
														</div>
													{:else}
														<div class="ht-files-empty-text">No file-level breakdown available from Hackatime.</div>
													{/if}
												{/if}
											</div>
											
											{#if hackatimeData.linkedBanned || hackatimeData.emailMismatch || hackatimeData.trustLevel === 'red'}
												<div class="ht-ownership-alert">
													{#if hackatimeData.emailMismatch}
														<div><strong>⚠ Hackatime account mismatch.</strong> {isSuperAdmin ? "The linked Hackatime user does not contain this builder's email — strongly suggests a shared/alt account." : 'The linked Hackatime account does not match this builder — strongly suggests a shared/alt account.'}</div>
													{/if}
													{#if hackatimeData.linkedBanned || hackatimeData.trustLevel === 'red'}
														<div><strong>⚠ Linked Hackatime account is banned</strong> (trust: {hackatimeData.trustLevel ?? 'unknown'}{hackatimeData.linkedBanned ? ', banned=true' : ''}).</div>
													{/if}
													<div class="ht-ownership-meta">
														{#if isSuperAdmin}
															<div>Beest email: <code>{hackatimeData.beestEmail ?? '—'}</code></div>
														{/if}
														<div>Beest Slack: <code>{hackatimeData.beestSlackId ?? '—'}</code></div>
														{#if isSuperAdmin}
															<div>Linked Hackatime email: <code>{hackatimeData.linkedEmail ?? '—'}</code></div>
														{/if}
														<div>Linked Hackatime Slack: <code>{hackatimeData.linkedSlackUid ?? '—'}</code></div>
													</div>
												</div>
											{/if}
											{#if hackatimeData.hackatimeProjects.length > 0}
												<div class="ht-projects">
													{#each hackatimeData.hackatimeProjects as hp}
														<div class="ht-project">
															<span class="ht-project-name">{hp.name}</span>
															<span class="ht-project-hours">{hp.hours}h</span>
															{#if hp.languages.length > 0}
																<span class="ht-project-langs">{hp.languages.join(', ')}</span>
															{/if}
														</div>
													{/each}
												</div>
											{:else}
												<span class="ht-empty">No linked Hackatime projects found</span>
											{/if}
											{#if hackatimeData.categories && hackatimeData.categories.length > 0}
												{@const aiCat = hackatimeData.categories.find((c) => /ai/i.test(c.name))}
												<div class="ht-categories">
													<div class="ht-categories-header">
														<span class="ht-categories-label">Category breakdown</span>
														{#if aiCat}
															<span class="ht-ai-pill" class:warn={aiCat.percent >= 30} class:flag={aiCat.percent >= 50}>
																{aiCat.name}: {aiCat.percent}%
															</span>
														{/if}
													</div>
													<div class="ht-category-bars">
														{#each hackatimeData.categories as cat}
															<div class="ht-category" class:ai={/ai/i.test(cat.name)}>
																<span class="ht-category-name">{cat.name}</span>
																<div class="ht-category-bar"><div class="ht-category-fill" style:width="{cat.percent}%"></div></div>
																<span class="ht-category-pct">{cat.percent}%</span>
															</div>
														{/each}
													</div>
												</div>
											{/if}
											{#if hackatimeData?.unifiedDuplicate}
												<div class="unified-duplicate-alert">Duplicate Found — This code URL already exists in Unified Approved Projects</div>
											{:else if hackatimeData?.unifiedError}
												<div class="unified-error-alert">Unified check failed — could not verify code URL against Approved Projects</div>
											{/if}
											<label class="ht-justification-label">
												Override Justification: <span class="ht-justification-counter" class:ok={justificationOk}>{justificationOk ? 'ok' : `add ${justificationCharsRemaining} more chars`}</span>
												<textarea bind:this={justificationEl} class="ht-justification" bind:value={overrideJustification} rows="6"></textarea>
											</label>
										</div>
									{/if}

									{#if hackatimeData && (hackatimeData.previousApprovedHours > 0 || hackatimeData.previousInternalHours > 0)}
										<div class="hours-reship-note">
											<strong>Reship review:</strong> enter only the <em>new hours since the last approval</em> (delta). Defaults are the Hackatime delta. The submitted value is added on top of the previously approved hours, not replacing them.
										</div>
									{/if}

									<div class="hours-adjust">
										<span class="hours-adjust-label">Internal{#if hackatimeData && hackatimeData.previousInternalHours > 0} (Δ){/if}:</span>
										<button class="hours-btn" onclick={() => adjustHours(0.5)}>Halve</button>
										<button class="hours-btn" onclick={() => adjustHours(1/3)}>Third</button>
										<button class="hours-btn" onclick={() => adjustHours(0.25)}>Quarter</button>
										<div class="hours-custom">
											<button class="hours-tick" onclick={() => { customHours = Math.max(0, Math.round((customHours - 1) * 10) / 10); applyCustomHours(); }}>-</button>
											<input type="number" class="hours-input" bind:value={customHours} onchange={applyCustomHours} min="0" step="0.1" />
											<button class="hours-tick" onclick={() => { customHours = Math.round((customHours + 1) * 10) / 10; applyCustomHours(); }}>+</button>
										</div>
										<span class="hours-adjust-divider">|</span>
										<span class="hours-adjust-label">User Facing{#if hackatimeData && hackatimeData.previousApprovedHours > 0} (Δ){/if}:</span>
										<button class="hours-btn" onclick={() => { userFacingHours = Math.round(userFacingHours * 0.5 * 10) / 10; }}>Halve</button>
										<button class="hours-btn" onclick={() => { userFacingHours = Math.round(userFacingHours * (1/3) * 10) / 10; }}>Third</button>
										<button class="hours-btn" onclick={() => { userFacingHours = Math.round(userFacingHours * 0.25 * 10) / 10; }}>Quarter</button>
										<div class="hours-custom">
											<button class="hours-tick" onclick={() => { userFacingHours = Math.max(0, Math.round((userFacingHours - 1) * 10) / 10); }}>-</button>
											<input type="number" class="hours-input" bind:value={userFacingHours} min="0" step="0.1" />
											<button class="hours-tick" onclick={() => { userFacingHours = Math.round((userFacingHours + 1) * 10) / 10; }}>+</button>
										</div>
									</div>

									<hr class="proj-divider" />

									<div class="quick-reject-panel">
										<div class="quick-reject-head">
											<span class="quick-reject-title">Quick rejection reasons</span>
											<span class="quick-reject-hint">Adds feedback; edit before rejecting if needed.</span>
										</div>

										<div class="quick-reject-select-row">
											<select
												class="quick-reject-select"
												value={selectedQuickRejectReason}
												onchange={(e) => selectQuickRejectReason(e.currentTarget.value)}
											>
												<option value="">Choose a rejection reason</option>
												{#each QUICK_REJECT_REASONS as reason}
													<option value={reason.id}>{reason.label}</option>
												{/each}
											</select>
										</div>
									</div>

									<div class="user-feedback-box">
										<label class="user-feedback-label">
											User Feedback:
											<textarea bind:this={userFeedbackEl} class="user-feedback" bind:value={userFeedback} rows="4" placeholder="Feedback to send to the user about their project..."></textarea>
										</label>
									</div>

									<div class="user-feedback-box">
										<label class="user-feedback-label">
											User-Wide Reviewer Note:
											<textarea bind:this={persistentUserNoteEl} class="user-feedback" bind:value={persistentUserNote} rows="4" placeholder="Persistent internal note about this builder, shown to reviewers across all of their projects — not visible to the builder..."></textarea>
										</label>
									</div>

									<div class="user-feedback-box">
										<label class="user-feedback-label">
											Internal Note:
											<textarea bind:this={internalNoteEl} class="user-feedback" bind:value={internalNote} rows="3" placeholder="Private note for reviewers only — not visible to the user..."></textarea>
										</label>
									</div>

									<label class="review-anonymous-toggle">
										<input type="checkbox" bind:checked={hideReviewerName} />
										<span>Hide my name from the project owner</span>
									</label>

									<label class="review-anonymous-toggle review-golden-toggle" title="Golden projects give the author priority in the review queue and access to black market shop items. Applies when you approve.">
										<input type="checkbox" bind:checked={markGolden} />
										<span>Mark as golden <span class="gold-star">★</span> (queue priority + black market access on approval)</span>
									</label>

									<div class="review-actions">
										<button class="review-btn review-btn-approve" onclick={() => reviewProject('approved')} disabled={reviewSubmitting || !justificationOk}>Approve</button>
										<button class="review-btn review-btn-reject" onclick={() => reviewProject('changes_needed')} disabled={reviewSubmitting || !userFeedback.trim()}>Reject</button>
										<button class="review-btn review-btn-hard-reject" onclick={() => { if (confirm('Hard reject this project? The builder will NOT be able to resubmit it (they can still ship other projects).')) reviewProject('rejected'); }} disabled={reviewSubmitting || !userFeedback.trim()} title="Permanently reject this project — it cannot be resubmitted">Hard Reject</button>
										<button class="review-btn review-btn-ban" onclick={() => { if (confirm('Ban this user and reject their project?')) reviewProject('ban'); }} disabled={reviewSubmitting || !canBan} title={!canBan ? 'Ban requires Super Admin or Fraud Reviewer — flag in internal note and ping Euan' : ''}>Fail &amp; Ban</button>
									</div>
								{/if}

								{#if selectedProject.status === 'rejected'}
									<div class="rejected-panel">
										<div class="rejected-panel-info">
											<strong>This project was hard-rejected.</strong>
											<span>The builder can't resubmit it. Allow resubmission to move it back to “changes needed” so they can edit and ship again.</span>
										</div>
										<button
											class="review-btn review-btn-reopen"
											onclick={() => { if (confirm('Allow this project to be resubmitted? It moves back to "changes needed" so the builder can edit and ship again.')) reviewProject('changes_needed'); }}
											disabled={reviewSubmitting}
										>
											Allow Resubmission
										</button>
									</div>
								{/if}

								{#if projectLookout && projectLookout.sessions.length > 0}
									<hr class="proj-divider" />
									<div class="lookout-review-head">
										<h4 class="reviews-heading">Timelapses ({projectLookout.sessions.length})</h4>
										<div class="lookout-review-head-right">
										{#if lookoutHours > 0}
											<span class="lookout-review-total">{lookoutHours}h tracked · {projectLookout.completeCount} complete</span>
										{/if}
										<button
											type="button"
											class="ht-files-toggle"
											onclick={()=> (showLookoutVideos = !showLookoutVideos)}
											aria-expanded={showLookoutVideos}
											>
												{showLookoutVideos ? 'Hide': 'Show'}
											</button>
										</div>
									</div>
									{#if showLookoutVideos}
										<div class="lookout-review-grid">
											{#each projectLookout.sessions as s (s.id)}
												<div class="lookout-review-card" class:pending={s.status !== 'complete'}>
													{#if s.status === 'complete' && s.videoUrl}
														<video controls preload="metadata" poster={s.thumbnailUrl ?? undefined} src={s.videoUrl}>
															<track kind="captions" />
														</video>
													{:else if s.thumbnailUrl}
														<img src={s.thumbnailUrl} alt="Timelapse thumbnail" loading="lazy" />
													{:else}
														<div class="lookout-review-novid">No preview</div>
													{/if}
													<div class="lookout-review-meta">
														<span class="lookout-review-name">{s.name ?? (s.status === 'complete' ? 'Timelapse' : s.status)}</span>
														<span class="lookout-review-sub">
															{#if s.trackedSeconds}{fmtLookoutTracked(s.trackedSeconds)} · {/if}
															{s.createdAt ? formatDate(s.createdAt) : 'recent'}
															{#if s.status !== 'complete'} · {s.status}{/if}
														</span>
													</div>
												</div>
											{/each}
											</div>
											{/if}
										{/if}

								{#if projectDevlogs.length > 0}
									<hr class="proj-divider" />
									<h4 class="reviews-heading">
										Devlogs ({projectDevlogs.length})
										{#if devlogApprovedHours > 0}<span class="devlog-approved-total"> · {Math.round(devlogApprovedHours * 10) / 10}h approved into project</span>{/if}
									</h4>
									<div class="devlogs-list">
										{#each projectDevlogs as dl}
											<div class="devlog-card">
												<div class="devlog-card-header">
													<span class="devlog-card-author">{dl.userName ?? 'Unknown'}</span>
													<span class="devlog-card-date">{formatDate(dl.createdAt)}</span>
												</div>
												{#if dl.title}<h5 class="devlog-card-title">{dl.title}</h5>{/if}
												<p class="devlog-card-text">{dl.text}</p>
												{#if dl.imageUrls && dl.imageUrls.length > 0}
													<div class="devlog-card-images">
														{#each dl.imageUrls as url}
															<button type="button" class="devlog-card-image-btn" onclick={() => openDevlogLightbox(url)}>
																<img src={url} alt="Devlog attachment" loading="lazy" />
															</button>
														{/each}
													</div>
												{/if}
												{#if dl.lookout}
													<div class="devlog-card-lookout">
														<span class="devlog-lookout-status">{dl.lookout.status}</span>
														{#if dl.lookout.trackedSeconds}
															<span class="devlog-lookout-tracked"> · {fmtLookoutTracked(dl.lookout.trackedSeconds)}</span>
														{/if}
														{#if dl.lookout.status === 'complete' && dl.lookout.videoUrl}
															<video controls preload="metadata" poster={dl.lookout.thumbnailUrl ?? undefined} src={dl.lookout.videoUrl}>
																<track kind="captions" />
															</video>
														{:else}
															<span class="devlog-lookout-pending"> · timelapse not finished yet</span>
														{/if}
													</div>
												{/if}
											<div class="devlog-review-bar">
												<label class="devlog-hours-field">
													Hours
													<input
														type="number" min="0" step="0.1"
														class="devlog-hours-input"
														value={devlogHoursDraft[dl.id] ?? (dl.approvedHours ?? '')}
														oninput={(e) => devlogHoursDraft[dl.id] = e.currentTarget.value}
													/>
												</label>
												{#if dl.lookout?.trackedSeconds}
													<button type="button" class="devlog-hours-suggest"
														onclick={() => devlogHoursDraft[dl.id] = ((dl.lookout?.trackedSeconds ?? 0) / 3600).toFixed(1)}
														title="Use the attached timelapse's tracked time">
														lapse: {fmtLookoutTracked(dl.lookout?.trackedSeconds ?? null)}
													</button>
												{/if}
												{#if dl.approved}
													<span class="devlog-approved-tag">✓ {dl.approvedHours}h approved</span>
													<button type="button" class="devlog-unapprove" disabled={devlogReviewLoading === dl.id}
														onclick={() => reviewDevlog(dl, false)}>Unapprove</button>
												{:else}
													<button type="button" class="devlog-approve" disabled={devlogReviewLoading === dl.id}
														onclick={() => reviewDevlog(dl, true)}>
														{devlogReviewLoading === dl.id ? 'Saving…' : 'Approve'}
													</button>
												{/if}
											</div>
											</div>
										{/each}
									</div>
								{/if}

								{#if pastReviews.length > 0}
									<hr class="proj-divider" />
									<h4 class="reviews-heading">Review History</h4>
									{#each pastReviews as review}
										<div class="review-card review-card-{review.status}">
											<div class="review-card-header">
												<span class="badge badge-{review.status} badge-sm">{review.status}</span>
												<span class="review-card-reviewer">{review.reviewerName ?? 'Unknown'}</span>
												{#if review.hideReviewerName}
													<span class="review-card-anonymous">hidden from owner</span>
												{/if}
												<span class="review-card-date">{formatDate(review.createdAt)}</span>
											</div>
											{#if review.feedback}
												<div class="review-card-section">
													<span class="review-card-label">Feedback:</span>
													<p class="review-card-text">{review.feedback}</p>
												</div>
											{/if}
											{#if review.internalNote}
												<div class="review-card-section review-card-internal">
													<span class="review-card-label">Internal Note:</span>
													<p class="review-card-text">{review.internalNote}</p>
												</div>
											{/if}
											{#if review.overrideJustification}
												<div class="review-card-section">
													<span class="review-card-label">Justification:</span>
													<p class="review-card-text">{review.overrideJustification}</p>
												</div>
											{/if}
										</div>
									{/each}
								{/if}

							{:else}
								<div class="proj-main-empty">
									<p>Select a project to review</p>
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{:else if activeTab === 'leaderboard'}
			<div class="leaderboard">
				<div class="leaderboard-header">
					<h2>Review Leaderboard</h2>
					<div class="leaderboard-windows">
						<button class="pill" class:active={leaderboardWindow === '24h'} onclick={() => leaderboardWindow = '24h'}>24h</button>
						<button class="pill" class:active={leaderboardWindow === '7d'} onclick={() => leaderboardWindow = '7d'}>7 days</button>
						<button class="pill" class:active={leaderboardWindow === '30d'} onclick={() => leaderboardWindow = '30d'}>30 days</button>
						<button class="pill" class:active={leaderboardWindow === 'all'} onclick={() => leaderboardWindow = 'all'}>All time</button>
					</div>
				</div>
				{#if leaderboardLoading}
					<p class="loading">Loading leaderboard...</p>
				{:else if leaderboardRows.length === 0}
					<p class="empty">No reviews in this window.</p>
				{:else}
					<table class="leaderboard-table">
						<thead>
							<tr>
								<th>Reviewer</th>
								<th>Total</th>
								<th>Approved</th>
								<th>Changes Needed</th>
								<th>Banned</th>
								<th>Rejected</th>
								<th>Returned</th>
								<th>Approval %</th>
							</tr>
						</thead>
						<tbody>
							{#each leaderboardRows as row}
								<tr>
									<td>{row.reviewerName ?? row.reviewerSlackId ?? row.reviewerId}</td>
									<td>{row.total}</td>
									<td>{row.approved}</td>
									<td>{row.changesNeeded}</td>
									<td>{row.banned}</td>
									<td>{row.rejected}</td>
									<td>{row.returned}</td>
									<td>{row.approvalPercent}%</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		{/if}
	</main>
</div>

{#if claimsDrawerOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="drawer-backdrop" onclick={() => claimsDrawerOpen = false}></div>
	<aside class="claims-drawer">
		<div class="claims-drawer-header">
			<h2>My Claimed Projects</h2>
			<button class="claims-drawer-close" onclick={() => claimsDrawerOpen = false}>✕</button>
		</div>
		{#if myClaimsLoading && myClaims.length === 0}
			<p class="claims-drawer-empty">Loading…</p>
		{:else if myClaims.length === 0}
			<p class="claims-drawer-empty">You haven't claimed any projects yet.</p>
		{:else}
			<ul class="claims-drawer-list">
				{#each myClaims as claim}
					<li class="claims-drawer-item">
						<div class="claims-drawer-item-top">
							<span class="claims-drawer-name">{claim.name}</span>
							<span class="badge badge-{claim.status} badge-sm">{claim.status}</span>
						</div>
						<div class="claims-drawer-item-meta">
							<span class="claims-drawer-type">{claim.projectType}</span>
							<span class="claims-drawer-expires"
								class:claims-drawer-expires--soon={new Date(claim.expiresAt).getTime() - Date.now() < 2 * 3_600_000}>
								Expires {formatTimeRemaining(claim.expiresAt)}
							</span>
						</div>
						<div class="claims-drawer-item-actions">
							<button class="claims-drawer-go"
								onclick={() => { claimsDrawerOpen = false; selectProject(claim.id); }}>
								Go to project →
							</button>
							<button class="claims-drawer-release"
								onclick={() => releaseProjectClaim(claim.id)}>
								Release
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
		<div class="claims-drawer-footer">
			<p class="claims-drawer-hint">Claims expire after 24 hours of inactivity.</p>
		</div>
	</aside>
{/if}

<svelte:window onkeydown={onDevlogLightboxKey} />

{#if devlogLightbox}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="devlog-lightbox" onclick={closeDevlogLightbox} role="dialog" aria-modal="true" aria-label="Devlog image">
		<img src={devlogLightbox} alt="Devlog attachment full size" onclick={(e) => e.stopPropagation()} />
		<button type="button" class="devlog-lightbox-close" onclick={closeDevlogLightbox} aria-label="Close">&times;</button>
	</div>
{/if}

{#if grantModalOrder}
	<CardGrantModal
		order={grantModalOrder}
		onClose={() => (grantModalOrder = null)}
		onGranted={() => { grantModalOrder = null; onGrantIssued(); }}
	/>
{/if}

{#if buyersModalItem}
	<ItemBuyersModal item={buyersModalItem} onClose={() => (buyersModalItem = null)} />
{/if}

{#if siloGrantModalOrder}
	<SiloGrantModal
		order={siloGrantModalOrder}
		onClose={() => (siloGrantModalOrder = null)}
		onGranted={() => { onSiloGrantIssued(); }}
	/>
{/if}

<style>
	.admin-shell {
		min-height: 100vh;
		background: #1a1a1a;
		color: #e0e0e0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		font-size: 13px;
	}

	.admin-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.6rem 1.5rem;
		background: #111;
		border-bottom: 1px solid #333;
	}

	.admin-header h1 {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0;
	}

	.admin-user {
		font-size: 0.85rem;
		color: #888;
	}

	.admin-tabs {
		display: flex;
		gap: 0;
		background: #111;
		border-bottom: 1px solid #333;
		padding: 0 2rem;
	}

	.tab {
		padding: 0.4rem 0.75rem;
		background: none;
		border: none;
		color: #888;
		cursor: pointer;
		font-size: 0.9rem;
		border-bottom: 2px solid transparent;
		transition: color 0.15s, border-color 0.15s;
	}

	.tab:hover { color: #ccc; }
	.tab.active { color: #fff; border-bottom-color: #5b9bd5; }

	.tab-home {
		margin-left: auto;
		text-decoration: none;
	}

	.admin-content {
		padding: 1rem 1.5rem;
	}

	.users-layout {
		display: flex;
		gap: 1.5rem;
	}

	.users-table-wrap {
		flex: 1;
		min-width: 0;
		overflow-x: auto;
	}

	.stat-cards {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.stats-section {
		display: flex;
		flex-direction: column;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.golden-backfill {
		margin-top: 1.5rem;
		padding: 1rem 1.25rem;
		border: 1px solid rgba(212, 160, 23, 0.4);
		border-radius: 10px;
		background: rgba(212, 160, 23, 0.06);
	}
	.golden-backfill-danger {
		border-color: rgba(224, 102, 102, 0.5);
		background: rgba(224, 102, 102, 0.08);
	}
	.golden-backfill-danger .golden-backfill-btn {
		background: #e06666;
		color: #1a0000;
	}
	.golden-backfill-copy h3 {
		margin: 0 0 0.25rem;
		font-size: 1rem;
	}
	.golden-backfill-copy p {
		margin: 0 0 0.75rem;
		font-size: 0.85rem;
		opacity: 0.75;
		max-width: 60ch;
	}
	.golden-backfill-btn {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 8px;
		background: #d4a017;
		color: #1a1200;
		font-weight: 600;
		cursor: pointer;
	}
	.golden-backfill-btn:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.golden-backfill-result {
		margin: 0.75rem 0 0;
		font-size: 0.85rem;
		color: #d4a017;
	}
	.golden-backfill-error {
		margin: 0.75rem 0 0;
		font-size: 0.85rem;
		color: #e06666;
	}

	.stats-grid :global(.dau-card),
	.stats-grid :global(.signups-card) {
		margin-bottom: 0;
	}

	.stat-card {
		display: flex;
		flex-direction: column;
		padding: 1rem 1.5rem;
		background: #1e1e1e;
		border: 2px solid #444;
		border-radius: 8px;
		min-width: 140px;
	}

	.stat-value {
		font-size: 1.75rem;
		font-weight: 700;
		color: #e0e0e0;
		line-height: 1;
	}

	.stat-label {
		font-size: 0.8rem;
		color: #888;
		margin-top: 0.25rem;
	}

	.stat-sub {
		color: #666;
	}

	.users-toolbar {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.users-search {
		flex: 1;
		background: #1e1e1e;
		border: 2px solid #666;
		border-radius: 6px;
		color: #e0e0e0;
		padding: 0.5rem 0.75rem;
		font-size: 0.85rem;
		font-family: inherit;
	}

	.users-search:focus {
		outline: none;
		border-color: #5b9bd5;
	}

	.users-pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		margin-top: 0.75rem;
	}

	.page-btn {
		background: #1e1e1e;
		border: 1px solid #444;
		border-radius: 6px;
		color: #e0e0e0;
		padding: 0.4rem 0.9rem;
		font-size: 0.82rem;
		font-family: inherit;
		cursor: pointer;
	}

	.page-btn:hover:not(:disabled) {
		border-color: #5b9bd5;
	}

	.page-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.page-info {
		font-size: 0.8rem;
		color: #999;
		font-variant-numeric: tabular-nums;
	}

	.users-perms-filter {
		background: #1a1a1a;
		border: 1px solid #444;
		border-radius: 6px;
		color: #e0e0e0;
		padding: 0.5rem 0.75rem;
		font-size: 0.85rem;
		font-family: inherit;
		cursor: pointer;
	}

	.users-perms-filter:focus {
		outline: none;
		border-color: #5b9bd5;
	}

	.type-filter-select {
		background: #1e1e1e;
		border: 2px solid #666;
		border-radius: 6px;
		color: #e0e0e0;
		padding: 0.5rem 0.75rem;
		font-size: 0.85rem;
		font-family: inherit;
		cursor: pointer;
	}

	.type-filter-select:focus {
		outline: none;
		border-color: #5b9bd5;
	}

	.users-layout.has-detail .users-table-wrap {
		flex: 0 0 45%;
	}

	.users-table, .mini-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}

	.users-table th, .users-table td,
	.mini-table th, .mini-table td {
		padding: 0.5rem 0.75rem;
		text-align: left;
		border-bottom: 1px solid #2a2a2a;
	}

	.users-table th, .mini-table th {
		color: #888;
		font-weight: 500;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.users-table tbody tr {
		cursor: pointer;
		transition: background 0.1s;
	}

	.users-table tbody tr:hover { background: #252525; }
	.users-table tbody tr.selected { background: #1e2a3a; }

	.mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.8rem; }

	.slack-link {
		color: #5b9bd5;
		text-decoration: none;
	}

	.slack-link:hover {
		text-decoration: underline;
	}

	.detail-panel {
		flex: 0 0 50%;
		background: #222;
		border: 1px solid #333;
		border-radius: 8px;
		overflow-y: auto;
		max-height: calc(100vh - 160px);
	}

	.detail-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid #333;
		position: sticky;
		top: 0;
		background: #222;
	}

	.detail-header h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.close-btn {
		background: none;
		border: none;
		color: #888;
		font-size: 1.5rem;
		cursor: pointer;
		padding: 0 0.25rem;
		line-height: 1;
	}

	.close-btn:hover { color: #fff; }

	.detail-sections {
		padding: 1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.scrollable-table {
		max-height: 300px;
		overflow-y: auto;
	}

	.scrollable-table thead {
		position: sticky;
		top: 0;
		background: #222;
		z-index: 1;
	}

	.detail-section h3 {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #888;
		margin: 0 0 0.75rem 0;
	}

	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.35rem 1rem;
		margin: 0;
		font-size: 0.85rem;
	}

	dt { color: #888; }
	dd { margin: 0; }

	.badge {
		display: inline-block;
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 500;
		background: #2a3a2a;
		color: #8bc48b;
	}

	.badge.banned { background: #3a2020; color: #e05555; }
	.badge-approved { background: #1e2a3a; color: #5b9bd5; }
	.badge-unreviewed { background: #3a3520; color: #d5b85b; }
	.badge-changes_needed { background: #3a2520; color: #d58b5b; }
	.badge-rejected { background: #3a1a1a; color: #e05555; }
	.badge-unshipped { background: #2a2a2a; color: #888; }

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.btn {
		padding: 0.5rem 1rem;
		border: 1px solid #444;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 500;
		transition: background 0.15s, border-color 0.15s;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}



	.btn-promote {
		background: #1e2a3a;
		color: #5b9bd5;
		border-color: #2a3a5a;
	}

	.btn-promote:hover:not(:disabled) { background: #253550; }

	.btn-ban {
		background: #2a1515;
		color: #e05555;
		border-color: #4a2020;
	}

	.btn-ban:hover:not(:disabled) { background: #3a1a1a; }

	.btn-impersonate {
		background: #1a1a2a;
		color: #55a0e0;
		border-color: #20204a;
	}
	.btn-impersonate:hover:not(:disabled) { background: #1a1a3a; }

	.pipes-adjust {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.pipes-adjust-row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.pipes-input {
		padding: 0.5rem 0.75rem;
		background: #1a1a1a;
		border: 1px solid #444;
		border-radius: 6px;
		color: #e0e0e0;
		font-size: 0.85rem;
		width: 120px;
	}

	.pipes-input-reason { flex: 1; min-width: 200px; width: auto; }

	.pipes-input:focus { outline: none; border-color: #5b9bd5; }

	.btn-pipes-grant {
		background: #1e2a1e;
		color: #7ac47a;
		border-color: #2a4a2a;
	}
	.btn-pipes-grant:hover:not(:disabled) { background: #253525; }

	.btn-pipes-revoke {
		background: #2a1e1e;
		color: #d58b5b;
		border-color: #4a2a20;
	}
	.btn-pipes-revoke:hover:not(:disabled) { background: #352525; }

	.perms-action { position: relative; }

	.perms-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		margin-top: 0.25rem;
		background: #2a2a2a;
		border: 1px solid #444;
		border-radius: 6px;
		overflow: hidden;
		z-index: 10;
		min-width: 160px;
	}

	.perms-option {
		display: block;
		width: 100%;
		padding: 0.5rem 1rem;
		background: none;
		border: none;
		color: #e0e0e0;
		text-align: left;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.perms-option:hover:not(:disabled) { background: #333; }
	.perms-option.current { color: #5b9bd5; font-weight: 600; }
	.perms-option:disabled { opacity: 0.4; cursor: not-allowed; }

	.loading, .empty, .placeholder {
		color: #888;
		text-align: center;
		padding: 2rem;
	}

	/* News admin styles */
	.news-admin {
		max-width: 900px;
	}

	.events-admin {
		max-width: 900px;
	}

	.news-form {
		background: #222;
		border: 1px solid #333;
		border-radius: 8px;
		padding: 1.25rem;
		margin-bottom: 1.5rem;
	}

	.news-form h3 {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #888;
		margin: 0 0 0.75rem 0;
	}

	.news-form-fields {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 0.5rem;
		align-items: start;
	}

	.event-form-fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
		align-items: start;
	}

	.event-description-input,
	.event-form-actions {
		grid-column: 1 / -1;
	}

	.event-date-row {
		background: #1a1a1a;
		border: 1px solid #444;
		border-radius: 4px;
		padding: 0.35rem 0.5rem;
	}

	.event-date-row label {
		color: #888;
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		white-space: nowrap;
	}

	.event-date-row .news-input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		padding: 0.15rem 0;
	}

	.event-date-row .news-input:focus {
		border-color: transparent;
	}

	.event-form-actions {
		display: flex;
		gap: 0.5rem;
	}

	@media (max-width: 760px) {
		.event-form-fields {
			grid-template-columns: 1fr;
		}
	}

	.news-date-row {
		display: flex;
		gap: 0.35rem;
		align-items: center;
	}

	.btn-now {
		background: #2a2a2a;
		color: #ccc;
		border-color: #444;
		white-space: nowrap;
	}

	.btn-now:hover:not(:disabled) { background: #333; }

	.news-input, .news-edit-input {
		background: #1a1a1a;
		border: 1px solid #444;
		border-radius: 4px;
		color: #e0e0e0;
		padding: 0.5rem;
		font-size: 0.85rem;
		font-family: inherit;
	}

	.news-input:focus, .news-edit-input:focus {
		outline: none;
		border-color: #5b9bd5;
	}

	.news-input-text {
		resize: vertical;
	}

	.news-edit-text {
		width: 100%;
		resize: vertical;
	}

	.news-actions {
		display: flex;
		gap: 0.35rem;
		white-space: nowrap;
	}

	.btn-add-news {
		background: #1e3a1e;
		color: #8bc48b;
		border-color: #2a5a2a;
		align-self: start;
	}

	.btn-add-news:hover:not(:disabled) { background: #255025; }

	.btn-edit {
		background: #1e2a3a;
		color: #5b9bd5;
		border-color: #2a3a5a;
	}

	.btn-edit:hover:not(:disabled) { background: #253550; }

	.btn-delete {
		background: #2a1515;
		color: #e05555;
		border-color: #4a2020;
	}

	.btn-delete:hover:not(:disabled) { background: #3a1a1a; }

	.btn-save {
		background: #1e3a1e;
		color: #8bc48b;
		border-color: #2a5a2a;
	}

	.btn-save:hover:not(:disabled) { background: #255025; }

	.btn-cancel {
		background: #2a2a2a;
		color: #888;
		border-color: #444;
	}

	.btn-cancel:hover:not(:disabled) { background: #333; }

	/* Projects tab */
	.projects-admin {
		max-width: 1600px;
		margin: 0 auto;
	}

	.status-pills {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.pill {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.9rem;
		border-radius: 20px;
		border: 2px solid #777;
		background: #2a2a2a;
		color: #ccc;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s, color 0.15s;
	}

	.pill:hover { background: #383838; color: #eee; }

	.pill.active { color: #fff; }

	.pill-count {
		background: #444;
		padding: 0.1rem 0.45rem;
		border-radius: 10px;
		font-size: 0.7rem;
		font-weight: 600;
		color: #ddd;
	}

	.pill.active .pill-count { background: rgba(255,255,255,0.15); }

	.pill-unshipped { background: #c48382; border-color: #e09a99; color: #fff; }
	.pill-unshipped.active { background: #d4908f; border-color: #f0b0af; }

	.pill-unreviewed { background: #b5a88e; border-color: #cbc1ae; color: #fff; }
	.pill-unreviewed.active { background: #cbc1ae; border-color: #e0d8c8; }

	.pill-changes_needed { background: #d4a55a; border-color: #e6ba70; color: #fff; }
	.pill-changes_needed.active { background: #e0b468; border-color: #f0ca80; }

	.pill-approved { background: #93b4cd; border-color: #aaccdd; color: #fff; }
	.pill-approved.active { background: #a8c6dd; border-color: #c0ddef; }

	.pill-rejected { background: #c25a5a; border-color: #d47070; color: #fff; }
	.pill-rejected.active { background: #d06868; border-color: #e08080; }

	.proj-split {
		display: flex;
		gap: 2px;
		background: #777;
		border: 2px solid #777;
		border-radius: 8px;
		overflow: hidden;
		min-height: 300px;
	}

	.proj-sidebar {
		width: 280px;
		flex-shrink: 0;
		background: #1e1e1e;
	}

	.proj-sidebar-item {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		width: 100%;
		padding: 0.3rem 0.7rem;
		border: none;
		border-bottom: 1px solid #333;
		background: transparent;
		color: #ccc;
		text-align: left;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.8rem;
		transition: background 0.1s;
	}

	.proj-sidebar-item:hover {
		background: #2a2a2a;
	}

	.proj-sidebar-item.active {
		background: transparent;
	}

	.proj-sidebar-item.active .proj-sidebar-name {
		text-decoration: underline;
		text-decoration-color: #5b9bd5;
		text-underline-offset: 3px;
	}

	.proj-sidebar-name {
		font-weight: 600;
		color: #e0e0e0;
		font-size: 0.85rem;
	}

	.proj-sidebar-meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.35rem 0.5rem;
		color: #888;
		font-size: 0.75rem;
	}

	.badge-sm {
		font-size: 0.65rem;
		padding: 0.1rem 0.35rem;
	}

	.marker { display: inline-block; padding: 0.05rem 0.4rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; vertical-align: middle; }
	.marker-watch { background: var(--reject, #e23); color: #fff; }
	.marker-cool { background: var(--approve, #2a7); color: #fff; }
	.marker-gold { background: #d4a017; color: #fff; }
	.marker-gold-author { background: #fdf3d7; color: #a07408; border: 1px solid #d4a017; }
	.gold-star { color: #d4a017; }
	.marker-sm { padding: 0; width: 1.05rem; height: 1.05rem; line-height: 1.05rem; text-align: center; border-radius: 999px; font-size: 0.6rem; margin-left: 0.3rem; }
	.marker-controls { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin-top: 0.5rem; }
	.marker-btn { padding: 0.2rem 0.55rem; border-radius: 6px; border: 1px solid var(--border, #999); background: transparent; color: inherit; cursor: pointer; font-size: 0.8rem; }
	.marker-btn:hover:not(:disabled) { border-color: var(--reject, #e23); }
	.marker-btn.on { background: var(--reject, #e23); border-color: var(--reject, #e23); color: #fff; }
	.marker-btn-cool:hover:not(:disabled) { border-color: var(--approve, #2a7); }
	.marker-btn-cool.on { background: var(--approve, #2a7); border-color: var(--approve, #2a7); color: #fff; }
	.marker-btn:disabled { opacity: 0.5; cursor: default; }
	.marker-err { color: var(--reject, #e23); font-size: 0.78rem; }

	/* ── Project claims + intent (PR #37) ── */
	.claim-badge {
		display: inline-block;
		font-size: 0.6rem;
		font-weight: 600;
		padding: 0.1rem 0.4rem;
		border-radius: 3px;
		background: rgba(251, 191, 36, 0.15);
		color: #d97706;
		border: 1px solid rgba(251, 191, 36, 0.4);
		max-width: 100%;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.claim-badge--mine {
		background: rgba(59, 130, 246, 0.12);
		color: #3b82f6;
		border-color: rgba(59, 130, 246, 0.35);
	}

	.user-intent-badge {
		display: inline-block;
		font-size: 11px;
		padding: 2px 7px;
		border-radius: 10px;
		background: rgba(139, 92, 246, 0.15);
		color: #a78bfa;
		border: 1px solid rgba(139, 92, 246, 0.35);
		font-weight: 600;
	}
	.user-intent-badge--sm {
		font-size: 10px;
		padding: 1px 5px;
	}

	.claims-drawer-btn {
		position: relative;
		padding: 6px 14px;
		border-radius: 6px;
		border: 1px solid #555;
		background: transparent;
		color: #e0e0e0;
		cursor: pointer;
		font-size: 13px;
		font-family: inherit;
	}
	.claims-drawer-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: #a78bfa;
		color: #fff;
		font-size: 11px;
		font-weight: 700;
		margin-left: 6px;
	}
	.drawer-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		z-index: 200;
	}
	.claims-drawer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 380px;
		background: #1a1a1a;
		border-left: 1px solid #333;
		z-index: 201;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
	}
	.claims-drawer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 24px;
		border-bottom: 1px solid #333;
		flex-shrink: 0;
	}
	.claims-drawer-header h2 { font-size: 16px; font-weight: 700; margin: 0; }
	.claims-drawer-close {
		background: none;
		border: none;
		color: #888;
		cursor: pointer;
		font-size: 18px;
		line-height: 1;
	}
	.claims-drawer-list { list-style: none; padding: 0; margin: 0; }
	.claims-drawer-item {
		padding: 16px 24px;
		border-bottom: 1px solid #2a2a2a;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.claims-drawer-item-top { display: flex; align-items: center; gap: 8px; }
	.claims-drawer-name {
		font-weight: 600;
		font-size: 14px;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.claims-drawer-item-meta {
		display: flex;
		justify-content: space-between;
		font-size: 12px;
		color: #888;
	}
	.claims-drawer-expires--soon { color: #f59e0b !important; }
	.claims-drawer-item-actions { display: flex; gap: 8px; }
	.claims-drawer-go {
		flex: 1;
		padding: 7px 12px;
		border-radius: 5px;
		border: 1px solid #555;
		background: transparent;
		color: #e0e0e0;
		cursor: pointer;
		font-size: 12px;
		font-family: inherit;
	}
	.claims-drawer-go:hover { border-color: #a78bfa; color: #a78bfa; }
	.claims-drawer-release {
		padding: 7px 12px;
		border-radius: 5px;
		border: 1px solid #555;
		background: transparent;
		color: #888;
		cursor: pointer;
		font-size: 12px;
		font-family: inherit;
	}
	.claims-drawer-release:hover { border-color: #ef4444; color: #ef4444; }
	.claims-drawer-footer { padding: 16px 24px; margin-top: auto; }
	.claims-drawer-hint { font-size: 12px; color: #555; margin: 0; }
	.claims-drawer-empty { padding: 32px 24px; color: #666; text-align: center; }

	.proj-claim-bar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 0;
		border-top: 1px solid #2a2a2a;
		margin-top: 8px;
	}
	.claim-status { font-size: 13px; flex: 1; }
	.claim-status--mine { color: #3b82f6; }
	.claim-status--other { color: #f59e0b; }
	.claim-status--free { color: #666; }
	.btn-claim {
		padding: 7px 16px;
		border-radius: 6px;
		border: 1px solid #a78bfa;
		background: rgba(139, 92, 246, 0.15);
		color: #a78bfa;
		cursor: pointer;
		font-size: 13px;
		font-weight: 600;
		font-family: inherit;
	}
	.btn-claim:hover { background: rgba(139, 92, 246, 0.3); }
	.btn-claim--override {
		border-color: #f59e0b;
		background: rgba(245, 158, 11, 0.1);
		color: #f59e0b;
	}
	.btn-release-claim {
		padding: 7px 16px;
		border-radius: 6px;
		border: 1px solid #555;
		background: transparent;
		color: #888;
		cursor: pointer;
		font-size: 13px;
		font-family: inherit;
	}
	.btn-release-claim:hover { border-color: #ef4444; color: #ef4444; }

	.ht-pill {
		display: inline-block;
		margin-left: 0.35rem;
		font-size: 0.6rem;
		font-weight: 700;
		padding: 0.05rem 0.3rem;
		border-radius: 3px;
		background: rgba(91, 155, 213, 0.2);
		color: #5b9bd5;
		border: 1px solid rgba(91, 155, 213, 0.5);
		vertical-align: middle;
	}

	.admin-shell.light .ht-pill {
		background: rgba(42, 102, 153, 0.12);
		color: #2a6699;
		border-color: rgba(42, 102, 153, 0.4);
	}

	.proj-main {
		flex: 1;
		min-width: 0;
		background: #252525;
		padding: 0.85rem 1.1rem;
	}

	.proj-main-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #666;
		font-size: 0.9rem;
	}

	.proj-main-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.joe-link-wrap {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: auto;
	}

	.joe-link-btn {
		display: inline-flex;
		align-items: center;
		padding: 0.25rem 0.6rem;
		font-size: 0.8rem;
		font-weight: 600;
		border-radius: 6px;
		background: #7c3aed;
		color: #fff;
		text-decoration: none;
		white-space: nowrap;
	}

	.joe-link-btn:hover {
		background: #6d28d9;
	}

	.joe-link-btn--alt {
		background: #0d9488;
	}

	.joe-link-btn--alt:hover {
		background: #0f766e;
	}

	.joe-link-btn--disabled {
		background: #3a3a3a;
		color: #888;
		cursor: not-allowed;
	}

	.joe-link-note {
		font-size: 0.7rem;
		color: #9ca3af;
		font-style: italic;
		white-space: nowrap;
	}

	.proj-main-title {
		margin: 0;
		font-size: 1.2rem;
		color: #fff;
	}

	.proj-main-desc {
		color: #bbb;
		font-size: 0.85rem;
		line-height: 1.5;
		margin: 0 0 1rem;
	}

	.proj-main-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		font-size: 0.8rem;
		color: #999;
		margin-bottom: 1rem;
	}

	.proj-main-meta strong {
		color: #e0e0e0;
	}

	.proj-top-row {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
	}

	.proj-top-info {
		flex: 1;
		min-width: 0;
	}

	.proj-screenshots {
		flex-shrink: 0;
	}

	.proj-screenshot-viewer {
		position: relative;
		display: inline-block;
	}

	.proj-screenshot {
		max-width: 320px;
		max-height: 220px;
		border: 2px solid #555;
		border-radius: 6px;
		object-fit: cover;
		display: block;
	}

	.proj-screen-arrow {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		background: rgba(0, 0, 0, 0.55);
		border: none;
		color: #eee;
		font-size: 20px;
		width: 26px;
		height: 34px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		opacity: 0;
		transition: opacity 150ms;
	}

	.proj-screenshot-viewer:hover .proj-screen-arrow {
		opacity: 1;
	}

	.proj-screen-arrow:disabled {
		opacity: 0 !important;
		cursor: default;
	}

	.proj-screen-arrow-left {
		left: 0;
		border-radius: 0 4px 4px 0;
	}

	.proj-screen-arrow-right {
		right: 0;
		border-radius: 4px 0 0 4px;
	}

	.proj-screen-dots {
		position: absolute;
		bottom: 8px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 5px;
	}

	.proj-screen-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.35);
	}

	.proj-screen-dot.active {
		background: #fff;
	}

	.proj-info-row {
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
		font-size: 0.85rem;
		margin-bottom: 0.4rem;
	}

	.proj-info-label {
		color: #999;
		flex-shrink: 0;
	}

	.proj-info-value {
		color: #e0e0e0;
	}

	.proj-divider {
		border: none;
		border-top: 2px solid #666;
		margin: 1rem 0;
	}

	.ht-actions {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.ht-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem 1.5rem;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 600;
		font-family: inherit;
		text-decoration: none;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.ht-btn:hover {
		opacity: 0.85;
	}

	.ht-btn-github {
		background: #7b5ea7;
		color: #fff;
		border: 2px solid #a080d0;
	}

	.ht-btn-demo {
		background: #5b9bd5;
		color: #fff;
		border: 2px solid #8fc4ef;
	}

	.ht-btn-readme {
		background: #4a9a5a;
		color: #fff;
		border: 2px solid #6abf7a;
	}

	.ht-btn-docs {
		background: #fff;
		color: #111;
		border: 2px solid #ddd;
	}

	.ht-btn-audit {
		background: #b5562a;
		color: #fff;
		border: 2px solid #db7a4a;
	}

	.ht-hours {
		display: inline-flex;
		align-items: center;
		padding: 0 0.35rem;
		border-radius: 4px;
		font-size: 0.7rem;
		font-weight: 700;
		background: rgba(219, 122, 74, 0.18);
		color: #db7a4a;
	}

	.audit-embed {
		margin-top: 1rem;
		border: 1px solid #3a3a3a;
		border-radius: 8px;
		overflow: hidden;
	}

	.audit-embed-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		font-size: 0.8rem;
		font-weight: 600;
		background: rgba(181, 86, 42, 0.12);
		color: #db7a4a;
	}

	.audit-embed-close {
		padding: 0.25rem 0.75rem;
		border-radius: 5px;
		border: 1px solid #555;
		background: transparent;
		color: inherit;
		font-family: inherit;
		font-size: 0.75rem;
		cursor: pointer;
	}

	.audit-embed-close:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.audit-embed-error {
		padding: 0.75rem;
		font-size: 0.8rem;
		color: #e06c6c;
	}

	.audit-embed-frame {
		display: block;
		width: 100%;
		border: 0;
		background: #fff;
	}

	.user-feedback-box {
		margin-top: 0.25rem;
	}

	.quick-reject-select-row {
		display: flex;
	}

	.quick-reject-select {
		width: 100%;
		border: 1px solid rgba(255, 255, 255, 0.18);
		background: rgba(255, 255, 255, 0.06);
		color: #e0e0e0;
		border-radius: 8px;
		padding: 0.55rem 0.7rem;
		font: inherit;
		font-size: 0.86rem;
		cursor: pointer;
	}

	.quick-reject-select:focus {
		outline: none;
		border-color: rgba(255, 180, 180, 0.55);
		background: rgba(255, 255, 255, 0.09);
	}

	.quick-reject-select option {
		background: #1e1e1e;
		color: #e0e0e0;
	}

	.admin-shell.light .quick-reject-select {
		background: white;
		color: #333;
		border-color: #e2c5c5;
	}

	.admin-shell.light .quick-reject-select:focus {
		border-color: #c44747;
		background: #fffafa;
	}

	.quick-reject-panel {
		border: 1px solid rgba(184, 48, 48, 0.25);
		background: rgba(184, 48, 48, 0.08);
		border-radius: 8px;
		padding: 0.85rem;
		margin: 1rem 0;
	}

	.quick-reject-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.65rem;
	}

	.quick-reject-title {
		font-weight: 800;
		color: #ffd6d6;
	}

	.quick-reject-hint {
		font-size: 0.78rem;
		color: #aaa;
	}
	.user-feedback-label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.8rem;
		color: #aaa;
	}

	.review-anonymous-toggle {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin: 0.15rem 0 0.8rem;
		color: #cfcfcf;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.review-anonymous-toggle input {
		appearance: none;
		-webkit-appearance: none;
		width: 1rem;
		height: 1rem;
		min-width: 1rem;
		border: 2px solid rgba(230, 244, 254, 0.35);
		border-radius: 3px;
		background: rgba(0, 0, 0, 0.22);
		cursor: pointer;
		position: relative;
		flex-shrink: 0;
	}

	.review-anonymous-toggle input:checked {
		background: #5b9bd5;
		border-color: #5b9bd5;
	}

	.review-anonymous-toggle input:checked::after {
		content: '';
		position: absolute;
		left: 0.26rem;
		top: 0.02rem;
		width: 0.24rem;
		height: 0.5rem;
		border: solid #fff;
		border-width: 0 2px 2px 0;
		transform: rotate(45deg);
	}

	.user-feedback {
		background: #1e1e1e;
		border: 2px solid #777;
		border-radius: 6px;
		color: #e0e0e0;
		padding: 0.5rem 0.75rem;
		font-size: 0.85rem;
		font-family: inherit;
		resize: vertical;
	}

	.user-feedback:focus {
		outline: none;
		border-color: #5b9bd5;
	}

	.hours-adjust {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.5rem;
		margin-top: 0.5rem;
	}

	.hours-adjust-label {
		font-size: 0.8rem;
		color: #aaa;
		white-space: nowrap;
	}

	.hours-adjust-divider {
		color: #555;
		font-size: 1rem;
		margin: 0 0.25rem;
	}

	.hours-btn {
		height: 30px;
		padding: 0 0.85rem;
		border: 2px solid #777;
		border-radius: 6px;
		background: #333;
		color: #e0e0e0;
		font-size: 0.8rem;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.15s;
	}

	.hours-btn:hover {
		background: #444;
	}

	.hours-custom {
		display: flex;
		align-items: center;
		gap: 0;
		margin-left: 0.5rem;
	}

	.hours-tick {
		width: 30px;
		height: 30px;
		border: 2px solid #777;
		background: #333;
		color: #e0e0e0;
		font-size: 1rem;
		font-weight: 700;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: inherit;
	}

	.hours-tick:first-child {
		border-radius: 6px 0 0 6px;
		border-right: none;
	}

	.hours-tick:last-child {
		border-radius: 0 6px 6px 0;
		border-left: none;
	}

	.hours-tick:hover {
		background: #444;
	}

	.hours-input {
		width: 55px;
		height: 30px;
		border: 2px solid #777;
		border-left: none;
		border-right: none;
		background: #1e1e1e;
		color: #e0e0e0;
		font-size: 0.85rem;
		font-family: inherit;
		text-align: center;
		appearance: textfield;
		-moz-appearance: textfield;
	}

	.hours-input::-webkit-inner-spin-button,
	.hours-input::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.hours-input:focus {
		outline: none;
		border-color: #5b9bd5;
	}


	.review-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 1rem;
	}

	.review-btn {
		flex: 1 1 140px;
		min-width: 0;
		padding: 0.75rem 1rem;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 700;
		font-family: inherit;
		cursor: pointer;
		transition: opacity 0.15s;
		color: #fff;
	}

	.review-btn:hover {
		opacity: 0.85;
	}

	.review-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.review-btn-approve {
		background: #4a9a5a;
	}

	.review-btn-reject {
		background: #c44040;
	}

	.review-btn-hard-reject {
		background: #7a1f1f;
		border: 2px solid #c44040;
	}

	.review-btn-reopen {
		background: #3a6a9a;
	}

	.rejected-panel {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 1rem;
		padding: 0.85rem 1rem;
		border: 1px solid #c44040;
		border-radius: 8px;
		background: rgba(196, 64, 64, 0.1);
	}
	.rejected-panel-info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.85rem;
	}
	.rejected-panel .review-btn-reopen {
		flex-shrink: 0;
		padding: 0.5rem 1rem;
	}

	.review-btn-ban {
		background: #1a1a1a;
		border: 2px solid #c44040;
		color: #c44040;
	}

	.leaderboard {
		padding: 0.5rem 0;
	}

	.leaderboard-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.leaderboard-header h2 {
		margin: 0;
		font-size: 1.2rem;
		color: #eee;
	}

	.leaderboard-windows {
		display: flex;
		gap: 0.5rem;
	}

	.leaderboard-table {
		width: 100%;
		border-collapse: collapse;
		background: #1e1e1e;
		border: 1px solid #444;
		border-radius: 6px;
		overflow: hidden;
	}

	.leaderboard-table th,
	.leaderboard-table td {
		padding: 0.6rem 0.9rem;
		text-align: left;
		border-bottom: 1px solid #333;
		color: #ddd;
		font-size: 0.9rem;
	}

	.leaderboard-table th {
		background: #252525;
		font-weight: 600;
		color: #ccc;
		text-transform: uppercase;
		font-size: 0.75rem;
		letter-spacing: 0.04em;
	}

	.leaderboard-table tbody tr:last-child td {
		border-bottom: none;
	}

	.leaderboard-table tbody tr:hover {
		background: #252525;
	}

	.reviews-heading {
		margin: 0 0 0.5rem;
		font-size: 0.9rem;
		color: #ccc;
	}

	.review-card {
		border: 1px solid #444;
		border-radius: 6px;
		padding: 0.6rem 0.8rem;
		margin-bottom: 0.5rem;
		background: #1e1e1e;
	}

	.review-card-approved { border-left: 3px solid #4a9a5a; }
	.review-card-changes_needed { border-left: 3px solid #c44040; }

	.review-card-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.35rem;
		font-size: 0.75rem;
	}

	.review-card-reviewer {
		color: #ccc;
		font-weight: 600;
	}

	.review-card-anonymous {
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #8ec0ec;
		background: rgba(91, 155, 213, 0.12);
		border: 1px solid rgba(91, 155, 213, 0.35);
		border-radius: 999px;
		padding: 0.08rem 0.4rem;
	}

	.review-card-date {
		color: #777;
		margin-left: auto;
	}

	.review-card-section {
		margin-top: 0.3rem;
	}

	.review-card-label {
		font-size: 0.7rem;
		color: #888;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.review-card-text {
		margin: 0.15rem 0 0;
		font-size: 0.8rem;
		color: #ccc;
		white-space: pre-wrap;
		line-height: 1.4;
	}

	.review-card-internal {
		background: rgba(212, 165, 90, 0.08);
		border-radius: 4px;
		padding: 0.3rem 0.5rem;
		margin-top: 0.35rem;
	}

	.devlogs-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.devlog-card {
		border: 1px solid #444;
		border-left: 3px solid #93b4cd;
		border-radius: 6px;
		padding: 0.55rem 0.8rem;
		background: #1e1e1e;
	}

	.devlog-card-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.3rem;
		font-size: 0.75rem;
	}

	.devlog-card-author {
		color: #ccc;
		font-weight: 600;
	}

	.devlog-card-date {
		color: #777;
		margin-left: auto;
	}

	.devlog-review-bar {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-top: 0.6rem;
		padding-top: 0.6rem;
		border-top: 1px dashed rgba(255, 255, 255, 0.12);
	}
	.devlog-hours-field {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.8rem;
		color: #aaa;
	}
	.devlog-hours-input {
		width: 5rem;
		padding: 0.2rem 0.4rem;
		border: 1px solid #555;
		border-radius: 4px;
		background: #1e1e1e;
		color: inherit;
		font: inherit;
	}
	.devlog-hours-suggest {
		border: 1px solid #4a6;
		background: transparent;
		color: #6c9;
		border-radius: 4px;
		padding: 0.2rem 0.5rem;
		font-size: 0.75rem;
		cursor: pointer;
	}
	.devlog-approve,
	.devlog-unapprove {
		border-radius: 4px;
		padding: 0.25rem 0.7rem;
		font-size: 0.8rem;
		font-weight: 700;
		cursor: pointer;
		border: 1px solid;
	}
	.devlog-approve {
		background: #2a7;
		border-color: #2a7;
		color: #fff;
	}
	.devlog-unapprove {
		background: transparent;
		border-color: #888;
		color: #ccc;
	}
	.devlog-approve:disabled,
	.devlog-unapprove:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.devlog-approved-tag {
		font-size: 0.8rem;
		font-weight: 700;
		color: #5a9e6f;
	}
	.devlog-approved-total {
		font-size: 0.8rem;
		font-weight: 600;
		color: #5a9e6f;
	}

	.devlog-card-title {
		margin: 0 0 4px;
		font-size: 0.95rem;
		color: #e6f4fe;
		font-weight: 600;
		line-height: 1.3;
	}

	.devlog-card-text {
		margin: 0;
		font-size: 0.82rem;
		color: #ddd;
		white-space: pre-wrap;
		line-height: 1.45;
	}

	.devlog-card-images {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.5rem;
	}

	.devlog-card-lookout {
		margin-top: 0.5rem;
		font-size: 0.8rem;
		color: #ddd;
	}
	.devlog-lookout-status {
		text-transform: capitalize;
	}
	.devlog-lookout-tracked,
	.devlog-lookout-pending {
		opacity: 0.65;
	}
	.devlog-card-lookout video {
		display: block;
		width: 100%;
		max-height: 360px;
		margin-top: 0.35rem;
		background: #000;
		border-radius: 4px;
	}

	.devlog-card-image-btn {
		padding: 0;
		border: 0;
		background: transparent;
		cursor: zoom-in;
		line-height: 0;
	}

	.devlog-card-images img {
		width: 90px;
		height: 90px;
		object-fit: cover;
		border-radius: 4px;
		border: 1px solid #333;
		display: block;
		transition: transform 0.15s ease;
	}

	.devlog-card-image-btn:hover img {
		transform: scale(1.04);
	}

	.devlog-lightbox {
		position: fixed;
		inset: 0;
		z-index: 9999;
		background: rgba(10, 10, 10, 0.9);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 32px;
		cursor: zoom-out;
		backdrop-filter: blur(4px);
	}

	.devlog-lightbox img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		border-radius: 4px;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7);
		cursor: default;
	}

	.devlog-lightbox-close {
		position: absolute;
		top: 18px;
		right: 22px;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: 0;
		background: rgba(0, 0, 0, 0.6);
		color: #fff;
		font-size: 26px;
		line-height: 38px;
		text-align: center;
		cursor: pointer;
		padding: 0;
	}

	.devlog-lightbox-close:hover {
		background: rgba(0, 0, 0, 0.85);
	}

	.review-card-internal .review-card-label {
		color: #d4a55a;
	}

	.ht-detail {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.ht-total-note {
		font-size: 0.78rem;
		font-weight: 400;
		opacity: 0.7;
		margin-left: 0.35rem;
	}
	.ht-lookout-line {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px dashed rgba(255, 255, 255, 0.15);
	}
	.ht-lookout-label {
		font-size: 0.85rem;
		opacity: 0.85;
	}
	.ht-lookout-hours {
		font-weight: 700;
		color: #5a9e6f;
	}
	.lookout-review-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.lookout-review-head-right {
		display:flex;
		align-items:center;
		gap: 0.6rem;
	}
	.lookout-review-total {
		font-size: 0.85rem;
		font-weight: 700;
		color: #5a9e6f;
	}
	.lookout-review-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 0.75rem;
		margin-top: 0.5rem;
	}
	.lookout-review-card {
		border-radius: 8px;
		overflow: hidden;
		background: rgba(0, 0, 0, 0.15);
	}
	.lookout-review-card.pending {
		opacity: 0.6;
	}
	.lookout-review-card video,
	.lookout-review-card img {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		display: block;
	}
	.lookout-review-novid {
		display: grid;
		place-items: center;
		aspect-ratio: 16 / 9;
		font-size: 0.8rem;
		opacity: 0.5;
	}
	.lookout-review-meta {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.5rem;
	}
	.lookout-review-name {
		font-weight: 700;
		font-size: 0.85rem;
	}
	.lookout-review-sub {
		font-size: 0.75rem;
		opacity: 0.7;
	}

	.ht-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1.5rem;
		font-size: 0.85rem;
		color: #ccc;
	}

	.ht-trust strong {
		font-weight: 600;
	}

	.trust-green { color: #4caf50; }
	.trust-blue { color: #5b9bd5; }
	.trust-yellow { color: #ffc107; }
	.trust-red { color: #f44336; }
	.trust-unknown { color: #888; }

	.ht-total {
		color: #5b9bd5;
		font-weight: 600;
	}

	.ht-delta {
		color: #c48382;
		font-weight: 600;
		font-size: 0.85rem;
	}

	.ht-earliest {
		color: #b8a970;
		font-weight: 600;
		font-size: 0.85rem;
	}

	.ht-projects {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.ht-project {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: #2a2a2a;
		border: 2px solid #666;
		border-radius: 4px;
		padding: 0.35rem 0.6rem;
		font-size: 0.8rem;
		color: #ddd;
	}

	.ht-breakdown-panel {
		margin: 1rem 0;
		--surface: #181818;
		--border: #3f3f3f;
		--shadow-soft: none;
		--muted: #aaa;
		--surface-border: #2a2a2a;
	}

	.ht-project-name {
		font-weight: 600;
		color: #e0e0e0;
	}

	.ht-project-hours {
		color: #5b9bd5;
	}

	.ht-project-langs {
		color: #888;
		font-size: 0.75rem;
	}

	.ht-loading {
		color: #888;
		font-size: 0.85rem;
	}

	.ht-empty {
		color: #666;
		font-size: 0.85rem;
		font-style: italic;
	}

	.ht-categories {
		margin-top: 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.ht-categories-header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.ht-categories-label {
		font-size: 0.8rem;
		color: #aaa;
		font-weight: 600;
	}

	.ht-ai-pill {
		background: rgba(91, 155, 213, 0.15);
		border: 1px solid #5b9bd5;
		border-radius: 999px;
		padding: 0.1rem 0.55rem;
		font-size: 0.75rem;
		color: #8ec0ec;
		font-weight: 600;
	}

	.ht-ai-pill.warn {
		background: rgba(220, 170, 50, 0.18);
		border-color: #d4a64a;
		color: #f0c46a;
	}

	.ht-ai-pill.flag {
		background: rgba(220, 50, 50, 0.18);
		border-color: #c44040;
		color: #f44336;
	}

	.ht-category-bars {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.ht-category {
		display: grid;
		grid-template-columns: 9rem 1fr 3rem;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: #ccc;
	}

	.ht-category-name {
		color: #ccc;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ht-category.ai .ht-category-name {
		color: #8ec0ec;
		font-weight: 600;
	}

	.ht-category-bar {
		background: #1f1f1f;
		border: 1px solid #444;
		border-radius: 3px;
		height: 0.55rem;
		overflow: hidden;
	}

	.ht-category-fill {
		height: 100%;
		background: #5b9bd5;
	}

	.ht-category.ai .ht-category-fill {
		background: #8ec0ec;
	}

	.ht-category-pct {
		text-align: right;
		color: #aaa;
		font-variant-numeric: tabular-nums;
	}

	.unified-duplicate-alert {
		background: rgba(220, 50, 50, 0.15);
		border: 2px solid #c44040;
		border-radius: 6px;
		color: #f44336;
		font-weight: 700;
		font-size: 0.85rem;
		padding: 0.5rem 0.75rem;
		margin-bottom: 0.5rem;
	}

	.ht-ownership-alert {
		background: rgba(220, 50, 50, 0.12);
		border: 2px solid #c44040;
		border-radius: 6px;
		color: #f6a0a0;
		font-size: 0.85rem;
		padding: 0.6rem 0.75rem;
		margin-bottom: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.ht-ownership-alert strong { color: #ff6b6b; }
	.ht-ownership-meta {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 0.2rem 0.75rem;
		font-size: 0.78rem;
		color: #e0c8c8;
		margin-top: 0.25rem;
	}
	.ht-ownership-meta code {
		background: rgba(0, 0, 0, 0.25);
		padding: 0.05rem 0.25rem;
		border-radius: 3px;
	}
	.admin-shell.light .ht-ownership-alert { background: rgba(220, 50, 50, 0.08); color: #8a2020; }
	.admin-shell.light .ht-ownership-alert strong { color: #c02020; }
	.admin-shell.light .ht-ownership-meta { color: #6a2020; }
	.admin-shell.light .ht-ownership-meta code { background: rgba(0, 0, 0, 0.06); }

	.unified-error-alert {
		background: rgba(212, 165, 90, 0.15);
		border: 2px solid #d4a55a;
		border-radius: 6px;
		color: #d4a55a;
		font-weight: 700;
		font-size: 0.85rem;
		padding: 0.5rem 0.75rem;
		margin-bottom: 0.5rem;
	}

	.ht-justification-label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.8rem;
		color: #aaa;
		margin-top: 0.25rem;
	}

	.ht-justification {
		background: #1e1e1e;
		border: 2px solid #777;
		border-radius: 6px;
		color: #e0e0e0;
		padding: 0.5rem 0.75rem;
		font-size: 0.85rem;
		font-family: inherit;
		resize: vertical;
	}

	.ht-justification:focus {
		outline: none;
		border-color: #5b9bd5;
	}

	.ht-justification-counter {
		display: inline-block;
		margin-left: 0.5rem;
		padding: 0.1rem 0.5rem;
		font-size: 0.75rem;
		font-weight: 700;
		border-radius: 4px;
		background: rgba(212, 90, 90, 0.18);
		color: #e08080;
	}
	.ht-justification-counter.ok {
		background: rgba(90, 180, 110, 0.18);
		color: #6fc285;
	}

	.hours-reship-note {
		background: rgba(60, 130, 200, 0.12);
		border: 1px solid #3b7bb5;
		border-radius: 6px;
		color: #b8d4ee;
		padding: 0.5rem 0.75rem;
		font-size: 0.8rem;
		margin: 0.5rem 0;
	}

	/* ── Shop Admin ── */
	.shop-admin {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.shop-form {
		background: #2a2a2a;
		border: 2px solid #555;
		border-radius: 8px;
		padding: 1.25rem;
	}

	.shop-form h3 {
		margin: 0 0 1rem;
		color: #e0e0e0;
		font-size: 1rem;
	}

	.shop-form-grid {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.shop-input {
		background: #1e1e1e;
		border: 2px solid #555;
		border-radius: 4px;
		color: #e0e0e0;
		padding: 0.4rem 0.6rem;
		font-size: 0.85rem;
		font-family: inherit;
		width: 100%;
		box-sizing: border-box;
	}

	.shop-input:focus {
		outline: none;
		border-color: #5b9bd5;
	}

	.shop-textarea {
		resize: vertical;
	}

	.shop-input-sm {
		max-width: 140px;
	}

	.shop-form-row {
		display: flex;
		align-items: flex-end;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.shop-field {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.8rem;
		color: #aaa;
	}

	.shop-checkbox {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.85rem;
		color: #ccc;
		cursor: pointer;
	}

	.shop-checkbox input[type="checkbox"] {
		appearance: none;
		-webkit-appearance: none;
		width: 1rem;
		height: 1rem;
		min-width: 1rem;
		border: 2px solid rgba(230, 244, 254, 0.35);
		border-radius: 3px;
		background: rgba(0, 0, 0, 0.22);
		cursor: pointer;
		position: relative;
		flex-shrink: 0;
	}

	.shop-checkbox input[type="checkbox"]:checked {
		background: #5b9bd5;
		border-color: #5b9bd5;
	}

	.shop-checkbox input[type="checkbox"]:checked::after {
		content: '';
		position: absolute;
		left: 0.26rem;
		top: 0.02rem;
		width: 0.24rem;
		height: 0.5rem;
		border: solid #fff;
		border-width: 0 2px 2px 0;
		transform: rotate(45deg);
	}

	.btn-add-shop {
		margin-left: auto;
		background: #5b9bd5;
		color: #111;
		font-weight: 600;
	}

	.shop-items-list {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.shop-item-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 0.75rem;
		background: #2a2a2a;
		border: 2px solid #444;
		border-bottom: none;
		transition: background 120ms ease;
		cursor: grab;
	}

	.shop-item-row:last-child {
		border-bottom: 2px solid #444;
		border-radius: 0 0 6px 6px;
	}

	.shop-item-row:first-child {
		border-radius: 6px 6px 0 0;
	}

	.shop-item-row.dragging {
		opacity: 0.4;
	}

	.shop-item-row.drag-over {
		border-top: 3px solid #5b9bd5;
	}

	.shop-item-row.inactive {
		opacity: 0.5;
	}

	.shop-item-drag-handle {
		font-size: 1.1rem;
		color: #666;
		cursor: grab;
		user-select: none;
		flex-shrink: 0;
		padding: 0 4px;
	}

	.shop-item-drag-handle:active {
		cursor: grabbing;
	}

	.shop-item-preview {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
		min-width: 0;
	}

	.shop-item-thumb {
		width: 48px;
		height: 48px;
		object-fit: cover;
		border: 1px solid #555;
		border-radius: 4px;
		flex-shrink: 0;
		background: #1a1a1a;
	}

	.shop-item-info {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
		color: #e0e0e0;
		font-size: 0.85rem;
	}

	.shop-item-info strong {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.shop-item-meta {
		color: #888;
		font-size: 0.75rem;
	}

	.shop-item-actions {
		display: flex;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.shop-item-edit {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.shop-edit-actions {
		display: flex;
		gap: 0.4rem;
		margin-left: auto;
	}

	/* Theme toggle button */
	.theme-toggle {
		background: #333;
		color: #ccc;
		border: 1px solid #555;
		border-radius: 4px;
		padding: 0.3rem 0.7rem;
		font-size: 0.75rem;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.theme-toggle:hover { background: #444; color: #fff; }

	/* ── Light Mode ── */
	.admin-shell.light {
		background: #f5f4f1;
		color: #1a1a1a;
	}

	.admin-shell.light .theme-toggle {
		background: #e8e6e1;
		color: #333;
		border-color: #666;
	}
	.admin-shell.light .theme-toggle:hover { background: #ddd; color: #111; }

	.admin-shell.light .admin-header {
		background: #eae8e3;
		border-bottom-color: #666;
	}

	.admin-shell.light .admin-header h1 { color: #1a1a1a; }
	.admin-shell.light .admin-user { color: #555; }

	.admin-shell.light .admin-tabs {
		background: #eae8e3;
		border-bottom-color: #666;
	}

	.admin-shell.light .tab { color: #666; }
	.admin-shell.light .tab:hover { color: #222; }
	.admin-shell.light .tab.active { color: #1a1a1a; border-bottom-color: #3b7bb5; }

	/* Inputs & selects */
	.admin-shell.light .users-search,
	.admin-shell.light .type-filter-select {
		background: #fff;
		border-color: #555;
		color: #1a1a1a;
	}
	.admin-shell.light .users-search:focus,
	.admin-shell.light .type-filter-select:focus {
		border-color: #3b7bb5;
	}

	.admin-shell.light .users-perms-filter {
		background: #f5f4f1;
		border-color: #555;
		color: #1a1a1a;
	}
	.admin-shell.light .users-perms-filter:focus { border-color: #3b7bb5; }

	.admin-shell.light .page-btn {
		background: #fff;
		border-color: #555;
		color: #1a1a1a;
	}
	.admin-shell.light .page-btn:hover:not(:disabled) { border-color: #3b7bb5; }
	.admin-shell.light .page-info { color: #666; }

	/* Tables */
	.admin-shell.light .users-table th,
	.admin-shell.light .mini-table th {
		color: #555;
	}

	.admin-shell.light .users-table td,
	.admin-shell.light .mini-table td {
		border-bottom-color: #999;
	}

	.admin-shell.light .users-table th,
	.admin-shell.light .mini-table th {
		border-bottom-color: #666;
	}

	.admin-shell.light .users-table tbody tr:hover { background: #eae8e3; }
	.admin-shell.light .users-table tbody tr.selected { background: #d8e6f3; }

	/* Detail panel */
	.admin-shell.light .detail-panel {
		background: #fff;
		border-color: #666;
	}

	.admin-shell.light .detail-header {
		background: #fff;
		border-bottom-color: #666;
	}

	.admin-shell.light .detail-header h2 { color: #1a1a1a; }
	.admin-shell.light .close-btn { color: #777; }
	.admin-shell.light .close-btn:hover { color: #222; }

	.admin-shell.light .detail-section h3 { color: #555; }
	.admin-shell.light dt { color: #555; }
	.admin-shell.light dd { color: #1a1a1a; }

	/* Badges */
	.admin-shell.light .badge { background: #d4edda; color: #2d6a3f; }
	.admin-shell.light .badge.banned { background: #f5d5d5; color: #c02020; }
	.admin-shell.light .badge-approved { background: #d0e4f5; color: #2a6699; }
	.admin-shell.light .badge-unreviewed { background: #f5ecd0; color: #8a7020; }
	.admin-shell.light .badge-changes_needed { background: #f5dcc8; color: #9a5520; }
	.admin-shell.light .badge-unshipped { background: #e8e6e1; color: #555; }

	/* Buttons */
	.admin-shell.light .btn { border-color: #555; }

	.admin-shell.light .btn-promote { background: #d0e4f5; color: #2a6699; border-color: #5588aa; }
	.admin-shell.light .btn-promote:hover:not(:disabled) { background: #bdd8f0; }

	.admin-shell.light .btn-ban { background: #f5d5d5; color: #c02020; border-color: #aa5050; }
	.admin-shell.light .btn-ban:hover:not(:disabled) { background: #f0c0c0; }

	.admin-shell.light .btn-impersonate { background: #d0dff5; color: #2255a0; border-color: #5577aa; }
	.admin-shell.light .btn-impersonate:hover:not(:disabled) { background: #c0d0f0; }

	.admin-shell.light .pipes-input { background: #fff; color: #1a1a1a; border-color: #666; }
	.admin-shell.light .pipes-input:focus { border-color: #3b7bb5; }
	.admin-shell.light .btn-pipes-grant { background: #d5eed5; color: #2a7a2a; border-color: #70a070; }
	.admin-shell.light .btn-pipes-grant:hover:not(:disabled) { background: #c0e0c0; }
	.admin-shell.light .btn-pipes-revoke { background: #f0dbc0; color: #a05a20; border-color: #b08060; }
	.admin-shell.light .btn-pipes-revoke:hover:not(:disabled) { background: #e8cba8; }

	/* Perms dropdown */
	.admin-shell.light .perms-dropdown { background: #fff; border-color: #666; }
	.admin-shell.light .perms-option { color: #1a1a1a; }
	.admin-shell.light .perms-option:hover:not(:disabled) { background: #f0efe8; }
	.admin-shell.light .perms-option.current { color: #3b7bb5; }

	.admin-shell.light .loading,
	.admin-shell.light .empty,
	.admin-shell.light .placeholder { color: #777; }

	/* News */
	.admin-shell.light .news-form { background: #fff; border-color: #666; }
	.admin-shell.light .news-form h3 { color: #555; }
	.admin-shell.light .news-input,
	.admin-shell.light .news-edit-input { background: #f5f4f1; border-color: #555; color: #1a1a1a; }
	.admin-shell.light .news-input:focus,
	.admin-shell.light .news-edit-input:focus { border-color: #3b7bb5; }
	.admin-shell.light .event-date-row { background: #f5f4f1; border-color: #555; }
	.admin-shell.light .event-date-row label { color: #555; }

	.admin-shell.light .btn-now { background: #e8e6e1; color: #333; border-color: #555; }
	.admin-shell.light .btn-now:hover:not(:disabled) { background: #ddd; }
	.admin-shell.light .btn-add-news { background: #d4edda; color: #2d6a3f; border-color: #508850; }
	.admin-shell.light .btn-add-news:hover:not(:disabled) { background: #c0e0c0; }
	.admin-shell.light .btn-edit { background: #d0e4f5; color: #2a6699; border-color: #5588aa; }
	.admin-shell.light .btn-edit:hover:not(:disabled) { background: #bdd8f0; }
	.admin-shell.light .btn-delete { background: #f5d5d5; color: #c02020; border-color: #aa5050; }
	.admin-shell.light .btn-delete:hover:not(:disabled) { background: #f0c0c0; }
	.admin-shell.light .btn-save { background: #d4edda; color: #2d6a3f; border-color: #508850; }
	.admin-shell.light .btn-save:hover:not(:disabled) { background: #c0e0c0; }
	.admin-shell.light .btn-cancel { background: #e8e6e1; color: #555; border-color: #555; }
	.admin-shell.light .btn-cancel:hover:not(:disabled) { background: #ddd; }

	/* Projects tab */
	.admin-shell.light .pill { background: #e8e6e1; border-color: #555; color: #444; }
	.admin-shell.light .pill:hover { background: #ddd; color: #222; }
	.admin-shell.light .pill-count { background: #999; color: #333; }
	.admin-shell.light .pill.active .pill-count { background: rgba(0,0,0,0.2); }

	.admin-shell.light .pill-unshipped { background: #f0c8c7; border-color: #996060; color: #6a2020; }
	.admin-shell.light .pill-unshipped.active { background: #e8b5b4; border-color: #885050; }
	.admin-shell.light .pill-unreviewed { background: #ebe3d0; border-color: #908060; color: #5a4820; }
	.admin-shell.light .pill-unreviewed.active { background: #e0d8c0; border-color: #807050; }
	.admin-shell.light .pill-changes_needed { background: #f5dca0; border-color: #998040; color: #6a4a10; }
	.admin-shell.light .pill-changes_needed.active { background: #f0d490; border-color: #887030; }
	.admin-shell.light .pill-approved { background: #c0d8ee; border-color: #6088aa; color: #1a4a70; }
	.admin-shell.light .pill-approved.active { background: #b0cce8; border-color: #507899; }

	.admin-shell.light .proj-split { background: #666; border-color: #666; }
	.admin-shell.light .proj-sidebar { background: #f5f4f1; }
	.admin-shell.light .proj-sidebar-item { color: #444; border-bottom-color: #999; }
	.admin-shell.light .proj-sidebar-item:hover { background: #eae8e3; }
	.admin-shell.light .proj-sidebar-item.active { background: transparent; }
	.admin-shell.light .proj-sidebar-name { color: #1a1a1a; }
	.admin-shell.light .proj-sidebar-meta { color: #666; }

	.admin-shell.light .proj-main { background: #fff; }
	.admin-shell.light .proj-main-empty { color: #888; }
	.admin-shell.light .proj-main-title { color: #1a1a1a; }
	.admin-shell.light .proj-main-desc { color: #333; }
	.admin-shell.light .proj-main-meta { color: #555; }
	.admin-shell.light .proj-main-meta strong { color: #1a1a1a; }
	.admin-shell.light .joe-link-btn--disabled { background: #e5e7eb; color: #6b7280; }
	.admin-shell.light .joe-link-note { color: #6b7280; }

	.admin-shell.light .proj-divider { border-top-color: #666; }
	.admin-shell.light .proj-screenshot { border-color: #555; }
	.admin-shell.light .proj-info-label { color: #555; }
	.admin-shell.light .proj-info-value { color: #1a1a1a; }

	/* Hackatime detail */
	.admin-shell.light .ht-header { color: #333; }
	.admin-shell.light .ht-breakdown-panel {
		--surface: #f5f4f1;
		--border: #d9d3c8;
		--shadow-soft: none;
		--muted: #666;
		--surface-border: #eae4da;
	}
	.admin-shell.light .ht-total { color: #2a6699; }
	.admin-shell.light .ht-project { background: #f5f4f1; border-color: #555; color: #333; }
	.admin-shell.light .ht-project-name { color: #1a1a1a; }
	.admin-shell.light .ht-project-hours { color: #2a6699; }
	.admin-shell.light .ht-project-langs { color: #666; }
	.admin-shell.light .ht-loading { color: #777; }
	.admin-shell.light .ht-empty { color: #888; }

	/* Feedback / justification textareas */
	.admin-shell.light .user-feedback,
	.admin-shell.light .ht-justification {
		background: #f5f4f1;
		border-color: #555;
		color: #1a1a1a;
	}
	.admin-shell.light .user-feedback:focus,
	.admin-shell.light .ht-justification:focus { border-color: #3b7bb5; }
	.admin-shell.light .user-feedback-label,
	.admin-shell.light .ht-justification-label { color: #555; }

	.admin-shell.light .quick-reject-panel {
		background: #fff1f1;
		border-color: #e7b3b3;
	}

	.admin-shell.light .quick-reject-title {
		color: #8d2020;
	}

	.admin-shell.light .quick-reject-hint {
		color: #666;
	}
	/* Hours adjust */
	.admin-shell.light .hours-adjust-label { color: #555; }
	.admin-shell.light .hours-btn { background: #e8e6e1; border-color: #555; color: #1a1a1a; }
	.admin-shell.light .hours-btn:hover { background: #ddd; }
	.admin-shell.light .hours-tick { background: #e8e6e1; border-color: #555; color: #1a1a1a; }
	.admin-shell.light .hours-tick:hover { background: #ddd; }
	.admin-shell.light .hours-input { background: #fff; border-color: #555; color: #1a1a1a; }
	.admin-shell.light .hours-input:focus { border-color: #3b7bb5; }

	/* Review buttons */
	.admin-shell.light .review-btn-approve { background: #3a8a4a; }
	.admin-shell.light .review-btn-reject { background: #b83030; }
	.admin-shell.light .review-btn-ban { background: #fff; border-color: #b83030; color: #b83030; }

	/* Review cards */
	.admin-shell.light .reviews-heading { color: #333; }
	.admin-shell.light .review-card { background: #f5f4f1; border-color: #666; }
	.admin-shell.light .review-card-reviewer { color: #222; }
	.admin-shell.light .review-card-anonymous {
		color: #2e6c9b;
		background: rgba(91, 155, 213, 0.08);
		border-color: rgba(91, 155, 213, 0.25);
	}
	.admin-shell.light .review-card-date { color: #777; }
	.admin-shell.light .review-anonymous-toggle { color: #333; }
	.admin-shell.light .review-anonymous-toggle input {
		border-color: rgba(60, 60, 60, 0.4);
		background: rgba(0, 0, 0, 0.03);
	}
	.admin-shell.light .review-card-label { color: #666; }
	.admin-shell.light .review-card-text { color: #333; }
	.admin-shell.light .review-card-internal { background: rgba(180, 140, 50, 0.08); }

	/* Alerts */
	.admin-shell.light .unified-duplicate-alert { background: rgba(220, 50, 50, 0.08); }
	.admin-shell.light .unified-error-alert { background: rgba(180, 140, 50, 0.08); }

	/* Shop */
	.admin-shell.light .shop-form { background: #fff; border-color: #666; }
	.admin-shell.light .shop-form h3 { color: #1a1a1a; }
	.admin-shell.light .shop-input { background: #f5f4f1; border-color: #555; color: #1a1a1a; }
	.admin-shell.light .shop-input:focus { border-color: #3b7bb5; }
	.admin-shell.light .shop-checkbox { color: #333; }
	.admin-shell.light .shop-checkbox input[type="checkbox"] {
		border-color: rgba(60, 60, 60, 0.4);
		background: rgba(0, 0, 0, 0.03);
	}
	.admin-shell.light .btn-add-shop { background: #3b7bb5; color: #fff; }
	.admin-shell.light .shop-item-row { background: #fff; border-color: #666; }
	.admin-shell.light .shop-item-row.drag-over { border-top-color: #3b7bb5; }
	.admin-shell.light .shop-item-drag-handle { color: #666; }
	.admin-shell.light .shop-item-thumb { border-color: #555; background: #f5f4f1; }
	.admin-shell.light .shop-item-info { color: #1a1a1a; }
	.admin-shell.light .shop-item-meta { color: #666; }
	.admin-shell.light .shop-field { color: #555; }

	/* Links */
	.admin-shell.light .ht-btn-docs { background: #f5f4f1; color: #1a1a1a; border-color: #555; }

	.admin-shell.light .mono { color: #1a1a1a; }
	.admin-shell.light .slack-link { color: #2a6699; }

	/* ── Fulfillment ─────────────────────────────────── */
	.fulfillment-admin { padding: 0; }

	/* Sub-tabs: Orders | Bulk grants */
	.fulfillment-subtabs {
		display: flex; gap: 0.25rem;
		border-bottom: 1px solid #333;
		margin-bottom: 1rem;
	}
	.fulfillment-subtab {
		display: inline-flex; align-items: center; gap: 0.4rem;
		padding: 0.45rem 0.85rem; background: none; border: none;
		color: #888; cursor: pointer; font-size: 0.88rem;
		border-bottom: 2px solid transparent; margin-bottom: -1px;
		transition: color 0.15s, border-color 0.15s;
	}
	.fulfillment-subtab:hover { color: #ccc; }
	.fulfillment-subtab.active { color: #fff; border-bottom-color: #7c3aed; }
	.subtab-badge {
		background: #7c3aed; color: #fff; font-size: 0.7rem; font-weight: 600;
		border-radius: 999px; padding: 0.02rem 0.42rem; line-height: 1.4;
	}
	.admin-shell.light .fulfillment-subtabs { border-bottom-color: #d9d3c8; }
	.admin-shell.light .fulfillment-subtab { color: #666; }
	.admin-shell.light .fulfillment-subtab:hover { color: #222; }
	.admin-shell.light .fulfillment-subtab.active { color: #1a1a1a; border-bottom-color: #7c3aed; }

	/* Grant cards (bulk card grants) */
	.grant-batch {
		border: 1px solid rgba(124, 58, 237, 0.4);
		background: rgba(124, 58, 237, 0.08);
		border-radius: 8px;
		padding: 0.85rem 1rem;
		margin-bottom: 1rem;
	}
	.grant-batch-head h3 { margin: 0; font-size: 1rem; display: flex; align-items: center; gap: 0.5rem; }
	.grant-batch-count {
		background: #7c3aed; color: #fff; font-size: 0.75rem;
		border-radius: 999px; padding: 0.05rem 0.5rem;
	}
	.grant-batch-sub { margin: 0.25rem 0 0.75rem; font-size: 0.8rem; opacity: 0.75; }
	.grant-batch-list { list-style: none; margin: 0 0 0.75rem; padding: 0; max-height: 220px; overflow-y: auto; }
	.grant-batch-list li {
		display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.75rem;
		padding: 0.3rem 0; border-top: 1px solid rgba(124, 58, 237, 0.18);
		font-size: 0.82rem; align-items: center;
	}
	.grant-batch-list li:first-child { border-top: 0; }
	.grant-batch-user { opacity: 0.75; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.grant-batch-amt { font-variant-numeric: tabular-nums; font-weight: 600; text-align: right; }
	.grant-batch-controls { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
	.grant-batch-toggle { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; cursor: pointer; }
	.grant-batch-preauth { font-size: 0.8rem; opacity: 0.85; }
	.grant-batch-total { font-size: 0.8rem; font-variant-numeric: tabular-nums; margin-left: auto; }
	.grant-batch .cg-hint { opacity: 0.6; font-weight: 400; }
	.grant-batch-results { list-style: none; margin: 0.75rem 0 0; padding: 0; font-size: 0.8rem; }
	.grant-batch-results li.ok { color: #6bd968; }
	.grant-batch-results li.fail { color: #ff6b6b; }

	.fulfillment-toolbar {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.admin-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}

	.admin-table th,
	.admin-table td {
		padding: 0.5rem 0.75rem;
		text-align: left;
		border-bottom: 1px solid rgba(255,255,255,0.08);
	}

	.admin-table th {
		color: #93b4cd;
		font-weight: 600;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.admin-table tbody tr:hover { background: rgba(255,255,255,0.03); }
	.admin-table tbody tr.fulfilled { opacity: 0.55; }

	.status-badge {
		display: inline-block;
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
	}
	.status-pending { background: rgba(196, 131, 130, 0.25); color: #c48382; }
	.status-fulfilled { background: rgba(147, 180, 205, 0.25); color: #93b4cd; }
	.status-cancelled { background: rgba(150, 150, 150, 0.25); color: #9a978f; }

	.fulfillment-actions {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		min-width: 220px;
	}

	.fulfillment-msg-row {
		display: flex;
		gap: 0.25rem;
	}

	.fulfillment-msg-input {
		flex: 1;
		font-size: 0.8rem;
		padding: 0.25rem 0.5rem;
		background: rgba(0,0,0,0.3);
		border: 1px solid rgba(255,255,255,0.15);
		color: inherit;
		border-radius: 3px;
	}

	.fulfillment-msg-input:focus {
		outline: none;
		border-color: #93b4cd;
	}

	.btn-sm {
		font-size: 0.75rem;
		padding: 0.25rem 0.6rem;
	}

	.btn-primary {
		background: rgba(147, 180, 205, 0.3);
		border-color: #93b4cd;
		color: #e6f4fe;
	}
	.btn-primary:hover { background: rgba(147, 180, 205, 0.5); }

	.btn-danger {
		background: rgba(196, 131, 130, 0.25);
		border-color: #c48382;
		color: #f4d6d5;
	}
	.btn-danger:hover:not(:disabled) { background: rgba(196, 131, 130, 0.45); }
	.admin-shell.light .btn-danger { background: #f5d5d5; color: #c02020; border-color: #aa5050; }
	.admin-shell.light .btn-danger:hover:not(:disabled) { background: #f0c0c0; }

	.btn-merge {
		background: rgba(205, 180, 120, 0.22);
		border-color: #cdb478;
		color: #f4ead0;
	}
	.btn-merge:hover:not(:disabled) { background: rgba(205, 180, 120, 0.4); }
	.admin-shell.light .btn-merge { background: #f5ecc8; color: #8a6a1f; border-color: #b89a4a; }
	.admin-shell.light .btn-merge:hover:not(:disabled) { background: #f0e0a8; }

	.btn-grant {
		background: rgba(108, 217, 104, 0.18);
		border-color: #6bd968;
		color: #d6f5d4;
	}
	.btn-grant:hover:not(:disabled) { background: rgba(108, 217, 104, 0.34); }

	.hcb-banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		padding: 0.6rem 0.85rem;
		border-radius: 6px;
		margin-bottom: 0.85rem;
		font-size: 0.85rem;
		border: 1px solid transparent;
	}
	.hcb-banner.hcb-ok { background: rgba(108, 217, 104, 0.12); border-color: rgba(108, 217, 104, 0.4); }
	.hcb-banner.hcb-warn { background: rgba(236, 55, 80, 0.12); border-color: rgba(236, 55, 80, 0.4); }

	/* light mode overrides */
	.admin-shell.light .admin-table th { color: #333; }
	.admin-shell.light .admin-table td { border-color: #ddd; }
	.admin-shell.light .admin-table tbody tr:hover { background: rgba(0,0,0,0.03); }
	.admin-shell.light .fulfillment-msg-input { background: #fff; border-color: #ccc; color: #1a1a1a; }
	.admin-shell.light .status-pending { background: rgba(196, 131, 130, 0.15); }
	.admin-shell.light .status-fulfilled { background: rgba(147, 180, 205, 0.15); }
	.admin-shell.light .status-cancelled { background: rgba(150, 150, 150, 0.15); }

	.order-row { cursor: pointer; }
	.order-row-toggle { display: inline-block; width: 1em; color: #93b4cd; }
	.order-row-open { background: rgba(147, 180, 205, 0.06); }

	.order-detail-row td {
		padding: 1rem 1.25rem;
		background: rgba(0,0,0,0.18);
		border-top: 1px dashed rgba(255,255,255,0.08);
	}

	.order-slack-dm {
		margin-left: 8px;
		padding: 1px 7px;
		border: 1px solid #4a154b;
		border-radius: 4px;
		background: #4a154b;
		color: #fff;
		font-size: 0.8rem;
		text-decoration: none;
		white-space: nowrap;
	}

	.order-slack-dm:hover { background: #4a154b; }
	.order-slack-dm-line { text-decoration: none; }

	.admin-shell.light .order-detail-row td { background: rgba(0,0,0,0.03); border-top-color: rgba(0,0,0,0.08); }

	.order-detail {
		display: grid;
		grid-template-columns: minmax(260px, 1fr) minmax(260px, 1.4fr);
		gap: 1.5rem;
	}

	.order-note-callout {
		border-left: 3px solid #d8a657;
		padding-left: 0.6rem;
	}

	.order-note-text {
		white-space: pre-wrap;
		font-size: 0.9rem;
	}
	
	.order-detail-section { min-width: 0; }
	.order-detail-heading {
		margin: 0 0 0.5rem;
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #93b4cd;
	}
	.order-detail-hint { font-weight: 400; text-transform: none; letter-spacing: 0; color: rgba(255,255,255,0.5); font-size: 0.75rem; margin-left: 0.4rem; }
	.admin-shell.light .order-detail-hint { color: rgba(0,0,0,0.5); }
	.order-detail-empty { color: rgba(255,255,255,0.6); font-size: 0.85rem; margin: 0; }
	.admin-shell.light .order-detail-empty { color: rgba(0,0,0,0.55); }
	.order-detail-loading { color: rgba(255,255,255,0.6); font-size: 0.85rem; }
	.order-detail-error { color: #c48382; font-size: 0.85rem; }

	.address-lines { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.25rem; }
	.address-line {
		display: grid;
		grid-template-columns: 90px 1fr auto;
		gap: 0.5rem;
		align-items: center;
		width: 100%;
		padding: 0.4rem 0.6rem;
		background: rgba(0,0,0,0.25);
		border: 1px solid rgba(255,255,255,0.08);
		border-radius: 4px;
		cursor: pointer;
		color: inherit;
		font: inherit;
		text-align: left;
		transition: background 120ms ease, border-color 120ms ease;
	}
	.address-line:hover { background: rgba(147, 180, 205, 0.12); border-color: rgba(147, 180, 205, 0.4); }
	.address-line.copied { background: rgba(120, 180, 130, 0.18); border-color: rgba(120, 180, 130, 0.6); }
	.address-line-full { font-style: italic; }
	.address-label { font-size: 0.75rem; text-transform: uppercase; color: rgba(255,255,255,0.55); letter-spacing: 0.04em; }
	.admin-shell.light .address-label { color: rgba(0,0,0,0.55); }
	.address-value { font-family: ui-monospace, "Courier New", monospace; font-size: 0.9rem; word-break: break-word; }
	.address-copied { font-size: 0.7rem; color: rgba(255,255,255,0.55); text-transform: uppercase; letter-spacing: 0.05em; }
	.admin-shell.light .address-line { background: #fff; border-color: #ddd; }
	.admin-shell.light .address-line:hover { background: #eef4fa; border-color: #93b4cd; }
	.admin-shell.light .address-copied { color: rgba(0,0,0,0.5); }

	.approved-projects { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.25rem; }
	.approved-projects li {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		padding: 0.35rem 0.55rem;
		background: rgba(0,0,0,0.18);
		border-radius: 4px;
		font-size: 0.85rem;
	}
	.admin-shell.light .approved-projects li { background: rgba(0,0,0,0.03); }
	.approved-project-name { font-weight: 600; }
	.approved-project-type { color: rgba(255,255,255,0.55); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
	.admin-shell.light .approved-project-type { color: rgba(0,0,0,0.55); }
	.approved-project-hours { color: #93b4cd; font-variant-numeric: tabular-nums; }
	.approved-project-date { margin-left: auto; color: rgba(255,255,255,0.5); font-size: 0.75rem; }
	.admin-shell.light .approved-project-date { color: rgba(0,0,0,0.55); }

	.link-btn { background: none; border: none; color: #93b4cd; cursor: pointer; padding: 0; font: inherit; text-decoration: underline; }

	.ht-files {
		margin-top: 1rem;
		padding: 0.9rem 1rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 8px;
		background: rgba(0, 0, 0, 0.14);
	}

	.ht-files-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.ht-files-heading {
		font-size: 0.82rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #93b4cd;
	}

	.ht-files-toggle {
		border: 1px solid rgba(147, 180, 205, 0.35);
		background: rgba(147, 180, 205, 0.08);
		color: #93b4cd;
		padding: 0.28rem 0.65rem;
		border-radius: 6px;
		font: inherit;
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		cursor: pointer;
	}

	.ht-files-toggle:hover {
		background: rgba(147, 180, 205, 0.16);
	}

	.ht-file-row {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.35rem 0;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	.ht-file-row:first-of-type {
		border-top: none;
	}

	.ht-file-name {
		min-width: 0;
		overflow-wrap: anywhere;
		color: rgba(255, 255, 255, 0.92);
	}

	.ht-file-hours {
		flex: none;
		font-variant-numeric: tabular-nums;
		color: #93b4cd;
	}

	.ht-files-list {
		margin-top: 0.75rem;
	}

	.ht-files-empty-text {
		margin-top: 0.75rem;
		color: rgba(255, 255, 255, 0.65);
		font-size: 0.9rem;
	}

	.admin-shell.light .ht-files {
		border-color: rgba(0, 0, 0, 0.12);
		background: rgba(0, 0, 0, 0.03);
	}

	.admin-shell.light .ht-files-toggle {
		border-color: rgba(42, 102, 153, 0.28);
		background: rgba(42, 102, 153, 0.08);
		color: #2a6699;
	}

	.admin-shell.light .ht-files-toggle:hover {
		background: rgba(42, 102, 153, 0.14);
	}

	.admin-shell.light .ht-file-row {
		border-top-color: rgba(0, 0, 0, 0.08);
	}

	.admin-shell.light .ht-file-name {
		color: #1a1a1a;
	}

	.admin-shell.light .ht-files-empty-text {
		color: rgba(0, 0, 0, 0.62);
	}

	.review-user-projects{
		margin-top: 1rem;
		padding: 0.9rem 1rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 8px;
		background: rgba(0, 0, 0, 0.14);
	}

	.review-user-projects-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-bottom: 0.65rem;
		font-size: 0.82rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #93b4cd;
	}

	.review-user-projects-count {
		font-variant-numeric: tabular-nums;
	}

	.review-user-projects-list {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.review-user-projects-row {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		padding: 0.45rem 0;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
	}

	.review-user-projects-row:first-of-type {
		border-top: none;
	}

	.review-user-projects-name {
		color: rgba(255, 255, 255, 0.92);
		font-size: 0.9rem;
		font-weight: 600;
	}

	.review-user-projects-meta {
		margin-top: 0.15rem;
		font-size: 0.82rem;
		color: rgba(255, 255, 255, 0.62);
	}

	.review-user-projects-status {
		flex: none;
		align-self: center;
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.review-user-projects-empty {
		color: rgba(255, 255, 255, 0.65);
		font-size: 0.9rem;
	}

	.admin-shell.light .review-user-projects {
		border-color: rgba(0, 0, 0, 0.12);
		background: rgba(0, 0, 0, 0.03);
	}

	.admin-shell.light .review-user-projects-row {
		border-top-color: rgba(0, 0, 0, 0.08);
	}

	.admin-shell.light .review-user-projects-name {
		color: #1a1a1a;
	}

	.admin-shell.light .review-user-projects-meta,
	.admin-shell.light .review-user-projects-empty {
		color: rgba(0, 0, 0, 0.62);
	}

	.review-user-projects-link {
		width: 100%;
		border: none;
		text-align: left;
		cursor: pointer;
		background: transparent;
		font: inherit;
	}

	.review-user-projects-link:hover {
		background: rgba(147, 180, 205, 0.08);
	}
	
	.review-user-projects-link:focus-visible{
		outline: 2px solid #93b4cd;
		outline-offset: 2px;
	}

	.admin-shell.light .review-user-projects-link:hover {
		background: rgba(147, 180, 205, 0.12);
	}
</style>
