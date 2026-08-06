import type { IconName } from '$lib/components/Icon.svelte';

export type NavItem = {
	href: string;
	label: string;
	icon: IconName;
	/** Shown in the mobile tab bar rather than behind the "More" sheet. */
	primary?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
	{ href: '/', label: 'Dashboard', icon: 'home', primary: true },
	{ href: '/calendar', label: 'Calendar', icon: 'calendar', primary: true },
	{ href: '/workouts', label: 'Workouts', icon: 'list' },
	{ href: '/exercises', label: 'Exercises', icon: 'dumbbell', primary: true },
	{ href: '/routines', label: 'Routines', icon: 'copy' },
	{ href: '/measurements', label: 'Measurements', icon: 'ruler' },
	{ href: '/records', label: 'Records', icon: 'trophy' },
	{ href: '/settings', label: 'Settings', icon: 'settings' }
];

/**
 * `/` only matches exactly — every other route would otherwise light up the
 * dashboard tab as well as its own.
 */
export function isActive(pathname: string, href: string): boolean {
	return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}
