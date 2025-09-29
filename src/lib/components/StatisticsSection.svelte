<script lang="ts">
	import { Mail, Users, HardDrive } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { emailDB } from '$lib/emaildb';

	// Reactive statistics data
	let totalEmails = 0;
	let newsletterEmails = 0;
	let spaceSavings = 0;
	let spaceSavingsUnit = 'MB';

	async function updateStatistics() {
		try {
			// Get total email count
			totalEmails = await emailDB.getEmailCount();

			// Get all emails to calculate newsletter count and space
			const allEmails = await emailDB.getAllEmails();

			// Count newsletters (emails with List-Unsubscribe header)
			const newsletters = allEmails.filter(email => email.listUnsubscribeValue);
			newsletterEmails = newsletters.length;

			// Calculate newsletter space only (sum of sizeEstimate for newsletters)
			const newsletterBytes = newsletters.reduce((sum, email) => sum + (email.sizeEstimate || 0), 0);

			// Convert to appropriate unit (MB or GB)
			const megabytes = newsletterBytes / (1024 * 1024);
			if (megabytes >= 1024) {
				spaceSavings = Number((megabytes / 1024).toFixed(1));
				spaceSavingsUnit = 'GB';
			} else {
				spaceSavings = Number(megabytes.toFixed(1));
				spaceSavingsUnit = 'MB';
			}
		} catch (error) {
			console.error('Error updating statistics:', error);
		}
	}

	onMount(async () => {
		await emailDB.init();
		await updateStatistics();

		// Update statistics every 5 seconds when scanning might be happening
		// TODO make this smarter to only update when new data is added or removed
		const interval = setInterval(updateStatistics, 5000);

		// Cleanup interval on component destroy
		return () => clearInterval(interval);
	});
</script>

<!-- Statistics Section -->
<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
	<!-- Total Emails -->
	<div class="border rounded-lg p-6 bg-white">
		<div class="flex items-center justify-between mb-4">
			<div class="p-2 bg-gray-50 rounded-lg">
				<Mail class="h-5 w-5 text-gray-600" />
			</div>
		</div>
		<div class="text-3xl font-bold text-black mb-1">{totalEmails.toLocaleString()}</div>
		<div class="text-sm text-gray-600">Total Emails</div>
	</div>

	<!-- Newsletter Emails -->
	<div class="border rounded-lg p-6 bg-white">
		<div class="flex items-center justify-between mb-4">
			<div class="p-2 bg-gray-50 rounded-lg">
				<Users class="h-5 w-5 text-gray-600" />
			</div>
		</div>
		<div class="text-3xl font-bold text-black mb-1">{newsletterEmails.toLocaleString()}</div>
		<div class="text-sm text-gray-600">Newsletter Emails</div>
	</div>

	<!-- Space Savings -->
	<div class="border rounded-lg p-6 bg-white">
		<div class="flex items-center justify-between mb-4">
			<div class="p-2 bg-gray-50 rounded-lg">
				<HardDrive class="h-5 w-5 text-gray-600" />
			</div>
		</div>
		<div class="text-3xl font-bold text-black mb-1">{spaceSavings}{spaceSavingsUnit}</div>
		<div class="text-sm text-gray-600">Space You Could Save</div>
	</div>
</div>
