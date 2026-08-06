import { afterEach, describe, expect, it } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { checkCsrf, isFormSubmission } from './csrf';

/**
 * These tests are the safety net for having replaced SvelteKit's built-in CSRF
 * check. The attack cases matter more than the happy path: the whole point of
 * the replacement is to be *more permissive about addresses* without being at
 * all more permissive about cross-site submissions.
 */

type Options = {
	method?: string;
	contentType?: string | null;
	origin?: string | null;
	host?: string | null;
	/** The origin SvelteKit computed, i.e. from ORIGIN or derived from headers. */
	urlOrigin?: string;
};

function event({
	method = 'POST',
	contentType = 'application/x-www-form-urlencoded',
	origin = null,
	host = 'gym.local:3000',
	urlOrigin = 'http://gym.local:3000'
}: Options): RequestEvent {
	const headers = new Headers();
	if (contentType) headers.set('content-type', contentType);
	if (origin) headers.set('origin', origin);
	if (host) headers.set('host', host);

	return {
		request: new Request(`${urlOrigin}/setup`, {
			method,
			headers,
			body: method === 'GET' || method === 'HEAD' ? undefined : 'a=b'
		}),
		url: new URL(`${urlOrigin}/setup`)
	} as unknown as RequestEvent;
}

afterEach(() => {
	delete process.env.TRUSTED_ORIGINS;
});

describe('isFormSubmission', () => {
	it('covers the content types a browser can post cross-origin without a preflight', () => {
		for (const type of [
			'application/x-www-form-urlencoded',
			'multipart/form-data; boundary=x',
			'text/plain'
		]) {
			expect(isFormSubmission(event({ contentType: type }).request), type).toBe(true);
		}
	});

	it('ignores JSON, which CORS already protects', () => {
		expect(isFormSubmission(event({ contentType: 'application/json' }).request)).toBe(false);
	});

	it('ignores safe methods', () => {
		expect(isFormSubmission(event({ method: 'GET', contentType: null }).request)).toBe(false);
	});

	it('covers every state-changing method', () => {
		for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
			expect(isFormSubmission(event({ method }).request), method).toBe(true);
		}
	});
});

describe('checkCsrf — the cases that must be allowed', () => {
	it('allows a plain-http LAN submission with no ORIGIN configured', () => {
		// The bug this replaced: adapter-node derives https://, the browser sends
		// http://, and every form 403s until ORIGIN is set by hand.
		const verdict = checkCsrf(
			event({
				origin: 'http://192.168.1.114:3000',
				host: '192.168.1.114:3000',
				urlOrigin: 'https://192.168.1.114:3000'
			})
		);
		expect(verdict.ok).toBe(true);
	});

	it('allows access by hostname, mDNS name and VPN name without configuration', () => {
		for (const host of ['gym.local:3000', 'nas:3000', 'openweights.tail1234.ts.net']) {
			const verdict = checkCsrf(
				event({ origin: `http://${host}`, host, urlOrigin: 'https://whatever:3000' })
			);
			expect(verdict.ok, host).toBe(true);
		}
	});

	it('allows https through a TLS-terminating proxy that preserves Host', () => {
		const verdict = checkCsrf(
			event({
				origin: 'https://gym.example.com',
				host: 'gym.example.com',
				urlOrigin: 'http://gym.example.com'
			})
		);
		expect(verdict.ok).toBe(true);
	});

	it('allows an origin matching the configured ORIGIN even when Host differs', () => {
		// A proxy that rewrites Host to an internal name.
		const verdict = checkCsrf(
			event({
				origin: 'https://gym.example.com',
				host: 'openweights-internal:3000',
				urlOrigin: 'https://gym.example.com'
			})
		);
		expect(verdict.ok).toBe(true);
	});

	it('allows an explicitly trusted origin', () => {
		process.env.TRUSTED_ORIGINS = 'https://gym.example.com, https://other.example';
		const verdict = checkCsrf(
			event({
				origin: 'https://other.example',
				host: 'internal:3000',
				urlOrigin: 'http://internal:3000'
			})
		);
		expect(verdict.ok).toBe(true);
	});

	it('lets non-form requests through untouched', () => {
		expect(checkCsrf(event({ method: 'GET', contentType: null, origin: null })).ok).toBe(true);
		expect(
			checkCsrf(event({ contentType: 'application/json', origin: 'https://evil.example' })).ok
		).toBe(true);
	});
});

describe('checkCsrf — the cases that must be refused', () => {
	it('refuses a classic cross-site form post', () => {
		// The browser sets Host to us and Origin to the attacker, so the two
		// cannot match however the app is addressed.
		const verdict = checkCsrf(
			event({
				origin: 'https://evil.example',
				host: '192.168.1.114:3000',
				urlOrigin: 'http://192.168.1.114:3000'
			})
		);
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.reason).toBe('mismatch');
	});

	it('refuses a submission with no Origin header', () => {
		const verdict = checkCsrf(event({ origin: null }));
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.reason).toBe('missing_origin');
	});

	it('refuses a look-alike host rather than matching on a prefix or suffix', () => {
		for (const origin of [
			'https://gym.local.evil.example',
			'https://evilgym.local',
			'https://gym.local:3000.evil.example'
		]) {
			const verdict = checkCsrf(event({ origin, host: 'gym.local:3000' }));
			expect(verdict.ok, origin).toBe(false);
		}
	});

	it('treats a different port as a different origin', () => {
		const verdict = checkCsrf(
			event({ origin: 'http://gym.local:9999', host: 'gym.local:3000' })
		);
		expect(verdict.ok).toBe(false);
	});

	it('refuses a malformed Origin header', () => {
		for (const origin of ['not-a-url', 'null', 'javascript:alert(1)']) {
			expect(checkCsrf(event({ origin })).ok, origin).toBe(false);
		}
	});

	it('does not let an unrelated TRUSTED_ORIGINS entry open the door', () => {
		process.env.TRUSTED_ORIGINS = 'https://gym.example.com';
		const verdict = checkCsrf(event({ origin: 'https://evil.example', host: 'gym.local:3000' }));
		expect(verdict.ok).toBe(false);
	});
});

describe('TRUSTED_ORIGINS wildcard', () => {
	it('disables the check when explicitly set to *', () => {
		process.env.TRUSTED_ORIGINS = '*';
		expect(checkCsrf(event({ origin: 'https://evil.example', host: 'gym.local' })).ok).toBe(true);
	});

	it('still requires an Origin header even with the wildcard', () => {
		// A missing Origin is short-circuited before the trust list is consulted;
		// the wildcard is for naming other origins, not for skipping the check.
		process.env.TRUSTED_ORIGINS = '*';
		expect(checkCsrf(event({ origin: null })).ok).toBe(false);
	});
});
