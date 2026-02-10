import { test, expect } from '@playwright/test';
import {
  createAccount,
  goOffline,
  getQueue,
  getQueueCount,
  getDeviceId,
  getLastSyncTimestamp
} from '../helpers/syncHelpers';

test.describe('Offline Queue Persistence', () => {
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

  test.skip('Offline operations persist across page reload', async ({ page }) => {
    // Go offline
    await goOffline(page);
    await page.waitForTimeout(500);

    // Create multiple accounts offline
    const accountNames = [
      `Persistent 1 ${Date.now()}`,
      `Persistent 2 ${Date.now() + 1}`,
      `Persistent 3 ${Date.now() + 2}`
    ];

    for (const name of accountNames) {
      await createAccount(page, name);
      await page.waitForTimeout(500);
    }

    // Verify queued
    let queueCount = await getQueueCount(page);
    expect(queueCount).toBe(3);

    // Get queue data
    const queueBefore = await getQueue(page);
    expect(queueBefore.length).toBe(3);

    // Reload page
    await page.reload();
    await page.waitForTimeout(3000);

    // Verify queue still exists
    queueCount = await getQueueCount(page);
    expect(queueCount).toBe(3);

    // Verify queue contains same operations
    const queueAfter = await getQueue(page);
    expect(queueAfter.length).toBe(queueBefore.length);

    // Verify operation IDs match
    const idsBefore = queueBefore.map((op: any) => op.operationId).sort();
    const idsAfter = queueAfter.map((op: any) => op.operationId).sort();
    expect(idsAfter).toEqual(idsBefore);
  });

  test('Queue persists deviceId across reload', async ({ page }) => {
    // Get device ID
    const deviceIdBefore = await getDeviceId(page);
    expect(deviceIdBefore).toBeTruthy();

    // Reload
    await page.reload();
    await page.waitForTimeout(3000);

    // Verify same device ID
    const deviceIdAfter = await getDeviceId(page);
    expect(deviceIdAfter).toBe(deviceIdBefore);
  });

  test.skip('lastSyncTimestamp persists across reload', async ({ page }) => {
    // Get initial sync timestamp
    const timestampBefore = await getLastSyncTimestamp(page);
    expect(timestampBefore).toBeGreaterThan(0);

    // Reload
    await page.reload();
    await page.waitForTimeout(3000);

    // Verify timestamp preserved
    const timestampAfter = await getLastSyncTimestamp(page);
    expect(timestampAfter).toBe(timestampBefore);
  });

  test('Accounts persist in local storage across reload', async ({ page }) => {
    // Create account
    const accountName = `Persistent Account ${Date.now()}`;
    await createAccount(page, accountName);
    await page.waitForTimeout(2000);

    // Reload
    await page.reload();
    await page.waitForTimeout(3000);

    // Verify account still visible
    await expect(page.getByText(accountName).first()).toBeVisible();
  });
});
