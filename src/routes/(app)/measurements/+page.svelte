<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import LineChart from '$lib/components/charts/LineChart.svelte';
	import { MEASUREMENT_FIELDS } from '$lib/constants';
	import { formatDateMedium, formatRelativeDay } from '$lib/dates';
	
	import {
		cmToInch,
		formatLength,
		formatWeight,
		fromKg,
		lengthUnit,
		trimNumber,
		weightUnit
	} from '$lib/units';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let units = $derived(data.user.unitSystem);
	let showAll = $state(false);
	let measuredOn = $state(untrack(() => data.today));

	/** The entry already on file for the chosen date, so the form prefills it. */
	let existing = $derived(data.entries.find((e) => e.measuredOn === measuredOn) ?? null);

	let latest = $derived(data.entries.find((e) => e.weightKg != null) ?? null);
	let previous = $derived(
		data.entries.filter((e) => e.weightKg != null && e.id !== latest?.id)[0] ?? null
	);
	let change = $derived(
		latest?.weightKg != null && previous?.weightKg != null
			? latest.weightKg - previous.weightKg
			: null
	);

	// The raw daily readings are context behind the smoothed line, not a second
	// series — bodyweight is noisy enough that the average is the real signal.
	let chartSeries = $derived(
		data.trend.length > 1
			? [
					{
						id: 'trend',
						label: '7-day average',
						points: data.trend.map((p) => ({ date: p.date, value: fromKg(p.weightKg, units) }))
					}
				]
			: []
	);
	let chartContext = $derived(
		data.series.length > 1
			? {
					label: 'Daily readings',
					points: data.series.map((p) => ({ date: p.date, value: fromKg(p.weightKg, units) }))
				}
			: null
	);

	const formatChartWeight = (value: number) => `${trimNumber(value, 1)} ${weightUnit(units)}`;

	function displayLength(cm: number | null): string {
		if (cm == null) return '';
		return trimNumber(units === 'imperial' ? cmToInch(cm) : cm, 1);
	}
</script>

<svelte:head><title>Measurements · OpenWeights</title></svelte:head>

<PageHeader title="Measurements" description="Bodyweight and, if you want it, the tape.">
	{#snippet actions()}
		<button type="button" class="ow-btn-secondary" onclick={() => (showAll = !showAll)}>
			{showAll ? 'Bodyweight only' : 'All measurements'}
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

<div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
	<div class="space-y-5 lg:order-2">
		<!-- Entry form -->
		<form method="POST" action="?/save" use:enhance class="ow-card space-y-4 p-4">
			<div>
				<label class="ow-label" for="measuredOn">Date</label>
				<input
					id="measuredOn"
					name="measuredOn"
					type="date"
					class="ow-input"
					max={data.today}
					required
					bind:value={measuredOn}
				/>
				{#if existing}
					<p class="mt-1 text-xs text-warning">
						You already logged {formatRelativeDay(measuredOn, data.today).toLowerCase()} —
						saving updates that entry.
					</p>
				{/if}
			</div>

			<div>
				<label class="ow-label" for="weightKg">Bodyweight ({weightUnit(units)})</label>
				<input
					id="weightKg"
					name="weightKg"
					class="ow-input tnum"
					inputmode="decimal"
					placeholder="—"
					value={existing?.weightKg != null
						? trimNumber(fromKg(existing.weightKg, units), 2)
						: ''}
				/>
			</div>

			{#if showAll}
				<div>
					<label class="ow-label" for="bodyFatPct">Body fat (%)</label>
					<input
						id="bodyFatPct"
						name="bodyFatPct"
						class="ow-input tnum"
						inputmode="decimal"
						placeholder="—"
						value={existing?.bodyFatPct ?? ''}
					/>
				</div>

				<div class="grid grid-cols-2 gap-3">
					{#each MEASUREMENT_FIELDS as field (field.key)}
						<div>
							<label class="ow-label" for={field.key}>
								{field.label} ({lengthUnit(units)})
							</label>
							<input
								id={field.key}
								name={field.key}
								class="ow-input tnum"
								inputmode="decimal"
								placeholder="—"
								value={displayLength(existing?.[field.key] ?? null)}
							/>
						</div>
					{/each}
				</div>

				<div>
					<label class="ow-label" for="notes">Notes</label>
					<input
						id="notes"
						name="notes"
						class="ow-input"
						placeholder="Optional"
						value={existing?.notes ?? ''}
					/>
				</div>
			{/if}

			<button type="submit" class="ow-btn-primary w-full">
				{existing ? 'Update entry' : 'Save entry'}
			</button>
		</form>

		{#if latest}
			<div class="ow-card p-4">
				<p class="text-xs font-medium text-muted">Latest bodyweight</p>
				<p class="mt-1 text-2xl font-semibold tracking-tight">
					{formatWeight(latest.weightKg, units)}
				</p>
				<p class="mt-0.5 text-xs text-faint">
					{formatDateMedium(latest.measuredOn)}
					{#if change != null && change !== 0}
						· {change > 0 ? '+' : '−'}{formatWeight(Math.abs(change), units)} since previous
					{/if}
				</p>
			</div>
		{/if}
	</div>

	<div class="space-y-5 lg:order-1">
		<!-- Trend -->
		<section class="ow-card p-4">
			<h2 class="text-sm font-semibold">Bodyweight trend</h2>
			<p class="mt-0.5 mb-3 text-xs text-muted">
				The line is a 7-day average; the faint line behind it is each day's reading.
			</p>
			<LineChart
				series={chartSeries}
				context={chartContext}
				format={formatChartWeight}
				height={240}
				emptyMessage="Log bodyweight on two different days to see a trend."
			/>
		</section>

		<!-- History -->
		{#if data.entries.length > 0}
			<section>
				<h2 class="mb-2 text-sm font-semibold">History</h2>
				<div class="ow-card overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-border-base text-left text-xs text-faint">
								<th scope="col" class="px-4 py-2 font-medium">Date</th>
								<th scope="col" class="px-3 py-2 font-medium">Weight</th>
								{#if showAll}
									<th scope="col" class="px-3 py-2 font-medium">Body fat</th>
									{#each MEASUREMENT_FIELDS as field (field.key)}
										<th scope="col" class="px-3 py-2 font-medium">{field.label}</th>
									{/each}
								{/if}
								<th scope="col" class="px-3 py-2"><span class="sr-only">Remove</span></th>
							</tr>
						</thead>
						<tbody class="divide-y divide-border-base">
							{#each data.entries as entry (entry.id)}
								<tr>
									<td class="px-4 py-2 whitespace-nowrap">
										<button
											type="button"
											class="hover:text-primary"
											onclick={() => (measuredOn = entry.measuredOn)}
											title="Load this entry into the form"
										>
											{formatDateMedium(entry.measuredOn)}
										</button>
									</td>
									<td class="px-3 py-2 tnum whitespace-nowrap">
										{formatWeight(entry.weightKg, units)}
									</td>
									{#if showAll}
										<td class="px-3 py-2 tnum">
											{entry.bodyFatPct != null ? `${entry.bodyFatPct}%` : '—'}
										</td>
										{#each MEASUREMENT_FIELDS as field (field.key)}
											<td class="px-3 py-2 tnum whitespace-nowrap">
												{formatLength(entry[field.key], units)}
											</td>
										{/each}
									{/if}
									<td class="px-3 py-2 text-right">
										<form method="POST" action="?/delete" use:enhance>
											<input type="hidden" name="id" value={entry.id} />
											<button
												type="submit"
												class="flex h-8 w-8 items-center justify-center rounded-md text-faint
													hover:bg-danger-soft hover:text-danger"
												aria-label="Delete entry for {formatDateMedium(entry.measuredOn)}"
											>
												<Icon name="x" size={15} />
											</button>
										</form>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{:else}
			<div class="ow-card p-8 text-center">
				<p class="font-medium">Nothing logged yet</p>
				<p class="mt-1 text-sm text-muted">
					Weigh in a few times a week and the trend line will do the rest.
				</p>
			</div>
		{/if}
	</div>
</div>
