<!-- src/routes/(protected)/dashboard/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Play, Pause, RotateCw, Trash2, Tag, Inbox } from 'lucide-svelte';

	let scanning = false;
	let progress = 0;
	let lastScan: string | null = null;
	let timer: number | null = null;

	const LS_KEY = 'sweep.lastScan';

	onMount(() => {
		lastScan = localStorage.getItem(LS_KEY);
	});

	function startScan() {
		if (scanning) return;
		scanning = true;
		progress = 0;
		timer = window.setInterval(() => {
			progress = Math.min(100, progress + Math.random() * 8 + 2);
			if (progress >= 100) finishScan();
		}, 180);
	}

	function pauseScan() {
		if (timer) window.clearInterval(timer);
		timer = null;
		scanning = false;
	}

	function finishScan() {
		if (timer) window.clearInterval(timer);
		timer = null;
		scanning = false;
		progress = 100;
		lastScan = new Date().toISOString();
		localStorage.setItem(LS_KEY, lastScan);
	}

	function resumeOrRestart() {
		startScan();
	}

	function fmt(dt: string | null) {
		if (!dt) return '—';
		const d = new Date(dt);
		return d.toLocaleString();
	}
</script>

<div class="mx-auto max-w-5xl space-y-6">
	<!-- Page header inside main -->
	<div class="flex items-end justify-between">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Dashboard</h1>
			<p class="text-sm text-gray-500">Scan your mailbox and get a cleanup plan.</p>
		</div>

		<div class="flex gap-2">
			{#if !scanning}
				<button
					class="inline-flex items-center gap-2 rounded-lg px-3 py-2 bg-black text-white"
					on:click={startScan}
				>
					<Play class="w-4 h-4" /> Start scan
				</button>
			{:else}
				<button
					class="inline-flex items-center gap-2 rounded-lg px-3 py-2 border"
					on:click={pauseScan}
				>
					<Pause class="w-4 h-4" /> Pause
				</button>
			{/if}
			<button
				class="inline-flex items-center gap-2 rounded-lg px-3 py-2 border"
				on:click={resumeOrRestart}
				title="Restart"
			>
				<RotateCw class="w-4 h-4" /> Restart
			</button>
		</div>
	</div>

	<!-- Status card -->
	<div class="rounded-2xl border bg-white/60 backdrop-blur p-4">
		<div class="flex items-center justify-between">
			<div class="space-y-1">
				<p class="text-sm text-gray-500">Last scan</p>
				<p class="font-medium">{fmt(lastScan)}</p>
			</div>
			<div class="w-64">
				<div class="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
					<div class="h-full bg-black transition-all" style={`width:${progress}%`}></div>
				</div>
				<p class="mt-1 text-right text-xs text-gray-500">{Math.floor(progress)}%</p>
			</div>
		</div>
	</div>

	<!-- 3-up summary cards (placeholders) -->
	<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
		<div class="rounded-2xl border bg-white/60 p-4">
			<div class="flex items-center gap-2 text-gray-600">
				<Inbox class="w-4 h-4" />
				<span class="text-sm">Mailbox size</span>
			</div>
			<p class="mt-2 text-2xl font-semibold">—</p>
			<p class="text-xs text-gray-500">messages detected</p>
		</div>

		<div class="rounded-2xl border bg-white/60 p-4">
			<div class="flex items-center gap-2 text-gray-600">
				<Tag class="w-4 h-4" />
				<span class="text-sm">Newsletters</span>
			</div>
			<p class="mt-2 text-2xl font-semibold">—</p>
			<p class="text-xs text-gray-500">senders to review</p>
		</div>

		<div class="rounded-2xl border bg-white/60 p-4">
			<div class="flex items-center gap-2 text-gray-600">
				<Trash2 class="w-4 h-4" />
				<span class="text-sm">Auto-trash candidates</span>
			</div>
			<p class="mt-2 text-2xl font-semibold">—</p>
			<p class="text-xs text-gray-500">messages safe to remove</p>
		</div>
	</div>

	<!-- Recent activity / actions placeholder -->
	<div class="rounded-2xl border bg-white/60 p-4">
		<h2 class="font-medium">Recent activity</h2>
		<ul class="mt-2 space-y-2 text-sm text-gray-600">
			<li>No actions yet. Start a scan to populate this section.</li>
		</ul>
	</div>
</div>
