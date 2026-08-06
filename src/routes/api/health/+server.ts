import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

/**
 * Liveness probe used by the container HEALTHCHECK. Touches the database so a
 * failed migration or an unwritable volume surfaces as an unhealthy container
 * rather than a server that answers requests but cannot store anything.
 */
export const GET: RequestHandler = () => {
	try {
		getDb().get(sql`select 1`);
		return json({ status: 'ok' });
	} catch (err) {
		return json(
			{ status: 'error', error: err instanceof Error ? err.message : String(err) },
			{ status: 503 }
		);
	}
};
