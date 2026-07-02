<script lang="ts">
	// Read-only popup listing everyone who bought one specific shop item,
	// aggregated to one row per buyer. Self-fetches on mount from the
	// Fulfiller-guarded `/api/admin/shop/:id/buyers` endpoint.
	import { onMount } from 'svelte';

	type Buyer = {
		userId: string;
		userName: string;
		userSlackId: string | null;
		userEmail: string | null;
		orderCount: number;
		totalQuantity: number;
		totalPipes: number;
		pendingCount: number;
		fulfilledCount: number;
		firstOrderAt: string;
		lastOrderAt: string;
	};
	type BuyersResponse = {
		item: { id: string; name: string };
		totals: {
			buyerCount: number;
			orderCount: number;
			totalQuantity: number;
			totalPipes: number;
		};
		buyers: Buyer[];
	};

	let {
		item,
		onClose
	}: {
		item: { id: string; name: string };
		onClose: () => void;
	} = $props();

	let loading = $state(true);
	let loadError = $state('');
	let data = $state<BuyersResponse | null>(null);
	let copiedKey = $state('');

	const fmtDate = (iso: string) =>
		new Date(iso).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});

	async function copy(key: string, value: string | null) {
		if (!value) return;
		try {
			await navigator.clipboard.writeText(value);
			copiedKey = key;
			setTimeout(() => {
				if (copiedKey === key) copiedKey = '';
			}, 1200);
		} catch {
			/* clipboard blocked */
		}
	}

	onMount(async () => {
		try {
			const res = await fetch(`/api/admin/shop/${item.id}/buyers`);
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				loadError = body?.message ?? body?.error ?? 'Failed to load buyers';
				return;
			}
			data = await res.json();
		} catch {
			loadError = 'Failed to load buyers';
		} finally {
			loading = false;
		}
	});
</script>

<div
	class="ib-overlay"
	role="button"
	tabindex="0"
	onclick={onClose}
	onkeydown={(e) => {
		if (e.key === 'Escape') onClose();
	}}
>
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
	<div
		class="ib-modal"
		role="dialog"
		aria-modal="true"
		aria-label="Item buyers"
		tabindex="-1"
		onclick={(e) => e.stopPropagation()}
	>
		<header class="ib-head">
			<h3>Buyers · {item.name}</h3>
			<button class="ib-x" onclick={onClose} aria-label="Close">×</button>
		</header>

		{#if loading}
			<p class="ib-info">Loading…</p>
		{:else if loadError}
			<p class="ib-error">{loadError}</p>
		{:else if data}
			{#if data.buyers.length === 0}
				<p class="ib-info">No one has bought this item yet.</p>
			{:else}
				<p class="ib-sub">
					{data.totals.buyerCount} buyer{data.totals.buyerCount === 1 ? '' : 's'} ·
					{data.totals.orderCount} order{data.totals.orderCount === 1 ? '' : 's'} ·
					{data.totals.totalQuantity} unit{data.totals.totalQuantity === 1 ? '' : 's'} ·
					{data.totals.totalPipes} pipes
				</p>
				<div class="ib-table-wrap">
					<table class="ib-table">
						<thead>
							<tr>
								<th>Buyer</th>
								<th class="ib-num">Qty</th>
								<th class="ib-num">Orders</th>
								<th class="ib-num">Pipes</th>
								<th>Status</th>
								<th>Last order</th>
								<th>Contact</th>
							</tr>
						</thead>
						<tbody>
							{#each data.buyers as b (b.userId)}
								<tr>
									<td>{b.userName}</td>
									<td class="ib-num">{b.totalQuantity}</td>
									<td class="ib-num">{b.orderCount}</td>
									<td class="ib-num">{b.totalPipes}</td>
									<td class="ib-status">
										{#if b.pendingCount > 0}<span class="ib-pill ib-pending">{b.pendingCount} pending</span>{/if}
										{#if b.fulfilledCount > 0}<span class="ib-pill ib-fulfilled">{b.fulfilledCount} fulfilled</span>{/if}
									</td>
									<td>{fmtDate(b.lastOrderAt)}</td>
									<td class="ib-contact">
										{#if b.userSlackId}
											<button
												class="ib-copy"
												title="Copy Slack ID"
												onclick={() => copy(`slack-${b.userId}`, b.userSlackId)}
											>
												{copiedKey === `slack-${b.userId}` ? '✓' : 'Slack'}
											</button>
										{/if}
										{#if b.userEmail}
											<button
												class="ib-copy"
												title={b.userEmail}
												onclick={() => copy(`email-${b.userId}`, b.userEmail)}
											>
												{copiedKey === `email-${b.userId}` ? '✓' : 'Email'}
											</button>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{/if}

		<div class="ib-actions">
			<button class="btn" onclick={onClose}>Close</button>
		</div>
	</div>
</div>

<style>
	.ib-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}
	.ib-modal {
		background: #3a3832;
		color: #e8e0d4;
		border: 1px solid #5a564c;
		border-radius: 8px;
		width: 100%;
		max-width: 720px;
		max-height: 90vh;
		overflow-y: auto;
		padding: 1.25rem;
		font-family: sans-serif;
	}
	.ib-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.ib-head h3 {
		margin: 0;
		font-size: 1.15rem;
	}
	.ib-x {
		background: none;
		border: none;
		color: #e8e0d4;
		font-size: 1.5rem;
		line-height: 1;
		cursor: pointer;
	}
	.ib-sub {
		margin: 0.5rem 0 0.75rem;
		font-size: 0.85rem;
		opacity: 0.8;
	}
	.ib-table-wrap {
		overflow-x: auto;
	}
	.ib-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.82rem;
	}
	.ib-table th,
	.ib-table td {
		text-align: left;
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid #4a473f;
		white-space: nowrap;
	}
	.ib-table th {
		font-weight: 600;
		opacity: 0.7;
		position: sticky;
		top: 0;
		background: #3a3832;
	}
	.ib-num {
		text-align: right;
	}
	.ib-status {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.ib-pill {
		border-radius: 999px;
		padding: 0.1rem 0.45rem;
		font-size: 0.72rem;
		font-weight: 600;
	}
	.ib-pending {
		background: #6a4a1f;
		color: #ffce80;
	}
	.ib-fulfilled {
		background: #234a24;
		color: #8fe58b;
	}
	.ib-contact {
		display: flex;
		gap: 0.3rem;
	}
	.ib-copy {
		background: #2c2a25;
		border: 1px solid #5a564c;
		color: #e8e0d4;
		border-radius: 4px;
		padding: 0.15rem 0.45rem;
		font-size: 0.72rem;
		cursor: pointer;
	}
	.ib-copy:hover {
		border-color: #7a756a;
	}
	.ib-actions {
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
	.ib-error {
		color: #ff6b6b;
		font-size: 0.85rem;
	}
	.ib-info {
		opacity: 0.8;
	}
</style>
