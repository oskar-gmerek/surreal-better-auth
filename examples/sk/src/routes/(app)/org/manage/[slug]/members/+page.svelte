<script lang="ts">
import { page } from "$app/stores";
import { goto } from "$app/navigation";
import { authClient } from "$lib/auth-client";
import { Button } from "bits-ui";
import { onMount } from "svelte";

const session = authClient.useSession();
const orgsResult = authClient.useListOrganizations();

let slug = $derived($page.params.slug);
let organization = $state<any>(null);
let members = $state<any[]>([]);
let invitations = $state<any[]>([]);

let loading = $state({
  loadOrg: true,
  loadMembers: false,
  invite: false,
});

let messages = $state({
  invite: "",
});

let errors = $state({
  invite: "",
});

// Invite form state
let inviteForm = $state({
  email: "",
  role: "member",
});

let showInviteForm = $state(false);

function clearMessages() {
  messages.invite = "";
  errors.invite = "";
}

async function loadOrganization() {
  try {
    loading.loadOrg = true;

    const organizations = $orgsResult.data || [];
    const foundOrg = organizations.find((org: any) => org.slug === slug);

    if (!foundOrg) {
      goto("/org");
      return;
    }

    await authClient.organization.setActive({
      organizationId: foundOrg.id,
    });

    const fullOrgResult = await authClient.organization.getFullOrganization();
    if (fullOrgResult.data) {
      organization = fullOrgResult.data;
      await loadMembers();
    }
  } catch (err) {
    console.error("Failed to load organization:", err);
    goto("/org");
  } finally {
    loading.loadOrg = false;
  }
}

async function loadMembers() {
  try {
    loading.loadMembers = true;

    const membersResult = await authClient.organization.listMembers();

    if (membersResult.data) {
      members = membersResult.data.members || [];
      invitations = membersResult.data.invitations || [];
    }

    // Try to get invitations separately if they're not included
    try {
      const invitationsResult = await authClient.organization.listInvitations();
      if (invitationsResult.data) {
        invitations = invitationsResult.data || [];
      }
    } catch (invErr) {
      // listInvitations method might not exist, that's okay
    }
  } catch (err) {
    console.error("Failed to load members:", err);
  } finally {
    loading.loadMembers = false;
  }
}

async function inviteMember(event: SubmitEvent) {
  event.preventDefault();
  try {
    loading.invite = true;
    clearMessages();

    const result = await authClient.organization.inviteMember({
      email: inviteForm.email,
      role: inviteForm.role,
    });

    if (result.error) {
      errors.invite = `Failed to send invitation: ${result.error.message}`;
    } else {
      messages.invite = "Invitation sent successfully!";
      inviteForm = { email: "", role: "member" };
      showInviteForm = false;
      await loadMembers(); // Reload to show new invitation
    }
  } catch (err) {
    errors.invite = `Failed to send invitation: ${(err as Error).message}`;
  } finally {
    loading.invite = false;
  }
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

onMount(() => {
  loadOrganization();
});
</script>

<div class="container">
    {#if loading.loadOrg}
        <div class="loading-state">
            <h2>Loading organization...</h2>
        </div>
    {:else if !organization}
        <div class="empty-state">
            <h2>Organization not found</h2>
            <p>The organization you're looking for doesn't exist or you don't have access to it.</p>
            <Button.Root href="/org" class="btn btn-primary">
                Back to Organizations
            </Button.Root>
        </div>
    {:else}
        <div class="header">
            <h1 class="title">Members</h1>
            <p class="subtitle">Manage members and invitations for {organization.name}</p>
        </div>

        <!-- Navigation -->
        <div class="breadcrumb">
            <a href="/org">Organizations</a>
            <span>/</span>
            <a href="/org/{organization.slug}">{organization.name}</a>
            <span>/</span>
            <a href="/org/manage/{organization.slug}">Manage</a>
            <span>/</span>
            <span>Members</span>
        </div>

        <!-- Invite Member Section -->
        <div class="card">
            <div class="section-header">
                <h2 class="section-title">
                    <span class="status-dot blue"></span>
                    Invite New Member
                </h2>
                <Button.Root
                    onclick={() => (showInviteForm = !showInviteForm)}
                    class="btn btn-primary"
                >
                    {showInviteForm ? "Cancel" : "Invite Member"}
                </Button.Root>
            </div>

            <!-- Messages outside the form so they persist -->
            {#if messages.invite}
                <div class="message success">{messages.invite}</div>
            {/if}
            {#if errors.invite}
                <div class="message error">{errors.invite}</div>
            {/if}

            {#if showInviteForm}
                <form onsubmit={inviteMember}>
                    <div class="form-grid">
                        <div class="form-group">
                            <label for="invite-email" class="field-label">Email Address</label>
                            <input
                                id="invite-email"
                                type="email"
                                name="email"
                                bind:value={inviteForm.email}
                                class="form-input"
                                placeholder="user@example.com"
                                required
                            />
                        </div>

                        <div class="form-group">
                            <label for="invite-role" class="field-label">Role</label>
                            <select
                                id="invite-role"
                                name="role"
                                bind:value={inviteForm.role}
                                class="form-input"
                            >
                                <option value="member">Member</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                    </div>



                    <div class="form-actions">
                        <Button.Root
                            type="submit"
                            class="btn btn-primary"
                            disabled={loading.invite}
                        >
                            {loading.invite ? "Sending..." : "Send Invitation"}
                        </Button.Root>
                    </div>
                </form>
            {/if}
        </div>

        <!-- Current Members -->
        <div class="card">
            <h2 class="section-title">
                <span class="status-dot green"></span>
                Current Members ({members.length})
            </h2>

            {#if loading.loadMembers}
                <div class="loading-state">
                    <p>Loading members...</p>
                </div>
            {:else if members.length === 0}
                <div class="empty-state">
                    <p>No members found.</p>
                </div>
            {:else}
                <div class="members-list">
                    {#each members as member}
                        <div class="member-item">
                            <div class="member-info">
                                <h3>{member.user?.name || member.user?.email}</h3>
                                <p class="member-email">{member.user?.email}</p>
                                <span class="member-role">{member.role}</span>
                            </div>
                            <div class="member-meta">
                                <p class="member-joined">Joined {formatDate(member.createdAt)}</p>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Pending Invitations -->
        {#if invitations.length > 0}
            <div class="card">
                <h2 class="section-title">
                    <span class="status-dot yellow"></span>
                    Pending Invitations ({invitations.length})
                </h2>

                <div class="invitations-list">
                    {#each invitations as invitation}
                        <div class="invitation-item">
                            <div class="invitation-info">
                                <h3>{invitation.email}</h3>
                                <span class="invitation-role">{invitation.role}</span>
                            </div>
                            <div class="invitation-meta">
                                <p class="invitation-sent">Sent {formatDate(invitation.createdAt)}</p>
                                <span class="invitation-status">Pending</span>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
    {/if}
</div>

<style>
    .breadcrumb {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 2rem;
        font-size: 0.875rem;
        color: #9ca3af;
    }

    .breadcrumb a {
        color: #3b82f6;
        text-decoration: none;
    }

    .breadcrumb a:hover {
        text-decoration: underline;
    }

    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
    }

    .form-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1rem;
        margin-bottom: 1rem;
    }

    @media (min-width: 640px) {
        .form-grid {
            grid-template-columns: 2fr 1fr;
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
        background-color: #1f2937;
        color: #f9fafb;
        font-size: 0.875rem;
        transition: border-color 0.2s;
    }

    .form-input:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .form-actions {
        margin-top: 1.5rem;
        display: flex;
        gap: 0.75rem;
    }

    .members-list,
    .invitations-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .member-item,
    .invitation-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem;
        border: 1px solid #374151;
        border-radius: 8px;
        background-color: #1f2937;
    }

    .member-info,
    .invitation-info {
        flex: 1;
    }

    .member-info h3,
    .invitation-info h3 {
        margin: 0 0 0.25rem 0;
        color: #f9fafb;
        font-size: 1rem;
        font-weight: 600;
    }

    .member-email {
        margin: 0 0 0.5rem 0;
        color: #9ca3af;
        font-size: 0.875rem;
    }

    .member-role,
    .invitation-role {
        display: inline-block;
        padding: 0.25rem 0.5rem;
        background-color: #3b82f6;
        color: white;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 500;
        text-transform: capitalize;
    }

    .member-meta,
    .invitation-meta {
        text-align: right;
        color: #9ca3af;
        font-size: 0.875rem;
    }

    .invitation-status {
        display: inline-block;
        padding: 0.25rem 0.5rem;
        background-color: #f59e0b;
        color: white;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 500;
        margin-top: 0.25rem;
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

    .loading-state,
    .empty-state {
        text-align: center;
        padding: 2rem;
        color: #9ca3af;
    }

    .empty-state h2,
    .loading-state h2 {
        color: #f9fafb;
        margin-bottom: 1rem;
    }
</style>