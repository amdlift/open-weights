/**
 * A minimal in-process throttle for credential endpoints.
 *
 * Deliberately not durable: a self-hosted instance is a single process, and a
 * restart clearing the counters is an acceptable trade for having no extra
 * dependency. It exists to make online password guessing slow, not to be a
 * complete abuse defence — that belongs at the reverse proxy.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Stops a long-running instance accumulating a bucket per attempted username. */
function sweep(now: number): void {
	if (buckets.size < 512) return;
	for (const [key, bucket] of buckets) {
		if (bucket.resetAt <= now) buckets.delete(key);
	}
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export function checkRateLimit(
	key: string,
	limit: number,
	windowMs: number
): RateLimitResult {
	const now = Date.now();
	sweep(now);

	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		return { allowed: true, retryAfterSeconds: 0 };
	}
	if (bucket.count < limit) {
		return { allowed: true, retryAfterSeconds: 0 };
	}
	return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
}

/** Record a failed attempt. Successful attempts should call `clearRateLimit`. */
export function recordFailure(key: string, windowMs: number): void {
	const now = Date.now();
	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return;
	}
	bucket.count += 1;
}

export function clearRateLimit(key: string): void {
	buckets.delete(key);
}

export const LOGIN_LIMIT = 10;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
