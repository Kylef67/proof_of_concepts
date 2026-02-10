import { Page, expect } from '@playwright/test';

// Type definitions for offline operations
type OperationType = 'CREATE' | 'UPDATE' | 'DELETE';
type ResourceType = 'account' | 'category' | 'transaction';

// Network control helpers
export async function goOffline(page: Page): Promise<void> {
  await page.context().setOffline(true);

  // Also manually update the DataContext's isOnline state for testing
  // since NetInfo might not detect Playwright's offline mode in web
  await page.evaluate(() => {
    const context = (window as any).__DATA_CONTEXT__;
    console.log('goOffline: context exists?', !!context, 'has setOfflineForTesting?', !!context?.setOfflineForTesting);
    if (context && context.setOfflineForTesting) {
      context.setOfflineForTesting(false);
    }
  });

  await page.waitForTimeout(500); // Wait for state to update

  console.log('🔴 Device went offline');
}

export async function goOnline(page: Page): Promise<void> {
  await page.context().setOffline(false);

  // Manually update the DataContext's isOnline state for testing
  await page.evaluate(() => {
    const context = (window as any).__DATA_CONTEXT__;
    if (context && context.setOfflineForTesting) {
      context.setOfflineForTesting(true);
    }
  });

  console.log('🟢 Device went online');
}

// Account operation helpers (following patterns from existing test)
export async function createAccount(page: Page, name: string): Promise<void> {
  // Click the add button (icon character)
  await page.getByText('󰐕').click();

  // Wait for drawer to open
  await page.waitForSelector('text=New account', { timeout: 5000 });

  // Fill in account name
  await page.getByRole('textbox', { name: 'Account name' }).fill(name);

  // Click Done
  await page.getByText('Done').click();

  // Wait for operation to complete
  await page.waitForTimeout(1000);
}

export async function updateAccount(
  page: Page,
  currentName: string,
  newName: string
): Promise<void> {
  // Click on the account to open edit form
  await page.getByText(currentName).first().click();

  // Wait for edit form
  await page.waitForSelector('text=Edit account', { timeout: 5000 });

  // Clear and fill new name
  const nameInput = page.getByRole('textbox', { name: 'Account name' });
  await nameInput.click();
  await nameInput.press('Control+a');
  await nameInput.fill(newName);

  // Click Done
  await page.getByText('Done').click();

  // Wait for operation to complete
  await page.waitForTimeout(1000);
}

export async function deleteAccount(page: Page, name: string): Promise<void> {
  // Set up dialog handler for confirmation
  page.once('dialog', async dialog => {
    await dialog.accept();
  });

  // Find the account row
  const accountRow = page
    .locator('[data-testid="account-item-pressable"]')
    .filter({ hasText: name });

  // Find and click delete button (force click to bypass overlapping elements)
  const deleteButton = accountRow
    .locator('[data-testid^="delete-account-"]')
    .first();

  await deleteButton.click({ force: true });

  // Wait for operation to complete
  await page.waitForTimeout(1000);
}

// Storage access helpers
export async function getQueue(page: Page): Promise<any[]> {
  const queueJson = await page.evaluate(() => {
    return localStorage.getItem('@xugera:offlineQueue');
  });
  return JSON.parse(queueJson || '[]');
}

export async function getQueueCount(page: Page): Promise<number> {
  const queue = await getQueue(page);
  return queue.length;
}

export async function getStoredAccounts(page: Page): Promise<any[]> {
  const accountsJson = await page.evaluate(() => {
    return localStorage.getItem('@xugera:accounts');
  });
  return JSON.parse(accountsJson || '[]');
}

export async function getDeviceId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    return localStorage.getItem('@xugera:deviceId');
  });
}

export async function getLastSyncTimestamp(page: Page): Promise<number> {
  const timestamp = await page.evaluate(() => {
    return localStorage.getItem('@xugera:lastSyncTimestamp');
  });
  return parseInt(timestamp || '0', 10);
}

// Sync status helpers
export async function waitForSyncComplete(
  page: Page,
  timeout: number = 5000
): Promise<void> {
  // Wait for isSyncing to become false
  await page.waitForFunction(
    () => {
      const context = (window as any).__DATA_CONTEXT__;
      return context && !context.isSyncing;
    },
    { timeout }
  );
}

export async function triggerManualSync(page: Page): Promise<void> {
  // Call the triggerSync method from DataContext
  await page.evaluate(() => {
    const context = (window as any).__DATA_CONTEXT__;
    if (context && context.triggerSync) {
      context.triggerSync();
    }
  });
  await waitForSyncComplete(page);
}

// Assertion helpers
export async function expectQueueContainsOperation(
  page: Page,
  type: OperationType,
  resource: ResourceType,
  dataMatches: (data: any) => boolean
): Promise<void> {
  const queue = await getQueue(page);
  const operation = queue.find(
    op => op.type === type && op.resource === resource && dataMatches(op.data)
  );
  expect(operation).toBeTruthy();
}

export async function getAccountByName(page: Page, name: string): Promise<any> {
  const accounts = await getStoredAccounts(page);
  return accounts.find((a: any) => a.name === name);
}

// Additional helper to wait for API call
export async function waitForApiCall(
  page: Page,
  urlPattern: string,
  method: string,
  timeout: number = 5000
): Promise<boolean> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => resolve(false), timeout);

    const requestHandler = (request: any) => {
      if (request.url().includes(urlPattern) && request.method() === method) {
        clearTimeout(timeoutId);
        page.off('request', requestHandler);
        resolve(true);
      }
    };

    page.on('request', requestHandler);
  });
}

// Helper to get online status from DataContext
export async function getOnlineStatus(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const context = (window as any).__DATA_CONTEXT__;
    return context ? context.isOnline : false;
  });
}

// Helper to get sync queue count from DataContext
export async function getSyncQueueCountFromContext(page: Page): Promise<number> {
  return page.evaluate(() => {
    const context = (window as any).__DATA_CONTEXT__;
    return context ? context.offlineQueueCount : 0;
  });
}
