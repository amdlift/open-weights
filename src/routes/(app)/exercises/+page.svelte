<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import {
		EQUIPMENT_LABELS,
		EQUIPMENT_TYPES,
		EXERCISE_KINDS,
		EXERCISE_KIND_HINTS,
		EXERCISE_KIND_LABELS,
		MUSCLE_GROUPS,
		MUSCLE_GROUP_LABELS
	} from '$lib/constants';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreate = $state(false);
	let newKind = $state<(typeof EXERCISE_KINDS)[number]>('weight_reps');

	// Built-ins and custom entries are shown apart: one list is the shared
	// library, the other is the user's own, and they are managed differently.
	let custom = $derived(data.exercises.filter((e) => e.isCustom));
	let builtin = $derived(data.exercises.filter((e) => !e.isCustom));

	let activeFilterCount = $derived(
		[
			data.filters.muscle !== 'all',
			data.filters.equipment !== 'all',
			data.filters.kind !== 'all',
			data.filters.customOnly,
			data.filters.showHidden
		].filter(Boolean).length
	);
</script>

<svelte:head><title>Exercises · OpenWeights</title></svelte:head>

<PageHeader
	title="Exercises"
	description="{data.exercises.length} available — the built-in library plus anything you add."
>
	{#snippet actions()}
		<button type="button" class="ow-btn-primary" onclick={() => (showCreate = !showCreate)}>
			<Icon name="plus" size={16} />
			New exercise
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

{#if form && 'created' in form && form.created}
	<p class="mb-4 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
		Added <strong>{form.created.name}</strong> to your library.
	</p>
{/if}

{#if showCreate}
	<div class="ow-card mb-5 p-4">
		<h2 class="text-sm font-semibold">New exercise</h2>
		<form method="POST" action="?/create" use:enhance class="mt-4 space-y-4">
			<div class="grid gap-3 sm:grid-cols-2">
				<div>
					<label class="ow-label" for="name">Name</label>
					<input
						id="name"
						name="name"
						class="ow-input"
						maxlength="80"
						required
						placeholder="e.g. Meadows Row"
						value={form && 'name' in form ? (form.name ?? '') : ''}
					/>
				</div>
				<div>
					<label class="ow-label" for="kind">Tracks</label>
					<select id="kind" name="kind" class="ow-input" bind:value={newKind}>
						{#each EXERCISE_KINDS as kind (kind)}
							<option value={kind}>{EXERCISE_KIND_LABELS[kind]}</option>
						{/each}
					</select>
					<p class="mt-1 text-xs text-faint">{EXERCISE_KIND_HINTS[newKind]}</p>
				</div>
				<div>
					<label class="ow-label" for="primaryMuscle">Primary muscle</label>
					<select id="primaryMuscle" name="primaryMuscle" class="ow-input">
						<option value="">Not set</option>
						{#each MUSCLE_GROUPS as muscle (muscle)}
							<option value={muscle}>{MUSCLE_GROUP_LABELS[muscle]}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class="ow-label" for="equipment">Equipment</label>
					<select id="equipment" name="equipment" class="ow-input">
						<option value="">Not set</option>
						{#each EQUIPMENT_TYPES as equipment (equipment)}
							<option value={equipment}>{EQUIPMENT_LABELS[equipment]}</option>
						{/each}
					</select>
				</div>
			</div>
			<div>
				<label class="ow-label" for="notes">Notes</label>
				<input
					id="notes"
					name="notes"
					class="ow-input"
					placeholder="Optional — setup cues, machine number, anything"
				/>
			</div>
			<div class="flex gap-2">
				<button type="submit" class="ow-btn-primary">Add exercise</button>
				<button type="button" class="ow-btn-secondary" onclick={() => (showCreate = false)}>
					Cancel
				</button>
			</div>
		</form>
	</div>
{/if}

<!-- Filters submit as a plain GET so the current view is a shareable URL. -->
<form method="GET" class="ow-card mb-5 p-3">
	<div class="flex flex-wrap items-end gap-2">
		<div class="min-w-40 flex-1">
			<label class="sr-only" for="q">Search exercises</label>
			<div class="relative">
				<span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint">
					<Icon name="search" size={16} />
				</span>
				<input
					id="q"
					name="q"
					class="ow-input pl-9"
					placeholder="Search…"
					value={data.filters.search}
				/>
			</div>
		</div>

		<div>
			<label class="sr-only" for="muscle">Muscle group</label>
			<select id="muscle" name="muscle" class="ow-input w-auto">
				<option value="all">All muscles</option>
				{#each MUSCLE_GROUPS as muscle (muscle)}
					<option value={muscle} selected={data.filters.muscle === muscle}>
						{MUSCLE_GROUP_LABELS[muscle]}
					</option>
				{/each}
			</select>
		</div>

		<div>
			<label class="sr-only" for="equipment">Equipment</label>
			<select id="equipment" name="equipment" class="ow-input w-auto">
				<option value="all">All equipment</option>
				{#each EQUIPMENT_TYPES as equipment (equipment)}
					<option value={equipment} selected={data.filters.equipment === equipment}>
						{EQUIPMENT_LABELS[equipment]}
					</option>
				{/each}
			</select>
		</div>

		<label class="flex min-h-11 items-center gap-2 px-1 text-sm text-muted">
			<input
				type="checkbox"
				name="mine"
				value="1"
				checked={data.filters.customOnly}
				class="h-4 w-4 accent-[var(--ow-primary)]"
			/>
			Mine only
		</label>

		<label class="flex min-h-11 items-center gap-2 px-1 text-sm text-muted">
			<input
				type="checkbox"
				name="hidden"
				value="1"
				checked={data.filters.showHidden}
				class="h-4 w-4 accent-[var(--ow-primary)]"
			/>
			Show hidden
		</label>

		<button type="submit" class="ow-btn-secondary">Apply</button>
		{#if activeFilterCount > 0 || data.filters.search}
			<a href="/exercises" class="ow-btn-ghost">Clear</a>
		{/if}
	</div>
</form>

{#snippet exerciseRow(item: PageData['exercises'][number])}
	<div class="flex items-center gap-3 px-4 py-3">
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-2">
				<a href="/exercises/{item.id}" class="font-medium hover:text-primary">{item.name}</a>
				{#if item.isHidden}
					<span class="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-faint">
						Hidden
					</span>
				{/if}
			</div>
			<p class="mt-0.5 text-xs text-faint">
				{#if item.primaryMuscle}{MUSCLE_GROUP_LABELS[item.primaryMuscle]} · {/if}
				{#if item.equipment}{EQUIPMENT_LABELS[item.equipment]} · {/if}
				{EXERCISE_KIND_LABELS[item.kind]}
				{#if item.useCount > 0}
					· logged {item.useCount}×
				{/if}
			</p>
		</div>

		<form method="POST" action="?/toggleHidden" use:enhance>
			<input type="hidden" name="exerciseId" value={item.id} />
			<input type="hidden" name="hidden" value={String(!item.isHidden)} />
			<button
				type="submit"
				class="ow-btn-ghost h-9 min-h-9 px-2.5 text-xs"
				title={item.isHidden ? 'Show in pickers again' : 'Hide from pickers'}
			>
				{item.isHidden ? 'Unhide' : 'Hide'}
			</button>
		</form>
	</div>
{/snippet}

{#if data.exercises.length === 0}
	<div class="ow-card p-10 text-center">
		<p class="font-medium">Nothing matches those filters</p>
		<p class="mt-1 text-sm text-muted">Try clearing the search, or add your own exercise.</p>
	</div>
{:else}
	<div class="space-y-5">
		{#if custom.length > 0}
			<section>
				<h2 class="mb-2 text-xs font-semibold tracking-wide text-faint uppercase">
					Your exercises ({custom.length})
				</h2>
				<div class="ow-card divide-y divide-border-base">
					{#each custom as item (item.id)}
						{@render exerciseRow(item)}
					{/each}
				</div>
			</section>
		{/if}

		{#if builtin.length > 0}
			<section>
				<h2 class="mb-2 text-xs font-semibold tracking-wide text-faint uppercase">
					Built-in library ({builtin.length})
				</h2>
				<div class="ow-card divide-y divide-border-base">
					{#each builtin as item (item.id)}
						{@render exerciseRow(item)}
					{/each}
				</div>
			</section>
		{/if}
	</div>
{/if}
