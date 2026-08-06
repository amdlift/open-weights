<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import LineChart from '$lib/components/charts/LineChart.svelte';
	import {
		EQUIPMENT_LABELS,
		EQUIPMENT_TYPES,
		EXERCISE_KINDS,
		EXERCISE_KIND_LABELS,
		MUSCLE_GROUPS,
		MUSCLE_GROUP_LABELS,
		fieldsForKind
	} from '$lib/constants';
	import { formatDateMedium, formatRelativeDay } from '$lib/dates';
	import { ONE_RM_FORMULA_LABELS } from '$lib/one-rm';
	import {
		formatDistance,
		formatDuration,
		formatPace,
		formatWeight,
		fromKg,
		trimNumber,
		weightUnit
	} from '$lib/units';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let editing = $state(false);
	let confirmingDelete = $state(false);

	let units = $derived(data.user.unitSystem);
	let fields = $derived(fieldsForKind(data.exercise.kind));

	let oneRmSeries = $derived(
		data.oneRmSeries.length > 1
			? [
					{
						id: data.exercise.id,
						label: `Est. 1RM (${ONE_RM_FORMULA_LABELS[data.user.oneRmFormula]})`,
						points: data.oneRmSeries.map((p) => ({
							date: p.date,
							value: fromKg(p.value, units)
						}))
					}
				]
			: []
	);

	const formatChartWeight = (value: number) => `${trimNumber(value, 1)} ${weightUnit(units)}`;
</script>

<svelte:head><title>{data.exercise.name} · OpenWeights</title></svelte:head>

<PageHeader title={data.exercise.name}>
	{#snippet actions()}
		<a href="/exercises" class="ow-btn-secondary">
			<Icon name="chevronLeft" size={16} />
			Library
		</a>
		{#if data.exercise.isCustom}
			<button type="button" class="ow-btn-secondary" onclick={() => (editing = !editing)}>
				<Icon name="pencil" size={16} />
				Edit
			</button>
		{/if}
	{/snippet}
</PageHeader>

<div class="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted">
	{#if data.exercise.primaryMuscle}
		<span class="rounded-full bg-surface-2 px-2.5 py-1 text-xs">
			{MUSCLE_GROUP_LABELS[data.exercise.primaryMuscle]}
		</span>
	{/if}
	{#if data.exercise.equipment}
		<span class="rounded-full bg-surface-2 px-2.5 py-1 text-xs">
			{EQUIPMENT_LABELS[data.exercise.equipment]}
		</span>
	{/if}
	<span class="rounded-full bg-surface-2 px-2.5 py-1 text-xs">
		{EXERCISE_KIND_LABELS[data.exercise.kind]}
	</span>
	<span class="rounded-full bg-surface-2 px-2.5 py-1 text-xs">
		{data.exercise.isCustom ? 'Your exercise' : 'Built in'}
	</span>
</div>

{#if form && 'error' in form && form.error}
	<p
		class="mb-4 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger"
		role="alert"
	>
		{form.error}
	</p>
{/if}

{#if data.exercise.notes && !editing}
	<p class="ow-card mb-5 p-4 text-sm text-muted">{data.exercise.notes}</p>
{/if}

{#if editing && data.exercise.isCustom}
	<form method="POST" action="?/update" use:enhance class="ow-card mb-5 space-y-4 p-4">
		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<label class="ow-label" for="name">Name</label>
				<input id="name" name="name" class="ow-input" required value={data.exercise.name} />
			</div>
			<div>
				<label class="ow-label" for="kind">Tracks</label>
				<select id="kind" name="kind" class="ow-input">
					{#each EXERCISE_KINDS as kind (kind)}
						<option value={kind} selected={data.exercise.kind === kind}>
							{EXERCISE_KIND_LABELS[kind]}
						</option>
					{/each}
				</select>
			</div>
			<div>
				<label class="ow-label" for="primaryMuscle">Primary muscle</label>
				<select id="primaryMuscle" name="primaryMuscle" class="ow-input">
					<option value="">Not set</option>
					{#each MUSCLE_GROUPS as muscle (muscle)}
						<option value={muscle} selected={data.exercise.primaryMuscle === muscle}>
							{MUSCLE_GROUP_LABELS[muscle]}
						</option>
					{/each}
				</select>
			</div>
			<div>
				<label class="ow-label" for="equipment">Equipment</label>
				<select id="equipment" name="equipment" class="ow-input">
					<option value="">Not set</option>
					{#each EQUIPMENT_TYPES as equipment (equipment)}
						<option value={equipment} selected={data.exercise.equipment === equipment}>
							{EQUIPMENT_LABELS[equipment]}
						</option>
					{/each}
				</select>
			</div>
		</div>
		<div>
			<label class="ow-label" for="notes">Notes</label>
			<input id="notes" name="notes" class="ow-input" value={data.exercise.notes ?? ''} />
		</div>
		<div class="flex flex-wrap gap-2">
			<button type="submit" class="ow-btn-primary">Save</button>
			<button type="button" class="ow-btn-secondary" onclick={() => (editing = false)}>
				Cancel
			</button>
			<button
				type="button"
				class="ow-btn-ghost ml-auto text-danger hover:bg-danger-soft"
				onclick={() => (confirmingDelete = !confirmingDelete)}
			>
				<Icon name="trash" size={16} />
				Delete
			</button>
		</div>
	</form>
{/if}

{#if confirmingDelete}
	<div class="ow-card mb-5 border-danger/40 bg-danger-soft p-4">
		<p class="text-sm">
			{#if data.useCount > 0}
				<strong>{data.exercise.name}</strong> appears in {data.useCount} logged
				{data.useCount === 1 ? 'workout' : 'workouts'}, so it cannot be deleted — that history
				would lose its name. Hide it instead and it disappears from every picker.
			{:else}
				Delete <strong>{data.exercise.name}</strong> permanently?
			{/if}
		</p>
		<div class="mt-3 flex flex-wrap gap-2">
			{#if data.useCount === 0}
				<form method="POST" action="?/delete" use:enhance>
					<button type="submit" class="ow-btn-danger">Delete</button>
				</form>
			{/if}
			<form method="POST" action="?/toggleHidden" use:enhance>
				<input type="hidden" name="hidden" value={String(!data.exercise.isHidden)} />
				<button type="submit" class="ow-btn-secondary">
					{data.exercise.isHidden ? 'Unhide' : 'Hide instead'}
				</button>
			</form>
			<button type="button" class="ow-btn-ghost" onclick={() => (confirmingDelete = false)}>
				Cancel
			</button>
		</div>
	</div>
{/if}

<!-- Personal records -->
<h2 class="mb-3 text-sm font-semibold">Personal records</h2>
{#if data.records.sessionCount === 0}
	<div class="ow-card mb-6 p-8 text-center">
		<p class="font-medium">Never logged</p>
		<p class="mt-1 text-sm text-muted">
			Records appear once you add {data.exercise.name} to a workout.
		</p>
	</div>
{:else}
	<dl class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
		{#if fields.weight && data.records.heaviestSet}
			<div class="ow-card p-3">
				<dt class="text-xs text-muted">Heaviest set</dt>
				<dd class="mt-1 font-semibold">
					{formatWeight(data.records.heaviestSet.weightKg, units)} × {data.records.heaviestSet
						.reps}
				</dd>
				<dd class="text-xs text-faint">{formatDateMedium(data.records.heaviestSet.date)}</dd>
			</div>
		{/if}
		{#if data.records.bestOneRm}
			<div class="ow-card p-3">
				<dt class="text-xs text-muted">
					Best est. 1RM
					<span class="text-faint">({ONE_RM_FORMULA_LABELS[data.user.oneRmFormula]})</span>
				</dt>
				<dd class="mt-1 font-semibold">{formatWeight(data.records.bestOneRm.value, units)}</dd>
				<dd class="text-xs text-faint">
					from {formatWeight(data.records.bestOneRm.weightKg, units)} × {data.records.bestOneRm
						.reps}
				</dd>
			</div>
		{/if}
		{#if data.records.mostReps}
			<div class="ow-card p-3">
				<dt class="text-xs text-muted">Most reps</dt>
				<dd class="mt-1 font-semibold">{data.records.mostReps.reps}</dd>
				<dd class="text-xs text-faint">
					{data.records.mostReps.weightKg != null
						? `at ${formatWeight(data.records.mostReps.weightKg, units)}`
						: formatDateMedium(data.records.mostReps.date)}
				</dd>
			</div>
		{/if}
		{#if data.records.bestVolumeKg && fields.weight}
			<div class="ow-card p-3">
				<dt class="text-xs text-muted">Best session volume</dt>
				<dd class="mt-1 font-semibold">
					{formatWeight(data.records.bestVolumeKg.value, units)}
				</dd>
				<dd class="text-xs text-faint">{formatDateMedium(data.records.bestVolumeKg.date)}</dd>
			</div>
		{/if}
		{#if data.records.longestDistanceM}
			<div class="ow-card p-3">
				<dt class="text-xs text-muted">Longest distance</dt>
				<dd class="mt-1 font-semibold">
					{formatDistance(data.records.longestDistanceM.value, units)}
				</dd>
				<dd class="text-xs text-faint">
					{formatDateMedium(data.records.longestDistanceM.date)}
				</dd>
			</div>
		{/if}
		{#if data.records.longestDurationS}
			<div class="ow-card p-3">
				<dt class="text-xs text-muted">Longest time</dt>
				<dd class="mt-1 font-semibold">
					{formatDuration(data.records.longestDurationS.value)}
				</dd>
				<dd class="text-xs text-faint">
					{formatDateMedium(data.records.longestDurationS.date)}
				</dd>
			</div>
		{/if}
		{#if data.records.bestPace}
			<div class="ow-card p-3">
				<dt class="text-xs text-muted">Best pace</dt>
				<dd class="mt-1 font-semibold">
					{formatPace(
						data.records.bestPace.distanceM,
						data.records.bestPace.durationS,
						units
					)}
				</dd>
				<dd class="text-xs text-faint">
					over {formatDistance(data.records.bestPace.distanceM, units)}
				</dd>
			</div>
		{/if}
		<div class="ow-card p-3">
			<dt class="text-xs text-muted">Sessions</dt>
			<dd class="mt-1 font-semibold">{data.records.sessionCount}</dd>
			<dd class="text-xs text-faint">{data.records.totalSets} working sets</dd>
		</div>
	</dl>
{/if}

{#if oneRmSeries.length > 0}
	<section class="ow-card mb-6 p-4">
		<h2 class="text-sm font-semibold">Estimated 1RM</h2>
		<p class="mt-0.5 mb-3 text-xs text-muted">
			Best estimate per session, {ONE_RM_FORMULA_LABELS[data.user.oneRmFormula]} formula.
		</p>
		<LineChart series={oneRmSeries} format={formatChartWeight} height={200} />
	</section>
{/if}

<!-- History -->
{#if data.sessions.length > 0}
	<h2 class="mb-3 text-sm font-semibold">History</h2>
	<div class="ow-card divide-y divide-border-base">
		{#each data.sessions as session (session.workoutId)}
			<div class="p-4">
				<div class="flex items-center justify-between gap-3">
					<a
						href="/workouts/{session.workoutId}"
						class="text-sm font-medium hover:text-primary"
					>
						{formatRelativeDay(session.date, data.today)}
					</a>
					<span class="text-xs text-faint">
						{#if fields.weight && session.volumeKg > 0}
							{formatWeight(session.volumeKg, units)} volume
						{:else if fields.distance && session.totalDistanceM > 0}
							{formatDistance(session.totalDistanceM, units)}
						{:else if session.totalDurationS > 0}
							{formatDuration(session.totalDurationS)}
						{:else}
							{session.workingSetCount} sets
						{/if}
					</span>
				</div>
				<div class="mt-2 flex flex-wrap gap-1.5">
					{#each session.sets as set, i (i)}
						<span
							class="rounded-md border border-border-base px-2 py-1 text-xs tnum
								{set.isWarmup ? 'text-faint' : 'text-muted'}"
						>
							{#if fields.weight && fields.reps}
								{formatWeight(set.weightKg, units)} × {set.reps ?? '—'}
							{:else if fields.reps}
								{set.reps ?? '—'} reps
							{:else if fields.distance}
								{formatDistance(set.distanceM, units)} · {formatDuration(set.durationS)}
							{:else}
								{formatDuration(set.durationS)}
							{/if}
							{#if set.rpe != null}
								<span class="text-faint">@{set.rpe}</span>
							{/if}
							{#if set.isWarmup}
								<span class="text-faint">W</span>
							{/if}
						</span>
					{/each}
				</div>
			</div>
		{/each}
	</div>
{/if}
