<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { formatRepTarget } from '$lib/constants';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreate = $state(false);
	let confirmingDelete = $state<number | null>(null);

	let active = $derived(data.routines.filter((r) => !r.isArchived));
	let archived = $derived(data.routines.filter((r) => r.isArchived));

	/** "Back Squat 3×5", "Bench Press 3×8–12", or just the name if untargeted. */
	function describe(entry: PageData['routines'][number]['plan'][number]): string {
		const reps = formatRepTarget(entry.targetRepsMin, entry.targetRepsMax);
		if (entry.targetSets == null && reps === '—') return entry.name;
		if (reps === '—') return `${entry.name} ${entry.targetSets}×`;
		if (entry.targetSets == null) return `${entry.name} ${reps} reps`;
		return `${entry.name} ${entry.targetSets}×${reps}`;
	}
</script>

<svelte:head><title>Routines · OpenWeights</title></svelte:head>

<PageHeader
	title="Routines"
	description="Saved templates. Starting a workout from one fills in the exercises and targets."
>
	{#snippet actions()}
		<button type="button" class="ow-btn-primary" onclick={() => (showCreate = !showCreate)}>
			<Icon name="plus" size={16} />
			New routine
		</button>
	{/snippet}
</PageHeader>

{#if form && 'error' in form && form.error}
	<p
		class="mb-4 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger"
		role="alert"
	>
		{form.error}
	</p>
{/if}

{#if showCreate}
	<form method="POST" action="?/create" use:enhance class="ow-card mb-5 space-y-3 p-4">
		<div>
			<label class="ow-label" for="name">Name</label>
			<input
				id="name"
				name="name"
				class="ow-input"
				maxlength="80"
				required
				placeholder="e.g. Upper A"
			/>
		</div>
		<div>
			<label class="ow-label" for="notes">Notes</label>
			<input id="notes" name="notes" class="ow-input" placeholder="Optional" />
		</div>
		<div class="flex gap-2">
			<button type="submit" class="ow-btn-primary">Create and add exercises</button>
			<button type="button" class="ow-btn-secondary" onclick={() => (showCreate = false)}>
				Cancel
			</button>
		</div>
	</form>
{/if}

{#snippet routineCard(routine: PageData['routines'][number])}
	<div class="ow-card p-4">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="min-w-0">
				<a href="/routines/{routine.id}" class="font-medium hover:text-primary">
					{routine.name}
				</a>
				<p class="mt-0.5 text-xs text-faint">
					{routine.exerciseCount}
					{routine.exerciseCount === 1 ? 'exercise' : 'exercises'}
				</p>
				{#if routine.plan.length > 0}
					<p class="mt-1 text-sm text-muted">
						{routine.plan.map(describe).join(' · ')}
					</p>
				{/if}
				{#if routine.notes}
					<p class="mt-1 text-sm text-faint">{routine.notes}</p>
				{/if}
			</div>

			<div class="flex shrink-0 flex-wrap items-center gap-2">
				{#if !routine.isArchived && routine.exerciseCount > 0}
					<form method="POST" action="?/start" use:enhance>
						<input type="hidden" name="routineId" value={routine.id} />
						<button type="submit" class="ow-btn-primary h-9 min-h-9 px-3 text-xs">
							Start today
						</button>
					</form>
				{/if}
				<form method="POST" action="?/toggleArchived" use:enhance>
					<input type="hidden" name="routineId" value={routine.id} />
					<input type="hidden" name="isArchived" value={String(!routine.isArchived)} />
					<button type="submit" class="ow-btn-ghost h-9 min-h-9 px-2.5 text-xs">
						{routine.isArchived ? 'Restore' : 'Archive'}
					</button>
				</form>
				<button
					type="button"
					class="ow-btn-ghost h-9 min-h-9 px-2.5 text-xs text-danger hover:bg-danger-soft"
					onclick={() =>
						(confirmingDelete = confirmingDelete === routine.id ? null : routine.id)}
				>
					<Icon name="trash" size={15} />
				</button>
			</div>
		</div>

		{#if confirmingDelete === routine.id}
			<div class="mt-3 rounded-lg border border-danger/40 bg-danger-soft p-3">
				<p class="text-sm">
					Delete <strong>{routine.name}</strong>? Workouts already started from it are not
					affected.
				</p>
				<div class="mt-2 flex gap-2">
					<form method="POST" action="?/delete" use:enhance>
						<input type="hidden" name="routineId" value={routine.id} />
						<button type="submit" class="ow-btn-danger h-9 min-h-9 px-3 text-xs">
							Delete
						</button>
					</form>
					<button
						type="button"
						class="ow-btn-secondary h-9 min-h-9 px-3 text-xs"
						onclick={() => (confirmingDelete = null)}
					>
						Cancel
					</button>
				</div>
			</div>
		{/if}
	</div>
{/snippet}

{#if data.routines.length === 0}
	<div class="ow-card p-10 text-center">
		<p class="font-medium">No routines yet</p>
		<p class="mt-1 text-sm text-muted">
			Save the workouts you repeat so you never rebuild them from scratch. You can also turn a
			finished workout into a routine from its page.
		</p>
		<button type="button" class="ow-btn-primary mt-4" onclick={() => (showCreate = true)}>
			<Icon name="plus" size={16} />
			Create a routine
		</button>
	</div>
{:else}
	<div class="space-y-3">
		{#each active as routine (routine.id)}
			{@render routineCard(routine)}
		{/each}
	</div>

	{#if archived.length > 0}
		<h2 class="mt-6 mb-2 text-xs font-semibold tracking-wide text-faint uppercase">
			Archived ({archived.length})
		</h2>
		<div class="space-y-3 opacity-70">
			{#each archived as routine (routine.id)}
				{@render routineCard(routine)}
			{/each}
		</div>
	{/if}
{/if}
