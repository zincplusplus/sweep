<script>
	import { base } from '$app/paths';

	import { Rewind, Zap, Trash2 } from 'lucide-svelte';
</script>

<svelte:head>
	<link rel="stylesheet" href={`${base}/landingpage/reset.css`} />
	<link rel="stylesheet" href={`${base}/landingpage/style.css`} />
</svelte:head>

<main>
	<header>
		<img src={`${base}/logo.png`} alt="Sweep's logo" />
	</header>
	<section class="title">
		<h1>A clean inbox. Minus the subscription.</h1>
	</section>
	<section class="letter">
		<img src={`${base}/letter.svg`} alt="Letter Image" />
	</section>
	<section class="waitlist">
		<a
			class="waitlist-button"
			href="https://docs.google.com/forms/d/e/1FAIpQLSeoXQfT0_KypaHIHRWWbRr5dplBGuCSZqDWbC1WNpSEIr5f3g/viewform?usp=sf_link"
			target="_blank">Join Waitlist</a
		>
		<a class="access-button" href="./dashboard" rel="noopener noreferrer">I already have access</a>
	</section>

	<section class="features">
		<div class="feature">
			<div class="feature--title">
				<Zap size={20} />
				<span>Scan</span>
			</div>
			<div class="feature--content">On demand scan shows you what's safe to delete.</div>
		</div>
		<div class="feature">
			<div class="feature--title">
				<Trash2 size={20} />
				<span>Remove</span>
			</div>
			<div class="feature--content">
				Pick what you want to delete: from an entire category down to a single email.
			</div>
		</div>
		<div class="feature">
			<div class="feature--title">
				<Rewind size={20} />
				<span>Rewind</span>
			</div>
			<div class="feature--content">
				Made a mistake? Recover it from Gmail’s Trash within 30 days.
			</div>
		</div>
	</section>
</main>
