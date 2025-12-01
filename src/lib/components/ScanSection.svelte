<script lang="ts">
	import { onMount } from 'svelte';
	import { Scan, RotateCcw, Check, CircleCheck, Circle } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { accessToken } from '$lib/auth';
	import { get } from 'svelte/store';
	import { emailDB, type EmailRecord, getLastMonthWithData, parseEmailDetails } from '$lib/emaildb';

	// Overall scanning state
	let gmailInitialized = false;

	let emailFoundCount = 0;
	let emailParsedCount = 0;
	let lastMonthIndexed:String|null = null;
	let currentStep = 0;
	const stepLabes = ['Not Started', 'Find Emails', 'Get Email Data', 'Complete'];
	let activelyScanning = false;

	function lastIndexedMonthInPast() {
		if (!lastMonthIndexed) return false;
		const [year, month] = lastMonthIndexed.split('/').map(Number);
		const today = new Date();
		const thisYear = today.getFullYear();
		const thisMonth = today.getMonth() + 1; // getMonth() is 0-indexed
		const result = year < thisYear || (year === thisYear && month < thisMonth);
		return result;
	};




	// const scanInProgressKey = 'scanInProgress';
	// let isScanInProgress = false;

	// const lastScannedMonthKey = 'lastScannedMonth';
	// let lastScannedMonth: string | null = null;


	// let emailFoundCount = 0;
	// let emailCountParsed = 0;
	// $: hasNeverScanned = !isScanInProgress && emailFoundCount === 0;
	// $: currentStep = (() => {
	// 	console.log(isScanInProgress, emailFoundCount, emailCountParsed, lastScaIndexednthInPast);
	// 	if(!isScanInProgress) return 0;
	// 	if(IndexedountFound > 0 && lastScannedMonthInPast) return 1;
	// 	if(emailCountParsed < emailFoundCount) return 2;
	// 	return 3;
	// })();
	// const stepLabes = ['Not Started', 'Find Emails', 'Get Email Data', 'Complete'];


	// let savedProgress: any = null;

	// Step 1: Find Emails (ID collection)
	$: step1Complete = currentStep > 1;
	$: step1Running = currentStep === 1 && activelyScanning;
	let currentProcessingMonth = '';
		$: step1Progress = () => {
		if(!lastMonthIndexed) return 0;
		const [lastYear, lastMonth] = lastMonthIndexed.split('/').map(Number);
		const startYear = 2004;
		const startMonth = 4;
		const today = new Date();
		const endYear = today.getFullYear();
		const endMonth = today.getMonth() + 1;
		const totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth + 1);
		const completedMonths = (lastYear - startYear) * 12 + (lastMonth - startMonth + 1);
		return Math.round((completedMonths / totalMonths) * 100);
	};

	// Step 2: Get Email Data (details fetching)
	$: step2Complete = currentStep > 2;
	$: step2Running = currentStep === 2 && activelyScanning;
	$: emailsNeedingData = emailFoundCount - emailParsedCount;
	$: step2Progress = emailFoundCount === 0 ? 0 : Math.round((emailParsedCount / emailFoundCount) * 100);
	let step2StartTime = 0;
	let step2EstimatedTimeRemaining = '';

	// Current active step (1 or 2)
	// let currentStep = 1;

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

		// 1: load some data
		// - look in localStorage and see if there is a flaged for scan in progress
		// - look in db and see if there are any emails, and if yes what is the most recent month indexed

		// 2. if there is a flag for scan in progress, check what is the last month scanned
		// - if it's this month then mark step 1 as complete
		// - if it's not this month then mark step 1 as incomplete and set current month to last month scanned + 1
		// if there is no flag, but the current month is not this month then mark as needs update

		// 3. if the most recent month is this month, check how many emails have details
		// - if all have details then mark step 2 as complete
		// - if some are missing details then mark step 2 as incomplete and set progress accordingly

		emailFoundCount = await emailDB.getEmailCount();
		emailParsedCount = await emailDB.getEmailsWithDetailsCount();
		lastMonthIndexed = await getLastMonthWithData();

		if (emailFoundCount === 0 ) {
			currentStep = 0;
		} else if(lastIndexedMonthInPast()) {
			currentStep = 1;
		}else if(emailParsedCount < emailFoundCount) {
			currentStep = 2;
		} else {
			currentStep = 3;
		}
		console.log('🐛 currentStep', currentStep, stepLabes[currentStep])

		// isScanInProgress = localStorage.getItem(scanInProgressKey) === 'true';
		// lastScannedMonth = localStorage.getItem(lastScannedMonthKey) || null;
		// emailFoundCount = await emailDB.getEmailCount();

		// console.log('🐛 isScanInProgress:', isScanInProgress);
		console.log('🐛 Emails:', emailFoundCount);
		// console.log('🐛 hasNeverScanned:', hasNeverScanned);
		// console.log('🐛 currentStep:', currentStep, stepLabes[currentStep]);
		console.log('🐛 lastMonthIndexed:', lastMonthIndexed);
		console.log('🐛 lastIndexedMonthInPast:', lastIndexedMonthInPast());

		// if(isScanInProgress && emailFoundCount === 0) {
		// 	console.log('⚠️ Scan was in progress but no emails found - starting fresh scan');
		// 	localStorage.removeItem(scanInProgressKey);
		// 	isScanInProgress = false;
		// }

		/*

		// const today = new Date();
		// const thisYear = today.getFullYear();
		// const thisMonth = today.getMonth() + 1; // getMonth() is 0-indexed


		//1. get all the email ids, check the most recent month
		// - if the recent month is this month
		//2. check how many have details

		// Get counts
		emailFoundCount = await emailDB.getEmailCount();
		emailParsedCount = await emailDB.getEmailsWithDetailsCount();
		emailsNeedingData = await emailDB.getEmailsWithoutDetailsCount();

		console.log('📊 Current counts:', {
		emailFoundCount,
		emailParsedCount,
		emailsNeedingData
		});

		// Check Step 1 status
		savedProgress = await emailDB.loadScanProgress();
		const scanComplete = await isScanComplete();

		if (scanComplete && emailFoundCount > 0) {
		step1Progress = 100;
		currentStep = 2;
		} else if (savedProgress) {
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
		if (emailFoundCount > 0) {
		if (emailsNeedingData === 0) {

		} else {

		}
		}
		*/
		// console.log('📈 Scan status:', {
		// 	step1Progress,
		// 	currentStep,
		// });
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
		// TODO This is not accurate and runs out 1 minute sooner at least
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
		currentStep = 2;
		activelyScanning = true;
		step2StartTime = Date.now();
		step2EstimatedTimeRemaining = '';

		const BATCH_SIZE = 50; // Conservative batch size
		const rateLimiter = new RateLimiter(5, 1000);
		let totalProcessedCount = 0;

		try {
			while (true) {
				// Get next batch of emails without details
				const emailBatch = await emailDB.getEmailsWithoutDetails(BATCH_SIZE);

				if (emailBatch.length === 0) {
					console.log('✅ Step 2 Complete - All emails have details');
					break;
				}

				console.log(`📧 Processing batch of ${emailBatch.length} emails (${totalProcessedCount + 1}-${totalProcessedCount + emailBatch.length} of ${emailsNeedingData})`);

				// Start timing for rate limiting
				const batchStartTime = Date.now();

				// Create batch request
				// @ts-ignore
				const batch = gapi.client.newBatch();
				const batchRequests: Record<string, string> = {}; // Maps batch ID to email ID

				emailBatch.forEach((email, index) => {
					const batchId = `email_${index}`;
					batchRequests[batchId] = email.id;

					// @ts-ignore
					batch.add(gapi.client.gmail.users.messages.get({
						userId: 'me',
						id: email.id,
						format: 'metadata',
						metadataHeaders: ['From', 'To', 'Subject', 'Date', 'List-Unsubscribe']
					}), { id: batchId });
				});

				// Execute batch request with rate limiting
				const batchResults = await rateLimiter.executeWithRetry(async () => {
					return await batch;
				}, `Fetching batch of ${emailBatch.length} email details`);

				console.log('✨ Batch response received, processing results...');

				// Process batch results
				const updatePromises = [];
				for (const [batchId, response] of Object.entries(batchResults.result)) {
					const emailId = batchRequests[batchId];
					if (emailId && response && response.result) {
						const emailDetails = parseEmailDetails(response.result);
						updatePromises.push(emailDB.updateEmailWithDetails(emailId, emailDetails));
					} else {
						console.warn(`Failed to get details for batch ID ${batchId}:`, response);
					}
				}

				// Wait for all database updates to complete
				await Promise.all(updatePromises);

				// Update progress
				const batchProcessedCount = updatePromises.length;
				totalProcessedCount += batchProcessedCount;
				emailParsedCount += batchProcessedCount;

				// Update time estimate
				updateStep2TimeEstimate(totalProcessedCount);

				console.log(`💾 Saved ${batchProcessedCount} email details. Progress: ${step2Progress}% (${emailParsedCount}/${emailFoundCount}) ${step2EstimatedTimeRemaining}`);

				// Rate limiting between batches (1 second)
				await new Promise(resolve => setTimeout(resolve, 1000));
			}

		} catch (error) {
			console.error('❌ Error in Step 2:', error);
		} finally {
			activelyScanning = false;
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
		const confirmed = confirm(
		"Start Fresh Scan?\n\n" +
		"This will delete all existing email data and start the entire scanning process from scratch. " +
		"This is a lengthy process that will re-scan your entire Gmail inbox and re-fetch all email details.\n\n" +
		"Are you sure you want to continue?"
		);

		if (!confirmed) {
			return;
		}

		console.log('🔄 Starting fresh scan - clearing all data...');
		await emailDB.clearAllEmails();

		// Reset all state
		emailFoundCount = 0;
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

		startStep1FromMonth(lastYear, lastMonthNum);
	}

	async function startStep1() {
		console.log('🚀 Starting Step 1: Find Emails...');
		startStep1FromMonth(2004, 4); // when Gmail launched
	}

	async function startStep1FromMonth(startYear: number, startMonth: number) {
		console.log(`🔍 Starting Step 1 from ${startYear}/${startMonth}...`);
		activelyScanning = true;
		currentStep = 1;

		// Use today's date for end point
		const today = new Date();
		const endYear = today.getFullYear();
		const endMonth = today.getMonth() + 1; // getMonth() returns 0-11, so add 1

		// Check for existing scan progress
		const lastIndexedMonth = await getLastMonthWithData();
		console.log('🐛 Last indexed month:', lastIndexedMonth);
		let currentYear = startYear;
		let currentMonth = startMonth;
		let monthsCompleted = 0;

		// if (savedProgress) {
		// 	const [lastYear, lastMonth] = savedProgress.lastSuccessfulMonth.split('/').map(Number);
		// 	currentYear = lastYear;
		// 	currentMonth = lastMonth + 1; // Resume from next month

		// 	// Handle year rollover
		// 	if (currentMonth > 12) {
		// 		currentMonth = 1;
		// 		currentYear++;
		// 	}

		// 	// Calculate months already completed
		// 	monthsCompleted = (lastYear - startYear) * 12 + (lastMonth - startMonth + 1);
		// 	console.log(`Resuming scan from ${currentYear}/${currentMonth}, ${monthsCompleted} months already completed`);
		// }

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
					emailFoundCount += newEmails.length;
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

					lastMonthIndexed = `${currentYear}/${currentMonth}`;

					// Save progress after completing a month
					// let month = `${currentYear}/${currentMonth}`
					// localStorage.setItem(lastScannedMonthKey, month);
					// lastScannedMonth = month;

					// Update UI progress
					// step1Progress = progressPercent;

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
			emailFoundCount = finalEmailCount;
			currentStep = 2;

			console.log(`🔄 Step 1 complete. Auto-starting Step 2 with ${emailsNeedingData} emails needing data...`);

			// Automatically start Step 2
			if (emailsNeedingData > 0) {
				startStep2();
			} else {
				console.log('✅ All emails already have details - Step 2 not needed');
				step2Complete = true;
			}
		} catch (error) {
			console.error('❌ Error during Step 1:', error);
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

	{#if currentStep === 3}
	<div class="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
		<div class="flex items-center gap-3 text-green-800">
			<CircleCheck class="h-5 w-5 text-green-600" />
			<span class="font-medium">Scan completed successfully!</span>
		</div>
		<div class="text-sm text-green-700 mt-2">
			Found and processed {emailFoundCount} emails with full details including size estimates and unsubscribe headers.
		</div>
	</div>
	{:else}
	<!-- Step 1: Find Emails -->
	<div class="border rounded-lg p-4 mb-4 bg-gray-50">
		<div class="flex items-center gap-3">
			<div class="flex items-center">
				{#if step1Complete}
				<div class="p-1 bg-green-500 rounded-full">
					<Check class="h-3 w-3 text-white" />
				</div>
				{:else}
				<Circle class="h-5 w-5 text-gray-400" />
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
		<div class="w-full bg-gray-200 rounded-full h-2 mb-2 mt-3">
			<div class="bg-blue-500 h-2 rounded-full transition-all duration-300" style="width:
			{step1Progress()}%"></div>
		</div>
		<div class="text-sm text-gray-600">
			{#if currentStep > 1}
			Complete - Found {emailFoundCount} emails
			{:else if currentStep === 1}
			{step1Progress()}% - Found {emailFoundCount} emails so far. Last processed month: {lastMonthIndexed}
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
					<Check class="h-3 w-3 text-white" />
				</div>
				{:else}
				<Circle class="h-5 w-5 text-gray-400" />
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
				<div class="bg-blue-500 h-2 rounded-full transition-all duration-300" style="width: {step2Progress}%"></div>
			</div>
			<div class="text-sm text-gray-600">
				{#if step2Complete}
					Complete - Processed {emailParsedCount} emails
				{:else if currentStep === 2}
					{step2Progress}% - Processed {emailParsedCount} / {emailFoundCount} emails
					{#if step2EstimatedTimeRemaining}
						<br><span class="text-blue-600">{step2EstimatedTimeRemaining}</span>
					{/if}
				{:else}
					Ready to fetch email details ({emailsNeedingData} emails need data)
				{/if}
			</div>
		{/if}
	</div>
	{/if}

	<!-- Control Buttons -->
	<div class="flex gap-2">
		{#if currentStep === 1}
			<Button onclick={findNewEmails} variant="default" disabled={step1Running}>
				Find latest emails
			</Button>
		{:else if currentStep === 2}
			<Button onclick={startStep2} variant="default" disabled={step2Running}>
				Get email data
			</Button>
		{:else if currentStep === 3}
			<Button onclick={startFreshScan} variant="default" class="inline-flex items-center gap-2">
				<RotateCcw class="h-4 w-4" />
				Fresh scan
			</Button>
		{:else}
			<Button onclick={startStep1} variant="default">
				Start Scan
			</Button>
		{/if}

		{#if currentStep !== 3}
		<Button onclick={startFreshScan} variant="secondary" class="inline-flex items-center gap-2">
			<RotateCcw class="h-4 w-4" />
			Fresh Scan
		</Button>
		{/if}
	</div>
</div>
