<!-- src/routes/schedule/+page.svelte -->
<!-- Color Pallet
 #c48382 - Light Red
 #93b4cd - Light Blue
 #4b4840 - Dark Gray
 #6c6659 - Medium Gray
 #7f796d - Light Gray
 #cbc1ae - Beige
 #809fb7 - Light Steel Blue
 #e6f4fe - Light Cyan
 #ffffff - White
-->

<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import type { ScheduleEvent } from '$lib/types/schedule';

	let { data }: { data: PageData } = $props();

	// The schedule is a venue timetable, so unlike the rest of the site it pins
	// event-local time (Europe/Amsterdam) instead of the viewer's timezone.
	const TZ = 'Europe/Amsterdam';
	const DAY_KEYS = ['2026-08-19', '2026-08-20', '2026-08-21'];
	const PX_PER_MIN = 1.1;
	const GUTTER = 56; // px reserved for the hour labels

	const partsFmt = new Intl.DateTimeFormat('en-CA', {
		timeZone: TZ,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	});
	const timeFmt = new Intl.DateTimeFormat('en-GB', {
		timeZone: TZ,
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	});
	const weekdayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short' });

	/** Wall-clock day key (YYYY-MM-DD) + minutes since midnight in Amsterdam. */
	function amsInfo(d: Date): { key: string; minutes: number } {
		const parts: Record<string, string> = {};
		for (const p of partsFmt.formatToParts(d)) parts[p.type] = p.value;
		return {
			key: `${parts.year}-${parts.month}-${parts.day}`,
			minutes: Number(parts.hour) * 60 + Number(parts.minute)
		};
	}

	function defaultDay(d: Date): string {
		const key = amsInfo(d).key;
		if (key <= DAY_KEYS[0]) return DAY_KEYS[0];
		if (key >= DAY_KEYS[DAY_KEYS.length - 1]) return DAY_KEYS[DAY_KEYS.length - 1];
		return DAY_KEYS.includes(key) ? key : DAY_KEYS[0];
	}

	let events: ScheduleEvent[] = $state(data.events);
	let now: Date = $state(new Date());
	let selectedDay: string = $state(defaultDay(new Date()));
	let expandedId: string | null = $state(null);

	const days = DAY_KEYS.map((key) => ({
		key,
		weekday: weekdayFmt.format(new Date(`${key}T12:00:00+02:00`)),
		dayNum: String(Number(key.slice(8)))
	}));

	let nowKey = $derived(amsInfo(now).key);
	let nowMin = $derived(amsInfo(now).minutes);

	let currentEvents = $derived(
		events.filter((e) => !e.allDay && new Date(e.start) <= now && now < new Date(e.end))
	);

	let nextEvent = $derived.by(() => {
		if (currentEvents.length > 0) return null;
		const weekendEnd = new Date(`${DAY_KEYS[DAY_KEYS.length - 1]}T23:59:59+02:00`);
		if (now > weekendEnd) return null;
		return events.find((e) => !e.allDay && new Date(e.start) > now) ?? null;
	});

	let allDayEvents = $derived(
		events.filter((e) => e.allDay && e.start <= selectedDay && selectedDay < e.end)
	);

	interface TimedItem {
		event: ScheduleEvent;
		startMin: number;
		endMin: number;
		fromPrevDay: boolean;
	}
	interface PositionedItem extends TimedItem {
		col: number;
		cols: number;
	}

	function timedForDay(key: string): TimedItem[] {
		const items: TimedItem[] = [];
		for (const e of events) {
			if (e.allDay) continue;
			const start = new Date(e.start);
			const end = new Date(e.end);
			if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
			const s = amsInfo(start);
			const en = amsInfo(end);
			if (s.key > key || en.key < key) continue;
			const startMin = s.key < key ? 0 : s.minutes;
			const endMin = en.key > key ? 1440 : en.minutes;
			if (endMin <= startMin) continue; // e.g. ends exactly at this day's midnight
			items.push({ event: e, startMin, endMin, fromPrevDay: s.key < key });
		}
		return items;
	}

	/** Assigns overlapping events to side-by-side columns (per overlap cluster). */
	function layoutDay(items: TimedItem[]): PositionedItem[] {
		const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
		const result: PositionedItem[] = [];
		let cluster: TimedItem[] = [];
		let clusterEnd = -1;

		const flush = () => {
			if (cluster.length === 0) return;
			const colEnds: number[] = [];
			const assigned = cluster.map((it) => {
				let col = colEnds.findIndex((end) => end <= it.startMin);
				if (col === -1) {
					col = colEnds.length;
					colEnds.push(it.endMin);
				} else {
					colEnds[col] = it.endMin;
				}
				return { ...it, col };
			});
			for (const a of assigned) result.push({ ...a, cols: colEnds.length });
			cluster = [];
		};

		for (const it of sorted) {
			if (cluster.length > 0 && it.startMin >= clusterEnd) flush();
			cluster.push(it);
			clusterEnd = cluster.length === 1 ? it.endMin : Math.max(clusterEnd, it.endMin);
		}
		flush();
		return result;
	}

	let dayView = $derived.by(() => {
		const timed = timedForDay(selectedDay);
		if (timed.length === 0) return null;
		// Overnight tails (events that started the previous day) must not drag
		// the grid back to midnight — a tail ending before the day's first own
		// event becomes a compact chip above the grid instead.
		const own = timed.filter((t) => !t.fromPrevDay);
		const base = own.length > 0 ? own : timed;
		const startHour = Math.floor(Math.min(...base.map((t) => t.startMin)) / 60);
		const gridItems = timed
			.filter((t) => t.endMin > startHour * 60)
			.map((t) => ({ ...t, startMin: Math.max(t.startMin, startHour * 60) }));
		const earlyTails = timed.filter((t) => t.endMin <= startHour * 60);
		const endHour = Math.min(24, Math.ceil(Math.max(...gridItems.map((t) => t.endMin)) / 60));
		return {
			startHour,
			endHour,
			positioned: layoutDay(gridItems),
			earlyTails,
			height: (endHour - startHour) * 60 * PX_PER_MIN
		};
	});

	let nowBarTop = $derived.by(() => {
		if (!dayView || nowKey !== selectedDay) return null;
		if (nowMin < dayView.startHour * 60 || nowMin > dayView.endHour * 60) return null;
		return (nowMin - dayView.startHour * 60) * PX_PER_MIN;
	});

	let expandedEvent = $derived(events.find((e) => e.id === expandedId) ?? null);

	function isCurrent(e: ScheduleEvent): boolean {
		return !e.allDay && new Date(e.start) <= now && now < new Date(e.end);
	}

	function timeRange(e: ScheduleEvent): string {
		if (e.allDay) return 'All day';
		return `${timeFmt.format(new Date(e.start))}–${timeFmt.format(new Date(e.end))}`;
	}

	function dayLabelOf(e: ScheduleEvent): string {
		const key = e.allDay ? e.start : amsInfo(new Date(e.start)).key;
		const day = days.find((d) => d.key === key);
		return day ? `${day.weekday} ${day.dayNum}` : key;
	}

	function toggleDetails(id: string) {
		expandedId = expandedId === id ? null : id;
	}

	function selectDay(key: string) {
		selectedDay = key;
		expandedId = null;
	}

	function stepDay(delta: number) {
		const i = DAY_KEYS.indexOf(selectedDay) + delta;
		if (i >= 0 && i < DAY_KEYS.length) selectDay(DAY_KEYS[i]);
	}

	async function jumpTo(e: ScheduleEvent) {
		selectedDay = defaultDay(new Date(e.start));
		expandedId = e.id;
		await tick();
		document.getElementById(`evt-${e.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	function onTablistKeydown(ev: KeyboardEvent) {
		if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
		ev.preventDefault();
		stepDay(ev.key === 'ArrowLeft' ? -1 : 1);
		tick().then(() => {
			document.querySelector<HTMLButtonElement>('.day-tab[aria-selected="true"]')?.focus();
		});
	}

	// Horizontal swipe on the timeline area moves between days.
	let touchStartX = 0;
	let touchStartY = 0;
	function onTouchStart(ev: TouchEvent) {
		touchStartX = ev.touches[0].clientX;
		touchStartY = ev.touches[0].clientY;
	}
	function onTouchEnd(ev: TouchEvent) {
		const dx = ev.changedTouches[0].clientX - touchStartX;
		const dy = ev.changedTouches[0].clientY - touchStartY;
		if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) stepDay(dx < 0 ? 1 : -1);
	}

	onMount(() => {
		now = new Date();
		selectedDay = defaultDay(now);
		const nowTimer = setInterval(() => (now = new Date()), 30_000);
		const refreshTimer = setInterval(async () => {
			try {
				const res = await fetch(resolve('/api/schedule'));
				if (res.ok) {
					const body = (await res.json()) as { events?: ScheduleEvent[] };
					if (Array.isArray(body.events)) events = body.events;
				}
			} catch {
				// Keep showing what we have; the next poll may succeed.
			}
		}, 5 * 60_000);
		return () => {
			clearInterval(nowTimer);
			clearInterval(refreshTimer);
		};
	});

	function hourLabel(h: number): string {
		return `${String(h % 24).padStart(2, '0')}:00`;
	}

	function hours(view: { startHour: number; endHour: number }): number[] {
		const out: number[] = [];
		for (let h = view.startHour; h <= view.endHour; h++) out.push(h);
		return out;
	}
</script>

<svelte:head>
	<title>Schedule — Beest</title>
	<meta name="description" content="The Beest event schedule, August 19–21." />
</svelte:head>

<div class="schedule-page">
	<header class="sched-header">
		<div class="title-row">
			<h1>Schedule</h1>
			<span class="tz-note">Netherlands time (CEST)</span>
		</div>
		<div class="day-tabs" role="tablist" aria-label="Event days">
			{#each days as day (day.key)}
				<button
					class="day-tab"
					class:active={selectedDay === day.key}
					class:today={nowKey === day.key}
					role="tab"
					aria-selected={selectedDay === day.key}
					aria-controls="day-panel"
					tabindex={selectedDay === day.key ? 0 : -1}
					onclick={() => selectDay(day.key)}
					onkeydown={onTablistKeydown}
				>
					<span class="day-tab-weekday">{day.weekday}</span>
					<span class="day-tab-num">{day.dayNum}</span>
					{#if nowKey === day.key}<span class="today-dot" aria-hidden="true"></span>{/if}
				</button>
			{/each}
		</div>
	</header>

	<main ontouchstart={onTouchStart} ontouchend={onTouchEnd}>
		<div id="day-panel" role="tabpanel" aria-label="Schedule for {selectedDay}">
			{#if currentEvents.length > 0}
				<button class="pin-card now" onclick={() => jumpTo(currentEvents[0])}>
					<span class="pin-chip">Happening now</span>
					<span class="pin-title">{currentEvents[0].title}</span>
					<span class="pin-meta">
						until {timeFmt.format(new Date(currentEvents[0].end))}
						{#if currentEvents[0].location}&middot; {currentEvents[0].location}{/if}
						{#if currentEvents.length > 1}&middot; +{currentEvents.length - 1} more{/if}
					</span>
				</button>
			{:else if nextEvent}
				<button class="pin-card next" onclick={() => nextEvent && jumpTo(nextEvent)}>
					<span class="pin-chip">Up next</span>
					<span class="pin-title">{nextEvent.title}</span>
					<span class="pin-meta">
						{dayLabelOf(nextEvent)} &middot; {timeFmt.format(new Date(nextEvent.start))}
						{#if nextEvent.location}&middot; {nextEvent.location}{/if}
					</span>
				</button>
			{/if}

			{#if allDayEvents.length > 0 || (dayView && dayView.earlyTails.length > 0)}
				<div class="allday-row" aria-label="All-day and overnight">
					{#each allDayEvents as e (e.id)}
						<button class="allday-chip" onclick={() => toggleDetails(e.id)}>{e.title}</button>
					{/each}
					{#each dayView?.earlyTails ?? [] as t (t.event.id)}
						<button class="allday-chip tail" onclick={() => toggleDetails(t.event.id)}>
							{t.event.title} &middot; until {timeFmt.format(new Date(t.event.end))}
						</button>
					{/each}
				</div>
			{/if}

			{#if dayView}
				<div class="timeline" style="height:{dayView.height}px">
					{#each hours(dayView) as h (h)}
						<div class="hour-line" style="top:{(h - dayView.startHour) * 60 * PX_PER_MIN}px">
							<span class="hour-label">{hourLabel(h)}</span>
						</div>
					{/each}

					{#each dayView.positioned as item (item.event.id + item.event.start)}
						<button
							id="evt-{item.event.id}"
							class="event-block"
							class:current={isCurrent(item.event)}
							class:expanded={expandedId === item.event.id}
							style="
							top:{(item.startMin - dayView.startHour * 60) * PX_PER_MIN}px;
							height:{Math.max((item.endMin - item.startMin) * PX_PER_MIN, 26)}px;
							left:calc({GUTTER}px + (100% - {GUTTER + 4}px) * {item.col / item.cols});
							width:calc((100% - {GUTTER + 4}px) * {1 / item.cols} - 4px);
						"
							onclick={() => toggleDetails(item.event.id)}
						>
							{#if isCurrent(item.event)}<span class="event-now-tag">now</span>{/if}
							<span class="event-title">{item.event.title}</span>
							<span class="event-meta">
								{timeRange(item.event)}{#if item.event.location}&nbsp;&middot; {item.event
										.location}{/if}
							</span>
						</button>
					{/each}

					{#if nowBarTop !== null}
						<div class="now-bar" style="top:{nowBarTop}px" aria-hidden="true">
							<span class="now-bar-time">{timeFmt.format(now)}</span>
						</div>
					{/if}
				</div>
			{:else}
				<div class="empty-day">
					<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
						<g fill="#6c6659">
							<circle cx="50" cy="50" r="30" />
							{#each Array(8) as _, t (t)}
								<rect
									x="43"
									y="4"
									width="14"
									height="22"
									rx="3"
									transform="rotate({t * 45} 50 50)"
								/>
							{/each}
						</g>
						<circle cx="50" cy="50" r="12" fill="#3a3530" />
					</svg>
					<p>Nothing on the timetable for this day yet. Check back soon!</p>
				</div>
			{/if}
		</div>
	</main>

	{#if expandedEvent}
		<aside class="detail-panel" aria-label="Event details">
			<div class="detail-head">
				<h2>{expandedEvent.title}</h2>
				<button class="detail-close" onclick={() => (expandedId = null)} aria-label="Close details">
					&times;
				</button>
			</div>
			<p class="detail-meta">
				{dayLabelOf(expandedEvent)} &middot; {timeRange(expandedEvent)}
				{#if expandedEvent.location}&middot; {expandedEvent.location}{/if}
			</p>
			{#if expandedEvent.description}
				<p class="detail-desc">{expandedEvent.description}</p>
			{/if}
		</aside>
	{/if}

	<a href={resolve('/')} class="back-btn">Back to main site</a>
</div>

<style>
	@font-face {
		font-family: 'Stone Breaker';
		src: url('/fonts/Stone Breaker.woff2') format('woff2');
		font-weight: normal;
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

	:global(body) {
		margin: 0;
		padding: 0;
		background-color: #4b4840;
		overflow-x: hidden;
	}

	.schedule-page {
		background: #4b4840;
		min-height: 100vh;
		position: relative;
		overflow-x: clip;
		padding-bottom: 2rem;
	}

	.schedule-page::after {
		content: '';
		position: absolute;
		inset: 0;
		background: url('/images/tile.webp') repeat;
		opacity: 0.06;
		mix-blend-mode: overlay;
		pointer-events: none;
	}

	.schedule-page > * {
		position: relative;
		z-index: 1;
	}

	/* ── Sticky header ─────────────────────────────────────────── */

	.sched-header {
		position: sticky;
		top: 0;
		z-index: 40;
		background: #4b4840;
		border-bottom: 2px solid #2e2a26;
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
		padding: 0.75rem 1rem 0.75rem;
	}

	.title-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		max-width: 760px;
		margin: 0 auto 0.6rem;
	}

	h1 {
		font-family: 'Stone Breaker', 'Courier New', monospace;
		color: #cbc1ae;
		font-size: 1.6rem;
		margin: 0;
		letter-spacing: 0.04em;
	}

	.tz-note {
		font-family: 'Courier New', monospace;
		font-size: 0.72rem;
		color: #cbc1ae;
		opacity: 0.7;
		white-space: nowrap;
	}

	.day-tabs {
		display: flex;
		gap: 0.5rem;
		max-width: 760px;
		margin: 0 auto;
	}

	.day-tab {
		position: relative;
		flex: 1;
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.6rem 0.5rem 0.7rem;
		background: #3a3530;
		border: 2px solid #2e2a26;
		border-radius: 8px;
		cursor: pointer;
		font-family: 'Sunny Mood', 'Courier New', monospace;
		color: #e6e2da;
		transition:
			background 0.2s,
			border-color 0.2s;
	}

	.day-tab:hover {
		background: #56504a;
	}

	.day-tab:focus-visible {
		outline: 2px solid #cbc1ae;
		outline-offset: 2px;
	}

	.day-tab.active {
		background: #cbc1ae;
		border-color: #cbc1ae;
		color: #2e2a26;
	}

	.day-tab-weekday {
		font-size: 1.05rem;
	}

	.day-tab-num {
		font-family: 'Stone Breaker', 'Courier New', monospace;
		font-size: 1.15rem;
	}

	.today-dot {
		position: absolute;
		bottom: 5px;
		left: 50%;
		transform: translateX(-50%);
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #c48382;
	}

	/* ── Main column ───────────────────────────────────────────── */

	main {
		max-width: 760px;
		margin: 0 auto;
		padding: 1rem;
	}

	/* ── Pinned "now" / "up next" card ─────────────────────────── */

	.pin-card {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		width: 100%;
		text-align: left;
		background: #3a3530;
		border: 2px solid #c48382;
		border-radius: 8px;
		padding: 0.9rem 1rem;
		margin-bottom: 1rem;
		cursor: pointer;
		box-shadow:
			0 4px 8px rgba(0, 0, 0, 0.3),
			0 8px 20px rgba(0, 0, 0, 0.25);
	}

	.pin-card.next {
		border-color: #809fb7;
	}

	.pin-card:focus-visible {
		outline: 2px solid #cbc1ae;
		outline-offset: 2px;
	}

	.pin-chip {
		font-family: 'Sunny Mood', 'Courier New', monospace;
		font-size: 0.95rem;
		color: #c48382;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.pin-card.next .pin-chip {
		color: #93b4cd;
	}

	.pin-title {
		font-family: 'Stone Breaker', 'Courier New', monospace;
		font-size: 1.15rem;
		color: #e6e2da;
		letter-spacing: 0.03em;
	}

	.pin-meta {
		font-family: 'Courier New', monospace;
		font-size: 0.8rem;
		color: #cbc1ae;
	}

	/* ── All-day chips ─────────────────────────────────────────── */

	.allday-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.allday-chip {
		font-family: 'Sunny Mood', 'Courier New', monospace;
		font-size: 0.95rem;
		color: #2e2a26;
		background: #93b4cd;
		border: 2px solid #2e2a26;
		border-radius: 999px;
		padding: 0.25rem 0.8rem;
		cursor: pointer;
	}

	.allday-chip:focus-visible {
		outline: 2px solid #cbc1ae;
		outline-offset: 2px;
	}

	.allday-chip.tail {
		background: #cbc1ae;
	}

	/* ── Timeline ──────────────────────────────────────────────── */

	.timeline {
		position: relative;
		margin-top: 0.5rem;
	}

	.hour-line {
		position: absolute;
		left: 0;
		right: 0;
		border-top: 1px solid rgba(230, 226, 218, 0.12);
	}

	.hour-label {
		position: absolute;
		top: -0.6em;
		left: 0;
		font-family: 'Sunny Mood', 'Courier New', monospace;
		font-size: 0.85rem;
		color: #cbc1ae;
		background: #4b4840;
		padding-right: 4px;
	}

	.event-block {
		position: absolute;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		overflow: hidden;
		text-align: left;
		background: #3a3530;
		border: 2px solid #2e2a26;
		border-radius: 8px;
		padding: 0.35rem 0.55rem;
		cursor: pointer;
		font-family: 'Courier New', monospace;
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
		transition:
			border-color 0.2s,
			background 0.2s;
	}

	.event-block:hover {
		background: #56504a;
	}

	.event-block:focus-visible {
		outline: 2px solid #cbc1ae;
		outline-offset: 2px;
	}

	.event-block.expanded {
		border-color: #cbc1ae;
	}

	.event-block.current {
		border-color: #c48382;
		background: #453733;
		box-shadow:
			0 0 0 1px rgba(196, 131, 130, 0.4),
			0 4px 12px rgba(0, 0, 0, 0.4);
	}

	.event-now-tag {
		position: absolute;
		top: 0.3rem;
		right: 0.45rem;
		font-family: 'Sunny Mood', 'Courier New', monospace;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #c48382;
	}

	.event-title {
		font-weight: bold;
		font-size: 0.85rem;
		color: #e6e2da;
		line-height: 1.25;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.event-meta {
		font-size: 0.72rem;
		color: #cbc1ae;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.now-bar {
		position: absolute;
		left: calc(56px - 8px);
		right: 0;
		border-top: 2px solid #c48382;
		pointer-events: none;
		z-index: 5;
	}

	.now-bar::before {
		content: '';
		position: absolute;
		left: -4px;
		top: -6px;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #c48382;
	}

	.now-bar-time {
		position: absolute;
		left: -48px;
		top: -0.6em;
		font-family: 'Sunny Mood', 'Courier New', monospace;
		font-size: 0.85rem;
		color: #c48382;
		background: #4b4840;
		padding-right: 4px;
		z-index: 1;
	}

	/* ── Empty day ─────────────────────────────────────────────── */

	.empty-day {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 3rem 1rem;
		text-align: center;
	}

	.empty-day svg {
		width: 72px;
		height: 72px;
		opacity: 0.8;
	}

	.empty-day p {
		font-family: 'Courier New', monospace;
		color: #cbc1ae;
		font-size: 0.95rem;
		max-width: 32ch;
		margin: 0;
	}

	/* ── Sticky-bottom detail panel ────────────────────────────── */

	.detail-panel {
		position: sticky;
		bottom: 0.75rem;
		z-index: 30;
		max-width: 728px;
		margin: 1rem auto 0;
		background: #3a3530;
		border: 2px solid #cbc1ae;
		border-radius: 8px;
		padding: 0.9rem 1rem;
		box-shadow:
			0 8px 16px rgba(0, 0, 0, 0.4),
			0 16px 36px rgba(0, 0, 0, 0.35);
	}

	@media (max-width: 792px) {
		.detail-panel {
			margin-left: 1rem;
			margin-right: 1rem;
		}
	}

	.detail-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	.detail-head h2 {
		font-family: 'Stone Breaker', 'Courier New', monospace;
		font-size: 1.1rem;
		color: #e6e2da;
		letter-spacing: 0.03em;
		margin: 0;
	}

	.detail-close {
		background: none;
		border: none;
		color: #cbc1ae;
		font-size: 1.5rem;
		line-height: 1;
		cursor: pointer;
		padding: 0 0.2rem;
	}

	.detail-close:focus-visible {
		outline: 2px solid #cbc1ae;
		outline-offset: 2px;
	}

	.detail-meta {
		font-family: 'Sunny Mood', 'Courier New', monospace;
		font-size: 0.95rem;
		color: #cbc1ae;
		margin: 0.35rem 0 0;
	}

	.detail-desc {
		font-family: 'Courier New', monospace;
		font-size: 0.85rem;
		line-height: 1.6;
		color: #e6e2da;
		margin: 0.6rem 0 0;
		white-space: pre-line;
		max-height: 30vh;
		overflow-y: auto;
	}

	/* ── Back link ─────────────────────────────────────────────── */

	.back-btn {
		display: block;
		width: fit-content;
		margin: 2rem auto 0;
		font-family: 'Sunny Mood', 'Courier New', monospace;
		font-size: 1rem;
		color: #cbc1ae;
		text-decoration: none;
		border: 2px solid #2e2a26;
		background: #3a3530;
		border-radius: 8px;
		padding: 0.5rem 1.2rem;
	}

	.back-btn:hover {
		background: #56504a;
	}

	/* ── Larger screens ────────────────────────────────────────── */

	@media (min-width: 720px) {
		h1 {
			font-size: 2.2rem;
		}

		.sched-header {
			padding: 1rem 1.5rem;
		}

		main {
			padding: 1.5rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.day-tab,
		.event-block {
			transition: none;
		}
	}
</style>
