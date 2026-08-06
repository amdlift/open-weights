import { hash, verify } from '@node-rs/argon2';
import { and, eq, lt } from 'drizzle-orm';
import crypto from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '$lib/constants';
import { getDb, type Db } from './db';
import * as schema from './db/schema';
import type { OneRmFormula, Theme, UnitSystem, UserRole } from './db/schema';

export const SESSION_COOKIE = 'ow_session';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Sessions inside this window of expiry are extended on use. */
const SESSION_RENEW_MS = 15 * 24 * 60 * 60 * 1000;

/**
 * `Algorithm.Argon2id`. Written as the literal because @node-rs/argon2 declares
 * `Algorithm` as an ambient `const enum`, which cannot be imported under
 * `verbatimModuleSyntax`.
 */
const ARGON2ID = 2;

/**
 * OWASP's recommended Argon2id parameters (19 MiB, 2 iterations, 1 lane).
 * Chosen for a self-hosted box that may well be a Raspberry Pi — high enough to
 * be expensive to attack, low enough that a login on weak hardware stays quick.
 */
const ARGON2_OPTIONS = {
	algorithm: ARGON2ID,
	memoryCost: 19456,
	timeCost: 2,
	parallelism: 1
} as const;

export { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH };

export type SessionUser = {
	id: number;
	username: string;
	displayName: string;
	role: UserRole;
	isAdmin: boolean;
	mustChangePassword: boolean;
	onboardedAt: Date | null;
	/** True once the account has both a permanent password and a filled profile. */
	isReady: boolean;
	unitSystem: UnitSystem;
	oneRmFormula: OneRmFormula;
	weekStartsOn: number;
	timezone: string;
	theme: Theme;
	pinnedExerciseIds: number[];
};

// --- passwords ------------------------------------------------------------

export function hashPassword(password: string): Promise<string> {
	return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(digest: string, password: string): Promise<boolean> {
	try {
		return await verify(digest, password, ARGON2_OPTIONS);
	} catch {
		// A malformed or truncated hash must read as "wrong password", never as a
		// 500 that tells an attacker they found an interesting account.
		return false;
	}
}

export function validatePassword(password: string): string | null {
	if (password.length < MIN_PASSWORD_LENGTH) {
		return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
	}
	if (password.length > MAX_PASSWORD_LENGTH) {
		return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
	}
	return null;
}

/** Usernames are matched case-insensitively, so they are stored folded. */
export function normalizeUsername(username: string): string {
	return username.trim().toLowerCase();
}

export function validateUsername(username: string): string | null {
	if (username.length < 2) return 'Username must be at least 2 characters.';
	if (username.length > 32) return 'Username must be at most 32 characters.';
	if (!/^[a-z0-9][a-z0-9._-]*$/.test(username)) {
		return 'Use letters, numbers, and . _ - only, starting with a letter or number.';
	}
	return null;
}

/** A readable temporary password for admins to hand to a new user. */
export function generateTemporaryPassword(): string {
	// No 0/O/1/l/I — these get transcribed wrong when read off a screen.
	const alphabet = 'abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789';
	const bytes = crypto.randomBytes(16);
	const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
	return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

// --- sessions -------------------------------------------------------------

function generateSessionToken(): string {
	return crypto.randomBytes(32).toString('base64url');
}

/**
 * Only the digest is stored. A leaked database therefore does not hand over
 * usable session cookies.
 */
function digestToken(token: string): string {
	return crypto.createHash('sha256').update(token).digest('hex');
}

export function createSession(userId: number, db: Db = getDb()): string {
	const token = generateSessionToken();
	db.insert(schema.sessions)
		.values({
			id: digestToken(token),
			userId,
			expiresAt: new Date(Date.now() + SESSION_TTL_MS)
		})
		.run();
	return token;
}

export function deleteSession(token: string, db: Db = getDb()): void {
	db.delete(schema.sessions).where(eq(schema.sessions.id, digestToken(token))).run();
}

export function deleteAllSessionsForUser(userId: number, db: Db = getDb()): void {
	db.delete(schema.sessions).where(eq(schema.sessions.userId, userId)).run();
}

/** Housekeeping for expired rows; cheap enough to run on each login. */
export function pruneExpiredSessions(db: Db = getDb()): void {
	db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date())).run();
}

/**
 * Resolve a cookie token to the signed-in user, sliding the expiry forward when
 * the session is within its renewal window. Returns null for unknown, expired,
 * or deactivated accounts.
 */
export function validateSession(token: string, db: Db = getDb()): SessionUser | null {
	const id = digestToken(token);

	const row = db
		.select({
			session: schema.sessions,
			user: schema.users,
			profile: schema.userProfiles
		})
		.from(schema.sessions)
		.innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
		.leftJoin(schema.userProfiles, eq(schema.userProfiles.userId, schema.users.id))
		.where(and(eq(schema.sessions.id, id), eq(schema.users.isActive, true)))
		.get();

	if (!row) return null;

	if (row.session.expiresAt.getTime() <= Date.now()) {
		db.delete(schema.sessions).where(eq(schema.sessions.id, id)).run();
		return null;
	}

	if (row.session.expiresAt.getTime() - Date.now() < SESSION_RENEW_MS) {
		db.update(schema.sessions)
			.set({ expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
			.where(eq(schema.sessions.id, id))
			.run();
	}

	return toSessionUser(row.user, row.profile);
}

export function toSessionUser(
	user: schema.User,
	profile: schema.UserProfile | null
): SessionUser {
	return {
		id: user.id,
		username: user.username,
		displayName: user.displayName,
		role: user.role,
		isAdmin: user.role === 'admin',
		mustChangePassword: user.mustChangePassword,
		onboardedAt: user.onboardedAt,
		isReady: !user.mustChangePassword && user.onboardedAt != null,
		unitSystem: profile?.unitSystem ?? 'metric',
		oneRmFormula: profile?.oneRmFormula ?? 'epley',
		weekStartsOn: profile?.weekStartsOn ?? 1,
		timezone: profile?.timezone ?? process.env.TZ ?? 'UTC',
		theme: profile?.theme ?? 'system',
		pinnedExerciseIds: profile?.pinnedExerciseIds ?? []
	};
}

// --- cookie plumbing ------------------------------------------------------

/**
 * Whether this request actually arrived over TLS.
 *
 * Deliberately *not* derived from `event.url`: with `ORIGIN` unset, adapter-node
 * synthesises the origin from headers with the protocol defaulting to `https`,
 * so `event.url.protocol` claims https on a plain-http LAN deployment. Marking
 * the cookie `Secure` in that case makes the browser discard it, and the user
 * signs in successfully only to be bounced straight back to the login form.
 *
 * Only explicit signals count: a proxy's `X-Forwarded-Proto`, or an `ORIGIN`
 * the operator set themselves.
 */
function isSecureRequest(request: Request): boolean {
	const forwarded = request.headers.get('x-forwarded-proto');
	if (forwarded) return forwarded.split(',')[0].trim().toLowerCase() === 'https';

	const origin = process.env.ORIGIN;
	if (origin) return origin.toLowerCase().startsWith('https://');

	return false;
}

export function setSessionCookie(cookies: Cookies, token: string, request: Request): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: isSecureRequest(request),
		maxAge: Math.floor(SESSION_TTL_MS / 1000)
	});
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
