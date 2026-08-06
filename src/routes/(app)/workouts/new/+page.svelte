<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { formatRelativeDay } from '$lib/dates';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Seeded from the URL (or today) once; from then on it is the user's pick.
	let performedOn = $state(untrack(() => data.performedOn));
	let submitting = $state(false);
</script>

<svelte:head><title>Log a workout · OpenWeights</title></svelte:head>

<PageHeader
	title="Log a workout"
	description="Start from scratch, or pick up one of your routines."
/>

{#if form?.error}
	<p
		class="mb-4 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger"
		role="alert"
	>
		{form.error}
	</p>
{/if}

<div class="max-w-xl space-y-4">
	<div class="ow-card p-4">
		<label class="ow-label" for="performedOn">Date</label>
		<input
			id="performedOn"
			type="date"
			class="ow-input"
			bind:value={performedOn}
			form="start-empty"
			name="performedOn"
			required
		/>
		<p class="mt-1.5 text-xs text-faint">
			{formatRelativeDay(performedOn, data.today)} — the day this workout is filed under.
		</p>
	</div>

	<form
		id="start-empty"
		method="POST"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		}}
		class="ow-card p-4"
	>
		<h2 class="text-sm font-semibold">Empty workout</h2>
		<p class="mt-1 text-sm text-muted">Add exercises as you go.</p>
		<div class="mt-3">
			<label class="ow-label" for="title">Title</label>
			<input id="title" name="title" class="ow-input" placeholder="Optional — e.g. Leg day" />
		</div>
		<button type="submit" class="ow-btn-primary mt-4 w-full" disabled={submitting}>
			<Icon name="plus" size={16} />
			{submitting ? 'Starting…' : 'Start empty workout'}
		</button>
	</form>

	{#if data.routines.length > 0}
		<div class="ow-card p-4">
			<h2 class="text-sm font-semibold">From a routine</h2>
			<p class="mt-1 text-sm text-muted">
				Loads the exercises and target sets so you only fill in what you actually did.
			</p>
			<ul class="mt-3 divide-y divide-border-base">
				{#each data.routines as routine (routine.id)}
					<li>
						<form method="POST" use:enhance>
							<input type="hidden" name="performedOn" value={performedOn} />
							<input type="hidden" name="routineId" value={routine.id} />
							<button
								type="submit"
								class="flex w-full items-center justify-between gap-3 py-3 text-left
									hover:bg-surface-2"
							>
								<span class="min-w-0">
									<span class="block truncate text-sm font-medium">{routine.name}</span>
									<span class="block text-xs text-faint">
										{routine.exerciseCount}
										{routine.exerciseCount === 1 ? 'exercise' : 'exercises'}
									</span>
								</span>
								<Icon name="chevronRight" size={16} />
							</button>
						</form>
					</li>
				{/each}
			</ul>
		</div>
	{:else}
		<div class="ow-card p-4">
			<h2 class="text-sm font-semibold">No routines yet</h2>
			<p class="mt-1 text-sm text-muted">
				Save a workout you repeat as a routine and it will show up here.
			</p>
			<a href="/routines" class="ow-btn-secondary mt-3">Create a routine</a>
		</div>
	{/if}
</div>
