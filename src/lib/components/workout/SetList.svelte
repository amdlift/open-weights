<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Icon from '$lib/components/Icon.svelte';
	import { RPE_VALUES, fieldsForKind, type ExerciseKind, type UnitSystem } from '$lib/constants';
	import {
		distanceUnit,
		formatDuration,
		fromKg,
		fromMetres,
		trimNumber,
		weightUnit
	} from '$lib/units';
	import type { WorkoutSetRow } from '$lib/server/workouts';

	type Props = {
		workoutExerciseId: number;
		kind: ExerciseKind;
		sets: WorkoutSetRow[];
		units: UnitSystem;
	};

	let { workoutExerciseId, kind, sets, units }: Props = $props();

	let fields = $derived(fieldsForKind(kind));

	/**
	 * The grid is declared once and shared by the header and every row. Each
	 * form uses `display: contents` so its inputs sit directly in this grid —
	 * that is what keeps the columns aligned while still letting the row's
	 * fields and its delete button post to different actions.
	 */
	let gridTemplate = $derived(
		[
			'2.25rem',
			// A 3.5rem floor keeps "102.5" readable on the narrowest phones; the
			// wrapper scrolls horizontally rather than crushing the fields.
			fields.weight ? 'minmax(3.5rem,1fr)' : null,
			fields.reps ? 'minmax(3.5rem,1fr)' : null,
			fields.distance ? 'minmax(3.5rem,1fr)' : null,
			fields.duration ? 'minmax(4rem,1fr)' : null,
			fields.rpe ? '4rem' : null,
			'2rem'
		]
			.filter(Boolean)
			.join(' ')
	);

	/**
	 * Editable copies of the incoming sets.
	 *
	 * The parent remounts this component (via `{#key}`) whenever a set is added
	 * or removed, so this initial-value-only state never goes stale. Field edits
	 * deliberately do NOT re-run the page load: refreshing mid-workout would
	 * overwrite whatever the user is typing in a neighbouring field.
	 */
	let rows = $state(
		untrack(() =>
			sets.map((set) => ({
				id: set.id,
				weight: set.weightKg == null ? '' : trimNumber(fromKg(set.weightKg, units), 2),
				reps: set.reps == null ? '' : String(set.reps),
				rpe: set.rpe == null ? '' : String(set.rpe),
				distance: set.distanceM == null ? '' : trimNumber(fromMetres(set.distanceM, units), 3),
				duration: set.durationS == null ? '' : formatDuration(set.durationS),
				isWarmup: set.isWarmup
			}))
		)
	);

	/** Live tally from the fields on screen, not from the last server response. */
	let volume = $derived(
		rows.reduce((sum, row) => {
			if (row.isWarmup) return sum;
			const weight = Number(row.weight.replace(',', '.'));
			const reps = Number(row.reps);
			return sum + (Number.isFinite(weight) && Number.isFinite(reps) ? weight * reps : 0);
		}, 0)
	);

	let workingSets = $derived(rows.filter((r) => !r.isWarmup).length);

	const saveQuietly: SubmitFunction = () => {
		// No `update()`: the write is fire-and-forget so typing is never
		// interrupted. Structural changes are what refresh the page.
		return async ({ result }) => {
			if (result.type === 'error') console.error('Failed to save set', result.error);
		};
	};

	function submitOwnForm(event: Event) {
		(event.currentTarget as HTMLElement & { form?: HTMLFormElement }).form?.requestSubmit();
	}

	/** Working-set numbering skips warm-ups, matching how lifters count. */
	function setLabel(index: number): string {
		if (rows[index].isWarmup) return 'W';
		let n = 0;
		for (let i = 0; i <= index; i++) if (!rows[i].isWarmup) n++;
		return String(n);
	}
</script>

<!--
	Capped rather than stretched: on a wide screen a set row spanning 1200px puts
	the weight and the reps a hand-span apart, which is worse to read and worse
	to tab through than a compact row.
-->
<div class="-mx-1 overflow-x-auto px-1">
<div
	class="grid max-w-xl min-w-[19rem] items-center gap-x-2 gap-y-1.5"
	style:grid-template-columns={gridTemplate}
>
	<!-- Header -->
	<span class="text-[11px] font-medium tracking-wide text-faint uppercase">Set</span>
	{#if fields.weight}
		<span class="text-center text-[11px] font-medium tracking-wide text-faint uppercase">
			{weightUnit(units)}
		</span>
	{/if}
	{#if fields.reps}
		<span class="text-center text-[11px] font-medium tracking-wide text-faint uppercase">
			Reps
		</span>
	{/if}
	{#if fields.distance}
		<span class="text-center text-[11px] font-medium tracking-wide text-faint uppercase">
			{distanceUnit(units)}
		</span>
	{/if}
	{#if fields.duration}
		<span class="text-center text-[11px] font-medium tracking-wide text-faint uppercase">
			Time
		</span>
	{/if}
	{#if fields.rpe}
		<span class="text-center text-[11px] font-medium tracking-wide text-faint uppercase">
			RPE
		</span>
	{/if}
	<span></span>

	{#each rows as row, index (row.id)}
		<form method="POST" action="?/updateSet" use:enhance={saveQuietly} class="contents">
			<input type="hidden" name="setId" value={row.id} />
			<input type="hidden" name="isWarmup" value={String(row.isWarmup)} />

			<!-- Tapping the set number flips it between warm-up and working set:
			     no extra control, and it explains itself the first time. -->
			<button
				type="button"
				onclick={(event) => {
					row.isWarmup = !row.isWarmup;
					submitOwnForm(event);
				}}
				title={row.isWarmup
					? 'Warm-up set — tap to make it a working set'
					: 'Working set — tap to mark as a warm-up'}
				class="flex h-10 w-9 items-center justify-center rounded-md text-xs font-semibold
					{row.isWarmup ? 'bg-surface-2 text-faint' : 'bg-primary-soft text-text-base'}"
			>
				{setLabel(index)}
			</button>

			{#if fields.weight}
				<input
					name="weight"
					class="ow-input h-10 px-1 py-1 text-center tnum"
					inputmode="decimal"
					placeholder="—"
					aria-label="Set {setLabel(index)} weight in {weightUnit(units)}"
					bind:value={row.weight}
					onchange={submitOwnForm}
				/>
			{/if}
			{#if fields.reps}
				<input
					name="reps"
					class="ow-input h-10 px-1 py-1 text-center tnum"
					inputmode="numeric"
					placeholder="—"
					aria-label="Set {setLabel(index)} reps"
					bind:value={row.reps}
					onchange={submitOwnForm}
				/>
			{/if}
			{#if fields.distance}
				<input
					name="distance"
					class="ow-input h-10 px-1 py-1 text-center tnum"
					inputmode="decimal"
					placeholder="—"
					aria-label="Set {setLabel(index)} distance in {distanceUnit(units)}"
					bind:value={row.distance}
					onchange={submitOwnForm}
				/>
			{/if}
			{#if fields.duration}
				<input
					name="duration"
					class="ow-input h-10 px-1 py-1 text-center tnum"
					placeholder="mm:ss"
					aria-label="Set {setLabel(index)} time"
					bind:value={row.duration}
					onchange={submitOwnForm}
				/>
			{/if}
			{#if fields.rpe}
				<select
					name="rpe"
					class="ow-input h-10 px-1 py-1 text-center"
					aria-label="Set {setLabel(index)} rate of perceived exertion"
					bind:value={row.rpe}
					onchange={submitOwnForm}
				>
					<option value="">—</option>
					{#each RPE_VALUES as value (value)}
						<option value={String(value)}>{value}</option>
					{/each}
				</select>
			{/if}
		</form>

		<form method="POST" action="?/deleteSet" use:enhance class="contents">
			<input type="hidden" name="setId" value={row.id} />
			<button
				type="submit"
				class="flex h-10 w-8 items-center justify-center rounded-md text-faint
					hover:bg-danger-soft hover:text-danger"
				aria-label="Remove set {setLabel(index)}"
			>
				<Icon name="x" size={15} />
			</button>
		</form>
	{/each}
</div>
</div>

<div class="mt-3 flex max-w-xl flex-wrap items-center gap-2">
	<form method="POST" action="?/addSet" use:enhance>
		<input type="hidden" name="workoutExerciseId" value={workoutExerciseId} />
		<button type="submit" class="ow-btn-secondary h-9 min-h-9 px-3 text-xs">
			<Icon name="plus" size={14} />
			Add set
		</button>
	</form>

	{#if rows.length > 0}
		<form method="POST" action="?/repeatSet" use:enhance>
			<input type="hidden" name="workoutExerciseId" value={workoutExerciseId} />
			<button type="submit" class="ow-btn-ghost h-9 min-h-9 px-3 text-xs">
				<Icon name="copy" size={14} />
				Repeat last
			</button>
		</form>
	{/if}

	{#if volume > 0}
		<span class="ml-auto text-xs text-faint tnum">
			{workingSets} working {workingSets === 1 ? 'set' : 'sets'} ·
			{trimNumber(volume, 0)}
			{weightUnit(units)}
		</span>
	{:else if workingSets > 0}
		<span class="ml-auto text-xs text-faint">
			{workingSets} working {workingSets === 1 ? 'set' : 'sets'}
		</span>
	{/if}
</div>
