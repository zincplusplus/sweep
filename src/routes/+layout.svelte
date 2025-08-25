<script lang="ts">
	let { children } = $props();
</script>

<svelte:head>
	<script src="https://accounts.google.com/gsi/client" async defer></script>
</svelte:head>

{@render children?.()}
