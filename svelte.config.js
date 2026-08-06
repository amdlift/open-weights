import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ out: 'build' }),
		csrf: {
			/*
			 * Kit's own check is switched off because it compares against a
			 * build/env-time origin, which forces every self-hoster to configure
			 * ORIGIN before any form works. It is replaced — not removed — by the
			 * runtime check in src/lib/server/csrf.ts, which compares the Origin
			 * header against the Host the browser actually connected to.
			 *
			 * Do not remove that hook without restoring this setting.
			 */
			trustedOrigins: ['*']
		}
	}
};

export default config;
