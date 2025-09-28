<script lang="ts">
	import { Mail } from 'lucide-svelte';

	// Recent imported emails (last 50, most recent first)
	const recentEmails = [
		{ subject: 'Your weekly GitHub digest', from: 'GitHub <noreply@github.com>', date: '2024-01-16 09:45', size: '18 KB' },
		{ subject: 'New connection request from Sarah Johnson', from: 'LinkedIn <messages@linkedin.com>', date: '2024-01-16 09:32', size: '28 KB' },
		{ subject: 'Flash Sale: 50% off everything!', from: 'MegaStore <deals@megastore.com>', date: '2024-01-16 09:15', size: '156 KB' },
		{ subject: 'Your Amazon order has been delivered', from: 'Amazon <shipment-tracking@amazon.com>', date: '2024-01-16 08:43', size: '32 KB' },
		{ subject: 'Weekly newsletter: Tech trends 2024', from: 'TechCrunch <newsletter@techcrunch.com>', date: '2024-01-16 08:30', size: '234 KB' },
		{ subject: 'Security alert for your account', from: 'Google <security-noreply@google.com>', date: '2024-01-16 07:12', size: '22 KB' },
		{ subject: 'Your Spotify Wrapped is ready!', from: 'Spotify <no-reply@spotify.com>', date: '2024-01-16 06:45', size: '89 KB' },
		{ subject: 'Meeting reminder: Team standup', from: 'Calendar <calendar-notification@company.com>', date: '2024-01-15 23:45', size: '12 KB' },
		{ subject: 'Invoice #12345 from Stripe', from: 'Stripe <receipts@stripe.com>', date: '2024-01-15 22:30', size: '45 KB' },
		{ subject: 'Your weekly summary from Notion', from: 'Notion <updates@notion.so>', date: '2024-01-15 21:15', size: '67 KB' },
		{ subject: 'New course available: Advanced React', from: 'Udemy <no-reply@udemy.com>', date: '2024-01-15 20:22', size: '98 KB' },
		{ subject: 'Your ride receipt from Uber', from: 'Uber <noreply@uber.com>', date: '2024-01-15 19:45', size: '24 KB' },
		{ subject: 'Password reset request', from: 'Facebook <security@facebookmail.com>', date: '2024-01-15 18:30', size: '18 KB' },
		{ subject: 'Your monthly report is ready', from: 'Analytics <reports@analytics.com>', date: '2024-01-15 17:15', size: '145 KB' },
		{ subject: 'Special offer just for you!', from: 'Nike <offers@nike.com>', date: '2024-01-15 16:45', size: '187 KB' },
		{ subject: 'Your backup completed successfully', from: 'Dropbox <no-reply@dropbox.com>', date: '2024-01-15 15:30', size: '15 KB' },
		{ subject: 'New message from your bank', from: 'Chase Bank <alerts@chase.com>', date: '2024-01-15 14:22', size: '31 KB' },
		{ subject: 'Weekly digest from Medium', from: 'Medium <noreply@medium.com>', date: '2024-01-15 13:15', size: '123 KB' },
		{ subject: 'Your order is being prepared', from: 'DoorDash <no-reply@doordash.com>', date: '2024-01-15 12:45', size: '28 KB' },
		{ subject: 'New followers on Twitter', from: 'Twitter <notify@twitter.com>', date: '2024-01-15 11:30', size: '22 KB' },
		{ subject: 'Your prescription is ready', from: 'CVS Pharmacy <rx-alerts@cvs.com>', date: '2024-01-15 10:15', size: '19 KB' },
		{ subject: 'Meeting notes from yesterday', from: 'Zoom <noreply@zoom.us>', date: '2024-01-15 09:45', size: '34 KB' },
		{ subject: 'Your energy bill is available', from: 'Energy Company <billing@energy.com>', date: '2024-01-15 08:30', size: '67 KB' },
		{ subject: 'New podcast episode released', from: 'Spotify <podcast-updates@spotify.com>', date: '2024-01-15 07:22', size: '45 KB' },
		{ subject: 'Your GitHub actions workflow failed', from: 'GitHub <noreply@github.com>', date: '2024-01-15 06:15', size: '21 KB' },
		{ subject: 'Weekly sales report', from: 'Salesforce <reports@salesforce.com>', date: '2024-01-14 23:45', size: '156 KB' },
		{ subject: 'Your credit score updated', from: 'Credit Karma <updates@creditkarma.com>', date: '2024-01-14 22:30', size: '43 KB' },
		{ subject: 'New photos shared with you', from: 'Google Photos <noreply@photos.google.com>', date: '2024-01-14 21:15', size: '87 KB' },
		{ subject: 'Your Airbnb booking confirmation', from: 'Airbnb <noreply@airbnb.com>', date: '2024-01-14 20:22', size: '98 KB' },
		{ subject: 'Weekly newsletter from The Hustle', from: 'The Hustle <crew@thehustle.co>', date: '2024-01-14 19:45', size: '234 KB' },
		{ subject: 'Your investment portfolio summary', from: 'Robinhood <noreply@robinhood.com>', date: '2024-01-14 18:30', size: '76 KB' },
		{ subject: 'New comment on your LinkedIn post', from: 'LinkedIn <messages@linkedin.com>', date: '2024-01-14 17:15', size: '32 KB' },
		{ subject: 'Your weather forecast', from: 'Weather App <noreply@weather.com>', date: '2024-01-14 16:45', size: '15 KB' },
		{ subject: 'Sale ends tonight!', from: 'Best Buy <deals@bestbuy.com>', date: '2024-01-14 15:30', size: '189 KB' },
		{ subject: 'Your Slack digest', from: 'Slack <feedback@slack.com>', date: '2024-01-14 14:22', size: '45 KB' },
		{ subject: 'New video from your subscriptions', from: 'YouTube <noreply@youtube.com>', date: '2024-01-14 13:15', size: '67 KB' },
		{ subject: 'Your package has shipped', from: 'FedEx <trackingupdate@fedex.com>', date: '2024-01-14 12:45', size: '28 KB' },
		{ subject: 'Weekly coding challenge', from: 'LeetCode <noreply@leetcode.com>', date: '2024-01-14 11:30', size: '34 KB' },
		{ subject: 'Your calendar for tomorrow', from: 'Google Calendar <calendar-notification@google.com>', date: '2024-01-14 10:15', size: '19 KB' },
		{ subject: 'New article from your followed topics', from: 'Medium <noreply@medium.com>', date: '2024-01-14 09:45', size: '89 KB' },
		{ subject: 'Your monthly subscription receipt', from: 'Netflix <info@netflix.com>', date: '2024-01-14 08:30', size: '23 KB' },
		{ subject: 'Security update available', from: 'Apple <noreply@apple.com>', date: '2024-01-14 07:22', size: '41 KB' },
		{ subject: 'Your workout summary', from: 'Strava <hello@strava.com>', date: '2024-01-14 06:15', size: '56 KB' },
		{ subject: 'New connection suggestion', from: 'LinkedIn <invitations@linkedin.com>', date: '2024-01-13 23:45', size: '29 KB' },
		{ subject: 'Your order confirmation', from: 'Target <guestservices@target.com>', date: '2024-01-13 22:30', size: '48 KB' },
		{ subject: 'Weekly team update', from: 'Asana <noreply@asana.com>', date: '2024-01-13 21:15', size: '67 KB' },
		{ subject: 'Your travel itinerary', from: 'Expedia <noreply@expedia.com>', date: '2024-01-13 20:22', size: '134 KB' },
		{ subject: 'New job matches for you', from: 'Indeed <noreply@indeed.com>', date: '2024-01-13 19:45', size: '98 KB' },
		{ subject: 'Your tax documents are ready', from: 'TurboTax <noreply@turbotax.com>', date: '2024-01-13 18:30', size: '76 KB' },
		{ subject: 'Flash sale: Limited time offer', from: 'Amazon <promotions@amazon.com>', date: '2024-01-13 17:15', size: '156 KB' },
		{ subject: 'Your daily briefing', from: 'Google Assistant <noreply@google.com>', date: '2024-01-13 16:45', size: '32 KB' }
	];
</script>

<!-- Recent Emails -->
<div class="border rounded-lg bg-white">
	<div class="border-b p-4">
		<div class="flex items-center gap-3">
			<Mail class="h-5 w-5 text-black" />
			<h2 class="text-lg font-semibold text-black">Recent Emails</h2>
			<span class="text-sm text-gray-600">Last 50 imported</span>
		</div>
	</div>

	<!-- Table Header -->
	<div class="border-b bg-gray-50 p-4">
		<div class="grid grid-cols-12 gap-4 text-sm font-medium text-black">
			<div class="col-span-6">Subject</div>
			<div class="col-span-3">From</div>
			<div class="col-span-2">Date</div>
			<div class="col-span-1">Size</div>
		</div>
	</div>

	<!-- Table Body -->
	<div class="divide-y max-h-96 overflow-y-auto">
		{#each recentEmails as email}
			<div class="p-4 hover:bg-gray-50 transition-colors">
				<div class="grid grid-cols-12 gap-4 items-center text-sm">
					<div class="col-span-6">
						<div class="text-gray-900 font-medium truncate">{email.subject}</div>
					</div>
					<div class="col-span-3 text-gray-500 truncate">
						{email.from}
					</div>
					<div class="col-span-2 text-gray-500">
						{email.date}
					</div>
					<div class="col-span-1 text-gray-500">
						{email.size}
					</div>
				</div>
			</div>
		{/each}
	</div>
</div>