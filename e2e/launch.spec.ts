import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * The launch path: what someone arriving from a Reddit post sees and can do.
 *
 * Data-agnostic like the smoke suite. A demo build opens on the demo base and
 * a local build on the maintainer's save, so each test asks for the demo when
 * the header offers it. The demo is built with a starving line, a backed-up
 * one and a dead grid, so it always has problems to show.
 */

const DOCS_FIXTURE = fileURLToPath(new URL('fixtures/docs-mini.json', import.meta.url));

async function openDemo(page: Page) {
  await page.goto('/');
  await page.waitForSelector('body[data-drop-ready="1"]');
  const demo = page.getByRole('button', { name: 'Demo', exact: true });
  if (await demo.isVisible()) await demo.click();
  await expect(page.getByTestId('your-save')).toBeVisible();
}

test.describe('the first minute', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('a stranger is told where their save is, and can copy the path', async ({ page }) => {
    await openDemo(page);
    const card = page.getByTestId('your-save');
    await expect(card).toContainText('FactoryGame');
    await card.getByTestId('copy-save-path').click();
    await expect(card.getByTestId('copy-save-path')).toHaveText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      '%LOCALAPPDATA%\\FactoryGame\\Saved\\SaveGames',
    );
  });

  test('the top of the page says what to fix, one fix per problem', async ({ page }) => {
    await openDemo(page);
    const top = page.getByTestId('top-problems');
    await expect(top).toBeVisible();
    const problems = top.getByTestId('problem');
    const count = await problems.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(3);
    await expect(top.getByTestId('fix')).toHaveCount(count);
  });

  test('the diagnosis copies as a Markdown list', async ({ page }) => {
    await openDemo(page);
    await page.getByTestId('share').click();
    await expect(page.getByTestId('share')).toHaveText('Copied');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text.startsWith('**My Satisfactory base: top problems**')).toBe(true);
    expect(text).toMatch(/^- \*\*.+\*\*/m);
    expect(text).toContain('The save never leaves the browser.');
  });
});

test('a refused clipboard shows the text to copy by hand', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
    });
  });
  await openDemo(page);
  await page.getByTestId('share').click();
  await expect(page.getByTestId('manual-copy')).toBeVisible();
  await expect(page.getByTestId('manual-copy').locator('textarea')).toHaveValue(/top problems/);
});

test('a blocked or broken counter never stops a file loading', async ({ page }) => {
  /*
   * The stats script is what an ad blocker removes, and on the hosted copy a
   * `track()` runs inside every drop handler. Its host is refused, and a
   * counter that throws is planted anyway, so both ways it can fail are live.
   */
  await page.route(/stats\.gapchix\.io/, (route) => route.abort());
  await page.addInitScript(() => {
    (window as unknown as { umami: unknown }).umami = {
      track: () => {
        throw new Error('blocked');
      },
    };
  });
  await page.goto('/');
  await page.getByTestId('book-input').setInputFiles(DOCS_FIXTURE);
  await expect(page.getByTestId('status-strip')).toContainText('docs-mini.json · 2');
  await page.getByRole('button', { name: 'Forget' }).click();
});
