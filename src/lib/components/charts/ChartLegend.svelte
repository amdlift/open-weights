<script lang="ts">
	type Entry = { label: string; color: string };

	/**
	 * Always shown for two or more series. Identity must never rest on colour
	 * alone, and the swatch — not the text colour — is what carries it.
	 */
	let { entries }: { entries: Entry[] } = $props();
</script>

{#if entries.length > 1}
	<ul class="flex flex-wrap items-center gap-x-4 gap-y-1.5">
		{#each entries as entry (entry.label)}
			<li class="flex items-center gap-1.5 text-xs text-muted">
				<span
					class="h-2.5 w-2.5 shrink-0 rounded-[2px]"
					style:background-color={entry.color}
					aria-hidden="true"
				></span>
				{entry.label}
			</li>
		{/each}
	</ul>
{/if}
