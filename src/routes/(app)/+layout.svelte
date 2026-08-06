<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import { NAV_ITEMS, isActive } from '$lib/nav';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	let moreOpen = $state(false);

	const primaryItems = NAV_ITEMS.filter((item) => item.primary);
	const secondaryItems = NAV_ITEMS.filter((item) => !item.primary);

	let currentTitle = $derived(
		NAV_ITEMS.find((item) => isActive(page.url.pathname, item.href))?.label ?? 'OpenWeights'
	);

	// Any navigation dismisses the sheet, including the browser back button.
	$effect(() => {
		void page.url.pathname;
		moreOpen = false;
	});
</script>

<div class="min-h-dvh bg-bg">
	<!-- Desktop sidebar -->
	<aside
		class="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border-base
			bg-surface md:flex"
	>
		<a href="/" class="flex items-center gap-2.5 px-5 py-5">
			<svg viewBox="0 0 32 32" class="h-8 w-8" aria-hidden="true">
				<rect width="32" height="32" rx="7" class="fill-primary" />
				<g class="fill-on-primary">
					<rect x="4" y="13" width="3" height="6" rx="1.2" />
					<rect x="8" y="10.5" width="4" height="11" rx="1.6" />
					<rect x="20" y="10.5" width="4" height="11" rx="1.6" />
					<rect x="25" y="13" width="3" height="6" rx="1.2" />
					<rect x="11" y="14.5" width="10" height="3" rx="1.2" />
				</g>
			</svg>
			<span class="text-base font-bold tracking-tight">OpenWeights</span>
		</a>

		<nav class="flex-1 space-y-0.5 px-3 py-2">
			{#each NAV_ITEMS as item (item.href)}
				{@const active = isActive(page.url.pathname, item.href)}
				<a
					href={item.href}
					aria-current={active ? 'page' : undefined}
					class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors
						{active ? 'bg-primary-soft text-text-base' : 'text-muted hover:bg-surface-2 hover:text-text-base'}"
				>
					<Icon name={item.icon} size={18} />
					{item.label}
				</a>
			{/each}
		</nav>

		<div class="border-t border-border-base p-3">
			<div class="flex items-center gap-3 px-2 py-1.5">
				<div
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft
						text-sm font-semibold"
				>
					{data.user.displayName.charAt(0).toUpperCase()}
				</div>
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium">{data.user.displayName}</p>
					{#if data.user.isAdmin}
						<p class="text-xs text-faint">Admin</p>
					{/if}
				</div>
			</div>
			<form method="POST" action="/logout">
				<button
					type="submit"
					class="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium
						text-muted transition-colors hover:bg-surface-2 hover:text-text-base"
				>
					<Icon name="logout" size={18} />
					Sign out
				</button>
			</form>
		</div>
	</aside>

	<!-- Mobile header -->
	<header
		class="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border-base
			bg-surface/90 px-4 backdrop-blur md:hidden"
	>
		<h1 class="text-base font-semibold">{currentTitle}</h1>
		<a
			href="/workouts/new"
			class="ow-btn-primary h-9 min-h-9 px-3 text-xs"
			aria-label="Log a workout"
		>
			<Icon name="plus" size={16} />
			Log
		</a>
	</header>

	<main class="px-4 pt-4 pb-24 md:ml-60 md:px-8 md:pt-8 md:pb-12">
		{@render children()}
	</main>

	<!-- Mobile tab bar -->
	<nav
		class="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border-base
			bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
	>
		{#each primaryItems as item (item.href)}
			{@const active = isActive(page.url.pathname, item.href)}
			<a
				href={item.href}
				aria-current={active ? 'page' : undefined}
				class="flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium
					{active ? 'text-primary' : 'text-muted'}"
			>
				<Icon name={item.icon} size={22} strokeWidth={active ? 2.1 : 1.75} />
				{item.label}
			</a>
		{/each}
		<button
			type="button"
			onclick={() => (moreOpen = true)}
			aria-expanded={moreOpen}
			class="flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium
				text-muted"
		>
			<Icon name="ellipsis" size={22} />
			More
		</button>
	</nav>

	{#if moreOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 z-40 bg-black/50 md:hidden"
			onclick={() => (moreOpen = false)}
		></div>
		<div
			class="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-border-base bg-surface
				pb-[env(safe-area-inset-bottom)] md:hidden"
			role="dialog"
			aria-label="More"
		>
			<div class="mx-auto mt-2 h-1 w-10 rounded-full bg-border-strong"></div>
			<div class="p-3">
				{#each secondaryItems as item (item.href)}
					<a
						href={item.href}
						class="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-text-base
							hover:bg-surface-2"
					>
						<Icon name={item.icon} size={20} />
						{item.label}
					</a>
				{/each}
				<form method="POST" action="/logout">
					<button
						type="submit"
						class="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium
							text-danger hover:bg-danger-soft"
					>
						<Icon name="logout" size={20} />
						Sign out
					</button>
				</form>
			</div>
		</div>
	{/if}
</div>
