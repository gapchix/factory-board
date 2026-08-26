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

export interface ParsedFootprint {
  /** Extent across the building's own X and Y, in centimetres. */
  readonly widthCm: number;
  readonly lengthCm: number;
}

/*
 * `mClearanceData` is a list of boxes: the volume the building occupies, and
 * sometimes a softer one in front of it for the space a player needs to stand
 * and use it. The hard box is the building; the soft one is manners, and would
 * draw a Constructor half again as big as it is.
 */
const CLEARANCE_PATTERN =
  /\((?:Type=(\w+),)?ClearanceBox=\(Min=\(X=(-?[\d.]+),Y=(-?[\d.]+),Z=(-?[\d.]+)\),Max=\(X=(-?[\d.]+),Y=(-?[\d.]+),Z=(-?[\d.]+)\)/g;

/**
 * How much ground a building stands on, from the game's own clearance data.
 *
 * Checked against the wiki on the shapes that are easy to be wrong about: a
 * Constructor comes out 8 × 10 m, a Smelter 5 × 10 m, a Miner Mk.1 6 × 14 m and
 * a Coal-Powered Generator 10 × 26 m.
 */
export function parseClearance(raw: unknown): ParsedFootprint | undefined {
  if (typeof raw !== 'string' || raw.length === 0) return undefined;

  const boxes: { soft: boolean; widthCm: number; lengthCm: number }[] = [];
  CLEARANCE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CLEARANCE_PATTERN.exec(raw)) !== null) {
    const [, type, minX, minY, , maxX, maxY] = match;
    const widthCm = Number(maxX) - Number(minX);
    const lengthCm = Number(maxY) - Number(minY);
    if (!Number.isFinite(widthCm) || !Number.isFinite(lengthCm)) continue;
    if (widthCm <= 0 || lengthCm <= 0) continue;
    boxes.push({ soft: type === 'CT_Soft', widthCm, lengthCm });
  }

  const box = boxes.find((candidate) => !candidate.soft) ?? boxes[0];
  return box ? { widthCm: box.widthCm, lengthCm: box.lengthCm } : undefined;
}
