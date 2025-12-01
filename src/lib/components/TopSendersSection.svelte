<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Mail, Users, HardDrive, ChevronDown, ChevronUp, Search, ExternalLink } from 'lucide-svelte';
	import { emailDB, type SenderStats } from '$lib/emaildb';

	let groupBy: 'domain' | 'individual' = 'domain';
	let sortBy: 'count' | 'size' = 'size';
	let sortDirection: 'asc' | 'desc' = 'desc';
	let isSearchExpanded = false;
	let searchTerm = '';
	let expandedSenders = new Set<string>();

	let senderStats: SenderStats[] = [];
	let isInitialLoading = true;
	let refreshInterval: number;

	async function loadSenderData(isInitial = false) {
		try {
			if (isInitial) {
				isInitialLoading = true;
			}

			if (groupBy === 'domain') {
				senderStats = await emailDB.getSendersByDomain();
			} else {
				senderStats = await emailDB.getSendersByIndividual();
			}
		} catch (error) {
			console.error('Error loading sender data:', error);
			senderStats = [];
		} finally {
			if (isInitial) {
				isInitialLoading = false;
			}
		}
	}

	// Auto-refresh every 5 seconds
	onMount(async () => {
		await loadSenderData(true); // Initial load with loading state
		refreshInterval = setInterval(() => loadSenderData(false), 5000); // Background refreshes
	});

	onDestroy(() => {
		if (refreshInterval) {
			clearInterval(refreshInterval);
		}
	});

	// Reload data when groupBy changes
	$: if (groupBy) {
		loadSenderData(true); // Show loading when user changes groupBy
	}


	// Use real data instead of mock data
	$: filteredSenders = senderStats.map(sender => {
		const lowerSearchTerm = searchTerm.toLowerCase();

		let emailsToShow = sender.sampleEmails;

		// Filter emails by search term if provided
		if (searchTerm.trim()) {
			const senderMatches = sender.name.toLowerCase().includes(lowerSearchTerm);

			if (!senderMatches) {
				// If sender name doesn't match, filter emails by subject
				const matchingEmails = sender.sampleEmails.filter(email =>
					email.subject?.toLowerCase().includes(lowerSearchTerm)
				);

				if (matchingEmails.length === 0) {
					return null; // No matches, exclude this sender
				}

				emailsToShow = matchingEmails;
			}
		}

		// Sort emails by current sort criteria
		const sortedEmails = [...emailsToShow].sort((a, b) => {
			let aVal, bVal;
			if (sortBy === 'count') {
				// For email count, we can sort by date as a proxy (newer emails first when desc)
				aVal = new Date(a.date || 0).getTime();
				bVal = new Date(b.date || 0).getTime();
			} else {
				// Sort by email size
				aVal = a.sizeEstimate || 0;
				bVal = b.sizeEstimate || 0;
			}
			return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
		});

		// Recalculate sender stats based on filtered emails
		const filteredEmailCount = sortedEmails.length;
		const filteredTotalSize = sortedEmails.reduce((sum, email) => sum + (email.sizeEstimate || 0), 0);

		// Format the filtered size
		let filteredSizeFormatted;
		const megabytes = filteredTotalSize / (1024 * 1024);
		if (megabytes >= 1024) {
			filteredSizeFormatted = `${(megabytes / 1024).toFixed(1)} GB`;
		} else if (megabytes >= 0.1) {
			filteredSizeFormatted = `${megabytes.toFixed(1)} MB`;
		} else {
			filteredSizeFormatted = `${(filteredTotalSize / 1024).toFixed(1)} KB`;
		}

		return {
			...sender,
			filteredEmails: sortedEmails,
			// Override stats with filtered values
			emailCount: filteredEmailCount,
			totalSize: filteredTotalSize,
			totalSizeFormatted: filteredSizeFormatted
		};
	}).filter(sender => sender !== null);

	$: sortedSenders = [...filteredSenders].sort((a, b) => {
		let aVal, bVal;
		if (sortBy === 'count') {
			aVal = a.emailCount;
			bVal = b.emailCount;
		} else {
			aVal = a.totalSize; // Use raw bytes for accurate sorting
			bVal = b.totalSize;
		}
		return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
	});

	// Calculate summary stats for currently displayed senders
	$: summaryStats = (() => {
		const totalSenders = sortedSenders.length;
		const totalEmails = sortedSenders.reduce((sum, sender) => sum + sender.emailCount, 0);
		const totalBytes = sortedSenders.reduce((sum, sender) => sum + sender.totalSize, 0);

		// Format total size
		let totalSizeFormatted;
		const megabytes = totalBytes / (1024 * 1024);
		if (megabytes >= 1024) {
			totalSizeFormatted = `${(megabytes / 1024).toFixed(1)} GB`;
		} else {
			totalSizeFormatted = `${megabytes.toFixed(1)} MB`;
		}

		return {
			totalSenders,
			totalEmails,
			totalSizeFormatted
		};
	})();

	function toggleSort(field: 'count' | 'size') {
		if (sortBy === field) {
			sortDirection = sortDirection === 'desc' ? 'asc' : 'desc';
		} else {
			sortBy = field;
			sortDirection = 'desc';
		}
	}

	function toggleSearch() {
		isSearchExpanded = !isSearchExpanded;
		if (!isSearchExpanded) {
			searchTerm = '';
		}
	}

	function toggleSender(senderName: string) {
		if (expandedSenders.has(senderName)) {
			expandedSenders.delete(senderName);
		} else {
			expandedSenders.add(senderName);
		}
		expandedSenders = expandedSenders; // trigger reactivity
	}

	function openInGmail(email: any) {
		const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${email.id}`;
		window.open(gmailUrl, '_blank');
	}
</script>

<!-- Senders List -->
<div class="border rounded-lg bg-white">
	<div class="border-b p-4">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-3">
				<Users class="h-5 w-5 text-black" />
				<h2 class="text-lg font-semibold text-black">Top Senders</h2>
			</div>
			<div class="flex items-center gap-3">
				<div class="flex items-center">
					{#if !isSearchExpanded}
						<button
							onclick={toggleSearch}
							class="border rounded-lg p-2 text-sm bg-white hover:bg-gray-50 transition-colors"
						>
							<Search class="h-4 w-4" />
						</button>
					{:else}
						<div class="flex items-center border rounded-lg bg-white">
							<button onclick={toggleSearch} class="p-2">
								<Search class="h-4 w-4" />
							</button>
							<input
								bind:value={searchTerm}
								placeholder="Search senders..."
								class="px-2 py-2 text-sm outline-none bg-transparent"
								style="width: 160px;"
							/>
						</div>
					{/if}
				</div>
				<select
					bind:value={groupBy}
					class="border rounded-lg px-3 py-2 text-sm bg-white hover:bg-gray-50 transition-colors"
				>
					<option value="domain">Group by domain</option>
					<option value="individual">Group by address</option>
				</select>
				<select
					bind:value={sortBy}
					class="border rounded-lg px-3 py-2 text-sm bg-white hover:bg-gray-50 transition-colors"
				>
					<option value="count">Sort by count</option>
					<option value="size">Sort by size</option>
				</select>
			</div>
		</div>
	</div>

	<!-- Table Header -->
	<div class="border-b bg-gray-50 p-4">
		<div class="grid grid-cols-12 gap-4 text-sm font-medium text-black">
			<div class="col-span-6">
				{groupBy === 'domain' ? 'Domain' : 'Email Address'}
			</div>
			<div class="col-span-3">
				<button
					onclick={() => toggleSort('count')}
					class="flex items-center gap-1 hover:text-gray-700 transition-colors"
				>
					<Mail class="h-4 w-4" />
					Email Count
					{#if sortBy === 'count'}
						{#if sortDirection === 'desc'}
							<ChevronDown class="h-4 w-4" />
						{:else}
							<ChevronUp class="h-4 w-4" />
						{/if}
					{/if}
				</button>
			</div>
			<div class="col-span-3">
				<button
					onclick={() => toggleSort('size')}
					class="flex items-center gap-1 hover:text-gray-700 transition-colors"
				>
					<HardDrive class="h-4 w-4" />
					Total Size
					{#if sortBy === 'size'}
						{#if sortDirection === 'desc'}
							<ChevronDown class="h-4 w-4" />
						{:else}
							<ChevronUp class="h-4 w-4" />
						{/if}
					{/if}
				</button>
			</div>
		</div>
	</div>

	<!-- Summary Stats -->
	{#if !isInitialLoading && sortedSenders.length > 0}
		<div class="bg-blue-50 border-b px-4 py-3">
			<div class="grid grid-cols-12 gap-4 text-sm">
				<div class="col-span-6 text-blue-800">
					<span class="font-medium">{summaryStats.totalSenders.toLocaleString()}</span>
					{groupBy === 'domain' ? 'domains' : 'addresses'} shown
				</div>
				<div class="col-span-3 text-blue-800">
					<span class="font-medium">{summaryStats.totalEmails.toLocaleString()}</span>
					emails total
				</div>
				<div class="col-span-3 text-blue-800">
					<span class="font-medium">{summaryStats.totalSizeFormatted}</span>
					total size
				</div>
			</div>
		</div>
	{/if}

	<!-- Table Body -->
	<div class="divide-y">
		{#if isInitialLoading}
			<div class="p-8 text-center">
				<div class="text-gray-500">Loading sender data...</div>
			</div>
		{:else if sortedSenders.length === 0}
			<div class="p-8 text-center">
				<div class="text-gray-500">No email data available yet. Complete the scan to see sender statistics.</div>
			</div>
		{:else}
			{#each sortedSenders as sender}
			<div>
				<!-- Sender Row -->
				<div class="p-4 hover:bg-gray-50 transition-colors">
					<div class="grid grid-cols-12 gap-4 items-center">
						<div class="col-span-6">
							<button
								onclick={() => toggleSender(sender.name)}
								class="flex items-center gap-2 text-left w-full group"
							>
								<div class="transition-transform duration-200 {expandedSenders.has(sender.name) ? 'rotate-90' : ''}">
									<ChevronDown class="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
								</div>
								<div class="font-medium text-black">{sender.name}</div>
							</button>
						</div>
						<div class="col-span-3 text-gray-600">
							{sender.emailCount.toLocaleString()} emails
						</div>
						<div class="col-span-3 text-gray-600">
							{sender.totalSizeFormatted}
						</div>
					</div>
				</div>

				<!-- Expanded Emails -->
				{#if expandedSenders.has(sender.name) && sender.filteredEmails}
					<div class="bg-gray-50 border-t">
						{#each sender.filteredEmails as email}
							<div
								class="px-4 py-3 ml-6 border-b border-gray-200 last:border-b-0 cursor-pointer hover:bg-gray-100 transition-colors"
								onclick={() => openInGmail(email)}
								title="Click to open in Gmail"
							>
								<div class="grid grid-cols-12 gap-4 items-center text-sm">
									<div class="col-span-6">
										<div class="flex items-center gap-2">
											<div class="text-gray-900 font-medium truncate">{email.subject}</div>
											<ExternalLink class="h-3 w-3 text-gray-400 flex-shrink-0" />
										</div>
										{#if email.from}
											<div class="text-gray-500 text-xs mt-1">{email.from}</div>
										{/if}
									</div>
									<div class="col-span-3 text-gray-500">
										{email.date || 'Unknown date'}
									</div>
									<div class="col-span-3 text-gray-500">
										{email.sizeEstimate ? `${(email.sizeEstimate / 1024).toFixed(1)} KB` : 'Unknown size'}
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
			{/each}
		{/if}
	</div>
</div>
