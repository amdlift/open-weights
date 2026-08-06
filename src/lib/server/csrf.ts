import type { RequestEvent } from '@sveltejs/kit';

/**
 * Cross-site request forgery protection.
 *
 * Why this exists rather than SvelteKit's built-in check:
 *
 * Kit compares the `Origin` header against the server's *configured* origin,
 * which on adapter-node comes from the `ORIGIN` environment variable — or, if
 * that is unset, from the request headers with the protocol defaulting to
 * `https`. Either way a self-hoster reaching the app over plain http at
 * `http://192.168.1.x:3000` gets every form submission rejected until they
 * hand-configure `ORIGIN`, and the rejection is a bare 403 with no explanation.
 * That is a terrible first experience for software whose whole point is to run
 * on a box on your LAN.
 *
 * The fix is to compare `Origin` against the host the browser actually
 * connected to, which arrives on every request in the `Host` header. This is
 * exactly as strong: in a real CSRF attack the browser sets `Host` to *this*
 * server and `Origin` to the *attacker's* site, so they still do not match. The
 * attacker cannot forge `Host` either, because the browser sets it from the URL
 * being requested.
 *
 * Result: no configuration needed for http or https, by IP, hostname, mDNS name
 * or VPN name — and cross-site posts are still refused.
 */

/** Methods that can mutate state and therefore need checking. */
const PROTECTED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * The content types a browser will send cross-origin *without* a preflight.
 * Anything else (`application/json`, say) already requires the server to opt in
 * via CORS, so it cannot be forged from another site to begin with.
 */
const FORM_CONTENT_TYPES = new Set([
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain'
]);

export type CsrfVerdict =
	| { ok: true }
	| { ok: false; reason: 'missing_origin' | 'missing_host' | 'mismatch'; origin: string | null; host: string | null };

/** Extra origins an operator explicitly trusts, e.g. a proxy that rewrites Host. */
function configuredTrustedOrigins(): string[] {
	return (process.env.TRUSTED_ORIGINS ?? '')
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean);
}

function hostOf(origin: string): string | null {
	try {
		return new URL(origin).host.toLowerCase();
	} catch {
		return null;
	}
}

export function isFormSubmission(request: Request): boolean {
	if (!PROTECTED_METHODS.has(request.method)) return false;
	const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
	return type != null && FORM_CONTENT_TYPES.has(type);
}

export function checkCsrf(event: RequestEvent): CsrfVerdict {
	if (!isFormSubmission(event.request)) return { ok: true };

	const originHeader = event.request.headers.get('origin');
	const hostHeader = event.request.headers.get('host')?.toLowerCase() ?? null;

	// Every browser sends Origin on a form POST. Its absence means the request
	// did not come from a browser navigation, so it gets no benefit of the doubt.
	if (!originHeader) {
		return { ok: false, reason: 'missing_origin', origin: null, host: hostHeader };
	}

	const originHost = hostOf(originHeader);
	if (!originHost) {
		return { ok: false, reason: 'mismatch', origin: originHeader, host: hostHeader };
	}

	// The normal case: the page was served by the same host the browser is
	// posting to. Scheme is deliberately not compared — behind a TLS-terminating
	// proxy the browser says `https` while the hop to us is plain http, and the
	// host match is what actually establishes same-site.
	if (hostHeader && originHost === hostHeader) return { ok: true };

	// Covers an explicitly configured ORIGIN, and proxies that rewrite Host.
	if (originHost === event.url.host.toLowerCase()) return { ok: true };

	const trusted = configuredTrustedOrigins();
	if (trusted.includes('*')) return { ok: true };
	if (trusted.some((entry) => hostOf(entry) === originHost)) return { ok: true };

	return { ok: false, reason: 'mismatch', origin: originHeader, host: hostHeader };
}

/**
 * A rejection page that says what went wrong.
 *
 * The previous behaviour returned a bare 403 that the progressively-enhanced
 * form swallowed, so the button simply did nothing. Whatever the cause, the
 * person on the other end deserves to know which two values failed to match.
 */
export function csrfErrorResponse(verdict: Extract<CsrfVerdict, { ok: false }>): Response {
	const detail =
		verdict.reason === 'missing_origin'
			? 'The request carried no Origin header, so it could not be confirmed as coming from this site.'
			: verdict.reason === 'missing_host'
				? 'The request carried no Host header.'
				: `The page was loaded from <code>${escapeHtml(verdict.origin ?? 'unknown')}</code> but the request arrived at <code>${escapeHtml(verdict.host ?? 'unknown')}</code>.`;

	const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Blocked request · OpenWeights</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:1.5rem;
    font: 16px/1.6 ui-sans-serif, system-ui, sans-serif; background:#f9fafb; color:#1f2328; }
  main { max-width:34rem; background:#fff; border:1px solid #d8dade; border-radius:12px; padding:1.5rem; }
  h1 { margin:0 0 .5rem; font-size:1.125rem; }
  code { background:#f3f4f6; padding:.1em .35em; border-radius:4px; font-size:.9em; }
  ul { padding-left:1.25rem; } li { margin:.35rem 0; }
  p.muted { color:#57606a; font-size:.9rem; }
  @media (prefers-color-scheme: dark) {
    body { background:#111316; color:#e9eaec; }
    main { background:#1a1c20; border-color:#33363b; }
    code { background:#23252a; }
    p.muted { color:#a3a7ad; }
  }
</style>
</head>
<body>
<main>
<h1>Request blocked</h1>
<p>OpenWeights refused this form submission because it could not confirm it came from this site. ${detail}</p>
<p class="muted">If you are reaching OpenWeights through a reverse proxy, either forward the original
<code>Host</code> header, or list the public address in <code>TRUSTED_ORIGINS</code>
(comma-separated, e.g. <code>https://gym.example.com</code>) and restart the container.</p>
<p><a href="/">Back to OpenWeights</a></p>
</main>
</body>
</html>`;

	return new Response(body, {
		status: 403,
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
