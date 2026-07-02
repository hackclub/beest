<script lang="ts">
	import { onMount } from 'svelte';

	type Prefill = {
		recipientEmail: string;
		amount: number;
		unit: string;
		alreadyGranted: boolean;
		existingGrantId: string | null;
	};

	let {
		order,
		onClose,
		onGranted
	}: {
		order: { id: string; userName: string; itemName: string; pipesSpent: number };
		onClose: () => void;
		onGranted: (grantId: string) => void;
	} = $props();

	let loading = $state(true);
	let loadError = $state('');
	let prefill = $state<Prefill | null>(null);

	let submitting = $state(false);
	let submitError = $state('');
	let successGrantId = $state('');

	onMount(async () => {
		try {
			const res = await fetch(`/api/admin/silo/prefill/${order.id}`);
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				loadError = body?.message ?? body?.error ?? 'Failed to load grant details';
				return;
			}
			prefill = await res.json();
		} catch {
			loadError = 'Failed to load grant details';
		} finally {
			loading = false;
		}
	});

	async function submit() {
		if (!prefill || submitting) return;
		const confirmed = confirm(
			`Grant ${prefill.amount} ${prefill.unit} of SILO S3 storage to ${prefill.recipientEmail}?\n\nThis provisions real cloud storage and cannot be undone here.`
		);
		if (!confirmed) return;

		submitting = true;
		submitError = '';
		try {
			const res = await fetch('/api/admin/silo/grant', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ orderId: order.id })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				submitError = body?.message ?? body?.error ?? 'Grant failed';
				return;
			}
			successGrantId = body.grantId;
			onGranted(body.grantId);
		} catch {
			submitError = 'Network error issuing grant';
		} finally {
			submitting = false;
		}
	}
</script>

<div
	class="sg-overlay"
	role="button"
	tabindex="0"
	onclick={onClose}
	onkeydown={(e) => {
		if (e.key === 'Escape') onClose();
	}}
>
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
	<div class="sg-modal" role="dialog" aria-modal="true" aria-label="Issue SILO grant" tabindex="-1" onclick={(e) => e.stopPropagation()}>
		<header class="sg-head">
			<h3>Issue SILO storage grant</h3>
			<button class="sg-x" onclick={onClose} aria-label="Close">&times;</button>
		</header>

		<p class="sg-sub">
			Order: <strong>{order.itemName}</strong> &middot; {order.userName} &middot; {order.pipesSpent} pipes
		</p>

		{#if loading}
			<p class="sg-info">Loading&hellip;</p>
		{:else if loadError}
			<p class="sg-error">{loadError}</p>
		{:else if successGrantId}
			<p class="sg-success">&check; Grant issued &mdash; <code>{successGrantId}</code></p>
			<div class="sg-actions">
				<button class="btn btn-primary" onclick={onClose}>Done</button>
			</div>
		{:else if prefill?.alreadyGranted}
			<p class="sg-error">
				A SILO grant was already issued for this order (<code>{prefill.existingGrantId}</code>). Refusing to issue a second one.
			</p>
			<div class="sg-actions">
				<button class="btn" onclick={onClose}>Close</button>
			</div>
		{:else if prefill}
			<label class="sg-field">
				<span>Recipient email <span class="sg-hint">&mdash; fixed to the order owner</span></span>
				<input type="email" value={prefill.recipientEmail} readonly autocomplete="off" />
			</label>

			<label class="sg-field">
				<span>Storage amount</span>
				<input type="text" value="{prefill.amount} {prefill.unit}" readonly autocomplete="off" />
			</label>

			{#if submitError}
				<p class="sg-error">{submitError}</p>
			{/if}

			<div class="sg-actions">
				<button class="btn" onclick={onClose} disabled={submitting}>Cancel</button>
				<button class="btn btn-primary" onclick={submit} disabled={submitting}>
					{submitting ? 'Issuing&hellip;' : `Approve &amp; grant ${prefill.amount} ${prefill.unit}`}
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.sg-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}
	.sg-modal {
		background: #3a3832;
		color: #e8e0d4;
		border: 1px solid #5a564c;
		border-radius: 8px;
		width: 100%;
		max-width: 460px;
		max-height: 90vh;
		overflow-y: auto;
		padding: 1.25rem;
		font-family: sans-serif;
	}
	.sg-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.sg-head h3 {
		margin: 0;
		font-size: 1.15rem;
	}
	.sg-x {
		background: none;
		border: none;
		color: #e8e0d4;
		font-size: 1.5rem;
		line-height: 1;
		cursor: pointer;
	}
	.sg-sub {
		margin: 0.5rem 0 0.75rem;
		font-size: 0.85rem;
		opacity: 0.8;
	}
	.sg-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-bottom: 0.75rem;
		font-size: 0.85rem;
	}
	.sg-field input {
		padding: 0.5rem;
		border-radius: 4px;
		border: 1px solid #5a564c;
		background: #2c2a25;
		color: #e8e0d4;
	}
	.sg-field input[readonly] {
		opacity: 0.7;
	}
	.sg-hint {
		opacity: 0.6;
		font-weight: 400;
	}
	.sg-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1rem;
	}
	.btn {
		padding: 0.5rem 0.9rem;
		border-radius: 4px;
		border: 1px solid #5a564c;
		background: #2c2a25;
		color: #e8e0d4;
		cursor: pointer;
		font-size: 0.85rem;
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn-primary {
		background: #ec3750;
		border-color: #ec3750;
		color: #fff;
		font-weight: 600;
	}
	.sg-error {
		color: #ff6b6b;
		font-size: 0.85rem;
	}
	.sg-success {
		color: #6bd968;
		font-size: 0.9rem;
	}
	.sg-info {
		opacity: 0.8;
	}
	code {
		background: #2c2a25;
		padding: 0.1rem 0.3rem;
		border-radius: 3px;
	}
</style>
