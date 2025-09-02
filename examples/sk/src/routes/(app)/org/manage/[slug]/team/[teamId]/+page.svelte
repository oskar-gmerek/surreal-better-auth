<script lang="ts">
    import { page } from "$app/state";
    import { goto } from "$app/navigation";
    import { authClient } from "$lib/auth-client";
    import { Button } from "bits-ui";
    import { onMount } from "svelte";

    const session = authClient.useSession();
    const orgsResult = authClient.useListOrganizations();
    
    // Redirect if not authenticated
    if (!$session.error && !$session.isPending && !$session.isRefetching && !$session.data) {
        goto("/auth/sign/in");
    }

    let slug = $derived(page.params.slug);
    let teamId = $derived((page.params as any).teamId);
    let organization = $state<any>(null);
    let team = $state<any>(null);
    let teamMembers = $state<any[]>([]);
    
    let loading = $state({
        loadTeam: true,
        updateTeam: false,
        deleteTeam: false,
        loadMembers: false,
        addMember: false,
        removeMember: false
    });

    let messages = $state({
        update: "",
        delete: "",
        members: ""
    });

    let errors = $state({
        update: "",
        delete: "",
        members: ""
    });

    // Form states
    let updateForm = $state({
        name: ""
    });

    let addMemberForm = $state({
        userId: ""
    });

    let showDeleteConfirm = $state(false);
    let deleteConfirmText = $state("");
    let showAddMemberForm = $state(false);

    function clearMessages() {
        messages.update = "";
        messages.delete = "";
        messages.members = "";
        errors.update = "";
        errors.delete = "";
        errors.members = "";
    }

    async function setActiveTeam() {
        const { data, error } = await authClient.organization.setActiveTeam({
            teamId: page.params.teamId,
        });
    }


    $effect(() => {
       setActiveTeam()
    })

    async function loadTeamData() {
        try {
            loading.loadTeam = true;
            
            // First, get all organizations to find the one with matching slug
            const organizations = $orgsResult.data || [];
            
            const foundOrg = organizations.find((org: any) => org.slug === slug);
            
            if (!foundOrg) {
                goto("/org");
                return;
            }

            organization = foundOrg;

            // Set as active organization
            await authClient.organization.setActive({
                organizationId: foundOrg.id
            });

            // Get teams list to find our team
            const teamsResult = await authClient.organization.listTeams();
            const teams = teamsResult.data || [];
            
            const foundTeam = teams.find((t: any) => t.id === teamId);
            
            if (!foundTeam) {
                goto(`/org/manage/${slug}`);
                return;
            }

            team = foundTeam;
            updateForm.name = team.name;

            // Load team members
            await loadTeamMembers();
            
        } catch (err) {
            console.error("Failed to load team:", err);
            goto("/org");
        } finally {
            loading.loadTeam = false;
        }
    }

    async function loadTeamMembers() {
        try {
            loading.loadMembers = true;
            if (!page.params.teamId) return;
            const result = await authClient.organization.listTeamMembers({
                query: {
                    teamId: page.params.teamId
                }
            });
            
            if (result.data) {
                teamMembers = result.data;
            }
        } catch (err) {
            console.error("Failed to load team members:", err);
        } finally {
            loading.loadMembers = false;
        }
    }

    async function updateTeam(event: SubmitEvent) {
        event.preventDefault();
        try {
            loading.updateTeam = true;
            clearMessages();

            const { error } = await authClient.organization.updateTeam({
                teamId: teamId,
                data: {
                    name: updateForm.name
                }
            });

            if (error) {
                errors.update = "Failed to update team: " + error.message;
            } else {
                messages.update = "Team updated successfully!";
                team.name = updateForm.name;
            }
        } catch (err) {
            errors.update = "Failed to update team: " + (err as Error).message;
        } finally {
            loading.updateTeam = false;
        }
    }

    async function deleteTeam() {
        try {
            loading.deleteTeam = true;
            clearMessages();

            if (deleteConfirmText !== "DELETE") {
                errors.delete = "Please type 'DELETE' to confirm";
                return;
            }

            const { error } = await authClient.organization.removeTeam({
                teamId: teamId
            });

            if (error) {
                errors.delete = "Failed to delete team: " + error.message;
            } else {
                messages.delete = "Team deleted successfully!";
                // Redirect to organization management after successful deletion
                setTimeout(() => goto(`/org/manage/${slug}`), 2000);
            }
        } catch (err) {
            errors.delete = "Failed to delete team: " + (err as Error).message;
        } finally {
            loading.deleteTeam = false;
        }
    }

    async function addTeamMember(event: SubmitEvent) {
        event.preventDefault();
        try {
            loading.addMember = true;
            clearMessages();

            const { error } = await authClient.organization.addTeamMember({
                teamId: teamId,
                userId: addMemberForm.userId
            } as any);

            if (error) {
                errors.members = "Failed to add member: " + error.message;
            } else {
                messages.members = "Member added successfully!";
                addMemberForm.userId = "";
                showAddMemberForm = false;
                await loadTeamMembers();
            }
        } catch (err) {
            errors.members = "Failed to add member: " + (err as Error).message;
        } finally {
            loading.addMember = false;
        }
    }

    async function removeTeamMember(userId: string) {
        try {
            loading.removeMember = true;
            clearMessages();

            const { error } = await authClient.organization.removeTeamMember({
                teamId: teamId,
                userId: userId
            });

            if (error) {
                errors.members = "Failed to remove member: " + error.message;
            } else {
                messages.members = "Member removed successfully!";
                await loadTeamMembers();
            }
        } catch (err) {
            errors.members = "Failed to remove member: " + (err as Error).message;
        } finally {
            loading.removeMember = false;
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

    onMount(() => {
        loadTeamData();
    });
</script>

<div class="container">
    {#if loading.loadTeam}
        <div class="loading-state">
            <h2>Loading team...</h2>
        </div>
    {:else if !team || !organization}
        <div class="empty-state">
            <h2>Team not found</h2>
            <p>The team you're looking for doesn't exist or you don't have access to it.</p>
            <Button.Root href="/org" class="btn btn-primary">
                Back to Organizations
            </Button.Root>
        </div>
    {:else}
        <div class="header">
            <h1 class="title">Manage Team</h1>
            <p class="subtitle">Update settings and manage {team.name}</p>
        </div>

        <!-- Navigation -->
        <div class="breadcrumb">
            <a href="/org">Organizations</a>
            <span>/</span>
            <a href="/org/{organization.slug}">{organization.name}</a>
            <span>/</span>
            <a href="/org/manage/{organization.slug}">Manage</a>
            <span>/</span>
            <span>{team.name}</span>
        </div>

        <!-- Team Settings -->
        <div class="card">
            <h2 class="section-title">
                <span class="status-dot blue"></span>
                Team Settings
            </h2>

            <form onsubmit={updateTeam}>
                <div class="form-group">
                    <label for="team-name" class="field-label">Team Name</label>
                    <input
                        id="team-name"
                        type="text"
                        bind:value={updateForm.name}
                        class="form-input"
                        placeholder="Enter team name"
                        required
                    />
                </div>

                {#if messages.update}
                    <div class="message success">{messages.update}</div>
                {/if}
                {#if errors.update}
                    <div class="message error">{errors.update}</div>
                {/if}

                <div class="form-actions">
                    <Button.Root 
                        type="submit" 
                        class="btn btn-primary"
                        disabled={loading.updateTeam}
                    >
                        {loading.updateTeam ? "Updating..." : "Update Team"}
                    </Button.Root>
                </div>
            </form>
        </div>

        <!-- Team Members -->
        <div class="card">
            <div class="section-header">
                <h2 class="section-title">
                    <span class="status-dot green"></span>
                    Team Members
                </h2>
                <Button.Root 
                    onclick={() => showAddMemberForm = !showAddMemberForm}
                    class="btn btn-primary"
                >
                    Add Member
                </Button.Root>
            </div>

            <!-- Add Member Form -->
            {#if showAddMemberForm}
                <div class="form-section">
                    <form onsubmit={addTeamMember}>
                        <div class="form-group">
                            <label for="user-id" class="field-label">User ID</label>
                            <input
                                id="user-id"
                                type="text"
                                bind:value={addMemberForm.userId}
                                class="form-input"
                                placeholder="Enter user ID"
                                required
                            />
                            <small class="field-help">Enter the ID of an existing organization member</small>
                        </div>

                        <div class="form-actions">
                            <Button.Root 
                                type="submit" 
                                class="btn btn-primary"
                                disabled={loading.addMember}
                            >
                                {loading.addMember ? "Adding..." : "Add Member"}
                            </Button.Root>
                            <Button.Root 
                                onclick={() => showAddMemberForm = false}
                                class="btn btn-secondary"
                            >
                                Cancel
                            </Button.Root>
                        </div>
                    </form>
                </div>
            {/if}

            {#if messages.members}
                <div class="message success">{messages.members}</div>
            {/if}
            {#if errors.members}
                <div class="message error">{errors.members}</div>
            {/if}

            <!-- Members List -->
            {#if loading.loadMembers}
                <div class="loading-state">Loading team members...</div>
            {:else if teamMembers.length === 0}
                <div class="empty-state">
                    <h4>No Team Members</h4>
                    <p>This team doesn't have any members yet.</p>
                </div>
            {:else}
                <div class="members-list">
                    {#each teamMembers as member (member.id)}
                        <div class="member-item">
                            <div class="member-info">
                                <div class="member-details">
                                    <h4>{member.name || member.email || member.userId || 'Unknown User'}</h4>
                                    <p class="member-meta">
                                        Added {formatDate(member.createdAt)}
                                    </p>
                                </div>
                            </div>
                            
                            <Button.Root 
                                onclick={() => removeTeamMember(member.userId)}
                                class="btn btn-xs btn-danger"
                                disabled={loading.removeMember}
                            >
                                {loading.removeMember ? "Removing..." : "Remove"}
                            </Button.Root>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Team Info -->
        <div class="card">
            <h2 class="section-title">
                <span class="status-dot green"></span>
                Team Information
            </h2>

            <div class="info-grid">
                <div class="field">
                    <span class="field-label">Team ID</span>
                    <p class="field-value mono">{team.id}</p>
                </div>
                <div class="field">
                    <span class="field-label">Created</span>
                    <p class="field-value">{formatDate(team.createdAt)}</p>
                </div>
                <div class="field">
                    <span class="field-label">Last Updated</span>
                    <p class="field-value">{formatDate(team.updatedAt)}</p>
                </div>
                <div class="field">
                    <span class="field-label">Members Count</span>
                    <p class="field-value">{teamMembers.length}</p>
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
                    <h3>Delete Team</h3>
                    <p>Permanently delete this team and remove all members. This action cannot be undone.</p>
                </div>

                {#if !showDeleteConfirm}
                    <Button.Root 
                        onclick={() => showDeleteConfirm = true}
                        class="btn btn-danger"
                    >
                        Delete Team
                    </Button.Root>
                {:else}
                    <div class="delete-confirm">
                        <p class="confirm-text">Type <strong>DELETE</strong> to confirm team deletion:</p>
                        <input
                            type="text"
                            bind:value={deleteConfirmText}
                            class="form-input"
                            placeholder="Type DELETE"
                        />
                        
                        {#if messages.delete}
                            <div class="message success">{messages.delete}</div>
                        {/if}
                        {#if errors.delete}
                            <div class="message error">{errors.delete}</div>
                        {/if}

                        <div class="confirm-actions">
                            <Button.Root 
                                onclick={deleteTeam}
                                class="btn btn-danger"
                                disabled={loading.deleteTeam}
                            >
                                {loading.deleteTeam ? "Deleting..." : "Confirm Delete"}
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
        margin-bottom: 1.5rem;
    }

    .form-section {
        background: #374151;
        border-radius: 8px;
        padding: 1.5rem;
        margin-bottom: 1.5rem;
        border: 1px solid #4b5563;
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

    .members-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .member-item {
        background: #374151;
        border-radius: 8px;
        padding: 1rem;
        border: 1px solid #4b5563;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .member-info {
        flex: 1;
    }

    .member-details h4 {
        color: #f9fafb;
        margin: 0 0 0.25rem 0;
        font-size: 1rem;
        font-weight: 600;
    }

    .member-meta {
        color: #9ca3af;
        margin: 0;
        font-size: 0.875rem;
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

    .loading-state, .empty-state {
        text-align: center;
        padding: 2rem;
        color: #9ca3af;
    }

    .empty-state h2, .loading-state h2, .empty-state h4 {
        color: #f9fafb;
        margin-bottom: 0.5rem;
    }

    @media (max-width: 768px) {
        .section-header {
            flex-direction: column;
            gap: 1rem;
            align-items: stretch;
        }

        .danger-content {
            flex-direction: column;
        }

        .delete-confirm {
            max-width: none;
        }

        .member-item {
            flex-direction: column;
            align-items: stretch;
            gap: 1rem;
        }
    }
</style>