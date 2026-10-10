<script lang="ts">
	import './crescent.css';
	import { CRESCENT_URL } from './crescent';

	// BEEST has ended; Crescent is Hack Club's next YSWS. This is the nudge
	// over there, in Crescent's own plate, faces and button (crescent.css),
	// pinned onto the page at a slight tilt like BEEST's own stuck-on parts.
	//
	// `banner` is the strip on the platform; `hero` is the card in the landing
	// page's hero, over the sign-up box and wider than it.
	let { variant = 'banner' }: { variant?: 'banner' | 'hero' } = $props();
</script>

<div class="cta-wrap crescent-true-colour {variant}">
	<aside class="cta crescent-plate" aria-label="Crescent, Hack Club's next program">
		<img
			class="cta-logo"
			src="/images/crescent/logo.webp"
			alt="Crescent"
			width="480"
			height="237"
			decoding="async"
		/>
		<div class="cta-copy">
			<p class="cta-title crescent-display">BEEST is over. <em>Crescent is on.</em></p>
			<p class="cta-lead crescent-body">
				{#if variant === 'hero'}
					Hack Club's next YSWS: pick a card every week, build it, keep the loot.
				{:else}
					Hack Club's next YSWS is live: pick a card every week, build it, keep the loot. Your BEEST
					projects can come along. Open one and press <strong>Move to Crescent</strong>.
				{/if}
			</p>
		</div>
		<a class="cta-go crescent-button" href={CRESCENT_URL} target="_blank" rel="noopener">
			Go to Crescent
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg
			>
		</a>
	</aside>
</div>

<style>
	.cta-wrap {
		rotate: -0.5deg;
	}

	.cta {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 22px;
		padding: 16px 22px 16px 18px;
	}

	.cta-logo {
		display: block;
		width: 132px;
		height: auto;
	}

	.cta-copy {
		display: grid;
		gap: 4px;
		min-width: 0;
	}

	.cta-title {
		font-size: 24px;
	}

	.cta-lead {
		font-size: 16px;
	}

	.cta-lead strong {
		color: #ecdec3;
		font-weight: 800;
	}

	/* Hero: wider than the sign-up column it sits in, growing to the left over
	   the ground, with the button under the words. */
	.cta-wrap.hero {
		--cta-width: clamp(440px, 44vw, 640px);
		width: var(--cta-width);
		margin: 0 0 26px calc(100% - var(--cta-width));
		rotate: 0.8deg;
	}

	.hero .cta {
		grid-template-columns: auto minmax(0, 1fr);
		grid-template-areas:
			'logo copy'
			'logo go';
		row-gap: 14px;
		padding: 18px 22px;
	}

	.hero .cta-logo {
		grid-area: logo;
		align-self: center;
		width: 140px;
	}

	.hero .cta-copy {
		grid-area: copy;
	}

	.hero .cta-go {
		grid-area: go;
		justify-self: start;
	}

	@media (max-width: 760px) {
		.cta,
		.hero .cta {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas: none;
			justify-items: start;
			gap: 12px;
		}

		.hero .cta-logo,
		.hero .cta-copy,
		.hero .cta-go {
			grid-area: auto;
		}

		.cta-logo,
		.hero .cta-logo {
			width: 112px;
		}

		.cta-go,
		.hero .cta-go {
			justify-self: stretch;
		}

		.cta-wrap.hero {
			width: auto;
			margin: 0 0 8px;
		}
	}
</style>
