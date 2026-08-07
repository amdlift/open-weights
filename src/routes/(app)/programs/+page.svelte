<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { formatDateMedium } from '$lib/dates';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreate = $state(false);
	let confirmingDelete = $state<number | null>(null);

	let active = $derived(data.programs.filter((p) => !p.isArchived));
	let archived = $derived(data.programs.filter((p) => p.isArchived));

	let runsByProgram = $derived.by(() => {
		const map = new Map<number, PageData['enrollments']>();
		for (const run of data.enrollments) {
			map.set(run.programId, [...(map.get(run.programId) ?? []), run]);
		}
		return map;
	});
</script>

<svelte:head><title>Programs · OpenWeights</title></svelte:head>

<PageHeader
	title="Programs"
	description="Multi-week plans. Start one and the dashboard tells you which session is next."
>
	{#snippet actions()}
		<button type="button" class="ow-btn-primary" onclick={() => (showCreate = !showCreate)}>
			<Icon name="plus" size={16} />
			New program
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
				placeholder="e.g. 12-week strength block"
			/>
		</div>
		<div class="grid grid-cols-2 gap-3">
			<div>
				<label class="ow-label" for="daysPerWeek">Days per week</label>
				<input
					id="daysPerWeek"
					name="daysPerWeek"
					class="ow-input tnum"
					type="number"
					min="1"
					max="7"
					value="3"
					required
				/>
			</div>
			<div>
				<label class="ow-label" for="weeks">Weeks</label>
				<input
					id="weeks"
					name="weeks"
					class="ow-input tnum"
					type="number"
					min="1"
					max="52"
					value="4"
					required
				/>
			</div>
		</div>
		<p class="text-xs text-faint">
			Training days only — rest days are whenever you take them. You can change the shape later.
		</p>
		<div class="flex gap-2">
			<button type="submit" class="ow-btn-primary">Create and start authoring</button>
			<button type="button" class="ow-btn-secondary" onclick={() => (showCreate = false)}>
				Cancel
			</button>
		</div>
	</form>
{/if}

{#snippet programCard(program: PageData['programs'][number])}
	{@const runs = runsByProgram.get(program.id) ?? []}
	{@const live = runs.find((r) => r.completedOn == null)}
	<div class="ow-card p-4">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="min-w-0">
				<a
					href="/programs/{program.id}"
					class="block truncate font-semibold hover:text-primary"
				>
					{program.name}
				</a>
				<p class="mt-0.5 text-xs text-faint tnum">
					{program.weekCount}
					{program.weekCount === 1 ? 'week' : 'weeks'} · {program.daysPerWeek}/week ·
					{program.exerciseCount}
					{program.exerciseCount === 1 ? 'exercise' : 'exercises'}
				</p>
				{#if program.notes}
					<p class="mt-1 text-sm text-muted">{program.notes}</p>
				{/if}
			</div>

			{#if !program.isArchived && program.exerciseCount > 0}
				<a href="/programs/{program.id}/start" class="ow-btn-primary shrink-0">
					{live ? 'View run' : 'Start'}
				</a>
			{/if}
		</div>

		{#if live}
			<div class="mt-3 flex items-center gap-2">
				<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
					<div
						class="h-full rounded-full bg-primary"
						style:width="{live.totalDays === 0
							? 0
							: Math.round((live.doneDays / live.totalDays) * 100)}%"
					></div>
				</div>
				<span class="shrink-0 text-xs text-faint tnum">
					{live.doneDays}/{live.totalDays}
				</span>
			</div>
		{:else if runs.length > 0}
			<p class="mt-2 text-xs text-faint">
				Last run finished {formatDateMedium(runs[runs.length - 1].completedOn!)}.
			</p>
		{/if}

		<div class="mt-3 flex flex-wrap gap-2">
			<a href="/programs/{program.id}" class="ow-btn-secondary h-9 min-h-9 px-3 text-xs">
				<Icon name="pencil" size={14} />
				Edit
			</a>

			<form method="POST" action="?/duplicate" use:enhance>
				<input type="hidden" name="programId" value={program.id} />
				<button type="submit" class="ow-btn-ghost h-9 min-h-9 px-3 text-xs">
					<Icon name="copy" size={14} />
					Duplicate
				</button>
			</form>

			<form method="POST" action="?/toggleArchived" use:enhance>
				<input type="hidden" name="programId" value={program.id} />
				<input type="hidden" name="isArchived" value={String(!program.isArchived)} />
				<button type="submit" class="ow-btn-ghost h-9 min-h-9 px-3 text-xs">
					{program.isArchived ? 'Restore' : 'Archive'}
				</button>
			</form>

			{#if confirmingDelete === program.id}
				<form method="POST" action="?/delete" use:enhance class="flex items-center gap-2">
					<input type="hidden" name="programId" value={program.id} />
					<span class="text-xs text-muted">
						Delete it? Workouts you logged from it stay exactly as they are.
					</span>
					<button type="submit" class="ow-btn-danger h-9 min-h-9 px-3 text-xs">Delete</button>
					<button
						type="button"
						class="ow-btn-ghost h-9 min-h-9 px-3 text-xs"
						onclick={() => (confirmingDelete = null)}
					>
						Cancel
					</button>
				</form>
			{:else}
				<button
					type="button"
					class="ow-btn-ghost h-9 min-h-9 px-3 text-xs text-faint hover:text-danger"
					onclick={() => (confirmingDelete = program.id)}
				>
					<Icon name="trash" size={14} />
					Delete
				</button>
			{/if}
		</div>
	</div>
{/snippet}

{#if active.length > 0}
	<div class="space-y-3">
		{#each active as program (program.id)}
			{@render programCard(program)}
		{/each}
	</div>
{/if}

{#if archived.length > 0}
	<h2 class="mt-6 mb-3 text-sm font-semibold text-muted">Archived</h2>
	<div class="space-y-3 opacity-70">
		{#each archived as program (program.id)}
			{@render programCard(program)}
		{/each}
	</div>
{/if}

{#if data.programs.length === 0}
	<div class="ow-card p-8 text-center">
		<p class="text-sm text-muted">No programs yet.</p>
		<p class="mx-auto mt-2 max-w-md text-sm text-faint">
			A program is a grid of weeks and days you fill in once. Each session prescribes sets, reps
			and either an RPE or a percentage of your max — and following it never stops you logging
			whatever you actually did.
		</p>
		<button type="button" class="ow-btn-primary mt-4" onclick={() => (showCreate = true)}>
			<Icon name="plus" size={16} />
			New program
		</button>
	</div>
{/if}
