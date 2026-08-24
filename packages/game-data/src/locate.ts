import { existsSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

/** Set this to skip auto-detection entirely. */
export const INSTALL_DIR_ENV = 'SATISFACTORY_DIR';

const DOCS_RELATIVE = join('CommunityResources', 'Docs', 'en-US.json');

function steamLibraryRoots(): string[] {
  const roots: string[] = [];
  const candidates =
    platform() === 'win32'
      ? [
          join('C:', 'Program Files (x86)', 'Steam'),
          join('C:', 'Program Files', 'Steam'),
          join(homedir(), 'scoop', 'apps', 'steam', 'current'),
        ]
      : platform() === 'darwin'
        ? [join(homedir(), 'Library', 'Application Support', 'Steam')]
        : [join(homedir(), '.steam', 'steam'), join(homedir(), '.local', 'share', 'Steam')];

  for (const root of candidates) {
    if (!existsSync(root)) continue;
    roots.push(root);

    // Steam can spread games across several drives; libraryfolders.vdf lists them.
    const vdf = join(root, 'steamapps', 'libraryfolders.vdf');
    if (!existsSync(vdf)) continue;
    try {
      const text = readFileSync(vdf, 'utf8');
      for (const match of text.matchAll(/"path"\s+"([^"]+)"/g)) {
        const extra = match[1]?.replace(/\\\\/g, '\\');
        if (extra && !roots.includes(extra)) roots.push(extra);
      }
    } catch {
      // A malformed VDF is not worth failing the whole lookup over.
    }
  }
  return roots;
}

/** Every place Satisfactory plausibly lives on this machine. */
export function candidateInstallDirs(): string[] {
  const dirs: string[] = [];

  const override = process.env[INSTALL_DIR_ENV];
  if (override) dirs.push(override);

  for (const root of steamLibraryRoots()) {
    dirs.push(join(root, 'steamapps', 'common', 'Satisfactory'));
  }

  if (platform() === 'win32') {
    dirs.push(join('C:', 'Program Files', 'Epic Games', 'SatisfactoryEarlyAccess'));
    dirs.push(join('C:', 'Program Files', 'Epic Games', 'SatisfactoryExperimental'));
    dirs.push(join('C:', 'Program Files', 'Epic Games', 'Satisfactory'));
  }

  return dirs;
}

export interface LocatedInstall {
  readonly installDir: string;
  readonly docsPath: string;
}

/** First install that actually contains the docs file, or undefined. */
export function locateInstall(): LocatedInstall | undefined {
  for (const dir of candidateInstallDirs()) {
    const docsPath = join(dir, DOCS_RELATIVE);
    if (existsSync(docsPath)) return { installDir: dir, docsPath };
  }
  return undefined;
}

export function describeSearch(): string {
  return candidateInstallDirs()
    .map((d) => `  - ${d}`)
    .join('\n');
}
