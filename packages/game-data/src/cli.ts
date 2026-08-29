#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeDocs } from './docs.js';
import { extractDatabase } from './extract.js';
import { describeSearch, INSTALL_DIR_ENV, locateInstall } from './locate.js';
import { parseGameDatabase } from './schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = resolve(here, '..', 'generated', 'game-database.json');

const STEAM_APP_ID = 526870;

/**
 * Docs.json carries no version of its own, so we read Steam's build id from the
 * app manifest two levels up from the install directory. Epic installs have no
 * equivalent, and get 0 — the id is display-only metadata, never compared
 * against the `buildVersion` inside a save file.
 */
function readSourceBuildId(installDir: string): number {
  const manifest = resolve(installDir, '..', '..', `appmanifest_${STEAM_APP_ID}.acf`);
  try {
    const match = /"buildid"\s+"(\d+)"/.exec(readFileSync(manifest, 'utf8'));
    if (match?.[1]) return Number(match[1]);
  } catch {
    // Not a Steam install, or the manifest moved. Not worth failing over.
  }
  return 0;
}

function main(): void {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outPath = outIndex >= 0 && args[outIndex + 1] ? resolve(args[outIndex + 1]!) : DEFAULT_OUT;

  const located = locateInstall();
  if (!located) {
    console.error(
      `Could not find a Satisfactory install. Looked in:\n${describeSearch()}\n\n` +
        `Set ${INSTALL_DIR_ENV} to the folder containing CommunityResources and run this again.`,
    );
    process.exit(1);
  }

  console.log(`Reading  ${located.docsPath}`);
  const docs = decodeDocs(readFileSync(located.docsPath));

  const buildIndex = args.indexOf('--build');
  const overrideBuild = buildIndex >= 0 ? Number(args[buildIndex + 1]) : Number.NaN;
  const sourceBuildId = Number.isFinite(overrideBuild)
    ? overrideBuild
    : readSourceBuildId(located.installDir);

  const { database, counts, skipped } = extractDatabase(docs, { sourceBuildId });

  parseGameDatabase(database); // throws with a readable message if malformed

  mkdirSync(dirname(outPath), { recursive: true });
  const json = JSON.stringify(database);
  writeFileSync(outPath, json);

  console.log(
    `Wrote    ${outPath} (${(json.length / 1024).toFixed(0)} KB)\n` +
      `         ${counts.recipes} recipes (${counts.alternateRecipes} alternate), ` +
      `${counts.items} items, ${counts.machines} machines, ${counts.milestones} milestones\n` +
      `         ${counts.schematics} schematics that unlock a recipe\n` +
      `         source build id ${database.sourceBuildId || 'unknown'}`,
  );
  if (skipped.length > 0) {
    console.log(`Skipped  ${skipped.length} entries. First few:`);
    for (const line of skipped.slice(0, 5)) console.log(`         ${line}`);
  }
}

main();
