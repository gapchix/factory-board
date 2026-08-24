#!/usr/bin/env node
/**
 * Copies the extracted game database into the app so the bundler can inline it.
 *
 * The database is generated from the developer's own Satisfactory install and is
 * never committed (see docs/adr/0003), so this fails loudly with instructions
 * rather than letting the build die on a missing import.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../../../packages/game-data/generated/game-database.json');
const target = resolve(here, '../src/generated/game-database.json');

if (!existsSync(source)) {
  console.error(
    '\n  No game database found.\n\n' +
      '  It is generated from your own Satisfactory install and is not committed.\n' +
      '  Run this from the repository root:\n\n' +
      '      npm run extract\n\n' +
      '  If your install is somewhere unusual:\n\n' +
      '      SATISFACTORY_DIR="D:/Games/Satisfactory" npm run extract\n',
  );
  process.exit(1);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log('game database synced');
