<script lang="ts">
	import '../app.css';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	let theme = $derived(data.user?.theme ?? 'system');

	/*
	 * Owns the theme class on <html>.
	 *
	 * That element sits outside the component tree, so keeping it in step with
	 * the saved preference is exactly what an effect is for. Without this the
	 * class is only ever written by the server stamp in hooks.server.ts, which
	 * is why changing the theme used to need a page refresh to show up.
	 *
	 * The server stamp and the inline resolver in app.html both stay: effects do
	 * not run during SSR, and they are what make the *first* paint correct.
	 */
	$effect(() => {
		const root = document.documentElement;
		const media = window.matchMedia('(prefers-color-scheme: dark)');

		const apply = () => {
			const resolved = theme === 'light' || theme === 'dark' ? theme : media.matches ? 'dark' : 'light';
			// Never `className =` — that would clobber anything else on <html>.
			root.classList.remove('light', 'dark');
			root.classList.add(resolved);
		};

		apply();

		// So "Match system" follows the OS live, not just at load.
		media.addEventListener('change', apply);
		return () => media.removeEventListener('change', apply);
	});
</script>

{@render children()}
