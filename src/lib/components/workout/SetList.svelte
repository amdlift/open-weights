<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Icon from '$lib/components/Icon.svelte';
	import {
		RPE_VALUES,
		fieldsForKind,
		formatIntensity,
		formatRepTarget,
		type ExerciseKind,
		type UnitSystem
	} from '$lib/constants';
	import {
		distanceUnit,
		formatDuration,
		formatWeight,
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
	 * Editable copies of the incoming sets, each carrying whatever the plan
	 * asked for alongside what has actually been logged.
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
				isWarmup: set.isWarmup,
				isCompleted: set.isCompleted,
				// The prescription, converted at the edge exactly like the actuals.
				target: {
					weight:
						set.targetWeightKg == null ? '' : trimNumber(fromKg(set.targetWeightKg, units), 2),
					reps: set.targetRepsMin == null ? '' : String(set.targetRepsMin),
					rpe: set.targetRpe == null ? '' : String(set.targetRpe),
					distance:
						set.targetDistanceM == null
							? ''
							: trimNumber(fromMetres(set.targetDistanceM, units), 3),
					duration: set.targetDurationS == null ? '' : formatDuration(set.targetDurationS)
				},
				hasTarget:
					set.targetWeightKg != null ||
					set.targetRepsMin != null ||
					set.targetRpe != null ||
					set.targetPercentOneRm != null ||
					set.targetDistanceM != null ||
					set.targetDurationS != null
			}))
		)
	);

	/**
	 * Whether anything here was prescribed. Everything the plan adds to this
	 * component hangs off it, so a freeform workout renders exactly as it did
	 * before programs existed.
	 */
	let anyTargets = $derived(rows.some((r) => r.hasTarget));

	/**
	 * The grid is declared once and shared by the header and every row. Each
	 * form uses `display: contents` so its inputs sit directly in this grid —
	 * that is what keeps the columns aligned while still letting the row's
	 * fields and its delete button post to different actions.
	 */
	let gridTemplate = $derived(
		[
			'2rem',
			// A 3.5rem floor keeps "102.5" readable on the narrowest phones; the
			// wrapper scrolls horizontally rather than crushing the fields.
			fields.weight ? 'minmax(3.5rem,1fr)' : null,
			fields.reps ? 'minmax(3.5rem,1fr)' : null,
			fields.distance ? 'minmax(3.5rem,1fr)' : null,
			fields.duration ? 'minmax(4rem,1fr)' : null,
			fields.rpe ? '4rem' : null,
			anyTargets ? '2rem' : null,
			'2rem'
		]
			.filter(Boolean)
			.join(' ')
	);

	/**
	 * What the plan asked for, said once above the grid.
	 *
	 * The ghosts in the fields disappear the moment you type over them, so this
	 * is what keeps the plan legible for the rest of the session — and it is the
	 * only place with room to explain where a resolved weight came from.
	 */
	let prescription = $derived.by(() => {
		const first = sets.find(
			(s) => s.targetRepsMin != null || s.targetWeightKg != null || s.targetPercentOneRm != null
		);
		if (!first) return null;

		const count = sets.filter((s) => !s.isWarmup).length;
		const reps = formatRepTarget(first.targetRepsMin, first.targetRepsMax);
		const intensity = formatIntensity(
			first.targetRpe != null ? 'rpe' : first.targetPercentOneRm != null ? 'percent_1rm' : null,
			first.targetRpe,
			first.targetPercentOneRm
		);

		return {
			summary: [`${count} × ${reps}`, intensity === '—' ? null : intensity]
				.filter(Boolean)
				.join(' '),
			basis:
				first.targetWeightKg != null && first.targetPercentOneRm != null
					? `= ${formatWeight(first.targetWeightKg, units)}`
					: first.targetPercentOneRm != null
						? 'no reference max set'
						: null
		};
	});

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
	let plannedSets = $derived(rows.filter((r) => !r.isWarmup && r.hasTarget).length);
	let doneSets = $derived(rows.filter((r) => !r.isWarmup && r.isCompleted).length);

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

	/**
	 * Submit after the bindings have reached the DOM.
	 *
	 * Anything that changes `rows` and then posts has to go through here.
	 * `requestSubmit` serialises the inputs as they are *now*, and Svelte writes
	 * bound values on the next tick, so submitting synchronously posts the
	 * previous state — a confirmed set would arrive still empty and still
	 * unconfirmed, and `finishWorkout` would then prune it as never performed.
	 *
	 * The form is captured before the await because `currentTarget` is nulled
	 * once the event finishes dispatching.
	 */
	async function submitAfterUpdate(event: Event) {
		const form = (event.currentTarget as HTMLElement & { form?: HTMLFormElement }).form;
		await tick();
		form?.requestSubmit();
	}

	/** An RPE on its own is not evidence you did the set — it is how it felt. */
	function wasPerformed(row: (typeof rows)[number]): boolean {
		return (
			row.weight !== '' || row.reps !== '' || row.distance !== '' || row.duration !== ''
		);
	}

	/**
	 * Typing a number is what records the set, so completion is re-derived on
	 * every edit. Without this a prescribed set you filled in but never ticked
	 * would be pruned as untouched when the workout is finished.
	 */
	function recordChange(index: number, event: Event) {
		const row = rows[index];
		if (row.hasTarget) row.isCompleted = wasPerformed(row);
		submitAfterUpdate(event);
	}

	/**
	 * One tap for "did exactly what it said on the tin".
	 *
	 * Only blank fields are filled: anything already typed is what actually
	 * happened and is never overwritten. RPE is left alone even when prescribed
	 * — it is a self-report, and the app has no business filing one on the
	 * lifter's behalf.
	 */
	function toggleComplete(index: number, event: Event) {
		const row = rows[index];
		if (row.isCompleted) {
			// Unticking means "I mis-tapped", not "throw away my numbers".
			row.isCompleted = false;
		} else {
			if (row.weight === '') row.weight = row.target.weight;
			if (row.reps === '') row.reps = row.target.reps;
			if (row.distance === '') row.distance = row.target.distance;
			if (row.duration === '') row.duration = row.target.duration;
			row.isCompleted = true;
		}
		submitAfterUpdate(event);
	}

	/** A ghost shows the plan in an empty field. Warm-ups never carry one: the
	 *  plan's third working set is not the warm-up you just inserted. */
	function ghost(index: number, field: keyof (typeof rows)[number]['target']): string {
		const row = rows[index];
		return !row.isWarmup && row.target[field] !== '' ? row.target[field] : '';
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
{#if prescription}
	<p class="mb-2 flex flex-wrap items-baseline gap-x-2 text-xs">
		<span class="rounded-md bg-primary-soft px-1.5 py-0.5 font-medium text-text-base tnum">
			{prescription.summary}
		</span>
		{#if prescription.basis}
			<span class="text-faint tnum">{prescription.basis}</span>
		{/if}
	</p>
{/if}

<div class="-mx-1 overflow-x-auto px-1">
<div
	class="grid max-w-xl min-w-[19rem] items-center gap-x-1.5 gap-y-1.5"
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
	{#if anyTargets}<span></span>{/if}
	<span></span>

	{#each rows as row, index (row.id)}
		<form method="POST" action="?/updateSet" use:enhance={saveQuietly} class="contents">
			<input type="hidden" name="setId" value={row.id} />
			<input type="hidden" name="isWarmup" value={String(row.isWarmup)} />
			<input type="hidden" name="isCompleted" value={String(row.isCompleted)} />

			<!-- Tapping the set number flips it between warm-up and working set:
			     no extra control, and it explains itself the first time. -->
			<button
				type="button"
				onclick={(event) => {
					row.isWarmup = !row.isWarmup;
					submitAfterUpdate(event);
				}}
				title={row.isWarmup
					? 'Warm-up set — tap to make it a working set'
					: 'Working set — tap to mark as a warm-up'}
				class="flex h-10 w-8 items-center justify-center rounded-md text-xs font-semibold
					{row.isWarmup ? 'bg-surface-2 text-faint' : 'bg-primary-soft text-text-base'}"
			>
				{setLabel(index)}
			</button>

			{#if fields.weight}
				{@const hint = ghost(index, 'weight')}
				<input
					name="weight"
					class="ow-input h-10 px-1 py-1 text-center tnum
						{hint && row.weight === ''
						? 'ring-1 ring-primary/30 ring-inset placeholder:text-primary/60'
						: ''}"
					inputmode="decimal"
					placeholder={hint || '—'}
					aria-label="Set {setLabel(index)} weight in {weightUnit(units)}{hint
						? `, ${hint} prescribed`
						: ''}"
					bind:value={row.weight}
					onchange={(event) => recordChange(index, event)}
				/>
			{/if}
			{#if fields.reps}
				{@const hint = ghost(index, 'reps')}
				<input
					name="reps"
					class="ow-input h-10 px-1 py-1 text-center tnum
						{hint && row.reps === ''
						? 'ring-1 ring-primary/30 ring-inset placeholder:text-primary/60'
						: ''}"
					inputmode="numeric"
					placeholder={hint || '—'}
					aria-label="Set {setLabel(index)} reps{hint ? `, ${hint} prescribed` : ''}"
					bind:value={row.reps}
					onchange={(event) => recordChange(index, event)}
				/>
			{/if}
			{#if fields.distance}
				{@const hint = ghost(index, 'distance')}
				<input
					name="distance"
					class="ow-input h-10 px-1 py-1 text-center tnum
						{hint && row.distance === ''
						? 'ring-1 ring-primary/30 ring-inset placeholder:text-primary/60'
						: ''}"
					inputmode="decimal"
					placeholder={hint || '—'}
					aria-label="Set {setLabel(index)} distance in {distanceUnit(units)}{hint
						? `, ${hint} prescribed`
						: ''}"
					bind:value={row.distance}
					onchange={(event) => recordChange(index, event)}
				/>
			{/if}
			{#if fields.duration}
				{@const hint = ghost(index, 'duration')}
				<input
					name="duration"
					class="ow-input h-10 px-1 py-1 text-center tnum
						{hint && row.duration === ''
						? 'ring-1 ring-primary/30 ring-inset placeholder:text-primary/60'
						: ''}"
					placeholder={hint || 'mm:ss'}
					aria-label="Set {setLabel(index)} time{hint ? `, ${hint} prescribed` : ''}"
					bind:value={row.duration}
					onchange={(event) => recordChange(index, event)}
				/>
			{/if}
			{#if fields.rpe}
				<select
					name="rpe"
					class="ow-input h-10 px-1 py-1 text-center"
					aria-label="Set {setLabel(index)} rate of perceived exertion{row.target.rpe
						? `, ${row.target.rpe} prescribed`
						: ''}"
					bind:value={row.rpe}
					onchange={(event) => recordChange(index, event)}
				>
					<option value="">{ghost(index, 'rpe') || '—'}</option>
					{#each RPE_VALUES as value (value)}
						<option value={String(value)}>{value}</option>
					{/each}
				</select>
			{/if}

			{#if anyTargets}
				<!-- Last child of the row form on purpose: `display: contents` lays
				     these out in DOM order, and being inside the form is what lets one
				     tap both fill the blanks and post them. -->
				<button
					type="button"
					onclick={(event) => toggleComplete(index, event)}
					aria-pressed={row.isCompleted}
					aria-label="{row.isCompleted ? 'Logged' : 'Log'} set {setLabel(index)}{row.hasTarget &&
					!row.isCompleted
						? ' as prescribed'
						: ''}"
					title={row.isCompleted
						? 'Logged — tap to unmark'
						: row.hasTarget
							? 'Log this set as prescribed'
							: 'Mark this set as done'}
					class="flex h-10 w-8 items-center justify-center rounded-md border
						{row.isCompleted
						? 'border-transparent bg-primary text-on-primary'
						: 'border-border-strong text-faint hover:bg-surface-2'}"
				>
					<Icon name="check" size={15} />
				</button>
			{/if}
		</form>

		<form method="POST" action="?/deleteSet" use:enhance class="contents">
			<input type="hidden" name="setId" value={row.id} />
			<button
				type="submit"
				class="flex h-10 w-8 items-center justify-center rounded-md text-faint
					hover:bg-danger-soft hover:text-danger"
				aria-label={row.hasTarget
					? `Remove set ${setLabel(index)} from today's plan`
					: `Remove set ${setLabel(index)}`}
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

	<!--
		Against a plan the count is progress, not a total: counting every
		prescribed row as a working set would boast "4 working sets" before the
		lifter had touched the bar.
	-->
	{#if plannedSets > 0}
		<span class="ml-auto text-xs text-faint tnum">
			{doneSets} of {plannedSets} sets{volume > 0
				? ` · ${trimNumber(volume, 0)} ${weightUnit(units)}`
				: ''}
		</span>
	{:else if volume > 0}
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
