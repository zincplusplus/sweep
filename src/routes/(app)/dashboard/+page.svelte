<script lang="ts">
	import { Scan, Mail, Users, HardDrive, ChevronDown, ChevronUp, Search } from 'lucide-svelte';

	let isScanning = false;
	let scanProgress = 0;
	let isComplete = false;
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
		],
		'notifications@amazon.com': [
			{ subject: 'Your order has shipped', date: '2024-01-15', size: '45 KB', from: 'Amazon Orders<notifications@amazon.com>' },
			{ subject: 'Amazon Prime Video: New releases', date: '2024-01-14', size: '123 KB', from: 'Amazon Prime<notifications@amazon.com>' },
			{ subject: 'Your Amazon.com order', date: '2024-01-13', size: '32 KB', from: 'Amazon<notifications@amazon.com>' }
		],
		'security@google.com': [
			{ subject: 'Security alert for your Google Account', date: '2024-01-15', size: '28 KB', from: 'Google Security<security@google.com>' },
			{ subject: 'Unusual sign-in activity', date: '2024-01-14', size: '31 KB', from: 'Google Account<security@google.com>' }
		],
		'noreply@github.com': [
			{ subject: '[GitHub] Push to main branch', date: '2024-01-15', size: '15 KB', from: 'GitHub<noreply@github.com>' },
			{ subject: 'Pull request merged', date: '2024-01-14', size: '22 KB', from: 'GitHub Notifications<noreply@github.com>' }
		],
		'updates@linkedin.com': [
			{ subject: 'Weekly job alerts', date: '2024-01-15', size: '156 KB', from: 'LinkedIn Jobs<updates@linkedin.com>' },
			{ subject: 'Connection request accepted', date: '2024-01-14', size: '34 KB', from: 'LinkedIn<updates@linkedin.com>' }
		],
		'weekly@newsletter.com': [
			{ subject: 'Weekly tech newsletter', date: '2024-01-15', size: '234 KB', from: 'Tech Weekly<weekly@newsletter.com>' },
			{ subject: 'Special offer inside', date: '2024-01-12', size: '187 KB', from: 'Newsletter Promotions<weekly@newsletter.com>' }
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

	function startScan() {
		isScanning = true;
		scanProgress = 0;
		isComplete = false;

		const interval = setInterval(() => {
			scanProgress += Math.random() * 15;
			if (scanProgress >= 100) {
				scanProgress = 100;
				isScanning = false;
				isComplete = true;
				clearInterval(interval);
			}
		}, 200);
	}

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

<div class="min-h-screen bg-white p-6">
	<div class="mx-auto max-w-6xl space-y-6">
		<!-- Header -->
		<div class="border-b pb-6">
			<h1 class="text-3xl font-bold text-black">Gmail Inbox Cleanup</h1>
			<p class="text-gray-600 mt-2">Scan your inbox to identify and clean up unnecessary emails</p>
		</div>

		<!-- Scan Section -->
		<div class="border rounded-lg p-6 bg-white">
			<div class="flex items-center gap-4 mb-4">
				<div class="p-3 border rounded-lg">
					<Scan class="h-6 w-6 text-black" />
				</div>
				<div>
					<h2 class="text-xl font-semibold text-black">Scan Inbox</h2>
					<p class="text-gray-600 text-sm">Analyze your Gmail inbox for cleanup opportunities</p>
				</div>
			</div>

			{#if !isScanning && !isComplete}
				<button
					onclick={startScan}
					class="bg-black text-white px-6 py-3 rounded-lg hover:bg-gray-800 transition-colors font-medium"
				>
					Start Scan
				</button>
			{/if}

			{#if isScanning}
				<div class="space-y-3">
					<div class="flex items-center gap-3">
						<div class="animate-spin">
							<Scan class="h-5 w-5 text-black" />
						</div>
						<span class="text-black font-medium">Scanning inbox...</span>
						<span class="text-gray-600 text-sm">{Math.round(scanProgress)}%</span>
					</div>
					<div class="w-full bg-gray-200 rounded-full h-2">
						<div
							class="bg-black h-2 rounded-full transition-all duration-300"
							style="width: {scanProgress}%"
						></div>
					</div>
				</div>
			{/if}

			{#if isComplete}
				<div class="space-y-3">
					<div class="flex items-center gap-3 text-black">
						<div class="p-1 bg-black rounded-full">
							<svg class="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 20 20">
								<path
									fill-rule="evenodd"
									d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
									clip-rule="evenodd"
								/>
							</svg>
						</div>
						<span class="font-medium">Scan completed successfully</span>
					</div>
					<div class="text-sm text-gray-600">
						Found 888 emails from 47 unique senders using 104.4 MB of storage
					</div>
				</div>
			{/if}
		</div>

		{#if isComplete}
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
		{/if}
	</div>
</div>
