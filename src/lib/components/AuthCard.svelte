<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		subtitle?: string;
		children: Snippet;
		footer?: Snippet;
	};

	let { title, subtitle, children, footer }: Props = $props();
</script>

<div class="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-10">
	<div class="w-full max-w-sm">
		<div class="mb-8 flex items-center justify-center gap-3">
			<svg viewBox="0 0 32 32" class="h-9 w-9" aria-hidden="true">
				<rect width="32" height="32" rx="7" class="fill-primary" />
				<g class="fill-on-primary">
					<rect x="4" y="13" width="3" height="6" rx="1.2" />
					<rect x="8" y="10.5" width="4" height="11" rx="1.6" />
					<rect x="20" y="10.5" width="4" height="11" rx="1.6" />
					<rect x="25" y="13" width="3" height="6" rx="1.2" />
					<rect x="11" y="14.5" width="10" height="3" rx="1.2" />
				</g>
			</svg>
			<span class="text-xl font-bold tracking-tight">OpenWeights</span>
		</div>

		<div class="ow-card p-6">
			<h1 class="text-lg font-semibold">{title}</h1>
			{#if subtitle}
				<p class="mt-1 text-sm text-muted">{subtitle}</p>
			{/if}
			<div class="mt-6">
				{@render children()}
			</div>
		</div>

		{#if footer}
			<div class="mt-4 text-center text-sm text-muted">
				{@render footer()}
			</div>
		{/if}
	</div>
</div>
