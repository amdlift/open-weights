<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import UpNextCard from '$lib/components/program/UpNextCard.svelte';
	import LineChart from '$lib/components/charts/LineChart.svelte';
	import StackedBarChart from '$lib/components/charts/StackedBarChart.svelte';
	import { compactNumber } from '$lib/components/charts/chart-utils';
	import {
		MOVEMENT_GROUPS,
		MOVEMENT_GROUP_LABELS,
		movementGroupFor,
		type MuscleGroup
	} from '$lib/constants';
	import { formatDateMedium, formatRelativeDay } from '$lib/dates';
	import { ONE_RM_FORMULA_LABELS } from '$lib/one-rm';
	import {
		distanceUnit,
		formatDistance,
		formatDuration,
		formatWeight,
		fromKg,
		fromMetres,
		trimNumber,
		weightUnit
	} from '$lib/units';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let units = $derived(data.user.unitSystem);
	let choosingPins = $state(false);

	const formatChartWeight = (value: number) => `${trimNumber(value, 1)} ${weightUnit(units)}`;
	const formatVolume = (value: number) => `${compactNumber(value)} ${weightUnit(units)}`;

	let bodyweightSeries = $derived(
		data.bodyweightTrend.length > 1
			? [
					{
						id: 'trend',
						label: '7-day average',
						points: data.bodyweightTrend.map((p) => ({
							date: p.date,
							value: fromKg(p.weightKg, units)
						}))
					}
				]
			: []
	);
	let bodyweightContext = $derived(
		data.bodyweight.length > 1
			? {
					label: 'Daily readings',
					points: data.bodyweight.map((p) => ({ date: p.date, value: fromKg(p.weightKg, units) }))
				}
			: null
	);

	let oneRmSeries = $derived(
		data.oneRm.map((series) => ({
			id: series.id,
			label: series.label,
			points: series.points.map((p) => ({ date: p.date, value: fromKg(p.value, units) }))
		}))
	);

	// Thirteen muscle groups would be unreadable stacked; five movement patterns
	// stay inside the categorical palette and answer the question people ask.
	let volumeSeries = $derived(
		MOVEMENT_GROUPS.map((group) => ({
			key: group,
			label: MOVEMENT_GROUP_LABELS[group],
			values: data.weeklyVolume.map((week) =>
				fromKg(
					Object.entries(week.byMuscle).reduce(
						(sum, [muscle, volume]) =>
							movementGroupFor(muscle as MuscleGroup) === group ? sum + (volume ?? 0) : sum,
						0
					),
					units
				)
			)
		})).filter((series) => series.values.some((v) => v > 0))
	);

	let volumeCategories = $derived(
		data.weeklyVolume.map((week, index) => ({
			key: week.weekStart,
			// Only the first, last and every other column get a label — seven
			// dates side by side collide on a phone.
			label:
				index === data.weeklyVolume.length - 1
					? 'This wk'
					: index % 2 === 0
						? week.weekStart.slice(5).replace('-', '/')
						: ''
		}))
	);

	function trend(current: number, previous: number, higherIsBetter = true) {
		if (previous === 0 && current === 0) return null;
		const direction = current > previous ? 'up' : current < previous ? 'down' : 'flat';
		return {
			text:
				previous === 0
					? 'first week logged'
					: `${Math.abs(Math.round(((current - previous) / previous) * 100))}% vs last week`,
			direction,
			isGood: direction === 'flat' ? undefined : (direction === 'up') === higherIsBetter
		} as const;
	}
</script>

<svelte:head><title>Dashboard · OpenWeights</title></svelte:head>

<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
	<div>
		<h1 class="hidden text-2xl font-bold tracking-tight md:block">
			{data.user.displayName}
		</h1>
		<p class="text-sm text-muted">{formatDateMedium(data.today)}</p>
	</div>
	<a href="/workouts/new?date={data.today}" class="ow-btn-primary hidden md:inline-flex">
		<Icon name="plus" size={16} />
		Log a workout for today
	</a>
</div>

<!--
	The dashboard gains a forward-looking element only when there is something
	forward-looking to say: with no program running, the page is exactly what it
	was before programs existed. The card absorbs the mobile CTA rather than
	stacking two primary buttons.
-->
{#if data.upNext}
	<div class="mb-5">
		<UpNextCard upNext={data.upNext} freeformHref="/workouts/new?date={data.today}" />
	</div>
{:else}
	<a href="/workouts/new?date={data.today}" class="ow-btn-primary mb-5 w-full md:hidden">
		<Icon name="plus" size={16} />
		Log a workout for today
	</a>
{/if}

<!-- This week -->
<div class="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
	<StatTile
		label="Workouts this week"
		value={String(data.thisWeek.workoutCount)}
		delta={trend(data.thisWeek.workoutCount, data.lastWeek.workoutCount)}
	/>
	<StatTile
		label="Volume this week"
		value={data.thisWeek.volumeKg > 0 ? formatWeight(data.thisWeek.volumeKg, units) : '—'}
		delta={trend(data.thisWeek.volumeKg, data.lastWeek.volumeKg)}
	/>
	<StatTile
		label="Cardio this week"
		value={data.thisWeek.distanceM > 0
			? formatDistance(data.thisWeek.distanceM, units)
			: data.thisWeek.durationS > 0
				? formatDuration(data.thisWeek.durationS)
				: '—'}
		hint={data.thisWeek.distanceM > 0 && data.thisWeek.durationS > 0
			? formatDuration(data.thisWeek.durationS)
			: undefined}
	/>
	<StatTile
		label="Bodyweight"
		value={data.latestBodyweight ? formatWeight(data.latestBodyweight.weightKg, units) : '—'}
		hint={data.latestBodyweight
			? formatRelativeDay(data.latestBodyweight.date, data.today)
			: 'Not logged yet'}
		trend={data.bodyweightTrend.length >= 2
			? data.bodyweightTrend.slice(-12).map((p) => fromKg(p.weightKg, units))
			: null}
	/>
</div>

<div class="grid gap-5 lg:grid-cols-2">
	<!-- Bodyweight -->
	<section class="ow-card p-4">
		<div class="mb-3 flex items-baseline justify-between gap-2">
			<div>
				<h2 class="text-sm font-semibold">Bodyweight</h2>
				<p class="text-xs text-muted">7-day average over the last year.</p>
			</div>
			<a href="/measurements" class="text-xs text-primary hover:underline">Log</a>
		</div>
		<LineChart
			series={bodyweightSeries}
			context={bodyweightContext}
			format={formatChartWeight}
			height={220}
			emptyMessage="Log bodyweight on two different days to see a trend."
		/>
	</section>

	<!-- Estimated 1RM -->
	<section class="ow-card p-4">
		<div class="mb-3 flex items-baseline justify-between gap-2">
			<div>
				<h2 class="text-sm font-semibold">Estimated 1RM</h2>
				<p class="text-xs text-muted">
					{ONE_RM_FORMULA_LABELS[data.user.oneRmFormula]} formula{data.isAutoPinned &&
					data.oneRm.length > 0
						? ' · your most-trained lifts'
						: ''}
				</p>
			</div>
			{#if data.pinnableExercises.length > 0}
				<button
					type="button"
					class="text-xs text-primary hover:underline"
					onclick={() => (choosingPins = !choosingPins)}
				>
					{choosingPins ? 'Done' : 'Choose'}
				</button>
			{/if}
		</div>

		{#if choosingPins}
			<form method="POST" action="?/pin" use:enhance class="mb-3">
				<p class="mb-2 text-xs text-muted">
					Pick up to {data.maxPinned}. More lines than that stop being tellable apart.
				</p>
				<div class="max-h-48 space-y-1 overflow-y-auto">
					{#each data.pinnableExercises as exercise (exercise.id)}
						<label class="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-surface-2">
							<input
								type="checkbox"
								name="exerciseId"
								value={exercise.id}
								checked={data.pinnedIds.includes(exercise.id)}
								class="h-4 w-4 accent-[var(--ow-primary)]"
							/>
							{exercise.name}
						</label>
					{/each}
				</div>
				<button type="submit" class="ow-btn-primary mt-2 h-9 min-h-9 px-3 text-xs">
					Save selection
				</button>
			</form>
		{/if}

		<LineChart
			series={oneRmSeries}
			format={formatChartWeight}
			height={220}
			emptyMessage="Log a weighted lift on two different days to see a trend."
		/>
	</section>

	<!-- Weekly volume -->
	<section class="ow-card p-4 lg:col-span-2">
		<div class="mb-3">
			<h2 class="text-sm font-semibold">Training volume</h2>
			<p class="text-xs text-muted">
				Working sets only, last {data.weeklyVolume.length} weeks, in {weightUnit(units)}.
				Bodyweight-only exercises carry no external load, so they are not counted.
			</p>
		</div>
		<StackedBarChart
			categories={volumeCategories}
			series={volumeSeries}
			format={formatVolume}
			height={240}
			emptyMessage="Log a weighted set to start tracking volume."
		/>
	</section>
</div>

<!-- Recent workouts -->
<section class="mt-5">
	<div class="mb-2 flex items-baseline justify-between">
		<h2 class="text-sm font-semibold">Recent workouts</h2>
		<a href="/workouts" class="text-xs text-primary hover:underline">See all</a>
	</div>

	{#if data.recentWorkouts.length === 0}
		<div class="ow-card p-8 text-center">
			<p class="font-medium">No workouts yet</p>
			<p class="mt-1 text-sm text-muted">Your first session is one tap away.</p>
		</div>
	{:else}
		<div class="ow-card divide-y divide-border-base">
			{#each data.recentWorkouts as workout (workout.id)}
				<a
					href="/workouts/{workout.id}"
					class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2"
				>
					<div class="min-w-0">
						<p class="truncate font-medium">
							{workout.title || formatRelativeDay(workout.performedOn, data.today)}
						</p>
						<p class="truncate text-xs text-faint">
							{workout.exerciseNames.join(' · ') || 'No exercises'}
						</p>
					</div>
					<div class="shrink-0 text-right text-xs text-faint tnum">
						<p>{formatRelativeDay(workout.performedOn, data.today)}</p>
						{#if workout.totalVolumeKg > 0}
							<p>{formatWeight(workout.totalVolumeKg, units)}</p>
						{:else if workout.totalDistanceM > 0}
							<p>{trimNumber(fromMetres(workout.totalDistanceM, units), 2)} {distanceUnit(units)}</p>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	{/if}
</section>
