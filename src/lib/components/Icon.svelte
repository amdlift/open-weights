<script lang="ts" module>
	/**
	 * A small inline icon set, so the image ships with no icon-font or network
	 * request. Each entry is the inner markup of a 24×24 stroked icon.
	 */
	const ICONS = {
		home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1V9.5"/>',
		calendar:
			'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
		dumbbell:
			'<path d="M2 12h2M20 12h2M6.5 8v8M17.5 8v8M4.5 9.5v5M19.5 9.5v5M6.5 12h11"/>',
		list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
		plus: '<path d="M12 5v14M5 12h14"/>',
		ellipsis: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
		trending: '<path d="m3 16 5.5-5.5 3.5 3.5L21 5"/><path d="M15 5h6v6"/>',
		ruler: '<path d="M3.5 13.5 13.5 3.5a1.4 1.4 0 0 1 2 0l5 5a1.4 1.4 0 0 1 0 2l-10 10a1.4 1.4 0 0 1-2 0l-5-5a1.4 1.4 0 0 1 0-2Z"/><path d="m8 9 2 2M11 6l2 2M5 12l2 2M14.5 3.5l2 2"/>',
		trophy:
			'<path d="M7 4h10v6a5 5 0 0 1-10 0Z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/><path d="M12 15v3M9 21h6M10 18h4"/>',
		settings:
			'<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/>',
		logout: '<path d="M10 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/><path d="m16 16 4-4-4-4M20 12H9"/>',
		search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
		trash: '<path d="M4 7h16M10 4h4M9 7v12M15 7v12M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
		pencil:
			'<path d="M15.5 4.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/><path d="m14 6 4 4"/>',
		chevronLeft: '<path d="m15 5-7 7 7 7"/>',
		chevronRight: '<path d="m9 5 7 7-7 7"/>',
		chevronDown: '<path d="m5 9 7 7 7-7"/>',
		x: '<path d="M6 6l12 12M18 6 6 18"/>',
		check: '<path d="m4.5 12.5 5 5 10-11"/>',
		clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/>',
		user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
		users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.5 3.5 0 0 1 0 5.6M17.5 14.6A6.5 6.5 0 0 1 21.5 20"/>',
		copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
		download: '<path d="M12 3v12M7.5 10.5 12 15l4.5-4.5"/><path d="M4 20h16"/>',
		flame: '<path d="M12 3s5 4.5 5 9a5 5 0 0 1-10 0c0-1.6.7-3 1.5-4 .3 1.2 1 2 1.8 2C11.5 10 10.5 6.5 12 3Z"/>',
		heart: '<path d="M12 20s-7-4.5-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7 2.5C19 15.5 12 20 12 20Z"/>',
		arrowUp: '<path d="M12 20V5M6 11l6-6 6 6"/>',
		arrowDown: '<path d="M12 4v15M6 13l6 6 6-6"/>',
		grip: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
		menu: '<path d="M4 7h16M4 12h16M4 17h16"/>'
	} as const;

	export type IconName = keyof typeof ICONS;
</script>

<script lang="ts">
	type Props = {
		name: IconName;
		/** Rendered size in pixels; the viewBox is always 24×24. */
		size?: number;
		class?: string;
		strokeWidth?: number;
	};

	let { name, size = 20, class: className = '', strokeWidth = 1.75 }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 24 24"
	width={size}
	height={size}
	fill="none"
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	aria-hidden="true"
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- constant, developer-authored markup -->
	{@html ICONS[name]}
</svg>
