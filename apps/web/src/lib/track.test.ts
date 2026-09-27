import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { failureReason, track, trackSaveFailed } from './track';

/*
 * The tests run in node, so the window is built by hand: a `sessionStorage`
 * that behaves, or one that throws the way a private window's can, and an
 * `umami` that records or is missing the way an ad blocker leaves it.
 */
function storage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  } as unknown as Storage;
}

const throwing = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('SecurityError');
  },
} as unknown as Storage;

let sent: { event: string; data?: Record<string, string> }[];

function stubWindow(options: { umami?: unknown; sessionStorage?: Storage } = {}) {
  vi.stubGlobal('window', {
    sessionStorage: options.sessionStorage ?? storage(),
    ...('umami' in options ? { umami: options.umami } : {}),
  });
}

const recorder = {
  track: (event: string, data?: Record<string, string>) =>
    void sent.push(data ? { event, data } : { event }),
};

beforeEach(() => {
  sent = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('track', () => {
  it('does nothing, and does not throw, when the script was blocked', () => {
    stubWindow();

    expect(() => track('save_dropped')).not.toThrow();
    expect(() => trackSaveFailed('parse')).not.toThrow();
  });

  it('does not throw when the script itself does', () => {
    stubWindow({
      umami: {
        track: () => {
          throw new Error('network');
        },
      },
    });

    expect(() => track('shared')).not.toThrow();
  });

  it('does not throw outside a browser', () => {
    expect(() => track('shared')).not.toThrow();
  });

  it('counts a person trying the board once, however many saves they drop', () => {
    stubWindow({ umami: recorder });

    track('save_dropped');
    track('save_dropped');
    track('save_dropped');

    expect(sent).toEqual([{ event: 'save_dropped' }]);
  });

  it('still counts when storage is unavailable, rather than fail the drop', () => {
    stubWindow({ umami: recorder, sessionStorage: throwing });

    expect(() => track('save_dropped')).not.toThrow();
    expect(sent).toEqual([{ event: 'save_dropped' }]);
  });

  it('counts every other event every time', () => {
    stubWindow({ umami: recorder });

    track('shared');
    track('shared');
    track('book_loaded');

    expect(sent.map((entry) => entry.event)).toEqual(['shared', 'shared', 'book_loaded']);
  });

  it('sends a failed save with its coarse reason and nothing else', () => {
    stubWindow({ umami: recorder });

    trackSaveFailed('version');

    expect(sent).toEqual([{ event: 'save_failed', data: { reason: 'version' } }]);
  });
});

describe('failureReason', () => {
  it('tells an old save apart from a broken one', () => {
    expect(failureReason('Unsupported save version 36')).toBe('version');
    expect(failureReason('The save parser did not answer in time.')).toBe('timeout');
    expect(failureReason('Unexpected end of buffer')).toBe('parse');
  });
});
