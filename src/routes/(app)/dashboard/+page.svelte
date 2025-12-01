<script lang="ts">
	import { onMount } from 'svelte';
	import ScanSection from '$lib/components/ScanSection.svelte';
	import StatisticsSection from '$lib/components/StatisticsSection.svelte';
	// import RecentEmailsSection from '$lib/components/RecentEmailsSection.svelte';
	import TopSendersSection from '$lib/components/TopSendersSection.svelte';
	import { emailDB, type EmailRecord } from '$lib/emaildb';
	import { Mail, HardDrive } from 'lucide-svelte';
	import { createVirtualizer } from '@tanstack/svelte-virtual';

	// let isPaused = true;
	// let isComplete = false;
	let emails: EmailRecord[] = [];
	let allEmails: EmailRecord[] = []; // Store all emails for virtual scrolling
	let filteredEmails: EmailRecord[] = []; // Currently filtered emails for display
	let loading = true;
	let smartFiltersData: any[] = [];
	let filterResults: any = {}; // Store all filter calculation results
	let totalEmailCount = 0;
	let totalSizeMB = 0;
	let currentView = 'Inbox'; // Track which section/rule is currently being viewed
	let currentFilter = 'inbox'; // Track current filter selection

	// Virtual scrolling setup
	let parentElement: HTMLElement;
	let virtualizer: any;

	// Create virtualizer when filtered emails change
	$: if (parentElement && filteredEmails.length > 0) {
		virtualizer = createVirtualizer({
			count: filteredEmails.length,
			getScrollElement: () => parentElement,
			estimateSize: () => 60, // Estimated row height in pixels
			overscan: 5, // Render 5 extra items outside viewport
		});
	}

	// Filter switching function
	function switchFilter(filterId: string, filterName: string) {
		currentFilter = filterId;
		currentView = filterName;

		switch(filterId) {
			case 'inbox':
				filteredEmails = allEmails;
				break;
			case 'low-engagement':
				filteredEmails = filterResults.lowEngagement?.emails || [];
				break;
			case 'old-news':
				filteredEmails = filterResults.oldNews?.emails || [];
				break;
			case 'storage-hogs':
				filteredEmails = filterResults.storageHogs?.emails || [];
				break;
			case 'frequent-senders':
				filteredEmails = filterResults.frequentSenders?.emails || [];
				break;
			case 'dormant-senders':
				filteredEmails = filterResults.dormantSenders?.emails || [];
				break;
			case 'spammy-tlds':
				filteredEmails = filterResults.spammyTLDs?.emails || [];
				break;
			case 'social-media':
				filteredEmails = filterResults.socialMedia?.emails || [];
				break;
			case 'longtail':
				filteredEmails = filterResults.longtail?.emails || [];
				break;
			case 'protected':
				filteredEmails = filterResults.protected?.emails || [];
				break;
			default:
				filteredEmails = allEmails;
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
			const dbEmails = await emailDB.getAllEmails();

			// Set total email count and size for sidebar
			const processedEmails = dbEmails.filter(email => email.detailsFetchedAt);
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
						on:click={() => switchFilter('inbox', 'Inbox')}
					>
						<span>Inbox</span>
						<span class="text-xs {currentFilter === 'inbox' ? 'text-blue-200' : 'text-gray-400'}">{totalSizeMB < 1 ? totalSizeMB.toFixed(2) : Math.round(totalSizeMB)} MB</span>
					</button>
					<div class="ml-4 mt-1 space-y-1">
						{#each smartFiltersData.length > 0 ? smartFiltersData : smartFilters as filter}
							<button
								class="flex items-center justify-between w-full px-3 py-2 text-sm rounded-md cursor-pointer {currentFilter === filter.id ? 'bg-blue-600 text-white hover:bg-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}"
								on:click={() => switchFilter(filter.id, filter.title.replace('🚧 ', ''))}
							>
								<span class="truncate">{filter.title.replace('🚧 ', '')}</span>
								<span class="text-xs {currentFilter === filter.id ? 'text-blue-200' : 'text-gray-400'}">{filter.totalSize < 1 ? filter.totalSize.toFixed(2) : Math.round(filter.totalSize)} MB</span>
							</button>
						{/each}
					</div>
				</div>

				<!-- Review -->
				<a href="#" class="flex items-center px-3 py-2 text-sm font-medium text-gray-900 rounded-md hover:bg-gray-50 cursor-pointer">
					Review
				</a>

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
							</div>
							<div class="flex items-center gap-1">
								<HardDrive size={16} />
								<span>{(() => { const size = filteredEmails.reduce((sum, email) => sum + (email.sizeEstimate || 0), 0) / (1024 * 1024); return size < 1 ? size.toFixed(2) : Math.round(size); })()} MB</span>
							</div>
						</div>
					{/if}
				</div>
			</div>

			{#if loading}
				<div class="p-8 text-center text-gray-500 flex-1">
					Loading emails...
				</div>
			{:else if filteredEmails.length === 0}
				<div class="p-8 text-center text-gray-500 flex-1">
					No emails found. Run a scan to see your emails.
				</div>
			{:else}
				<!-- Email list header -->
				<div class="flex-shrink-0 bg-gray-50 border-b">
					<div class="flex items-center p-4 text-sm font-normal text-gray-700">
						<div class="w-12 flex-shrink-0">
							<input type="checkbox" class="rounded border-gray-300" />
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
								{@const email = filteredEmails[row.index]}
								<div
									class="flex items-center p-4 hover:bg-gray-50 cursor-pointer text-sm font-normal absolute top-0 left-0 w-full border-b border-gray-100"
									style="height: {row.size}px; transform: translateY({row.start}px);"
								>
									<div class="w-12 flex-shrink-0">
										<input type="checkbox" class="rounded border-gray-300" />
									</div>
									<div class="w-48 flex-shrink-0">
										<div class="text-gray-600 truncate" title={extractEmailAddress(email.from)}>
											{extractEmailAddress(email.from)}
										</div>
									</div>
									<div class="flex-1 min-w-0 pr-4">
										<div class="text-gray-900 truncate" title={email.subject}>
											{email.subject || 'No subject'}
										</div>
									</div>
									<div class="w-20 flex-shrink-0 text-center text-gray-600">
										{formatSizeInMB(email.sizeEstimate)}
									</div>
									<div class="w-20 flex-shrink-0 text-right text-gray-600">
										{formatDate(email.date)}
									</div>
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
</div>
