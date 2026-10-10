<script lang="ts">
	import './crescent.css';
	import { CRESCENT_URL } from './crescent';

	// Beest has ended, and Crescent is made by the same people. This is the
	// nudge over there, in Crescent's own plate, faces and button
	// (crescent.css), pinned onto the page at a slight tilt like Beest's own
	// stuck-on parts.
	//
	// `banner` is the strip on the platform, with a button; `hero` is the card
	// in the landing page's hero, over the sign-up box and wider than it, and
	// the whole card is the link.
	let { variant = 'banner' }: { variant?: 'banner' | 'hero' } = $props();
</script>

{#snippet copy()}
	<img
		class="cta-logo"
		src="/images/crescent/logo.webp"
		alt="Crescent"
		width="480"
		height="237"
		decoding="async"
	/>
	<div class="cta-copy">
		<p class="cta-title crescent-display">Pick a card... <em>any card!</em></p>
		<p class="cta-lead crescent-body">
			From the creators of Beest, in Crescent, you get 4 different project ideas each week, and get
			boosts for making them! We'd love to see you there!
		</p>
	</div>
{/snippet}

<div class="cta-wrap crescent-true-colour {variant}">
	{#if variant === 'hero'}
		<a class="cta crescent-plate" href={CRESCENT_URL} target="_blank" rel="noopener">
			{@render copy()}
		</a>
	{:else}
		<aside class="cta crescent-plate" aria-label="Crescent">
			{@render copy()}
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
	{/if}
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

	/* Hero: a little wider than the sign-up column it sits in, growing to the
	   left over the ground, stacked: the logo on top, then the words. Beside
	   the words, the logo sat in the middle of a card taller than itself with
	   sky above and below it. */
	.cta-wrap.hero {
		--cta-width: clamp(400px, 36vw, 520px);
		width: var(--cta-width);
		margin: 0 0 26px calc(100% - var(--cta-width));
		rotate: 0.8deg;
	}

	/* The whole card is the link, so it answers the pointer the way a framed
	   project on Crescent's landing does: a touch bigger, its edge lit. */
	.hero .cta {
		grid-template-columns: minmax(0, 1fr);
		row-gap: 12px;
		padding: 18px 22px 20px;
		text-decoration: none;
		cursor: pointer;
		transition:
			transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
			border-color 0.3s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.hero .cta:hover {
		transform: scale(1.025);
		border-color: rgba(236, 222, 195, 0.42);
	}

	.hero .cta:active {
		transform: scale(0.99);
	}

	.hero .cta:focus-visible {
		outline: 3px solid #d574d1;
		outline-offset: 4px;
	}

	.hero .cta-logo {
		width: 128px;
	}

	@media (max-width: 760px) {
		.cta,
		.hero .cta {
			grid-template-columns: minmax(0, 1fr);
			justify-items: start;
			gap: 12px;
		}

		.cta-logo {
			width: 112px;
		}

		.cta-go {
			justify-self: stretch;
		}

		.cta-wrap.hero {
			width: auto;
			margin: 0 0 8px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.hero .cta {
			transition: border-color 0.3s ease;
		}

		.hero .cta:hover,
		.hero .cta:active {
			transform: none;
		}
	}
</style>
