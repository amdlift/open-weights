<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import AuthCard from '$lib/components/AuthCard.svelte';
	import {
		GENDERS,
		GENDER_LABELS,
		MIN_PASSWORD_LENGTH,
		UNIT_SYSTEMS,
		UNIT_SYSTEM_LABELS,
		type UnitSystem
	} from '$lib/constants';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// The password step hands over to the profile step without a navigation, so
	// the current step is whichever the server last reported.
	let step = $derived(form?.step ?? data.step);
	let submitting = $state(false);

	// Seeded once; from then on it is whatever the user picked. A failed submit
	// re-renders rather than remounts, so the choice survives.
	let unitSystem = $state<UnitSystem>(
		untrack(() => (data.profile?.unitSystem as UnitSystem | undefined) ?? 'metric')
	);

	const submit: SubmitFunction = ({ formData }) => {
		// The timezone decides which calendar day a workout lands on, so it is
		// taken from the browser rather than from the server's clock. Without JS
		// the field stays empty and the server keeps the container's timezone.
		formData.set('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone || '');
		submitting = true;
		return async ({ update }) => {
			await update({ reset: false });
			submitting = false;
		};
	};
</script>

<svelte:head><title>Welcome · OpenWeights</title></svelte:head>

{#if step === 'password'}
	<AuthCard
		title="Choose a password"
		subtitle="Your account was created with a temporary password. Pick your own before you start."
	>
		<form method="POST" action="?/password" use:enhance={submit} class="space-y-4">
			{#if form?.error}
				<p
					class="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger"
					role="alert"
				>
					{form.error}
				</p>
			{/if}

			<div>
				<label class="ow-label" for="currentPassword">Temporary password</label>
				<input
					id="currentPassword"
					name="currentPassword"
					type="password"
					class="ow-input"
					autocomplete="current-password"
					required
				/>
			</div>

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
				<p class="mt-1 text-xs text-faint">At least {MIN_PASSWORD_LENGTH} characters.</p>
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

			<button type="submit" class="ow-btn-primary w-full" disabled={submitting}>
				{submitting ? 'Saving…' : 'Continue'}
			</button>
		</form>
	</AuthCard>
{:else}
	<AuthCard
		title="Tell us about you"
		subtitle="Used for age-based targets and to show your numbers in the units you think in. You can change any of it later in Settings."
	>
		<form method="POST" action="?/profile" use:enhance={submit} class="space-y-4">
			{#if form?.error}
				<p
					class="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger"
					role="alert"
				>
					{form.error}
				</p>
			{/if}

			<input type="hidden" name="timezone" value="" />

			<div>
				<label class="ow-label" for="displayName">Display name</label>
				<input
					id="displayName"
					name="displayName"
					class="ow-input"
					autocomplete="name"
					value={form?.displayName ?? data.displayName}
				/>
			</div>

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
					value={form?.dateOfBirth ?? data.profile?.dateOfBirth ?? ''}
				/>
			</div>

			<fieldset>
				<legend class="ow-label">Units</legend>
				<div class="grid grid-cols-2 gap-2">
					{#each UNIT_SYSTEMS as system (system)}
						<label
							class="flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2.5
								text-sm font-medium transition-colors
								{unitSystem === system
								? 'border-primary bg-primary-soft text-text-base'
								: 'border-border-base text-muted hover:bg-surface-2'}"
						>
							<input
								type="radio"
								name="unitSystem"
								value={system}
								bind:group={unitSystem}
								class="sr-only"
							/>
							{system === 'metric' ? 'Metric' : 'Imperial'}
						</label>
					{/each}
				</div>
				<p class="mt-1 text-xs text-faint">{UNIT_SYSTEM_LABELS[unitSystem]}</p>
			</fieldset>

			<div>
				<span class="ow-label">Height</span>
				{#if unitSystem === 'imperial'}
					<div class="flex gap-2">
						<div class="flex-1">
							<input
								id="heightFeet"
								name="heightFeet"
								type="number"
								inputmode="numeric"
								class="ow-input"
								min="1"
								max="8"
								placeholder="ft"
								required
								aria-label="Height in feet"
							/>
						</div>
						<div class="flex-1">
							<input
								id="heightInches"
								name="heightInches"
								type="number"
								inputmode="numeric"
								class="ow-input"
								min="0"
								max="11"
								placeholder="in"
								aria-label="Additional inches"
							/>
						</div>
					</div>
				{:else}
					<input
						id="heightCm"
						name="heightCm"
						type="number"
						inputmode="decimal"
						step="0.5"
						class="ow-input"
						min="50"
						max="280"
						placeholder="cm"
						required
						value={data.profile?.heightCm ?? ''}
					/>
				{/if}
			</div>

			<div>
				<label class="ow-label" for="gender">Gender</label>
				<select id="gender" name="gender" class="ow-input" required>
					<option value="" disabled selected={!form?.gender && !data.profile?.gender}>
						Select…
					</option>
					{#each GENDERS as gender (gender)}
						<option
							value={gender}
							selected={(form?.gender ?? data.profile?.gender) === gender}
						>
							{GENDER_LABELS[gender]}
						</option>
					{/each}
				</select>
			</div>

			<fieldset>
				<legend class="ow-label">Week starts on</legend>
				<div class="grid grid-cols-2 gap-2">
					{#each [{ value: '1', label: 'Monday' }, { value: '0', label: 'Sunday' }] as option (option.value)}
						<label
							class="flex cursor-pointer items-center justify-center rounded-lg border
								border-border-base px-3 py-2.5 text-sm font-medium text-muted
								transition-colors hover:bg-surface-2
								has-checked:border-primary has-checked:bg-primary-soft has-checked:text-text-base"
						>
							<input
								type="radio"
								name="weekStartsOn"
								value={option.value}
								checked={option.value === '1'}
								class="sr-only"
							/>
							{option.label}
						</label>
					{/each}
				</div>
			</fieldset>

			<button type="submit" class="ow-btn-primary w-full" disabled={submitting}>
				{submitting ? 'Saving…' : 'Start tracking'}
			</button>
		</form>
	</AuthCard>
{/if}
