<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ExercisePicker from '$lib/components/workout/ExercisePicker.svelte';
	import {
		RPE_VALUES,
		fieldsForKind,
		formatRepTarget,
		supportsOneRm,
		type IntensityMode
	} from '$lib/constants';
	import {
		distanceUnit,
		formatDuration,
		formatWeight,
		fromMetres,
		roundToLoadable,
		trimNumber
	} from '$lib/units';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let picking = $state(false);
	let editingDetails = $state(false);
	let confirmingDelete = $state(false);
	let confirmingWeekDelete = $state(false);
	let confirmingShrink = $state<number | null>(null);

	let units = $derived(data.user.unitSystem);
	let progress = $derived(new Map(data.progress));
	let weekCount = $derived(data.program.weeks.length);
	let columns = $derived(Math.max(...data.program.weeks.map((w) => w.days.length), 1));

	const saveQuietly: SubmitFunction = () => {
		// Same rule as the set editor: value edits save without re-rendering, so
		// the page never jumps while you are typing in a neighbouring field.
		return async ({ result }) => {
			if (result.type === 'error') console.error('Failed to save', result.error);
		};
	};

	function submitOwnForm(event: Event) {
		(event.currentTarget as HTMLElement & { form?: HTMLFormElement }).form?.requestSubmit();
	}

	/** What a percentage works out to at today's estimate, for the editor only. */
	function preview(exerciseId: number, percent: number | null): string | null {
		if (percent == null) return null;
		const estimate = data.oneRmEstimates[exerciseId];
		if (estimate == null) return null;
		return formatWeight(roundToLoadable((estimate * percent) / 100, units), units);
	}

	const MODES: Array<{ value: IntensityMode | ''; label: string }> = [
		{ value: '', label: '—' },
		{ value: 'rpe', label: 'RPE' },
		{ value: 'percent_1rm', label: '% 1RM' }
	];

	/** How many authored days a shrink would take with it. */
	function daysLostBy(target: number): number {
		return data.program.weeks.reduce(
			(sum, week) =>
				sum + week.days.filter((d) => d.orderIndex >= target && d.exerciseCount > 0).length,
			0
		);
	}
</script>

<svelte:head><title>{data.program.name} · OpenWeights</title></svelte:head>

<PageHeader title={data.program.name} description={data.program.notes ?? undefined}>
	{#snippet actions()}
		{#if data.upNext}
			<form method="POST" action="?/startDay" use:enhance>
				<input type="hidden" name="programDayId" value={data.upNext.programDayId} />
				<input type="hidden" name="enrollmentId" value={data.upNext.enrollmentId} />
				<button type="submit" class="ow-btn-primary">
					<Icon name="plus" size={16} />
					{data.upNext.resumeWorkoutId ? 'Resume' : 'Start'} W{data.upNext.weekNumber} D{data
						.upNext.dayNumber}
				</button>
			</form>
		{:else if !data.enrollment}
			<a href="/programs/{data.program.id}/start" class="ow-btn-primary">Start this program</a>
		{/if}
		<button
			type="button"
			class="ow-btn-secondary"
			onclick={() => (editingDetails = !editingDetails)}
		>
			<Icon name="settings" size={16} />
			Details
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

{#if data.enrollment}
	<div class="ow-card mb-4 border-primary/40 p-3">
		<p class="text-sm">
			You're on <strong>week {data.upNext?.weekNumber ?? '—'}</strong> of this program
			({data.enrollment.doneDays}/{data.enrollment.totalDays} sessions).
			Edits apply to the weeks you haven't done yet.
			{#if data.enrollment.missingOneRmCount > 0}
				<a href="/programs/{data.program.id}/start" class="text-primary underline">
					{data.enrollment.missingOneRmCount} exercises have no reference max.
				</a>
			{/if}
		</p>
	</div>
{/if}

{#if editingDetails}
	<form method="POST" action="?/updateDetails" use:enhance class="ow-card mb-5 space-y-3 p-4">
		<div>
			<label class="ow-label" for="name">Name</label>
			<input
				id="name"
				name="name"
				class="ow-input"
				maxlength="80"
				required
				value={data.program.name}
			/>
		</div>
		<div>
			<label class="ow-label" for="notes">Notes</label>
			<input id="notes" name="notes" class="ow-input" value={data.program.notes ?? ''} />
		</div>
		<div class="flex flex-wrap gap-2">
			<button type="submit" class="ow-btn-primary">Save</button>
			<button type="button" class="ow-btn-secondary" onclick={() => (editingDetails = false)}>
				Cancel
			</button>
			{#if confirmingDelete}
				<span class="ml-auto flex items-center gap-2">
					<span class="text-xs text-muted">
						Delete the program? Workouts you logged from it stay as they are.
					</span>
					<button
						type="submit"
						formaction="?/delete"
						class="ow-btn-danger h-9 min-h-9 px-3 text-xs">Delete</button
					>
					<button
						type="button"
						class="ow-btn-ghost h-9 min-h-9 px-3 text-xs"
						onclick={() => (confirmingDelete = false)}>Cancel</button
					>
				</span>
			{:else}
				<button
					type="button"
					class="ow-btn-ghost ml-auto h-9 min-h-9 px-3 text-xs text-faint hover:text-danger"
					onclick={() => (confirmingDelete = true)}
				>
					<Icon name="trash" size={14} />
					Delete program
				</button>
			{/if}
		</div>
	</form>

	<form method="POST" action="?/setDaysPerWeek" use:enhance class="ow-card mb-5 p-4">
		<label class="ow-label" for="daysPerWeek">Training days per week</label>
		<div class="flex flex-wrap items-center gap-2">
			<input
				id="daysPerWeek"
				name="daysPerWeek"
				class="ow-input tnum w-20"
				type="number"
				min="1"
				max="7"
				value={data.program.daysPerWeek}
				onchange={(e) => (confirmingShrink = Number(e.currentTarget.value))}
			/>
			{#if confirmingShrink != null && confirmingShrink < columns && daysLostBy(confirmingShrink) > 0}
				<span class="text-xs text-danger">
					This removes {daysLostBy(confirmingShrink)} days that have exercises.
				</span>
			{/if}
			<button type="submit" class="ow-btn-secondary h-10 min-h-10">Apply to every week</button>
		</div>
	</form>
{/if}

<!-- The grid navigates; the editor below it edits. Five day-cards side by side
     would be unusable at any width, so the grid stays a map. -->
<div class="ow-card mb-5 overflow-x-auto">
	<div
		class="grid min-w-max"
		style:grid-template-columns="2.75rem repeat({columns}, minmax(5.5rem,1fr))"
	>
		<span class="border-b border-border-base"></span>
		{#each Array.from({ length: columns }, (_, i) => i + 1) as dayNumber (dayNumber)}
			<span
				class="border-b border-border-base py-2 text-center text-[11px] font-medium tracking-wide
					text-faint uppercase"
			>
				D{dayNumber}
			</span>
		{/each}

		{#each data.program.weeks as week (week.weekNumber)}
			<span
				class="flex items-center justify-center border-r border-b border-border-base text-xs
					font-medium text-muted tnum"
			>
				W{week.weekNumber}
			</span>
			{#each Array.from({ length: columns }, (_, i) => week.days[i]) as cell, index (index)}
				{#if cell}
					{@const here = week.weekNumber === data.week && cell.orderIndex === data.day - 1}
					{@const done = progress.get(cell.id)}
					<a
						href="?week={week.weekNumber}&day={cell.orderIndex + 1}"
						aria-current={here ? 'true' : undefined}
						class="min-h-16 border-r border-b border-border-base p-1.5 text-left last:border-r-0
							hover:bg-surface-2 {here ? 'bg-primary-soft' : ''}"
					>
						<span class="block truncate text-[11px] font-medium">
							{cell.title || `Day ${cell.orderIndex + 1}`}
						</span>
						<span class="mt-0.5 block truncate text-[10px] text-faint">
							{cell.exerciseNames.slice(0, 2).join(', ') || '—'}
						</span>
						{#if done}
							<span
								class="mt-1 inline-flex {done.isFinished ? 'text-success' : 'text-warning'}"
								aria-label={done.isFinished ? 'logged' : 'in progress'}
							>
								<Icon name={done.isFinished ? 'check' : 'clock'} size={12} />
							</span>
						{/if}
					</a>
				{:else}
					<span class="border-r border-b border-border-base last:border-r-0"></span>
				{/if}
			{/each}
		{/each}
	</div>
</div>

<div class="mb-5 flex flex-wrap gap-2">
	<form method="POST" action="?/duplicateWeek" use:enhance>
		<input type="hidden" name="fromWeek" value={data.week} />
		<button type="submit" class="ow-btn-secondary h-9 min-h-9 px-3 text-xs">
			<Icon name="copy" size={14} />
			Duplicate week {data.week}
		</button>
	</form>

	<form method="POST" action="?/addWeek" use:enhance>
		<button type="submit" class="ow-btn-ghost h-9 min-h-9 px-3 text-xs">
			<Icon name="plus" size={14} />
			Add week
		</button>
	</form>

	{#if weekCount > 1}
		{#if confirmingWeekDelete}
			<form method="POST" action="?/deleteWeek" use:enhance class="flex items-center gap-2">
				<input type="hidden" name="week" value={data.week} />
				<span class="text-xs text-muted">Delete week {data.week}?</span>
				<button type="submit" class="ow-btn-danger h-9 min-h-9 px-3 text-xs">Delete</button>
				<button
					type="button"
					class="ow-btn-ghost h-9 min-h-9 px-3 text-xs"
					onclick={() => (confirmingWeekDelete = false)}>Cancel</button
				>
			</form>
		{:else}
			<button
				type="button"
				class="ow-btn-ghost h-9 min-h-9 px-3 text-xs text-faint hover:text-danger"
				onclick={() => (confirmingWeekDelete = true)}
			>
				<Icon name="trash" size={14} />
				Delete week {data.week}
			</button>
		{/if}
	{/if}
</div>

{#if data.dayDetail}
	{@const day = data.dayDetail}
	<h2 class="mb-3 text-sm font-semibold text-muted">
		Week {data.week} · Day {data.day}
	</h2>

	<form
		method="POST"
		action="?/updateDay"
		use:enhance={saveQuietly}
		class="ow-card mb-4 grid gap-3 p-4 sm:grid-cols-2"
	>
		<input type="hidden" name="programDayId" value={day.id} />
		<div>
			<label class="ow-label" for="day-title">Name</label>
			<input
				id="day-title"
				name="title"
				class="ow-input"
				maxlength="60"
				placeholder="Day {data.day}"
				value={day.title ?? ''}
				onchange={submitOwnForm}
			/>
		</div>
		<div>
			<label class="ow-label" for="day-notes">Notes</label>
			<input
				id="day-notes"
				name="notes"
				class="ow-input"
				placeholder="Optional"
				value={day.notes ?? ''}
				onchange={submitOwnForm}
			/>
		</div>
	</form>

	<div class="space-y-3">
		{#each day.exercises as item, index (item.id)}
			{@const fields = fieldsForKind(item.exercise.kind)}
			{@const canPercent = supportsOneRm(item.exercise.kind)}
			<div class="ow-card p-4">
				<div class="mb-3 flex items-start justify-between gap-3">
					<div class="min-w-0">
						<p class="truncate font-medium">{item.exercise.name}</p>
						<p class="text-xs text-faint">
							{item.targetSets ?? '—'} × {formatRepTarget(item.targetRepsMin, item.targetRepsMax)}
							{#if item.intensityMode === 'rpe' && item.targetRpe != null}
								@{item.targetRpe}
							{:else if item.intensityMode === 'percent_1rm' && item.targetPercentOneRm != null}
								@ {item.targetPercentOneRm}%
							{/if}
						</p>
					</div>
					<div class="flex shrink-0 items-center gap-1">
						<form method="POST" action="?/moveItem" use:enhance>
							<input type="hidden" name="itemId" value={item.id} />
							<input type="hidden" name="direction" value="up" />
							<button
								type="submit"
								disabled={index === 0}
								class="ow-btn-ghost h-9 min-h-9 w-9 px-0 disabled:opacity-30"
								aria-label="Move {item.exercise.name} up"
							>
								<Icon name="arrowUp" size={15} />
							</button>
						</form>
						<form method="POST" action="?/moveItem" use:enhance>
							<input type="hidden" name="itemId" value={item.id} />
							<input type="hidden" name="direction" value="down" />
							<button
								type="submit"
								disabled={index === day.exercises.length - 1}
								class="ow-btn-ghost h-9 min-h-9 w-9 px-0 disabled:opacity-30"
								aria-label="Move {item.exercise.name} down"
							>
								<Icon name="arrowDown" size={15} />
							</button>
						</form>
						<form method="POST" action="?/removeItem" use:enhance>
							<input type="hidden" name="itemId" value={item.id} />
							<button
								type="submit"
								class="ow-btn-ghost h-9 min-h-9 w-9 px-0 text-faint hover:text-danger"
								aria-label="Remove {item.exercise.name}"
							>
								<Icon name="trash" size={15} />
							</button>
						</form>
					</div>
				</div>

				<!-- Switching mode changes which input renders, so it refreshes rather
				     than saving quietly — a structural change, by the same rule the set
				     editor follows. -->
				<form method="POST" action="?/setIntensityMode" use:enhance class="mb-3 flex">
					<input type="hidden" name="itemId" value={item.id} />
					<div class="inline-flex rounded-lg border border-border-base p-0.5">
						{#each MODES as mode (mode.value)}
							{@const disabled = mode.value === 'percent_1rm' && !canPercent}
							<button
								type="submit"
								name="intensityMode"
								value={mode.value}
								{disabled}
								aria-pressed={(item.intensityMode ?? '') === mode.value}
								title={disabled
									? 'Only weight-based lifts carry a one-rep max.'
									: undefined}
								class="min-h-8 rounded-md px-2.5 text-xs font-medium disabled:opacity-40
									{(item.intensityMode ?? '') === mode.value
									? 'bg-primary-soft text-text-base'
									: 'text-muted hover:bg-surface-2'}"
							>
								{mode.label}
							</button>
						{/each}
					</div>
				</form>

				<form
					method="POST"
					action="?/updateItem"
					use:enhance={saveQuietly}
					class="grid grid-cols-2 gap-3 sm:grid-cols-4"
				>
					<input type="hidden" name="itemId" value={item.id} />

					<div>
						<label class="ow-label text-xs" for="sets-{item.id}">Sets</label>
						<input
							id="sets-{item.id}"
							name="targetSets"
							class="ow-input tnum h-10 text-center"
							inputmode="numeric"
							placeholder="—"
							value={item.targetSets ?? ''}
							onchange={submitOwnForm}
						/>
					</div>

					{#if fields.reps}
						<div class="col-span-1">
							<span class="ow-label text-xs">Reps</span>
							<div class="flex items-center gap-1">
								<input
									name="targetRepsMin"
									class="ow-input tnum h-10 px-1 text-center"
									inputmode="numeric"
									placeholder="—"
									aria-label="Minimum reps"
									value={item.targetRepsMin ?? ''}
									onchange={submitOwnForm}
								/>
								<span class="text-xs text-faint">to</span>
								<input
									name="targetRepsMax"
									class="ow-input tnum h-10 px-1 text-center"
									inputmode="numeric"
									placeholder="—"
									aria-label="Maximum reps"
									value={item.targetRepsMax ?? ''}
									onchange={submitOwnForm}
								/>
							</div>
						</div>
					{/if}

					{#if item.intensityMode === 'rpe' && fields.rpe}
						<div>
							<label class="ow-label text-xs" for="rpe-{item.id}">RPE</label>
							<select
								id="rpe-{item.id}"
								name="targetRpe"
								class="ow-input h-10 text-center"
								value={item.targetRpe == null ? '' : String(item.targetRpe)}
								onchange={submitOwnForm}
							>
								<option value="">Optional</option>
								{#each RPE_VALUES as value (value)}
									<option value={String(value)}>{value}</option>
								{/each}
							</select>
						</div>
					{/if}

					{#if item.intensityMode === 'percent_1rm'}
						<div>
							<label class="ow-label text-xs" for="pct-{item.id}">% of 1RM</label>
							<input
								id="pct-{item.id}"
								name="targetPercentOneRm"
								class="ow-input tnum h-10 text-center"
								inputmode="numeric"
								placeholder="—"
								value={item.targetPercentOneRm ?? ''}
								onchange={submitOwnForm}
							/>
							<p class="mt-1 text-[11px] text-faint">
								{#if preview(item.exercise.id, item.targetPercentOneRm)}
									≈ {preview(item.exercise.id, item.targetPercentOneRm)} at your current estimate
								{:else}
									You'll set a reference max when you start the program.
								{/if}
							</p>
						</div>
					{/if}

					{#if fields.distance}
						<div>
							<label class="ow-label text-xs" for="dist-{item.id}">
								Distance ({distanceUnit(units)})
							</label>
							<input
								id="dist-{item.id}"
								name="targetDistance"
								class="ow-input tnum h-10 text-center"
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
							<label class="ow-label text-xs" for="dur-{item.id}">Time</label>
							<input
								id="dur-{item.id}"
								name="targetDuration"
								class="ow-input tnum h-10 text-center"
								placeholder="mm:ss"
								value={item.targetDurationS == null ? '' : formatDuration(item.targetDurationS)}
								onchange={submitOwnForm}
							/>
						</div>
					{/if}

					<div class="col-span-2 sm:col-span-4">
						<label class="ow-label text-xs" for="notes-{item.id}">Notes</label>
						<input
							id="notes-{item.id}"
							name="notes"
							class="ow-input"
							placeholder="Tempo, rest, machine settings…"
							value={item.notes ?? ''}
							onchange={submitOwnForm}
						/>
					</div>
				</form>
			</div>
		{/each}
	</div>

	{#if picking}
		<div class="mt-3">
			<ExercisePicker
				options={data.exerciseOptions}
				alreadyAdded={day.exercises.map((e) => e.exercise.id)}
				extra={{ programDayId: String(day.id) }}
				onclose={() => (picking = false)}
			/>
		</div>
	{:else}
		<button type="button" class="ow-btn-secondary mt-3" onclick={() => (picking = true)}>
			<Icon name="plus" size={16} />
			Add exercise
		</button>
	{/if}

	{#if day.exercises.length === 0 && !picking}
		<p class="mt-3 text-sm text-faint">
			Nothing prescribed for this day yet. Add the exercises, then duplicate the week once it
			reads the way you want.
		</p>
	{/if}
{/if}
