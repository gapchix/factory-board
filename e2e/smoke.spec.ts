import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * What a stranger's first minute has to survive.
 *
 * Data-agnostic on purpose: a local run may have the maintainer's own save
 * and database baked in, CI has the demo, and both must pass. So nothing here
 * asserts a particular session or recipe count — only that the page opens,
 * takes a recipe book, keeps it, and says no politely to files that are
 * neither ([ADR 36](../docs/adr/0036-the-board-meets-a-strangers-save.md)).
 */

const DOCS_FIXTURE = fileURLToPath(new URL('fixtures/docs-mini.json', import.meta.url));
const VIEWS = [
  { link: 'Base', path: '/base' },
  { link: 'Planner', path: '/plan' },
  { link: 'History', path: '/history' },
  { link: 'Progression', path: '/progress' },
] as const;

const strip = (page: Page) => page.getByTestId('status-strip');

test('the board opens with something to show, on every view', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Overview' })).toBeVisible();
  await expect(strip(page)).toContainText('Session');
  await expect(strip(page)).toContainText('Recipes');

  for (const view of VIEWS) {
    await page.getByRole('link', { name: view.link, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${view.path}/?$`));
    await expect(page.locator('main h2').first()).toBeVisible();
  }
});

test('a dropped Docs.json becomes the recipe book, and is remembered', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('book-input').setInputFiles(DOCS_FIXTURE);
  // Two recipes in the fixture, and the chip says so.
  await expect(strip(page)).toContainText('docs-mini.json · 2');

  await page.reload();
  await expect(strip(page)).toContainText('docs-mini.json · 2');

  await page.getByRole('button', { name: 'Forget' }).click();
  await expect(strip(page)).not.toContainText('docs-mini.json');
});

test('a JSON that is not a recipe book says so', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('book-input').setInputFiles({
    name: 'plan.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ targets: [] })),
  });
  await expect(page.getByTestId('notice-recipes')).toContainText(
    'could not be read as a recipe book',
  );
  // And the page is still a page.
  await expect(page.getByRole('link', { name: 'Overview' })).toBeVisible();
});

test('a file that is neither a save nor a recipe book is refused', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a save'),
  });
  await expect(page.getByTestId('notice-save')).toContainText('neither a .sav nor a Docs.json');
});

test('the base view draws the map', async ({ page }) => {
  await page.goto('/base');
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
});

/*
 * Real saves are personal and not committed. Point E2E_SAVE at one to run
 * the load path end to end; E2E_OLD_SAVE at a pre-Update-6 file to see it
 * refused with the right words.
 */
test('a real save loads and the Overview lists its lines', async ({ page }) => {
  test.skip(!process.env.E2E_SAVE, 'set E2E_SAVE to a .sav to run this');
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(process.env.E2E_SAVE!);
  await expect(strip(page)).toContainText('File', { timeout: 60_000 });
  await expect(page.getByText(/Bottlenecks|Production lines|lines/i).first()).toBeVisible();
});

test('a save too old to read fails politely', async ({ page }) => {
  test.skip(!process.env.E2E_OLD_SAVE, 'set E2E_OLD_SAVE to a pre-Update-6 .sav to run this');
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(process.env.E2E_OLD_SAVE!);
  await expect(page.getByTestId('notice-save')).toContainText('could not be read', {
    timeout: 60_000,
  });
  await expect(page.getByTestId('notice-save')).toContainText('Update 5 and older');
});
