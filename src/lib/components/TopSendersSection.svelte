<script lang="ts">
	import { Mail, Users, HardDrive, ChevronDown, ChevronUp, Search } from 'lucide-svelte';

	let groupBy: 'domain' | 'individual' = 'domain';
	let sortBy: 'count' | 'size' = 'count';
	let sortDirection: 'asc' | 'desc' = 'desc';
	let isSearchExpanded = false;
	let searchTerm = '';
	let expandedSenders = new Set<string>();

	const mockEmails = {
		'amazon.com': [
			{ subject: 'Your order has shipped', date: '2024-01-15', size: '45 KB', from: 'Amazon<notifications@amazon.com>' },
			{ subject: 'Amazon Prime Video: New releases', date: '2024-01-14', size: '123 KB', from: 'Amazon Prime<digital@amazon.com>' },
			{ subject: 'Your Amazon.com order', date: '2024-01-13', size: '32 KB', from: 'Amazon Orders<orders@amazon.com>' },
			{ subject: 'Recommended for you', date: '2024-01-12', size: '89 KB', from: 'Amazon Recommendations<recs@amazon.com>' }
		],
		'google.com': [
			{ subject: 'Security alert for your Google Account', date: '2024-01-15', size: '28 KB', from: 'Google Security<security@google.com>' },
			{ subject: 'Google Drive storage notification', date: '2024-01-14', size: '41 KB', from: 'Google Drive<drive@google.com>' },
			{ subject: 'YouTube Premium trial ending', date: '2024-01-13', size: '67 KB', from: 'YouTube<youtube@google.com>' }
		],
		'github.com': [
			{ subject: '[GitHub] Push to main branch', date: '2024-01-15', size: '15 KB', from: 'GitHub<noreply@github.com>' },
			{ subject: 'Pull request merged', date: '2024-01-14', size: '22 KB', from: 'GitHub<noreply@github.com>' },
			{ subject: 'New issue opened', date: '2024-01-13', size: '18 KB', from: 'GitHub Notifications<noreply@github.com>' }
		],
		'linkedin.com': [
			{ subject: 'Weekly job alerts', date: '2024-01-15', size: '156 KB', from: 'LinkedIn Jobs<jobs@linkedin.com>' },
			{ subject: 'Connection request accepted', date: '2024-01-14', size: '34 KB', from: 'LinkedIn<updates@linkedin.com>' }
		],
		'newsletter.com': [
			{ subject: 'Weekly tech newsletter', date: '2024-01-15', size: '234 KB', from: 'Tech Weekly<weekly@newsletter.com>' },
			{ subject: 'Special offer inside', date: '2024-01-12', size: '187 KB', from: 'Newsletter Deals<promos@newsletter.com>' }
		]
	};

	const mockSendersDomain = [
		{ name: 'amazon.com', emailCount: 342, totalSize: '45.2 MB' },
		{ name: 'google.com', emailCount: 234, totalSize: '12.8 MB' },
		{ name: 'github.com', emailCount: 156, totalSize: '8.4 MB' },
		{ name: 'linkedin.com', emailCount: 89, totalSize: '15.7 MB' },
		{ name: 'newsletter.com', emailCount: 67, totalSize: '22.3 MB' }
	];

	// Function to extract display name from "Display Name<email@domain.com>" format
	function getDisplayName(fromField: string): string {
		const match = fromField.match(/^(.+?)<(.+?)>$/);
		if (match) {
			return match[1].trim(); // Return display name part
		}
		return fromField; // Return as-is if no display name
	}

	// Group individual emails by display name when possible
	function getGroupedIndividualSenders() {
		const grouped = new Map();
		
		// Process all emails to group by display name
		Object.entries(mockEmails).forEach(([key, emails]) => {
			emails.forEach(email => {
				if (email.from) {
					const displayName = getDisplayName(email.from);
					const emailMatch = email.from.match(/<(.+?)>$/);
					const actualEmail = emailMatch ? emailMatch[1] : email.from;
					
					if (!grouped.has(displayName)) {
						grouped.set(displayName, {
							name: displayName,
							actualEmail: actualEmail,
							emailCount: 0,
							totalSize: 0,
							emails: []
						});
					}
					
					const group = grouped.get(displayName);
					group.emailCount += 1;
					group.totalSize += parseFloat(email.size) || 0;
					group.emails.push({ ...email, originalKey: key });
				}
			});
		});

		// Convert sizes back to readable format and create sender objects
		return Array.from(grouped.values()).map(group => ({
			name: group.name,
			actualEmail: group.actualEmail,
			emailCount: group.emailCount,
			totalSize: group.totalSize > 1000 ? `${(group.totalSize/1000).toFixed(1)} MB` : `${group.totalSize.toFixed(0)} KB`
		}));
	}

	const mockSendersIndividual = getGroupedIndividualSenders();

	$: currentSenders = groupBy === 'domain' ? mockSendersDomain : mockSendersIndividual;
	$: filteredSenders = currentSenders.map(sender => {
		const lowerSearchTerm = searchTerm.toLowerCase();
		
		// For individual grouping (by display name), we need to find all matching emails
		let senderEmails = [];
		if (groupBy === 'individual') {
			// Find all emails that match this display name
			Object.values(mockEmails).forEach(emails => {
				emails.forEach(email => {
					if (email.from && getDisplayName(email.from) === sender.name) {
						senderEmails.push(email);
					}
				});
			});
		} else {
			// For domain grouping, use the original logic
			senderEmails = mockEmails[sender.name] || [];
		}
		
		// If no search term, return sender with all emails
		if (!searchTerm.trim()) {
			return { ...sender, filteredEmails: senderEmails };
		}
		
		// Check if sender name matches
		const senderMatches = sender.name.toLowerCase().includes(lowerSearchTerm);
		
		// Filter emails by subject
		const matchingEmails = senderEmails.filter(email => 
			email.subject.toLowerCase().includes(lowerSearchTerm)
		);
		
		// Include sender if either sender name matches OR has matching emails
		if (senderMatches || matchingEmails.length > 0) {
			return {
				...sender,
				filteredEmails: senderMatches ? senderEmails : matchingEmails
			};
		}
		
		return null;
	}).filter(sender => sender !== null);
	$: sortedSenders = [...filteredSenders].sort((a, b) => {
		let aVal, bVal;
		if (sortBy === 'count') {
			aVal = a.emailCount;
			bVal = b.emailCount;
		} else {
			aVal = parseFloat(a.totalSize);
			bVal = parseFloat(b.totalSize);
		}
		return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
	});

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

	<!-- Table Body -->
	<div class="divide-y">
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
							{sender.totalSize}
						</div>
					</div>
				</div>
				
				<!-- Expanded Emails -->
				{#if expandedSenders.has(sender.name) && sender.filteredEmails}
					<div class="bg-gray-50 border-t">
						{#each sender.filteredEmails as email}
							<div class="px-4 py-3 ml-6 border-b border-gray-200 last:border-b-0">
								<div class="grid grid-cols-12 gap-4 items-center text-sm">
									<div class="col-span-6">
										<div class="text-gray-900 font-medium truncate">{email.subject}</div>
										{#if email.from}
											<div class="text-gray-500 text-xs mt-1">{email.from}</div>
										{/if}
									</div>
									<div class="col-span-3 text-gray-500">
										{email.date}
									</div>
									<div class="col-span-3 text-gray-500">
										{email.size}
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>