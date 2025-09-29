<script lang="ts">
	import { onMount } from 'svelte';
	import { Scan, RotateCcw } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { accessToken } from '$lib/auth';
	import { get } from 'svelte/store';
	import { emailDB, type EmailRecord, isScanComplete, getLastMonthWithData, parseEmailDetails } from '$lib/emaildb';

	// Overall scanning state
	let gmailInitialized = false;
	let canResume = false;
	let savedProgress: any = null;

	// Step 1: Find Emails (ID collection)
	let step1Complete = false;
	let step1Progress = 0;
	let step1Running = false;
	let currentProcessingMonth = '';
	let emailsFound = 0;

	// Step 2: Get Email Data (details fetching)
	let step2Complete = false;
	let step2Progress = 0;
	let step2Running = false;
	let emailsNeedingData = 0;
	let emailsProcessed = 0;
	let step2StartTime = 0;
	let step2EstimatedTimeRemaining = '';

	// Current active step (1 or 2)
	let currentStep = 1;

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

	async function checkScanStatus() {
		console.log('🔍 Checking scan status...');

		// Get counts
		emailsFound = await emailDB.getEmailCount();
		emailsProcessed = await emailDB.getEmailsWithDetailsCount();
		emailsNeedingData = await emailDB.getEmailsWithoutDetailsCount();

		console.log('📊 Current counts:', {
			emailsFound,
			emailsProcessed,
			emailsNeedingData
		});

		// Check Step 1 status
		savedProgress = await emailDB.loadScanProgress();
		const scanComplete = await isScanComplete();

		if (scanComplete && emailsFound > 0) {
			step1Complete = true;
			step1Progress = 100;
			currentStep = 2;
		} else if (savedProgress) {
			canResume = true;
			// Calculate Step 1 progress
			const [lastYear, lastMonth] = savedProgress.lastSuccessfulMonth.split('/').map(Number);
			const startYear = 2004;
			const startMonth = 4;
			const today = new Date();
			const endYear = today.getFullYear();
			const endMonth = today.getMonth() + 1;
			const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth + 1);
			const completedMonths = (lastYear - startYear) * 12 + (lastMonth - startMonth + 1);
			step1Progress = Math.round((completedMonths / totalMonths) * 100);
			currentStep = 1;
		}

		// Check Step 2 status
		if (emailsFound > 0) {
			if (emailsNeedingData === 0) {
				step2Complete = true;
				step2Progress = 100;
			} else {
				step2Progress = Math.round((emailsProcessed / emailsFound) * 100);
			}
		}

		console.log('📈 Scan status:', {
			step1Complete,
			step1Progress,
			step2Complete,
			step2Progress,
			currentStep,
			canResume
		});
	}

	function getMainButtonState() {
		// Case 1: Database is empty - Start Scan
		if (emailsFound === 0 && !step1Running && !step2Running) {
			return {
				text: 'Start Scan',
				action: () => {
					step1Running = true;
					currentStep = 1;
					startStep1();
				}
			};
		}

		// Case 2: Mid-process (either step 1 or step 2 incomplete) - Resume Scan
		if ((!step1Complete || !step2Complete) && !step1Running && !step2Running) {
			return {
				text: 'Resume Scan',
				action: resumeScan
			};
		}

		// Case 3: Everything complete - New Scan
		if (step1Complete && step2Complete) {
			return {
				text: 'New Scan',
				action: startFreshScan
			};
		}

		// Default case (scanning in progress) - no button
		return null;
	}

	function formatTimeEstimate(totalSeconds) {
		if (totalSeconds < 60) {
			return `${Math.round(totalSeconds)} seconds`;
		} else if (totalSeconds < 3600) {
			const minutes = Math.round(totalSeconds / 60);
			return `${minutes} minute${minutes === 1 ? '' : 's'}`;
		} else {
			const hours = Math.floor(totalSeconds / 3600);
			const minutes = Math.round((totalSeconds % 3600) / 60);
			return `${hours} hour${hours === 1 ? '' : 's'}${minutes > 0 ? ` ${minutes} min` : ''}`;
		}
	}

	function updateStep2TimeEstimate(processedCount) {
		if (step2StartTime === 0 || processedCount === 0) {
			step2EstimatedTimeRemaining = '';
			return;
		}

		const elapsedTime = (Date.now() - step2StartTime) / 1000; // seconds
		const emailsPerSecond = processedCount / elapsedTime;
		const remainingEmails = emailsNeedingData - processedCount;

		if (emailsPerSecond > 0 && remainingEmails > 0) {
			const estimatedSecondsRemaining = remainingEmails / emailsPerSecond;
			step2EstimatedTimeRemaining = `~${formatTimeEstimate(estimatedSecondsRemaining)} remaining`;
		} else {
			step2EstimatedTimeRemaining = '';
		}
	}

	onMount(async () => {
		// Initialize Gmail API and Database
		await initializeGmailAPI();
		await emailDB.init();

		// Check current scan status
		await checkScanStatus();
	});

	async function startStep2() {
		console.log('🚀 Starting Step 2: Get Email Data...');
		step2Running = true;
		currentStep = 2;
		step2StartTime = Date.now();
		step2EstimatedTimeRemaining = '';

		try {
			const rateLimiter = new RateLimiter(5, 1000);
			let processedCount = 0;

			while (true) {
				// Find next email without details
				const emailWithoutDetails = await emailDB.getFirstEmailWithoutDetails();

				if (!emailWithoutDetails) {
					console.log('✅ Step 2 Complete - All emails have details');
					step2Complete = true;
					step2Progress = 100;
					step2Running = false;
					break;
				}

				console.log(`📧 Processing email ${processedCount + 1}/${emailsNeedingData}: ${emailWithoutDetails.id}`);

				// Fetch email details from Gmail API
				const response = await rateLimiter.executeWithRetry(async () => {
					// @ts-ignore
					return await gapi.client.gmail.users.messages.get({
						userId: 'me',
						id: emailWithoutDetails.id,
						format: 'metadata',
						metadataHeaders: ['From', 'To', 'Subject', 'Date', 'List-Unsubscribe']
					});
				}, `Fetching email details for ${emailWithoutDetails.id}`);

				// Parse email details (includes sizeEstimate)
				const emailDetails = parseEmailDetails(response.result);
				console.log('✨ Parsed details:', emailDetails);

				// Update email in database
				await emailDB.updateEmailWithDetails(emailWithoutDetails.id, emailDetails);

				// Update progress
				processedCount++;
				emailsProcessed = processedCount + (emailsFound - emailsNeedingData);
				step2Progress = Math.round((emailsProcessed / emailsFound) * 100);

				// Update time estimate
				updateStep2TimeEstimate(processedCount);

				console.log(`💾 Saved email details. Progress: ${step2Progress}% (${emailsProcessed}/${emailsFound}) ${step2EstimatedTimeRemaining}`);

				// Small delay to prevent overwhelming the UI
				await new Promise(resolve => setTimeout(resolve, 100));
			}

		} catch (error) {
			console.error('❌ Error in Step 2:', error);
			step2Running = false;
		}
	}

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
		console.log('🔄 Starting fresh scan - clearing all data...');
		await emailDB.clearScanProgress();
		await emailDB.clearAllEmails();

		// Reset all state
		canResume = false;
		savedProgress = null;
		step1Complete = false;
		step1Progress = 0;
		step2Complete = false;
		step2Progress = 0;
		emailsFound = 0;
		emailsProcessed = 0;
		emailsNeedingData = 0;
		currentStep = 1;

		// Start Step 1
		step1Running = true;
		startStep1();
	}

	async function findNewEmails() {
		console.log('🔍 Finding new emails...');

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

		// Start Step 1 from the last month we have data for
		step1Running = true;
		currentStep = 1;
		step1Complete = false;
		startStep1FromMonth(lastYear, lastMonthNum);
	}

	async function resumeScan() {
		console.log('▶️ Resuming scan...');

		if (currentStep === 1 && !step1Complete) {
			step1Running = true;
			startStep1();
		} else if (currentStep === 2 && !step2Complete) {
			step2Running = true;
			startStep2();
		}
	}

	async function startStep1() {
		console.log('🚀 Starting Step 1: Find Emails...');
		startStep1FromMonth(2004, 4);
	}

	async function startStep1FromMonth(startYear: number, startMonth: number) {
		console.log(`🔍 Starting Step 1 from ${startYear}/${startMonth}...`);

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
					step1Progress = progressPercent;

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
			console.log(`✅ Step 1 completed! Total emails in database: ${finalEmailCount}`);
			console.log(`First email received in: ${firstEmailMonth || 'No emails found'}`);

			// Update Step 1 state
			step1Running = false;
			step1Complete = true;
			step1Progress = 100;
			emailsFound = finalEmailCount;
			currentStep = 2;

			// Clear scan progress on completion
			await emailDB.clearScanProgress();
			canResume = false;

			// Update counts for Step 2
			await checkScanStatus();

			console.log(`🔄 Step 1 complete. Auto-starting Step 2 with ${emailsNeedingData} emails needing data...`);

			// Automatically start Step 2
			if (emailsNeedingData > 0) {
				step2Running = true;
				startStep2();
			} else {
				console.log('✅ All emails already have details - Step 2 not needed');
				step2Complete = true;
				step2Progress = 100;
			}
		} catch (error) {
			console.error('❌ Error during Step 1:', error);
			step1Running = false;
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
	<div class="flex items-center gap-4 mb-6">
		<div class="p-3 border rounded-lg">
			<Scan class="h-6 w-6 text-black" />
		</div>
		<div>
			<h2 class="text-xl font-semibold text-black">Scan Inbox</h2>
			<p class="text-gray-600 text-sm">Analyze your Gmail inbox for cleanup opportunities</p>
		</div>
	</div>

	<!-- Step 1: Find Emails -->
	<div class="border rounded-lg p-4 mb-4 bg-gray-50">
		<div class="flex items-center gap-3 mb-3">
			<div class="flex items-center">
				{#if step1Complete}
					<div class="p-1 bg-green-500 rounded-full">
						<svg class="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
						</svg>
					</div>
				{:else}
					<div class="w-5 h-5 border-2 border-gray-300 rounded-full"></div>
				{/if}
			</div>
			<h3 class="font-medium text-black">Step 1: Find Emails</h3>
			{#if step1Running}
				<div class="animate-spin">
					<Scan class="h-4 w-4 text-black" />
				</div>
				<span class="text-sm text-gray-600">Processing {currentProcessingMonth}</span>
			{/if}
		</div>
		<div class="w-full bg-gray-200 rounded-full h-2 mb-2">
			<div class="bg-blue-500 h-2 rounded-full transition-all duration-300" style="width: {step1Progress}%"></div>
		</div>
		<div class="text-sm text-gray-600">
			{#if step1Complete}
				✅ Complete - Found {emailsFound} emails
			{:else if step1Running}
				{step1Progress}% - Found {emailsFound} emails so far
			{:else}
				Ready to scan for email IDs
			{/if}
		</div>
	</div>

	<!-- Step 2: Get Email Data -->
	<div class="border rounded-lg p-4 mb-4 bg-gray-50">
		<div class="flex items-center gap-3 {step1Complete ? 'mb-3' : ''}">
			<div class="flex items-center">
				{#if step2Complete}
					<div class="p-1 bg-green-500 rounded-full">
						<svg class="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
						</svg>
					</div>
				{:else}
					<div class="w-5 h-5 border-2 border-gray-300 rounded-full"></div>
				{/if}
			</div>
			<h3 class="font-medium text-black">Step 2: Get Email Data</h3>
			{#if step2Running}
				<div class="animate-spin">
					<Scan class="h-4 w-4 text-black" />
				</div>
				<span class="text-sm text-gray-600">Fetching details...</span>
			{/if}
		</div>

		{#if step1Complete}
			<div class="w-full bg-gray-200 rounded-full h-2 mb-2">
				<div class="bg-green-500 h-2 rounded-full transition-all duration-300" style="width: {step2Progress}%"></div>
			</div>
			<div class="text-sm text-gray-600">
				{#if step2Complete}
					✅ Complete - Processed {emailsProcessed} emails
				{:else if step2Running}
					{step2Progress}% - Processed {emailsProcessed} / {emailsFound} emails
					{#if step2EstimatedTimeRemaining}
						<br><span class="text-blue-600">{step2EstimatedTimeRemaining}</span>
					{/if}
				{:else}
					Ready to fetch email details ({emailsNeedingData} emails need data)
				{/if}
			</div>
		{/if}
	</div>

	<!-- Control Buttons -->
	<div class="flex gap-2">
		{#if !step1Running && !step2Running}
			{@const mainButton = getMainButtonState()}
			{#if mainButton}
				<Button onclick={mainButton.action} variant="default">
					{mainButton.text}
				</Button>
			{/if}

			{#if emailsFound > 0 && !step1Complete}
				<Button onclick={findNewEmails} variant="secondary">
					Find New Emails
				</Button>
			{/if}
		{/if}
	</div>

	{#if step1Complete && step2Complete}
		<div class="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
			<div class="flex items-center gap-3 text-green-800">
				<div class="p-1 bg-green-500 rounded-full">
					<svg class="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
					</svg>
				</div>
				<span class="font-medium">Scan completed successfully!</span>
			</div>
			<div class="text-sm text-green-700 mt-2">
				Found and processed {emailsFound} emails with full details including size estimates and unsubscribe headers.
			</div>
		</div>
	{/if}
</div>
