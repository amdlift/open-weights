<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let submitting = $state(false);
</script>

<svelte:head><title>Sign in · OpenWeights</title></svelte:head>

<AuthCard title="Sign in" subtitle="Welcome back. Time to move some weight.">
	{#if data.lockedOut}
		<div class="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
			<p class="font-medium">No accounts exist yet</p>
			<p class="mt-1 text-muted">
				Sign-up is disabled by <code class="font-mono">DISABLE_SIGNUP</code>. Unset it and
				restart the container to create the first admin account.
			</p>
		</div>
	{:else}
		<form
			method="POST"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
			class="space-y-4"
		>
			{#if form?.error}
				<p
					class="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger"
					role="alert"
				>
					{form.error}
				</p>
			{/if}

			<div>
				<label class="ow-label" for="username">Username</label>
				<input
					id="username"
					name="username"
					class="ow-input"
					autocomplete="username"
					autocapitalize="none"
					spellcheck="false"
					required
					value={form?.username ?? ''}
				/>
			</div>

			<div>
				<label class="ow-label" for="password">Password</label>
				<input
					id="password"
					name="password"
					type="password"
					class="ow-input"
					autocomplete="current-password"
					required
				/>
			</div>

			<button type="submit" class="ow-btn-primary w-full" disabled={submitting}>
				{submitting ? 'Signing in…' : 'Sign in'}
			</button>
		</form>
	{/if}
</AuthCard>
