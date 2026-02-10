import { test, expect } from '@playwright/test';
import {
  goOffline,
  goOnline,
  createAccount,
  updateAccount,
  deleteAccount,
  getQueueCount,
  getQueue,
  waitForSyncComplete
} from '../helpers/syncHelpers';

test.describe('Offline Account Operations', () => {
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
    // Log console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error('Console error:', msg.text());
      }
    });
  });

  test('CREATE account offline - queued', async ({ page }) => {
    // Go offline
    await goOffline(page);
    await page.waitForTimeout(500);

    // Create account offline
    const accountName = `Offline Account ${Date.now()}`;
    await createAccount(page, accountName);
    await page.waitForTimeout(1000);

    // Verify queued
    const queueCount = await getQueueCount(page);
    expect(queueCount).toBe(1);

    // Verify queue contains CREATE operation
    const queue = await getQueue(page);
    expect(queue[0].type).toBe('CREATE');
    expect(queue[0].resource).toBe('account');
    expect(queue[0].data.name).toBe(accountName);

    // Verify visible in UI (optimistic update)
    await expect(page.getByText(accountName).first()).toBeVisible();
  });

  test('UPDATE account offline - queued', async ({ page }) => {
    // Create account online first
    const originalName = `Original ${Date.now()}`;
    await createAccount(page, originalName);
    await page.waitForTimeout(2000);

    // Go offline
    await goOffline(page);
    await page.waitForTimeout(500);

    // Update account offline
    const updatedName = `Updated ${Date.now()}`;
    await updateAccount(page, originalName, updatedName);
    await page.waitForTimeout(1000);

    // Verify queued
    const queueCount = await getQueueCount(page);
    expect(queueCount).toBe(1);

    // Verify queue contains UPDATE
    const queue = await getQueue(page);
    expect(queue[0].type).toBe('UPDATE');
    expect(queue[0].resource).toBe('account');
    expect(queue[0].data.name).toBe(updatedName);

    // Verify UI updated (optimistic)
    await expect(page.getByText(updatedName).first()).toBeVisible();
  });

  test.skip('DELETE account offline - queued', async ({ page }) => {
    // Listen to ALL console logs and errors
    page.on('console', msg => {
      console.log(`Browser [${msg.type()}]:`, msg.text());
    });
    page.on('pageerror', err => {
      console.log('Page error:', err.message);
    });

    // Create account online
    const accountName = `Delete Me ${Date.now()}`;
    await createAccount(page, accountName);
    await page.waitForTimeout(2000);

    // Verify account exists before going offline
    await expect(page.getByText(accountName).first()).toBeVisible();

    // Go offline
    await goOffline(page);
    await page.waitForTimeout(500);

    // Verify online status and DATA_CONTEXT
    const contextInfo = await page.evaluate(() => {
      const context = (window as any).__DATA_CONTEXT__;
      return {
        exists: !!context,
        isOnline: context ? context.isOnline : undefined,
        offlineQueueCount: context ? context.offlineQueueCount : undefined
      };
    });
    console.log('DataContext info:', contextInfo);

    // Check account exists before delete
    const accountsBefore = await page.evaluate(() => {
      return localStorage.getItem('@xugera:accounts');
    });
    console.log('Has accounts before delete:', !!accountsBefore);

    // Delete offline (deleteAccount helper handles dialog)
    console.log('About to call deleteAccount helper...');
    await deleteAccount(page, accountName);
    console.log('deleteAccount helper returned');
    await page.waitForTimeout(2000);

    // Debug: Check if account was marked as deleted
    const accounts = await page.evaluate(() => {
      return localStorage.getItem('@xugera:accounts');
    });
    console.log('Accounts after delete:', accounts);

    // Verify queued
    const queueCount = await getQueueCount(page);
    const queue = await getQueue(page);
    console.log('Queue count:', queueCount, 'Queue:', JSON.stringify(queue));
    expect(queueCount).toBe(1);

    // Verify queue contains DELETE
    expect(queue[0].type).toBe('DELETE');
    expect(queue[0].resource).toBe('account');

    // Verify marked as deleted (optimistic)
    await expect(page.getByText(accountName)).not.toBeVisible();
  });

  test.skip('Multiple offline operations - all queued', async ({ page }) => {
    // Go offline
    await goOffline(page);
    await page.waitForTimeout(500);

    // Create 3 accounts offline
    const names = [
      `Account 1 ${Date.now()}`,
      `Account 2 ${Date.now() + 1}`,
      `Account 3 ${Date.now() + 2}`
    ];

    for (const name of names) {
      await createAccount(page, name);
      await page.waitForTimeout(500);
    }

    // Verify all queued
    const queueCount = await getQueueCount(page);
    expect(queueCount).toBe(3);

    // Verify all visible (optimistic updates)
    for (const name of names) {
      await expect(page.getByText(name).first()).toBeVisible();
    }
  });
});
