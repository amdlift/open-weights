<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		description?: string;
		/** Actions shown on the right of the heading. */
		actions?: Snippet;
	};

	let { title, description, actions }: Props = $props();
</script>

<div class="mb-5 flex flex-wrap items-start justify-between gap-3">
	<div class="min-w-0">
		<!-- The mobile chrome already shows the page name in the header bar. -->
		<h1 class="hidden text-2xl font-bold tracking-tight md:block">{title}</h1>
		{#if description}
			<p class="mt-1 text-sm text-muted">{description}</p>
		{/if}
	</div>
	{#if actions}
		<div class="flex shrink-0 items-center gap-2">
			{@render actions()}
		</div>
	{/if}
</div>
