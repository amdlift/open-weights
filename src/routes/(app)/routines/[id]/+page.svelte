<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Icon from '$lib/components/Icon.svelte';
	import ExercisePicker from '$lib/components/workout/ExercisePicker.svelte';
	import {
		EXERCISE_KIND_LABELS,
		MUSCLE_GROUP_LABELS,
		fieldsForKind,
		formatRepTarget
	} from '$lib/constants';
	import {
		distanceUnit,
		formatDuration,
		fromKg,
		fromMetres,
		trimNumber,
		weightUnit
	} from '$lib/units';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let picking = $state(false);
	let editingDetails = $state(false);
	let confirmingDelete = $state(false);

	let routine = $derived(data.routine);
	let units = $derived(data.user.unitSystem);

	// Targets save in the background: nudging a target weight should not reload
	// the page and scroll away from where you were.
	const saveQuietly: SubmitFunction = () => {
		return async ({ result }) => {
			if (result.type === 'error') console.error('Failed to save target', result.error);
		};
	};

	function submitOwnForm(event: Event) {
		(event.currentTarget as HTMLElement & { form?: HTMLFormElement }).form?.requestSubmit();
	}
</script>

<svelte:head><title>{routine.name} · OpenWeights</title></svelte:head>

<div class="mb-5 flex flex-wrap items-start justify-between gap-3">
	<div class="min-w-0">
		<h1 class="text-xl font-bold tracking-tight md:text-2xl">{routine.name}</h1>
		<p class="mt-1 text-sm text-muted">
			{routine.exercises.length}
			{routine.exercises.length === 1 ? 'exercise' : 'exercises'}
			{#if routine.isArchived}· archived{/if}
		</p>
	</div>
	<div class="flex shrink-0 items-center gap-2">
		<a href="/routines" class="ow-btn-ghost">
			<Icon name="chevronLeft" size={16} />
			Routines
		</a>
		<button
			type="button"
			class="ow-btn-secondary"
			onclick={() => (editingDetails = !editingDetails)}
		>
			<Icon name="pencil" size={16} />
			Details
		</button>
		{#if routine.exercises.length > 0}
			<form method="POST" action="?/start" use:enhance>
				<button type="submit" class="ow-btn-primary">
					<Icon name="plus" size={16} />
					Start today
				</button>
			</form>
		{/if}
	</div>
</div>

{#if form && 'error' in form && form.error}
	<p
		class="mb-4 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger"
		role="alert"
	>
		{form.error}
	</p>
{/if}

{#if editingDetails}
	<form method="POST" action="?/updateDetails" use:enhance class="ow-card mb-5 space-y-3 p-4">
		<div>
			<label class="ow-label" for="name">Name</label>
			<input id="name" name="name" class="ow-input" required value={routine.name} />
		</div>
		<div>
			<label class="ow-label" for="notes">Notes</label>
			<input id="notes" name="notes" class="ow-input" value={routine.notes ?? ''} />
		</div>
		<div class="flex flex-wrap gap-2">
			<button type="submit" class="ow-btn-primary">Save</button>
			<button type="button" class="ow-btn-secondary" onclick={() => (editingDetails = false)}>
				Cancel
			</button>
			<button
				type="button"
				class="ow-btn-ghost ml-auto text-danger hover:bg-danger-soft"
				onclick={() => (confirmingDelete = !confirmingDelete)}
			>
				<Icon name="trash" size={16} />
				Delete routine
			</button>
		</div>
	</form>
{:else if routine.notes}
	<p class="ow-card mb-5 p-4 text-sm text-muted">{routine.notes}</p>
{/if}

{#if confirmingDelete}
	<div class="ow-card mb-5 border-danger/40 bg-danger-soft p-4">
		<p class="text-sm">
			Delete <strong>{routine.name}</strong>? Workouts you already started from it stay exactly
			as they are.
		</p>
		<div class="mt-3 flex gap-2">
			<form method="POST" action="?/delete" use:enhance>
				<button type="submit" class="ow-btn-danger">Delete routine</button>
			</form>
			<button type="button" class="ow-btn-secondary" onclick={() => (confirmingDelete = false)}>
				Keep it
			</button>
		</div>
	</div>
{/if}

<div class="space-y-3">
	{#each routine.exercises as item, index (item.id)}
		{@const fields = fieldsForKind(item.exercise.kind)}
		<section class="ow-card p-4">
			<div class="mb-3 flex items-start justify-between gap-3">
				<div class="min-w-0">
					<a href="/exercises/{item.exercise.id}" class="font-semibold hover:text-primary">
						{item.exercise.name}
					</a>
					<p class="mt-0.5 text-xs text-faint">
						{#if item.exercise.primaryMuscle}
							{MUSCLE_GROUP_LABELS[item.exercise.primaryMuscle]} ·
						{/if}
						{EXERCISE_KIND_LABELS[item.exercise.kind]}
					</p>
				</div>
				<div class="flex shrink-0 items-center">
					<form method="POST" action="?/moveItem" use:enhance>
						<input type="hidden" name="itemId" value={item.id} />
						<input type="hidden" name="direction" value="up" />
						<button
							type="submit"
							disabled={index === 0}
							class="flex h-9 w-9 items-center justify-center rounded-md text-faint
								hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-30"
							aria-label="Move {item.exercise.name} up"
						>
							<Icon name="arrowUp" size={16} />
						</button>
					</form>
					<form method="POST" action="?/moveItem" use:enhance>
						<input type="hidden" name="itemId" value={item.id} />
						<input type="hidden" name="direction" value="down" />
						<button
							type="submit"
							disabled={index === routine.exercises.length - 1}
							class="flex h-9 w-9 items-center justify-center rounded-md text-faint
								hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-30"
							aria-label="Move {item.exercise.name} down"
						>
							<Icon name="arrowDown" size={16} />
						</button>
					</form>
					<form method="POST" action="?/removeItem" use:enhance>
						<input type="hidden" name="itemId" value={item.id} />
						<button
							type="submit"
							class="flex h-9 w-9 items-center justify-center rounded-md text-faint
								hover:bg-danger-soft hover:text-danger"
							aria-label="Remove {item.exercise.name} from this routine"
						>
							<Icon name="trash" size={16} />
						</button>
					</form>
				</div>
			</div>

			<form
				method="POST"
				action="?/updateItem"
				use:enhance={saveQuietly}
				class="grid gap-3 sm:grid-cols-4"
			>
				<input type="hidden" name="itemId" value={item.id} />

				<div>
					<label class="ow-label text-xs" for="sets-{item.id}">Sets</label>
					<input
						id="sets-{item.id}"
						name="targetSets"
						class="ow-input h-10 text-center tnum"
						inputmode="numeric"
						placeholder="—"
						value={item.targetSets ?? ''}
						onchange={submitOwnForm}
					/>
				</div>

				{#if fields.reps}
					<div>
						<span class="ow-label text-xs">Target reps</span>
						<div class="flex items-center gap-1.5">
							<input
								name="targetRepsMin"
								class="ow-input h-10 min-w-0 flex-1 px-1 text-center tnum"
								inputmode="numeric"
								placeholder="—"
								aria-label="Target reps, lower end of the range"
								value={item.targetRepsMin ?? ''}
								onchange={submitOwnForm}
							/>
							<span class="shrink-0 text-xs text-faint" aria-hidden="true">to</span>
							<input
								name="targetRepsMax"
								class="ow-input h-10 min-w-0 flex-1 px-1 text-center tnum"
								inputmode="numeric"
								placeholder="—"
								aria-label="Target reps, upper end of the range (leave blank for an exact target)"
								value={item.targetRepsMax ?? ''}
								onchange={submitOwnForm}
							/>
						</div>
						<p class="mt-1 text-[11px] text-faint">
							{item.targetRepsMin == null && item.targetRepsMax == null
								? 'Leave the second box blank for an exact target.'
								: `Target: ${formatRepTarget(item.targetRepsMin, item.targetRepsMax)} reps`}
						</p>
					</div>
				{/if}

				{#if fields.weight}
					<div>
						<label class="ow-label text-xs" for="weight-{item.id}">
							Target {weightUnit(units)}
						</label>
						<input
							id="weight-{item.id}"
							name="targetWeight"
							class="ow-input h-10 text-center tnum"
							inputmode="decimal"
							placeholder="—"
							value={item.targetWeightKg == null
								? ''
								: trimNumber(fromKg(item.targetWeightKg, units), 2)}
							onchange={submitOwnForm}
						/>
					</div>
				{/if}

				{#if fields.distance}
					<div>
						<label class="ow-label text-xs" for="distance-{item.id}">
							Target {distanceUnit(units)}
						</label>
						<input
							id="distance-{item.id}"
							name="targetDistance"
							class="ow-input h-10 text-center tnum"
							inputmode="decimal"
							placeholder="—"
							value={item.targetDistanceM == null
								? ''
								: trimNumber(fromMetres(item.targetDistanceM, units), 3)}
							onchange={submitOwnForm}
						/>
					</div>
				{/if}

				{#if fields.duration}
					<div>
						<label class="ow-label text-xs" for="duration-{item.id}">Target time</label>
						<input
							id="duration-{item.id}"
							name="targetDuration"
							class="ow-input h-10 text-center tnum"
							placeholder="mm:ss"
							value={item.targetDurationS == null ? '' : formatDuration(item.targetDurationS)}
							onchange={submitOwnForm}
						/>
					</div>
				{/if}

				<div class="sm:col-span-4">
					<label class="sr-only" for="notes-{item.id}">Notes for {item.exercise.name}</label>
					<input
						id="notes-{item.id}"
						name="notes"
						class="ow-input h-9 text-sm"
						placeholder="Notes — tempo, rest, machine settings…"
						value={item.notes ?? ''}
						onchange={submitOwnForm}
					/>
				</div>
			</form>
		</section>
	{/each}
</div>

{#if picking}
	<div class="mt-4">
		<ExercisePicker
			options={data.exerciseOptions}
			alreadyAdded={routine.exercises.map((e) => e.exercise.id)}
			onclose={() => (picking = false)}
		/>
	</div>
{:else}
	<button type="button" class="ow-btn-secondary mt-4 w-full" onclick={() => (picking = true)}>
		<Icon name="plus" size={16} />
		Add exercise
	</button>
{/if}

{#if routine.exercises.length === 0 && !picking}
	<div class="ow-card mt-4 p-8 text-center">
		<p class="font-medium">This routine is empty</p>
		<p class="mt-1 text-sm text-muted">Add the exercises you want it to load.</p>
	</div>
{/if}
