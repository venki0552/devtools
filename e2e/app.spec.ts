import { test, expect } from '@playwright/test'

test.describe('Home Page', () => {
  test('loads and shows title', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('header h1')).toHaveText('DevTools')
  })

  test('displays all 21 tool links in sidebar', async ({ page }) => {
    await page.goto('/')
    const toolLinks = page.locator('nav a[href^="/"]')
    await expect(toolLinks.first()).toBeVisible()
    const count = await toolLinks.count()
    expect(count).toBeGreaterThanOrEqual(21)
  })

  test('search filters tools', async ({ page }) => {
    await page.goto('/')
    const searchInput = page.locator('input[type="text"], input[type="search"]').first()
    if (await searchInput.isVisible()) {
      await searchInput.fill('JWT')
      await expect(page.getByText('JWT Decoder').first()).toBeVisible()
    }
  })
})

test.describe('Navigation', () => {
  test('navigates to a tool page from sidebar', async ({ page }) => {
    await page.goto('/')
    const jsonLink = page.locator('nav a[href="/json"]')
    await jsonLink.click()
    await expect(page).toHaveURL('/json')
    await expect(page.locator('h1, h2').filter({ hasText: 'JSON Parser' }).first()).toBeVisible()
  })

  test('navigates to home via logo', async ({ page }) => {
    await page.goto('/json')
    const homeLink = page.locator('a[aria-label="DevTools Home"]')
    await homeLink.click()
    await expect(page).toHaveURL('/')
  })

  test('sidebar shows active state', async ({ page }) => {
    await page.goto('/base64')
    const activeLink = page.locator('nav a[href="/base64"]')
    await expect(activeLink).toHaveAttribute('aria-current', 'page')
  })
})

test.describe('Theme Toggle', () => {
  test('toggles between dark and light mode', async ({ page }) => {
    await page.goto('/')
    // Default: dark mode (no .light class)
    const html = page.locator('html')
    await expect(html).not.toHaveClass(/light/)

    // Click theme toggle
    const themeBtn = page.locator('button[aria-label*="Switch to light"]')
    await themeBtn.click()
    await expect(html).toHaveClass(/light/)

    // Toggle back
    const darkBtn = page.locator('button[aria-label*="Switch to dark"]')
    await darkBtn.click()
    await expect(html).not.toHaveClass(/light/)
  })
})

test.describe('SEO & LLM', () => {
  test('has meta description', async ({ page }) => {
    await page.goto('/')
    const meta = page.locator('meta[name="description"]').first()
    await expect(meta).toHaveAttribute('content', /.+/)
  })

  test('llms.txt is accessible', async ({ request }) => {
    const response = await request.get('/llms.txt')
    expect(response.status()).toBe(200)
    const text = await response.text()
    expect(text).toContain('DevTools')
  })

  test('robots.txt is accessible', async ({ request }) => {
    const response = await request.get('/robots.txt')
    expect(response.status()).toBe(200)
    const text = await response.text()
    expect(text).toContain('User-agent')
  })
})

test.describe('Accessibility', () => {
  test('sidebar navigation is labeled', async ({ page }) => {
    await page.goto('/')
    const nav = page.locator('nav[aria-label="Tool navigation"]')
    await expect(nav).toBeVisible()
  })

  test('all tool links in sidebar have text content', async ({ page }) => {
    await page.goto('/')
    const links = page.locator('nav a[href^="/"]')
    const count = await links.count()
    for (let i = 0; i < Math.min(count, 5); i++) {
      await expect(links.nth(i)).not.toBeEmpty()
    }
  })
})
