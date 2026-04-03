<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="error-page">
	<div class="error-content">
		<h1>{page.status === 404 ? 'How did you get here?' : page.status}</h1>
		<p>{page.error?.message ?? 'Something went wrong'}</p>
		<img
			src="https://http.cat/{page.status}"
			alt="HTTP {page.status} cat"
			class="cat-img"
		/>
		<a href="/home" class="back-link">← Back to safety</a>
	</div>
</div>

<style>
	@font-face {
		font-family: "Stone Breaker";
		src: url("/fonts/Stone Breaker.woff2") format("woff2");
		font-weight: normal;
		font-style: normal;
		font-display: swap;
	}

	@font-face {
		font-family: "Sunny Mood";
		src: url("/fonts/SunnyMood.woff2") format("woff2");
		font-weight: normal;
		font-style: normal;
		font-display: swap;
	}

	.error-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #4b4840;
		padding: 2rem;
	}

	.error-content {
		text-align: center;
		max-width: 600px;
	}

	h1 {
		font-size: 3rem;
		color: #d4c9a8;
		margin: 0;
		font-family: "Stone Breaker", "Courier New", monospace;
	}

	p {
		font-size: 1.4rem;
		color: #a89e8a;
		margin: 0.5rem 0 2rem;
		font-family: "Sunny Mood", "Courier New", monospace;
	}

	.cat-img {
		width: 100%;
		max-width: 700px;
		clip-path: polygon(
			2% 5%, 8% 1%, 15% 4%, 22% 0%, 30% 3%, 38% 1%, 45% 4%, 52% 0%,
			60% 3%, 68% 1%, 75% 4%, 82% 0%, 90% 3%, 95% 1%, 98% 5%,
			100% 12%, 99% 20%, 100% 28%, 99% 36%, 100% 44%, 99% 52%,
			100% 60%, 99% 68%, 100% 76%, 99% 84%, 100% 92%, 98% 97%,
			92% 100%, 85% 98%, 78% 100%, 70% 98%, 62% 100%, 55% 98%,
			48% 100%, 40% 98%, 32% 100%, 25% 98%, 18% 100%, 10% 98%,
			5% 100%, 2% 97%, 0% 90%, 1% 82%, 0% 74%, 1% 66%, 0% 58%,
			1% 50%, 0% 42%, 1% 34%, 0% 26%, 1% 18%, 0% 10%
		);
		border-radius: 4px;
	}

	.back-link {
		display: inline-block;
		margin-top: 2rem;
		color: #d4c9a8;
		text-decoration: none;
		font-size: 1.2rem;
		font-family: "Sunny Mood", "Courier New", monospace;
		padding: 0.6rem 1.4rem;
		background: #635a4e;
		clip-path: polygon(
			3% 8%, 12% 0%, 25% 5%, 40% 1%, 55% 6%, 70% 0%, 85% 4%, 97% 2%,
			100% 30%, 98% 60%, 100% 85%, 95% 100%,
			80% 95%, 60% 100%, 40% 96%, 20% 100%, 5% 95%,
			0% 70%, 2% 40%
		);
		transition: background 0.2s;
	}

	.back-link:hover {
		background: #786e5c;
	}
</style>
