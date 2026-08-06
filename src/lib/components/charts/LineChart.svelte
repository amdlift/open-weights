<script lang="ts">
	import { scaleLinear, scalePoint } from 'd3-scale';
	import { line as d3line } from 'd3-shape';
	import { formatDateMedium, type IsoDate } from '$lib/dates';
	import ChartLegend from './ChartLegend.svelte';
	import {
		nearestIndex,
		niceTicks,
		paddedDomain,
		seriesColor,
		unionDates,
		type LineSeries
	} from './chart-utils';

	type Props = {
		series: LineSeries[];
		/** Formats values for the axis, tooltip and direct labels. */
		format: (value: number) => string;
		height?: number;
		/**
		 * A faint context line drawn behind the series — the raw daily readings
		 * behind a moving average, for instance. Not a series: no legend entry,
		 * no categorical hue.
		 */
		context?: { points: { date: IsoDate; value: number }[]; label: string } | null;
		/** Shown when there is nothing to plot yet. */
		emptyMessage?: string;
	};

	let {
		series,
		format,
		height = 220,
		context = null,
		emptyMessage = 'Not enough data yet.'
	}: Props = $props();

	let width = $state(0);
	let hoverIndex = $state<number | null>(null);

	const margin = { top: 12, right: 68, bottom: 26, left: 44 };

	let dates = $derived(unionDates(series.length > 0 ? series : context ? [{ id: 'c', label: context.label, points: context.points }] : []));
	let innerWidth = $derived(Math.max(0, width - margin.left - margin.right));
	let innerHeight = $derived(Math.max(0, height - margin.top - margin.bottom));

	let x = $derived(scalePoint<IsoDate>().domain(dates).range([0, innerWidth]));

	let yDomain = $derived(
		paddedDomain([
			...series.flatMap((s) => s.points.map((p) => p.value)),
			...(context?.points.map((p) => p.value) ?? [])
		])
	);
	let y = $derived(scaleLinear().domain(yDomain).range([innerHeight, 0]));
	let ticks = $derived(niceTicks(yDomain[0], yDomain[1], 4));

	// Every series is drawn against the shared date domain, so a gap in one
	// series leaves a gap rather than shifting its later points leftwards.
	let path = $derived(
		d3line<{ date: IsoDate; value: number }>()
			.x((p) => x(p.date) ?? 0)
			.y((p) => y(p.value))
			.defined((p) => x(p.date) != null && Number.isFinite(p.value))
	);

	let xPositions = $derived(dates.map((d) => x(d) ?? 0));

	let hovered = $derived(
		hoverIndex != null && hoverIndex >= 0 && hoverIndex < dates.length
			? {
					date: dates[hoverIndex],
					xPos: xPositions[hoverIndex],
					values: series
						.map((s, i) => ({
							label: s.label,
							color: seriesColor(i),
							point: s.points.find((p) => p.date === dates[hoverIndex!])
						}))
						.filter((v) => v.point != null)
				}
			: null
	);

	function onMove(event: PointerEvent) {
		const rect = event.currentTarget instanceof Element ? event.currentTarget.getBoundingClientRect() : null;
		if (!rect) return;
		hoverIndex = nearestIndex(xPositions, event.clientX - rect.left - margin.left);
	}

	/** The last point of each series, for the direct end labels. */
	let endLabels = $derived(
		series
			.map((s, i) => {
				const point = s.points.at(-1);
				return point ? { label: s.label, color: seriesColor(i), point } : null;
			})
			.filter((v) => v != null)
	);

	let hasData = $derived(dates.length > 0);
</script>

<div class="w-full" bind:clientWidth={width}>
	{#if !hasData}
		<div
			class="flex items-center justify-center rounded-lg border border-dashed border-border-base
				text-sm text-faint"
			style:height="{height}px"
		>
			{emptyMessage}
		</div>
	{:else if width > 0}
		<div class="relative">
			<svg
				{width}
				{height}
				role="img"
				aria-label="{series.map((s) => s.label).join(', ')} over time"
				onpointermove={onMove}
				onpointerleave={() => (hoverIndex = null)}
				class="touch-pan-y"
			>
				<g transform="translate({margin.left},{margin.top})">
					<!-- Gridlines: hairline, solid, recessive. -->
					{#each ticks as tick (tick)}
						<line
							x1="0"
							x2={innerWidth}
							y1={y(tick)}
							y2={y(tick)}
							stroke="var(--ow-border)"
							stroke-width="1"
						/>
						<text
							x="-8"
							y={y(tick)}
							text-anchor="end"
							dominant-baseline="middle"
							class="fill-faint text-[10px] tnum"
						>
							{format(tick)}
						</text>
					{/each}

					{#if context && context.points.length > 0}
						<!-- Context, not a series: recessive gray, no legend entry. -->
						<path
							d={path(context.points) ?? ''}
							fill="none"
							stroke="var(--ow-series-muted)"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					{/if}

					{#each series as s, i (s.id)}
						<path
							d={path(s.points) ?? ''}
							fill="none"
							stroke={seriesColor(i)}
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					{/each}

					{#if hovered}
						<line
							x1={hovered.xPos}
							x2={hovered.xPos}
							y1="0"
							y2={innerHeight}
							stroke="var(--ow-border-strong)"
							stroke-width="1"
						/>
						{#each hovered.values as value (value.label)}
							<circle
								cx={hovered.xPos}
								cy={y(value.point!.value)}
								r="4.5"
								fill={value.color}
								stroke="var(--ow-surface)"
								stroke-width="2"
							/>
						{/each}
					{/if}

					<!-- Direct end labels. Mandatory here: the light-mode palette sits
					     below 3:1 on some slots, and four series makes labels required. -->
					{#each endLabels as entry (entry.label)}
						<circle
							cx={x(entry.point.date) ?? 0}
							cy={y(entry.point.value)}
							r="4"
							fill={entry.color}
							stroke="var(--ow-surface)"
							stroke-width="2"
						/>
						<text
							x={(x(entry.point.date) ?? 0) + 8}
							y={y(entry.point.value)}
							dominant-baseline="middle"
							class="fill-muted text-[10px] tnum"
						>
							{format(entry.point.value)}
						</text>
					{/each}

					<!-- Only the first and last dates are labelled; the tooltip carries
					     the rest, and a tick per point would collide immediately. -->
					<text y={innerHeight + 16} x="0" class="fill-faint text-[10px]">
						{formatDateMedium(dates[0])}
					</text>
					{#if dates.length > 1}
						<text
							y={innerHeight + 16}
							x={innerWidth}
							text-anchor="end"
							class="fill-faint text-[10px]"
						>
							{formatDateMedium(dates.at(-1)!)}
						</text>
					{/if}
				</g>
			</svg>

			{#if hovered && hovered.values.length > 0}
				<div
					class="pointer-events-none absolute top-2 z-10 min-w-36 rounded-lg border
						border-border-base bg-surface p-2 text-xs shadow-lg"
					style:left="{Math.min(Math.max(hovered.xPos + margin.left - 60, 4), Math.max(4, width - 150))}px"
					role="status"
				>
					<p class="font-medium">{formatDateMedium(hovered.date)}</p>
					<ul class="mt-1 space-y-0.5">
						{#each hovered.values as value (value.label)}
							<li class="flex items-center justify-between gap-3">
								<span class="flex items-center gap-1.5 text-muted">
									<span
										class="h-2 w-2 rounded-[2px]"
										style:background-color={value.color}
										aria-hidden="true"
									></span>
									{value.label}
								</span>
								<span class="tnum font-medium">{format(value.point!.value)}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>

		<div class="mt-3">
			<ChartLegend
				entries={series.map((s, i) => ({ label: s.label, color: seriesColor(i) }))}
			/>
		</div>
	{/if}
</div>
