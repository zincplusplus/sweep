<script lang="ts">
	import { onMount } from 'svelte';
	import { Scan, RotateCcw } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { accessToken } from '$lib/auth';
	import { get } from 'svelte/store';
	import { emailDB, type EmailRecord, isScanComplete, getLastMonthWithData } from '$lib/emaildb';

	let isScanning = false;
	let scanProgress = 0;
	let isComplete = false;
	let isPaused = false;
	let gmailInitialized = false;
	let canResume = false;
	let currentProcessingMonth = '';
	let emailsFound = 0;
	let savedProgress: any = null;

	// Rate limiter class
	class RateLimiter {
		constructor(maxRetries = 5, baseDelay = 1000) {
			this.maxRetries = maxRetries;
			this.baseDelay = baseDelay;
		}

		async executeWithRetry(fn, context = '') {
			for (let attempt = 0; attempt < this.maxRetries; attempt++) {
				try {
					return await fn();
				} catch (error) {
					const status = error?.status || error?.code || error?.response?.status;
					const isRateLimit = [429, 500, 502, 503, 504].includes(status);

					if (isRateLimit) {
						if (attempt === this.maxRetries - 1) {
							console.error(`${context}: Max retries exceeded after ${this.maxRetries} attempts`);
							throw error;
						}

						const exponentialDelay = this.baseDelay * Math.pow(2, attempt);
						const jitter = Math.random() * 1000;
						const delay = exponentialDelay + jitter;

						console.log(`${context}: Rate limited (${status}), retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${this.maxRetries})`);
						await new Promise(resolve => setTimeout(resolve, delay));
						continue;
					}

					// Non-retryable error
					console.error(`${context}: Non-retryable error:`, error);
					throw error;
				}
			}
		}
	}

	onMount(async () => {
		// Initialize Gmail API and Database
		await initializeGmailAPI();
		await emailDB.init();

		// Check scan status
		const scanComplete = await isScanComplete();
		savedProgress = await emailDB.loadScanProgress();
		emailsFound = await emailDB.getEmailCount();

		if (scanComplete) {
			isComplete = true;
			scanProgress = 100;
		} else if (savedProgress) {
			canResume = true;
			// Calculate current progress
			const [lastYear, lastMonth] = savedProgress.lastSuccessfulMonth.split('/').map(Number);
			const startYear = 2004;
			const startMonth = 4;
			const today = new Date();
			const endYear = today.getFullYear();
			const endMonth = today.getMonth() + 1;
			const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth + 1);
			const completedMonths = (lastYear - startYear) * 12 + (lastMonth - startMonth + 1);
			scanProgress = Math.round((completedMonths / totalMonths) * 100);
		}
	});

	async function initializeGmailAPI() {
		return new Promise<void>((resolve) => {
			// @ts-ignore
			gapi.load('client', async () => {
				// @ts-ignore
				await gapi.client.init({
					apiKey: '', // Not needed for OAuth requests
					discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest']
				});

				// Set the access token
				const token = get(accessToken);
				if (token) {
					// @ts-ignore
					gapi.client.setToken({ access_token: token });
				}

				gmailInitialized = true;
				resolve();
			});
		});
	}

	async function startFreshScan() {
		console.log('Starting fresh scan - clearing all data...');
		await emailDB.clearScanProgress();
		await emailDB.clearAllEmails();
		canResume = false;
		savedProgress = null;
		emailsFound = 0;
		scanProgress = 0;
		isComplete = false;
		isScanning = true;
		startScan();
	}

	async function updateEmails() {
		console.log('Starting update emails...');

		const lastMonth = await getLastMonthWithData();
		if (!lastMonth) {
			console.log('No existing data found, starting fresh scan instead');
			startFreshScan();
			return;
		}

		console.log(`Last month with data: ${lastMonth}. Rescanning from there...`);

		// Parse the last month to start from
		const [lastYear, lastMonthNum] = lastMonth.split('/').map(Number);

		// Clear any existing scan progress since we're doing an update
		await emailDB.clearScanProgress();

		// Start scanning from the last month we have data for
		isScanning = true;
		isComplete = false;
		scanProgress = 0;
		startScanFromMonth(lastYear, lastMonthNum);
	}

	async function startScan() {
		console.log('Starting scan...');
		startScanFromMonth(2004, 4);
	}

	async function startScanFromMonth(startYear: number, startMonth: number) {
		console.log(`Starting scan from ${startYear}/${startMonth}...`);

		// Use today's date for end point
		const today = new Date();
		const endYear = today.getFullYear();
		const endMonth = today.getMonth() + 1; // getMonth() returns 0-11, so add 1

		// Check for existing scan progress
		const savedProgress = await emailDB.loadScanProgress();
		let currentYear = startYear;
		let currentMonth = startMonth;
		let monthsCompleted = 0;

		if (savedProgress) {
			const [lastYear, lastMonth] = savedProgress.lastSuccessfulMonth.split('/').map(Number);
			currentYear = lastYear;
			currentMonth = lastMonth + 1; // Resume from next month

			// Handle year rollover
			if (currentMonth > 12) {
				currentMonth = 1;
				currentYear++;
			}

			// Calculate months already completed
			monthsCompleted = (lastYear - startYear) * 12 + (lastMonth - startMonth + 1);
			console.log(`Resuming scan from ${currentYear}/${currentMonth}, ${monthsCompleted} months already completed`);
		}

		// Calculate total months to scan
		const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth + 1);
		console.log(`Total months to scan: ${totalMonths}`);

		let currentPageToken: string | undefined = undefined;
		let firstEmailMonth: string | null = null;
		const existingEmailCount = await emailDB.getEmailCount();
		console.log(`Starting with ${existingEmailCount} emails already in database`);

		try {
			while (true) {
				const result = await getEmailsFromMonth(currentYear, currentMonth, currentPageToken);
				console.log('Fetched result:', result);

				// If we found emails and haven't recorded the first email month yet
				if (result.messages.length > 0 && !firstEmailMonth) {
					firstEmailMonth = `${currentYear}/${currentMonth}`;
					console.log(`First email found in: ${firstEmailMonth}`);
				}

				// Save new emails to database
				const newEmails: EmailRecord[] = [];
				for (const message of result.messages) {
					// Check if we already have this email
					if (!(await emailDB.emailExists(message.id))) {
						newEmails.push({
							id: message.id,
							month: `${currentYear}/${currentMonth}`,
							scannedAt: Date.now()
						});
					}
				}

				if (newEmails.length > 0) {
					await emailDB.addEmails(newEmails);
					console.log(`Added ${newEmails.length} new emails to database`);

					// Update email count immediately after adding
					emailsFound += newEmails.length;
				}

				// Update UI state
				currentProcessingMonth = `${currentYear}/${currentMonth}`;

				if (result.nextPageToken) {
					// Option 1: There's a nextPageToken, continue with same month
					console.log(`Continuing with next page for ${currentYear}/${currentMonth}`);
					currentPageToken = result.nextPageToken;
				} else {
					// Option 2: No more pages, go to next month
					monthsCompleted++;
					const progressPercent = Math.round((monthsCompleted / totalMonths) * 100);
					console.log(`Finished ${currentYear}/${currentMonth}, moving to next month (${progressPercent}% done - ${monthsCompleted}/${totalMonths} months)`);

					// Save progress after completing a month
					await emailDB.saveScanProgress(`${currentYear}/${currentMonth}`);

					// Update UI progress
					scanProgress = progressPercent;

					currentPageToken = undefined;
					currentMonth++;

					// Handle year rollover
					if (currentMonth > 12) {
						currentMonth = 1;
						currentYear++;
					}

					// Stop at some reasonable point (e.g., current year and month)
					if (currentYear > endYear || (currentYear === endYear && currentMonth > endMonth)) {
						console.log('Reached end date, stopping scan');
						break;
					}
				}
			}

			const finalEmailCount = await emailDB.getEmailCount();
			console.log(`Scan completed! Total emails in database: ${finalEmailCount}`);
			console.log(`First email received in: ${firstEmailMonth || 'No emails found'}`);

			// Update UI state
			isScanning = false;
			isComplete = true;
			scanProgress = 100;
			emailsFound = finalEmailCount;

			// Clear scan progress on completion
			await emailDB.clearScanProgress();
			canResume = false;
		} catch (error) {
			console.error('Error during scan:', error);
			isScanning = false;
		}
		// isScanning = true;
		// scanProgress = 0;
		// isComplete = false;

		// const interval = setInterval(() => {
		// 	scanProgress += Math.random() * 15;
		// 	if (scanProgress >= 100) {
		// 		scanProgress = 100;
		// 		isScanning = false;
		// 		isComplete = true;
		// 		clearInterval(interval);
		// 	}
		// }, 200);
	}

	async function getEmailsFromMonth(year: number, month: number, pageToken?: string): Promise<{messages: any[], nextPageToken?: string}> {
		if (!gmailInitialized) {
			throw new Error('Gmail API not initialized');
		}

		const query = `after:${year}/${month}/01 before:${year}/${month + 1}/01`;

		try {
			// @ts-ignore
			const response = await gapi.client.gmail.users.messages.list({
				userId: 'me',
				q: query,
				maxResults: 500,
				pageToken
			});

			const messages = response.result.messages || [];
			const nextPageToken = response.result.nextPageToken;

			console.log(`Fetched ${messages.length} messages for ${year}/${month} (Page Token: ${pageToken || 'N/A'})`);
			console.log('Next Page Token:', nextPageToken || 'N/A');
			console.log('For query:', query);

			return { messages, nextPageToken };
			// if (!messages.length) return allEmails;

			// // Process messages with concurrency limit of 8
			// const concurrentRequests = [];
			// let activeRequests = 0;
			// const maxConcurrency = 8;

			// for (const message of messages) {
			// 	while (activeRequests >= maxConcurrency) {
			// 		await Promise.race(concurrentRequests);
			// 	}

			// 	const requestPromise = (async () => {
			// 		activeRequests++;
			// 		try {
			// 			const rateLimiter = new RateLimiter(5, 1000);
			// 			const details = await rateLimiter.executeWithRetry(async () => {
			// 				// @ts-ignore
			// 				return await gapi.client.gmail.users.messages.get({
			// 					userId: 'me',
			// 					id: message.id,
			// 					format: 'metadata',
			// 					metadataHeaders: ['From', 'To', 'Subject', 'Date']
			// 				});
			// 			}, `Fetching email ${message.id}`);
			// 			return details.result;
			// 		} catch (error) {
			// 			console.error(`Failed to fetch message ${message.id}:`, error);
			// 			return null;
			// 		} finally {
			// 			activeRequests--;
			// 			const index = concurrentRequests.indexOf(requestPromise);
			// 			if (index > -1) concurrentRequests.splice(index, 1);
			// 		}
			// 	})();

			// 	concurrentRequests.push(requestPromise);
			// }

			// // Wait for all remaining requests to complete
			// const currentEmails = await Promise.all(concurrentRequests);
			// const validEmails = currentEmails.filter(email => email !== null);
			// allEmails.push(...validEmails);

			// const nextPageToken = response.result.nextPageToken;

			// if (nextPageToken) {
			// 	return await getEmailsFromMonth(year, month, nextPageToken, allEmails);
			// }

			// return allEmails;
		} catch (e: any) {
			console.error(`Failed to collect emails for ${year}/${month}:`, e.message);
			return { messages: [], nextPageToken: undefined };
		}
	}
</script>

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
		{#if canResume}
			<div class="space-y-4">
				<div class="text-sm text-gray-600">
					Previous scan found {emailsFound} emails ({scanProgress}% complete). Last scanned: {savedProgress?.lastSuccessfulMonth}
				</div>
				<div class="w-full bg-gray-200 rounded-full h-2 mb-4">
					<div
						class="bg-blue-500 h-2 rounded-full transition-all duration-300"
						style="width: {scanProgress}%"
					></div>
				</div>
				<div class="flex gap-2">
					<Button
						onclick={() => {
							isScanning = true;
							startScan();
						}}
						variant="default"
					>
						Resume Scan
					</Button>
					<Button
						onclick={startFreshScan}
						variant="secondary"
					>
						Fresh Scan
					</Button>
				</div>
			</div>
		{:else}
			<Button
				onclick={() => {
					isScanning = true;
					startScan();
				}}
				variant="default"
			>
				Start Scan
			</Button>
		{/if}
	{/if}


	{#if isScanning}
		<div class="space-y-3">
			<div class="flex items-center gap-3">
				<div class="animate-spin">
					<Scan class="h-5 w-5 text-black" />
				</div>
				<span class="text-black font-medium">Processing {currentProcessingMonth || '...'}</span>
				<span class="text-gray-600 text-sm">{Math.round(scanProgress)}%</span>
			</div>
			<div class="w-full bg-gray-200 rounded-full h-2">
				<div
					class="bg-black h-2 rounded-full transition-all duration-300"
					style="width: {scanProgress}%"
				></div>
			</div>
			<div class="text-sm text-gray-600">
				Found {emailsFound} emails
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
				Found {emailsFound} emails
			</div>
			<div class="mt-4 flex gap-2">
				<Button
					onclick={() => {
						// TODO: Navigate to results/dashboard
						console.log('View results clicked');
					}}
					variant="default"
				>
					View Results
				</Button>
				<Button
					onclick={() => {
						// TODO: Update/refresh recent emails
						console.log('Update emails clicked');
					}}
					variant="secondary"
				>
					Update Emails
				</Button>
				<Button
					onclick={startFreshScan}
					variant="secondary"
					class="inline-flex items-center gap-2"
				>
					<RotateCcw class="h-4 w-4" />
					Fresh Scan
				</Button>
			</div>
		</div>
	{/if}
</div>
