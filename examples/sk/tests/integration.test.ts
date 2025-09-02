import { test, expect } from '@playwright/test';
import { TestHelpers } from './test-helpers';

// Test data for new user registration
const testUser = {
  name: 'Test User',
  email: 'testuser@example.com',
  password: 'TestPassword123!'
};

const member1User = {
  name: 'Member One',
  email: 'member1@test.com',
  password: 'Password123!'
};

const standalone1User = {
  name: 'Standalone One',
  email: 'standalone1@test.com',
  password: 'Password123!'
};

const newOrg = {
  name: 'New Test Organization',
  slug: 'new-test-org'
};

const newTeam = {
  name: 'Development Team'
};

test.describe.configure({ mode: 'serial' });

test.describe('Complete Authentication and Organization Flow', () => {
  test.beforeAll(async () => {
    // Clean up ALL data before tests to ensure clean state
    await TestHelpers.cleanupAllData();
  });

  test('Step 1: Homepage navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('Step 2: Navigate to Create Account', async ({ page }) => {
    await page.goto('/');
    await page.click('a[href="/auth/sign/up"]');
    await expect(page.locator('h1')).toContainText('Create Account');
  });

  test('Step 3-4: User registration and redirect', async ({ page }) => {
    await page.goto('/auth/sign/up');
    await page.fill('input[name="name"]', testUser.name);
    await page.fill('input[name="email"]', testUser.email);
    await page.fill('input[name="password"]', testUser.password);
    await page.fill('input[name="confirmPassword"]', testUser.password);
    await page.click('button[type="submit"]');

    await page.waitForURL('/');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('Step 5: Email verification', async ({ page }) => {
    await TestHelpers.loginUser(page, testUser.email, testUser.password);
    await TestHelpers.verifyEmail(page);
  });

  test('Step 6: Create test users for invitations', async ({ page }) => {
    await TestHelpers.registerUser(page, member1User);
    await TestHelpers.logoutUser(page);
    
    await TestHelpers.registerUser(page, standalone1User);
    await TestHelpers.logoutUser(page);
  });

  test('Step 7: Create organization', async ({ page }) => {
    await TestHelpers.loginUser(page, testUser.email, testUser.password);
    await TestHelpers.createOrganization(page, newOrg.name, newOrg.slug);
  });

  test('Step 8: Create team', async ({ page }) => {
    await TestHelpers.loginUser(page, testUser.email, testUser.password);
    await TestHelpers.createTeam(page, newOrg.slug, newTeam.name);
  });

  test('Step 9: Invite users to organization', async ({ page }) => {
    await TestHelpers.loginUser(page, testUser.email, testUser.password);
    await TestHelpers.inviteUserToOrganization(page, newOrg.slug, member1User.email, 'member');
    await TestHelpers.inviteUserToOrganization(page, newOrg.slug, standalone1User.email, 'member');
  });

  test('Step 10-11: Member1 accepts invitation', async ({ page }) => {
    await TestHelpers.loginUser(page, member1User.email, member1User.password);
    await TestHelpers.acceptInvitationForUser(page, member1User.email);
  });

  test('Step 12: Verify member1 can access organization', async ({ page }) => {
    await TestHelpers.loginUser(page, member1User.email, member1User.password);
    await TestHelpers.switchOrganization(page, newOrg.slug);
    await expect(page.locator('h1')).toContainText(newOrg.name);
  });

  test('Step 13: Verify team was created in database', async ({ page }) => {
    const db = await TestHelpers.getDbConnection();
    const teamResult = await db.query<[any[]]>(`SELECT * FROM team WHERE name = '${newTeam.name}'`);
    await db.close();
    
    expect(teamResult[0]).toHaveLength(1);
  });

  test('Step 14: Standalone1 accepts invitation', async ({ page }) => {
    await TestHelpers.loginUser(page, standalone1User.email, standalone1User.password);
    await TestHelpers.acceptInvitationForUser(page, standalone1User.email);
  });
});