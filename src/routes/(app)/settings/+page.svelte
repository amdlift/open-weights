<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import {
		GENDERS,
		GENDER_LABELS,
		MIN_PASSWORD_LENGTH,
		ONE_RM_FORMULAS,
		THEMES,
		THEME_LABELS,
		UNIT_SYSTEMS,
		UNIT_SYSTEM_LABELS
	} from '$lib/constants';
	import { ONE_RM_FORMULA_DESCRIPTIONS, ONE_RM_FORMULA_LABELS } from '$lib/one-rm';
	import { cmToFeetInches } from '$lib/units';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let imperialHeight = $derived(cmToFeetInches(data.profile.heightCm ?? 175));

	// The theme class lives on <html>, so it has to be re-read after saving.
	const saveAndRefresh: SubmitFunction = () => {
		return async ({ update }) => {
			await update({ reset: false });
			await invalidateAll();
		};
	};

	function noticeFor(section: string) {
		if (!form || form.section !== section) return null;
		if ('error' in form && form.error) return { kind: 'error' as const, text: form.error };
		if ('saved' in form && form.saved) return { kind: 'ok' as const, text: 'Saved.' };
		return null;
	}
</script>

<svelte:head><title>Settings · OpenWeights</title></svelte:head>

<PageHeader title="Settings" description="Your profile, units, and account." />

{#snippet notice(section: string)}
	{@const n = noticeFor(section)}
	{#if n}
		<p
			class="mb-4 rounded-lg border px-3 py-2 text-sm {n.kind === 'error'
				? 'border-danger/40 bg-danger-soft text-danger'
				: 'border-success/40 bg-success/10 text-success'}"
			role="status"
		>
			{n.text}
		</p>
	{/if}
{/snippet}

<div class="max-w-2xl space-y-5">
	<!-- Profile -->
	<section class="ow-card p-5">
		<h2 class="text-base font-semibold">Profile</h2>
		<p class="mt-1 text-sm text-muted">
			Age and height feed the dashboard; nothing here leaves this server.
		</p>

		<form method="POST" action="?/profile" use:enhance={saveAndRefresh} class="mt-4 space-y-4">
			{@render notice('profile')}

			<div>
				<label class="ow-label" for="displayName">Display name</label>
				<input
					id="displayName"
					name="displayName"
					class="ow-input"
					required
					value={data.user.displayName}
				/>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label class="ow-label" for="dateOfBirth">Date of birth</label>
					<input
						id="dateOfBirth"
						name="dateOfBirth"
						type="date"
						class="ow-input"
						max={data.today}
						min="1900-01-01"
						required
						value={data.profile.dateOfBirth ?? ''}
					/>
				</div>

				<div>
					<span class="ow-label">Height</span>
					{#if data.user.unitSystem === 'imperial'}
						<div class="flex gap-2">
							<input
								name="heightFeet"
								type="number"
								inputmode="numeric"
								class="ow-input"
								min="1"
								max="8"
								required
								aria-label="Height in feet"
								value={imperialHeight.feet}
							/>
							<input
								name="heightInches"
								type="number"
								inputmode="numeric"
								class="ow-input"
								min="0"
								max="11"
								aria-label="Additional inches"
								value={imperialHeight.inches}
							/>
						</div>
					{:else}
						<input
							name="heightCm"
							type="number"
							inputmode="decimal"
							step="0.5"
							class="ow-input"
							min="50"
							max="280"
							required
							aria-label="Height in centimetres"
							value={data.profile.heightCm ?? ''}
						/>
					{/if}
				</div>
			</div>

			<div>
				<label class="ow-label" for="gender">Gender</label>
				<select id="gender" name="gender" class="ow-input" required>
					{#each GENDERS as gender (gender)}
						<option value={gender} selected={data.profile.gender === gender}>
							{GENDER_LABELS[gender]}
						</option>
					{/each}
				</select>
			</div>

			<button type="submit" class="ow-btn-primary">Save profile</button>
		</form>
	</section>

	<!-- Preferences -->
	<section class="ow-card p-5">
		<h2 class="text-base font-semibold">Preferences</h2>
		<p class="mt-1 text-sm text-muted">
			Display only. Everything is stored in metric, so switching units never changes a
			recorded number.
		</p>

		<form
			method="POST"
			action="?/preferences"
			use:enhance={saveAndRefresh}
			class="mt-4 space-y-4"
		>
			{@render notice('preferences')}

			<div>
				<label class="ow-label" for="unitSystem">Units</label>
				<select id="unitSystem" name="unitSystem" class="ow-input">
					{#each UNIT_SYSTEMS as system (system)}
						<option value={system} selected={data.profile.unitSystem === system}>
							{UNIT_SYSTEM_LABELS[system]}
						</option>
					{/each}
				</select>
			</div>

			<div>
				<label class="ow-label" for="oneRmFormula">Estimated 1RM formula</label>
				<select id="oneRmFormula" name="oneRmFormula" class="ow-input">
					{#each ONE_RM_FORMULAS as formula (formula)}
						<option value={formula} selected={data.profile.oneRmFormula === formula}>
							{ONE_RM_FORMULA_LABELS[formula]}
						</option>
					{/each}
				</select>
				<p class="mt-1 text-xs text-faint">
					{ONE_RM_FORMULA_DESCRIPTIONS[data.profile.oneRmFormula]}
					Estimates are recalculated on the fly, so changing this redraws past charts too.
				</p>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label class="ow-label" for="weekStartsOn">Week starts on</label>
					<select id="weekStartsOn" name="weekStartsOn" class="ow-input">
						<option value="1" selected={data.profile.weekStartsOn === 1}>Monday</option>
						<option value="0" selected={data.profile.weekStartsOn === 0}>Sunday</option>
					</select>
				</div>

				<div>
					<label class="ow-label" for="theme">Theme</label>
					<select id="theme" name="theme" class="ow-input">
						{#each THEMES as theme (theme)}
							<option value={theme} selected={data.profile.theme === theme}>
								{THEME_LABELS[theme]}
							</option>
						{/each}
					</select>
				</div>
			</div>

			<div>
				<label class="ow-label" for="timezone">Timezone</label>
				<input
					id="timezone"
					name="timezone"
					class="ow-input"
					spellcheck="false"
					required
					value={data.profile.timezone}
				/>
				<p class="mt-1 text-xs text-faint">
					Decides which calendar day a workout is filed under. IANA name, e.g.
					<span class="font-mono">Europe/Berlin</span>.
				</p>
			</div>

			<button type="submit" class="ow-btn-primary">Save preferences</button>
		</form>
	</section>

	<!-- Password -->
	<section class="ow-card p-5">
		<h2 class="text-base font-semibold">Password</h2>
		<p class="mt-1 text-sm text-muted">
			Changing it signs out every other device signed in as you.
		</p>

		<form method="POST" action="?/password" use:enhance class="mt-4 space-y-4">
			{@render notice('password')}

			<div>
				<label class="ow-label" for="currentPassword">Current password</label>
				<input
					id="currentPassword"
					name="currentPassword"
					type="password"
					class="ow-input"
					autocomplete="current-password"
					required
				/>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label class="ow-label" for="newPassword">New password</label>
					<input
						id="newPassword"
						name="newPassword"
						type="password"
						class="ow-input"
						autocomplete="new-password"
						minlength={MIN_PASSWORD_LENGTH}
						required
					/>
				</div>
				<div>
					<label class="ow-label" for="confirmPassword">Confirm new password</label>
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
			</div>

			<button type="submit" class="ow-btn-primary">Change password</button>
		</form>
	</section>

	<!-- Data -->
	<section class="ow-card p-5">
		<h2 class="text-base font-semibold">Your data</h2>
		<p class="mt-1 text-sm text-muted">
			A complete JSON dump of your workouts, routines, measurements and custom exercises.
		</p>
		<a href="/api/export" class="ow-btn-secondary mt-4" download>
			<Icon name="download" size={16} />
			Export everything
		</a>
	</section>

	{#if data.user.isAdmin}
		<section class="ow-card p-5">
			<h2 class="text-base font-semibold">Administration</h2>
			<p class="mt-1 text-sm text-muted">Add people to this instance and manage their access.</p>
			<a href="/settings/users" class="ow-btn-secondary mt-4">
				<Icon name="users" size={16} />
				Manage users
			</a>
		</section>
	{/if}
</div>
