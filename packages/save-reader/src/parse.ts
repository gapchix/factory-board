import { Parser } from '@etothepii/satisfactory-file-parser';
import { analyzeSave, type RawSave } from './analyze.js';
import type { WorldSnapshot } from './types.js';

/**
 * Parse a `.sav` and reduce it to a snapshot.
 *
 * Pure JavaScript with no Node built-ins behind it, so this runs unchanged in a
 * browser tab or a Web Worker — which is the whole reason the app never has to
 * upload anyone's save anywhere.
 */
export function parseSaveFile(name: string, bytes: ArrayBuffer): WorldSnapshot {
  const parsed = Parser.ParseSave(name, bytes) as unknown as RawSave;
  return analyzeSave(parsed);
}
