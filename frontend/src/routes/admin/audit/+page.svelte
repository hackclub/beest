<script lang="ts">
	import { onMount, tick } from 'svelte';
	import '@fontsource/opendyslexic/400.css';
	import TimelapsePanel from '$lib/components/admin/TimelapsePanel.svelte';

	let { data } = $props<{ data: { role?: string; auditSvcUrl: string } }>();
	const isSuperAdmin = $derived(data?.role === 'Super Admin');
	// Second-pass audit actions (load-unreviewed, inline embed) are open to both
	// audit roles; only ban stays Super-Admin-only. Mirrors the backend `audit`
	// scope + FraudReviewerGuard allow-list.
	const canAudit = $derived(data?.role === 'Super Admin' || data?.role === 'Fraud Reviewer');

	// Private audit service — the heartbeat timeline + anomaly heuristics live in
	// a separate (private) repo, embedded here as an iframe. We only ever hand it
	// an opaque, single-use context id; everything sensitive stays server-side.
	const auditSvcUrl = $derived(data.auditSvcUrl);
	const auditSvcOrigin = $derived.by(() => {
		try {
			return new URL(auditSvcUrl).origin;
		} catch {
			return '';
		}
	});

	type Approval = {
		reviewerName: string | null;
		overrideJustification: string | null;
		feedback: string | null;
		internalNote: string | null;
		createdAt: string;
	} | null;

	type QueueItem = {
		id: string;
		name: string;
		description: string;
		projectType: string;
		codeUrl: string | null;
		readmeUrl: string | null;
		demoUrl: string | null;
		screenshot1Url: string | null;
		screenshot2Url: string | null;
		hackatimeProjectNames: string[];
		aiUse: string | null;
		isUpdate: boolean;
		otherHcProgram: string | null;
		overrideHours: number;
		internalHours: number;
		pipesGranted: number;
		createdAt: string;
		owner: {
			id: string;
			name: string | null;
			nickname: string | null;
			slackId: string | null;
			email: string | null;
			hackatimeConnected: boolean;
			identityStatus: 'eligible' | 'ineligible' | 'unverified';
			watchlisted: boolean;
			coolBuilder: boolean;
		} | null;
		originalApproval: Approval;
		isOneShot: boolean;
		submission: {
			id: string;
			changeDescription: string | null;
			overrideHours: number | null;
			createdAt: string;
		} | null;
		priorSubmissions: PriorSubmission[];
	};

	type PriorSubmission = {
		id: string;
		status: string;
		overrideHours: number | null;
		internalHours: number | null;
		pipesGranted: number | null;
		changeDescription: string | null;
		createdAt: string;
		review: {
			status: string;
			overrideJustification: string | null;
			feedback: string | null;
			internalNote: string | null;
			reviewerName: string | null;
			createdAt: string;
		} | null;
	};

	type TrustInfo = {
		trustLevel: string | null;
		emailMismatch: boolean;
		totalHours: number | null;
		unifiedDuplicate: boolean;
		unifiedError: boolean;
	};

	let queue = $state<QueueItem[]>([]);
	let idx = $state(0);
	let loading = $state(true);
	let loadError = $state<string | null>(null);

	const current = $derived<QueueItem | null>(queue[idx] ?? null);

	// per-project decision state (reset on navigation)
	let action = $state<'approve' | 'rereview' | 'reject' | 'ban'>('approve');
	let justification = $state('');
	let reviewerFeedback = $state('');
	let userFeedback = $state('');
	let approveHoursInput = $state<number | null>(null);
	let approveHoursTouched = $state(false);
	let internalHoursInput = $state<number | null>(null);
	let internalHoursTouched = $state(false);
	let submitting = $state(false);
	let submitError = $state<string | null>(null);
	let trust = $state<TrustInfo | null>(null);

	// Audit iframe (heartbeat timeline + anomaly signals).
	let iframeEl = $state<HTMLIFrameElement | null>(null);
	// The audit embed is loaded by POSTing the ctx into the iframe (see mintIframe)
	// rather than via its `src`, so the single-use id never rides in the URL. This
	// just gates whether the (named) iframe is mounted yet.
	let showIframe = $state(false);
	const AUDIT_FRAME_NAME = 'beest-audit-embed';
	let iframeHeight = $state(560);
	let iframeError = $state<string | null>(null);
	let trustLoading = $state(false);
	let loadUnreviewedBusy = $state(false);
	let loadUnreviewedError = $state<string | null>(null);

	const isOneShot = $derived(!!current?.isOneShot);
	const justificationMin = $derived(isOneShot ? 250 : 50);

	let lightMode = $state(false);
	let dyslexicFont = $state(false);
	let prefsInited = false;
	onMount(() => {
		try {
			lightMode = localStorage.getItem('beest_2nd_light') === '1';
			dyslexicFont = localStorage.getItem('beest_2nd_dyslexic') === '1';
		} catch {}
		prefsInited = true;
	});
	$effect(() => {
		const _l = lightMode;
		const _d = dyslexicFont;
		if (!prefsInited) return;
		try {
			localStorage.setItem('beest_2nd_light', _l ? '1' : '0');
			localStorage.setItem('beest_2nd_dyslexic', _d ? '1' : '0');
		} catch {}
	});

	let filterInfo = $state<{
		totalActiveMinutes: number;
		filteredActiveMinutes: number | null;
		aiPercent: number | null;
	} | null>(null);

	const baseHours = $derived(current?.overrideHours ?? 0);
	const baseInternalHours = $derived(current?.internalHours ?? 0);
	const scaledHours = $derived.by(() => {
		if (
			!filterInfo ||
			filterInfo.filteredActiveMinutes == null ||
			filterInfo.totalActiveMinutes <= 0
		)
			return baseHours;
		const scale = filterInfo.filteredActiveMinutes / filterInfo.totalActiveMinutes;
		return Math.round(baseHours * scale * 10) / 10;
	});
	const effectiveApproveHours = $derived(
		approveHoursTouched ? (approveHoursInput ?? 0) : scaledHours
	);
	// Internal hours default: for one-shot, no first-pass set it, so default to
	// the same value the SA picks for user-facing; for normal audits, default to
	// the first-pass-set internalHours on the project.
	const defaultInternalHours = $derived(isOneShot ? scaledHours : baseInternalHours);
	const effectiveInternalHours = $derived(
		internalHoursTouched ? (internalHoursInput ?? 0) : defaultInternalHours
	);

	// Pipe math preview. The audit hours input is the FINAL CUMULATIVE value for
	// this project. Backend grants floor(sum of override_hours across the user's
	// projects) − sum(pipes_granted). previewNewPipes here is the single-project
	// approximation (good enough for the SA's mental model); cross-project
	// fractional rounding can shift the actual grant by ±1 pipe.
	const pipesAlreadyPaid = $derived(current?.pipesGranted ?? 0);
	const submissionDelta = $derived(current?.submission?.overrideHours ?? null);
	const priorCumulative = $derived(
		submissionDelta != null
			? Math.round((baseHours - submissionDelta) * 10) / 10
			: null
	);
	const previewNewPipes = $derived(
		Math.max(0, Math.floor(effectiveApproveHours) - pipesAlreadyPaid),
	);
	const isResubmission = $derived(pipesAlreadyPaid > 0);

	// Reset / prefill the decision form whenever the visible project changes —
	// approval justification starts as a copy of the first reviewer's text so the
	// super admin edits on top of it. One-shot items have no first reviewer text,
	// so the field stays empty.
	$effect(() => {
		const c = current;
		action = 'approve';
		justification = c?.originalApproval?.overrideJustification ?? '';
		reviewerFeedback = '';
		userFeedback = '';
		approveHoursInput = null;
		approveHoursTouched = false;
		internalHoursInput = null;
		internalHoursTouched = false;
		submitError = null;
		filterInfo = null;
		trust = null;
		showIframe = false;
		iframeError = null;
		iframeHeight = 560;
		if (c) {
			loadTrust(c.id);
			mintIframe(c.id);
		}
	});

	// Mint a fresh single-use context for the audit iframe and point it there.
	// Re-minted every time the visible project changes (the panel navigates the
	// queue client-side), so each embed gets its own short-lived ctx.
	async function mintIframe(projectId: string) {
		iframeError = null;
		showIframe = false;
		try {
			const res = await fetch(`/api/admin/audit/${projectId}/iframe-context`, { method: 'POST' });
			const j = await res.json().catch(() => ({}));
			if (!res.ok || !j.ctx) throw new Error(j.message || j.error || `HTTP ${res.status}`);
			// Mount the named iframe, then POST the ctx into it. Delivering it in the
			// request body (not the URL) keeps the single-use id out of the audit
			// service's access logs. The theme prefs ride along so the first paint
			// matches; live toggles after load go via postMessage below.
			showIframe = true;
			await tick();
			submitCtxToIframe(j.ctx);
		} catch (e) {
			iframeError = e instanceof Error ? e.message : String(e);
		}
	}

	// Build a transient hidden form and submit it into the audit iframe, so the
	// browser navigates the frame via POST (ctx in the body, never the URL).
	function submitCtxToIframe(ctx: string) {
		if (!iframeEl) return;
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
		field('dys', dyslexicFont ? '1' : '0');
		document.body.appendChild(form);
		form.submit();
		form.remove();
	}

	// Push Light/Dark + dyslexic-font changes into the embed without reloading it
	// (a reload would re-fetch heartbeats). Pinned to the audit origin.
	function postThemeToIframe() {
		const win = iframeEl?.contentWindow;
		if (!win || !auditSvcOrigin) return;
		win.postMessage(
			{ source: 'beest', type: 'theme', light: lightMode, dyslexic: dyslexicFont },
			auditSvcOrigin
		);
	}
	$effect(() => {
		// Re-run whenever the toggles change.
		lightMode;
		dyslexicFont;
		postThemeToIframe();
	});

	// Receive filter / resize messages from the audit iframe. Origin-checked so
	// only the configured audit service can drive the approved-hours math.
	onMount(() => {
		function onMessage(e: MessageEvent) {
			if (!auditSvcOrigin || e.origin !== auditSvcOrigin) return;
			const d = e.data;
			if (!d || d.source !== 'beest-audit') return;
			if (d.type === 'filter') {
				filterInfo = {
					totalActiveMinutes: d.totalActiveMinutes,
					filteredActiveMinutes: d.filteredActiveMinutes,
					aiPercent: d.aiPercent
				};
			} else if (d.type === 'resize' && typeof d.height === 'number') {
				// Clamp to a sane range so a hostile/buggy height can't blow up layout.
				iframeHeight = Math.max(200, Math.min(4000, Math.ceil(d.height)));
			}
		}
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	});

	async function loadTrust(projectId: string) {
		trustLoading = true;
		try {
			const res = await fetch(`/api/admin/projects/${projectId}/hackatime`);
			if (!res.ok) return;
			const j = await res.json();
			trust = {
				trustLevel: j?.trustLevel ?? null,
				emailMismatch: !!j?.emailMismatch,
				totalHours: typeof j?.totalHours === 'number' ? j.totalHours : null,
				unifiedDuplicate: !!j?.unifiedDuplicate,
				unifiedError: !!j?.unifiedError
			};
		} catch {
			// Silent — trust panel just won't render.
		} finally {
			trustLoading = false;
		}
	}

	async function loadUnreviewed() {
		if (loadUnreviewedBusy) return;
		loadUnreviewedBusy = true;
		loadUnreviewedError = null;
		try {
			const res = await fetch('/api/admin/audit/load-unreviewed', { method: 'POST' });
			const j = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(j.message || j.error || `HTTP ${res.status}`);
			await loadQueue();
		} catch (e) {
			loadUnreviewedError = e instanceof Error ? e.message : String(e);
		} finally {
			loadUnreviewedBusy = false;
		}
	}

	async function loadQueue() {
		loading = true;
		loadError = null;
		try {
			const res = await fetch('/api/admin/audit/queue');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			queue = await res.json();
			idx = 0;
		} catch (e) {
			loadError = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		loadQueue();
	});

	function go(delta: number) {
		const next = idx + delta;
		if (next < 0 || next >= queue.length) return;
		idx = next;
	}

	let markerBusy = $state(false);
	let markerError = $state<string | null>(null);

	async function toggleMarker(kind: 'watchlist' | 'cool') {
		if (!current?.owner || markerBusy) return;
		const owner = current.owner;
		markerBusy = true;
		markerError = null;
		const endpoint = kind === 'watchlist' ? 'watchlist' : 'cool-builder';
		const key = kind === 'watchlist' ? 'watchlisted' : 'coolBuilder';
		const next = kind === 'watchlist' ? !owner.watchlisted : !owner.coolBuilder;
		try {
			const res = await fetch(`/api/admin/users/${owner.id}/${endpoint}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ [key]: next })
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(j.message || j.error || `HTTP ${res.status}`);
			// Reflect the authoritative (mutually-exclusive) result across every
			// queued project owned by this user.
			for (const item of queue) {
				if (item.owner?.id === owner.id) {
					item.owner.watchlisted = !!j.watchlisted;
					item.owner.coolBuilder = !!j.coolBuilder;
				}
			}
			queue = queue;
		} catch (e) {
			markerError = e instanceof Error ? e.message : String(e);
		} finally {
			markerBusy = false;
		}
	}

	async function submit() {
		if (!current || submitting) return;
		submitting = true;
		submitError = null;
		try {
			let body: Record<string, unknown> = { action };
			if (action === 'approve') {
				body = {
					action,
					justification,
					overrideHours: effectiveApproveHours,
					internalHours: effectiveInternalHours,
					// One-shot may include an optional user-facing feedback line.
					...(isOneShot && userFeedback.trim() ? { userFeedback } : {}),
				};
			} else if (action === 'rereview') {
				body = { action, reviewerFeedback };
			} else {
				// reject + ban share the userFeedback payload
				body = { action, userFeedback };
			}
			const res = await fetch(`/api/admin/audit/${current.id}/decision`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(j.message || j.error || `HTTP ${res.status}`);
			// remove current item; idx now points at the next one (or end)
			queue = queue.filter((_, i) => i !== idx);
			if (idx >= queue.length) idx = Math.max(0, queue.length - 1);
		} catch (e) {
			submitError = e instanceof Error ? e.message : String(e);
		} finally {
			submitting = false;
		}
	}

	const approveDisabled = $derived(submitting || justification.trim().length < justificationMin || effectiveApproveHours <= 0);
	const rereviewDisabled = $derived(submitting || reviewerFeedback.trim().length < 10);
	const rejectDisabled = $derived(submitting || userFeedback.trim().length < 10);
	const banDisabled = $derived(submitting || userFeedback.trim().length < 10 || !isSuperAdmin);

	function fmtDate(s: string | null): string {
		if (!s) return '—';
		const d = new Date(s);
		return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
	}
	function ago(s: string): string {
		const ms = Date.now() - new Date(s).getTime();
		const days = Math.floor(ms / 86400000);
		if (days > 0) return `${days}d ago`;
		const hrs = Math.floor(ms / 3600000);
		return hrs > 0 ? `${hrs}h ago` : 'just now';
	}
</script>

<div class="screen" class:light={lightMode} class:dyslexic={dyslexicFont}>
	<header class="topbar">
		<div class="title">
			<a href="/admin" class="back">← admin</a>
			<h1>Second-pass review</h1>
		</div>
		<div class="nav">
			<button class="theme-toggle" onclick={() => (lightMode = !lightMode)}>{lightMode ? 'Dark' : 'Light'}</button>
			<button class="theme-toggle" class:on={dyslexicFont} onclick={() => (dyslexicFont = !dyslexicFont)} title="OpenDyslexic font">Aa</button>
			{#if queue.length > 0}
				<span class="pos">{idx + 1} / {queue.length}</span>
				<button class="navbtn" onclick={() => go(-1)} disabled={idx === 0}>← Prev</button>
				<button class="navbtn primary" onclick={() => go(1)} disabled={idx >= queue.length - 1}
					>Next →</button
				>
			{/if}
			<button class="navbtn" onclick={loadQueue} title="reload queue">⟳</button>
		</div>
	</header>

	{#if loading}
		<div class="state">Loading queue…</div>
	{:else if loadError}
		<div class="state err">Failed to load: {loadError}</div>
	{:else if queue.length === 0}
		<div class="state empty">
			<h2>Queue clear</h2>
			<p>No projects are awaiting second-pass review.</p>
			{#if canAudit}
				<p class="muted">Pull in up to 10 of the oldest unreviewed projects as one-shot reviews — they skip the first-pass and are decided here, by you alone.</p>
				<button class="navbtn primary" disabled={loadUnreviewedBusy} onclick={loadUnreviewed}>
					{loadUnreviewedBusy ? 'Loading…' : 'Load 10 unreviewed projects'}
				</button>
				{#if loadUnreviewedError}
					<div class="err sub-err">{loadUnreviewedError}</div>
				{/if}
			{/if}
		</div>
	{:else if current}
		{#key current.id}
			<main class="content">
				<article class="paper">
					<section class="sec">
						<div class="proj-head">
							<h2>{current.name}</h2>
							<span class="badge">{current.projectType}</span>
							{#if current.isUpdate}<span class="badge upd">update</span>{/if}
							{#if current.isOneShot}<span class="badge oneshot" title="No first-pass review — your decision is the only one">one-shot</span>{/if}
						</div>
						<p class="desc">{current.description}</p>
						<div class="links">
							{#if current.codeUrl}<a class="lnk" href={current.codeUrl} target="_blank" rel="noreferrer">view code ↗</a>{/if}
							{#if current.demoUrl}<a class="lnk" href={current.demoUrl} target="_blank" rel="noreferrer">view demo ↗</a>{/if}
							{#if current.readmeUrl}<a class="lnk" href={current.readmeUrl} target="_blank" rel="noreferrer">readme ↗</a>{/if}
						</div>
					</section>

					{#if current.screenshot1Url || current.screenshot2Url}
						<section class="sec">
							<div class="shots">
								{#if current.screenshot1Url}<a href={current.screenshot1Url} target="_blank" rel="noreferrer"><img src={current.screenshot1Url} alt="screenshot 1" /></a>{/if}
								{#if current.screenshot2Url}<a href={current.screenshot2Url} target="_blank" rel="noreferrer"><img src={current.screenshot2Url} alt="screenshot 2" /></a>{/if}
							</div>
						</section>
					{/if}

					<section class="sec">
						<dl class="meta">
							<dt>Owner</dt><dd>{current.owner?.nickname || current.owner?.name || '—'}{#if current.owner?.slackId} · <code>{current.owner.slackId}</code>{/if}{#if current.owner?.watchlisted} <span class="marker marker-watch">watchlisted</span>{:else if current.owner?.coolBuilder} <span class="marker marker-cool">cool builder</span>{/if}</dd>
							{#if current.owner}
								<dt>Flags</dt>
								<dd class="marker-controls">
									<button type="button" class="marker-btn" class:on={current.owner.watchlisted} disabled={markerBusy} onclick={() => toggleMarker('watchlist')}>
										{current.owner.watchlisted ? '✓ Watchlisted' : 'Watchlist'}
									</button>
									<button type="button" class="marker-btn marker-btn-cool" class:on={current.owner.coolBuilder} disabled={markerBusy} onclick={() => toggleMarker('cool')}>
										{current.owner.coolBuilder ? '✓ Cool builder' : 'Cool builder'}
									</button>
									{#if markerError}<span class="marker-err">{markerError}</span>{/if}
								</dd>
							{/if}
							{#if current.owner?.email}<dt>Email</dt><dd>{current.owner.email}</dd>{/if}
							<dt>Identity</dt><dd>{#if current.owner?.identityStatus === 'eligible'}verified &amp; eligible{:else if current.owner?.identityStatus === 'ineligible'}<strong class="idv-bad">verified — NOT eligible for YSWS</strong>{:else}<strong class="idv-bad">not verified</strong>{/if}</dd>
							<dt>Hackatime</dt><dd>{current.owner?.hackatimeConnected ? 'linked' : 'not linked'}{#if current.hackatimeProjectNames.length} · {current.hackatimeProjectNames.join(', ')}{/if}</dd>
							<dt>Approved hours (pending)</dt><dd>{current.overrideHours}h · {current.pipesGranted} pipes granted</dd>
							{#if current.aiUse}<dt>AI use</dt><dd>{current.aiUse}</dd>{/if}
							{#if current.otherHcProgram}<dt>Other HC program</dt><dd>{current.otherHcProgram}</dd>{/if}
							{#if current.submission?.changeDescription}<dt>Change description</dt><dd>{current.submission.changeDescription}</dd>{/if}
							<dt>Submitted</dt><dd>{fmtDate(current.submission?.createdAt ?? current.createdAt)} ({ago(current.createdAt)})</dd>
						</dl>
					</section>

					{#if trust && (trust.trustLevel === 'red' || trust.trustLevel === 'yellow' || trust.emailMismatch || trust.unifiedDuplicate || trust.unifiedError)}
						<section class="sec sec-trust">
							<h3>Warnings</h3>
							{#if trust.trustLevel === 'red'}
								<div class="anom-row"><span class="dot red"></span> <strong>Hackatime trust: RED</strong> — Hackatime has flagged this user as untrusted.</div>
							{:else if trust.trustLevel === 'yellow'}
								<div class="anom-row"><span class="dot yellow"></span> <strong>Hackatime trust: yellow</strong> — Hackatime has flagged this user for caution.</div>
							{/if}
							{#if trust.emailMismatch}
								<div class="anom-row"><span class="dot red"></span> <strong>Account mismatch</strong> — the linked Hackatime account's email doesn't include this builder's email. Likely a shared/alt account.</div>
							{/if}
							{#if trust.unifiedDuplicate}
								<div class="anom-row"><span class="dot red"></span> <strong>Unified duplicate</strong> — this code URL already exists in Unified Approved Projects.</div>
							{:else if trust.unifiedError}
								<div class="anom-row"><span class="dot yellow"></span> <strong>Unified check failed</strong> — could not verify the code URL against Approved Projects.</div>
							{/if}
						</section>
					{:else if trustLoading}
						<section class="sec sec-trust">
							<p class="muted">Checking Hackatime warnings…</p>
						</section>
					{/if}

					<section class="sec">
						<h3>Original approval reason</h3>
						{#if current.originalApproval}
							<p class="approver">by {current.originalApproval.reviewerName ?? 'reviewer'} · {fmtDate(current.originalApproval.createdAt)}</p>
							<blockquote>{current.originalApproval.overrideJustification || '(no justification recorded)'}</blockquote>
							{#if current.originalApproval.internalNote}<p class="internal"><strong>Internal note:</strong> {current.originalApproval.internalNote}</p>{/if}
						{:else if current.isOneShot}
							<p class="muted">This is a one-shot review pulled from the unreviewed queue. There is no first-pass approval — your decision is final.</p>
						{:else}
							<p class="muted">No approval review record found.</p>
						{/if}
					</section>

					{#if current.priorSubmissions.length > 0}
						<section class="sec">
							<h3>Prior submissions <span class="muted">({current.priorSubmissions.length})</span></h3>
							<ol class="prior-list">
								{#each current.priorSubmissions as p (p.id)}
									<li class="prior-item">
										<div class="prior-head">
											<span class="prior-status prior-status-{p.review?.status ?? p.status}">{p.review?.status ?? p.status}</span>
											<span class="prior-date">{fmtDate(p.createdAt)}</span>
											{#if p.overrideHours != null && p.overrideHours > 0}<span class="prior-hours">+{p.overrideHours}h{#if p.pipesGranted != null && p.pipesGranted > 0} · {p.pipesGranted} pipes{/if}</span>{/if}
										</div>
										{#if p.changeDescription}
											<p class="prior-change"><strong>Change description:</strong> {p.changeDescription}</p>
										{/if}
										{#if p.review}
											<p class="approver prior-reviewer">reviewed by {p.review.reviewerName ?? 'reviewer'} · {fmtDate(p.review.createdAt)}</p>
											{#if p.review.overrideJustification}
												<blockquote class="prior-blockquote">{p.review.overrideJustification}</blockquote>
											{/if}
											{#if p.review.feedback}
												<p class="prior-feedback"><strong>Feedback to user:</strong> {p.review.feedback}</p>
											{/if}
											{#if p.review.internalNote}
												<p class="internal prior-internal"><strong>Internal note:</strong> {p.review.internalNote}</p>
											{/if}
										{:else}
											<p class="muted">No review record found for this submission.</p>
										{/if}
									</li>
								{/each}
							</ol>
						</section>
					{/if}

					<section class="sec">
						<TimelapsePanel projectId={current.id} />
					</section>

					<section class="sec">
						<h3>Hackatime heartbeats &amp; anomaly signals</h3>
						{#if iframeError}
							<div class="err sub-err">audit panel failed to load: {iframeError}</div>
						{:else if showIframe}
							<iframe
								bind:this={iframeEl}
								title="Heartbeat activity &amp; anomaly analysis"
								name={AUDIT_FRAME_NAME}
								style:height={`${iframeHeight}px`}
								class="audit-frame"
								sandbox="allow-scripts allow-same-origin"
								referrerpolicy="no-referrer"
								onload={postThemeToIframe}
							></iframe>
						{:else}
							<div class="muted">loading audit panel…</div>
						{/if}
					</section>

					<section class="sec sec-decision">
						<div class="seg">
							<button class:active={action === 'approve'} onclick={() => (action = 'approve')}>Approve</button>
							<button class:active={action === 'rereview'} onclick={() => (action = 'rereview')}>{current.isOneShot ? 'Release to queue' : 'Send for re-review'}</button>
							<button class:active={action === 'reject'} onclick={() => (action = 'reject')}>Reject to user</button>
							{#if isSuperAdmin}
								<button class:active={action === 'ban'} onclick={() => (action = 'ban')}>Fail &amp; ban</button>
							{/if}
						</div>

						{#if submitError}<div class="err sub-err">{submitError}</div>{/if}

						{#if action === 'approve'}
							{#if trust?.totalHours != null}
								<div class="ht-recorded">
									<span class="ht-recorded-label">Hackatime recorded</span>
									<span class="ht-recorded-val">{trust.totalHours.toFixed(1)}<span class="ht-recorded-unit">h</span></span>
								</div>
							{/if}
							<label class="fl" for="hrs">user-facing hours <span class="muted">(final cumulative total for this project — drives pipes)</span></label>
							<div class="hrs-row">
								<input
									id="hrs"
									type="number"
									min="0"
									step="0.1"
									class="num"
									value={approveHoursTouched ? approveHoursInput : scaledHours}
									oninput={(e) => {
										approveHoursTouched = true;
										const v = (e.currentTarget as HTMLInputElement).valueAsNumber;
										approveHoursInput = Number.isFinite(v) ? v : null;
									}}
								/>
								{#if current.isOneShot}
									<span class="hrs-note">no first review — set the final approved hours yourself (you may exceed the recorded total)</span>
								{:else if scaledHours !== baseHours}
									<span class="hrs-note">first review: {baseHours}h → after exclusions {scaledHours}h</span>
								{:else}
									<span class="hrs-note">first review approved {baseHours}h</span>
								{/if}
							</div>

							<label class="fl" for="ihrs">internal hours (Airtable "Override Hours Spent")</label>
							<div class="hrs-row">
								<input
									id="ihrs"
									type="number"
									min="0"
									step="0.1"
									class="num"
									value={internalHoursTouched ? internalHoursInput : defaultInternalHours}
									oninput={(e) => {
										internalHoursTouched = true;
										const v = (e.currentTarget as HTMLInputElement).valueAsNumber;
										internalHoursInput = Number.isFinite(v) ? v : null;
									}}
								/>
								{#if current.isOneShot}
									<span class="hrs-note">defaults to the user-facing value — adjust if you want a different number on Airtable</span>
								{:else if baseInternalHours !== baseHours}
									<span class="hrs-note">first review set {baseInternalHours}h internal (vs {baseHours}h user-facing)</span>
								{:else}
									<span class="hrs-note">first review set {baseInternalHours}h internal</span>
								{/if}
							</div>

							<label class="fl" for="just">approval justification ({justification.trim().length}/{justificationMin}){#if current.isOneShot} <span class="oneshot-note">— stricter floor for one-shot</span>{/if}</label>
							<textarea id="just" rows="5" bind:value={justification} placeholder={current.isOneShot ? 'You are the only reviewer — write a thorough justification.' : 'Why does this pass the second-pass / fraud review?'}></textarea>

							{#if current.isOneShot}
								<label class="fl" for="uf-approve">user-facing feedback <span class="muted">(optional — shown to the builder alongside the approval)</span></label>
								<textarea id="uf-approve" rows="3" bind:value={userFeedback} placeholder="Optional note for the builder — what stood out, what could be tightened next time, etc."></textarea>
							{/if}

							<div class="pipe-preview">
								<div class="pipe-preview-title">Pipe math preview <span class="muted">— driven by user-facing hours, NOT internal hours</span></div>
								{#if isResubmission}
									{#if priorCumulative != null && submissionDelta != null && submissionDelta > 0}
										<div class="pipe-row"><span class="pipe-k">Prior cumulative</span><span class="pipe-v">{priorCumulative}h</span></div>
										<div class="pipe-row"><span class="pipe-k">First-pass delta this submission</span><span class="pipe-v">+{submissionDelta}h</span></div>
									{/if}
									<div class="pipe-row"><span class="pipe-k">User-facing hours you're setting</span><span class="pipe-v">{effectiveApproveHours}h</span></div>
									<div class="pipe-row"><span class="pipe-k">Pipes already paid on this project</span><span class="pipe-v">{pipesAlreadyPaid}</span></div>
									<div class="pipe-row pipe-result"><span class="pipe-k">New pipes from this approval</span><span class="pipe-v">floor({effectiveApproveHours}) − {pipesAlreadyPaid} = +{previewNewPipes}</span></div>
								{:else}
									<div class="pipe-row"><span class="pipe-k">User-facing hours you're setting</span><span class="pipe-v">{effectiveApproveHours}h</span></div>
									<div class="pipe-row pipe-result"><span class="pipe-k">New pipes from this approval</span><span class="pipe-v">floor({effectiveApproveHours}) = +{previewNewPipes}</span></div>
								{/if}
								<p class="pipe-note">Internal hours go only to Airtable's "Override Hours Spent" field — they don't affect pipes. Backend grants <code>floor(sum of override_hours) − sum(pipes_granted)</code> across all the user's projects, so cross-project fractional remainders can shift the actual grant by ±1 pipe.</p>
							</div>

							<button class="btn approve" disabled={approveDisabled} onclick={submit}>
								{submitting ? 'Submitting…' : `Approve & sync to Airtable`}
							</button>
						{:else if action === 'rereview'}
							<p class="hint">{current.isOneShot ? 'Releases the project back to the first-review queue. The user is not notified.' : 'Sends the project back to the first-review queue. The user is NOT notified — this feedback is for the first reviewer.'}</p>
							<label class="fl" for="rr">{current.isOneShot ? 'note for the next reviewer' : 'what was wrong with the first review?'} ({reviewerFeedback.trim().length}/10)</label>
							<textarea id="rr" rows="6" bind:value={reviewerFeedback} placeholder={current.isOneShot ? 'Why are you releasing this back instead of deciding?' : 'Explain to the first reviewer what to re-check.'}></textarea>
							<button class="btn rereview" disabled={rereviewDisabled} onclick={submit}>
								{submitting ? 'Submitting…' : current.isOneShot ? 'Release back to queue' : 'Send back for re-review'}
							</button>
						{:else if action === 'reject'}
							<p class="hint">Rejects the project. The user sees this feedback as a regular "changes needed".</p>
							<label class="fl" for="rj">feedback for the user ({userFeedback.trim().length}/10)</label>
							<textarea id="rj" rows="6" bind:value={userFeedback} placeholder="What does the user need to know?"></textarea>
							<button class="btn reject" disabled={rejectDisabled} onclick={submit}>
								{submitting ? 'Submitting…' : 'Reject & send to user'}
							</button>
						{:else}
							<p class="hint warn">Bans the user and rejects the project. Use sparingly — Super Admin only.</p>
							<label class="fl" for="bn">feedback for the user ({userFeedback.trim().length}/10)</label>
							<textarea id="bn" rows="6" bind:value={userFeedback} placeholder="Reason shown to the user when their project is rejected."></textarea>
							<button class="btn reject" disabled={banDisabled} onclick={() => { if (confirm('Ban this user and reject their project?')) submit(); }}>
								{submitting ? 'Submitting…' : 'Fail & ban'}
							</button>
						{/if}
					</section>
				</article>
			</main>
		{/key}
	{/if}
</div>

<style>
	.screen {
		--bg: #1f1f24;
		--surface: #26262e;
		--surface-2: #1a1a20;
		--text: #c4c4cc;
		--text-muted: #797984;
		--border: #2f2f38;
		--accent: #4a86ba;
		--accent-soft: rgba(74, 134, 186, 0.18);
		--approve: #4a9a52;
		--warn: #b89c4a;
		--reject: #b8536a;
		--font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

		position: fixed;
		inset: 0;
		background: var(--bg);
		color: var(--text);
		font-family: var(--font-body);
		font-size: 13px;
		display: flex;
		flex-direction: column;
		z-index: 50;
		overflow: hidden;
	}
	.screen.light {
		--bg: #f5f4f1;
		--surface: #fff;
		--surface-2: #eae8e3;
		--text: #1a1a1a;
		--text-muted: #666;
		--border: #d0cdc7;
		--approve: #1f7a2c;
		--warn: #8a6e10;
		--reject: #a31427;
	}
	.screen.dyslexic { --font-body: 'OpenDyslexic', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

	.topbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.6rem 1.5rem;
		background: var(--surface-2);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.title { display: flex; align-items: baseline; gap: 1rem; }
	.title h1 { font-size: 1.25rem; font-weight: 600; margin: 0; color: var(--text); }
	.back { color: var(--accent); text-decoration: none; font-size: 0.85rem; }
	.nav { display: flex; align-items: center; gap: 0.4rem; }
	.pos { font-variant-numeric: tabular-nums; color: var(--text-muted); font-size: 0.85rem; margin: 0 0.4rem; }

	.theme-toggle {
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0.3rem 0.7rem;
		font-size: 0.75rem;
		font-family: inherit;
		cursor: pointer;
	}
	.theme-toggle:hover { background: var(--accent-soft); }
	.theme-toggle.on { background: var(--accent); color: #fff; border-color: var(--accent); }

	.navbtn {
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0.35rem 0.7rem;
		cursor: pointer;
		font-size: 0.8rem;
		font-family: inherit;
	}
	.navbtn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
	.navbtn:disabled { opacity: 0.4; cursor: not-allowed; }
	.navbtn:hover:not(:disabled) { background: var(--accent-soft); }
	.navbtn.primary:hover:not(:disabled) { filter: brightness(1.1); background: var(--accent); }

	.state { padding: 3rem; text-align: center; color: var(--text-muted); }
	.state.empty h2 { font-size: 1.6rem; color: var(--text); }

	.content {
		flex: 1;
		overflow: auto;
		padding: 1.5rem 1rem;
		display: flex;
		justify-content: center;
		align-items: flex-start;
	}
	.paper {
		width: 100%;
		max-width: 920px;
		min-width: 0;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 0.6rem;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.sec { padding: 1.8rem 1.5rem; border-top: 1px solid var(--border); }
	.sec:first-child { border-top: none; }
	.sec h3 {
		margin: 0 0 0.7rem;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-muted);
		font-weight: 600;
	}
	.sec-decision { display: flex; flex-direction: column; gap: 0.6rem; }

	.proj-head { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.6rem; }
	.proj-head h2 { margin: 0; font-size: 1.4rem; color: var(--text); }
	.badge {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: var(--accent-soft);
		color: var(--accent);
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
	}
	.badge.upd { background: rgba(196, 164, 55, 0.18); color: var(--warn); }
	.badge.oneshot { background: rgba(184, 83, 106, 0.18); color: var(--reject); }
	.oneshot-note { color: var(--reject); font-weight: 600; }
	.hint.warn { color: var(--reject); }
	.sec-trust { border-left: 3px solid var(--reject); padding-left: 0.6rem; }
	.pipe-preview {
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 0.4rem;
		padding: 0.7rem 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.85rem;
	}
	.pipe-preview-title { font-weight: 600; color: var(--text); margin-bottom: 0.2rem; }
	.pipe-row { display: flex; justify-content: space-between; gap: 1rem; }
	.pipe-k { color: var(--text-muted); }
	.pipe-v { color: var(--text); font-variant-numeric: tabular-nums; }
	.pipe-result { font-weight: 700; padding-top: 0.3rem; border-top: 1px dashed var(--border); margin-top: 0.2rem; }
	.pipe-result .pipe-v { color: var(--approve); }
	.pipe-note { font-size: 0.75rem; color: var(--text-muted); margin: 0.3rem 0 0; line-height: 1.4; }
	.pipe-note code { background: var(--surface); padding: 0.05rem 0.3rem; border-radius: 0.2rem; font-size: 0.85em; }
	.desc { color: var(--text); line-height: 1.5; margin: 0 0 0.8rem; opacity: 0.9; }

	.links { display: flex; gap: 1rem; flex-wrap: wrap; }
	.lnk { color: var(--accent); text-decoration: none; font-weight: 600; font-size: 0.85rem; }
	.lnk:hover { text-decoration: underline; }

	.shots { display: flex; gap: 0.7rem; flex-wrap: wrap; }
	.shots img { max-height: 140px; border-radius: 0.4rem; border: 1px solid var(--border); }

	.meta {
		display: grid;
		grid-template-columns: max-content 1fr;
		column-gap: 1.5rem;
		row-gap: 0.55rem;
		margin: 0;
		align-items: baseline;
	}
	.meta dt {
		color: var(--text-muted);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.meta dd {
		margin: 0;
		color: var(--text);
		font-size: 0.88rem;
		line-height: 1.45;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.meta code {
		background: var(--surface-2);
		padding: 0.05rem 0.35rem;
		border-radius: 0.3rem;
		font-size: 0.8rem;
		word-break: break-all;
	}

	.approver { margin: 0 0 0.5rem; font-size: 0.78rem; color: var(--text-muted); }
	blockquote {
		margin: 0;
		padding: 0.6rem 0.8rem;
		background: var(--surface-2);
		border-radius: 0.4rem;
		font-size: 0.88rem;
		line-height: 1.55;
		white-space: pre-wrap;
		color: var(--text);
	}
	.internal { margin: 0.6rem 0 0; font-size: 0.8rem; color: var(--text-muted); }

	.prior-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.prior-item {
		border-left: 2px solid var(--border);
		padding: 0.4rem 0.7rem;
		background: var(--surface-2);
		border-radius: 0 0.3rem 0.3rem 0;
	}
	.prior-head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-bottom: 0.35rem;
	}
	.prior-status {
		text-transform: uppercase;
		font-size: 0.65rem;
		letter-spacing: 0.05em;
		padding: 0.1rem 0.4rem;
		border-radius: 999px;
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 700;
	}
	.prior-status-approved { background: rgba(74, 154, 82, 0.18); color: var(--approve); }
	.prior-status-changes_needed { background: rgba(196, 164, 55, 0.18); color: var(--warn); }
	.prior-status-ban { background: rgba(184, 83, 106, 0.18); color: var(--reject); }
	.prior-date { font-size: 0.78rem; color: var(--text-muted); }
	.prior-hours { font-size: 0.78rem; color: var(--text); font-variant-numeric: tabular-nums; }
	.prior-change { font-size: 0.82rem; margin: 0.3rem 0; color: var(--text); }
	.prior-reviewer { margin: 0.3rem 0 0.4rem; }
	.prior-blockquote { font-size: 0.82rem; padding: 0.45rem 0.65rem; }
	.prior-feedback { font-size: 0.82rem; margin: 0.4rem 0 0; color: var(--text); }
	.prior-internal { font-size: 0.78rem; }

	.audit-frame {
		width: 100%;
		border: none;
		display: block;
		background: transparent;
		color-scheme: normal;
	}
	.anom-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		padding: 0.25rem 0;
		color: var(--text);
	}
	.dot { width: 0.7rem; height: 0.7rem; border-radius: 999px; flex-shrink: 0; }
	.dot.green { background: var(--approve); }
	.dot.yellow { background: var(--warn); }
	.dot.red { background: var(--reject); }
	.idv-bad { color: var(--reject); }

	.marker { display: inline-block; padding: 0.05rem 0.4rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; vertical-align: middle; }
	.marker-watch { background: var(--reject); color: #fff; }
	.marker-cool { background: var(--approve); color: #fff; }
	.marker-controls { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
	.marker-btn { padding: 0.2rem 0.55rem; border-radius: 6px; border: 1px solid var(--border, #999); background: transparent; color: var(--text); cursor: pointer; font-size: 0.8rem; }
	.marker-btn:hover:not(:disabled) { border-color: var(--reject); }
	.marker-btn.on { background: var(--reject); border-color: var(--reject); color: #fff; }
	.marker-btn-cool:hover:not(:disabled) { border-color: var(--approve); }
	.marker-btn-cool.on { background: var(--approve); border-color: var(--approve); color: #fff; }
	.marker-btn:disabled { opacity: 0.5; cursor: default; }
	.marker-err { color: var(--reject); font-size: 0.78rem; }

	.seg { display: flex; gap: 0.3rem; }
	.seg button {
		flex: 1;
		border: 1px solid var(--border);
		background: var(--surface-2);
		color: var(--text);
		padding: 0.5rem;
		border-radius: 0.4rem;
		cursor: pointer;
		font-size: 0.82rem;
		font-family: inherit;
	}
	.seg button.active { background: var(--accent); color: #fff; border-color: var(--accent); }

	.fl {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}
	.hrs-row { display: flex; align-items: center; gap: 0.7rem; }
	.num {
		width: 8rem;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 0.4rem;
		font-size: 1rem;
		font-variant-numeric: tabular-nums;
		background: var(--surface-2);
		color: var(--text);
		font-family: inherit;
	}
	.hrs-note { font-size: 0.8rem; color: var(--text-muted); }

	.ht-recorded {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		padding: 0.5rem 0.9rem;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 0.4rem;
		align-self: flex-start;
	}
	.ht-recorded-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}
	.ht-recorded-val {
		font-size: 2rem;
		font-weight: 700;
		line-height: 1;
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}
	.ht-recorded-unit { font-size: 1.1rem; font-weight: 600; color: var(--text-muted); margin-left: 0.1rem; }

	textarea {
		width: 100%;
		box-sizing: border-box;
		padding: 0.6rem 0.7rem;
		border: 1px solid var(--border);
		border-radius: 0.4rem;
		background: var(--surface-2);
		color: var(--text);
		font-family: inherit;
		font-size: 0.9rem;
		resize: vertical;
	}
	.hint { margin: 0; font-size: 0.8rem; color: var(--text-muted); }

	.btn {
		margin-top: 0.3rem;
		padding: 0.8rem;
		border: none;
		border-radius: 0.4rem;
		color: #fff;
		font-weight: 700;
		font-size: 0.92rem;
		cursor: pointer;
		font-family: inherit;
	}
	.btn.approve { background: var(--approve); }
	.btn.rereview { background: var(--warn); }
	.btn.reject { background: var(--reject); }
	.btn:disabled { background: var(--border); color: var(--text-muted); cursor: not-allowed; }
	.btn:hover:not(:disabled) { filter: brightness(1.1); }

	.sub-err {
		background: rgba(196, 55, 78, 0.15);
		color: var(--reject);
		padding: 0.5rem 0.7rem;
		border-radius: 0.4rem;
		font-size: 0.85rem;
		border: 1px solid var(--reject);
	}
	.err { color: var(--reject); }
	.muted { color: var(--text-muted); font-style: italic; }
</style>
