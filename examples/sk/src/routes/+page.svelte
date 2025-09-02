<script lang="ts">
    import { authClient } from "$lib/auth-client";
    import { Button } from "bits-ui";

    const session = authClient.useSession();

    function formatDate(date: string | Date) {
        return new Date(date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }
</script>

<div class="container">
    {#if $session.data}
        <div class="header">
            <h1 class="title">
                Welcome, {$session.data.user.name ||
                    $session.data.user.email ||
                    "User"}!
            </h1>
            <p class="subtitle">You are successfully authenticated</p>
        </div>

        <div class="card">
            <h2 class="section-title">
                <span class="status-dot green"></span>
                User Information
            </h2>

            <div class="grid">
                <div>
                    <div class="field">
                        <span class="field-label">Email</span>
                        <p class="field-value">
                            {$session.data.user.email}
                        </p>
                    </div>

                    {#if $session.data.user.name}
                        <div class="field">
                            <span class="field-label">Name</span>
                            <p class="field-value">
                                {$session.data.user.name}
                            </p>
                        </div>
                    {/if}

                    <div class="field">
                        <span class="field-label">Email Verification</span>
                        <p class="field-value">
                            {$session.data.user.emailVerified
                                ? "✅ Verified"
                                : "⏳ Unverified"}
                        </p>
                    </div>
                </div>

                <div>
                    <div class="field">
                        <span class="field-label">User ID</span>
                        <p class="field-value mono">
                            {$session.data.user.id}
                        </p>
                    </div>

                    <div class="field">
                        <span class="field-label">Created</span>
                        <p class="field-value">
                            {formatDate($session.data.user.createdAt)}
                        </p>
                    </div>

                    <div class="field">
                        <span class="field-label">Last Updated</span>
                        <p class="field-value">
                            {formatDate($session.data.user.updatedAt)}
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <div class="card">
            <h2 class="section-title">
                <span class="status-dot blue"></span>
                Current Session
            </h2>

            <div class="grid">
                <div>
                    <div class="field">
                        <span class="field-label">Session ID</span>
                        <p class="field-value mono">
                            {$session.data.session.id}
                        </p>
                    </div>

                    <div class="field">
                        <span class="field-label">Created</span>
                        <p class="field-value">
                            {formatDate($session.data.session.createdAt)}
                        </p>
                    </div>
                </div>

                <div>
                    <div class="field">
                        <span class="field-label">Expires</span>
                        <p class="field-value">
                            {formatDate($session.data.session.expiresAt)}
                        </p>
                    </div>

                    {#if $session.data.session.userAgent}
                        <div class="field">
                            <span class="field-label">User Agent</span>
                            <p class="field-value">
                                {$session.data.session.userAgent}
                            </p>
                        </div>
                    {/if}
                </div>
            </div>
        </div>

        <div class="actions">
            <Button.Root href="/sessions" class="btn btn-secondary">
                View All Sessions
            </Button.Root>
            <Button.Root href="/profile" class="btn btn-primary">
                Edit Profile
            </Button.Root>
        </div>
    {:else}
        <div class="welcome-container">
            <h1 class="welcome-title">SurrealDB + Better Auth</h1>
            <p class="welcome-text">
                A comprehensive example showcasing SurrealDB integration with
                better-auth in SvelteKit.<br />
                Sign in or create an account to explore the dashboard.
            </p>

            <div class="actions">
                <Button.Root href="/auth/sign/in" class="btn btn-primary">
                    Sign In
                </Button.Root>

                <Button.Root href="/auth/sign/up" class="btn btn-secondary">
                    Create Account
                </Button.Root>
            </div>
        </div>
    {/if}
</div>
