import type { SessionUser } from '$lib/server/auth';

declare global {
	namespace App {
		interface Locals {
			user: SessionUser | null;
			sessionToken: string | null;
		}
		interface PageData {
			user?: SessionUser | null;
		}
	}
}

export {};
