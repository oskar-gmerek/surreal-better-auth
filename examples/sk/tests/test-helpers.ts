import { type Page, expect } from "@playwright/test";
import { Surreal } from "surrealdb";

export interface TestUser {
  id?: string;
  name: string;
  email: string;
  password: string;
  emailVerified?: boolean;
}

export interface TestOrganization {
  id: string;
  name: string;
  slug: string;
}

export class TestHelpers {
  static async getDbConnection() {
    const db = new Surreal();

    // Use environment variables for CI or default to local development
    const surrealUrl = process.env.SURREALDB_URL || "ws://127.0.0.1:8000/rpc";
    const surrealUser = process.env.SURREALDB_USER || "root";
    const surrealPass = process.env.SURREALDB_PASS || "root";
    const surrealNs = process.env.SURREALDB_NS || "test";
    const surrealDb = process.env.SURREALDB_DB || "example-sveltekit";

    await db.connect(surrealUrl);
    await db.signin({ username: surrealUser, password: surrealPass });
    await db.use({ namespace: surrealNs, database: surrealDb });
    return db;
  }

  static async loginUser(page: Page, email: string, password: string) {
    await page.goto("/auth/sign/in");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    // Wait for either successful navigation to home or error message
    try {
      await page.waitForURL("/", { timeout: 15000 });
    } catch (error) {
      // Check if there's an error message on the page
      const errorElement = page.locator(".error-message").first();
      if (await errorElement.isVisible()) {
        const errorText = await errorElement.textContent();
        throw new Error(`Login failed: ${errorText}`);
      }
      throw error;
    }
  }

  static async logoutUser(page: Page) {
    await page.waitForSelector('button:has-text("Sign Out")', {
      state: "visible",
    });
    await page.click('button:has-text("Sign Out")');
    await page.waitForURL("**/auth/sign/in", { timeout: 10000 });
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    if (!currentUrl.includes("/auth/sign/in")) {
      await page.goto("/auth/sign/in");
      await page.waitForURL("/auth/sign/in");
    }
  }

  static async registerUser(page: Page, user: TestUser) {
    await page.goto("/auth/sign/up");
    await page.fill('input[name="name"]', user.name);
    await page.fill('input[name="email"]', user.email);
    await page.fill('input[name="password"]', user.password);
    await page.fill('input[name="confirmPassword"]', user.password);
    await page.click('button[type="submit"]');

    // Wait for either successful navigation to home or error message
    try {
      await page.waitForURL("/", { timeout: 15000 });
    } catch (error) {
      // Check if there's an error message on the page
      const errorElement = page.locator(".error-message").first();
      if (await errorElement.isVisible()) {
        const errorText = await errorElement.textContent();
        throw new Error(`Registration failed: ${errorText}`);
      }
      throw error;
    }
  }

  static async extractVerificationUrl(page: Page): Promise<string> {
    const maxAttempts = 30;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await page.request.get(
          "http://localhost:3000/api/test/verification-url",
        );
        const data = await response.json();

        if (data.url) {
          return data.url;
        }
      } catch (error) {
        // Continue trying
      }

      await page.waitForTimeout(500);
      attempts++;
    }

    throw new Error("Verification URL not found within timeout");
  }

  static async verifyEmail(page: Page) {
    await page.goto("/profile");
    await expect(page.locator("h1")).toContainText("Profile");

    await page.request.delete(
      "http://localhost:3000/api/test/verification-url",
    );
    await page.click('button:has-text("Send Verification Email")');

    const verificationUrl = await TestHelpers.extractVerificationUrl(page);
    await page.goto(verificationUrl);

    await expect(page.locator("text=Email Verification")).toBeVisible();
    await expect(page.locator("text=✅ Verified")).toBeVisible();
  }

  static async createOrganization(page: Page, name: string, slug: string) {
    await page.goto("/org");
    await page.click('button:has-text("Create Organization")');
    await page.waitForSelector("#org-name");

    await page.fill("#org-name", name);
    await page.fill("#org-slug", slug);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    const errorElement = page.locator(".message.error");
    if (await errorElement.isVisible()) {
      const errorMessage = await errorElement.textContent();
      throw new Error(`Failed to create organization: ${errorMessage}`);
    }

    await page.waitForTimeout(1000);
    await page.goto("/org");
    await page.waitForTimeout(1000);

    const orgLink = page.locator(`a[href="/org/${slug}"]`);
    if (await orgLink.isVisible()) {
      await orgLink.click();
      await page.waitForTimeout(1000);
    } else {
      throw new Error(
        `Organization ${name} was not found in the organizations list`,
      );
    }

    return { name, slug };
  }

  static async createTeam(page: Page, orgSlug: string, teamName: string) {
    await page.goto("/org");
    await page.waitForTimeout(2000);

    // Check if we need to set an organization as active
    const setActiveButton = page.locator('button:has-text("Set Active")');
    if (await setActiveButton.isVisible({ timeout: 3000 })) {
      await setActiveButton.click();
      await page.waitForTimeout(2000);
    }

    // Wait for the Teams tab to be available and click it
    await page.waitForSelector('button.tab:has-text("Teams")', {
      timeout: 10000,
    });
    await page.click('button.tab:has-text("Teams")');
    await page.waitForTimeout(1000);

    // Click Create Team button
    await page.waitForSelector('button:has-text("Create Team")', {
      timeout: 5000,
    });
    await page.click('button:has-text("Create Team")');

    // Fill team name and submit
    await page.waitForSelector("#team-name", { timeout: 5000 });
    await page.fill("#team-name", teamName);
    await page.click('button[type="submit"]');

    // Wait for team to appear in the list
    await expect(page.locator(`text=${teamName}`)).toBeVisible({
      timeout: 10000,
    });
  }

  static async inviteUserToOrganization(
    page: Page,
    orgSlug: string,
    email: string,
    role = "member",
  ) {
    // Go to organizations page
    await page.goto("/org");
    await page.waitForTimeout(2000);

    // Click "Manage" button for the specific organization
    const manageButton = page.locator(`a[href="/org/manage/${orgSlug}"]`);
    await expect(manageButton).toBeVisible({ timeout: 10000 });
    await manageButton.click();
    await page.waitForTimeout(3000);

    // Verify we're on the manage organization page
    await expect(page.locator("h1")).toContainText("Manage Organization", {
      timeout: 10000,
    });

    // Click "Manage Members" button (use first one)
    const manageMembersButton = page
      .locator(`a[href="/org/manage/${orgSlug}/members"]`)
      .first();
    await expect(manageMembersButton).toBeVisible({ timeout: 10000 });
    await manageMembersButton.click();
    await page.waitForTimeout(3000);

    // Verify we're on the members page
    await expect(page.locator("h1")).toContainText("Members", {
      timeout: 10000,
    });

    // Click "Invite Member" button
    const inviteButton = page.locator('button:has-text("Invite Member")');
    await expect(inviteButton).toBeVisible({ timeout: 10000 });
    await inviteButton.click();

    // Wait for form to appear and fill it
    await page.waitForSelector('input#invite-email[name="email"]', {
      timeout: 10000,
    });
    await page.fill('input#invite-email[name="email"]', email);
    await page.selectOption('select#invite-role[name="role"]', role);

    // Click "Send Invitation" button
    const sendButton = page.locator(
      'button[type="submit"]:has-text("Send Invitation")',
    );
    await sendButton.click();

    // Wait for either success or error message
    try {
      await expect(page.locator("text=Invitation sent")).toBeVisible({
        timeout: 15000,
      });
    } catch (error) {
      // Check for error message
      const errorMessage = page.locator(".error-message");
      if (await errorMessage.isVisible()) {
        const errorText = await errorMessage.textContent();
        throw new Error(`Invitation failed: ${errorText}`);
      }
      throw error;
    }
  }

  static async acceptInvitationForUser(page: Page, userEmail: string) {
    await page.goto("/org");
    await page.waitForTimeout(3000);

    const acceptButton = page.locator('button:has-text("Accept")').first();

    if (await acceptButton.isVisible({ timeout: 5000 })) {
      const invitationsBefore = await page
        .locator('button:has-text("Accept")')
        .count();
      await acceptButton.click();

      try {
        await expect(page.locator("text=Invitation accepted")).toBeVisible({
          timeout: 3000,
        });
      } catch {
        await page.waitForTimeout(2000);
        const invitationsAfter = await page
          .locator('button:has-text("Accept")')
          .count();
        if (invitationsAfter < invitationsBefore) {
          return;
        }
      }

      await page.waitForTimeout(2000);
    }
  }

  static async switchOrganization(page: Page, orgSlug: string) {
    await page.goto("/org");
    await page.click(`a[href="/org/${orgSlug}"]`);
    await page.waitForURL(`/org/${orgSlug}`);
  }

  static async verifyUserInDatabase(email: string, shouldExist = true) {
    const db = await TestHelpers.getDbConnection();

    const result = await db.query<[any[]]>(
      `SELECT * FROM user WHERE email = '${email}'`,
    );
    await db.close();

    if (shouldExist) {
      expect(result[0]).toHaveLength(1);
      return result[0][0];
    }
    expect(result[0]).toHaveLength(0);
    return null;
  }

  static async verifyOrganizationInDatabase(slug: string, shouldExist = true) {
    const db = await TestHelpers.getDbConnection();
    const result = await db.query<[any[]]>(
      `SELECT * FROM business WHERE slug = '${slug}'`,
    );

    if (shouldExist) {
      expect(result[0]).toHaveLength(1);
    } else {
      expect(result[0]).toHaveLength(0);
    }

    await db.close();
    return result[0][0];
  }

  static async verifyMembershipInDatabase(
    userId: string,
    orgId: string,
    expectedRole?: string,
  ) {
    const db = await TestHelpers.getDbConnection();
    const result = await db.query<[any[]]>(
      `SELECT * FROM member WHERE userId = '${userId}' AND organizationId = '${orgId}'`,
    );

    expect(result[0]).toHaveLength(1);

    if (expectedRole) {
      expect(result[0][0].role).toBe(expectedRole);
    }

    await db.close();
    return result[0][0];
  }

  static async cleanupAllData() {
    const db = await TestHelpers.getDbConnection();

    try {
      const tables = [
        "verification",
        "session",
        "invitation",
        "teamMember",
        "member",
        "team",
        "business",
        "account",
        "user",
      ];

      for (const table of tables) {
        try {
          await db.query<[any[]]>(`DELETE ${table}`);
        } catch (error) {
          // Table might not exist, continue
        }
      }
    } catch (error) {
      // Continue cleanup
    }

    await db.close();
  }
}

export const testUsers = {
  admin1: {
    id: "user:admin1",
    name: "Admin One",
    email: "admin1@test.com",
    password: "password123",
    emailVerified: true,
  },
  admin2: {
    id: "user:admin2",
    name: "Admin Two",
    email: "admin2@test.com",
    password: "password123",
    emailVerified: true,
  },
  member1: {
    id: "user:member1",
    name: "Member One",
    email: "member1@test.com",
    password: "password123",
    emailVerified: true,
  },
  standalone1: {
    id: "user:standalone1",
    name: "Standalone One",
    email: "standalone1@test.com",
    password: "password123",
    emailVerified: true,
  },
  standalone2: {
    id: "user:standalone2",
    name: "Standalone Two",
    email: "standalone2@test.com",
    password: "password123",
    emailVerified: true,
  },
};

export const testOrganizations = {
  org1: {
    id: "business:org1",
    name: "Test Organization One",
    slug: "test-org-one",
  },
  org2: {
    id: "business:org2",
    name: "Test Organization Two",
    slug: "test-org-two",
  },
};
