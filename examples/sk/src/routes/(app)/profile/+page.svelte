<script lang="ts">
import { goto } from "$app/navigation";
import { authClient } from "$lib/auth-client";
import { Button } from "bits-ui";

const session = authClient.useSession();

// Redirect if not authenticated
$effect(() => {
  if (!$session.isPending && !$session.isRefetching && !$session.data) {
    goto("/auth/sign/in");
  }
});

// Form states
let profileForm = $state({
  name: "",
  displayUsername: "",
  username: "",
  email: "",
});

let passwordForm = $state({
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
});

let emailForm = $state({
  newEmail: "",
});

// UI states
let loading = $state({
  profile: false,
  password: false,
  email: false,
  emailVerification: false,
  deleteAccount: false,
});

let messages = $state({
  profile: "",
  password: "",
  email: "",
  emailVerification: "",
  deleteAccount: "",
});

let errors = $state({
  profile: "",
  password: "",
  email: "",
  emailVerification: "",
  deleteAccount: "",
});

let showDeleteConfirm = $state(false);
let deleteConfirmText = $state("");

function normalizeUsername(username: string) {
  return username
    .toLowerCase()
    .replace(/ /g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function clearMessage(type: keyof typeof messages) {
  messages[type] = "";
  errors[type] = "";
}

async function updateProfile(event: SubmitEvent) {
  event.preventDefault();
  try {
    loading.profile = true;
    clearMessage("profile");

    const normalizedUsername = normalizeUsername(profileForm.username);

    // Check username availability if it changed
    if (normalizedUsername !== $session.data?.user.username) {
      const isAvailable = await authClient.isUsernameAvailable({
        username: normalizedUsername,
      });

      if (!isAvailable.data?.available) {
        errors.profile = "Username is not available";
        return;
      }
    }

    await authClient.updateUser({
      name: profileForm.name,
      displayUsername: profileForm.displayUsername,
      username: normalizedUsername,
    });

    messages.profile = "Profile updated successfully!";
  } catch (err) {
    errors.profile = "Failed to update profile: " + (err as Error).message;
  } finally {
    loading.profile = false;
  }
}

async function changePassword(event: SubmitEvent) {
  event.preventDefault();
  try {
    loading.password = true;
    clearMessage("password");

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      errors.password = "New passwords don't match";
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      errors.password = "Password must be at least 8 characters long";
      return;
    }

    await authClient.changePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });

    messages.password = "Password changed successfully!";
    passwordForm = {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    };
  } catch (err) {
    errors.password = "Failed to change password: " + (err as Error).message;
  } finally {
    loading.password = false;
  }
}

async function changeEmail(event: SubmitEvent) {
  event.preventDefault();
  try {
    loading.email = true;
    clearMessage("email");

    await authClient.changeEmail({
      newEmail: emailForm.newEmail,
    });

    messages.email =
      "Email change request sent! Check your new email for verification.";
    emailForm.newEmail = "";
  } catch (err) {
    errors.email = "Failed to change email: " + (err as Error).message;
  } finally {
    loading.email = false;
  }
}

async function sendEmailVerification() {
  try {
    loading.emailVerification = true;
    clearMessage("emailVerification");

    await authClient.sendVerificationEmail({
      email: $session.data?.user.email || "",
    });

    messages.emailVerification = "Verification email sent! Check your inbox.";
  } catch (err) {
    errors.emailVerification =
      "Failed to send verification email: " + (err as Error).message;
  } finally {
    loading.emailVerification = false;
  }
}

async function deleteAccount() {
  try {
    loading.deleteAccount = true;
    clearMessage("deleteAccount");

    if (deleteConfirmText !== "DELETE") {
      errors.deleteAccount = "Please type 'DELETE' to confirm";
      return;
    }

    await authClient.deleteUser();

    // Redirect to home after successful deletion
    goto("/");
  } catch (err) {
    errors.deleteAccount =
      "Failed to delete account: " + (err as Error).message;
  } finally {
    loading.deleteAccount = false;
  }
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Initialize form with current user data
$effect.pre(() => {
  if ($session.data?.user) {
    profileForm = {
      name: $session.data.user.name || "",
      displayUsername: $session.data.user.displayUsername || "",
      username: $session.data.user.username || "",
      email: $session.data.user.email || "",
    };
  }
});
</script>

<div class="container">
    <div class="header">
        <h1 class="title">Profile Settings</h1>
        <p class="subtitle">Manage your account information and security settings</p>
    </div>

    <!-- Profile Information -->
    <div class="card">
        <h2 class="section-title">
            <span class="status-dot green"></span>
            Profile Information
        </h2>

        <form onsubmit={updateProfile}>
            <div class="form-grid">
                <div class="form-group">
                    <label for="name" class="field-label">Full Name</label>
                    <input
                        id="name"
                        type="text"
                        bind:value={profileForm.name}
                        class="form-input"
                        placeholder="Enter your full name"
                    />
                </div>

                <div class="form-group">
                    <label for="email" class="field-label">Email Address</label>
                    <input
                        id="email"
                        type="email"
                        value={profileForm.email}
                        class="form-input"
                        disabled
                        title="Use the email change section below to update your email"
                    />
                </div>

                <div class="form-group">
                    <label for="displayUsername" class="field-label">Display Username</label>
                    <input
                        id="displayUsername"
                        type="text"
                        bind:value={profileForm.displayUsername}
                        class="form-input"
                        placeholder="How others see your name"
                    />
                </div>

                <div class="form-group">
                    <label for="username" class="field-label">Username</label>
                    <input
                        id="username"
                        type="text"
                        bind:value={profileForm.username}
                        class="form-input"
                        placeholder="Unique username (lowercase, underscores allowed)"
                    />
                    <small class="field-help">Will be normalized to: {normalizeUsername(profileForm.username)}</small>
                </div>
            </div>

            {#if messages.profile}
                <div class="message success">{messages.profile}</div>
            {/if}
            {#if errors.profile}
                <div class="message error">{errors.profile}</div>
            {/if}

            <div class="form-actions">
                <Button.Root 
                    type="submit" 
                    class="btn btn-primary"
                    disabled={loading.profile}
                >
                    {loading.profile ? "Updating..." : "Update Profile"}
                </Button.Root>
            </div>
        </form>
    </div>

    <!-- Email Verification -->
    {#if !$session.data?.user.emailVerified}
        <div class="card warning-card">
            <h2 class="section-title">
                <span class="status-dot" style="background-color: #f59e0b;"></span>
                Email Verification Required
            </h2>
            
            <p class="warning-text">Your email address is not verified. Please verify it to secure your account.</p>
            
            {#if messages.emailVerification}
                <div class="message success">{messages.emailVerification}</div>
            {/if}
            {#if errors.emailVerification}
                <div class="message error">{errors.emailVerification}</div>
            {/if}

            <div class="form-actions">
                <Button.Root 
                    onclick={sendEmailVerification}
                    class="btn btn-primary"
                    disabled={loading.emailVerification}
                >
                    {loading.emailVerification ? "Sending..." : "Send Verification Email"}
                </Button.Root>
            </div>
        </div>
    {/if}

    <!-- Change Password -->
    <div class="card">
        <h2 class="section-title">
            <span class="status-dot blue"></span>
            Change Password
        </h2>

        <form onsubmit={changePassword}>
            <div class="form-group">
                <label for="currentPassword" class="field-label">Current Password</label>
                <input
                    id="currentPassword"
                    type="password"
                    autocomplete="current-password"
                    bind:value={passwordForm.currentPassword}
                    class="form-input"
                    placeholder="Enter your current password"
                />
            </div>

            <div class="form-grid">
                <div class="form-group">
                    <label for="newPassword" class="field-label">New Password</label>
                    <input
                        id="newPassword"
                        type="password"
                        autocomplete="new-password"
                        bind:value={passwordForm.newPassword}
                        class="form-input"
                        placeholder="Enter new password (min 8 characters)"
                    />
                </div>

                <div class="form-group">
                    <label for="confirmPassword" class="field-label">Confirm New Password</label>
                    <input
                        id="confirmPassword"
                        type="password"
                        bind:value={passwordForm.confirmPassword}
                        class="form-input"
                        placeholder="Confirm your new password"
                    />
                </div>
            </div>

            {#if messages.password}
                <div class="message success">{messages.password}</div>
            {/if}
            {#if errors.password}
                <div class="message error">{errors.password}</div>
            {/if}

            <div class="form-actions">
                <Button.Root 
                    type="submit" 
                    class="btn btn-primary"
                    disabled={loading.password}
                >
                    {loading.password ? "Changing..." : "Change Password"}
                </Button.Root>
            </div>
        </form>
    </div>

    <!-- Change Email -->
    <div class="card">
        <h2 class="section-title">
            <span class="status-dot blue"></span>
            Change Email Address
        </h2>

        <form onsubmit={changeEmail}>
            <div class="form-group">
                <label for="newEmail" class="field-label">New Email Address</label>
                <input
                    id="newEmail"
                    type="email"
                    bind:value={emailForm.newEmail}
                    class="form-input"
                    placeholder="Enter your new email address"
                />
                <small class="field-help">You'll need to verify the new email address</small>
            </div>

            {#if messages.email}
                <div class="message success">{messages.email}</div>
            {/if}
            {#if errors.email}
                <div class="message error">{errors.email}</div>
            {/if}

            <div class="form-actions">
                <Button.Root 
                    type="submit" 
                    class="btn btn-primary"
                    disabled={loading.email}
                >
                    {loading.email ? "Sending..." : "Change Email"}
                </Button.Root>
            </div>
        </form>
    </div>

    <!-- Account Information -->
    <div class="card">
        <h2 class="section-title">
            <span class="status-dot green"></span>
            Account Information
        </h2>

        <div class="info-grid">
            <div class="field">
                <span class="field-label">Account Created</span>
                <p class="field-value">{formatDate($session.data?.user.createdAt || "")}</p>
            </div>

            <div class="field">
                <span class="field-label">Last Updated</span>
                <p class="field-value">{formatDate($session.data?.user.updatedAt || "")}</p>
            </div>

            <div class="field">
                <span class="field-label">User ID</span>
                <p class="field-value mono">{$session.data?.user.id}</p>
            </div>

            <div class="field">
                <span class="field-label">Email Status</span>
                <p class="field-value">
                    {$session.data?.user.emailVerified ? "✅ Verified" : "⏳ Unverified"}
                </p>
            </div>
        </div>
    </div>

    <!-- Danger Zone -->
    <div class="card danger-card">
        <h2 class="section-title">
            <span class="status-dot" style="background-color: #ef4444;"></span>
            Danger Zone
        </h2>

        <div class="danger-content">
            <div class="danger-info">
                <h3>Delete Account</h3>
                <p>Permanently delete your account and all associated data. This action cannot be undone.</p>
            </div>

            {#if !showDeleteConfirm}
                <Button.Root 
                    onclick={() => showDeleteConfirm = true}
                    class="btn btn-danger"
                >
                    Delete Account
                </Button.Root>
            {:else}
                <div class="delete-confirm">
                    <p class="confirm-text">Type <strong>DELETE</strong> to confirm account deletion:</p>
                    <input
                        type="text"
                        bind:value={deleteConfirmText}
                        class="form-input"
                        placeholder="Type DELETE"
                    />
                    
                    {#if messages.deleteAccount}
                        <div class="message success">{messages.deleteAccount}</div>
                    {/if}
                    {#if errors.deleteAccount}
                        <div class="message error">{errors.deleteAccount}</div>
                    {/if}

                    <div class="confirm-actions">
                        <Button.Root 
                            onclick={deleteAccount}
                            class="btn btn-danger"
                            disabled={loading.deleteAccount}
                        >
                            {loading.deleteAccount ? "Deleting..." : "Confirm Delete"}
                        </Button.Root>
                        <Button.Root 
                            onclick={() => { showDeleteConfirm = false; deleteConfirmText = ""; }}
                            class="btn btn-secondary"
                        >
                            Cancel
                        </Button.Root>
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .form-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1rem;
    }

    @media (min-width: 640px) {
        .form-grid {
            grid-template-columns: 1fr 1fr;
        }
    }

    .form-group {
        margin-bottom: 1rem;
    }

    .form-input {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid #4b5563;
        border-radius: 6px;
        background-color: #374151;
        color: #f9fafb;
        font-size: 0.875rem;
        transition: border-color 0.2s;
    }

    .form-input:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .form-input:disabled {
        background-color: #1f2937;
        color: #9ca3af;
        cursor: not-allowed;
    }

    .field-help {
        display: block;
        margin-top: 0.25rem;
        font-size: 0.75rem;
        color: #9ca3af;
    }

    .form-actions {
        margin-top: 1.5rem;
        display: flex;
        gap: 0.75rem;
    }

    .info-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1rem;
    }

    @media (min-width: 640px) {
        .info-grid {
            grid-template-columns: 1fr 1fr;
        }
    }

    .message {
        padding: 0.75rem;
        border-radius: 6px;
        margin: 1rem 0;
        font-size: 0.875rem;
    }

    .message.success {
        background-color: #065f46;
        color: #d1fae5;
        border: 1px solid #10b981;
    }

    .message.error {
        background-color: #7f1d1d;
        color: #fecaca;
        border: 1px solid #ef4444;
    }

    .warning-card {
        border-color: #f59e0b;
        background: linear-gradient(135deg, #1f2937 0%, #92400e 100%);
    }

    .warning-text {
        color: #fbbf24;
        margin-bottom: 1rem;
    }

    .danger-card {
        border-color: #ef4444;
        background: linear-gradient(135deg, #1f2937 0%, #7f1d1d 100%);
    }

    .danger-content {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
    }

    .danger-info h3 {
        color: #fecaca;
        margin: 0 0 0.5rem 0;
        font-size: 1.125rem;
        font-weight: 600;
    }

    .danger-info p {
        color: #fca5a5;
        margin: 0;
        font-size: 0.875rem;
    }

    .delete-confirm {
        flex: 1;
        max-width: 300px;
    }

    .confirm-text {
        color: #fecaca;
        margin-bottom: 0.5rem;
        font-size: 0.875rem;
    }

    .confirm-actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 1rem;
    }

    @media (max-width: 768px) {
        .danger-content {
            flex-direction: column;
        }

        .delete-confirm {
            max-width: none;
        }
    }
</style>