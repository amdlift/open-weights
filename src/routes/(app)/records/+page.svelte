<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import {
		MUSCLE_GROUPS,
		MUSCLE_GROUP_LABELS,
		fieldsForKind,
		supportsOneRm
	} from '$lib/constants';
	import { formatDateMedium } from '$lib/dates';
	import { ONE_RM_FORMULA_LABELS } from '$lib/one-rm';
	import { formatDistance, formatDuration, formatPace, formatWeight } from '$lib/units';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let units = $derived(data.user.unitSystem);
</script>

<svelte:head><title>Records · OpenWeights</title></svelte:head>

<PageHeader
	title="Records"
	description={data.totalCount === 0
		? 'Personal bests appear here once you have logged something.'
		: `All-time bests across ${data.totalCount} ${data.totalCount === 1 ? 'exercise' : 'exercises'}. Estimates use the ${ONE_RM_FORMULA_LABELS[data.user.oneRmFormula]} formula.`}
/>

{#if data.totalCount > 0}
	<form method="GET" class="mb-5">
		<label class="sr-only" for="muscle">Filter by muscle group</label>
		<select
			id="muscle"
			name="muscle"
			class="ow-input w-auto"
			onchange={(event) => event.currentTarget.form?.requestSubmit()}
		>
			<option value="all">All muscle groups</option>
			{#each MUSCLE_GROUPS as muscle (muscle)}
				<option value={muscle} selected={data.muscle === muscle}>
					{MUSCLE_GROUP_LABELS[muscle]}
				</option>
			{/each}
		</select>
		<noscript><button type="submit" class="ow-btn-secondary ml-2">Filter</button></noscript>
	</form>
{/if}

{#if data.records.length === 0}
	<div class="ow-card p-10 text-center">
		<p class="font-medium">
			{data.totalCount === 0 ? 'No records yet' : 'Nothing in that muscle group'}
		</p>
		<p class="mt-1 text-sm text-muted">
			{data.totalCount === 0
				? 'Log a workout and your bests will start showing up here.'
				: 'Try a different filter.'}
		</p>
		{#if data.totalCount === 0}
			<a href="/workouts/new" class="ow-btn-primary mt-4">Log a workout</a>
		{/if}
	</div>
{:else}
	<div class="ow-card divide-y divide-border-base">
		{#each data.records as row (row.exerciseId)}
			{@const fields = fieldsForKind(row.kind)}
			<div class="p-4">
				<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
					<a href="/exercises/{row.exerciseId}" class="font-medium hover:text-primary">
						{row.name}
					</a>
					<span class="text-xs text-faint">
						{row.records.sessionCount}
						{row.records.sessionCount === 1 ? 'session' : 'sessions'} ·
						{row.records.totalSets} working sets
					</span>
				</div>

				<dl class="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
					{#if fields.weight && row.records.heaviestSet}
						<div>
							<dt class="text-xs text-muted">Heaviest</dt>
							<dd class="font-medium tnum">
								{formatWeight(row.records.heaviestSet.weightKg, units)} × {row.records
									.heaviestSet.reps}
								<span class="ml-1 text-xs font-normal text-faint">
									{formatDateMedium(row.records.heaviestSet.date)}
								</span>
							</dd>
						</div>
					{/if}

					{#if supportsOneRm(row.kind) && row.records.bestOneRm}
						<div>
							<dt class="text-xs text-muted">Est. 1RM</dt>
							<dd class="font-medium tnum">
								{formatWeight(row.records.bestOneRm.value, units)}
								<span class="ml-1 text-xs font-normal text-faint">
									{formatDateMedium(row.records.bestOneRm.date)}
								</span>
							</dd>
						</div>
					{/if}

					{#if !fields.weight && fields.reps && row.records.mostReps}
						<div>
							<dt class="text-xs text-muted">Most reps</dt>
							<dd class="font-medium tnum">
								{row.records.mostReps.reps}
								<span class="ml-1 text-xs font-normal text-faint">
									{formatDateMedium(row.records.mostReps.date)}
								</span>
							</dd>
						</div>
					{/if}

					{#if row.records.longestDistanceM}
						<div>
							<dt class="text-xs text-muted">Longest</dt>
							<dd class="font-medium tnum">
								{formatDistance(row.records.longestDistanceM.value, units)}
								<span class="ml-1 text-xs font-normal text-faint">
									{formatDateMedium(row.records.longestDistanceM.date)}
								</span>
							</dd>
						</div>
					{/if}

					{#if row.records.bestPace}
						<div>
							<dt class="text-xs text-muted">Best pace</dt>
							<dd class="font-medium tnum">
								{formatPace(
									row.records.bestPace.distanceM,
									row.records.bestPace.durationS,
									units
								)}
								<span class="ml-1 text-xs font-normal text-faint">
									over {formatDistance(row.records.bestPace.distanceM, units)}
								</span>
							</dd>
						</div>
					{/if}

					{#if row.kind === 'duration' && row.records.longestDurationS}
						<div>
							<dt class="text-xs text-muted">Longest hold</dt>
							<dd class="font-medium tnum">
								{formatDuration(row.records.longestDurationS.value)}
								<span class="ml-1 text-xs font-normal text-faint">
									{formatDateMedium(row.records.longestDurationS.date)}
								</span>
							</dd>
						</div>
					{/if}

					{#if fields.weight && row.records.bestVolumeKg}
						<div>
							<dt class="text-xs text-muted">Best session</dt>
							<dd class="font-medium tnum">
								{formatWeight(row.records.bestVolumeKg.value, units)}
								<span class="ml-1 text-xs font-normal text-faint">
									{formatDateMedium(row.records.bestVolumeKg.date)}
								</span>
							</dd>
						</div>
					{/if}
				</dl>
			</div>
		{/each}
	</div>
{/if}
