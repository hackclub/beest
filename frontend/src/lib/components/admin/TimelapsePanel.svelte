<script lang="ts">
	// Inline viewer for Lapse (https://github.com/hackclub/lapse) timelapses tied
	// to the project's Hackatime project names. Renders nothing when the project
	// owner has no matching timelapses, so it stays invisible for the common case
	// where the builder didn't record one.
	import { onMount } from 'svelte';

	type Timelapse = {
		id: string;
		name: string;
		playbackUrl: string;
		thumbnailUrl: string | null;
		duration: number | null;
		createdAt: number | null;
		hackatimeProject: string | null;
		visibility: string | null;
	};

	// `gated`: don't auto-load. The playbackUrl/thumbnailUrl are confidential
	// (anyone with the link can watch a builder's unlisted timelapse), so in the
	// super-admin audit we hide them behind an explicit "View timelapses" click
	// instead of fetching + embedding them for every queued project.
	let { projectId, gated = false }: { projectId: string; gated?: boolean } = $props();

	let timelapses = $state<Timelapse[]>([]);
	let loaded = $state(false);
	let revealed = $state(false);
	let lastProjectId = $state<string | null>(null);

	function reveal() {
		revealed = true;
		load(projectId);
	}

	// Block the browser's "Save video as…" context menu on the confidential
	// streams. Cosmetic — not a real boundary — but keeps the URL from being
	// one right-click away.
	function blockContextMenu(e: Event) {
		e.preventDefault();
	}

	async function load(id: string) {
		loaded = false;
		timelapses = [];
		try {
			const res = await fetch(`/api/admin/projects/${id}/lapse`);
			if (!res.ok) return;
			const data = await res.json().catch(() => null);
			if (Array.isArray(data?.timelapses)) {
				timelapses = data.timelapses;
			}
		} catch {
			// fail silent — service degrades to no-render
		} finally {
			loaded = true;
		}
	}

	$effect(() => {
		if (projectId && projectId !== lastProjectId) {
			lastProjectId = projectId;
			// Re-conceal on navigation so each project needs a fresh, deliberate
			// reveal — a confidential URL never lingers across queue items.
			revealed = false;
			loaded = false;
			timelapses = [];
			if (!gated) load(projectId);
		}
	});

	function fmtDuration(secs: number | null): string {
		if (secs == null || !Number.isFinite(secs) || secs <= 0) return '';
		const m = Math.floor(secs / 60);
		const s = Math.floor(secs % 60);
		if (m === 0) return `${s}s`;
		return `${m}m ${String(s).padStart(2, '0')}s`;
	}

	function fmtDate(ts: number | null): string {
		if (!ts) return '';
		try {
			return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
		} catch {
			return '';
		}
	}
</script>

{#if gated && !revealed}
	<section class="tl-section">
		<button type="button" class="tl-reveal" onclick={reveal}>View timelapses</button>
		<p class="tl-confidential">
			Confidential — these are private video links. Don't copy, forward, or paste them anywhere.
		</p>
	</section>
{:else if loaded && timelapses.length > 0}
	<section class="tl-section">
		<h3>Timelapses <span class="muted">({timelapses.length})</span></h3>
		{#if gated}
			<p class="tl-confidential">Confidential — do not share these links.</p>
		{/if}
		<ul class="tl-list">
			{#each timelapses as t (t.id)}
				<li class="tl-item">
					<div class="tl-meta">
						<strong>{t.name || 'Untitled'}</strong>
						{#if t.hackatimeProject}
							<span class="tl-tag">{t.hackatimeProject}</span>
						{/if}
						{#if t.duration}
							<span class="muted"> · {fmtDuration(t.duration)}</span>
						{/if}
						{#if t.createdAt}
							<span class="muted"> · {fmtDate(t.createdAt)}</span>
						{/if}
					</div>
					<!-- Hardened against casual exfiltration: no download button, no
					     picture-in-picture pop-out, and the save-as context menu is
					     suppressed. The src is still a confidential URL, so the whole panel
					     is gated behind the reveal above. -->
					<video
						controls
						controlsList="nodownload noplaybackrate noremoteplayback"
						disablepictureinpicture
						preload="none"
						oncontextmenu={blockContextMenu}
						poster={t.thumbnailUrl ?? undefined}
						src={t.playbackUrl}
					>
						<track kind="captions" />
					</video>
				</li>
			{/each}
		</ul>
	</section>
{:else if gated && revealed}
	<section class="tl-section">
		<p class="muted">{loaded ? 'No timelapses for this project.' : 'Loading…'}</p>
	</section>
{/if}

<style>
	.tl-section {
		margin-top: 1rem;
	}
	.tl-section h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1rem;
	}
	.tl-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.tl-item {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.tl-meta {
		font-size: 0.85rem;
	}
	.tl-tag {
		display: inline-block;
		margin-left: 0.4rem;
		padding: 0.05rem 0.4rem;
		border: 1px solid currentColor;
		border-radius: 3px;
		font-size: 0.75rem;
		opacity: 0.75;
	}
	.muted {
		opacity: 0.65;
	}
	.tl-reveal {
		font: inherit;
		cursor: pointer;
		padding: 0.45rem 0.9rem;
		border: 1px solid currentColor;
		border-radius: 5px;
		background: transparent;
		color: inherit;
		opacity: 0.9;
	}
	.tl-reveal:hover {
		opacity: 1;
	}
	.tl-confidential {
		margin: 0.4rem 0 0;
		font-size: 0.75rem;
		opacity: 0.6;
	}
	video {
		width: 100%;
		max-height: 480px;
		background: #000;
		border-radius: 4px;
	}
</style>
