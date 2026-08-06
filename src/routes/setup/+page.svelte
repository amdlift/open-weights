<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import { MIN_PASSWORD_LENGTH } from '$lib/constants';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let submitting = $state(false);
</script>

<svelte:head><title>Set up OpenWeights</title></svelte:head>

<AuthCard
	title="Create the admin account"
	subtitle="This is a fresh instance. The first account you create owns it — you can add everyone else from Settings afterwards."
>
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
			<p class="mt-1 text-xs text-faint">Letters, numbers, and . _ - only.</p>
		</div>

		<div>
			<label class="ow-label" for="displayName">Display name</label>
			<input
				id="displayName"
				name="displayName"
				class="ow-input"
				autocomplete="name"
				placeholder="Optional"
				value={form?.displayName ?? ''}
			/>
		</div>

		<div>
			<label class="ow-label" for="password">Password</label>
			<input
				id="password"
				name="password"
				type="password"
				class="ow-input"
				autocomplete="new-password"
				minlength={MIN_PASSWORD_LENGTH}
				required
			/>
			<p class="mt-1 text-xs text-faint">At least {MIN_PASSWORD_LENGTH} characters.</p>
		</div>

		<div>
			<label class="ow-label" for="confirmPassword">Confirm password</label>
			<input
				id="confirmPassword"
				name="confirmPassword"
				type="password"
				class="ow-input"
				autocomplete="new-password"
				minlength={MIN_PASSWORD_LENGTH}
				required
			/>
		</div>

		<button type="submit" class="ow-btn-primary w-full" disabled={submitting}>
			{submitting ? 'Creating…' : 'Create account'}
		</button>
	</form>
</AuthCard>
