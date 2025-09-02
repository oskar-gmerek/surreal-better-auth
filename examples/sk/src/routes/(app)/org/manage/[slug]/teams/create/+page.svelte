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

    let loading = $state({
        loadOrg: true,
        createTeam: false,
    });

    let messages = $state({
        create: "",
    });

    let errors = $state({
        create: "",
    });

    // Form state
    let createForm = $state({
        name: "",
        description: "",
    });

    function clearMessages() {
        messages.create = "";
        errors.create = "";
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
            }
        } catch (err) {
            console.error("Failed to load organization:", err);
            goto("/org");
        } finally {
            loading.loadOrg = false;
        }
    }

    async function createTeam(event: SubmitEvent) {
        event.preventDefault();
        try {
            loading.createTeam = true;
            clearMessages();

            const result = await authClient.organization.createTeam({
                name: createForm.name.trim(),
                description: createForm.description.trim() || undefined,
            });

            if (result.error) {
                errors.create = "Failed to create team: " + result.error.message;
            } else {
                messages.create = "Team created successfully!";
                // Redirect to teams list after successful creation
                setTimeout(() => {
                    goto(`/org/manage/${organization.slug}/teams`);
                }, 2000);
            }
        } catch (err) {
            errors.create = "Failed to create team: " + (err as Error).message;
        } finally {
            loading.createTeam = false;
        }
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
            <h1 class="title">Create New Team</h1>
            <p class="subtitle">Add a new team to {organization.name}</p>
        </div>

        <!-- Navigation -->
        <div class="breadcrumb">
            <a href="/org">Organizations</a>
            <span>/</span>
            <a href="/org/{organization.slug}">{organization.name}</a>
            <span>/</span>
            <a href="/org/manage/{organization.slug}">Manage</a>
            <span>/</span>
            <a href="/org/manage/{organization.slug}/teams">Teams</a>
            <span>/</span>
            <span>Create</span>
        </div>

        <!-- Create Team Form -->
        <div class="card">
            <h2 class="section-title">
                <span class="status-dot blue"></span>
                Team Information
            </h2>

            <form onsubmit={createTeam}>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="team-name" class="field-label">Team Name</label>
                        <input
                            id="team-name"
                            type="text"
                            bind:value={createForm.name}
                            class="form-input"
                            placeholder="Enter team name"
                            required
                        />
                        <small class="field-help">Choose a descriptive name for your team</small>
                    </div>

                    <div class="form-group">
                        <label for="team-description" class="field-label">Description (Optional)</label>
                        <textarea
                            id="team-description"
                            bind:value={createForm.description}
                            class="form-input"
                            placeholder="Describe the team's purpose and responsibilities"
                            rows="3"
                        ></textarea>
                        <small class="field-help">Help members understand the team's role</small>
                    </div>
                </div>

                {#if messages.create}
                    <div class="message success">{messages.create}</div>
                {/if}
                {#if errors.create}
                    <div class="message error">{errors.create}</div>
                {/if}

                <div class="form-actions">
                    <Button.Root
                        type="submit"
                        class="btn btn-primary"
                        disabled={loading.createTeam || !createForm.name.trim()}
                    >
                        {loading.createTeam ? "Creating Team..." : "Create Team"}
                    </Button.Root>
                    <Button.Root
                        href="/org/manage/{organization.slug}/teams"
                        class="btn btn-secondary"
                    >
                        Cancel
                    </Button.Root>
                </div>
            </form>
        </div>

        <!-- Team Guidelines -->
        <div class="card">
            <h2 class="section-title">
                <span class="status-dot green"></span>
                Team Guidelines
            </h2>

            <div class="guidelines">
                <div class="guideline-item">
                    <h3>Team Names</h3>
                    <p>Choose clear, descriptive names that reflect the team's purpose or function.</p>
                </div>

                <div class="guideline-item">
                    <h3>Team Descriptions</h3>
                    <p>Provide context about the team's responsibilities, goals, or area of focus.</p>
                </div>

                <div class="guideline-item">
                    <h3>Team Management</h3>
                    <p>After creating a team, you can add members and manage permissions from the team management page.</p>
                </div>
            </div>
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

    .form-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1.5rem;
        margin-bottom: 1.5rem;
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
        padding: 0.75rem;
        border: 1px solid #4b5563;
        border-radius: 6px;
        background-color: #1f2937;
        color: #f9fafb;
        font-size: 0.875rem;
        transition: border-color 0.2s;
        resize: vertical;
    }

    .form-input:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .field-help {
        font-size: 0.75rem;
        color: #9ca3af;
        line-height: 1.4;
    }

    .form-actions {
        display: flex;
        gap: 0.75rem;
        margin-top: 1.5rem;
    }

    .guidelines {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1.5rem;
    }

    @media (min-width: 768px) {
        .guidelines {
            grid-template-columns: repeat(3, 1fr);
        }
    }

    .guideline-item {
        padding: 1rem;
        background-color: #374151;
        border-radius: 6px;
    }

    .guideline-item h3 {
        color: #f9fafb;
        margin: 0 0 0.5rem 0;
        font-size: 1rem;
        font-weight: 600;
    }

    .guideline-item p {
        color: #9ca3af;
        margin: 0;
        font-size: 0.875rem;
        line-height: 1.4;
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
        padding: 4rem 2rem;
        color: #9ca3af;
    }

    .empty-state h2,
    .loading-state h2 {
        color: #f9fafb;
        margin-bottom: 1rem;
    }
</style>