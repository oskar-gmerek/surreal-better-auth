<script lang="ts">
    import { goto } from "$app/navigation";
    import { authClient, signIn } from "$lib/auth-client";
    import { Button } from "bits-ui";

    const session = authClient.useSession();
    let email = $state('');
    let password = $state('');
    let loading = $state(false);
    let error = $state('');

    const handleSignIn = async (event: SubmitEvent) => {
        event.preventDefault();
        loading = true;
        error = '';
        
        await signIn.email(
            {
                email: email,
                password: password,
                callbackURL: "http://localhost:3000/",
            },
            {
                onSuccess() {
                    goto('/');
                },
                onError(context) {
                    error = context.error.message;
                    loading = false;
                },
            },
        );
    };

    // Redirect if already authenticated
    $effect(() => {
        if ($session.data) {
            goto('/');
        }
    });
</script>

<svelte:head>
    <title>Sign In - SurrealDB Auth</title>
    <meta name="description" content="Sign in to your account" />
</svelte:head>

<div class="auth-container">
    <div class="auth-card">
        <div class="auth-header">
            <h1 class="auth-title">Welcome Back</h1>
            <p class="auth-subtitle">Sign in to your account to continue</p>
        </div>

        <form onsubmit={handleSignIn} class="auth-form">
            <div class="form-group">
                <label for="email" class="field-label">Email Address</label>
                <input
                    id="email"
                    name="email"
                    type="email"
                    bind:value={email}
                    class="form-input"
                    placeholder="Enter your email"
                    autocomplete="username"
                    required
                />
            </div>

            <div class="form-group">
                <label for="password" class="field-label">Password</label>
                <input
                    id="password"
                    name="password"
                    type="password"
                    bind:value={password}
                    class="form-input"
                    placeholder="Enter your password"
                    autocomplete="current-password"
                    required
                />
            </div>

            {#if error}
                <div class="error-message">
                    ⚠️ {error}
                </div>
            {/if}

            <Button.Root
                type="submit"
                class="btn btn-primary auth-button"
                disabled={loading}
            >
                {loading ? "Signing In..." : "Sign In"}
            </Button.Root>
        </form>

        <div class="auth-footer">
            <p class="auth-link-text">
                Don't have an account?
                <a href="/auth/sign/up" class="auth-link">Create one here</a>
            </p>
        </div>
    </div>
</div>

<style>
    .auth-container {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        background: linear-gradient(135deg, #111827 0%, #1f2937 100%);
    }

    .auth-card {
        background: #1f2937;
        border-radius: 16px;
        padding: 3rem;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
        border: 1px solid #374151;
        width: 100%;
        max-width: 400px;
    }

    .auth-header {
        text-align: center;
        margin-bottom: 2rem;
    }

    .auth-title {
        font-size: 2rem;
        font-weight: bold;
        color: #f9fafb;
        margin: 0 0 0.5rem 0;
    }

    .auth-subtitle {
        color: #9ca3af;
        margin: 0;
        font-size: 1rem;
    }

    .auth-form {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }

    .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .field-label {
        font-size: 0.875rem;
        font-weight: 500;
        color: #f9fafb;
    }

    .form-input {
        width: 100%;
        padding: 0.875rem;
        border: 1px solid #4b5563;
        border-radius: 8px;
        background-color: #374151;
        color: #f9fafb;
        font-size: 1rem;
        transition: all 0.2s;
    }

    .form-input:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        background-color: #1f2937;
    }

    .form-input::placeholder {
        color: #9ca3af;
    }

    .error-message {
        background-color: #7f1d1d;
        color: #fecaca;
        padding: 0.75rem;
        border-radius: 8px;
        font-size: 0.875rem;
        border: 1px solid #dc2626;
    }

    :global(.auth-button) {
        width: 100%;
        padding: 0.875rem;
        font-size: 1rem;
        font-weight: 600;
        margin-top: 0.5rem;
    }

    .auth-footer {
        margin-top: 2rem;
        text-align: center;
    }

    .auth-link-text {
        color: #9ca3af;
        margin: 0;
        font-size: 0.875rem;
    }

    .auth-link {
        color: #3b82f6;
        text-decoration: none;
        font-weight: 500;
    }

    .auth-link:hover {
        color: #2563eb;
        text-decoration: underline;
    }

    @media (max-width: 480px) {
        .auth-container {
            padding: 1rem;
        }

        .auth-card {
            padding: 2rem;
        }

        .auth-title {
            font-size: 1.75rem;
        }
    }
</style>