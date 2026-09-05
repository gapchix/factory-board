import { describe, expect, it } from 'vitest';
import { decodeDocs } from './docs.js';

const groups = [{ NativeClass: "Class'/Script/FactoryGame.FGRecipe'", Classes: [] }];
const json = JSON.stringify(groups);

/** The game's own encoding: UTF-16LE behind a byte-order mark. */
function utf16le(text: string, bom = true): Uint8Array {
  const out = new Uint8Array((text.length + (bom ? 1 : 0)) * 2);
  let offset = 0;
  if (bom) {
    out[0] = 0xff;
    out[1] = 0xfe;
    offset = 2;
  }
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    out[offset + i * 2] = code & 0xff;
    out[offset + i * 2 + 1] = code >> 8;
  }
  return out;
}

describe('decodeDocs', () => {
  it('reads the UTF-16LE file the game writes', () => {
    expect(decodeDocs(utf16le(json))).toEqual(groups);
  });

  it('reads a UTF-8 copy, with or without a byte-order mark', () => {
    const plain = new TextEncoder().encode(json);
    expect(decodeDocs(plain)).toEqual(groups);
    const marked = new Uint8Array(plain.length + 3);
    marked.set([0xef, 0xbb, 0xbf]);
    marked.set(plain, 3);
    expect(decodeDocs(marked)).toEqual(groups);
  });

  it('takes an ArrayBuffer as well, which is what a dropped file arrives as', () => {
    const bytes = utf16le(json);
    expect(
      decodeDocs(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
    ).toEqual(groups);
  });

  it('says what is wrong when the file is not Docs.json', () => {
    expect(() => decodeDocs(new TextEncoder().encode('not json'))).toThrow(/not JSON/);
    expect(() => decodeDocs(new TextEncoder().encode('{"a":1}'))).toThrow(/array of native/);
  });
});
