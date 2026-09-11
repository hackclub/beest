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
		pageUrl: string;
		thumbnailUrl: string | null;
		duration: number | null;
		createdAt: number | null;
		hackatimeProject: string | null;
		visibility: string | null;
	};

	let { projectId }: { projectId: string } = $props();

	let timelapses = $state<Timelapse[]>([]);
	let loaded = $state(false);
	let lastProjectId = $state<string | null>(null);
	let copiedId = $state<string | null>(null);

	async function copyLink(t: Timelapse) {
		try {
			await navigator.clipboard.writeText(t.pageUrl);
			copiedId = t.id;
			setTimeout(() => {
				if (copiedId === t.id) copiedId = null;
			}, 1500);
		} catch {
			// clipboard denied — nothing to fall back to here
		}
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
			load(projectId);
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

{#if loaded && timelapses.length > 0}
	<section class="tl-section">
		<h3>Timelapses <span class="muted">({timelapses.length})</span></h3>
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
						<button class="tl-copy-btn" type="button" onclick={() => copyLink(t)}>
							{copiedId === t.id ? 'Copied!' : 'Copy link'}
						</button>
					</div>
					<video
						controls
						preload="metadata"
						poster={t.thumbnailUrl ?? undefined}
						src={t.playbackUrl}
					>
						<track kind="captions" />
					</video>
				</li>
			{/each}
		</ul>
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
	.tl-copy-btn {
		margin-left: 0.5rem;
		padding: 0.05rem 0.5rem;
		font-size: 0.75rem;
		border: 1px solid currentColor;
		border-radius: 3px;
		background: transparent;
		color: inherit;
		cursor: pointer;
		opacity: 0.75;
	}
	.tl-copy-btn:hover {
		opacity: 1;
	}
	video {
		width: 100%;
		max-height: 480px;
		background: #000;
		border-radius: 4px;
	}
</style>
