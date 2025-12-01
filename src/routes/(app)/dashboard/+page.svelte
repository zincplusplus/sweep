<script lang="ts">
	import { onMount } from 'svelte';
	import ScanSection from '$lib/components/ScanSection.svelte';
	import StatisticsSection from '$lib/components/StatisticsSection.svelte';
	// import RecentEmailsSection from '$lib/components/RecentEmailsSection.svelte';
	import TopSendersSection from '$lib/components/TopSendersSection.svelte';
	import { emailDB, type EmailRecord } from '$lib/emaildb';
	import { Mail, HardDrive, ChevronDown, ChevronRight } from 'lucide-svelte';
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import { Badge } from '$lib/components/ui/badge';

	// let isPaused = true;
	// let isComplete = false;
	let emails: EmailRecord[] = [];
	let allEmails: EmailRecord[] = []; // Store all emails for virtual scrolling
	let filteredEmails: EmailRecord[] = []; // Currently filtered emails for display
	let groupedEmails: any[] = []; // Emails grouped by sender for virtual scrolling
	let expandedGroups = new Set<string>(); // Track which groups are expanded
	let selectedEmails = new Set<string>(); // Track selected individual emails
	let selectedGroups = new Set<string>(); // Track groups with all emails selected
	// Track emails queued for review - loaded from IndexedDB
	let reviewQueue = new Set<string>(); // Will be loaded from IndexedDB
	let reviewQueueLoaded = false; // Track if review queue has been loaded
	let loading = true;

	// Migrate localStorage review queue to IndexedDB (one-time migration)
	async function migrateLocalStorageToIndexedDB() {
		try {
			const storedLocalStorage = localStorage.getItem('sweep.reviewQueue');
			if (storedLocalStorage) {
				const emailIds = JSON.parse(storedLocalStorage);
				if (Array.isArray(emailIds) && emailIds.length > 0) {
					console.log('Migrating', emailIds.length, 'emails from localStorage to IndexedDB');
					const { emailDB } = await import('$lib/emaildb');
					await emailDB.setReviewQueue(emailIds);
					// Remove from localStorage after successful migration
					localStorage.removeItem('sweep.reviewQueue');
					console.log('Migration completed, localStorage cleaned up');
					return emailIds;
				}
			}
		} catch (error) {
			console.warn('Failed to migrate localStorage data:', error);
		}
		return null;
	}

	// Load review queue from IndexedDB
	async function loadReviewQueueFromDB() {
		try {
			const { emailDB } = await import('$lib/emaildb');

			// First, try to migrate any existing localStorage data
			const migratedData = await migrateLocalStorageToIndexedDB();

			// Then load from IndexedDB
			const emailIds = migratedData || await emailDB.getReviewQueue();
			reviewQueue = new Set(emailIds);
			reviewQueueLoaded = true;
			console.log('Loaded review queue from IndexedDB:', emailIds.length, 'emails');
		} catch (error) {
			console.warn('Failed to load review queue from IndexedDB:', error);
			reviewQueue = new Set();
			reviewQueueLoaded = true;
		}
	}

	// Save review queue to IndexedDB
	async function saveReviewQueueToDB() {
		try {
			const { emailDB } = await import('$lib/emaildb');
			await emailDB.setReviewQueue(Array.from(reviewQueue));
		} catch (error) {
			console.warn('Failed to save review queue to IndexedDB:', error);
		}
	}
	let smartFiltersData: any[] = [];
	let filterResults: any = {}; // Store all filter calculation results
	let totalEmailCount = 0;
	let totalSizeMB = 0;
	let currentView = 'Inbox'; // Track which section/rule is currently being viewed
	let currentFilter = 'inbox'; // Track current filter selection

	// Calculate percentages of emails and size shown vs total
	$: emailPercentage = totalEmailCount > 0 ? ((filteredEmails.length / totalEmailCount) * 100) : 0;
	$: sizePercentage = totalSizeMB > 0 ? ((filteredEmails.reduce((sum, email) => sum + (email.sizeEstimate || 0), 0) / (1024 * 1024)) / totalSizeMB * 100) : 0;

	// Calculate sidebar display values excluding review queue (only when loaded)
	$: inboxSizeMB = reviewQueueLoaded ? allEmails.filter(email => !reviewQueue.has(email.id)).reduce((sum, email) => sum + (email.sizeEstimate || 0), 0) / (1024 * 1024) : 0;

	// Calculate review queue size (only when loaded)
	$: reviewQueueSizeMB = reviewQueueLoaded ? allEmails.filter(email => reviewQueue.has(email.id)).reduce((sum, email) => sum + (email.sizeEstimate || 0), 0) / (1024 * 1024) : 0;

	// Calculate filter sizes excluding review queue (only when loaded)
	$: filterSizesExcludingReview = (() => {
		if (!reviewQueueLoaded) return {};

		const result: Record<string, number> = {};

		// Calculate for each filter
		Object.entries(filterResults).forEach(([filterKey, filterData]) => {
			if (filterData?.emails) {
				const filteredEmails = filterData.emails.filter(email => !reviewQueue.has(email.id));
				result[filterKey] = filteredEmails.reduce((sum, email) => sum + (email.sizeEstimate || 0), 0) / (1024 * 1024);
			}
		});

		return result;
	})();

	// Create reactive sidebar filters data that updates when review queue changes (only when loaded)
	$: sidebarFiltersData = (() => {
		if (!reviewQueueLoaded) {
			return smartFiltersData.length > 0 ? smartFiltersData : smartFilters;
		}

		return (smartFiltersData.length > 0 ? smartFiltersData : smartFilters).map(filter => {
			// Map filter IDs to their keys in filterSizesExcludingReview
			const filterKeyMap: Record<string, string> = {
				'low-engagement': 'lowEngagement',
				'old-news': 'oldNews',
				'storage-hogs': 'storageHogs',
				'frequent-senders': 'frequentSenders',
				'dormant-senders': 'dormantSenders',
				'spammy-tlds': 'spammyTLDs',
				'social-media': 'socialMedia',
				'longtail': 'longtail',
				'protected': 'protected'
			};

			const filterKey = filterKeyMap[filter.id];
			const adjustedSize = filterKey && filterSizesExcludingReview[filterKey] !== undefined
				? filterSizesExcludingReview[filterKey]
				: filter.totalSize;

			return {
				...filter,
				displaySize: adjustedSize
			};
		});
	})();

	// Calculate selected emails summary
	$: selectedEmailsData = (() => {
		const selectedEmailRecords = filteredEmails.filter(email => selectedEmails.has(email.id));
		const selectedTotalSize = selectedEmailRecords.reduce((sum, email) => sum + (email.sizeEstimate || 0), 0);
		const selectedTotalSizeMB = selectedTotalSize / (1024 * 1024);

		return {
			count: selectedEmailRecords.length,
			totalSizeMB: selectedTotalSizeMB,
			emailPercentage: totalEmailCount > 0 ? (selectedEmailRecords.length / totalEmailCount * 100) : 0,
			sizePercentage: totalSizeMB > 0 ? (selectedTotalSizeMB / totalSizeMB * 100) : 0
		};
	})();

	// Debug logging for percentage calculations
	$: if (filteredEmails.length > 0) {
		console.log('=== Percentage Debug ===');
		console.log('Current filter:', currentFilter);
		console.log('Current view:', currentView);
		console.log('Filtered emails count:', filteredEmails.length);
		console.log('Total email count:', totalEmailCount);
		console.log('Email percentage:', emailPercentage.toFixed(1) + '%');

		const filteredSizeMB = filteredEmails.reduce((sum, email) => sum + (email.sizeEstimate || 0), 0) / (1024 * 1024);
		console.log('Filtered size MB:', filteredSizeMB.toFixed(2));
		console.log('Total size MB:', totalSizeMB.toFixed(2));
		console.log('Size percentage:', sizePercentage.toFixed(1) + '%');
		console.log('========================');
	}

	// Virtual scrolling setup
	let parentElement: HTMLElement;
	let virtualizer: any;

	// Group emails by sender and create virtual list items (reactive to both filteredEmails and expandedGroups)
	$: {
		if (filteredEmails.length > 0) {
			groupedEmails = groupEmailsBySender(filteredEmails);
			console.log('Grouped emails:', groupedEmails.length, 'items');
			console.log('Expanded groups:', Array.from(expandedGroups));
		} else {
			// Clear grouped emails when no filtered emails remain
			groupedEmails = [];
		}
		// Reference expandedGroups to make this reactive statement depend on it
		expandedGroups.size;
	}

	// Create virtualizer when grouped emails change
	$: if (parentElement && groupedEmails.length > 0) {
		virtualizer = createVirtualizer({
			count: groupedEmails.length,
			getScrollElement: () => parentElement,
			estimateSize: () => 48, // Fixed height for all rows (p-4 = 32px + text ~24px)
			overscan: 5, // Render 5 extra items outside viewport
		});
	}

	// Filter switching function
	function switchFilter(filterId: string, filterName: string) {
		currentFilter = filterId;
		currentView = filterName;

		switch(filterId) {
			case 'inbox':
				filteredEmails = allEmails.filter(email => !reviewQueue.has(email.id));
				break;
			case 'low-engagement':
				filteredEmails = (filterResults.lowEngagement?.emails || []).filter(email => !reviewQueue.has(email.id));
				break;
			case 'old-news':
				filteredEmails = (filterResults.oldNews?.emails || []).filter(email => !reviewQueue.has(email.id));
				break;
			case 'storage-hogs':
				filteredEmails = (filterResults.storageHogs?.emails || []).filter(email => !reviewQueue.has(email.id));
				break;
			case 'frequent-senders':
				filteredEmails = (filterResults.frequentSenders?.emails || []).filter(email => !reviewQueue.has(email.id));
				break;
			case 'dormant-senders':
				filteredEmails = (filterResults.dormantSenders?.emails || []).filter(email => !reviewQueue.has(email.id));
				break;
			case 'spammy-tlds':
				filteredEmails = (filterResults.spammyTLDs?.emails || []).filter(email => !reviewQueue.has(email.id));
				break;
			case 'social-media':
				filteredEmails = (filterResults.socialMedia?.emails || []).filter(email => !reviewQueue.has(email.id));
				break;
			case 'longtail':
				filteredEmails = (filterResults.longtail?.emails || []).filter(email => !reviewQueue.has(email.id));
				break;
			case 'protected':
				filteredEmails = (filterResults.protected?.emails || []).filter(email => !reviewQueue.has(email.id));
				break;
			case 'review':
				filteredEmails = allEmails.filter(email => reviewQueue.has(email.id));
				break;
			default:
				filteredEmails = allEmails.filter(email => !reviewQueue.has(email.id));
		}
	}

	// Protected list configuration - this would come from user settings in a real app
	const protectedSenders = [
		// Example protected senders - in a real app, this would be user-configurable
		'family@gmail.com',
		'boss@company.com',
		'important@service.com'
	];

	const protectedDomains = [
		// Example protected domains - in a real app, this would be user-configurable
		'yourcompany.com',
		'bank.com',
		'healthcare.org'
	];

	// Protected individual email IDs - in a real app, this would be user-configurable
	const protectedEmailIds = new Set([
		// Example: 'gmail-message-id-123'
	]);

	// Smart filter dummy data - will be replaced with real calculations
	const smartFilters = [
		{
			id: 'low-engagement',
			title: '🚧 Low Engagement',
			description: '20+ emails, <20% open rate, no attachments',
			emailCount: 1247,
			totalSize: 89.3,
			color: 'bg-red-50 border-red-200 text-red-700'
		},
		{
			id: 'old-news',
			title: '🚧 Old News',
			description: 'Newsletter emails older than 6 months',
			emailCount: 892,
			totalSize: 156.8,
			color: 'bg-orange-50 border-orange-200 text-orange-700'
		},
		{
			id: 'storage-hogs',
			title: '🚧 Storage Hogs',
			description: 'Senders consuming the most storage space',
			emailCount: 456,
			totalSize: 2348.9,
			color: 'bg-purple-50 border-purple-200 text-purple-700'
		},
		{
			id: 'frequent-senders',
			title: '🚧 Frequent Senders',
			description: 'Senders with highest email volume',
			emailCount: 2134,
			totalSize: 445.2,
			color: 'bg-blue-50 border-blue-200 text-blue-700'
		},
		{
			id: 'dormant-senders',
			title: '🚧 Dormant Senders',
			description: 'Last email from sender was 2+ years ago',
			emailCount: 334,
			totalSize: 78.5,
			color: 'bg-gray-50 border-gray-200 text-gray-700'
		},
		{
			id: 'spammy-tlds',
			title: '🚧 Spammy TLDs',
			description: 'Emails from suspicious domain extensions',
			emailCount: 123,
			totalSize: 23.7,
			color: 'bg-yellow-50 border-yellow-200 text-yellow-700'
		},
		{
			id: 'social-media',
			title: '🚧 Social Media',
			description: 'Notifications from social platforms',
			emailCount: 567,
			totalSize: 67.4,
			color: 'bg-green-50 border-green-200 text-green-700'
		},
		{
			id: 'longtail',
			title: '🚧 Uncategorized',
			description: 'Emails not caught by other rules',
			emailCount: 2890,
			totalSize: 234.6,
			color: 'bg-indigo-50 border-indigo-200 text-indigo-700'
		},
		{
			id: 'protected',
			title: '🚧 Protected',
			description: 'User-defined whitelist of important emails',
			emailCount: 45,
			totalSize: 12.3,
			color: 'bg-emerald-50 border-emerald-200 text-emerald-700'
		}
	];

	// Group emails by sender for virtual scrolling
	function groupEmailsBySender(emails: EmailRecord[]) {
		const groups = new Map<string, EmailRecord[]>();

		// Group emails by sender
		emails.forEach(email => {
			const senderEmail = extractEmailAddress(email.from);
			if (!senderEmail) return;

			if (!groups.has(senderEmail)) {
				groups.set(senderEmail, []);
			}
			groups.get(senderEmail)!.push(email);
		});

		// Sort groups by total size (descending)
		const sortedGroups = Array.from(groups.entries())
			.map(([sender, senderEmails]) => ({
				sender,
				emails: senderEmails,
				totalSize: senderEmails.reduce((sum, email) => sum + (email.sizeEstimate || 0), 0)
			}))
			.sort((a, b) => b.totalSize - a.totalSize);

		// Convert to flat list for virtual scrolling
		const virtualItems: any[] = [];

		for (const group of sortedGroups) {
			// Add group header
			virtualItems.push({
				type: 'group',
				sender: group.sender,
				emailCount: group.emails.length,
				totalSize: group.totalSize,
				emails: group.emails
			});

			// Add individual emails if group is expanded (sorted by size descending)
			if (expandedGroups.has(group.sender)) {
				const sortedEmails = [...group.emails].sort((a, b) =>
					(b.sizeEstimate || 0) - (a.sizeEstimate || 0)
				);

				sortedEmails.forEach(email => {
					virtualItems.push({
						type: 'email',
						email,
						sender: group.sender
					});
				});
			}
		}

		return virtualItems;
	}

	// Toggle group expansion with scroll preservation
	function toggleGroup(sender: string) {
		if (!parentElement) return;

		// Store current scroll state before toggling
		const currentScrollTop = parentElement.scrollTop;
		const clickedGroupIndex = groupedEmails.findIndex(item =>
			item.type === 'group' && item.sender === sender
		);

		// Toggle the group state
		const wasExpanded = expandedGroups.has(sender);
		if (wasExpanded) {
			expandedGroups.delete(sender);
		} else {
			expandedGroups.add(sender);
		}
		expandedGroups = expandedGroups; // Trigger reactivity

		// Wait a bit for the virtual list to recalculate, then adjust scroll
		setTimeout(() => {
			if (!parentElement || !virtualizer) return;

			// Find the group header position after the change
			const newGroupIndex = groupedEmails.findIndex(item =>
				item.type === 'group' && item.sender === sender
			);

			if (newGroupIndex !== -1) {
				if (wasExpanded) {
					// COLLAPSING: Try to maintain the exact scroll position
					// Calculate how much content was removed
					const collapsedGroup = groupedEmails.find(item =>
						item.type === 'group' && item.sender === sender
					);

					if (collapsedGroup) {
						// Calculate the new position where the group header should be
						const newGroupHeaderPosition = newGroupIndex * 48;

						// Check if we can maintain current scroll position
						const totalContentHeight = groupedEmails.length * 48;
						const viewportHeight = parentElement.clientHeight;
						const maxScrollTop = Math.max(0, totalContentHeight - viewportHeight);

						// If current scroll position is valid after collapse, keep it
						if (currentScrollTop <= maxScrollTop) {
							// Keep the exact same scroll position
							parentElement.scrollTo({
								top: currentScrollTop,
								behavior: 'instant'
							});
						} else {
							// If current position would be too far down, scroll to show the group header
							parentElement.scrollTo({
								top: Math.max(0, newGroupHeaderPosition - 48),
								behavior: 'smooth'
							});
						}
					}
				} else {
					// EXPANDING: Try to keep the group header visible
					const targetScrollTop = newGroupIndex * 48;

					// Only adjust scroll if it would help keep the group in view
					if (Math.abs(currentScrollTop - targetScrollTop) > 48) {
						parentElement.scrollTo({
							top: Math.max(0, targetScrollTop - 48),
							behavior: 'smooth'
						});
					}
				}
			}
		}, 16); // One frame delay to let virtual scroller update
	}

	// Toggle selection of entire group
	function toggleGroupSelection(sender: string, emails: EmailRecord[]) {
		const allSelected = emails.every(email => selectedEmails.has(email.id));

		if (allSelected) {
			// Unselect all emails in group
			emails.forEach(email => selectedEmails.delete(email.id));
			selectedGroups.delete(sender);
		} else {
			// Select all emails in group
			emails.forEach(email => selectedEmails.add(email.id));
			selectedGroups.add(sender);
		}

		selectedEmails = selectedEmails; // Trigger reactivity
		selectedGroups = selectedGroups;
	}

	// Toggle selection of individual email
	function toggleEmailSelection(emailId: string, sender: string) {
		if (selectedEmails.has(emailId)) {
			selectedEmails.delete(emailId);
		} else {
			selectedEmails.add(emailId);
		}

		// Check if all emails in group are now selected
		const groupEmails = groupedEmails.find(item => item.type === 'group' && item.sender === sender)?.emails || [];
		const allSelected = groupEmails.every(email => selectedEmails.has(email.id));

		if (allSelected) {
			selectedGroups.add(sender);
		} else {
			selectedGroups.delete(sender);
		}

		selectedEmails = selectedEmails; // Trigger reactivity
		selectedGroups = selectedGroups;
	}

	// Check if group is partially selected
	function isGroupPartiallySelected(sender: string, emails: EmailRecord[]): boolean {
		const selectedCount = emails.filter(email => selectedEmails.has(email.id)).length;
		return selectedCount > 0 && selectedCount < emails.length;
	}

	// Add selected emails to review queue
	async function addToReviewQueue() {
		if (selectedEmailsData.count === 0) return;

		const emailIdsToReview = Array.from(selectedEmails);
		console.log(`Adding ${emailIdsToReview.length} emails to review queue`);

		// Add to review queue
		emailIdsToReview.forEach(id => reviewQueue.add(id));
		reviewQueue = reviewQueue;
		await saveReviewQueueToDB();

		// Clear selection after adding to review
		selectedEmails.clear();
		selectedGroups.clear();
		selectedEmails = selectedEmails;
		selectedGroups = selectedGroups;

		// Clean up expanded groups that no longer have emails
		const remainingEmails = allEmails.filter(email => !reviewQueue.has(email.id));
		const remainingSenders = new Set(remainingEmails.map(email => extractEmailAddress(email.from)).filter(Boolean));

		// Remove expanded groups for senders that no longer have emails
		for (const expandedSender of Array.from(expandedGroups)) {
			if (!remainingSenders.has(expandedSender)) {
				expandedGroups.delete(expandedSender);
			}
		}
		expandedGroups = expandedGroups;

		// Refresh the current view to remove emails from display
		switchFilter(currentFilter, currentView);
	}

	// Remove selected emails from review queue (put them back)
	async function putBackFromReview() {
		if (selectedEmailsData.count === 0) return;

		const emailIdsToRestore = Array.from(selectedEmails);
		console.log(`Putting back ${emailIdsToRestore.length} emails from review queue`);

		// Remove from review queue
		emailIdsToRestore.forEach(id => reviewQueue.delete(id));
		reviewQueue = reviewQueue;
		await saveReviewQueueToDB();

		// Clear selection after putting back
		selectedEmails.clear();
		selectedGroups.clear();
		selectedEmails = selectedEmails;
		selectedGroups = selectedGroups;

		// Refresh the current view to remove emails from review display
		switchFilter(currentFilter, currentView);
	}

	// Calculate if all displayed emails are selected
	$: allDisplayedSelected = filteredEmails.length > 0 && filteredEmails.every(email => selectedEmails.has(email.id));

	// Calculate if some (but not all) displayed emails are selected
	$: someDisplayedSelected = filteredEmails.some(email => selectedEmails.has(email.id)) && !allDisplayedSelected;

	// Toggle select all displayed emails
	function toggleSelectAll() {
		if (allDisplayedSelected) {
			// Deselect all displayed emails
			for (const email of filteredEmails) {
				selectedEmails.delete(email.id);
			}
			selectedGroups.clear();
		} else {
			// Select all displayed emails
			for (const email of filteredEmails) {
				selectedEmails.add(email.id);
			}
			// Also select all groups that have all their emails in the current display
			const senderGroups = groupEmailsBySender(filteredEmails);
			for (const group of senderGroups) {
				if (group.emails.every(email => filteredEmails.includes(email))) {
					selectedGroups.add(group.sender);
				}
			}
		}
		selectedEmails = selectedEmails;
		selectedGroups = selectedGroups;
	}

	// Helper function to format size in MB
	function formatSizeInMB(bytes: number | undefined): string {
		if (!bytes) return '0 MB';
		const sizeInMB = bytes / (1024 * 1024);
		return `${sizeInMB < 1 ? sizeInMB.toFixed(2) : Math.round(sizeInMB)} MB`;
	}

	// Helper function to format date
	function formatDate(dateString: string | undefined): string {
		if (!dateString) return '';

		const emailDate = new Date(dateString);
		const today = new Date();

		// Check if it's today
		if (emailDate.toDateString() === today.toDateString()) {
			return emailDate.toLocaleTimeString('en-US', {
				hour: 'numeric',
				minute: '2-digit',
				hour12: true
			});
		} else {
			return emailDate.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric'
			});
		}
	}

	// Extract email address from 'from' field
	function extractEmailAddress(fromField: string | undefined): string {
		if (!fromField) return '';

		// Extract email from "Name <email@domain.com>" format
		const emailMatch = fromField.match(/<(.+?)>$/);
		return emailMatch ? emailMatch[1] : fromField;
	}

	// Calculate Low Engagement Senders
	function calculateLowEngagementSenders(allEmails: EmailRecord[]) {
		const senderStats = new Map<string, {
			totalEmails: number;
			hasAttachments: boolean;
			totalSize: number;
			emails: EmailRecord[];
		}>();

		// Group emails by sender
		allEmails
			.filter(email => email.detailsFetchedAt && email.from)
			.forEach(email => {
				const senderEmail = extractEmailAddress(email.from);
				if (!senderEmail) return;

				if (!senderStats.has(senderEmail)) {
					senderStats.set(senderEmail, {
						totalEmails: 0,
						hasAttachments: false,
						totalSize: 0,
						emails: []
					});
				}

				const stats = senderStats.get(senderEmail)!;
				stats.totalEmails++;
				stats.totalSize += email.sizeEstimate || 0;
				stats.emails.push(email);

				// Check if any email has attachments (rough estimate: size > 100KB might indicate attachments)
				if ((email.sizeEstimate || 0) > 100000) {
					stats.hasAttachments = true;
				}
			});

		// Filter for low engagement criteria
		let matchingEmails: EmailRecord[] = [];
		let totalSize = 0;

		for (const [sender, stats] of senderStats.entries()) {
			// Criteria: 20+ emails, no attachments, assume low engagement (we don't have read status)
			if (stats.totalEmails >= 20 && !stats.hasAttachments) {
				matchingEmails.push(...stats.emails);
				totalSize += stats.totalSize;
			}
		}

		return {
			emailCount: matchingEmails.length,
			totalSize: totalSize / (1024 * 1024), // Convert to MB
			emails: matchingEmails
		};
	}

	// Calculate Old News
	function calculateOldNews(allEmails: EmailRecord[]) {
		const sixMonthsAgo = new Date();
		sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

		const matchingEmails = allEmails.filter(email => {
			// Must have details fetched and unsubscribe header
			if (!email.detailsFetchedAt || !email.listUnsubscribeValue) {
				return false;
			}

			// Must be older than 6 months
			if (!email.date) return false;

			const emailDate = new Date(email.date);
			return emailDate < sixMonthsAgo;
		});

		const totalSize = matchingEmails.reduce((sum, email) =>
			sum + (email.sizeEstimate || 0), 0);

		return {
			emailCount: matchingEmails.length,
			totalSize: totalSize / (1024 * 1024), // Convert to MB
			emails: matchingEmails
		};
	}

	// Calculate Storage Hogs
	function calculateStorageHogs(allEmails: EmailRecord[]) {
		const senderStats = new Map<string, {
			totalSize: number;
			emailCount: number;
			emails: EmailRecord[];
		}>();

		// Group emails by sender and calculate storage
		allEmails
			.filter(email => email.detailsFetchedAt && email.from)
			.forEach(email => {
				const senderEmail = extractEmailAddress(email.from);
				if (!senderEmail) return;

				if (!senderStats.has(senderEmail)) {
					senderStats.set(senderEmail, {
						totalSize: 0,
						emailCount: 0,
						emails: []
					});
				}

				const stats = senderStats.get(senderEmail)!;
				stats.totalSize += email.sizeEstimate || 0;
				stats.emailCount++;
				stats.emails.push(email);
			});

		// Sort by total size descending and get top storage consumers
		const topStorageConsumers = Array.from(senderStats.entries())
			.sort(([, a], [, b]) => b.totalSize - a.totalSize)
			.slice(0, 50); // Top 50 storage hogs

		// Collect all emails from storage hogs
		const matchingEmails: EmailRecord[] = [];
		let totalSize = 0;

		for (const [sender, stats] of topStorageConsumers) {
			matchingEmails.push(...stats.emails);
			totalSize += stats.totalSize;
		}

		return {
			emailCount: matchingEmails.length,
			totalSize: totalSize / (1024 * 1024), // Convert to MB
			emails: matchingEmails
		};
	}

	// Calculate Frequent Senders
	function calculateFrequentSenders(allEmails: EmailRecord[]) {
		const senderStats = new Map<string, {
			emailCount: number;
			totalSize: number;
			emails: EmailRecord[];
		}>();

		// Group emails by sender and count frequency
		allEmails
			.filter(email => email.detailsFetchedAt && email.from)
			.forEach(email => {
				const senderEmail = extractEmailAddress(email.from);
				if (!senderEmail) return;

				if (!senderStats.has(senderEmail)) {
					senderStats.set(senderEmail, {
						emailCount: 0,
						totalSize: 0,
						emails: []
					});
				}

				const stats = senderStats.get(senderEmail)!;
				stats.emailCount++;
				stats.totalSize += email.sizeEstimate || 0;
				stats.emails.push(email);
			});

		// Sort by email count descending and get top frequent senders
		const topFrequentSenders = Array.from(senderStats.entries())
			.sort(([, a], [, b]) => b.emailCount - a.emailCount)
			.slice(0, 50); // Top 50 frequent senders

		// Collect all emails from frequent senders
		const matchingEmails: EmailRecord[] = [];
		let totalSize = 0;

		for (const [sender, stats] of topFrequentSenders) {
			matchingEmails.push(...stats.emails);
			totalSize += stats.totalSize;
		}

		return {
			emailCount: matchingEmails.length,
			totalSize: totalSize / (1024 * 1024), // Convert to MB
			emails: matchingEmails
		};
	}

	// Calculate Dormant Senders
	function calculateDormantSenders(allEmails: EmailRecord[]) {
		const twoYearsAgo = new Date();
		twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

		const senderStats = new Map<string, {
			emailCount: number;
			totalSize: number;
			lastEmailDate: Date | null;
			emails: EmailRecord[];
		}>();

		// Group emails by sender and track last email date
		allEmails
			.filter(email => email.detailsFetchedAt && email.from && email.date)
			.forEach(email => {
				const senderEmail = extractEmailAddress(email.from);
				if (!senderEmail) return;

				const emailDate = new Date(email.date!);

				if (!senderStats.has(senderEmail)) {
					senderStats.set(senderEmail, {
						emailCount: 0,
						totalSize: 0,
						lastEmailDate: null,
						emails: []
					});
				}

				const stats = senderStats.get(senderEmail)!;
				stats.emailCount++;
				stats.totalSize += email.sizeEstimate || 0;
				stats.emails.push(email);

				// Update last email date if this email is newer
				if (!stats.lastEmailDate || emailDate > stats.lastEmailDate) {
					stats.lastEmailDate = emailDate;
				}
			});

		// Filter for dormant criteria
		const matchingEmails: EmailRecord[] = [];
		let totalSize = 0;

		for (const [sender, stats] of senderStats.entries()) {
			// Criteria: 10+ emails historically AND last email was 2+ years ago
			if (stats.emailCount >= 10 &&
				stats.lastEmailDate &&
				stats.lastEmailDate < twoYearsAgo) {
				matchingEmails.push(...stats.emails);
				totalSize += stats.totalSize;
			}
		}

		return {
			emailCount: matchingEmails.length,
			totalSize: totalSize / (1024 * 1024), // Convert to MB
			emails: matchingEmails
		};
	}

	// Calculate Spammy TLDs
	function calculateSpammyTLDs(allEmails: EmailRecord[]) {
		const spammyTLDs = ['.info', '.biz', '.click', '.link', '.top', '.xyz',
			'.stream', '.download', '.loan', '.win', '.tk', '.ml', '.ga'];

		const matchingEmails = allEmails.filter(email => {
			if (!email.detailsFetchedAt || !email.from) return false;

			const senderEmail = extractEmailAddress(email.from);
			if (!senderEmail) return false;

			// Extract domain from email
			const domainMatch = senderEmail.match(/@(.+)$/);
			if (!domainMatch) return false;

			const domain = domainMatch[1].toLowerCase();

			// Check if domain ends with any spammy TLD
			return spammyTLDs.some(tld => domain.endsWith(tld));
		});

		const totalSize = matchingEmails.reduce((sum, email) =>
			sum + (email.sizeEstimate || 0), 0);

		return {
			emailCount: matchingEmails.length,
			totalSize: totalSize / (1024 * 1024), // Convert to MB
			emails: matchingEmails
		};
	}

	// Calculate Social Media Notifications
	function calculateSocialMediaNotifications(allEmails: EmailRecord[]) {
		const socialMediaDomains = [
			'linkedin.com', 'facebook.com', 'twitter.com', 'x.com', 'instagram.com',
			'reddit.com', 'pinterest.com', 'quora.com', 'medium.com', 'tiktok.com',
			// Include common subdomains and variations
			'mail.linkedin.com', 'noreply.linkedin.com', 'notifications.linkedin.com',
			'mail.facebook.com', 'notification.facebook.com', 'noreply.facebook.com',
			'info.twitter.com', 'notify.twitter.com', 'noreply.twitter.com',
			'no-reply.x.com', 'noreply.x.com',
			'mail.instagram.com', 'no-reply.instagram.com', 'noreply.instagram.com',
			'noreply.reddit.com', 'donotreply.reddit.com',
			'noreply.pinterest.com', 'no-reply.pinterest.com',
			'noreply.quora.com', 'digest-noreply.quora.com',
			'noreply.medium.com', 'no-reply.medium.com',
			'noreply.tiktok.com', 'no-reply.tiktok.com'
		];

		const matchingEmails = allEmails.filter(email => {
			if (!email.detailsFetchedAt || !email.from) return false;

			const senderEmail = extractEmailAddress(email.from);
			if (!senderEmail) return false;

			// Extract domain from email
			const domainMatch = senderEmail.match(/@(.+)$/);
			if (!domainMatch) return false;

			const domain = domainMatch[1].toLowerCase();

			// Check if domain matches any social media domain (exact match or ends with)
			return socialMediaDomains.some(socialDomain =>
				domain === socialDomain || domain.endsWith('.' + socialDomain)
			);
		});

		const totalSize = matchingEmails.reduce((sum, email) =>
			sum + (email.sizeEstimate || 0), 0);

		return {
			emailCount: matchingEmails.length,
			totalSize: totalSize / (1024 * 1024), // Convert to MB
			emails: matchingEmails
		};
	}

	// Helper function to check if email is categorized by other filters
	function isEmailCategorized(email: EmailRecord): boolean {
		const senderEmail = extractEmailAddress(email.from);
		if (!senderEmail) return false;

		const domainMatch = senderEmail.match(/@(.+)$/);
		if (!domainMatch) return false;
		const domain = domainMatch[1].toLowerCase();

		// Check Low Engagement (will be handled by sender stats)
		// Check Old News
		if (email.listUnsubscribeValue && email.date) {
			const sixMonthsAgo = new Date();
			sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
			const emailDate = new Date(email.date);
			if (emailDate < sixMonthsAgo) return true;
		}

		// Check Spammy TLDs
		const spammyTLDs = ['.info', '.biz', '.click', '.link', '.top', '.xyz',
			'.stream', '.download', '.loan', '.win', '.tk', '.ml', '.ga'];
		if (spammyTLDs.some(tld => domain.endsWith(tld))) return true;

		// Check Social Media
		const socialMediaDomains = [
			'linkedin.com', 'facebook.com', 'twitter.com', 'x.com', 'instagram.com',
			'reddit.com', 'pinterest.com', 'quora.com', 'medium.com', 'tiktok.com',
			'mail.linkedin.com', 'noreply.linkedin.com', 'notifications.linkedin.com',
			'mail.facebook.com', 'notification.facebook.com', 'noreply.facebook.com',
			'info.twitter.com', 'notify.twitter.com', 'noreply.twitter.com',
			'no-reply.x.com', 'noreply.x.com',
			'mail.instagram.com', 'no-reply.instagram.com', 'noreply.instagram.com',
			'noreply.reddit.com', 'donotreply.reddit.com',
			'noreply.pinterest.com', 'no-reply.pinterest.com',
			'noreply.quora.com', 'digest-noreply.quora.com',
			'noreply.medium.com', 'no-reply.medium.com',
			'noreply.tiktok.com', 'no-reply.tiktok.com'
		];
		if (socialMediaDomains.some(socialDomain =>
			domain === socialDomain || domain.endsWith('.' + socialDomain))) return true;

		return false;
	}

	// Calculate Longtail (Uncategorized)
	function calculateLongtail(allEmails: EmailRecord[], categorizedEmailSets: {
		lowEngagement: EmailRecord[];
		storageHogs: EmailRecord[];
		frequentSenders: EmailRecord[];
		dormantSenders: EmailRecord[];
	}) {
		// Create a Set of categorized email IDs for fast lookup
		const categorizedIds = new Set([
			...categorizedEmailSets.lowEngagement.map(e => e.id),
			...categorizedEmailSets.storageHogs.map(e => e.id),
			...categorizedEmailSets.frequentSenders.map(e => e.id),
			...categorizedEmailSets.dormantSenders.map(e => e.id)
		]);

		const uncategorizedEmails = allEmails.filter(email => {
			if (!email.detailsFetchedAt || !email.from) return false;

			// Skip if already categorized by sender-based rules
			if (categorizedIds.has(email.id)) return false;

			// Skip if categorized by individual email rules
			if (isEmailCategorized(email)) return false;

			return true;
		});

		// Sort by date (newest first) or could sort by size
		const sortedEmails = uncategorizedEmails.sort((a, b) => {
			if (!a.date || !b.date) return 0;
			return new Date(b.date).getTime() - new Date(a.date).getTime();
		});

		const totalSize = sortedEmails.reduce((sum, email) =>
			sum + (email.sizeEstimate || 0), 0);

		return {
			emailCount: sortedEmails.length,
			totalSize: totalSize / (1024 * 1024), // Convert to MB
			emails: sortedEmails
		};
	}

	// Calculate Protected
	function calculateProtected(allEmails: EmailRecord[]) {
		const protectedEmails = allEmails.filter(email => {
			if (!email.detailsFetchedAt || !email.from) return false;

			// Check if email ID is specifically protected
			if (protectedEmailIds.has(email.id)) return true;

			const senderEmail = extractEmailAddress(email.from);
			if (!senderEmail) return false;

			// Check if sender is in protected list
			if (protectedSenders.includes(senderEmail.toLowerCase())) return true;

			// Check if sender domain is protected
			const domainMatch = senderEmail.match(/@(.+)$/);
			if (domainMatch) {
				const domain = domainMatch[1].toLowerCase();
				if (protectedDomains.some(protectedDomain =>
					domain === protectedDomain || domain.endsWith('.' + protectedDomain)
				)) return true;
			}

			return false;
		});

		const totalSize = protectedEmails.reduce((sum, email) =>
			sum + (email.sizeEstimate || 0), 0);

		return {
			emailCount: protectedEmails.length,
			totalSize: totalSize / (1024 * 1024), // Convert to MB
			emails: protectedEmails
		};
	}

	// Load emails on component mount
	onMount(async () => {
		try {
			await emailDB.init();

			// Load review queue from IndexedDB
			await loadReviewQueueFromDB();

			const dbEmails = await emailDB.getAllEmails();

			// Filter emails that have details and required fields (same as display filter)
			const processedEmails = dbEmails.filter(email => email.detailsFetchedAt && email.from && email.subject);

			// Set total email count and size for sidebar
			totalEmailCount = processedEmails.length;
			totalSizeMB = processedEmails.reduce((sum, email) => sum + (email.sizeEstimate || 0), 0) / (1024 * 1024);

			// Calculate filters with real data
			const lowEngagementData = calculateLowEngagementSenders(dbEmails);
			const oldNewsData = calculateOldNews(dbEmails);
			const storageHogsData = calculateStorageHogs(dbEmails);
			const frequentSendersData = calculateFrequentSenders(dbEmails);
			const dormantSendersData = calculateDormantSenders(dbEmails);
			const spammyTLDsData = calculateSpammyTLDs(dbEmails);
			const socialMediaData = calculateSocialMediaNotifications(dbEmails);
			const protectedData = calculateProtected(dbEmails);

			// Calculate longtail (emails not caught by other rules)
			const longtailData = calculateLongtail(dbEmails, {
				lowEngagement: lowEngagementData.emails,
				storageHogs: storageHogsData.emails,
				frequentSenders: frequentSendersData.emails,
				dormantSenders: dormantSendersData.emails
			});

			// Store filter results for switching
			filterResults = {
				lowEngagement: lowEngagementData,
				oldNews: oldNewsData,
				storageHogs: storageHogsData,
				frequentSenders: frequentSendersData,
				dormantSenders: dormantSendersData,
				spammyTLDs: spammyTLDsData,
				socialMedia: socialMediaData,
				longtail: longtailData,
				protected: protectedData
			};

			// Update smart filters with real data
			smartFiltersData = smartFilters.map(filter => {
				if (filter.id === 'low-engagement') {
					return {
						...filter,
						title: 'Low Engagement', // Remove 🚧
						emailCount: lowEngagementData.emailCount,
						totalSize: lowEngagementData.totalSize
					};
				}
				if (filter.id === 'old-news') {
					return {
						...filter,
						title: 'Old News', // Remove 🚧
						emailCount: oldNewsData.emailCount,
						totalSize: oldNewsData.totalSize
					};
				}
				if (filter.id === 'storage-hogs') {
					return {
						...filter,
						title: 'Storage Hogs', // Remove 🚧
						emailCount: storageHogsData.emailCount,
						totalSize: storageHogsData.totalSize
					};
				}
				if (filter.id === 'frequent-senders') {
					return {
						...filter,
						title: 'Frequent Senders', // Remove 🚧
						emailCount: frequentSendersData.emailCount,
						totalSize: frequentSendersData.totalSize
					};
				}
				if (filter.id === 'dormant-senders') {
					return {
						...filter,
						title: 'Dormant Senders', // Remove 🚧
						emailCount: dormantSendersData.emailCount,
						totalSize: dormantSendersData.totalSize
					};
				}
				if (filter.id === 'spammy-tlds') {
					return {
						...filter,
						title: 'Spammy TLDs', // Remove 🚧
						emailCount: spammyTLDsData.emailCount,
						totalSize: spammyTLDsData.totalSize
					};
				}
				if (filter.id === 'social-media') {
					return {
						...filter,
						title: 'Social Media', // Remove 🚧
						emailCount: socialMediaData.emailCount,
						totalSize: socialMediaData.totalSize
					};
				}
				if (filter.id === 'longtail') {
					return {
						...filter,
						title: 'Uncategorized', // Remove 🚧
						emailCount: longtailData.emailCount,
						totalSize: longtailData.totalSize
					};
				}
				if (filter.id === 'protected') {
					return {
						...filter,
						title: 'Protected', // Remove 🚧
						emailCount: protectedData.emailCount,
						totalSize: protectedData.totalSize
					};
				}
				return filter;
			});

			// Filter emails that have details and sort by date (newest first) - now load ALL emails
			const filteredDBEmails = dbEmails
				.filter(email => email.detailsFetchedAt && email.from && email.subject)
				.sort((a, b) => {
					if (!a.date || !b.date) return 0;
					return new Date(b.date).getTime() - new Date(a.date).getTime();
				});

			// Set emails for display and virtual scrolling
			emails = filteredDBEmails;
			allEmails = filteredDBEmails;

			// Initialize with inbox view (all emails)
			filteredEmails = filteredDBEmails;

			loading = false;
		} catch (error) {
			console.error('Failed to load emails:', error);
			loading = false;
		}
	});
</script>

<div class="h-screen bg-gray-50 overflow-hidden">
	<div class="flex h-full">
		<!-- Sidebar -->
		<div class="w-80 bg-white border-r border-gray-200 h-full p-4 overflow-y-auto">
			<nav class="space-y-2">
				<!-- Inbox Section -->
				<div>
					<button
						class="flex items-center justify-between w-full px-3 py-2 text-sm font-medium rounded-md cursor-pointer {currentFilter === 'inbox' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-900 hover:bg-gray-50'}"
						onclick={() => switchFilter('inbox', 'Inbox')}
					>
						<span>Inbox</span>
						<span class="text-xs {currentFilter === 'inbox' ? 'text-blue-200' : 'text-gray-400'}">{inboxSizeMB < 1 ? inboxSizeMB.toFixed(2) : Math.round(inboxSizeMB)} MB</span>
					</button>
					<div class="ml-4 mt-1 space-y-1">
						{#each sidebarFiltersData as filter}
							<button
								class="flex items-center justify-between w-full px-3 py-2 text-sm rounded-md cursor-pointer {currentFilter === filter.id ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}"
								onclick={() => switchFilter(filter.id, filter.title.replace('🚧 ', ''))}
							>
								<span class="truncate">{filter.title.replace('🚧 ', '')}</span>
								<span class="text-xs {currentFilter === filter.id ? 'text-blue-200' : 'text-gray-400'}">
									{filter.displaySize < 1 ? filter.displaySize.toFixed(2) : Math.round(filter.displaySize)} MB
								</span>
							</button>
						{/each}
					</div>
				</div>

				<!-- Review Section -->
				<button
					class="flex items-center justify-between w-full px-3 py-2 text-sm font-medium rounded-md cursor-pointer {currentFilter === 'review' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-900 hover:bg-gray-50'}"
					onclick={() => switchFilter('review', 'Review Queue')}
				>
					<span>Review</span>
					<span class="text-xs {currentFilter === 'review' ? 'text-blue-200' : 'text-gray-400'}">{reviewQueueSizeMB < 1 ? reviewQueueSizeMB.toFixed(2) : Math.round(reviewQueueSizeMB)} MB</span>
				</button>

				<!-- Trash -->
				<a href="#" class="flex items-center px-3 py-2 text-sm font-medium text-gray-900 rounded-md hover:bg-gray-50 cursor-pointer">
					Trash
				</a>
			</nav>
		</div>

		<!-- Gmail-like email list -->
		<div class="flex-1 flex flex-col bg-white rounded-lg shadow-sm min-h-0">
			<div class="p-4 border-b flex-shrink-0">
				<div class="flex items-center gap-4">
					<h2 class="text-lg font-semibold text-gray-900">{currentView}</h2>
					{#if !loading && filteredEmails.length > 0}
						<div class="flex items-center gap-4 text-sm text-gray-500">
							<div class="flex items-center gap-1">
								<Mail size={16} />
								<span>{filteredEmails.length.toLocaleString()}</span>
								<Badge variant="secondary">
									{emailPercentage.toFixed(1)}%
								</Badge>
							</div>
							<div class="flex items-center gap-1">
								<HardDrive size={16} />
								<span>{(() => { const size = filteredEmails.reduce((sum, email) => sum + (email.sizeEstimate || 0), 0) / (1024 * 1024); return size < 1 ? size.toFixed(2) : Math.round(size); })()} MB</span>
								<Badge variant="secondary">
									{sizePercentage.toFixed(1)}%
								</Badge>
							</div>
						</div>
					{/if}
				</div>
			</div>

			{#if loading}
				<div class="p-8 text-center text-gray-500 flex-1">
					Loading emails...
				</div>
			{:else if groupedEmails.length === 0}
				<div class="p-8 text-center text-gray-500 flex-1">
					{#if filteredEmails.length === 0 && allEmails.length > 0}
						{#if currentFilter === 'review'}
							No emails in review queue yet.
						{:else}
							No eligible emails for this filter. All emails may have been moved to review queue or don't match the criteria.
						{/if}
					{:else}
						No emails found. Run a scan to see your emails.
					{/if}
				</div>
			{:else}
				<!-- Email list header -->
				<div class="flex-shrink-0 bg-gray-50 border-b">
					<div class="flex items-center p-4 text-sm font-normal text-gray-700">
						<div class="w-12 flex-shrink-0">
							<input
								type="checkbox"
								class="rounded border-gray-300"
								checked={allDisplayedSelected}
								indeterminate={someDisplayedSelected}
								onchange={toggleSelectAll}
							/>
						</div>
						<div class="w-48 flex-shrink-0">Sender</div>
						<div class="flex-1 min-w-0">Subject</div>
						<div class="w-20 flex-shrink-0 text-center">Size</div>
						<div class="w-20 flex-shrink-0 text-right">Date</div>
					</div>
				</div>

				<!-- Virtual scrolling container -->
				<div bind:this={parentElement} class="flex-1 overflow-auto min-h-0">
					{#if virtualizer}
						<div style="height: {$virtualizer.getTotalSize()}px; width: 100%; position: relative;">
							{#each $virtualizer.getVirtualItems() as row (row.index)}
								{@const item = groupedEmails[row.index]}
								<div
									class="absolute top-0 left-0 w-full"
									style="height: {row.size}px; transform: translateY({row.start}px);"
								>
									{#if item.type === 'group'}
										<!-- Group Header -->
										<div class="flex items-center p-4 bg-gray-100 hover:bg-gray-200 text-sm font-medium border-b border-gray-200 h-full">
											<div class="w-12 flex-shrink-0">
												<input
													type="checkbox"
													class="rounded border-gray-300"
													checked={selectedGroups.has(item.sender)}
													indeterminate={isGroupPartiallySelected(item.sender, item.emails)}
													onchange={() => toggleGroupSelection(item.sender, item.emails)}
												/>
											</div>
											<div
												class="w-4 flex-shrink-0 flex items-center justify-center cursor-pointer"
												onclick={() => toggleGroup(item.sender)}
											>
												{#if expandedGroups.has(item.sender)}
													<ChevronDown size={16} class="text-gray-600" />
												{:else}
													<ChevronRight size={16} class="text-gray-600" />
												{/if}
											</div>
											<div
												class="flex-1 min-w-0 px-2 cursor-pointer"
												onclick={() => toggleGroup(item.sender)}
											>
												<div class="text-gray-900 truncate" title={item.sender}>
													{item.sender} ({item.emailCount})
												</div>
											</div>
											<div class="w-20 flex-shrink-0 text-center text-gray-600">
												{formatSizeInMB(item.totalSize)}
											</div>
											<div class="w-20 flex-shrink-0 text-right text-gray-600">
												<!-- Empty space to align with date column -->
											</div>
										</div>
									{:else}
										<!-- Individual Email -->
										<div class="flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer text-sm font-normal border-b border-gray-100 h-full">
											<div class="w-12 flex-shrink-0">
												<input
													type="checkbox"
													class="rounded border-gray-300"
													checked={selectedEmails.has(item.email.id)}
													onchange={() => toggleEmailSelection(item.email.id, item.sender)}
												/>
											</div>
											<div class="w-48 flex-shrink-0">
												<div class="text-gray-600 truncate" title={extractEmailAddress(item.email.from)}>
													{extractEmailAddress(item.email.from)}
												</div>
											</div>
											<div class="flex-1 min-w-0 pr-4">
												<div class="text-gray-900 truncate" title={item.email.subject}>
													{item.email.subject || 'No subject'}
												</div>
											</div>
											<div class="w-20 flex-shrink-0 text-center text-gray-600">
												{formatSizeInMB(item.email.sizeEstimate)}
											</div>
											<div class="w-20 flex-shrink-0 text-right text-gray-600">
												{formatDate(item.email.date)}
											</div>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- {#if isPaused || isComplete} -->
			<!-- <RecentEmailsSection /> -->
		<!-- {/if} -->
		</div>

	<!-- Floating Selection Bar -->
	{#if selectedEmailsData.count > 0}
		<div class="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
			<div class="bg-black text-white px-4 py-4 rounded-lg shadow-lg flex items-center justify-between gap-4 min-w-3xl">
				<div class="flex items-center gap-2">
					<div class="flex items-center gap-2">
					<span class="font-medium">{selectedEmailsData.count}</span>
					<span>selected</span>
					{#if selectedEmailsData.count > 0}
						<Badge variant="secondary">{selectedEmailsData.emailPercentage.toFixed(1)}%</Badge>
					{/if}
				</div>

				{#if selectedEmailsData.count > 0}
					<div class="flex items-center gap-2">
						<span class="font-medium">{selectedEmailsData.totalSizeMB < 1 ? selectedEmailsData.totalSizeMB.toFixed(2) : Math.round(selectedEmailsData.totalSizeMB)} MB</span>
						<Badge variant="secondary">{selectedEmailsData.sizePercentage.toFixed(1)}%</Badge>
					</div>
				{/if}
				</div>

				<button
					type="button"
					class="bg-white hover:bg-gray-100 text-black px-4 py-2 rounded-md text-sm font-medium transition-colors"
					onclick={currentFilter === 'review' ? putBackFromReview : addToReviewQueue}
				>
					{currentFilter === 'review' ? 'Put Back' : 'Add to Review Queue'}
				</button>
			</div>
		</div>
	{/if}
</div>
