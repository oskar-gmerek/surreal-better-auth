<script lang="ts">
import { page } from "$app/stores";
import { goto } from "$app/navigation";
import { authClient } from "$lib/auth-client";
import { Button } from "bits-ui";
import { onMount } from "svelte";

const session = authClient.useSession();
const orgsResult = authClient.useListOrganizations();

// Redirect if not authenticated
$effect(() => {
  if (!$session.isPending && !$session.isRefetching && !$session.data) {
    goto("/auth/sign/in");
  }
});

let slug = $derived($page.params.slug);
let organization = $state<any>(null);
let teams = $state<any[]>([]);

let loading = $state({
  loadOrg: true,
  loadTeams: false,
  deleteTeam: false,
});

let messages = $state({
  delete: "",
});

let errors = $state({
  delete: "",
});

function clearMessages() {
  messages.delete = "";
  errors.delete = "";
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
      await loadTeams();
    }
  } catch (err) {
    console.error("Failed to load organization:", err);
    goto("/org");
  } finally {
    loading.loadOrg = false;
  }
}

async function loadTeams() {
  try {
    loading.loadTeams = true;

    // Try to get teams from the organization data
    if (organization.teams) {
      teams = organization.teams;
    } else {
      // If teams are not included, try to fetch them separately
      try {
        const teamsResult = await authClient.organization.listTeams();
        if (teamsResult.data) {
          teams = teamsResult.data || [];
        }
      } catch (teamsErr) {
        console.warn("Failed to load teams separately:", teamsErr);
        teams = [];
      }
    }
  } catch (err) {
    console.error("Failed to load teams:", err);
    teams = [];
  } finally {
    loading.loadTeams = false;
  }
}

async function deleteTeam(teamId: string, teamName: string) {
  if (
    !confirm(
      `Are you sure you want to delete the team "${teamName}"? This action cannot be undone.`,
    )
  ) {
    return;
  }

  try {
    loading.deleteTeam = true;
    clearMessages();

    const result = await authClient.organization.removeTeam({
      teamId,
    });

    if (result.error) {
      errors.delete = `Failed to delete team: ${result.error.message}`;
    } else {
      messages.delete = `Team "${teamName}" deleted successfully!`;
      await loadTeams(); // Reload teams list
    }
  } catch (err) {
    errors.delete = `Failed to delete team: ${(err as Error).message}`;
  } finally {
    loading.deleteTeam = false;
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
            <h1 class="title">Teams</h1>
            <p class="subtitle">Manage teams for {organization.name}</p>
        </div>

        <!-- Navigation -->
        <div class="breadcrumb">
            <a href="/org">Organizations</a>
            <span>/</span>
            <a href="/org/{organization.slug}">{organization.name}</a>
            <span>/</span>
            <a href="/org/manage/{organization.slug}">Manage</a>
            <span>/</span>
            <span>Teams</span>
        </div>

        <!-- Create Team Section -->
        <div class="card">
            <div class="section-header">
                <h2 class="section-title">
                    <span class="status-dot blue"></span>
                    Create New Team
                </h2>
                <Button.Root
                    href="/org/manage/{organization.slug}/teams/create"
                    class="btn btn-primary"
                >
                    Create Team
                </Button.Root>
            </div>

            <p class="section-description">
                Create teams to organize your organization members and manage access control.
            </p>
        </div>

        <!-- Teams List -->
        <div class="card">
            <h2 class="section-title">
                <span class="status-dot green"></span>
                Current Teams ({teams.length})
            </h2>

            <!-- Messages -->
            {#if messages.delete}
                <div class="message success">{messages.delete}</div>
            {/if}
            {#if errors.delete}
                <div class="message error">{errors.delete}</div>
            {/if}

            {#if loading.loadTeams}
                <div class="loading-state">
                    <p>Loading teams...</p>
                </div>
            {:else if teams.length === 0}
                <div class="empty-state">
                    <p>No teams found. Create your first team to get started.</p>
                    <Button.Root
                        href="/org/manage/{organization.slug}/teams/create"
                        class="btn btn-primary"
                    >
                        Create First Team
                    </Button.Root>
                </div>
            {:else}
                <div class="teams-list">
                    {#each teams as team}
                        <div class="team-item">
                            <div class="team-info">
                                <h3>{team.name}</h3>
                                <p class="team-description">{team.description || 'No description'}</p>
                                <div class="team-meta">
                                    <span class="team-members">{team.members?.length || 0} members</span>
                                    <span class="team-created">Created {formatDate(team.createdAt)}</span>
                                </div>
                            </div>
                            <div class="team-actions">
                                <Button.Root
                                    href="/org/manage/{organization.slug}/team/{team.id}"
                                    class="btn btn-secondary"
                                >
                                    Manage
                                </Button.Root>
                                <Button.Root
                                    onclick={() => deleteTeam(team.id, team.name)}
                                    class="btn btn-danger"
                                    disabled={loading.deleteTeam}
                                >
                                    {loading.deleteTeam ? "Deleting..." : "Delete"}
                                </Button.Root>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
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

    .section-description {
        color: #9ca3af;
        margin-bottom: 1.5rem;
        line-height: 1.5;
    }

    .teams-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .team-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem;
        border: 1px solid #374151;
        border-radius: 8px;
        background-color: #1f2937;
    }

    .team-info {
        flex: 1;
    }

    .team-info h3 {
        margin: 0 0 0.5rem 0;
        color: #f9fafb;
        font-size: 1.125rem;
        font-weight: 600;
    }

    .team-description {
        margin: 0 0 0.75rem 0;
        color: #9ca3af;
        font-size: 0.875rem;
        line-height: 1.4;
    }

    .team-meta {
        display: flex;
        gap: 1rem;
        font-size: 0.75rem;
        color: #6b7280;
    }

    .team-members {
        padding: 0.25rem 0.5rem;
        background-color: #3b82f6;
        color: white;
        border-radius: 4px;
        font-weight: 500;
    }

    .team-actions {
        display: flex;
        gap: 0.75rem;
        align-items: center;
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

    @media (max-width: 768px) {
        .team-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
        }

        .team-actions {
            align-self: stretch;
            justify-content: flex-end;
        }
    }
</style>