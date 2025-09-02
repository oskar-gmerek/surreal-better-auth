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
  updateOrg: false,
  deleteOrg: false,
});

let messages = $state({
  update: "",
  delete: "",
});

let errors = $state({
  update: "",
  delete: "",
});

// Form states
let updateForm = $state({
  name: "",
  logo: "",
  myCustomField: "",
});

let showDeleteConfirm = $state(false);
let deleteConfirmText = $state("");

function clearMessages() {
  messages.update = "";
  messages.delete = "";
  errors.update = "";
  errors.delete = "";
}

async function loadOrganization() {
  try {
    loading.loadOrg = true;

    // First, get all organizations to find the one with matching slug
    const organizations = $orgsResult.data || [];

    const foundOrg = organizations.find((org: any) => org.slug === slug);

    if (!foundOrg) {
      goto("/org");
      return;
    }

    // Set as active organization to get full details
    await authClient.organization.setActive({
      organizationId: foundOrg.id,
    });

    // Get full organization details
    const fullOrgResult = await authClient.organization.getFullOrganization();

    if (fullOrgResult.data) {
      organization = fullOrgResult.data;
      updateForm = {
        name: organization.name || "",
        logo: organization.logo || "",
        myCustomField: (organization as any).myCustomField || "",
      };
    }
  } catch (err) {
    console.error("Failed to load organization:", err);
    goto("/org");
  } finally {
    loading.loadOrg = false;
  }
}

async function updateOrganization(event: SubmitEvent) {
  event.preventDefault();
  try {
    loading.updateOrg = true;
    clearMessages();

    // Build update data - only include non-empty fields
    const updateData: any = {};

    if (updateForm.name.trim()) {
      updateData.name = updateForm.name.trim();
    }

    if (updateForm.logo.trim()) {
      updateData.logo = updateForm.logo.trim();
    }

    if (updateForm.myCustomField.trim()) {
      updateData.myCustomField = updateForm.myCustomField.trim();
    }

    const { error } = await authClient.organization.update({
      data: updateData,
    } as any);

    if (error) {
      errors.update = `Failed to update organization: ${error.message}`;
    } else {
      messages.update = "Organization updated successfully!";
      await loadOrganization(); // Reload to get updated data
    }
  } catch (err) {
    errors.update = `Failed to update organization: ${(err as Error).message}`;
  } finally {
    loading.updateOrg = false;
  }
}

async function deleteOrganization() {
  try {
    loading.deleteOrg = true;
    clearMessages();

    if (deleteConfirmText !== "DELETE") {
      errors.delete = "Please type 'DELETE' to confirm";
      return;
    }

    const { error } = await authClient.organization.delete({
      organizationId: organization.id,
    });

    if (error) {
      errors.delete = `Failed to delete organization: ${error.message}`;
    } else {
      messages.delete = "Organization deleted successfully!";
      // Redirect to organizations list after successful deletion
      setTimeout(() => goto("/org"), 2000);
    }
  } catch (err) {
    errors.delete = `Failed to delete organization: ${(err as Error).message}`;
  } finally {
    loading.deleteOrg = false;
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
            <p>
                The organization you're looking for doesn't exist or you don't
                have access to it.
            </p>
            <Button.Root href="/org" class="btn btn-primary">
                Back to Organizations
            </Button.Root>
        </div>
    {:else}
        <div class="header">
            <h1 class="title">Manage Organization</h1>
            <p class="subtitle">
                Update settings and manage {organization.name}
            </p>
        </div>

        <!-- Navigation -->
        <div class="breadcrumb">
            <a href="/org">Organizations</a>
            <span>/</span>
            <a href="/org/{organization.slug}">{organization.name}</a>
            <span>/</span>
            <span>Manage</span>
        </div>

        <!-- Organization Settings -->
        <div class="card">
            <h2 class="section-title">
                <span class="status-dot blue"></span>
                Organization Settings
            </h2>

            <form onsubmit={updateOrganization}>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="org-name" class="field-label"
                            >Organization Name</label
                        >
                        <input
                            id="org-name"
                            type="text"
                            bind:value={updateForm.name}
                            class="form-input"
                            placeholder="Enter organization name"
                            required
                        />
                    </div>

                    <div class="form-group">
                        <label for="org-slug" class="field-label"
                            >Slug (Read-only)</label
                        >
                        <input
                            id="org-slug"
                            type="text"
                            value={organization.slug}
                            class="form-input"
                            disabled
                        />
                        <small class="field-help"
                            >Organization slug cannot be changed</small
                        >
                    </div>

                    <div class="form-group">
                        <label for="org-logo" class="field-label"
                            >Logo URL</label
                        >
                        <input
                            id="org-logo"
                            type="url"
                            bind:value={updateForm.logo}
                            class="form-input"
                            placeholder="https://example.com/logo.png"
                        />
                    </div>

                    <div class="form-group">
                        <label for="org-custom" class="field-label"
                            >Custom Field</label
                        >
                        <input
                            id="org-custom"
                            type="text"
                            bind:value={updateForm.myCustomField}
                            class="form-input"
                            placeholder="Custom field value"
                        />
                    </div>
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
                        disabled={loading.updateOrg}
                    >
                        {loading.updateOrg
                            ? "Updating..."
                            : "Update Organization"}
                    </Button.Root>
                </div>
            </form>
        </div>

        <!-- Members Management -->
        <div class="card">
            <div class="section-header">
                <h2 class="section-title">
                    <span class="status-dot green"></span>
                    Members
                </h2>
                <Button.Root
                    href="/org/manage/{organization.slug}/members"
                    class="btn btn-primary"
                >
                    Manage Members
                </Button.Root>
            </div>

            <p class="section-description">
                Invite new members and manage existing members of your organization.
            </p>

            <div class="quick-actions">
                <Button.Root
                    href="/org/manage/{organization.slug}/members"
                    class="btn btn-secondary"
                >
                    View All Members
                </Button.Root>
            </div>
        </div>

        <!-- Teams Management -->
        <div class="card">
            <div class="section-header">
                <h2 class="section-title">
                    <span class="status-dot blue"></span>
                    Teams
                </h2>
                <Button.Root
                    href="/org/manage/{organization.slug}/teams"
                    class="btn btn-primary"
                >
                    Manage Teams
                </Button.Root>
            </div>

            <p class="section-description">
                Organize your organization members into teams for better
                collaboration and access control.
            </p>

            <div class="quick-actions">
                <Button.Root
                    href="/org/manage/{organization.slug}/teams/create"
                    class="btn btn-secondary"
                >
                    Create New Team
                </Button.Root>
            </div>
        </div>

        <!-- Organization Info -->
        <div class="card">
            <h2 class="section-title">
                <span class="status-dot green"></span>
                Organization Information
            </h2>

            <div class="info-grid">
                <div class="field">
                    <span class="field-label">Organization ID</span>
                    <p class="field-value mono">{organization.id}</p>
                </div>
                <div class="field">
                    <span class="field-label">Created</span>
                    <p class="field-value">
                        {formatDate(organization.createdAt)}
                    </p>
                </div>
                <div class="field">
                    <span class="field-label">Members</span>
                    <p class="field-value">
                        {organization.members?.length || 0}
                    </p>
                </div>
                <div class="field">
                    <span class="field-label">Pending Invitations</span>
                    <p class="field-value">
                        {organization.invitations?.length || 0}
                    </p>
                </div>
            </div>
        </div>

        <!-- Danger Zone -->
        <div class="card danger-card">
            <h2 class="section-title">
                <span class="status-dot" style="background-color: #ef4444;"
                ></span>
                Danger Zone
            </h2>

            <div class="danger-content">
                <div class="danger-info">
                    <h3>Delete Organization</h3>
                    <p>
                        Permanently delete this organization and all associated
                        data. This action cannot be undone.
                    </p>
                </div>

                {#if !showDeleteConfirm}
                    <Button.Root
                        onclick={() => (showDeleteConfirm = true)}
                        class="btn btn-danger"
                    >
                        Delete Organization
                    </Button.Root>
                {:else}
                    <div class="delete-confirm">
                        <p class="confirm-text">
                            Type <strong>DELETE</strong> to confirm organization
                            deletion:
                        </p>
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
                                onclick={deleteOrganization}
                                class="btn btn-danger"
                                disabled={loading.deleteOrg}
                            >
                                {loading.deleteOrg
                                    ? "Deleting..."
                                    : "Confirm Delete"}
                            </Button.Root>
                            <Button.Root
                                onclick={() => {
                                    showDeleteConfirm = false;
                                    deleteConfirmText = "";
                                }}
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

    .form-input:disabled {
        background-color: #374151;
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

    .quick-actions {
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

    @media (max-width: 768px) {
        .danger-content {
            flex-direction: column;
        }

        .delete-confirm {
            max-width: none;
        }
    }
</style>
