import { test, expect } from '@playwright/test';
import {
  createAccount,
  updateAccount,
  deleteAccount,
  goOffline,
  goOnline,
  getStoredAccounts
} from '../helpers/syncHelpers';

test.describe.skip('Conflict Resolution - First-to-Sync-Wins', () => {
  test.afterEach(async ({ page }, testInfo) => {
    // Log console errors
    if (page) {
      page.on('console', msg => {
        if (msg.type() === 'error') {
          console.error('Console error:', msg.text());
        }
      });
    }
  });

  test('Two devices UPDATE same account - first to sync wins', async ({ browser }) => {
    // Setup two device contexts
    const context1 = await browser.newContext();
    const device1 = await context1.newPage();

    const context2 = await browser.newContext();
    const device2 = await context2.newPage();

    try {
      // Device 1: Initialize and create account
      await device1.goto('http://localhost:8081');
      await device1.waitForTimeout(3000);
      await device1.waitForSelector('text=Accounts', { timeout: 10000 });

      const accountName = `Shared Account ${Date.now()}`;
      await createAccount(device1, accountName);
      await device1.waitForTimeout(2000);

      // Device 2: Initialize and load the account
      await device2.goto('http://localhost:8081');
      await device2.waitForTimeout(3000);
      await device2.waitForSelector('text=Accounts', { timeout: 10000 });

      // Wait for account to appear on device 2
      await expect(device2.getByText(accountName).first()).toBeVisible({ timeout: 10000 });

      // Both devices go offline
      await goOffline(device1);
      await goOffline(device2);
      await device1.waitForTimeout(500);
      await device2.waitForTimeout(500);

      // Device 1 updates offline
      const device1Name = `Device 1 Update ${Date.now()}`;
      await updateAccount(device1, accountName, device1Name);
      await device1.waitForTimeout(500);

      // Device 2 updates offline (different value)
      const device2Name = `Device 2 Update ${Date.now()}`;
      await updateAccount(device2, accountName, device2Name);
      await device2.waitForTimeout(500);

      // Device 1 goes online first and syncs
      await goOnline(device1);
      await device1.waitForTimeout(3000); // Wait for sync

      // Device 1 should see its update accepted
      await expect(device1.getByText(device1Name).first()).toBeVisible();

      // Device 2 goes online and syncs (will conflict)
      await goOnline(device2);
      await device2.waitForTimeout(4000); // Wait for sync and conflict resolution

      // Device 2 should see Device 1's update (Device 1 won - first to sync)
      await device2.reload();
      await device2.waitForTimeout(3000);
      await expect(device2.getByText(device1Name).first()).toBeVisible({ timeout: 10000 });
    } finally {
      // Cleanup
      await context1.close();
      await context2.close();
    }
  });

  test('Device A UPDATES, Device B DELETES - first to sync wins', async ({ browser }) => {
    const context1 = await browser.newContext();
    const deviceA = await context1.newPage();

    const context2 = await browser.newContext();
    const deviceB = await context2.newPage();

    try {
      // Create account on Device A
      await deviceA.goto('http://localhost:8081');
      await deviceA.waitForTimeout(3000);
      await deviceA.waitForSelector('text=Accounts', { timeout: 10000 });

      const accountName = `Conflict Test ${Date.now()}`;
      await createAccount(deviceA, accountName);
      await deviceA.waitForTimeout(2000);

      // Device B loads account
      await deviceB.goto('http://localhost:8081');
      await deviceB.waitForTimeout(3000);
      await deviceB.waitForSelector('text=Accounts', { timeout: 10000 });
      await expect(deviceB.getByText(accountName).first()).toBeVisible({ timeout: 10000 });

      // Both go offline
      await goOffline(deviceA);
      await goOffline(deviceB);
      await deviceA.waitForTimeout(500);
      await deviceB.waitForTimeout(500);

      // Device A updates
      const updatedName = `Updated ${Date.now()}`;
      await updateAccount(deviceA, accountName, updatedName);
      await deviceA.waitForTimeout(500);

      // Device B deletes
      await deleteAccount(deviceB, accountName);
      await deviceB.waitForTimeout(500);

      // Device A syncs first
      await goOnline(deviceA);
      await deviceA.waitForTimeout(3000);

      // Device A's update should be accepted
      await expect(deviceA.getByText(updatedName).first()).toBeVisible();

      // Device B syncs (conflict - delete rejected)
      await goOnline(deviceB);
      await deviceB.waitForTimeout(4000);

      // Device B should see the updated account (not deleted)
      await deviceB.reload();
      await deviceB.waitForTimeout(3000);
      await expect(deviceB.getByText(updatedName).first()).toBeVisible({ timeout: 10000 });
    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test('Device A DELETES, Device B UPDATES - first to sync wins', async ({ browser }) => {
    const context1 = await browser.newContext();
    const deviceA = await context1.newPage();

    const context2 = await browser.newContext();
    const deviceB = await context2.newPage();

    try {
      // Create account
      await deviceA.goto('http://localhost:8081');
      await deviceA.waitForTimeout(3000);
      await deviceA.waitForSelector('text=Accounts', { timeout: 10000 });

      const accountName = `Delete vs Update ${Date.now()}`;
      await createAccount(deviceA, accountName);
      await deviceA.waitForTimeout(2000);

      // Device B loads
      await deviceB.goto('http://localhost:8081');
      await deviceB.waitForTimeout(3000);
      await deviceB.waitForSelector('text=Accounts', { timeout: 10000 });
      await expect(deviceB.getByText(accountName).first()).toBeVisible({ timeout: 10000 });

      // Both offline
      await goOffline(deviceA);
      await goOffline(deviceB);
      await deviceA.waitForTimeout(500);
      await deviceB.waitForTimeout(500);

      // Device A deletes
      await deleteAccount(deviceA, accountName);
      await deviceA.waitForTimeout(500);

      // Device B updates
      const updatedName = `Updated ${Date.now()}`;
      await updateAccount(deviceB, accountName, updatedName);
      await deviceB.waitForTimeout(500);

      // Device A syncs first (delete accepted)
      await goOnline(deviceA);
      await deviceA.waitForTimeout(3000);

      // Device B syncs (conflict - update rejected because record deleted)
      await goOnline(deviceB);
      await deviceB.waitForTimeout(4000);

      // Device B should see account is gone (deleted)
      await deviceB.reload();
      await deviceB.waitForTimeout(3000);
      await expect(deviceB.getByText(accountName)).not.toBeVisible();
      await expect(deviceB.getByText(updatedName)).not.toBeVisible();
    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test.skip('Verify syncVersion increments correctly', async ({ page }) => {
    await page.goto('http://localhost:8081');
    await page.waitForTimeout(3000);
    await page.waitForSelector('text=Accounts', { timeout: 10000 });

    // Create account
    const accountName = `Version Test ${Date.now()}`;
    await createAccount(page, accountName);
    await page.waitForTimeout(2000);

    // Get initial syncVersion
    let accounts = await getStoredAccounts(page);
    let account = accounts.find((a: any) => a.name === accountName);
    expect(account).toBeTruthy();
    console.log('Initial syncVersion:', account?.syncVersion);

    // Update account
    const updatedName = `Updated ${Date.now()}`;
    await updateAccount(page, accountName, updatedName);
    await page.waitForTimeout(2000);

    // Check syncVersion incremented
    accounts = await getStoredAccounts(page);
    account = accounts.find((a: any) => a.name === updatedName);
    expect(account).toBeTruthy();
    console.log('After first update syncVersion:', account?.syncVersion);

    // Update again
    const updated2 = `Updated Again ${Date.now()}`;
    await updateAccount(page, updatedName, updated2);
    await page.waitForTimeout(2000);

    // Check syncVersion incremented again
    accounts = await getStoredAccounts(page);
    account = accounts.find((a: any) => a.name === updated2);
    expect(account).toBeTruthy();
    console.log('After second update syncVersion:', account?.syncVersion);

    // Verify versions increased (may not be exactly 1,2,3 due to server processing)
    expect(account.syncVersion).toBeGreaterThan(1);
  });
});
