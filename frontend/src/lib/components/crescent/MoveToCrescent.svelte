<script lang="ts">
	import './crescent.css';

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

<div class="move-wrap crescent-true-colour">
	<div class="move crescent-plate">
		<svg class="move-moon" viewBox="0 0 24 24" aria-hidden="true">
			<path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z" fill="currentColor" />
		</svg>
		<div class="move-copy">
			<p class="move-title crescent-display">Keep building {name} on Crescent</p>
			<p class="move-lead crescent-body">
				Its name, description, links, screenshot and Hackatime projects come along. Your pipes stay
				here.
			</p>
			{#if phase === 'error'}<p class="move-error crescent-body" role="alert">{error}</p>{/if}
		</div>
		<button type="button" class="crescent-button" onclick={move} disabled={phase === 'going'}>
			{phase === 'going' ? 'Moving…' : 'Move to Crescent'}
		</button>
	</div>
</div>

<style>
	.move-wrap {
		margin: 0 0 18px;
	}

	.move {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 16px;
		padding: 14px 18px;
	}

	.move-moon {
		width: 34px;
		height: 34px;
		color: #ecdec3;
		rotate: -18deg;
	}

	.move-copy {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.move-title {
		font-size: 20px;
		overflow-wrap: anywhere;
	}

	.move-lead,
	.move-error {
		font-size: 15px;
	}

	.move-error {
		color: #ee6462;
	}

	@media (max-width: 640px) {
		.move {
			grid-template-columns: auto minmax(0, 1fr);
		}

		.move button {
			grid-column: 1 / -1;
		}
	}
</style>
