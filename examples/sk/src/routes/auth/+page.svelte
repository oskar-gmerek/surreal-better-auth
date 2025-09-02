<script lang="ts">
    import { goto } from "$app/navigation";
    import { authClient, } from "$lib/auth-client";

    const session = authClient.useSession()

    if ($session.data) {
        goto( '/')
    }

    if ($session.error && !$session.isPending && !$session.isRefetching || !$session.data) {
        goto( '/auth/sign/in')
    }
</script>