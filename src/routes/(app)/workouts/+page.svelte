<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { formatRelativeDay } from '$lib/dates';
	import { formatDistance, formatDuration, formatWeight } from '$lib/units';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let units = $derived(data.user.unitSystem);
</script>

<svelte:head><title>Workouts · OpenWeights</title></svelte:head>

<PageHeader
	title="Workouts"
	description={data.total === 0
		? 'Nothing logged yet.'
		: `${data.total} ${data.total === 1 ? 'workout' : 'workouts'} logged.`}
>
	{#snippet actions()}
		<a href="/workouts/new" class="ow-btn-primary">
			<Icon name="plus" size={16} />
			Log a workout
		</a>
	{/snippet}
</PageHeader>

{#if data.workouts.length === 0}
	<div class="ow-card p-10 text-center">
		<p class="font-medium">No workouts on this page</p>
		<p class="mt-1 text-sm text-muted">
			{data.total === 0
				? 'Your first session is one tap away.'
				: 'Try an earlier page.'}
		</p>
		<a href="/workouts/new" class="ow-btn-primary mt-4">
			<Icon name="plus" size={16} />
			Log a workout
		</a>
	</div>
{:else}
	<div class="ow-card divide-y divide-border-base">
		{#each data.workouts as workout (workout.id)}
			<a
				href="/workouts/{workout.id}"
				class="block px-4 py-3.5 transition-colors hover:bg-surface-2"
			>
				<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
					<span class="font-medium">
						{workout.title || formatRelativeDay(workout.performedOn, data.today)}
					</span>
					<span class="text-xs text-faint">
						{#if workout.title}
							{formatRelativeDay(workout.performedOn, data.today)}
						{/if}
					</span>
				</div>

				{#if workout.exerciseNames.length > 0}
					<p class="mt-1 truncate text-sm text-muted">
						{workout.exerciseNames.join(' · ')}
					</p>
				{:else}
					<p class="mt-1 text-sm text-faint">No exercises logged</p>
				{/if}

				<div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-faint tnum">
					<span>{workout.setCount} {workout.setCount === 1 ? 'set' : 'sets'}</span>
					{#if workout.totalVolumeKg > 0}
						<span>{formatWeight(workout.totalVolumeKg, units)} volume</span>
					{/if}
					{#if workout.totalDistanceM > 0}
						<span>{formatDistance(workout.totalDistanceM, units)}</span>
					{/if}
					{#if workout.totalDurationS > 0}
						<span>{formatDuration(workout.totalDurationS)}</span>
					{/if}
				</div>
			</a>
		{/each}
	</div>

	{#if data.pageCount > 1}
		<nav class="mt-4 flex items-center justify-between" aria-label="Workout pages">
			<a
				href="?page={data.page - 1}"
				class="ow-btn-secondary {data.page <= 1 ? 'pointer-events-none opacity-40' : ''}"
				aria-disabled={data.page <= 1}
			>
				<Icon name="chevronLeft" size={16} />
				Newer
			</a>
			<span class="text-sm text-muted">Page {data.page} of {data.pageCount}</span>
			<a
				href="?page={data.page + 1}"
				class="ow-btn-secondary {data.page >= data.pageCount
					? 'pointer-events-none opacity-40'
					: ''}"
				aria-disabled={data.page >= data.pageCount}
			>
				Older
				<Icon name="chevronRight" size={16} />
			</a>
		</nav>
	{/if}
{/if}
