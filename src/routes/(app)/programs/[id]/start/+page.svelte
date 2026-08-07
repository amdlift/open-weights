<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { MAX_REPS_FOR_ESTIMATE } from '$lib/one-rm';
	import { formatDateMedium } from '$lib/dates';
	import { formatWeight, fromKg, trimNumber, weightUnit } from '$lib/units';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let units = $derived(data.user.unitSystem);
</script>

<svelte:head><title>Start {data.program.name} · OpenWeights</title></svelte:head>

<PageHeader
	title="Start {data.program.name}"
	description="Confirm the maxes your percentages work from. They stay fixed for this run."
/>

{#if form && 'error' in form && form.error}
	<p
		class="mb-4 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger"
		role="alert"
	>
		{form.error}
	</p>
{/if}

{#if data.thisRun}
	<div class="ow-card mb-4 border-primary/40 p-4">
		<p class="text-sm">
			You started this program on {formatDateMedium(data.thisRun.startedOn)} and are
			{data.thisRun.doneDays} of {data.thisRun.totalDays} sessions in.
		</p>
		{#if data.upNext}
			<form method="POST" action="/programs/{data.program.id}?/startDay" use:enhance class="mt-3">
				<input type="hidden" name="programDayId" value={data.upNext.programDayId} />
				<input type="hidden" name="enrollmentId" value={data.upNext.enrollmentId} />
				<button type="submit" class="ow-btn-primary">
					{data.upNext.resumeWorkoutId ? 'Resume' : 'Start'} week {data.upNext.weekNumber}, day
					{data.upNext.dayNumber}
				</button>
			</form>
		{:else}
			<p class="mt-2 text-sm text-muted">
				Every session is done. Starting again below takes a fresh set of maxes.
			</p>
		{/if}
	</div>
{/if}

{#if data.otherRun}
	<div class="ow-card mb-4 border-warning/40 p-4">
		<p class="text-sm">
			You're currently running
			<a href="/programs/{data.otherRun.programId}" class="text-primary underline">
				{data.otherRun.programName}
			</a>
			({data.otherRun.doneDays}/{data.otherRun.totalDays}). Starting this one ends that run —
			every workout you logged is kept.
		</p>
	</div>
{/if}

<form method="POST" use:enhance id="enroll">
	{#if data.otherRun}
		<input type="hidden" name="replace" value="true" />
	{/if}

	{#if data.references.length === 0}
		<div class="ow-card p-4">
			<p class="text-sm text-muted">
				Nothing in this program is prescribed as a percentage, so there are no maxes to set.
			</p>
		</div>
	{:else}
		<div class="ow-card divide-y divide-border-base p-4">
			{#each data.references as reference (reference.exerciseId)}
				<div class="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
					<div class="min-w-0">
						<a
							href="/exercises/{reference.exerciseId}"
							class="text-sm font-medium hover:text-primary"
						>
							{reference.name}
						</a>
						<p class="text-xs text-faint">
							{#if reference.source === 'estimate'}
								From {formatWeight(reference.basisWeightKg, units)} × {reference.basisReps} on
								{formatDateMedium(reference.basisDate!)}
							{:else if reference.source === 'high_reps_only'}
								You've logged this, but only above {MAX_REPS_FOR_ESTIMATE} reps — no estimate.
							{:else}
								No logged sets yet.
							{/if}
						</p>
					</div>
					<div class="flex shrink-0 items-center gap-2">
						<input
							name="oneRm-{reference.exerciseId}"
							class="ow-input tnum h-10 w-24 text-center"
							inputmode="decimal"
							placeholder="—"
							aria-label="{reference.name} one-rep max in {weightUnit(units)}"
							value={reference.estimatedOneRmKg == null
								? ''
								: trimNumber(fromKg(reference.estimatedOneRmKg, units), 1)}
						/>
						<span class="text-xs text-faint">{weightUnit(units)}</span>
					</div>
				</div>
			{/each}
		</div>

		<p class="mt-2 text-xs text-faint">
			Leave one blank and that exercise shows its percentage without a weight until you set a
			max. These stay fixed for the whole run, so a PR in week 6 won't quietly reprice weeks 7
			onward.
		</p>
	{/if}

	<div class="mt-4 flex flex-wrap gap-2">
		<button type="submit" class="ow-btn-primary">
			<Icon name="check" size={16} />
			{data.thisRun ? 'Start another run' : 'Start program'}
		</button>
		<a href="/programs/{data.program.id}" class="ow-btn-secondary">Back to the program</a>
	</div>
</form>
