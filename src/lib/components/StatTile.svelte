<script lang="ts">
	import Sparkline from './charts/Sparkline.svelte';

	type Props = {
		label: string;
		value: string;
		/** Signed change against a named period, e.g. "+2 vs last week". */
		delta?: { text: string; direction: 'up' | 'down' | 'flat'; isGood?: boolean } | null;
		trend?: number[] | null;
		hint?: string;
	};

	let { label, value, delta = null, trend = null, hint }: Props = $props();

	// Direction alone does not decide the colour — losing bodyweight can be the
	// goal — so callers say whether the movement is good.
	let deltaClass = $derived(
		delta == null || delta.direction === 'flat' || delta.isGood === undefined
			? 'text-muted'
			: delta.isGood
				? 'text-success'
				: 'text-danger'
	);
</script>

<div class="ow-card p-4">
	<p class="text-xs font-medium text-muted">{label}</p>
	<div class="mt-1.5 flex items-end justify-between gap-3">
		<div class="min-w-0">
			<!-- Proportional figures: tabular-nums makes a large standalone number
			     look loose. Columns of numbers elsewhere still use .tnum. -->
			<p class="truncate text-2xl font-semibold tracking-tight">{value}</p>
			{#if delta}
				<p class="mt-0.5 text-xs {deltaClass}">
					{delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '—'}
					{delta.text}
				</p>
			{:else if hint}
				<p class="mt-0.5 text-xs text-faint">{hint}</p>
			{/if}
		</div>
		{#if trend && trend.length >= 2}
			<div class="shrink-0">
				<Sparkline values={trend} label="{label} trend" />
			</div>
		{/if}
	</div>
</div>
