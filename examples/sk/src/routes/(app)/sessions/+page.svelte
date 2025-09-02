<script lang="ts">
import { goto } from "$app/navigation";
import { authClient } from "$lib/auth-client";
import { Button } from "bits-ui";
import { onMount } from "svelte";

const session = authClient.useSession();
let sessions: any[] = $state([]);
let loading = $state(true);
let error = $state("");

// Redirect if not authenticated
$effect(() => {
  if (!$session.isPending && !$session.isRefetching && !$session.data) {
    goto("/auth/sign/in");
  }
});

async function loadSessions() {
  try {
    loading = true;
    error = "";
    const result = await authClient.listSessions();
    if (result.data) {
      sessions = result.data;
    } else {
      error = "Failed to load sessions";
    }
  } catch (err) {
    error = `Error loading sessions: ${(err as Error).message}`;
  } finally {
    loading = false;
  }
}

async function revokeSession(token: string) {
  try {
    await authClient.revokeSession({ token });
    await loadSessions(); // Reload sessions
  } catch (err) {
    error = `Failed to revoke session: ${(err as Error).message}`;
  }
}

async function revokeAllOtherSessions() {
  try {
    await authClient.revokeOtherSessions();
    await loadSessions(); // Reload sessions
  } catch (err) {
    error = `Failed to revoke other sessions: ${(err as Error).message}`;
  }
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isCurrentSession(sessionId: string) {
  return $session.data?.session.id === sessionId;
}

function getDeviceInfo(userAgent: string | null) {
  if (!userAgent) return "Unknown Device";

  // Simple device detection
  if (userAgent.includes("Mobile") || userAgent.includes("Android")) {
    return "📱 Mobile Device";
  }
  if (userAgent.includes("iPad") || userAgent.includes("Tablet")) {
    return "📱 Tablet";
  }
  return "💻 Desktop";
}

function getBrowserInfo(userAgent: string | null) {
  if (!userAgent) return "Unknown Browser";

  if (userAgent.includes("Chrome")) return "Chrome";
  if (userAgent.includes("Firefox")) return "Firefox";
  if (userAgent.includes("Safari")) return "Safari";
  if (userAgent.includes("Edge")) return "Edge";
  return "Other Browser";
}

onMount(() => {
  loadSessions();
});
</script>

<div class="container">
    <div class="header">
        <h1 class="title">Active Sessions</h1>
        <p class="subtitle">Manage your active sessions across all devices</p>
    </div>

    {#if error}
        <div class="card error-card">
            <p class="error-message">⚠️ {error}</p>
            <Button.Root onclick={loadSessions} class="btn btn-secondary">
                Retry
            </Button.Root>
        </div>
    {/if}

    {#if loading}
        <div class="card">
            <div class="loading-state">
                <p>Loading sessions...</p>
            </div>
        </div>
    {:else if sessions.length > 0}
        <div class="sessions-header">
            <div class="sessions-count">
                <span class="count-badge">{sessions.length}</span>
                Active Session{sessions.length !== 1 ? 's' : ''}
            </div>
            
            {#if sessions.length > 1}
                <Button.Root onclick={revokeAllOtherSessions} class="btn btn-danger">
                    Revoke All Other Sessions
                </Button.Root>
            {/if}
        </div>

        <div class="sessions-grid">
            {#each sessions as sessionItem (sessionItem.id)}
                <div class="session-card {isCurrentSession(sessionItem.id) ? 'current-session' : ''}">
                    <div class="session-header">
                        <div class="session-info">
                            <div class="device-info">
                                {getDeviceInfo(sessionItem.userAgent)}
                            </div>
                            <div class="browser-info">
                                {getBrowserInfo(sessionItem.userAgent)}
                            </div>
                        </div>
                        
                        {#if isCurrentSession(sessionItem.id)}
                            <span class="current-badge">Current Session</span>
                        {:else}
                            <Button.Root 
                                onclick={() => revokeSession(sessionItem.token)} 
                                class="btn btn-sm btn-danger"
                            >
                                Revoke
                            </Button.Root>
                        {/if}
                    </div>

                    <div class="session-details">
                        <div class="field">
                            <span class="field-label">Session ID</span>
                            <p class="field-value mono">{sessionItem.id}</p>
                        </div>

                        <div class="field">
                            <span class="field-label">Created</span>
                            <p class="field-value">{formatDate(sessionItem.createdAt)}</p>
                        </div>

                        <div class="field">
                            <span class="field-label">Expires</span>
                            <p class="field-value">{formatDate(sessionItem.expiresAt)}</p>
                        </div>

                        {#if sessionItem.ipAddress}
                            <div class="field">
                                <span class="field-label">IP Address</span>
                                <p class="field-value mono">{sessionItem.ipAddress}</p>
                            </div>
                        {/if}

                        {#if sessionItem.userAgent}
                            <div class="field">
                                <span class="field-label">User Agent</span>
                                <p class="field-value user-agent">{sessionItem.userAgent}</p>
                            </div>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    {:else}
        <div class="card">
            <div class="empty-state">
                <h3>No Active Sessions</h3>
                <p>You don't have any active sessions.</p>
            </div>
        </div>
    {/if}
</div>

<style>
    .sessions-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
        padding: 1rem 0;
    }

    .sessions-count {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 1.125rem;
        font-weight: 600;
        color: #f9fafb;
    }

    .count-badge {
        background-color: #3b82f6;
        color: white;
        padding: 0.25rem 0.75rem;
        border-radius: 12px;
        font-size: 0.875rem;
        font-weight: bold;
    }

    .sessions-grid {
        display: grid;
        gap: 1.5rem;
        grid-template-columns: 1fr;
    }

    @media (min-width: 768px) {
        .sessions-grid {
            grid-template-columns: repeat(2, 1fr);
        }
    }

    .session-card {
        background: #1f2937;
        border-radius: 12px;
        padding: 1.5rem;
        border: 1px solid #374151;
        transition: all 0.2s;
    }

    .session-card:hover {
        border-color: #4b5563;
    }

    .current-session {
        border-color: #3b82f6;
        background: linear-gradient(135deg, #1f2937 0%, #1e3a8a 100%);
    }

    .session-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 1rem;
    }

    .session-info {
        flex: 1;
    }

    .device-info {
        font-size: 1.125rem;
        font-weight: 600;
        color: #f9fafb;
        margin-bottom: 0.25rem;
    }

    .browser-info {
        font-size: 0.875rem;
        color: #9ca3af;
    }

    .current-badge {
        background-color: #10b981;
        color: white;
        padding: 0.25rem 0.75rem;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 600;
    }

    .session-details {
        display: grid;
        gap: 0.75rem;
    }

    .user-agent {
        font-size: 0.75rem;
        word-break: break-all;
        line-height: 1.4;
    }

    .error-card {
        background-color: #7f1d1d;
        border-color: #dc2626;
    }

    .error-message {
        color: #fecaca;
        margin-bottom: 1rem;
    }

    .loading-state,
    .empty-state {
        text-align: center;
        padding: 2rem;
        color: #9ca3af;
    }

    .empty-state h3 {
        color: #f9fafb;
        margin-bottom: 0.5rem;
    }

    @media (max-width: 768px) {
        .sessions-header {
            flex-direction: column;
            gap: 1rem;
            align-items: stretch;
        }

        .session-header {
            flex-direction: column;
            gap: 1rem;
        }
    }
</style>