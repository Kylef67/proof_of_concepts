import { test, expect } from '@playwright/test';

// Shared state for the account created during tests
let testAccountName: string;
let updatedAccountName: string;

test.describe.serial('Account CRUD Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8081');
    // Wait for accounts to load
    await page.waitForTimeout(3000);
  });

  test('should create a new account', async ({ page }) => {
    testAccountName = `E2E Test ${Date.now()}`;

    // Click the add button (󰐕 icon) using the exact Playwright code that worked in MCP
    await page.getByText('󰐕').click();

    // Wait for form to appear
    await page.waitForSelector('text=New account', { timeout: 5000 });

    // Fill in account name - using the exact selector from MCP that worked
    await page.getByRole('textbox', { name: 'Account name' }).fill(testAccountName);

    // Click Done button
    await page.getByText('Done').click();

    // Wait for the API call to complete
    await page.waitForTimeout(2000);

    // Verify account appears in the list
    await expect(page.getByText(testAccountName).first()).toBeVisible({ timeout: 5000 });
    console.log('✓ Account created successfully:', testAccountName);
  });

  test('should search for the created account', async ({ page }) => {
    // Verify the account exists first
    await expect(page.getByText(testAccountName).first()).toBeVisible({ timeout: 5000 });

    // Find and click the search button by looking for the magnify icon (󰍉)
    // The MaterialCommunityIcons 'magnify' icon renders as this unicode character
    await page.getByText('󰍉').last().click();
    await page.waitForTimeout(500);

    // Now the search input should be visible
    const searchInput = page.getByPlaceholder('Search accounts...');
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Enter search text
    await searchInput.fill(testAccountName);
    await page.waitForTimeout(1000);

    // Verify the account is still visible (search result)
    await expect(page.getByText(testAccountName).first()).toBeVisible();

    // Try a partial search
    const partialSearch = testAccountName.substring(0, 6);
    await searchInput.fill(partialSearch);
    await page.waitForTimeout(1000);

    // Verify the account is still visible
    await expect(page.getByText(testAccountName).first()).toBeVisible();

    // Search for something that shouldn't match
    await searchInput.fill('NonExistentAccount9999');
    await page.waitForTimeout(1000);

    // Verify the account is not visible
    await expect(page.getByText(testAccountName).first()).not.toBeVisible();

    // Clear search
    await searchInput.fill('');
    await page.waitForTimeout(1000);

    // Verify account is visible again
    await expect(page.getByText(testAccountName).first()).toBeVisible();

    console.log('✓ Account search works correctly');
  });

  test('should edit the created account', async ({ page }) => {
    updatedAccountName = `Updated ${Date.now()}`;

    // Verify account exists
    await expect(page.getByText(testAccountName).first()).toBeVisible();

    // Click on the account name to open edit form
    await page.getByText(testAccountName).first().click();

    // Wait for edit form
    await page.waitForSelector('text=Edit account', { timeout: 5000 });

    // Update the name
    const nameInput = page.getByRole('textbox', { name: 'Account name' });
    await nameInput.click();
    await nameInput.press('Control+a'); // Select all
    await nameInput.fill(updatedAccountName);

    // Save changes
    await page.getByText('Done').click();
    await page.waitForTimeout(2000);

    // Verify updated name appears
    await expect(page.getByText(updatedAccountName).first()).toBeVisible({ timeout: 5000 });
    // Verify old name is gone
    await expect(page.getByText(testAccountName).first()).not.toBeVisible();

    console.log('✓ Account edited successfully:', updatedAccountName);
  });

  test('should delete the created account', async ({ page }) => {
    // Verify the updated account exists - get the specific account row
    const accountRow = page.locator('[data-testid="account-item-pressable"]').filter({ hasText: updatedAccountName });
    await expect(accountRow.first()).toBeVisible();

    // Set up dialog handler to accept confirmation
    page.on('dialog', async dialog => {
      console.log('Confirming deletion:', dialog.message());
      await dialog.accept();
    });

    // Find and click the delete button for this specific account
    const deleteButton = accountRow.locator('[data-testid^="delete-account-"]').first();

    // Scroll the delete button into view and use force click to bypass the floating button
    await deleteButton.scrollIntoViewIfNeeded();
    await deleteButton.click({ force: true });

    // Wait for the account row to be removed from the DOM
    await expect(accountRow.first()).not.toBeVisible({ timeout: 5000 });

    console.log('✓ Account deleted successfully:', updatedAccountName);
  });
});
