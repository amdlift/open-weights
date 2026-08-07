<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import type { UpNext } from '$lib/server/programs';

	type Props = {
		upNext: UpNext;
		/** Where "log something else" should go. Omitted on pages that already offer it. */
		freeformHref?: string;
	};

	let { upNext, freeformHref }: Props = $props();

	let percent = $derived(
		upNext.totalDays === 0 ? 0 : Math.round((upNext.doneDays / upNext.totalDays) * 100)
	);
</script>

<section class="ow-card border-primary/40 p-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0">
			<p class="text-[11px] font-semibold tracking-wide text-primary uppercase">
				{upNext.resumeWorkoutId ? 'In progress' : 'Up next'}
			</p>
			<a
				href="/programs/{upNext.programId}"
				class="mt-0.5 block truncate font-semibold hover:text-primary"
			>
				{upNext.programName}
			</a>
			<p class="mt-0.5 text-sm text-muted">
				Week {upNext.weekNumber} · {upNext.title || `Day ${upNext.dayNumber}`}
			</p>
			{#if upNext.exerciseNames.length > 0}
				<p class="mt-1 truncate text-xs text-faint">{upNext.exerciseNames.join(' · ')}</p>
			{/if}
		</div>

		{#if upNext.resumeWorkoutId}
			<a href="/workouts/{upNext.resumeWorkoutId}" class="ow-btn-primary shrink-0">
				<Icon name="chevronRight" size={16} />
				Resume
			</a>
		{:else}
			<form
				method="POST"
				action="/programs/{upNext.programId}?/startDay"
				use:enhance
				class="shrink-0"
			>
				<input type="hidden" name="programDayId" value={upNext.programDayId} />
				<input type="hidden" name="enrollmentId" value={upNext.enrollmentId} />
				<button type="submit" class="ow-btn-primary">
					<Icon name="plus" size={16} />
					Start
				</button>
			</form>
		{/if}
	</div>

	<div class="mt-3 flex items-center gap-2">
		<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
			<div class="h-full rounded-full bg-primary" style:width="{percent}%"></div>
		</div>
		<span class="shrink-0 text-xs text-faint tnum">{upNext.doneDays}/{upNext.totalDays}</span>
	</div>

	{#if freeformHref}
		<a href={freeformHref} class="mt-2 inline-block text-xs text-primary hover:underline">
			Log something else instead
		</a>
	{/if}
</section>
