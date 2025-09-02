<script lang="ts">
  import { goto } from "$app/navigation";
  import { authClient } from "$lib/auth-client";
  import { Button } from "bits-ui";

  const organizations = authClient.useListOrganizations();
  const session = authClient.useSession();
  const activeOrganization = authClient.useActiveOrganization();

  // Redirect if not authenticated
  $effect(() => {
    if (!$session.isPending && !$session.isRefetching && !$session.data) {
      goto("/auth/sign/in");
    }
  });

  // Form states
  let createOrgForm = $state({
    name: "",
    slug: "",
    logo: "",
    myCustomField: "",
  });

  let inviteForm = $state({
    email: "",
    role: "member" as "admin" | "member" | "owner",
  });

  // UI states
  let loading = $state({
    createOrg: false,
    setActive: false,
    invite: false,
    loadMembers: false,
    loadInvitations: false,
    loadTeams: false,
    loadUserInvitations: false,
    createTeam: false,
    acceptInvitation: false,
    rejectInvitation: false,
  });

  let messages = $state({
    createOrg: "",
    invite: "",
    general: "",
    createTeam: "",
    userInvitations: "",
  });

  let errors = $state({
    createOrg: "",
    invite: "",
    general: "",
    createTeam: "",
    userInvitations: "",
  });

  // Data states
  let members = $state<any[]>([]);
  let invitations = $state<any[]>([]);
  let teams = $state<any[]>([]);
  let userInvitations = $state<any[]>([]);
  let showCreateForm = $state(false);
  let showInviteForm = $state(false);
  let showCreateTeamForm = $state(false);
  let activeTab = $state<"overview" | "members" | "invitations" | "teams">(
    "overview",
  );

  // Team creation form
  let createTeamForm = $state({
    name: "",
  });

  function clearMessages() {
    messages.createOrg = "";
    messages.invite = "";
    messages.general = "";
    errors.createOrg = "";
    errors.invite = "";
    errors.general = "";
  }

  function normalizeSlug(slug: string) {
    return slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function createOrganization(event: SubmitEvent) {
    event.preventDefault();
    try {
      loading.createOrg = true;
      clearMessages();

      const normalizedSlug = normalizeSlug(createOrgForm.slug);

      // Check if slug is available
      const slugCheck = await authClient.organization.checkSlug({
        slug: normalizedSlug,
      });

      if (!slugCheck.data?.status) {
        errors.createOrg = "Organization slug is not available";
        return;
      }

      const { error } = await authClient.organization.create({
        name: createOrgForm.name,
        slug: normalizedSlug,
        logo: createOrgForm.logo || undefined,
        myCustomField: createOrgForm.myCustomField || undefined,
        keepCurrentActiveOrganization: false,
      } as any);

      if (error) {
        errors.createOrg = "Failed to create organization: " + error.message;
      } else {
        messages.createOrg = "Organization created successfully!";
        createOrgForm = { name: "", slug: "", logo: "", myCustomField: "" };
        showCreateForm = false;
        // Refresh organizations list
        $organizations.refetch();
      }
    } catch (err) {
      errors.createOrg =
        "Failed to create organization: " + (err as Error).message;
    } finally {
      loading.createOrg = false;
    }
  }

  async function setActiveOrg(orgId: string) {
    try {
      loading.setActive = true;
      clearMessages();

      const { error } = await authClient.organization.setActive({
        organizationId: orgId,
      });

      if (error) {
        errors.general = "Failed to set active organization: " + error.message;
      } else {
        messages.general = "Active organization updated!";
        // Reset data for the new organization
        members = [];
        invitations = [];
        teams = [];
        // Switch to overview tab
        activeTab = "overview";
      }
    } catch (err) {
      errors.general =
        "Failed to set active organization: " + (err as Error).message;
    } finally {
      loading.setActive = false;
    }
  }

  async function inviteMember(event: SubmitEvent) {
    event.preventDefault();
    try {
      loading.invite = true;
      clearMessages();

      const inviteResult = await authClient.organization.inviteMember({
        email: inviteForm.email,
        role: inviteForm.role,
      });

      if (inviteResult.error) {
        errors.invite =
          "Failed to send invitation: " + inviteResult.error.message;
      } else {
        const invitationId = inviteResult.data?.id || "unknown";
        messages.invite = `Invitation sent successfully! Invitation ID: ${invitationId}`;
        inviteForm = { email: "", role: "member" };
        showInviteForm = false;
        await loadInvitations();
      }
    } catch (err) {
      errors.invite = "Failed to send invitation: " + (err as Error).message;
    } finally {
      loading.invite = false;
    }
  }

  async function loadMembers() {
    if (!$activeOrganization.data) return;

    try {
      loading.loadMembers = true;
      const result = await authClient.organization.listMembers();

      if (result.data) {
        members = result.data.members || [];
      }
    } catch (err) {
      console.error("Failed to load members:", err);
    } finally {
      loading.loadMembers = false;
    }
  }

  async function loadInvitations() {
    if (!$activeOrganization.data) return;

    try {
      loading.loadInvitations = true;
      const result = await authClient.organization.listInvitations();

      if (result.data) {
        invitations = result.data;
      }
    } catch (err) {
      console.error("Failed to load invitations:", err);
    } finally {
      loading.loadInvitations = false;
    }
  }

  async function loadTeams() {
    if (!$activeOrganization.data) return;

    try {
      loading.loadTeams = true;
      const result = await authClient.organization.listTeams();

      if (result.data) {
        teams = result.data;
      }
    } catch (err) {
      console.error("Failed to load teams:", err);
    } finally {
      loading.loadTeams = false;
    }
  }

  async function loadOrganizationData() {
    if (!$activeOrganization.data) return;

    switch (activeTab) {
      case "members":
        if (members.length === 0) await loadMembers();
        break;
      case "invitations":
        if (invitations.length === 0) await loadInvitations();
        break;
      case "teams":
        if (teams.length === 0) await loadTeams();
        break;
    }
  }

  async function removeMember(memberEmail: string) {
    try {
      const { error } = await authClient.organization.removeMember({
        memberIdOrEmail: memberEmail,
      });

      if (error) {
        errors.general = "Failed to remove member: " + error.message;
      } else {
        messages.general = "Member removed successfully!";
        await loadMembers();
      }
    } catch (err) {
      errors.general = "Failed to remove member: " + (err as Error).message;
    }
  }

  async function cancelInvitation(invitationId: string) {
    try {
      const { error } = await authClient.organization.cancelInvitation({
        invitationId,
      });

      if (error) {
        errors.general = "Failed to cancel invitation: " + error.message;
      } else {
        messages.general = "Invitation cancelled successfully!";
        await loadInvitations();
      }
    } catch (err) {
      errors.general = "Failed to cancel invitation: " + (err as Error).message;
    }
  }

  async function loadUserInvitations() {
    try {
      loading.loadUserInvitations = true;
      const result = await authClient.organization.listUserInvitations();

      if (result.data) {
        userInvitations = result.data;
      }
    } catch (err) {
      console.error("Failed to load user invitations:", err);
    } finally {
      loading.loadUserInvitations = false;
    }
  }

  async function acceptInvitation(invitationId: string) {
    try {
      loading.acceptInvitation = true;
      const { error } = await authClient.organization.acceptInvitation({
        invitationId,
      });

      if (error) {
        errors.userInvitations =
          "Failed to accept invitation: " + error.message;
      } else {
        messages.userInvitations = "Invitation accepted successfully!";
        await loadUserInvitations();
        await $organizations.refetch();
      }
    } catch (err) {
      errors.userInvitations =
        "Failed to accept invitation: " + (err as Error).message;
    } finally {
      loading.acceptInvitation = false;
    }
  }

  async function rejectInvitation(invitationId: string) {
    try {
      loading.rejectInvitation = true;
      const { error } = await authClient.organization.rejectInvitation({
        invitationId,
      });

      if (error) {
        errors.userInvitations =
          "Failed to reject invitation: " + error.message;
      } else {
        messages.userInvitations = "Invitation rejected successfully!";
        await loadUserInvitations();
      }
    } catch (err) {
      errors.userInvitations =
        "Failed to reject invitation: " + (err as Error).message;
    } finally {
      loading.rejectInvitation = false;
    }
  }

  async function createTeam(event: SubmitEvent) {
    event.preventDefault();
    try {
      loading.createTeam = true;
      clearMessages();

      const { error } = await authClient.organization.createTeam({
        name: createTeamForm.name,
      });

      if (error) {
        errors.createTeam = "Failed to create team: " + error.message;
      } else {
        messages.createTeam = "Team created successfully!";
        createTeamForm = { name: "" };
        showCreateTeamForm = false;
        await loadTeams();
      }
    } catch (err) {
      errors.createTeam = "Failed to create team: " + (err as Error).message;
    } finally {
      loading.createTeam = false;
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

  function getRoleColor(role: string) {
    switch (role) {
      case "owner":
        return "bg-purple-600";
      case "admin":
        return "bg-blue-600";
      case "member":
        return "bg-green-600";
      default:
        return "bg-gray-600";
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case "pending":
        return "bg-yellow-600";
      case "accepted":
        return "bg-green-600";
      case "rejected":
        return "bg-red-600";
      default:
        return "bg-gray-600";
    }
  }

  // Load data when active organization changes or tab changes
  let lastActiveOrgId = $state<string | null>(null);
  let lastActiveTab = $state<string>("");

  $effect(() => {
    const currentOrgId = $activeOrganization.data?.id || null;

    // Only load data if organization or tab actually changed
    if (
      currentOrgId &&
      activeTab !== "overview" &&
      (currentOrgId !== lastActiveOrgId || activeTab !== lastActiveTab)
    ) {
      lastActiveOrgId = currentOrgId;
      lastActiveTab = activeTab;
      loadOrganizationData();
    }
  });

  // Load user invitations on mount
  $effect(() => {
    if ($session.data) {
      loadUserInvitations();
    }
  });
</script>

<div class="container">
  <div class="header">
    <h1 class="title">Organizations</h1>
    <p class="subtitle">Manage your organizations, members, and teams</p>
  </div>

  <!-- Global Messages -->
  {#if messages.general}
    <div class="message success">{messages.general}</div>
  {/if}
  {#if errors.general}
    <div class="message error">{errors.general}</div>
  {/if}

  <!-- User Invitations - Only show pending ones -->
  {#if userInvitations.filter((inv) => inv.status === "pending").length > 0}
    <div class="card">
      <div class="section-header">
        <h2 class="section-title">
          <span class="status-dot orange"></span>
          Pending Invitations for You
        </h2>
      </div>

      {#if messages.userInvitations}
        <div class="message success">{messages.userInvitations}</div>
      {/if}
      {#if errors.userInvitations}
        <div class="message error">{errors.userInvitations}</div>
      {/if}

      <div class="invitations-list">
        {#each userInvitations.filter((inv) => inv.status === "pending") as invitation (invitation.id)}
          <div class="invitation-item">
            <div class="invitation-info">
              <div class="invitation-details">
                <h4>
                  Invitation to {invitation.organization?.name ||
                    "Unknown Organization"}
                </h4>
                <p class="invitation-meta">
                  Role: {invitation.role} • Invited {invitation.createdAt
                    ? formatDate(invitation.createdAt)
                    : "Unknown Date"} • Expires {invitation.expiresAt
                    ? formatDate(invitation.expiresAt)
                    : "Unknown Date"}
                </p>
              </div>
              <span class="status-badge {getStatusColor(invitation.status)}"
                >{invitation.status}</span
              >
            </div>

            <div class="invitation-actions">
              <Button.Root
                onclick={() => acceptInvitation(invitation.id)}
                class="btn btn-xs btn-primary"
                disabled={loading.acceptInvitation}
              >
                {loading.acceptInvitation ? "Accepting..." : "Accept"}
              </Button.Root>
              <Button.Root
                onclick={() => rejectInvitation(invitation.id)}
                class="btn btn-xs btn-danger"
                disabled={loading.rejectInvitation}
              >
                {loading.rejectInvitation ? "Rejecting..." : "Reject"}
              </Button.Root>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Organizations List -->
  <div class="card">
    <div class="section-header">
      <h2 class="section-title">
        <span class="status-dot green"></span>
        Your Organizations
      </h2>
      <Button.Root
        onclick={() => (showCreateForm = !showCreateForm)}
        class="btn btn-primary"
      >
        Create Organization
      </Button.Root>
    </div>

    <!-- Create Organization Form -->
    {#if showCreateForm}
      <div class="form-section">
        <h3>Create New Organization</h3>
        <form onsubmit={createOrganization}>
          <div class="form-grid">
            <div class="form-group">
              <label for="org-name" class="field-label">Organization Name</label
              >
              <input
                id="org-name"
                type="text"
                bind:value={createOrgForm.name}
                class="form-input"
                placeholder="Enter organization name"
                required
              />
            </div>

            <div class="form-group">
              <label for="org-slug" class="field-label">Slug</label>
              <input
                id="org-slug"
                type="text"
                bind:value={createOrgForm.slug}
                class="form-input"
                placeholder="organization-slug"
                required
              />
              <small class="field-help"
                >Will be normalized to: {normalizeSlug(
                  createOrgForm.slug,
                )}</small
              >
            </div>

            <div class="form-group">
              <label for="org-logo" class="field-label">Logo URL</label>
              <input
                id="org-logo"
                type="url"
                bind:value={createOrgForm.logo}
                class="form-input"
                placeholder="https://example.com/logo.png"
              />
            </div>

            <div class="form-group">
              <label for="org-custom" class="field-label">Custom Field</label>
              <input
                id="org-custom"
                type="text"
                bind:value={createOrgForm.myCustomField}
                class="form-input"
                placeholder="Custom field value"
              />
            </div>
          </div>

          {#if messages.createOrg}
            <div class="message success">{messages.createOrg}</div>
          {/if}
          {#if errors.createOrg}
            <div class="message error">{errors.createOrg}</div>
          {/if}

          <div class="form-actions">
            <Button.Root
              type="submit"
              class="btn btn-primary"
              disabled={loading.createOrg}
            >
              {loading.createOrg ? "Creating..." : "Create Organization"}
            </Button.Root>
            <Button.Root
              onclick={() => (showCreateForm = false)}
              class="btn btn-secondary"
            >
              Cancel
            </Button.Root>
          </div>
        </form>
      </div>
    {/if}

    <!-- Organizations Grid -->
    {#if $organizations.isPending}
      <div class="loading-state">Loading organizations...</div>
    {:else if !$organizations.data || $organizations.data.length === 0}
      <div class="empty-state">
        <h3>No Organizations</h3>
        <p>You haven't created or joined any organizations yet.</p>
      </div>
    {:else}
      <div class="organizations-grid">
        {#each $organizations.data as organization (organization.id)}
          <div
            class="organization-card {$activeOrganization.data?.id ===
            organization.id
              ? 'active'
              : ''}"
          >
            <div class="org-header">
              <div class="org-info">
                {#if organization.logo}
                  <img
                    src={organization.logo}
                    alt={organization.name}
                    class="org-logo"
                  />
                {:else}
                  <div class="org-logo-placeholder">
                    {organization.name.charAt(0).toUpperCase()}
                  </div>
                {/if}
                <div>
                  <h3 class="org-name">{organization.name}</h3>
                  <p class="org-slug">/{organization.slug}</p>
                </div>
              </div>

              {#if $activeOrganization.data?.id === organization.id}
                <span class="active-badge">Active</span>
              {:else}
                <Button.Root
                  onclick={() => setActiveOrg(organization.id)}
                  class="btn btn-sm btn-outline"
                  disabled={loading.setActive}
                >
                  {loading.setActive ? "Setting..." : "Set Active"}
                </Button.Root>
              {/if}
            </div>

            <div class="org-details">
              <div class="field">
                <span class="field-label">Created</span>
                <p class="field-value">{formatDate(organization.createdAt)}</p>
              </div>

              {#if (organization as any).myCustomField}
                <div class="field">
                  <span class="field-label">Custom Field</span>
                  <p class="field-value">
                    {(organization as any).myCustomField}
                  </p>
                </div>
              {/if}
            </div>

            <div class="org-actions">
              <Button.Root
                href="/org/{organization.slug}"
                class="btn btn-sm btn-secondary"
              >
                View
              </Button.Root>
              <Button.Root
                href="/org/manage/{organization.slug}"
                class="btn btn-sm btn-primary"
              >
                Manage
              </Button.Root>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Active Organization Management -->
  {#if $activeOrganization.data}
    <div class="card">
      <div class="section-header">
        <h2 class="section-title">
          <span class="status-dot blue"></span>
          Manage: {$activeOrganization.data.name}
        </h2>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button
          class="tab {activeTab === 'overview' ? 'active' : ''}"
          onclick={() => (activeTab = "overview")}
        >
          Overview
        </button>
        <button
          class="tab {activeTab === 'members' ? 'active' : ''}"
          onclick={() => {
            activeTab = "members";
            if ($activeOrganization.data && members.length === 0) {
              loadMembers();
            }
          }}
        >
          Members
        </button>
        <button
          class="tab {activeTab === 'invitations' ? 'active' : ''}"
          onclick={() => {
            activeTab = "invitations";
            if ($activeOrganization.data && invitations.length === 0) {
              loadInvitations();
            }
          }}
        >
          Invitations
        </button>
        <button
          class="tab {activeTab === 'teams' ? 'active' : ''}"
          onclick={() => {
            activeTab = "teams";
            if ($activeOrganization.data && teams.length === 0) {
              loadTeams();
            }
          }}
        >
          Teams
        </button>
      </div>

      <!-- Tab Content -->
      <div class="tab-content">
        {#if activeTab === "overview"}
          <div class="overview-content">
            <div class="info-grid">
              <div class="field">
                <span class="field-label">Organization ID</span>
                <p class="field-value mono">{$activeOrganization.data.id}</p>
              </div>
              <div class="field">
                <span class="field-label">Slug</span>
                <p class="field-value">/{$activeOrganization.data.slug}</p>
              </div>
              <div class="field">
                <span class="field-label">Created</span>
                <p class="field-value">
                  {formatDate($activeOrganization.data.createdAt)}
                </p>
              </div>
              {#if ($activeOrganization.data as any).myCustomField}
                <div class="field">
                  <span class="field-label">Custom Field</span>
                  <p class="field-value">
                    {($activeOrganization.data as any).myCustomField}
                  </p>
                </div>
              {/if}
            </div>
          </div>
        {:else if activeTab === "members"}
          <div class="members-content">
            <div class="section-header">
              <h3>Organization Members</h3>
              <Button.Root
                onclick={() => (showInviteForm = !showInviteForm)}
                class="btn btn-primary"
              >
                Invite Member
              </Button.Root>
            </div>

            <!-- Invite Form -->
            {#if showInviteForm}
              <div class="form-section">
                <form onsubmit={inviteMember}>
                  <div class="form-grid">
                    <div class="form-group">
                      <label for="invite-email" class="field-label"
                        >Email Address</label
                      >
                      <input
                        id="invite-email"
                        type="email"
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
                        bind:value={inviteForm.role}
                        class="form-input"
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>

                  {#if messages.invite}
                    <div class="message success">{messages.invite}</div>
                  {/if}
                  {#if errors.invite}
                    <div class="message error">{errors.invite}</div>
                  {/if}

                  <div class="form-actions">
                    <Button.Root
                      type="submit"
                      class="btn btn-primary"
                      disabled={loading.invite}
                    >
                      {loading.invite ? "Sending..." : "Send Invitation"}
                    </Button.Root>
                    <Button.Root
                      onclick={() => (showInviteForm = false)}
                      class="btn btn-secondary"
                    >
                      Cancel
                    </Button.Root>
                  </div>
                </form>
              </div>
            {/if}

            <!-- Members List -->
            {#if loading.loadMembers}
              <div class="loading-state">Loading members...</div>
            {:else if members.length === 0}
              <div class="empty-state">
                <h4>No Members</h4>
                <p>No members found in this organization.</p>
              </div>
            {:else}
              <div class="members-list">
                {#each members as member (member.id)}
                  <div class="member-item">
                    <div class="member-info">
                      <div class="member-details">
                        <h4>{member.user?.name || member.user?.email}</h4>
                        <p class="member-email">{member.user?.email}</p>
                      </div>
                      <span class="role-badge {getRoleColor(member.role)}"
                        >{member.role}</span
                      >
                    </div>

                    <div class="member-meta">
                      <span class="join-date"
                        >Joined {formatDate(member.createdAt)}</span
                      >
                      {#if member.role !== "owner" && member.user?.email !== $session.data?.user.email}
                        <Button.Root
                          onclick={() => removeMember(member.user?.email)}
                          class="btn btn-xs btn-danger"
                        >
                          Remove
                        </Button.Root>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {:else if activeTab === "invitations"}
          <div class="invitations-content">
            <h3>Pending Invitations</h3>

            {#if loading.loadInvitations}
              <div class="loading-state">Loading invitations...</div>
            {:else if invitations.length === 0}
              <div class="empty-state">
                <h4>No Pending Invitations</h4>
                <p>No pending invitations found.</p>
              </div>
            {:else}
              <div class="invitations-list">
                {#each invitations as invitation (invitation.id)}
                  <div class="invitation-item">
                    <div class="invitation-info">
                      <div class="invitation-details">
                        <h4>{invitation.email}</h4>
                        <p class="invitation-meta">
                          Invited {invitation.createdAt
                            ? formatDate(invitation.createdAt)
                            : "Unknown Date"} • Expires {invitation.expiresAt
                            ? formatDate(invitation.expiresAt)
                            : "Unknown Date"}
                        </p>
                      </div>
                      <div class="invitation-badges">
                        <span class="role-badge {getRoleColor(invitation.role)}"
                          >{invitation.role}</span
                        >
                        <span
                          class="status-badge {getStatusColor(
                            invitation.status,
                          )}">{invitation.status}</span
                        >
                      </div>
                    </div>

                    {#if invitation.status === "pending"}
                      <Button.Root
                        onclick={() => cancelInvitation(invitation.id)}
                        class="btn btn-xs btn-danger"
                      >
                        Cancel
                      </Button.Root>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {:else if activeTab === "teams"}
          <div class="teams-content">
            <div class="section-header">
              <h3>Teams</h3>
              <Button.Root
                onclick={() => (showCreateTeamForm = !showCreateTeamForm)}
                class="btn btn-primary"
              >
                Create Team
              </Button.Root>
            </div>

            <!-- Create Team Form -->
            {#if showCreateTeamForm}
              <div class="form-section">
                <form onsubmit={createTeam}>
                  <div class="form-group">
                    <label for="team-name" class="field-label">Team Name</label>
                    <input
                      id="team-name"
                      type="text"
                      bind:value={createTeamForm.name}
                      class="form-input"
                      placeholder="Enter team name"
                      required
                    />
                  </div>

                  {#if messages.createTeam}
                    <div class="message success">{messages.createTeam}</div>
                  {/if}
                  {#if errors.createTeam}
                    <div class="message error">{errors.createTeam}</div>
                  {/if}

                  <div class="form-actions">
                    <Button.Root
                      type="submit"
                      class="btn btn-primary"
                      disabled={loading.createTeam}
                    >
                      {loading.createTeam ? "Creating..." : "Create Team"}
                    </Button.Root>
                    <Button.Root
                      onclick={() => (showCreateTeamForm = false)}
                      class="btn btn-secondary"
                    >
                      Cancel
                    </Button.Root>
                  </div>
                </form>
              </div>
            {/if}

            {#if loading.loadTeams}
              <div class="loading-state">Loading teams...</div>
            {:else if teams.length === 0}
              <div class="empty-state">
                <h4>No Teams</h4>
                <p>No teams found in this organization.</p>
              </div>
            {:else}
              <div class="teams-list">
                {#each teams as team (team.id)}
                  <div class="team-item">
                    <div class="team-info">
                      <h4>{team.name}</h4>
                      <p class="team-meta">
                        Created {formatDate(team.createdAt)}
                      </p>
                    </div>

                    <div class="team-actions">
                      <Button.Root
                        href="/org/manage/{$activeOrganization.data
                          ?.slug}/team/{team.id}"
                        class="btn btn-xs btn-secondary"
                      >
                        Manage
                      </Button.Root>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <div class="card">
      <div class="empty-state">
        <h3>No Active Organization</h3>
        <p>
          Select an organization above to manage its members, invitations, and
          teams.
        </p>
      </div>
    </div>
  {/if}
</div>

<style>
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

  .form-section h3 {
    color: #f9fafb;
    margin: 0 0 1rem 0;
    font-size: 1.125rem;
    font-weight: 600;
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

  .form-input,
  select.form-input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #4b5563;
    border-radius: 6px;
    background-color: #1f2937;
    color: #f9fafb;
    font-size: 0.875rem;
    transition: border-color 0.2s;
  }

  .form-input:focus,
  select.form-input:focus {
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

  .organizations-grid {
    display: grid;
    gap: 1.5rem;
    grid-template-columns: 1fr;
  }

  @media (min-width: 768px) {
    .organizations-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .organization-card {
    background: #374151;
    border-radius: 12px;
    padding: 1.5rem;
    border: 1px solid #4b5563;
    transition: all 0.2s;
  }

  .organization-card:hover {
    border-color: #6b7280;
  }

  .organization-card.active {
    border-color: #3b82f6;
    background: linear-gradient(135deg, #374151 0%, #1e3a8a 100%);
  }

  .org-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
  }

  .org-info {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex: 1;
  }

  .org-logo {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    object-fit: cover;
  }

  .org-logo-placeholder {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    background: #3b82f6;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
    font-size: 1.25rem;
  }

  .org-name {
    color: #f9fafb;
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .org-slug {
    color: #9ca3af;
    margin: 0;
    font-size: 0.875rem;
    font-family: ui-monospace, monospace;
  }

  .active-badge {
    background-color: #10b981;
    color: white;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .org-details {
    margin-bottom: 1rem;
  }

  .org-actions {
    display: flex;
    gap: 0.5rem;
  }

  .tabs {
    display: flex;
    border-bottom: 1px solid #4b5563;
    margin-bottom: 1.5rem;
  }

  .tab {
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    color: #9ca3af;
    cursor: pointer;
    font-weight: 500;
    transition: color 0.2s;
    border-bottom: 2px solid transparent;
  }

  .tab:hover {
    color: #f9fafb;
  }

  .tab.active {
    color: #3b82f6;
    border-bottom-color: #3b82f6;
  }

  .tab-content {
    min-height: 200px;
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

  .members-list,
  .invitations-list,
  .teams-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .member-item,
  .invitation-item,
  .team-item {
    background: #374151;
    border-radius: 8px;
    padding: 1rem;
    border: 1px solid #4b5563;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .member-info,
  .invitation-info,
  .team-info {
    flex: 1;
  }

  .member-details h4,
  .invitation-details h4,
  .team-info h4 {
    color: #f9fafb;
    margin: 0 0 0.25rem 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .member-email,
  .invitation-meta,
  .team-meta {
    color: #9ca3af;
    margin: 0;
    font-size: 0.875rem;
  }

  .member-meta {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .join-date {
    color: #9ca3af;
    font-size: 0.75rem;
  }

  .role-badge,
  .status-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    color: white;
  }

  .invitation-badges {
    display: flex;
    gap: 0.5rem;
  }

  .bg-purple-600 {
    background-color: #9333ea;
  }
  .bg-blue-600 {
    background-color: #2563eb;
  }
  .bg-green-600 {
    background-color: #16a34a;
  }
  .bg-yellow-600 {
    background-color: #ca8a04;
  }
  .bg-red-600 {
    background-color: #dc2626;
  }
  .bg-gray-600 {
    background-color: #4b5563;
  }

  .invitation-actions {
    display: flex;
    gap: 0.5rem;
  }

  .status-dot.orange {
    background-color: #f59e0b;
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

  .empty-state h3,
  .empty-state h4 {
    color: #f9fafb;
    margin-bottom: 0.5rem;
  }

  @media (max-width: 768px) {
    .section-header {
      flex-direction: column;
      gap: 1rem;
      align-items: stretch;
    }

    .org-header {
      flex-direction: column;
      gap: 1rem;
    }

    .member-item,
    .invitation-item,
    .team-item {
      flex-direction: column;
      align-items: stretch;
      gap: 1rem;
    }

    .member-meta {
      justify-content: space-between;
    }
  }
</style>
