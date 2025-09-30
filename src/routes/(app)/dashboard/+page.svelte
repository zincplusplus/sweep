<script lang="ts">
	import ScanSection from '$lib/components/ScanSection.svelte';
	import StatisticsSection from '$lib/components/StatisticsSection.svelte';
	// import RecentEmailsSection from '$lib/components/RecentEmailsSection.svelte';
	import TopSendersSection from '$lib/components/TopSendersSection.svelte';

	// let isPaused = true;
	// let isComplete = false;
</script>

<div class="min-h-screen bg-white p-6">
	<div class="mx-auto max-w-6xl space-y-6">

		<ScanSection />

		<StatisticsSection />
		<TopSendersSection />

		<!-- {#if isPaused || isComplete} -->
			<!-- <RecentEmailsSection /> -->
		<!-- {/if} -->
	</div>
</div>
