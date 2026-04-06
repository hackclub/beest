<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	let impersonating = $state(false);

	function checkImpersonating() {
		impersonating = document.cookie.split(';').some(c => c.trim().startsWith('impersonating='));
	}

	async function endImpersonation() {
		const res = await fetch('/api/auth/end-impersonate', { method: 'POST' });
		if (res.ok) {
			window.location.href = '/admin';
		}
	}

	$effect(() => {
		checkImpersonating();
		if (localStorage.getItem('customCursor') !== 'off') {
			document.documentElement.classList.add('custom-cursor');
		}
	});
</script>

<svelte:head>
	<title>Beest</title>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if impersonating}
	<button class="end-impersonate" onclick={endImpersonation}>
		End Impersonation
	</button>
{/if}

{@render children()}

<style>
	.end-impersonate {
		position: fixed;
		top: 12px;
		right: 12px;
		z-index: 99999;
		background: #cc2222;
		color: #fff;
		border: 2px solid #ff4444;
		padding: 8px 18px;
		font-size: 14px;
		font-weight: 700;
		border-radius: 6px;
		cursor: pointer;
		box-shadow: none;
		transition: background 0.15s;
	}
	.end-impersonate:hover {
		background: #ee3333;
	}

	@media (pointer: fine) {
		:global(html.custom-cursor *) {
			cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='28' viewBox='0 0 32 36'%3E%3Cpolygon points='3,2 3,30 12,23 19,34 25,31 18,20 29,17' fill='%23ffffff' stroke='%234b4840' stroke-width='3' stroke-linejoin='round'/%3E%3C/svg%3E") 2 2, auto;
		}

		:global(html.custom-cursor *:active) {
			cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='36' viewBox='0 0 32 36'%3E%3Cpolygon points='3,2 3,30 12,23 19,34 25,31 18,20 29,17' fill='%23ffffff' stroke='%234b4840' stroke-width='3' stroke-linejoin='round'/%3E%3C/svg%3E") 3 2, auto;
		}
	}
</style>
