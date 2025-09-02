<script lang="ts">
    import { goto } from "$app/navigation";
    import { authClient, signUp } from "$lib/auth-client";
    import { Button } from "bits-ui";

    const session = authClient.useSession();
    let email = $state("");
    let name = $state("");
    let password = $state("");
    let confirmPassword = $state("");
    let loading = $state(false);
    let error = $state("");

    const handleSignUp = async (event: SubmitEvent) => {
        event.preventDefault();
        loading = true;
        error = "";

        // Validate passwords match
        if (password !== confirmPassword) {
            error = "Passwords don't match";
            loading = false;
            return;
        }

        // Validate password length
        if (password.length < 8) {
            error = "Password must be at least 8 characters long";
            loading = false;
            return;
        }

        await signUp.email(
            {
                email: email,
                password: password,
                name: name,
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
    <title>Sign Up - SurrealDB Auth</title>
    <meta name="description" content="Create your account" />
</svelte:head>

<div class="auth-container">
    <div class="auth-card">
        <div class="auth-header">
            <h1 class="auth-title">Create Account</h1>
            <p class="auth-subtitle">Join us and start managing your organizations</p>
        </div>

        <form onsubmit={handleSignUp} class="auth-form">
            <div class="form-group">
                <label for="name" class="field-label">Full Name</label>
                <input
                    id="name"
                    name="name"
                    type="text"
                    bind:value={name}
                    class="form-input"
                    placeholder="Enter your full name"
                    autocomplete="name"
                    required
                />
            </div>

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
                    placeholder="Create a password (min 8 characters)"
                    autocomplete="new-password"
                    required
                />
            </div>

            <div class="form-group">
                <label for="confirmPassword" class="field-label">Confirm Password</label>
                <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    bind:value={confirmPassword}
                    class="form-input"
                    placeholder="Confirm your password"
                    autocomplete="new-password"
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
                {loading ? "Creating Account..." : "Create Account"}
            </Button.Root>
        </form>

        <div class="auth-footer">
            <p class="auth-link-text">
                Already have an account?
                <a href="/auth/sign/in" class="auth-link">Sign in here</a>
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
