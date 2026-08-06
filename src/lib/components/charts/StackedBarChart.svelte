<script lang="ts">
	import { scaleBand, scaleLinear } from 'd3-scale';
	import ChartLegend from './ChartLegend.svelte';
	import { compactNumber, niceTicks, seriesColor } from './chart-utils';

	type Props = {
		/** One entry per column, in display order. */
		categories: { key: string; label: string }[];
		/** One entry per stack segment; values align with `categories`. */
		series: { key: string; label: string; values: number[] }[];
		format: (value: number) => string;
		height?: number;
		emptyMessage?: string;
	};

	let {
		categories,
		series,
		format,
		height = 220,
		emptyMessage = 'No volume logged yet.'
	}: Props = $props();

	let width = $state(0);
	let hoverIndex = $state<number | null>(null);

	const margin = { top: 12, right: 12, bottom: 30, left: 44 };
	/** Columns are capped rather than filling the band — the leftover is air. */
	const MAX_BAR_WIDTH = 24;
	/** A surface-coloured gap does the separating; never a stroke. */
	const SEGMENT_GAP = 2;
	const CAP_RADIUS = 4;

	let innerWidth = $derived(Math.max(0, width - margin.left - margin.right));
	let innerHeight = $derived(Math.max(0, height - margin.top - margin.bottom));

	let totals = $derived(
		categories.map((_, index) => series.reduce((sum, s) => sum + (s.values[index] ?? 0), 0))
	);
	let hasData = $derived(totals.some((t) => t > 0));

	let x = $derived(
		scaleBand<string>()
			.domain(categories.map((c) => c.key))
			.range([0, innerWidth])
			.padding(0.25)
	);
	let barWidth = $derived(Math.min(x.bandwidth(), MAX_BAR_WIDTH));

	let yMax = $derived(Math.max(...totals, 1));
	let y = $derived(scaleLinear().domain([0, yMax]).nice().range([innerHeight, 0]));
	let ticks = $derived(niceTicks(0, y.domain()[1], 4));

	/**
	 * Segment geometry, bottom-up. Zero-value segments are skipped entirely so
	 * they cannot contribute a stray gap or a hairline of colour.
	 */
	let columns = $derived(
		categories.map((category, index) => {
			const segments: Array<{
				key: string;
				label: string;
				color: string;
				value: number;
				yTop: number;
				barHeight: number;
				isTop: boolean;
			}> = [];

			let cumulative = 0;
			const present = series
				.map((s, seriesIndex) => ({ s, seriesIndex, value: s.values[index] ?? 0 }))
				.filter((entry) => entry.value > 0);

			present.forEach((entry, position) => {
				const bottom = y(cumulative);
				cumulative += entry.value;
				const top = y(cumulative);
				const isTop = position === present.length - 1;
				// The gap is taken off the top of every segment but the last, so
				// segments never overlap into their neighbour's 2px of surface.
				const gap = isTop ? 0 : SEGMENT_GAP;
				segments.push({
					key: entry.s.key,
					label: entry.s.label,
					color: seriesColor(entry.seriesIndex),
					value: entry.value,
					yTop: top,
					barHeight: Math.max(0, bottom - top - gap),
					isTop
				});
			});

			return {
				category,
				index,
				xPos: (x(category.key) ?? 0) + (x.bandwidth() - barWidth) / 2,
				total: totals[index],
				segments
			};
		})
	);

	/** Rounded at the data end, square at the baseline. */
	function segmentPath(xPos: number, yTop: number, w: number, h: number, rounded: boolean) {
		if (h <= 0) return '';
		const r = rounded ? Math.min(CAP_RADIUS, h, w / 2) : 0;
		return `M${xPos},${yTop + h} L${xPos},${yTop + r} Q${xPos},${yTop} ${xPos + r},${yTop} L${xPos + w - r},${yTop} Q${xPos + w},${yTop} ${xPos + w},${yTop + r} L${xPos + w},${yTop + h} Z`;
	}
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
			<svg {width} {height} role="img" aria-label="Training volume by week">
				<g transform="translate({margin.left},{margin.top})">
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
							{compactNumber(tick)}
						</text>
					{/each}

					{#each columns as column (column.category.key)}
						<g
							role="presentation"
							onpointerenter={() => (hoverIndex = column.index)}
							onpointerleave={() => (hoverIndex = null)}
						>
							<!-- A full-height hit area: the column itself is too thin to hover
							     comfortably on a phone. -->
							<rect
								x={x(column.category.key) ?? 0}
								y="0"
								width={x.bandwidth()}
								height={innerHeight}
								fill="transparent"
							/>
							{#each column.segments as segment (segment.key)}
								<path
									d={segmentPath(
										column.xPos,
										segment.yTop,
										barWidth,
										segment.barHeight,
										segment.isTop
									)}
									fill={segment.color}
									opacity={hoverIndex == null || hoverIndex === column.index ? 1 : 0.45}
								/>
							{/each}
						</g>
						<text
							x={(x(column.category.key) ?? 0) + x.bandwidth() / 2}
							y={innerHeight + 16}
							text-anchor="middle"
							class="fill-faint text-[10px]"
						>
							{column.category.label}
						</text>
					{/each}
				</g>
			</svg>

			{#if hoverIndex != null && columns[hoverIndex]}
				{@const column = columns[hoverIndex]}
				<div
					class="pointer-events-none absolute top-2 z-10 min-w-40 rounded-lg border
						border-border-base bg-surface p-2 text-xs shadow-lg"
					style:left="{Math.min(Math.max(column.xPos + margin.left - 60, 4), Math.max(4, width - 170))}px"
					role="status"
				>
					<p class="font-medium">{column.category.label}</p>
					<ul class="mt-1 space-y-0.5">
						{#each column.segments as segment (segment.key)}
							<li class="flex items-center justify-between gap-3">
								<span class="flex items-center gap-1.5 text-muted">
									<span
										class="h-2 w-2 rounded-[2px]"
										style:background-color={segment.color}
										aria-hidden="true"
									></span>
									{segment.label}
								</span>
								<span class="tnum font-medium">{format(segment.value)}</span>
							</li>
						{/each}
						<li
							class="flex items-center justify-between gap-3 border-t border-border-base pt-1
								font-medium"
						>
							<span>Total</span>
							<span class="tnum">{format(column.total)}</span>
						</li>
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
