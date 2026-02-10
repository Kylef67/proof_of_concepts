import { test, expect } from '@playwright/test';
import { createAccount } from '../helpers/syncHelpers';

test.describe('Multi-Device Sync', () => {
  test('Changes from Device A appear on Device B', async ({ browser }) => {
    // Device A
    const contextA = await browser.newContext();
    const deviceA = await contextA.newPage();
    await deviceA.goto('http://localhost:8081');
    await deviceA.waitForTimeout(3000);
    await deviceA.waitForSelector('text=Accounts', { timeout: 10000 });

    // Device B
    const contextB = await browser.newContext();
    const deviceB = await contextB.newPage();
    await deviceB.goto('http://localhost:8081');
    await deviceB.waitForTimeout(3000);
    await deviceB.waitForSelector('text=Accounts', { timeout: 10000 });

    // Device A creates account
    const accountName = `Multi Device ${Date.now()}`;
    await createAccount(deviceA, accountName);
    await deviceA.waitForTimeout(2000);

    // Device B should receive the change after reload (triggers sync)
    await deviceB.reload();
    await deviceB.waitForTimeout(3000);

    // Verify Device B sees the account
    await expect(deviceB.getByText(accountName).first()).toBeVisible({ timeout: 10000 });

    // Cleanup
    await contextA.close();
    await contextB.close();
  });

  test('Device B receives incremental changes from Device A', async ({ browser }) => {
    const contextA = await browser.newContext();
    const deviceA = await contextA.newPage();
    await deviceA.goto('http://localhost:8081');
    await deviceA.waitForTimeout(3000);
    await deviceA.waitForSelector('text=Accounts', { timeout: 10000 });

    const contextB = await browser.newContext();
    const deviceB = await contextB.newPage();
    await deviceB.goto('http://localhost:8081');
    await deviceB.waitForTimeout(3000);
    await deviceB.waitForSelector('text=Accounts', { timeout: 10000 });

    // Device A creates 3 accounts
    const names = [
      `Account A1 ${Date.now()}`,
      `Account A2 ${Date.now() + 1}`,
      `Account A3 ${Date.now() + 2}`
    ];

    for (const name of names) {
      await createAccount(deviceA, name);
      await deviceA.waitForTimeout(1000);
    }

    // Device B syncs
    await deviceB.reload();
    await deviceB.waitForTimeout(3000);

    // Verify all accounts visible on Device B
    for (const name of names) {
      await expect(deviceB.getByText(name).first()).toBeVisible({ timeout: 10000 });
    }

    // Cleanup
    await contextA.close();
    await contextB.close();
  });

  test('Three devices all sync correctly', async ({ browser }) => {
    // Create 3 devices
    const contexts = await Promise.all([
      browser.newContext(),
      browser.newContext(),
      browser.newContext()
    ]);

    const devices = await Promise.all(
      contexts.map(async ctx => {
        const page = await ctx.newPage();
        await page.goto('http://localhost:8081');
        await page.waitForTimeout(3000);
        await page.waitForSelector('text=Accounts', { timeout: 10000 });
        return page;
      })
    );

    // Device 1 creates account
    const account1 = `Device 1 Account ${Date.now()}`;
    await createAccount(devices[0], account1);
    await devices[0].waitForTimeout(2000);

    // Device 2 creates account
    const account2 = `Device 2 Account ${Date.now()}`;
    await createAccount(devices[1], account2);
    await devices[1].waitForTimeout(2000);

    // Device 3 creates account
    const account3 = `Device 3 Account ${Date.now()}`;
    await createAccount(devices[2], account3);
    await devices[2].waitForTimeout(2000);

    // All devices sync
    await Promise.all(devices.map(d => d.reload()));
    await Promise.all(devices.map(d => d.waitForTimeout(3000)));

    // All devices should see all 3 accounts
    for (const device of devices) {
      await expect(device.getByText(account1).first()).toBeVisible({ timeout: 10000 });
      await expect(device.getByText(account2).first()).toBeVisible({ timeout: 10000 });
      await expect(device.getByText(account3).first()).toBeVisible({ timeout: 10000 });
    }

    // Cleanup
    await Promise.all(contexts.map(ctx => ctx.close()));
  });
});
