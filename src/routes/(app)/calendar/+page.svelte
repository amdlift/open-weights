<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
	import { formatDateLong, formatMonthYear, weekdayNames } from '$lib/dates';
	import { formatDistance, formatDuration, formatWeight } from '$lib/units';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let units = $derived(data.user.unitSystem);
	let weekdays = $derived(weekdayNames(data.user.weekStartsOn));

	/** The day the user has tapped, shown in the detail panel below the grid. */
	let selected = $state<string | null>(null);
	let selectedDay = $derived(data.days.find((d) => d.date === selected) ?? null);

	function dayNumber(date: string): string {
		return String(Number(date.slice(8, 10)));
	}

	/** One short line describing the day, for the grid cell. */
	function synopsis(day: PageData['days'][number]): string {
		if (day.workouts.length === 0) return '';
		const names = day.workouts.flatMap((w) => w.exerciseNames);
		if (day.workouts.length > 1) return `${day.workouts.length} workouts`;
		return day.workouts[0].title || names.slice(0, 2).join(', ') || 'Workout';
	}
</script>

<svelte:head><title>Calendar · OpenWeights</title></svelte:head>

<div class="mb-5 flex items-center justify-between gap-3">
	<h1 class="hidden text-2xl font-bold tracking-tight md:block">
		{formatMonthYear(data.month)}
	</h1>
	<p class="text-sm font-medium md:hidden">{formatMonthYear(data.month)}</p>

	<nav class="flex items-center gap-2" aria-label="Change month">
		<a
			href="?month={data.previousMonth}"
			class="ow-btn-secondary h-10 min-h-10 w-10 px-0"
			aria-label="Previous month"
		>
			<Icon name="chevronLeft" size={16} />
		</a>
		<a href="/calendar" class="ow-btn-ghost h-10 min-h-10 px-3 text-xs">Today</a>
		<a
			href="?month={data.nextMonth}"
			class="ow-btn-secondary h-10 min-h-10 w-10 px-0"
			aria-label="Next month"
		>
			<Icon name="chevronRight" size={16} />
		</a>
	</nav>
</div>

<div class="ow-card overflow-hidden">
	<div class="grid grid-cols-7 border-b border-border-base">
		{#each weekdays as day (day)}
			<div class="py-2 text-center text-[11px] font-medium tracking-wide text-faint uppercase">
				{day}
			</div>
		{/each}
	</div>

	<div class="grid grid-cols-7">
		{#each data.days as day (day.date)}
			{@const isToday = day.date === data.today}
			{@const hasWorkout = day.workouts.length > 0}
			<button
				type="button"
				onclick={() => (selected = selected === day.date ? null : day.date)}
				aria-pressed={selected === day.date}
				aria-label="{formatDateLong(day.date)}{hasWorkout
					? `, ${day.workouts.length} workout${day.workouts.length === 1 ? '' : 's'}`
					: ', no workout'}"
				class="relative flex min-h-16 flex-col items-start gap-1 border-r border-b
					border-border-base p-1.5 text-left transition-colors last:border-r-0
					hover:bg-surface-2 md:min-h-24
					{day.inMonth ? '' : 'opacity-40'}
					{selected === day.date ? 'bg-primary-soft' : ''}"
			>
				<span
					class="flex h-6 w-6 items-center justify-center rounded-full text-xs tnum
						{isToday ? 'bg-primary font-semibold text-on-primary' : 'text-muted'}"
				>
					{dayNumber(day.date)}
				</span>

				{#if hasWorkout}
					<!-- The dot is the at-a-glance channel on a phone, where the text
					     below it is too small to scan; the label carries it for
					     screen readers either way. -->
					<span
						class="h-1.5 w-1.5 rounded-full bg-primary md:hidden"
						aria-hidden="true"
					></span>
					<span class="hidden w-full truncate text-[11px] leading-tight text-muted md:block">
						{synopsis(day)}
					</span>
					{#if day.workouts[0].totalVolumeKg > 0}
						<span class="hidden text-[10px] text-faint tnum md:block">
							{formatWeight(day.workouts[0].totalVolumeKg, units)}
						</span>
					{:else if day.workouts[0].totalDistanceM > 0}
						<span class="hidden text-[10px] text-faint tnum md:block">
							{formatDistance(day.workouts[0].totalDistanceM, units)}
						</span>
					{/if}
				{/if}

				{#if day.weightKg != null}
					<span class="mt-auto text-[10px] text-faint tnum">
						{formatWeight(day.weightKg, units)}
					</span>
				{/if}
			</button>
		{/each}
	</div>
</div>

<!-- Selected day -->
{#if selectedDay}
	<section class="ow-card mt-4 p-4">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h2 class="font-semibold">{formatDateLong(selectedDay.date)}</h2>
			<a
				href="/workouts/new?date={selectedDay.date}"
				class="ow-btn-secondary h-9 min-h-9 px-3 text-xs"
			>
				<Icon name="plus" size={14} />
				Log for this day
			</a>
		</div>

		{#if selectedDay.workouts.length === 0}
			<p class="mt-2 text-sm text-muted">Nothing logged.</p>
		{:else}
			<ul class="mt-3 divide-y divide-border-base">
				{#each selectedDay.workouts as workout (workout.id)}
					<li>
						<a
							href="/workouts/{workout.id}"
							class="flex items-center justify-between gap-3 py-2.5 hover:text-primary"
						>
							<span class="min-w-0">
								<span class="block truncate text-sm font-medium">
									{workout.title || 'Workout'}
								</span>
								<span class="block truncate text-xs text-faint">
									{#if workout.program}
										<span class="text-primary">
											W{workout.program.weekNumber} · D{workout.program.dayNumber}
										</span>
										·
									{/if}
									{workout.exerciseNames.join(' · ') || 'No exercises'}
								</span>
							</span>
							<span class="shrink-0 text-xs text-faint tnum">
								{workout.setCount} sets
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}

		{#if selectedDay.weightKg != null}
			<p class="mt-3 text-xs text-faint">
				Bodyweight: {formatWeight(selectedDay.weightKg, units)}
			</p>
		{/if}
	</section>
{/if}

<!-- Linear list: a month grid alone is not readable on a small screen. -->
<section class="mt-5">
	<h2 class="mb-2 text-sm font-semibold">
		{formatMonthYear(data.month)} · {data.monthWorkouts.length}
		{data.monthWorkouts.length === 1 ? 'workout' : 'workouts'}
	</h2>

	{#if data.monthWorkouts.length === 0}
		<div class="ow-card p-8 text-center">
			<p class="font-medium">Nothing logged this month</p>
			<a href="/workouts/new" class="ow-btn-primary mt-3">
				<Icon name="plus" size={16} />
				Log a workout
			</a>
		</div>
	{:else}
		<div class="ow-card divide-y divide-border-base">
			{#each data.monthWorkouts as workout (workout.id)}
				<a
					href="/workouts/{workout.id}"
					class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2"
				>
					<div class="min-w-0">
						<p class="truncate font-medium">{workout.title || 'Workout'}</p>
						<p class="truncate text-xs text-faint">
							{workout.exerciseNames.join(' · ') || 'No exercises'}
						</p>
					</div>
					<div class="shrink-0 text-right text-xs text-faint tnum">
						<p>{formatDateLong(workout.performedOn).split(',')[1]?.trim()}</p>
						{#if workout.totalVolumeKg > 0}
							<p>{formatWeight(workout.totalVolumeKg, units)}</p>
						{:else if workout.totalDurationS > 0}
							<p>{formatDuration(workout.totalDurationS)}</p>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	{/if}
</section>
