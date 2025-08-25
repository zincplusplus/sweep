<script lang="ts">
	import { signInWithGmailMetadata } from '$lib/auth';
	import { goto } from '$app/navigation';

	let email = '';
	let status: 'idle' | 'signing' | 'ok' | 'error' = 'idle';
	let msg = '';

	async function login() {
		try {
			status = 'signing';
			const { token } = await signInWithGmailMetadata(); // one popup, both scopes
			const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
				headers: { Authorization: `Bearer ${token}` }
			});
			const data = await resp.json();
			email = (data.email || '').toLowerCase();
			status = 'ok';
			goto('/dashboard');
		} catch (e: any) {
			status = 'error';
			// Helpful messages
			if (e?.type === 'popup_closed' || e?.type === 'popup_closed_by_user') {
				msg = 'This Google account is not allowed yet. Request access below.';
			} else if (e?.type === 'access_denied') {
				msg = 'Access denied by Google. Check Test users list.';
			} else {
				msg = e?.type || 'Sign-in failed.';
			}

			console.error('GIS error:', e);
		}
	}

	function requestAccess() {
		window.open(
			'https://docs.google.com/forms/d/e/1FAIpQLSeoXQfT0_KypaHIHRWWbRr5dplBGuCSZqDWbC1WNpSEIr5f3g/viewform?usp=dialog',
			'_blank'
		);
	}
</script>

<section class="max-w-md mx-auto py-10 space-y-4">
	<h1 class="text-2xl font-semibold">Sign in</h1>
	<button
		class="px-4 py-2 rounded bg-black text-white"
		on:click={login}
		disabled={status === 'signing'}
	>
		{#if status === 'idle'}Sign in with Google{/if}
		{#if status === 'signing'}Signing in…{/if}
		{#if status === 'ok'}Done{/if}
		{#if status === 'error'}Try again{/if}
	</button>

	{#if email}
		<p class="text-sm text-gray-500">Signed in as <strong>{email}</strong></p>
	{/if}

	{#if status === 'error'}
		<div class="rounded border border-amber-400/60 p-3">
			<p class="mb-2">{msg}</p>
			<button class="px-3 py-1 rounded border" on:click={requestAccess}>Request access</button>
		</div>
	{/if}
</section>
