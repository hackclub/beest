<script lang="ts">
	// One press and the project is on its way to Crescent: the backend signs a
	// snapshot of it (backend/src/crescent/crescent-transfer.ts) and Crescent
	// picks it up, asks for a card, and makes the same project there. Only the
	// project's own fields go; pipes, reviews and orders stay on BEEST.
	let { projectId, name }: { projectId: string; name: string } = $props();

	let phase = $state<'idle' | 'going' | 'error'>('idle');
	let error = $state('');

	async function move() {
		if (phase === 'going') return;
		phase = 'going';
		try {
			const res = await fetch(`/api/projects/${projectId}/crescent-transfer`, { method: 'POST' });
			const data = await res.json().catch(() => ({}));
			if (!res.ok || typeof data.url !== 'string')
				throw new Error(data.message || 'Something went wrong. Try again in a minute.');
			window.location.href = data.url;
		} catch (e) {
			phase = 'error';
			error = e instanceof Error ? e.message : 'Something went wrong. Try again in a minute.';
		}
	}
</script>

<div class="move-wrap">
	<div class="move">
		<svg class="move-moon" viewBox="0 0 24 24" aria-hidden="true">
			<path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z" fill="currentColor" />
		</svg>
		<div class="move-copy">
			<p class="move-title">Keep building {name} on Crescent</p>
			<p class="move-lead">
				Its name, description, links, screenshot and Hackatime projects come along. Your pipes stay
				here.
			</p>
			{#if phase === 'error'}<p class="move-error" role="alert">{error}</p>{/if}
		</div>
		<button type="button" class="move-btn" onclick={move} disabled={phase === 'going'}>
			{phase === 'going' ? 'Moving...' : 'Move to Crescent'}
		</button>
	</div>
</div>

<style>
	@font-face {
		font-family: 'Young Serif';
		src: url('/fonts/YoungSerif.woff2') format('woff2');
		font-weight: 400;
		font-style: normal;
		font-display: swap;
	}

	@font-face {
		font-family: 'Sunny Mood';
		src: url('/fonts/SunnyMood.woff2') format('woff2');
		font-weight: normal;
		font-style: normal;
		font-display: swap;
	}

	.move-wrap {
		margin: 0 0 18px;
		/* The page runs saturate(1.5); this gives Crescent's colours back (see CrescentCta). */
		filter: saturate(0.667) drop-shadow(4px 4px 0 #2e2b25);
	}

	.move {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 16px;
		padding: 12px 16px;
		background:
			radial-gradient(1.5px 1.5px at 30% 20%, #f5ead4 60%, transparent 70%),
			radial-gradient(1px 1px at 62% 80%, #f9c1ef 60%, transparent 70%),
			radial-gradient(1.5px 1.5px at 84% 25%, #f5ead4 60%, transparent 70%),
			radial-gradient(120% 200% at 0% 0%, #56279d 0%, #2f1668 35%, #190c3e 75%);
		border: 3px solid #0b061d;
		clip-path: polygon(
			12px 0,
			100% 0,
			100% calc(100% - 12px),
			calc(100% - 12px) 100%,
			0 100%,
			0 12px
		);
		color: #f5ead4;
		text-align: left;
	}

	.move-moon {
		width: 34px;
		height: 34px;
		color: #f5ead4;
		rotate: -18deg;
	}

	.move-copy {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.move-title {
		margin: 0;
		font-family: 'Young Serif', Georgia, serif;
		font-size: 19px;
		line-height: 1.2;
		overflow-wrap: anywhere;
		text-shadow: 0 2px 0 #0b061d;
	}

	.move-lead,
	.move-error {
		margin: 0;
		font-family: 'Sunny Mood', 'Courier New', monospace;
		font-size: 15px;
		line-height: 1.35;
		letter-spacing: 0.02em;
		color: rgba(245, 234, 212, 0.82);
	}

	.move-error {
		color: #f9c1ef;
	}

	.move-btn {
		padding: 8px 16px;
		background: #6632b5;
		color: #f5ead4;
		font-family: 'Sunny Mood', 'Courier New', monospace;
		font-size: 16px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
		white-space: nowrap;
		border: 3px solid #9443c2;
		border-bottom: 8px solid #3a1870;
		box-shadow: 4px 4px 0 #0b061d;
		cursor: pointer;
		transition:
			transform 0.1s ease,
			box-shadow 0.1s ease,
			border-bottom-width 0.1s ease;
	}

	.move-btn:hover:not(:disabled) {
		transform: translate(-1px, -1px);
		box-shadow: 5px 5px 0 #0b061d;
	}

	.move-btn:active:not(:disabled) {
		transform: translateY(5px);
		border-bottom-width: 3px;
		box-shadow: 2px 1px 0 #0b061d;
	}

	.move-btn:disabled {
		cursor: wait;
		opacity: 0.8;
	}

	.move-btn:focus-visible {
		outline: 3px solid #f9c1ef;
		outline-offset: 3px;
	}

	@media (max-width: 640px) {
		.move {
			grid-template-columns: auto minmax(0, 1fr);
		}

		.move-btn {
			grid-column: 1 / -1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.move-btn {
			transition: none;
		}
	}
</style>
