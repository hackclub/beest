<script lang="ts">
	import { onMount } from 'svelte';
	type VerificationResult = {
		certificateNumber: string;
		recipientName: string;
		approvedHours: number;
		awardItem: string;
		certificateText: string;
		createdAt: string;
	} | null;

	let certificateNumber = '';
	let loading = false;
	let result: VerificationResult = null;
	let error = '';

	onMount(() => {
		const number = new URLSearchParams(window.location.search).get('certificate')?.trim();
		if (!number) return;

		certificateNumber = number;
		void verifyCertificate(number);
	});

	async function verifyCertificate(value = certificateNumber) {
		const key = value.trim();
		if (!key) {
			error = 'Enter a certificate number to verify it.';
			result = null;
			return;
		}

		loading = true;
		error = '';
		result = null;

		try {
			const response = await fetch(`/api/certificates/verify/${encodeURIComponent(key)}`);
			if (!response.ok) {
				error =
					response.status === 404
						? 'No certificate was found for that number.'
						: 'Verification is temporarily unavailable. Try again.';
				return;
			}

			result = await response.json();
		} catch {
			error = 'Verification failed. Try again.';
		} finally {
			loading = false;
		}
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		void verifyCertificate();
	}
</script>

<svelte:head>
	<title>Verify Certificate - Beest</title>
	<meta
		name="description"
		content="Verify a Beest by Hack Club certificate by entering its certificate number."
	/>
</svelte:head>

<div class="verify-page">
	<div class="verify-card">
		<div class="eyebrow">Beest by Hack Club</div>
		<h1>Verify Certificate</h1>
		<p class="lead">
			Enter a certificate number to confirm the recipient, fulfilled shop item, and its price in
			Pipes.
		</p>

		<form class="verify-form" onsubmit={handleSubmit}>
			<input
				bind:value={certificateNumber}
				placeholder="CERT-2026-ABC123DEF456"
				aria-label="Certificate number"
				autocomplete="off"
				spellcheck="false"
			/>
			<button type="submit" disabled={loading}>{loading ? 'Verifying…' : 'Verify'}</button>
		</form>

		{#if error}
			<div class="message error">{error}</div>
		{/if}

		{#if result}
			<div class="message success">
				<h2>{result.recipientName}</h2>
				<p><strong>Certificate No.</strong> {result.certificateNumber}</p>
				<p><strong>Item price:</strong> {result.approvedHours} Pipes</p>
				<p><strong>Item:</strong> {result.awardItem}</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.verify-page {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 24px;
		background:
			radial-gradient(circle at top left, rgba(196, 131, 130, 0.22), transparent 28%),
			radial-gradient(circle at bottom right, rgba(75, 72, 64, 0.12), transparent 26%),
			linear-gradient(135deg, #f5eee4 0%, #fcfbf8 55%, #eee6da 100%);
		color: #453733;
	}

	.verify-card {
		width: min(760px, 100%);
		background: rgba(255, 255, 255, 0.92);
		border: 1px solid rgba(75, 72, 64, 0.18);
		border-radius: 24px;
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.12);
		padding: 32px;
	}

	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 0.24em;
		font-size: 12px;
		color: #8c5f4b;
		font-weight: 800;
	}

	h1 {
		margin-top: 8px;
		font-size: clamp(2rem, 5vw, 3.4rem);
		line-height: 0.95;
	}

	.lead {
		margin-top: 14px;
		color: rgba(69, 55, 51, 0.74);
		line-height: 1.5;
		max-width: 60ch;
	}

	.verify-form {
		display: flex;
		gap: 12px;
		margin-top: 22px;
	}

	input {
		flex: 1;
		border: 1px solid rgba(75, 72, 64, 0.24);
		border-radius: 999px;
		padding: 14px 18px;
		font: inherit;
		font-weight: 700;
		letter-spacing: 0.05em;
		outline: none;
	}

	input:focus {
		border-color: rgba(140, 95, 75, 0.7);
		box-shadow: 0 0 0 4px rgba(140, 95, 75, 0.14);
	}

	button {
		border: 0;
		border-radius: 999px;
		padding: 14px 22px;
		background: linear-gradient(135deg, #6f4b3e, #9d6b50);
		color: white;
		font: inherit;
		font-weight: 900;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.7;
		cursor: progress;
	}

	.message {
		margin-top: 18px;
		border-radius: 18px;
		padding: 18px;
		line-height: 1.5;
	}

	.message.error {
		border: 1px solid rgba(75, 72, 64, 0.2);
		background: rgba(75, 72, 64, 0.06);
	}

	.message.success {
		border: 1px solid rgba(140, 95, 75, 0.28);
		background: rgba(196, 131, 130, 0.12);
	}

	.message h2 {
		font-size: 1.5rem;
		margin-bottom: 8px;
	}

	.message p {
		margin: 4px 0;
	}

	@media (max-width: 720px) {
		.verify-card {
			padding: 22px;
		}

		.verify-form {
			flex-direction: column;
		}
	}
</style>
