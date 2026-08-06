<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { formatDateMedium } from '$lib/dates';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreate = $state(false);
	let confirmingDelete = $state<number | null>(null);
	let copied = $state(false);

	// A newly minted temporary password is shown exactly once — it is never
	// stored in readable form, so there is no way to look it up later.
	let issued = $derived(form && 'created' in form ? form.created : null);

	async function copyPassword(password: string) {
		try {
			await navigator.clipboard.writeText(password);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			copied = false;
		}
	}

	function isoDay(date: Date | string): string {
		return formatDateMedium(new Date(date).toISOString().slice(0, 10));
	}
</script>

<svelte:head><title>Users · OpenWeights</title></svelte:head>

<PageHeader title="Users" description="Everyone with an account on this instance.">
	{#snippet actions()}
		<a href="/settings" class="ow-btn-secondary">Back to settings</a>
		<button type="button" class="ow-btn-primary" onclick={() => (showCreate = !showCreate)}>
			<Icon name="plus" size={16} />
			Add user
		</button>
	{/snippet}
</PageHeader>

{#if form && 'error' in form && form.error}
	<p
		class="mb-4 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger"
		role="alert"
	>
		{form.error}
	</p>
{/if}

{#if form && 'deleted' in form && form.deleted}
	<p class="mb-4 rounded-lg border border-border-base bg-surface-2 px-3 py-2 text-sm">
		Deleted <strong>{form.deleted}</strong> and all of their data.
	</p>
{/if}

{#if issued}
	<div class="ow-card mb-5 border-primary/40 bg-primary-soft/40 p-4">
		<h2 class="text-sm font-semibold">Temporary password for {issued.username}</h2>
		<p class="mt-1 text-sm text-muted">
			Hand this over in person or through a channel you trust. It is shown only now, and
			{issued.username} must replace it at first sign-in.
		</p>
		<div class="mt-3 flex flex-wrap items-center gap-2">
			<code
				class="rounded-lg border border-border-base bg-surface px-3 py-2 font-mono text-base
					tracking-wider select-all"
			>
				{issued.temporaryPassword}
			</code>
			<button
				type="button"
				class="ow-btn-secondary"
				onclick={() => copyPassword(issued.temporaryPassword)}
			>
				<Icon name={copied ? 'check' : 'copy'} size={16} />
				{copied ? 'Copied' : 'Copy'}
			</button>
		</div>
	</div>
{/if}

{#if showCreate}
	<div class="ow-card mb-5 p-4">
		<h2 class="text-sm font-semibold">New user</h2>
		<p class="mt-1 text-sm text-muted">
			You provide the username; they fill in their own date of birth, height and gender the
			first time they sign in.
		</p>
		<form method="POST" action="?/create" use:enhance class="mt-4 grid gap-3 sm:grid-cols-4">
			<div class="sm:col-span-1">
				<label class="ow-label" for="username">Username</label>
				<input
					id="username"
					name="username"
					class="ow-input"
					autocapitalize="none"
					spellcheck="false"
					required
					value={form && 'username' in form ? (form.username ?? '') : ''}
				/>
			</div>
			<div class="sm:col-span-1">
				<label class="ow-label" for="displayName">Display name</label>
				<input
					id="displayName"
					name="displayName"
					class="ow-input"
					placeholder="Optional"
					value={form && 'displayName' in form ? (form.displayName ?? '') : ''}
				/>
			</div>
			<div class="sm:col-span-1">
				<label class="ow-label" for="role">Role</label>
				<select id="role" name="role" class="ow-input">
					<option value="user">User</option>
					<option value="admin">Administrator</option>
				</select>
			</div>
			<div class="flex items-end sm:col-span-1">
				<button type="submit" class="ow-btn-primary w-full">Create account</button>
			</div>
		</form>
	</div>
{/if}

<div class="ow-card divide-y divide-border-base">
	{#each data.users as user (user.id)}
		<div class="p-4">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="min-w-0">
					<div class="flex flex-wrap items-center gap-2">
						<span class="font-medium">{user.displayName}</span>
						<span class="text-sm text-faint">@{user.username}</span>
						{#if user.role === 'admin'}
							<span
								class="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold
									text-text-base"
							>
								Admin
							</span>
						{/if}
						{#if !user.isActive}
							<span
								class="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted"
							>
								Deactivated
							</span>
						{/if}
						{#if user.mustChangePassword}
							<span
								class="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning"
							>
								Password not set
							</span>
						{:else if !user.onboardedAt}
							<span
								class="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning"
							>
								Profile incomplete
							</span>
						{/if}
					</div>
					<p class="mt-1 text-xs text-faint">Joined {isoDay(user.createdAt)}</p>
				</div>

				<div class="flex flex-wrap items-center gap-2">
					<form method="POST" action="?/setRole" use:enhance>
						<input type="hidden" name="userId" value={user.id} />
						<input
							type="hidden"
							name="role"
							value={user.role === 'admin' ? 'user' : 'admin'}
						/>
						<button type="submit" class="ow-btn-ghost h-9 min-h-9 px-2.5 text-xs">
							{user.role === 'admin' ? 'Revoke admin' : 'Make admin'}
						</button>
					</form>

					<form method="POST" action="?/resetPassword" use:enhance>
						<input type="hidden" name="userId" value={user.id} />
						<button type="submit" class="ow-btn-ghost h-9 min-h-9 px-2.5 text-xs">
							Reset password
						</button>
					</form>

					<form method="POST" action="?/setActive" use:enhance>
						<input type="hidden" name="userId" value={user.id} />
						<input type="hidden" name="isActive" value={String(!user.isActive)} />
						<button type="submit" class="ow-btn-ghost h-9 min-h-9 px-2.5 text-xs">
							{user.isActive ? 'Deactivate' : 'Reactivate'}
						</button>
					</form>

					<button
						type="button"
						class="ow-btn-ghost h-9 min-h-9 px-2.5 text-xs text-danger hover:bg-danger-soft"
						onclick={() => (confirmingDelete = confirmingDelete === user.id ? null : user.id)}
					>
						<Icon name="trash" size={15} />
						Delete
					</button>
				</div>
			</div>

			{#if confirmingDelete === user.id}
				<form
					method="POST"
					action="?/delete"
					use:enhance
					class="mt-3 rounded-lg border border-danger/40 bg-danger-soft p-3"
				>
					<p class="text-sm">
						This permanently removes <strong>{user.username}</strong>, every workout they
						logged, their measurements, routines and custom exercises. It cannot be undone.
					</p>
					<input type="hidden" name="userId" value={user.id} />
					<div class="mt-3 flex flex-wrap items-end gap-2">
						<div class="flex-1 sm:max-w-xs">
							<label class="ow-label" for="confirm-{user.id}">
								Type <span class="font-mono">{user.username}</span> to confirm
							</label>
							<input
								id="confirm-{user.id}"
								name="confirmUsername"
								class="ow-input"
								autocapitalize="none"
								spellcheck="false"
							/>
						</div>
						<button type="submit" class="ow-btn-danger">Delete permanently</button>
						<button
							type="button"
							class="ow-btn-secondary"
							onclick={() => (confirmingDelete = null)}
						>
							Cancel
						</button>
					</div>
				</form>
			{/if}
		</div>
	{/each}
</div>
