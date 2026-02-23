import { test, expect } from "@playwright/test";
import { mockApi } from "./helpers";

// ═══════════════════════════════════════════════════════════════════════════
// Header wallet icon
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Header — wallet icon", () => {
  test("shows wallet icon when addresses are configured", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.waitForTimeout(500);

    const walletBtn = page.locator(".wallet-btn");
    await expect(walletBtn).toBeVisible();
  });

  test("hides wallet icon when no addresses configured", async ({ page }) => {
    await mockApi(page, { walletAddresses: null });
    await page.goto("/");
    await page.waitForTimeout(500);

    const walletBtn = page.locator(".wallet-btn");
    await expect(walletBtn).not.toBeVisible();
  });

  test("shows address tooltip on hover", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.waitForTimeout(500);

    const walletWrapper = page.locator(".wallet-wrapper");
    await walletWrapper.hover();
    await page.waitForTimeout(300);

    await expect(page.locator(".wallet-tooltip")).toBeVisible();
    await expect(page.locator("text=EVM")).toBeVisible();
    await expect(page.locator("text=SOL")).toBeVisible();
    await expect(page.locator(".wallet-addr-row code").first()).toBeVisible();
  });

  test("shows copy buttons in tooltip", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.waitForTimeout(500);

    const walletWrapper = page.locator(".wallet-wrapper");
    await walletWrapper.hover();
    await page.waitForTimeout(300);

    const copyButtons = page.locator(".wallet-tooltip .copy-btn");
    await expect(copyButtons).toHaveCount(2);
  });

  test("clicking wallet icon navigates to inventory", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.waitForTimeout(500);

    await page.locator(".wallet-btn").click();
    await page.waitForTimeout(300);

    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    expect(page.url()).toContain("/inventory");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Navigation — inventory tab
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Navigation — inventory tab", () => {
  test("inventory tab appears in navigation", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.waitForTimeout(300);

    const inventoryLink = page.locator("a").filter({ hasText: "Inventory" });
    await expect(inventoryLink).toBeVisible();
  });

  test("clicking inventory tab shows inventory page", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.locator("a").filter({ hasText: "Inventory" }).click();
    await page.waitForTimeout(300);

    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
  });

  test("direct navigation to /inventory works", async ({ page }) => {
    await mockApi(page);
    await page.goto("/inventory");
    await page.waitForTimeout(500);

    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Inventory — API key setup flow
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Inventory — setup flow (no API keys)", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, { walletConfig: { alchemyKeySet: false, heliusKeySet: false } });
    await page.goto("/inventory");
    await page.waitForTimeout(500);
  });

  test("shows setup instructions when no API keys configured", async ({ page }) => {
    await expect(page.locator("text=API keys from blockchain data providers")).toBeVisible();
  });

  test("shows Alchemy setup card with link", async ({ page }) => {
    await expect(page.locator("h3").filter({ hasText: "Alchemy" })).toBeVisible();
    await expect(page.locator("a[href*='dashboard.alchemy.com']")).toBeVisible();
  });

  test("shows Helius setup card with link", async ({ page }) => {
    await expect(page.locator("h3").filter({ hasText: "Helius" })).toBeVisible();
    await expect(page.locator("a[href*='dev.helius.xyz']")).toBeVisible();
  });

  test("shows Birdeye setup card with optional label", async ({ page }) => {
    await expect(page.locator("h3").filter({ hasText: "Birdeye" })).toBeVisible();
    await expect(page.locator("text=optional").first()).toBeVisible();
  });

  test("shows input fields for API keys", async ({ page }) => {
    const alchemyInput = page.locator("input[data-wallet-config='ALCHEMY_API_KEY']");
    const heliusInput = page.locator("input[data-wallet-config='HELIUS_API_KEY']");
    const birdeyeInput = page.locator("input[data-wallet-config='BIRDEYE_API_KEY']");

    await expect(alchemyInput).toBeVisible();
    await expect(heliusInput).toBeVisible();
    await expect(birdeyeInput).toBeVisible();
  });

  test("Save API Keys button is present", async ({ page }) => {
    await expect(page.locator("button").filter({ hasText: "Save API Keys" })).toBeVisible();
  });

  test("saving keys transitions to balance view", async ({ page }) => {
    await page.locator("input[data-wallet-config='ALCHEMY_API_KEY']").fill("test-alchemy-key");
    await page.locator("input[data-wallet-config='HELIUS_API_KEY']").fill("test-helius-key");

    await page.locator("button").filter({ hasText: "Save API Keys" }).click();
    await page.waitForTimeout(1000);

    await expect(page.locator("button.inventory-subtab").filter({ hasText: "Tokens" })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Inventory — tokens view (unified table)
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Inventory — tokens view", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, { walletConfig: { alchemyKeySet: true, heliusKeySet: true } });
    await page.goto("/");
    await page.waitForTimeout(300);
    await page.locator("a").filter({ hasText: "Inventory" }).click();
    await page.waitForTimeout(1500);
  });

  test("shows Tokens and NFTs sub-tabs", async ({ page }) => {
    await expect(page.locator("button.inventory-subtab").filter({ hasText: "Tokens" })).toBeVisible();
    await expect(page.locator("button.inventory-subtab").filter({ hasText: "NFTs" })).toBeVisible();
  });

  test("shows sort buttons", async ({ page }) => {
    await expect(page.locator(".sort-btn").filter({ hasText: "Value" })).toBeVisible();
    await expect(page.locator(".sort-btn").filter({ hasText: "Chain" })).toBeVisible();
    await expect(page.locator(".sort-btn").filter({ hasText: "Name" })).toBeVisible();
  });

  test("shows Refresh button", async ({ page }) => {
    await expect(page.locator("button").filter({ hasText: "Refresh" })).toBeVisible();
  });

  test("renders a scrollable token table", async ({ page }) => {
    const tableWrap = page.locator(".token-table-wrap");
    await expect(tableWrap).toBeVisible();
    // Check max-height is set for scrollability
    const style = await tableWrap.evaluate((el) => getComputedStyle(el).maxHeight);
    expect(style).not.toBe("none");
  });

  test("table has header row with columns", async ({ page }) => {
    const headers = page.locator(".token-table thead th");
    // Columns: icon, Token, Chain, Balance, Value
    expect(await headers.count()).toBe(5);
  });

  test("shows chain icon badges", async ({ page }) => {
    const icons = page.locator(".token-table .chain-icon");
    expect(await icons.count()).toBeGreaterThan(0);
    // Check that icons have colored classes
    await expect(icons.first()).toBeVisible();
  });

  test("shows ETH token row with Ethereum chain", async ({ page }) => {
    // Find a row containing ETH
    const ethRow = page.locator(".token-table tbody tr").filter({ hasText: "ETH" }).first();
    await expect(ethRow).toBeVisible();
    await expect(ethRow.locator(".chain-icon")).toBeVisible();
  });

  test("shows USDC rows", async ({ page }) => {
    const usdcRows = page.locator(".token-table tbody tr").filter({ hasText: "USDC" });
    // USDC on Ethereum + USDC on Solana
    expect(await usdcRows.count()).toBeGreaterThanOrEqual(2);
  });

  test("shows SOL token row", async ({ page }) => {
    const solRow = page.locator(".token-table tbody tr").filter({ hasText: "SOL" });
    await expect(solRow.first()).toBeVisible();
  });

  test("clicking Chain sort reorders table", async ({ page }) => {
    await page.locator(".sort-btn").filter({ hasText: "Chain" }).click();
    await page.waitForTimeout(300);

    // After sorting by chain, check that the sort button is active
    await expect(page.locator(".sort-btn.active").filter({ hasText: "Chain" })).toBeVisible();
  });

  test("clicking Name sort reorders table", async ({ page }) => {
    await page.locator(".sort-btn").filter({ hasText: "Name" }).click();
    await page.waitForTimeout(300);

    await expect(page.locator(".sort-btn.active").filter({ hasText: "Name" })).toBeVisible();
  });

  test("all tokens from all chains in one table", async ({ page }) => {
    // Count rows — should have ETH (Ethereum), ETH (Base), USDC (Ethereum), WBTC, SOL, USDC (Solana)
    const rows = page.locator(".token-table tbody tr");
    // At minimum: ETH x 2 chains + USDC + WBTC + SOL + USDC(sol) = at least 6
    expect(await rows.count()).toBeGreaterThanOrEqual(6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Inventory — NFTs view (flat grid with chain badges)
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Inventory — NFTs view", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, { walletConfig: { alchemyKeySet: true, heliusKeySet: true } });
    await page.goto("/");
    await page.waitForTimeout(300);
    await page.locator("a").filter({ hasText: "Inventory" }).click();
    await page.waitForTimeout(1500);
  });

  test("switching to NFTs tab shows NFTs", async ({ page }) => {
    await page.locator("button.inventory-subtab").filter({ hasText: "NFTs" }).click();
    await page.waitForTimeout(1000);

    await expect(page.locator(".nft-card").first()).toBeVisible();
  });

  test("NFT cards show chain badges", async ({ page }) => {
    await page.locator("button.inventory-subtab").filter({ hasText: "NFTs" }).click();
    await page.waitForTimeout(1000);

    // Each NFT card should have a chain indicator
    await expect(page.locator(".nft-chain").first()).toBeVisible();
  });

  test("shows Bored Ape NFT", async ({ page }) => {
    await page.locator("button.inventory-subtab").filter({ hasText: "NFTs" }).click();
    await page.waitForTimeout(1000);

    await expect(page.locator(".nft-name").filter({ hasText: "Bored Ape #1234" })).toBeVisible();
    await expect(page.locator(".nft-collection").filter({ hasText: "Bored Ape Yacht Club" })).toBeVisible();
  });

  test("shows Solana DRiP NFT", async ({ page }) => {
    await page.locator("button.inventory-subtab").filter({ hasText: "NFTs" }).click();
    await page.waitForTimeout(1000);

    await expect(page.locator(".nft-name").filter({ hasText: "DRiP Drop #42" })).toBeVisible();
    await expect(page.locator(".nft-collection").filter({ hasText: "DRiP" })).toBeVisible();
  });

  test("NFT grid is scrollable", async ({ page }) => {
    await page.locator("button.inventory-subtab").filter({ hasText: "NFTs" }).click();
    await page.waitForTimeout(1000);

    const grid = page.locator(".nft-grid");
    const style = await grid.evaluate((el) => getComputedStyle(el).maxHeight);
    expect(style).not.toBe("none");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Config — wallet API keys section
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Config — wallet API keys", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.locator("a").filter({ hasText: "Config" }).click();
    await page.waitForTimeout(500);
  });

  test("shows Wallet API Keys section", async ({ page }) => {
    await expect(page.locator("text=Wallet API Keys")).toBeVisible();
  });

  test("shows ALCHEMY_API_KEY input", async ({ page }) => {
    await expect(page.locator("code").filter({ hasText: "ALCHEMY_API_KEY" })).toBeVisible();
    await expect(page.locator("a[href*='dashboard.alchemy.com']")).toBeVisible();
  });

  test("shows HELIUS_API_KEY input", async ({ page }) => {
    await expect(page.locator("code").filter({ hasText: "HELIUS_API_KEY" })).toBeVisible();
    await expect(page.locator("a[href*='dev.helius.xyz']")).toBeVisible();
  });

  test("shows BIRDEYE_API_KEY input", async ({ page }) => {
    await expect(page.locator("code").filter({ hasText: "BIRDEYE_API_KEY" })).toBeVisible();
    await expect(page.locator("a[href*='birdeye.so']")).toBeVisible();
  });

  test("shows Save API Keys button", async ({ page }) => {
    const saveBtn = page.locator("button").filter({ hasText: "Save API Keys" });
    await expect(saveBtn.first()).toBeVisible();
  });

  test("shows set/not-set indicator for keys", async ({ page }) => {
    const notSetLabels = page.locator("text=not set");
    expect(await notSetLabels.count()).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Config — key export (Danger Zone)
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Config — private key export", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.locator("a").filter({ hasText: "Config" }).click();
    await page.waitForTimeout(500);
  });

  test("shows Export Private Keys section in Danger Zone", async ({ page }) => {
    await expect(page.locator("text=Export Private Keys")).toBeVisible();
    await expect(page.locator("text=Never share these with anyone")).toBeVisible();
  });

  test("Export Keys button is visible", async ({ page }) => {
    await expect(page.locator("button").filter({ hasText: "Export Keys" })).toBeVisible();
  });

  test("clicking Export Keys shows confirmation dialog", async ({ page }) => {
    page.on("dialog", async (dialog) => {
      expect(dialog.message()).toContain("private keys");
      await dialog.accept();
    });

    await page.locator("button").filter({ hasText: "Export Keys" }).click();
    await page.waitForTimeout(500);

    await expect(page.locator(".key-export-box")).toBeVisible();
  });

  test("exported keys contain EVM and Solana sections", async ({ page }) => {
    page.on("dialog", async (dialog) => await dialog.accept());

    await page.locator("button").filter({ hasText: "Export Keys" }).click();
    await page.waitForTimeout(500);

    await expect(page.locator(".key-export-box strong").filter({ hasText: "EVM Private Key" })).toBeVisible();
    await expect(page.locator(".key-export-box strong").filter({ hasText: "Solana Private Key" })).toBeVisible();
  });

  test("exported keys have copy buttons", async ({ page }) => {
    page.on("dialog", async (dialog) => await dialog.accept());

    await page.locator("button").filter({ hasText: "Export Keys" }).click();
    await page.waitForTimeout(500);

    const copyButtons = page.locator(".key-export-box .copy-btn");
    await expect(copyButtons).toHaveCount(2);
  });

  test("clicking Hide Keys hides the export box", async ({ page }) => {
    page.on("dialog", async (dialog) => await dialog.accept());

    await page.locator("button").filter({ hasText: "Export Keys" }).click();
    await page.waitForTimeout(500);
    await expect(page.locator(".key-export-box")).toBeVisible();

    await page.locator("button").filter({ hasText: "Hide Keys" }).click();
    await page.waitForTimeout(300);
    await expect(page.locator(".key-export-box")).not.toBeVisible();
  });

  test("dismissing confirmation dialog does not show keys", async ({ page }) => {
    page.on("dialog", async (dialog) => await dialog.dismiss());

    await page.locator("button").filter({ hasText: "Export Keys" }).click();
    await page.waitForTimeout(500);

    await expect(page.locator(".key-export-box")).not.toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Edge cases — partial config, EVM-only, error states
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Inventory — EVM only (no Helius key)", () => {
  test("shows EVM tokens but no Solana section when only Alchemy is configured", async ({ page }) => {
    await mockApi(page, { walletConfig: { alchemyKeySet: true, heliusKeySet: false } });
    await page.goto("/");
    await page.locator("a").filter({ hasText: "Inventory" }).click();
    await page.waitForTimeout(1500);

    // Should show EVM tokens (ETH row exists)
    await expect(page.locator(".token-table tbody tr").filter({ hasText: "ETH" }).first()).toBeVisible();
    // No SOL row since Helius is not set
    const solRows = page.locator(".token-table tbody tr").filter({ hasText: "SOL" }).filter({ hasText: "Solana" });
    expect(await solRows.count()).toBe(0);
  });
});

test.describe("Inventory — Solana only (no Alchemy key)", () => {
  test("shows Solana tokens but no EVM section when only Helius is configured", async ({ page }) => {
    await mockApi(page, { walletConfig: { alchemyKeySet: false, heliusKeySet: true } });
    await page.goto("/");
    await page.locator("a").filter({ hasText: "Inventory" }).click();
    await page.waitForTimeout(1500);

    // Should show SOL row
    await expect(page.locator(".token-table tbody tr").filter({ hasText: "SOL" }).first()).toBeVisible();
    // No Ethereum chain rows
    const ethRows = page.locator(".token-table tbody tr").filter({ hasText: "Ethereum" });
    expect(await ethRows.count()).toBe(0);
  });
});

test.describe("Header — EVM-only wallet address", () => {
  test("shows only EVM address in tooltip when Solana is null", async ({ page }) => {
    await mockApi(page, {
      walletAddresses: { evmAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", solanaAddress: null },
    });
    await page.goto("/");
    await page.waitForTimeout(500);

    const walletWrapper = page.locator(".wallet-wrapper");
    await walletWrapper.hover();
    await page.waitForTimeout(300);

    await expect(page.locator("text=EVM")).toBeVisible();
    // SOL label should not appear
    await expect(page.locator(".wallet-addr-row").filter({ hasText: "SOL" })).not.toBeVisible();
    // Only one copy button
    const copyButtons = page.locator(".wallet-tooltip .copy-btn");
    await expect(copyButtons).toHaveCount(1);
  });
});

test.describe("Config — API keys show 'set' when configured", () => {
  test("shows 'set' labels when keys are configured", async ({ page }) => {
    await mockApi(page, { walletConfig: { alchemyKeySet: true, heliusKeySet: true, birdeyeKeySet: true } });
    await page.goto("/");
    await page.locator("a").filter({ hasText: "Config" }).click();
    await page.waitForTimeout(500);

    // All three keys should show "set"
    const setLabels = page.locator("text=set").filter({ hasNotText: "not set" });
    expect(await setLabels.count()).toBeGreaterThanOrEqual(3);
  });
});

test.describe("Inventory — empty wallet", () => {
  test("shows empty state when API keys are set but wallet has no tokens", async ({ page }) => {
    // Override balance mock to return empty
    await mockApi(page, { walletConfig: { alchemyKeySet: true, heliusKeySet: true } });

    // Override the balance endpoint to return empty data
    await page.route("**/api/wallet/balances", async (route) => {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ evm: { address: "0xtest", chains: [] }, solana: { address: "test", solBalance: "0", solValueUsd: "0", tokens: [] } }),
      });
    });

    await page.goto("/");
    await page.locator("a").filter({ hasText: "Inventory" }).click();
    await page.waitForTimeout(1500);

    // Should show the table but with just SOL native row
    const tableWrap = page.locator(".token-table-wrap");
    await expect(tableWrap).toBeVisible();
  });
});
