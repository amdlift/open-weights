<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import ExercisePicker from '$lib/components/workout/ExercisePicker.svelte';
	import SetList from '$lib/components/workout/SetList.svelte';
	import { EXERCISE_KIND_LABELS, MUSCLE_GROUP_LABELS } from '$lib/constants';
	import { formatRelativeDay } from '$lib/dates';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let picking = $state(false);
	let editingDetails = $state(false);
	let confirmingDelete = $state(false);
	let savingRoutine = $state(false);

	let workout = $derived(data.workout);
	let addedIds = $derived(workout.exercises.map((e) => e.exercise.id));
	let isEmpty = $derived(workout.exercises.length === 0);

	// Adding or removing a set changes this, which remounts the SetList so its
	// local editing state starts from the new server truth.
	function setSignature(sets: { id: number }[]): string {
		return sets.map((s) => s.id).join(',');
	}
</script>

<svelte:head>
	<title>{workout.title || formatRelativeDay(workout.performedOn, data.today)} · OpenWeights</title>
</svelte:head>

<div class="mb-5 flex flex-wrap items-start justify-between gap-3">
	<div class="min-w-0">
		<h1 class="text-xl font-bold tracking-tight md:text-2xl">
			{workout.title || 'Workout'}
		</h1>
		<p class="mt-1 text-sm text-muted">
			{formatRelativeDay(workout.performedOn, data.today)}
			{#if workout.endedAt}
				· finished
			{/if}
		</p>
	</div>
	<div class="flex shrink-0 items-center gap-2">
		<a href="/workouts" class="ow-btn-ghost">
			<Icon name="chevronLeft" size={16} />
			All workouts
		</a>
		<button
			type="button"
			class="ow-btn-secondary"
			onclick={() => (editingDetails = !editingDetails)}
		>
			<Icon name="pencil" size={16} />
			Details
		</button>
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
	<form method="POST" action="?/updateDetails" use:enhance class="ow-card mb-5 space-y-4 p-4">
		<div class="grid gap-3 sm:grid-cols-2">
			<div>
				<label class="ow-label" for="performedOn">Date</label>
				<input
					id="performedOn"
					name="performedOn"
					type="date"
					class="ow-input"
					required
					value={workout.performedOn}
				/>
			</div>
			<div>
				<label class="ow-label" for="title">Title</label>
				<input
					id="title"
					name="title"
					class="ow-input"
					maxlength="120"
					placeholder="e.g. Push day"
					value={workout.title ?? ''}
				/>
			</div>
		</div>
		<div>
			<label class="ow-label" for="notes">Notes</label>
			<textarea
				id="notes"
				name="notes"
				class="ow-input min-h-20"
				placeholder="How it felt, what to change next time…"
				>{workout.notes ?? ''}</textarea
			>
		</div>
		<div class="flex flex-wrap gap-2">
			<button type="submit" class="ow-btn-primary">Save details</button>
			<button type="button" class="ow-btn-secondary" onclick={() => (editingDetails = false)}>
				Cancel
			</button>
			<button
				type="button"
				class="ow-btn-ghost ml-auto text-danger hover:bg-danger-soft"
				onclick={() => (confirmingDelete = !confirmingDelete)}
			>
				<Icon name="trash" size={16} />
				Delete workout
			</button>
		</div>
	</form>
{:else if workout.notes}
	<p class="ow-card mb-5 p-4 text-sm whitespace-pre-line text-muted">{workout.notes}</p>
{/if}

{#if confirmingDelete}
	<div class="ow-card mb-5 border-danger/40 bg-danger-soft p-4">
		<p class="text-sm">
			Delete this workout and every set in it? This cannot be undone.
		</p>
		<div class="mt-3 flex gap-2">
			<form method="POST" action="?/delete" use:enhance>
				<button type="submit" class="ow-btn-danger">Delete workout</button>
			</form>
			<button type="button" class="ow-btn-secondary" onclick={() => (confirmingDelete = false)}>
				Keep it
			</button>
		</div>
	</div>
{/if}

<!-- Exercises -->
<div class="space-y-4">
	{#each workout.exercises as item, index (item.id)}
		<section class="ow-card p-4">
			<div class="mb-3 flex items-start justify-between gap-3">
				<div class="min-w-0">
					<a
						href="/exercises/{item.exercise.id}"
						class="font-semibold hover:text-primary"
					>
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
					<form method="POST" action="?/moveExercise" use:enhance>
						<input type="hidden" name="workoutExerciseId" value={item.id} />
						<input type="hidden" name="direction" value="up" />
						<button
							type="submit"
							disabled={index === 0}
							class="flex h-9 w-9 items-center justify-center rounded-md text-faint
								hover:bg-surface-2 hover:text-text-base disabled:pointer-events-none
								disabled:opacity-30"
							aria-label="Move {item.exercise.name} up"
						>
							<Icon name="arrowUp" size={16} />
						</button>
					</form>
					<form method="POST" action="?/moveExercise" use:enhance>
						<input type="hidden" name="workoutExerciseId" value={item.id} />
						<input type="hidden" name="direction" value="down" />
						<button
							type="submit"
							disabled={index === workout.exercises.length - 1}
							class="flex h-9 w-9 items-center justify-center rounded-md text-faint
								hover:bg-surface-2 hover:text-text-base disabled:pointer-events-none
								disabled:opacity-30"
							aria-label="Move {item.exercise.name} down"
						>
							<Icon name="arrowDown" size={16} />
						</button>
					</form>
					<form method="POST" action="?/removeExercise" use:enhance>
						<input type="hidden" name="workoutExerciseId" value={item.id} />
						<button
							type="submit"
							class="flex h-9 w-9 items-center justify-center rounded-md text-faint
								hover:bg-danger-soft hover:text-danger"
							aria-label="Remove {item.exercise.name} from this workout"
						>
							<Icon name="trash" size={16} />
						</button>
					</form>
				</div>
			</div>

			{#key setSignature(item.sets)}
				<SetList
					workoutExerciseId={item.id}
					kind={item.exercise.kind}
					sets={item.sets}
					units={data.user.unitSystem}
				/>
			{/key}

			<form method="POST" action="?/exerciseNotes" use:enhance class="mt-3">
				<input type="hidden" name="workoutExerciseId" value={item.id} />
				<label class="sr-only" for="exercise-notes-{item.id}">
					Notes for {item.exercise.name}
				</label>
				<input
					id="exercise-notes-{item.id}"
					name="notes"
					class="ow-input h-9 text-sm"
					placeholder="Notes for this exercise…"
					value={item.notes ?? ''}
					onchange={(event) => event.currentTarget.form?.requestSubmit()}
				/>
			</form>
		</section>
	{/each}
</div>

{#if picking}
	<div class="mt-4">
		<ExercisePicker
			options={data.exerciseOptions}
			alreadyAdded={addedIds}
			onclose={() => (picking = false)}
		/>
	</div>
{:else}
	<button type="button" class="ow-btn-secondary mt-4 w-full" onclick={() => (picking = true)}>
		<Icon name="plus" size={16} />
		Add exercise
	</button>
{/if}

{#if isEmpty && !picking}
	<div class="ow-card mt-4 p-8 text-center">
		<p class="font-medium">Nothing logged yet</p>
		<p class="mt-1 text-sm text-muted">Add your first exercise to start this workout.</p>
	</div>
{/if}

{#if !isEmpty}
	<div class="mt-6 space-y-3">
		{#if !workout.endedAt}
			<form method="POST" action="?/finish" use:enhance>
				<button type="submit" class="ow-btn-primary w-full">
					<Icon name="check" size={16} />
					Finish workout
				</button>
			</form>
		{/if}

		{#if savingRoutine}
			<form method="POST" action="?/saveAsRoutine" use:enhance class="ow-card space-y-3 p-4">
				<div>
					<label class="ow-label" for="routine-name">Routine name</label>
					<input
						id="routine-name"
						name="name"
						class="ow-input"
						maxlength="80"
						required
						value={workout.title ?? ''}
						placeholder="e.g. Upper A"
					/>
					<p class="mt-1 text-xs text-faint">
						Copies these exercises with the working-set count and heaviest weight as
						targets. Warm-ups are not carried over.
					</p>
				</div>
				<div class="flex gap-2">
					<button type="submit" class="ow-btn-primary">Save routine</button>
					<button
						type="button"
						class="ow-btn-secondary"
						onclick={() => (savingRoutine = false)}
					>
						Cancel
					</button>
				</div>
			</form>
		{:else}
			<button
				type="button"
				class="ow-btn-secondary w-full"
				onclick={() => (savingRoutine = true)}
			>
				<Icon name="copy" size={16} />
				Save as routine
			</button>
		{/if}
	</div>
{/if}
