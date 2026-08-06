<script lang="ts">
	import { line as d3line } from 'd3-shape';
	import { scaleLinear } from 'd3-scale';

	/**
	 * The trend channel of a stat tile: recessive line, accent end-dot marking
	 * the current value. No axes, no labels — the tile's own value carries those.
	 */
	type Props = {
		values: number[];
		width?: number;
		height?: number;
		label: string;
	};

	let { values, width = 96, height = 28, label }: Props = $props();

	const pad = 3;

	let x = $derived(
		scaleLinear()
			.domain([0, Math.max(1, values.length - 1)])
			.range([pad, width - pad])
	);
	let y = $derived(
		scaleLinear()
			.domain([Math.min(...values), Math.max(...values)])
			.range([height - pad, pad])
	);
	let path = $derived(
		d3line<number>()
			.x((_, i) => x(i))
			.y((v) => y(v))
	);

	// A flat domain collapses the scale onto one pixel row; centre it instead.
	let flat = $derived(values.length > 0 && Math.min(...values) === Math.max(...values));
</script>

{#if values.length >= 2}
	<svg {width} {height} role="img" aria-label={label} class="overflow-visible">
		{#if flat}
			<line
				x1={pad}
				x2={width - pad}
				y1={height / 2}
				y2={height / 2}
				stroke="var(--ow-series-muted)"
				stroke-width="2"
				stroke-linecap="round"
			/>
		{:else}
			<path
				d={path(values) ?? ''}
				fill="none"
				stroke="var(--ow-series-muted)"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		{/if}
		<circle
			cx={x(values.length - 1)}
			cy={flat ? height / 2 : y(values.at(-1)!)}
			r="3.5"
			fill="var(--ow-primary)"
			stroke="var(--ow-surface)"
			stroke-width="2"
		/>
	</svg>
{/if}
