<script lang="ts">
	import { onMount, tick } from 'svelte';
	import '@fontsource/opendyslexic/400.css';

	let { data } = $props<{ data: { role?: string; auditSvcUrl: string } }>();
	const isSuperAdmin = $derived(data?.role === 'Super Admin');

	// Private audit service — the heartbeat timeline + editor/extension breakdown
	// + anomaly heuristics live in a separate (private) repo, embedded here as an
	// iframe. We only ever hand it an opaque, single-use context id.
	const auditSvcUrl = $derived(data.auditSvcUrl);
	const auditSvcOrigin = $derived.by(() => {
		try {
			return new URL(auditSvcUrl).origin;
		} catch {
			return '';
		}
	});

	type Owner = {
		id: string;
		name: string | null;
		nickname: string | null;
		slackId: string | null;
		email: string | null;
		hackatimeConnected: boolean;
		watchlisted: boolean;
		coolBuilder: boolean;
	} | null;

	type FraudItem = {
		id: string;
		name: string;
		description: string;
		projectType: string;
		status: string;
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
		createdAt: string;
		submittedAt: string | null;
		owner: Owner;
		autoFraud: { status: string; trustScore: number | null; justification: string | null } | null;
	};

	type Hackatime = {
		totalHours: number | null;
		aiHours: number | null;
		nonAiHours: number | null;
		trustLevel: string | null;
		fileBreakdown: { file: string; hours: number }[];
		hackatimeProjects: { name: string; hours: number; languages: string[] }[];
	};

	let queue = $state<FraudItem[]>([]);
	let idx = $state(0);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let search = $state('');

	// The queue can be the whole shipped population, so support a text filter over
	// project + maker names. `idx` indexes the FILTERED view.
	const filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		if (!q) return queue;
		return queue.filter(
			(p) =>
				p.name.toLowerCase().includes(q) ||
				(p.owner?.name?.toLowerCase().includes(q) ?? false) ||
				(p.owner?.nickname?.toLowerCase().includes(q) ?? false) ||
				(p.owner?.slackId?.toLowerCase().includes(q) ?? false)
		);
	});
	const current = $derived<FraudItem | null>(filtered[idx] ?? null);

	// per-project state (reset on navigation)
	let note = $state('');
	let submitting = $state(false);
	let submitError = $state<string | null>(null);
	let hackatime = $state<Hackatime | null>(null);
	let hackatimeLoading = $state(false);

	// Audit iframe (heartbeat timeline + editor/extension breakdown + anomalies).
	let iframeEl = $state<HTMLIFrameElement | null>(null);
	let showIframe = $state(false);
	const AUDIT_FRAME_NAME = 'beest-fraud-embed';
	let iframeHeight = $state(560);
	let iframeError = $state<string | null>(null);

	let lightMode = $state(false);
	let dyslexicFont = $state(false);
	let prefsInited = false;
	onMount(() => {
		try {
			lightMode = localStorage.getItem('beest_fraud_light') === '1';
			dyslexicFont = localStorage.getItem('beest_fraud_dyslexic') === '1';
		} catch {}
		prefsInited = true;
	});
	$effect(() => {
		const _l = lightMode;
		const _d = dyslexicFont;
		if (!prefsInited) return;
		try {
			localStorage.setItem('beest_fraud_light', _l ? '1' : '0');
			localStorage.setItem('beest_fraud_dyslexic', _d ? '1' : '0');
		} catch {}
	});

	// Reset the panel whenever the visible project changes.
	$effect(() => {
		const c = current;
		note = '';
		submitError = null;
		hackatime = null;
		showIframe = false;
		iframeError = null;
		iframeHeight = 560;
		if (c) {
			loadHackatime(c.id);
			mintIframe(c.id);
		}
	});

	// Mint a fresh single-use context for the audit iframe and POST it into the
	// frame (ctx in the body, never the URL). Re-minted per project.
	async function mintIframe(projectId: string) {
		iframeError = null;
		showIframe = false;
		try {
			const res = await fetch(`/api/admin/audit/${projectId}/iframe-context`, { method: 'POST' });
			const j = await res.json().catch(() => ({}));
			if (!res.ok || !j.ctx) throw new Error(j.message || j.error || `HTTP ${res.status}`);
			showIframe = true;
			await tick();
			submitCtxToIframe(j.ctx);
		} catch (e) {
			iframeError = e instanceof Error ? e.message : String(e);
		}
	}

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

	// Push theme changes into the embed without reloading it (a reload re-fetches
	// heartbeats). Pinned to the audit origin.
	function postThemeToIframe() {
		const win = iframeEl?.contentWindow;
		if (!win || !auditSvcOrigin) return;
		win.postMessage(
			{ source: 'beest', type: 'theme', light: lightMode, dyslexic: dyslexicFont },
			auditSvcOrigin
		);
	}
	$effect(() => {
		lightMode;
		dyslexicFont;
		postThemeToIframe();
	});

	// Receive resize messages from the audit iframe. Origin-checked.
	onMount(() => {
		function onMessage(e: MessageEvent) {
			if (!auditSvcOrigin || e.origin !== auditSvcOrigin) return;
			const d = e.data;
			if (!d || d.source !== 'beest-audit') return;
			if (d.type === 'resize' && typeof d.height === 'number') {
				iframeHeight = Math.max(200, Math.min(4000, Math.ceil(d.height)));
			}
		}
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	});

	async function loadHackatime(projectId: string) {
		hackatimeLoading = true;
		try {
			const res = await fetch(`/api/admin/projects/${projectId}/hackatime`);
			if (!res.ok) return;
			const j = await res.json();
			hackatime = {
				totalHours: typeof j?.totalHours === 'number' ? j.totalHours : null,
				aiHours: typeof j?.aiHours === 'number' ? j.aiHours : null,
				nonAiHours: typeof j?.nonAiHours === 'number' ? j.nonAiHours : null,
				trustLevel: j?.trustLevel ?? null,
				fileBreakdown: Array.isArray(j?.fileBreakdown) ? j.fileBreakdown : [],
				hackatimeProjects: Array.isArray(j?.hackatimeProjects) ? j.hackatimeProjects : []
			};
		} catch {
			// Silent — the breakdown panel just won't render.
		} finally {
			hackatimeLoading = false;
		}
	}

	async function loadQueue() {
		loading = true;
		loadError = null;
		try {
			const res = await fetch('/api/admin/fraud/queue');
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
		if (next < 0 || next >= filtered.length) return;
		idx = next;
	}

	// Remove the acted-on project from the underlying queue and keep `idx` valid
	// against the filtered view.
	function dropCurrent() {
		if (!current) return;
		const id = current.id;
		queue = queue.filter((p) => p.id !== id);
		if (idx >= filtered.length) idx = Math.max(0, filtered.length - 1);
	}

	const noteTooShort = $derived(note.trim().length < 10);

	async function clearNotFraud() {
		if (!current || submitting || noteTooShort) return;
		submitting = true;
		submitError = null;
		try {
			const res = await fetch(`/api/admin/fraud/${current.id}/clear`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ note })
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(j.message || j.error || `HTTP ${res.status}`);
			dropCurrent();
		} catch (e) {
			submitError = e instanceof Error ? e.message : String(e);
		} finally {
			submitting = false;
		}
	}

	async function banMaker() {
		if (!current || submitting || noteTooShort) return;
		const who = current.owner?.name || current.owner?.nickname || 'this maker';
		if (!confirm(`Ban ${who} and reject "${current.name}"? This bans the account.`)) return;
		submitting = true;
		submitError = null;
		try {
			const res = await fetch(`/api/admin/fraud/${current.id}/ban`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ note })
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(j.message || j.error || `HTTP ${res.status}`);
			dropCurrent();
		} catch (e) {
			submitError = e instanceof Error ? e.message : String(e);
		} finally {
			submitting = false;
		}
	}

	function fmtDate(s: string | null): string {
		if (!s) return '—';
		const d = new Date(s);
		return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
	}
	function ago(s: string | null): string {
		if (!s) return '—';
		const ms = Date.now() - new Date(s).getTime();
		const days = Math.floor(ms / 86400000);
		if (days > 0) return `${days}d ago`;
		const hrs = Math.floor(ms / 3600000);
		return hrs > 0 ? `${hrs}h ago` : 'just now';
	}
	function trustClass(score: number | null): string {
		if (score == null) return 'muted';
		if (score <= 3) return 'bad';
		if (score <= 6) return 'warn';
		return 'good';
	}
</script>

<div class="screen" class:light={lightMode} class:dyslexic={dyslexicFont}>
	<header class="topbar">
		<div class="title">
			<a href="/admin" class="back">← admin</a>
			<h1>Fraud review</h1>
		</div>
		<div class="nav">
			<button class="theme-toggle" onclick={() => (lightMode = !lightMode)}>{lightMode ? 'Dark' : 'Light'}</button>
			<button class="theme-toggle" class:on={dyslexicFont} onclick={() => (dyslexicFont = !dyslexicFont)} title="OpenDyslexic font">Aa</button>
			{#if filtered.length > 0}
				<span class="pos">{idx + 1} / {filtered.length}</span>
				<button class="theme-toggle" disabled={idx <= 0} onclick={() => go(-1)}>Prev</button>
				<button class="theme-toggle" disabled={idx >= filtered.length - 1} onclick={() => go(1)}>Next</button>
			{/if}
		</div>
	</header>

	{#if loading}
		<div class="state">Loading fraud queue…</div>
	{:else if loadError}
		<div class="state error">Failed to load: {loadError}</div>
	{:else if queue.length === 0}
		<div class="state">🎉 Nothing awaiting fraud review.</div>
	{:else}
		<div class="layout">
			<aside class="sidebar">
				<input class="search" placeholder="Filter by project or maker…" bind:value={search} />
				<ul class="q-list">
					{#each filtered as item, i (item.id)}
						<li>
							<button
								class="q-item"
								class:active={i === idx}
								onclick={() => (idx = i)}
							>
								<span class="q-name">{item.name}</span>
								<span class="q-meta">
									{item.owner?.name || item.owner?.nickname || 'unknown'} · {ago(item.submittedAt)}
								</span>
								<span class="q-badges">
									<span class="tag status">{item.status}</span>
									{#if item.autoFraud?.trustScore != null}
										<span class="tag trust {trustClass(item.autoFraud.trustScore)}">trust {item.autoFraud.trustScore}</span>
									{/if}
									{#if item.owner?.watchlisted}<span class="tag watch">watch</span>{/if}
									{#if item.owner?.coolBuilder}<span class="tag cool">cool</span>{/if}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			</aside>

			{#if current}
				<main class="detail">
					<section class="card">
						<div class="proj-head">
							<h2>{current.name}</h2>
							<div class="proj-tags">
								<span class="tag status">{current.status}</span>
								<span class="tag">{current.projectType}</span>
								{#if current.isUpdate}<span class="tag">update</span>{/if}
							</div>
						</div>
						<p class="desc">{current.description}</p>

						<div class="kv">
							<div><span class="k">Maker</span><span class="v">{current.owner?.name || '—'}{current.owner?.nickname ? ` (${current.owner.nickname})` : ''}</span></div>
							<div><span class="k">Slack</span><span class="v">{current.owner?.slackId || '—'}</span></div>
							<div><span class="k">Email</span><span class="v">{current.owner?.email || '—'}</span></div>
							<div><span class="k">Submitted</span><span class="v">{fmtDate(current.submittedAt)} ({ago(current.submittedAt)})</span></div>
							<div><span class="k">Hackatime</span><span class="v">{current.owner?.hackatimeConnected ? 'connected' : 'not connected'} · {current.hackatimeProjectNames.join(', ') || '—'}</span></div>
							{#if current.aiUse}<div><span class="k">AI use</span><span class="v">{current.aiUse}</span></div>{/if}
							{#if current.otherHcProgram}<div><span class="k">Other HC program</span><span class="v">{current.otherHcProgram}</span></div>{/if}
						</div>

						<div class="links">
							{#if current.codeUrl}<a href={current.codeUrl} target="_blank" rel="noreferrer">Code ↗</a>{/if}
							{#if current.readmeUrl}<a href={current.readmeUrl} target="_blank" rel="noreferrer">README ↗</a>{/if}
							{#if current.demoUrl}<a href={current.demoUrl} target="_blank" rel="noreferrer">Demo ↗</a>{/if}
						</div>

						{#if current.autoFraud}
							<div class="auto-fraud {trustClass(current.autoFraud.trustScore)}">
								<strong>joe.fraud verdict:</strong>
								{current.autoFraud.trustScore != null ? `trust ${current.autoFraud.trustScore}/10` : current.autoFraud.status}
								{#if current.autoFraud.justification}<p class="af-just">{current.autoFraud.justification}</p>{/if}
							</div>
						{/if}
					</section>

					<section class="card">
						<h3>Heartbeat audit · editor / extension breakdown</h3>
						{#if iframeError}
							<div class="state error small">Audit panel failed: {iframeError}</div>
						{/if}
						{#if showIframe}
							<iframe
								bind:this={iframeEl}
								name={AUDIT_FRAME_NAME}
								title="Heartbeat audit"
								class="audit-frame"
								style="height:{iframeHeight}px"
							></iframe>
						{:else if !iframeError}
							<div class="state small">Loading heartbeat panel…</div>
						{/if}
					</section>

					<section class="card">
						<h3>Hackatime breakdown</h3>
						{#if hackatimeLoading}
							<div class="state small">Loading…</div>
						{:else if hackatime}
							<div class="hours-row">
								<div class="stat"><span class="num">{hackatime.totalHours?.toFixed(1) ?? '—'}</span><span class="lbl">total h</span></div>
								<div class="stat"><span class="num">{hackatime.aiHours?.toFixed(1) ?? '—'}</span><span class="lbl">AI h</span></div>
								<div class="stat"><span class="num">{hackatime.nonAiHours?.toFixed(1) ?? '—'}</span><span class="lbl">non-AI h</span></div>
								{#if hackatime.trustLevel}<div class="stat"><span class="num sm">{hackatime.trustLevel}</span><span class="lbl">HT trust</span></div>{/if}
							</div>
							{#if hackatime.hackatimeProjects.length}
								<div class="langs">
									{#each hackatime.hackatimeProjects as hp}
										<span class="lang-line"><strong>{hp.name}</strong> · {hp.hours.toFixed(1)}h · {hp.languages.join(', ') || 'no languages'}</span>
									{/each}
								</div>
							{/if}
							{#if hackatime.fileBreakdown.length}
								<div class="files">
									<div class="files-head">File breakdown (top 20)</div>
									{#each hackatime.fileBreakdown.slice(0, 20) as f}
										<div class="file-row"><span class="file-name" title={f.file}>{f.file}</span><span class="file-h">{f.hours.toFixed(1)}h</span></div>
									{/each}
								</div>
							{:else}
								<div class="state small">No per-file data.</div>
							{/if}
						{:else}
							<div class="state small">No Hackatime data.</div>
						{/if}
					</section>

					<section class="card actions">
						<h3>Verdict</h3>
						<p class="hint">Your note becomes the justification for whichever action you take. Fraud review is independent of functional review — clearing does not approve the project.</p>
						<textarea
							class="note"
							rows="4"
							placeholder="Reason / evidence (min 10 chars)…"
							bind:value={note}
						></textarea>
						{#if submitError}<div class="state error small">{submitError}</div>{/if}
						<div class="btn-row">
							<button class="btn clear" disabled={submitting || noteTooShort} onclick={clearNotFraud}>
								✓ Not fraud
							</button>
							<button class="btn ban" disabled={submitting || noteTooShort} onclick={banMaker}>
								⛔ Ban maker
							</button>
						</div>
						{#if !isSuperAdmin}
							<p class="hint muted">Banning a maker here bans their account. Staff accounts are protected.</p>
						{/if}
					</section>
				</main>
			{/if}
		</div>
	{/if}
</div>

<style>
	.screen {
		min-height: 100vh;
		background: #14110f;
		color: #e7e0d6;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
	}
	.screen.light {
		background: #f4efe7;
		color: #241f1a;
	}
	.screen.dyslexic {
		font-family: 'OpenDyslexic', sans-serif;
	}
	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 20px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		position: sticky;
		top: 0;
		background: inherit;
		z-index: 5;
	}
	.title {
		display: flex;
		align-items: baseline;
		gap: 14px;
	}
	.title h1 {
		font-size: 18px;
		margin: 0;
	}
	.back {
		color: inherit;
		opacity: 0.6;
		text-decoration: none;
		font-size: 13px;
	}
	.nav {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.pos {
		font-size: 13px;
		opacity: 0.7;
	}
	.theme-toggle {
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.12);
		color: inherit;
		border-radius: 6px;
		padding: 5px 10px;
		font-size: 12px;
		cursor: pointer;
	}
	.theme-toggle.on {
		background: #c98a3a;
		color: #1a1410;
	}
	.theme-toggle:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.state {
		padding: 40px;
		text-align: center;
		opacity: 0.75;
	}
	.state.small {
		padding: 16px;
		font-size: 13px;
	}
	.state.error {
		color: #e5806f;
	}
	.layout {
		display: grid;
		grid-template-columns: 320px 1fr;
		gap: 0;
		align-items: start;
	}
	.sidebar {
		border-right: 1px solid rgba(255, 255, 255, 0.08);
		height: calc(100vh - 57px);
		overflow-y: auto;
		position: sticky;
		top: 57px;
		padding: 10px;
	}
	.search {
		width: 100%;
		box-sizing: border-box;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.12);
		color: inherit;
		border-radius: 6px;
		padding: 8px 10px;
		font: inherit;
		font-size: 12px;
		margin-bottom: 8px;
	}
	.q-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.q-item {
		width: 100%;
		text-align: left;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 8px;
		padding: 9px 10px;
		color: inherit;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 3px;
	}
	.q-item:hover {
		background: rgba(255, 255, 255, 0.05);
	}
	.q-item.active {
		background: rgba(201, 138, 58, 0.16);
		border-color: rgba(201, 138, 58, 0.5);
	}
	.q-name {
		font-size: 13px;
		font-weight: 600;
	}
	.q-meta {
		font-size: 11px;
		opacity: 0.65;
	}
	.q-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.tag {
		font-size: 10px;
		padding: 2px 6px;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.08);
		white-space: nowrap;
	}
	.tag.status {
		background: rgba(120, 140, 200, 0.22);
	}
	.tag.trust.good {
		background: rgba(90, 170, 100, 0.28);
	}
	.tag.trust.warn {
		background: rgba(210, 160, 60, 0.28);
	}
	.tag.trust.bad {
		background: rgba(210, 90, 70, 0.32);
	}
	.tag.watch {
		background: rgba(210, 90, 70, 0.28);
	}
	.tag.cool {
		background: rgba(90, 170, 100, 0.28);
	}
	.detail {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}
	.card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 10px;
		padding: 16px;
	}
	.light .card {
		background: rgba(0, 0, 0, 0.03);
		border-color: rgba(0, 0, 0, 0.1);
	}
	.card h3 {
		margin: 0 0 12px;
		font-size: 14px;
	}
	.proj-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
	}
	.proj-head h2 {
		margin: 0;
		font-size: 18px;
	}
	.proj-tags {
		display: flex;
		gap: 5px;
	}
	.desc {
		opacity: 0.85;
		font-size: 13px;
		line-height: 1.5;
		margin: 10px 0 14px;
		white-space: pre-wrap;
	}
	.kv {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 8px 18px;
		font-size: 12px;
	}
	.kv .k {
		opacity: 0.55;
		margin-right: 8px;
	}
	.kv > div {
		display: flex;
	}
	.kv .v {
		word-break: break-word;
	}
	.links {
		display: flex;
		gap: 12px;
		margin-top: 14px;
	}
	.links a {
		color: #d8a55e;
		font-size: 13px;
	}
	.auto-fraud {
		margin-top: 14px;
		padding: 10px 12px;
		border-radius: 8px;
		font-size: 12px;
		background: rgba(255, 255, 255, 0.05);
		border-left: 3px solid rgba(255, 255, 255, 0.2);
	}
	.auto-fraud.bad {
		border-left-color: #d25a46;
	}
	.auto-fraud.warn {
		border-left-color: #d2a03c;
	}
	.auto-fraud.good {
		border-left-color: #5aaa64;
	}
	.af-just {
		margin: 6px 0 0;
		opacity: 0.8;
		white-space: pre-wrap;
	}
	.audit-frame {
		width: 100%;
		border: 0;
		border-radius: 8px;
		background: #0d0b09;
	}
	.hours-row {
		display: flex;
		gap: 22px;
		flex-wrap: wrap;
		margin-bottom: 12px;
	}
	.stat {
		display: flex;
		flex-direction: column;
	}
	.stat .num {
		font-size: 20px;
		font-weight: 700;
	}
	.stat .num.sm {
		font-size: 14px;
	}
	.stat .lbl {
		font-size: 11px;
		opacity: 0.55;
	}
	.langs {
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-size: 12px;
		margin-bottom: 12px;
	}
	.files-head {
		font-size: 12px;
		opacity: 0.6;
		margin-bottom: 6px;
	}
	.file-row {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		font-size: 12px;
		padding: 2px 0;
		border-bottom: 1px dotted rgba(255, 255, 255, 0.06);
	}
	.file-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.file-h {
		opacity: 0.7;
		flex-shrink: 0;
	}
	.actions .hint {
		font-size: 12px;
		opacity: 0.7;
		margin: 0 0 10px;
		line-height: 1.5;
	}
	.actions .hint.muted {
		opacity: 0.45;
		margin-top: 10px;
	}
	.note {
		width: 100%;
		box-sizing: border-box;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.14);
		color: inherit;
		border-radius: 8px;
		padding: 10px;
		font: inherit;
		font-size: 13px;
		resize: vertical;
	}
	.btn-row {
		display: flex;
		gap: 10px;
		margin-top: 12px;
	}
	.btn {
		border: 0;
		border-radius: 8px;
		padding: 10px 18px;
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.btn:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.btn.clear {
		background: #4f9a5a;
		color: #0e1a10;
	}
	.btn.ban {
		background: #c0503c;
		color: #1a0d0a;
	}
</style>
