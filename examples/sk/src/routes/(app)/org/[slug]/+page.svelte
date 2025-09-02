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
    let loading = $state(true);
    let isUserMember = $state(false);
    let memberCount = $state(0);
    let members = $state<any[]>([]);

    async function loadOrganization() {
        try {
            loading = true;
            
            // Get all organizations to find the one with matching slug
            const organizations = $orgsResult.data || [];
            
            const foundOrg = organizations.find((org: any) => org.slug === slug);
            
            if (!foundOrg) {
                // Organization not found or user doesn't have access
                organization = null;
                return;
            }

            organization = foundOrg;
            
            // Check if user is a member (if they can see it in their list, they're a member)
            isUserMember = true;

            // Load member count by setting this org as active and getting member data
            try {
                await authClient.organization.setActive({
                    organizationId: foundOrg.id
                });
                
                const membersResult = await authClient.organization.listMembers();
                if (membersResult.data) {
                    members = membersResult.data.members || [];
                    memberCount = members.length;
                }
            } catch (err) {
                console.error("Failed to load member count:", err);
                memberCount = 0;
            }

        } catch (err) {
            console.error("Failed to load organization:", err);
            organization = null;
        } finally {
            loading = false;
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

<svelte:head>
    <title>{organization?.name || 'Organization'} - SurrealDB Auth</title>
    <meta name="description" content="View {organization?.name || 'organization'} information" />
</svelte:head>

<div class="container">
    {#if loading}
        <div class="loading-state">
            <h2>Loading organization...</h2>
        </div>
    {:else if !organization}
        <div class="empty-state">
            <h2>Organization not found</h2>
            <p>The organization you're looking for doesn't exist or is private.</p>
            {#if $session.data}
                <Button.Root href="/org" class="btn btn-primary">
                    Back to Organizations
                </Button.Root>
            {:else}
                <Button.Root href="/auth/sign/in" class="btn btn-primary">
                    Sign In
                </Button.Root>
            {/if}
        </div>
    {:else}
        <!-- Organization Header -->
        <div class="org-header">
            <div class="org-info">
                {#if organization.logo}
                    <img src={organization.logo} alt={organization.name} class="org-logo-large" />
                {:else}
                    <div class="org-logo-large-placeholder">
                        {organization.name.charAt(0).toUpperCase()}
                    </div>
                {/if}
                
                <div class="org-details">
                    <h1 class="org-name">{organization.name}</h1>
                    <p class="org-slug">/{organization.slug}</p>
                    
                    {#if (organization as any).myCustomField}
                        <p class="org-description">{(organization as any).myCustomField}</p>
                    {/if}
                </div>
            </div>

            <div class="org-actions">
                {#if $session.data && isUserMember}
                    <Button.Root 
                        href="/org/manage/{organization.slug}"
                        class="btn btn-primary"
                    >
                        Manage Organization
                    </Button.Root>
                {:else if $session.data}
                    <Button.Root 
                        href="/org"
                        class="btn btn-secondary"
                    >
                        View My Organizations
                    </Button.Root>
                {:else}
                    <Button.Root 
                        href="/auth/sign/in"
                        class="btn btn-primary"
                    >
                        Sign In to Join
                    </Button.Root>
                {/if}
            </div>
        </div>

        <!-- Organization Stats -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon">👥</div>
                <div class="stat-info">
                    <h3>{memberCount}</h3>
                    <p>Organization members</p>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-icon">📅</div>
                <div class="stat-info">
                    <h3>Created</h3>
                    <p>{formatDate(organization.createdAt)}</p>
                </div>
            </div>

            <div class="stat-card">
                <div class="stat-icon">🏷️</div>
                <div class="stat-info">
                    <h3>Identifier</h3>
                    <p class="mono">{organization.id}</p>
                </div>
            </div>
        </div>

        <!-- Organization Information -->
        <div class="card">
            <h2 class="section-title">
                <span class="status-dot blue"></span>
                About This Organization
            </h2>

            <div class="org-content">
                <div class="info-section">
                    <h3>Organization Details</h3>
                    <div class="info-grid">
                        <div class="field">
                            <span class="field-label">Name</span>
                            <p class="field-value">{organization.name}</p>
                        </div>
                        <div class="field">
                            <span class="field-label">Slug</span>
                            <p class="field-value mono">/{organization.slug}</p>
                        </div>
                        <div class="field">
                            <span class="field-label">Created</span>
                            <p class="field-value">{formatDate(organization.createdAt)}</p>
                        </div>
                        {#if (organization as any).myCustomField}
                            <div class="field">
                                <span class="field-label">Custom Field</span>
                                <p class="field-value">{(organization as any).myCustomField}</p>
                            </div>
                        {/if}
                    </div>
                </div>

                {#if !$session.data}
                    <div class="cta-section">
                        <h3>Join This Organization</h3>
                        <p>Sign in to request access to this organization or create your own.</p>
                        <div class="cta-actions">
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
        </div>

        <!-- Members List -->
        {#if $session.data && isUserMember && members.length > 0}
            <div class="card">
                <h2 class="section-title">
                    <span class="status-dot green"></span>
                    Organization Members ({members.length})
                </h2>

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
            </div>
        {/if}

        <!-- Navigation -->
        {#if $session.data}
            <div class="navigation-card">
                <h3>Quick Actions</h3>
                <div class="nav-actions">
                    <Button.Root href="/org" class="btn btn-secondary">
                        View All Organizations
                    </Button.Root>
                    {#if isUserMember}
                        <Button.Root href="/org/manage/{organization.slug}" class="btn btn-primary">
                            Manage This Organization
                        </Button.Root>
                    {/if}
                </div>
            </div>
        {/if}
    {/if}
</div>

<style>
    .org-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 2rem;
        padding: 2rem;
        background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
        border-radius: 12px;
        border: 1px solid #374151;
    }

    .org-info {
        display: flex;
        align-items: center;
        gap: 1.5rem;
        flex: 1;
    }

    .org-logo-large {
        width: 80px;
        height: 80px;
        border-radius: 12px;
        object-fit: cover;
    }

    .org-logo-large-placeholder {
        width: 80px;
        height: 80px;
        border-radius: 12px;
        background: #3b82f6;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 2rem;
    }

    .org-name {
        color: #f9fafb;
        margin: 0 0 0.5rem 0;
        font-size: 2rem;
        font-weight: bold;
    }

    .org-slug {
        color: #9ca3af;
        margin: 0 0 0.5rem 0;
        font-size: 1rem;
        font-family: ui-monospace, monospace;
    }

    .org-description {
        color: #d1d5db;
        margin: 0;
        font-size: 1rem;
        line-height: 1.5;
    }

    .org-actions {
        display: flex;
        gap: 0.75rem;
    }

    .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
        margin-bottom: 2rem;
    }

    .stat-card {
        background: #1f2937;
        border-radius: 8px;
        padding: 1.5rem;
        border: 1px solid #374151;
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    .stat-icon {
        font-size: 2rem;
    }

    .stat-info h3 {
        color: #f9fafb;
        margin: 0 0 0.25rem 0;
        font-size: 1.125rem;
        font-weight: 600;
    }

    .stat-info p {
        color: #9ca3af;
        margin: 0;
        font-size: 0.875rem;
    }

    .stat-info p.mono {
        font-family: ui-monospace, monospace;
        font-size: 0.75rem;
    }

    .org-content {
        display: grid;
        grid-template-columns: 1fr;
        gap: 2rem;
    }

    @media (min-width: 768px) {
        .org-content {
            grid-template-columns: 2fr 1fr;
        }
    }

    .info-section h3 {
        color: #f9fafb;
        margin: 0 0 1rem 0;
        font-size: 1.25rem;
        font-weight: 600;
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

    .cta-section {
        background: #374151;
        border-radius: 8px;
        padding: 1.5rem;
        text-align: center;
    }

    .cta-section h3 {
        color: #f9fafb;
        margin: 0 0 0.5rem 0;
        font-size: 1.25rem;
        font-weight: 600;
    }

    .cta-section p {
        color: #9ca3af;
        margin: 0 0 1.5rem 0;
        line-height: 1.5;
    }

    .cta-actions {
        display: flex;
        gap: 0.75rem;
        justify-content: center;
    }

    .navigation-card {
        background: #1f2937;
        border-radius: 8px;
        padding: 1.5rem;
        border: 1px solid #374151;
        margin-top: 2rem;
    }

    .navigation-card h3 {
        color: #f9fafb;
        margin: 0 0 1rem 0;
        font-size: 1.125rem;
        font-weight: 600;
    }

    .nav-actions {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
    }

    .members-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .member-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem;
        border: 1px solid #374151;
        border-radius: 8px;
        background-color: #1f2937;
    }

    .member-info {
        flex: 1;
    }

    .member-info h3 {
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

    .member-role {
        display: inline-block;
        padding: 0.25rem 0.5rem;
        background-color: #3b82f6;
        color: white;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 500;
        text-transform: capitalize;
    }

    .member-meta {
        text-align: right;
        color: #9ca3af;
        font-size: 0.875rem;
    }

    .loading-state, .empty-state {
        text-align: center;
        padding: 4rem 2rem;
        color: #9ca3af;
    }

    .empty-state h2, .loading-state h2 {
        color: #f9fafb;
        margin-bottom: 1rem;
    }

    @media (max-width: 768px) {
        .org-header {
            flex-direction: column;
            gap: 1.5rem;
        }

        .org-info {
            flex-direction: column;
            text-align: center;
        }

        .org-actions {
            align-self: stretch;
        }

        .cta-actions {
            flex-direction: column;
        }

        .nav-actions {
            flex-direction: column;
        }
    }
</style>