/**
 * Low-level readers for `Docs/en-US.json`, the machine-readable dump that ships
 * inside every Satisfactory install under `CommunityResources`.
 *
 * Two things about that file drive the code here:
 *  - it is UTF-16LE with a BOM, so `readFileSync(path, 'utf8')` returns garbage;
 *  - nested structs are stored as *escaped strings*, not JSON, so ingredient
 *    lists have to be pulled out with a parser rather than a property access.
 */

export interface DocsClass {
  readonly ClassName: string;
  readonly [key: string]: unknown;
}

export interface DocsGroup {
  readonly NativeClass: string;
  readonly Classes: readonly DocsClass[];
}

/** Decode the UTF-16LE document and strip the byte-order mark. */
export function decodeDocs(buffer: Uint8Array): DocsGroup[] {
  const text = Buffer.from(buffer).toString('utf16le').replace(/^﻿/, '');
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error('Docs.json did not contain the expected array of native classes.');
  }
  return parsed as DocsGroup[];
}

/** Every group whose `NativeClass` matches, e.g. /FGRecipe/. */
export function groupsMatching(docs: readonly DocsGroup[], pattern: RegExp): DocsGroup[] {
  return docs.filter((g) => pattern.test(g.NativeClass ?? ''));
}

export function classesMatching(docs: readonly DocsGroup[], pattern: RegExp): DocsClass[] {
  return groupsMatching(docs, pattern).flatMap((g) => [...g.Classes]);
}

export interface ParsedAmount {
  readonly className: string;
  readonly amount: number;
}

const AMOUNT_PATTERN = /ItemClass=[^,]*?\/([A-Za-z0-9_]+)\.\1_C'?"?,Amount=(\d+)/g;

/**
 * Pull `(ItemClass=".../Desc_IronIngot.Desc_IronIngot_C",Amount=1)` tuples out of
 * one of the escaped struct strings.
 *
 * Returns an empty list for empty or unparseable input rather than throwing —
 * a recipe with no ingredients is legitimate (raw extraction), and a shape we
 * do not recognise should skip that recipe, not abort the whole extraction.
 */
export function parseAmounts(raw: unknown): ParsedAmount[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  const out: ParsedAmount[] = [];
  AMOUNT_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = AMOUNT_PATTERN.exec(raw)) !== null) {
    const [, name, amount] = match;
    if (!name || !amount) continue;
    out.push({ className: `${name}_C`, amount: Number(amount) });
  }
  return out;
}

const PRODUCED_IN_PATTERN = /Build_([A-Za-z0-9_]+)\.Build_\1_C/g;

/** Machine class names listed in a recipe's `mProducedIn`. */
export function parseProducedIn(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  const out: string[] = [];
  PRODUCED_IN_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PRODUCED_IN_PATTERN.exec(raw)) !== null) {
    if (match[1]) out.push(match[1]);
  }
  return out;
}

/** Recipe class names referenced anywhere inside a schematic's `mUnlocks`. */
export function parseUnlockedRecipes(raw: unknown): string[] {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
  return [...new Set(text.match(/Recipe_[A-Za-z0-9_]+_C/g) ?? [])];
}

export function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
