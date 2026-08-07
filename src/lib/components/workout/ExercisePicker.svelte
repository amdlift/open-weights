<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import {
		EQUIPMENT_LABELS,
		MUSCLE_GROUP_LABELS,
		type EquipmentType,
		type ExerciseKind,
		type MuscleGroup
	} from '$lib/constants';

	type Option = {
		id: number;
		name: string;
		kind: ExerciseKind;
		primaryMuscle: MuscleGroup | null;
		equipment: EquipmentType | null;
		useCount: number;
	};

	type Props = {
		options: Option[];
		/** Exercises already in this workout, shown but marked. */
		alreadyAdded?: number[];
		/**
		 * Extra hidden fields to post with the pick — a program day needs to say
		 * which cell it is. The action name stays hard-coded, because that is what
		 * makes this component drop into any page that names its action the same.
		 */
		extra?: Record<string, string>;
		onclose?: () => void;
	};

	let { options, alreadyAdded = [], extra = {}, onclose }: Props = $props();

	let query = $state('');
	let input = $state<HTMLInputElement | null>(null);

	// The full library ships with the page, so filtering is local and instant —
	// no round trip while standing at a rack.
	let results = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const matched = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;

		return [...matched]
			.sort((a, b) => {
				// Familiar movements first; the library is long and mostly irrelevant
				// to any one lifter.
				if (a.useCount !== b.useCount) return b.useCount - a.useCount;
				return a.name.localeCompare(b.name);
			})
			.slice(0, 60);
	});

	$effect(() => {
		input?.focus();
	});
</script>

<div class="ow-card p-3">
	<div class="flex items-center gap-2">
		<div class="relative flex-1">
			<span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint">
				<Icon name="search" size={16} />
			</span>
			<input
				bind:this={input}
				bind:value={query}
				class="ow-input pl-9"
				placeholder="Search exercises…"
				aria-label="Search exercises"
			/>
		</div>
		{#if onclose}
			<button type="button" class="ow-btn-ghost h-10 min-h-10 px-3" onclick={onclose}>
				Cancel
			</button>
		{/if}
	</div>

	<div class="mt-2 max-h-80 overflow-y-auto">
		{#if results.length === 0}
			<p class="px-2 py-6 text-center text-sm text-muted">
				Nothing matches “{query}”.
				<a href="/exercises" class="text-primary underline">Add it to your library</a>
				first.
			</p>
		{:else}
			<ul class="divide-y divide-border-base">
				{#each results as option (option.id)}
					<li>
						<form method="POST" action="?/addExercise" use:enhance>
							<input type="hidden" name="exerciseId" value={option.id} />
							{#each Object.entries(extra) as [name, value] (name)}
								<input type="hidden" {name} {value} />
							{/each}
							<button
								type="submit"
								class="flex w-full items-center justify-between gap-3 px-2 py-2.5 text-left
									hover:bg-surface-2"
							>
								<span class="min-w-0">
									<span class="block truncate text-sm font-medium">{option.name}</span>
									<span class="block text-xs text-faint">
										{#if option.primaryMuscle}{MUSCLE_GROUP_LABELS[option.primaryMuscle]}{/if}
										{#if option.equipment}
											· {EQUIPMENT_LABELS[option.equipment]}
										{/if}
									</span>
								</span>
								{#if alreadyAdded.includes(option.id)}
									<span class="shrink-0 text-xs text-faint">already added</span>
								{:else}
									<Icon name="plus" size={16} />
								{/if}
							</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
