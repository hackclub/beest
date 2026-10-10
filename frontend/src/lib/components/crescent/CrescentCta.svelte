<script lang="ts">
	import { CRESCENT_URL } from './crescent';

	// BEEST has ended; Crescent is Hack Club's next YSWS. This is the nudge
	// over there: Crescent's night sky, logo and serif, cut to BEEST's shapes
	// (a pinned-on, slightly tilted panel with a hard shadow and a chunky key
	// for a button) so it reads as a poster for the next thing rather than a
	// hole in the page.
	//
	// `banner` is the slim strip on the platform; `hero` is the stacked card in
	// the landing page's hero, next to the sign-up box.
	let { variant = 'banner' }: { variant?: 'banner' | 'hero' } = $props();
</script>

<div class="crescent-cta-wrap {variant}">
	<aside class="crescent-cta" aria-label="Crescent, Hack Club's next program">
		<img
			class="crescent-logo"
			src="/images/crescent/logo.webp"
			alt="Crescent"
			width="480"
			height="237"
			decoding="async"
		/>
		<div class="crescent-copy">
			<p class="crescent-title">BEEST is over. <span>Crescent is on.</span></p>
			<p class="crescent-lead">
				{#if variant === 'hero'}
					Hack Club's next YSWS: pick a card every week, build it, keep the loot.
				{:else}
					Hack Club's next YSWS is live. Pick a card every week, build it, keep the loot. Your BEEST
					projects can come along: open one and press <strong>Move to Crescent</strong>.
				{/if}
			</p>
		</div>
		<a class="crescent-go" href={CRESCENT_URL} target="_blank" rel="noopener">
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

	/* The hard shadow lives on the wrapper as a drop-shadow, because the panel's
	   cut corners are a clip-path, which would clip a box-shadow away. Both pages
	   it sits on run saturate(1.5) over their content, so this undoes it, the way
	   BEEST's own sticker cards do, and Crescent's colours arrive as themselves. */
	.crescent-cta-wrap {
		filter: saturate(0.667) drop-shadow(5px 5px 0 #2e2b25);
		rotate: -0.6deg;
	}

	.crescent-cta {
		position: relative;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 22px;
		padding: 14px 22px 14px 18px;
		/* Crescent's landing ramp (void, deep, mid, violet), with a scatter of
		   its stars on top. */
		background:
			radial-gradient(1.5px 1.5px at 8% 22%, #f5ead4 60%, transparent 70%),
			radial-gradient(1px 1px at 19% 78%, #f9c1ef 60%, transparent 70%),
			radial-gradient(1.5px 1.5px at 41% 14%, #f5ead4 60%, transparent 70%),
			radial-gradient(1px 1px at 57% 86%, #f5ead4 60%, transparent 70%),
			radial-gradient(2px 2px at 71% 30%, #f9c1ef 55%, transparent 70%),
			radial-gradient(1px 1px at 88% 72%, #f5ead4 60%, transparent 70%),
			radial-gradient(1.5px 1.5px at 96% 16%, #f5ead4 60%, transparent 70%),
			radial-gradient(120% 180% at 12% 0%, #56279d 0%, #2f1668 32%, #190c3e 64%, #0b061d 100%);
		border: 3px solid #0b061d;
		clip-path: polygon(
			16px 0,
			100% 0,
			100% calc(100% - 16px),
			calc(100% - 16px) 100%,
			0 100%,
			0 16px
		);
		color: #f5ead4;
	}

	.crescent-logo {
		display: block;
		width: 132px;
		height: auto;
		filter: drop-shadow(0 2px 0 #0b061d);
	}

	.crescent-copy {
		display: grid;
		gap: 4px;
		min-width: 0;
		text-align: left;
	}

	.crescent-title {
		margin: 0;
		font-family: 'Young Serif', Georgia, serif;
		font-weight: 400;
		font-size: 24px;
		line-height: 1.15;
		letter-spacing: -0.01em;
		text-shadow: 0 2px 0 #0b061d;
	}

	.crescent-title span {
		color: #f9c1ef;
	}

	.crescent-lead {
		margin: 0;
		font-family: 'Sunny Mood', 'Courier New', monospace;
		font-size: 16px;
		line-height: 1.35;
		letter-spacing: 0.02em;
		color: rgba(245, 234, 212, 0.86);
	}

	.crescent-lead strong {
		color: #f5ead4;
		font-weight: normal;
		text-decoration: underline;
		text-decoration-color: #9443c2;
		text-underline-offset: 3px;
	}

	/* BEEST's chunky key (.action-btn), in Crescent's violet. */
	.crescent-go {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 18px;
		background: #6632b5;
		color: #f5ead4;
		font-family: 'Sunny Mood', 'Courier New', monospace;
		font-size: 17px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		text-decoration: none;
		text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.3);
		white-space: nowrap;
		border: 3px solid #9443c2;
		border-bottom: 8px solid #3a1870;
		box-shadow: 4px 4px 0 #0b061d;
		transition:
			transform 0.1s ease,
			box-shadow 0.1s ease,
			border-bottom-width 0.1s ease;
	}

	.crescent-go svg {
		width: 18px;
		height: 18px;
	}

	.crescent-go:hover {
		transform: translate(-1px, -1px);
		box-shadow: 5px 5px 0 #0b061d;
	}

	.crescent-go:active {
		transform: translateY(5px);
		border-bottom-width: 3px;
		box-shadow: 2px 1px 0 #0b061d;
	}

	.crescent-go:focus-visible {
		outline: 3px solid #f9c1ef;
		outline-offset: 3px;
	}

	/* Hero: stacked, and pinned on at the opposite tilt to the sign-up box's
	   input, like the parts beside it. */
	.crescent-cta-wrap.hero {
		rotate: 1.2deg;
		margin-bottom: 26px;
	}

	.hero .crescent-cta {
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas:
			'logo logo'
			'copy go';
		row-gap: 10px;
		padding: 14px 18px 16px;
	}

	.hero .crescent-logo {
		grid-area: logo;
		width: 120px;
	}

	.hero .crescent-copy {
		grid-area: copy;
	}

	.hero .crescent-go {
		grid-area: go;
		align-self: end;
		padding: 8px 14px;
		font-size: 15px;
	}

	.hero .crescent-title {
		font-size: 20px;
	}

	.hero .crescent-lead {
		font-size: 14px;
	}

	@media (max-width: 760px) {
		.crescent-cta,
		.hero .crescent-cta {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas: none;
			justify-items: start;
			gap: 10px;
		}

		.crescent-logo,
		.hero .crescent-logo,
		.hero .crescent-copy,
		.hero .crescent-go {
			grid-area: auto;
		}

		.crescent-logo {
			width: 112px;
		}

		.crescent-cta-wrap.hero {
			margin-bottom: 8px;
		}

		.crescent-go {
			justify-self: stretch;
			justify-content: center;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.crescent-go {
			transition: none;
		}
	}
</style>
