<script lang="ts">
    import { goto } from '$app/navigation';
	import favicon from '$lib/assets/favicon.svg';
	import { authClient } from "$lib/auth-client";
	import { Button } from "bits-ui";

	let { children } = $props();
	
	const session = authClient.useSession();

	async function logout() {
		await authClient.signOut({
			fetchOptions: {onSuccess: () => goto('/auth/sign/in')}
		});
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>SurrealDB + Better Auth</title>
</svelte:head>

<div class="app">
	{#if $session.data}
		<nav class="navbar">
			<div class="nav-container">
				<div class="nav-brand">
					<a href="/" class="brand-link">surreal-better-auth adapter demo</a>
				</div>
				
				<div class="nav-links">
					<a href="/" class="nav-link">Dashboard</a>
					<a href="/sessions" class="nav-link">Sessions</a>
					<a href="/profile" class="nav-link">Profile</a>
					<a href="/org" class="nav-link">Organization</a>
				</div>
				
				<div class="nav-user">
					<span class="user-email">{$session.data.user.email}</span>
					<Button.Root onclick={logout} class="btn btn-sm btn-outline">
						Sign Out
					</Button.Root>
				</div>
			</div>
		</nav>
	{/if}

	<main class="main-content">
		<svelte:boundary>
			{@render children?.()}
			{#snippet pending()}
				<div class="loading">Loading...</div>
			{/snippet}
		</svelte:boundary>
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		font-family: system-ui, -apple-system, sans-serif;
		background-color: #111827;
		color: #f9fafb;
	}

	.app {
		min-height: 100vh;
		background-color: #111827;
	}

	.navbar {
		background-color: #1f2937;
		border-bottom: 1px solid #374151;
		padding: 0;
	}

	.nav-container {
		max-width: 1200px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 2rem;
	}

	.nav-brand .brand-link {
		font-size: 1.25rem;
		font-weight: bold;
		color: #f9fafb;
		text-decoration: none;
	}

	.nav-brand .brand-link:hover {
		color: #3b82f6;
	}

	.nav-links {
		display: flex;
		gap: 2rem;
	}

	.nav-link {
		color: #d1d5db;
		text-decoration: none;
		font-weight: 500;
		transition: color 0.2s;
	}

	.nav-link:hover {
		color: #f9fafb;
	}

	.nav-user {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.user-email {
		font-size: 0.875rem;
		color: #9ca3af;
	}

	.main-content {
		padding: 2rem 0;
	}

	.loading {
		text-align: center;
		padding: 2rem;
		color: #9ca3af;
	}

	/* Global button styles */
	:global(.btn) {
		padding: 0.75rem 1.5rem;
		border-radius: 8px;
		font-weight: 500;
		text-decoration: none;
		border: none;
		cursor: pointer;
		transition: all 0.2s;
		display: inline-block;
		font-size: 0.875rem;
	}

	:global(.btn-sm) {
		padding: 0.5rem 1rem;
		font-size: 0.75rem;
	}

	:global(.btn-primary) {
		background-color: #3b82f6;
		color: white;
	}

	:global(.btn-primary:hover) {
		background-color: #2563eb;
	}

	:global(.btn-danger) {
		background-color: #ef4444;
		color: white;
	}

	:global(.btn-danger:hover) {
		background-color: #dc2626;
	}

	:global(.btn-secondary) {
		background-color: #374151;
		color: #f9fafb;
		border: 1px solid #4b5563;
	}

	:global(.btn-secondary:hover) {
		background-color: #4b5563;
	}

	:global(.btn-outline) {
		background-color: transparent;
		color: #d1d5db;
		border: 1px solid #4b5563;
	}

	:global(.btn-outline:hover) {
		background-color: #374151;
		color: #f9fafb;
	}

	/* Global container styles */
	:global(.container) {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 2rem;
	}

	:global(.card) {
		background: #1f2937;
		border-radius: 12px;
		padding: 1.5rem;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
		margin-bottom: 1.5rem;
		border: 1px solid #374151;
	}

	:global(.grid) {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1rem;
	}

	@media (min-width: 640px) {
		:global(.grid) {
			grid-template-columns: 1fr 1fr;
		}
	}

	:global(.field) {
		margin-bottom: 1rem;
	}

	:global(.field-label) {
		display: block;
		font-size: 0.75rem;
		font-weight: 500;
		color: #9ca3af;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.25rem;
	}

	:global(.field-value) {
		font-size: 1rem;
		color: #f9fafb;
		margin: 0;
	}

	:global(.field-value.mono) {
		font-family: ui-monospace, monospace;
		font-size: 0.875rem;
		background: #374151;
		padding: 0.5rem;
		border-radius: 4px;
		color: #d1d5db;
	}

	:global(.header) {
		text-align: center;
		margin-bottom: 2rem;
	}

	:global(.title) {
		font-size: 2.25rem;
		font-weight: bold;
		color: #f9fafb;
		margin: 0 0 0.5rem 0;
	}

	:global(.subtitle) {
		font-size: 1rem;
		color: #9ca3af;
		margin: 0;
	}

	:global(.section-title) {
		font-size: 1.25rem;
		font-weight: 600;
		color: #f9fafb;
		margin: 0 0 1rem 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	:global(.status-dot) {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	:global(.status-dot.green) {
		background-color: #10b981;
	}

	:global(.status-dot.blue) {
		background-color: #3b82f6;
	}

	:global(.actions) {
		display: flex;
		gap: 0.75rem;
		justify-content: center;
		margin-top: 2rem;
	}

	:global(.welcome-container) {
		text-align: center;
		max-width: 600px;
		margin: 0 auto;
	}

	:global(.welcome-title) {
		font-size: 3rem;
		font-weight: bold;
		color: #f9fafb;
		margin: 0 0 1rem 0;
	}

	:global(.welcome-text) {
		font-size: 1.125rem;
		color: #9ca3af;
		line-height: 1.6;
		margin: 0 0 3rem 0;
	}

	/* Additional global styles */
	:global(.btn-xs) {
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
	}

	:global(.status-dot.orange) {
		background-color: #f59e0b;
	}

	:global(.status-dot.red) {
		background-color: #ef4444;
	}

	/* Responsive navigation */
	@media (max-width: 768px) {
		.nav-container {
			flex-direction: column;
			gap: 1rem;
			padding: 1rem;
		}

		.nav-links {
			gap: 1rem;
		}

		.nav-user {
			flex-direction: column;
			gap: 0.5rem;
		}
	}
</style>
