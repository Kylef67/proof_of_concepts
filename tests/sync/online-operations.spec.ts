import { test, expect } from '@playwright/test';
import {
  createAccount,
  updateAccount,
  deleteAccount,
  getQueueCount
} from '../helpers/syncHelpers';

test.describe('Online Account Operations', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate and wait for initialization
    await page.goto('http://localhost:8081');
    await page.waitForTimeout(1000);

    // Clear AsyncStorage after page loads
    await page.evaluate(() => {
      try {
        localStorage.clear();
      } catch (e) {
        console.log('Could not clear localStorage:', e);
      }
    });

    // Reload to apply cleared storage
    await page.reload();
    await page.waitForTimeout(3000);

    // Verify app loaded
    await page.waitForSelector('text=Accounts', { timeout: 10000 });
  });

  test.afterEach(async ({ page }) => {
    // Log console errors for debugging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error('Console error:', msg.text());
      }
    });
  });

  test('CREATE account online - immediate API call', async ({ page }) => {
    // Track API calls
    let createCalled = false;
    await page.route('**/api/account', route => {
      if (route.request().method() === 'POST') {
        createCalled = true;
      }
      route.continue();
    });

    // Create account
    const accountName = `Online Account ${Date.now()}`;
    await createAccount(page, accountName);

    // Give some time for API call
    await page.waitForTimeout(1000);

    // Verify immediate API call
    expect(createCalled).toBe(true);

    // Verify NOT queued
    const queueCount = await getQueueCount(page);
    expect(queueCount).toBe(0);

    // Verify visible in UI
    await expect(page.getByText(accountName).first()).toBeVisible({ timeout: 5000 });
  });

  test('UPDATE account online - immediate API call', async ({ page }) => {
    // Create an account first
    const originalName = `Original ${Date.now()}`;
    await createAccount(page, originalName);
    await page.waitForTimeout(2000);

    // Track update calls
    let updateCalled = false;
    await page.route('**/api/account/*', route => {
      if (route.request().method() === 'PUT') {
        updateCalled = true;
      }
      route.continue();
    });

    // Update account
    const updatedName = `Updated ${Date.now()}`;
    await updateAccount(page, originalName, updatedName);

    // Give some time for API call
    await page.waitForTimeout(1000);

    // Verify immediate API call
    expect(updateCalled).toBe(true);

    // Verify NOT queued
    const queueCount = await getQueueCount(page);
    expect(queueCount).toBe(0);

    // Verify UI updated
    await expect(page.getByText(updatedName).first()).toBeVisible({ timeout: 5000 });
  });

  test('DELETE account online - soft delete', async ({ page }) => {
    // Create account to delete
    const accountName = `Delete Me ${Date.now()}`;
    await createAccount(page, accountName);
    await page.waitForTimeout(2000);

    // Delete account
    await deleteAccount(page, accountName);

    // Give some time for operation
    await page.waitForTimeout(1000);

    // Verify NOT queued (soft delete happens locally)
    const queueCount = await getQueueCount(page);
    expect(queueCount).toBe(0);

    // Verify removed from UI (marked as deleted locally)
    await expect(page.getByText(accountName)).not.toBeVisible();
  });
});
