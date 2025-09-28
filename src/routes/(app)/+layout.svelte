<script lang="ts">
	import { onMount } from 'svelte';
	import { ensureTokenSilent, fetchAndCacheEmail, userEmail, signOut } from '$lib/auth';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { base } from '$app/paths';

	let ready = false;

	onMount(async () => {
		// Try to restore from sessionStorage or silently mint a new token
		const ok = await ensureTokenSilent('openid email https://www.googleapis.com/auth/gmail.modify');
		if (!ok) {
			const next = encodeURIComponent($page.url.pathname + $page.url.search);
			goto(`/login?next=${next}`);
			return;
		}
		await fetchAndCacheEmail(); // optional, for header display
		ready = true;
	});

	function logout() {
		signOut();
		goto('/login');
	}
</script>

<svelte:head>
	<link rel="stylesheet" href={`./src/app.css`} />
	<script src="https://apis.google.com/js/api.js"></script>
	<script src="https://accounts.google.com/gsi/client"></script>
</svelte:head>

{#if ready}
	<header class="border-b p-4 flex items-center justify-between">
		<a href="/dashboard" class="font-semibold">Sweep</a>
		<div class="text-sm flex items-center gap-3">
			{#if $userEmail}
				<span>{$userEmail}</span>
				<button class="border px-2 py-1 rounded" on:click={logout}>Sign out</button>
			{/if}
		</div>
	</header>
	<main class="p-6"><slot /></main>
{:else}
	<!-- tiny skeleton -->
	<main class="p-6 text-sm text-gray-500">Checking session…</main>
{/if}
