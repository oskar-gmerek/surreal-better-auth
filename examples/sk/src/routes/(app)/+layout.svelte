<script lang="ts">
    import { goto } from '$app/navigation';
    import { authClient } from '$lib/auth-client';

	let { children } = $props();


	const session = authClient.useSession();

	$effect(() => {
        if (!$session.isPending && !$session.isRefetching && !$session.data) {
            goto("/auth/sign/in");
        }
    });
</script>
    

{@render children?.()}