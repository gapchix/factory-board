/**
 * Counting what visitors do on the hosted copy, and nothing else.
 *
 * The only network call the page makes that is not for its own files
 * ([ADR 37](../../../../docs/adr/0037-the-hosted-copy-counts-visits.md)). It
 * goes through here so there is one place that decides what it sends, and the
 * answer is fixed at compile time: one of five event names, and for a failed save
 * one of four coarse reasons. No file names, no session names, nothing read
 * out of a save. There is no parameter anything else could be passed through.
 *
 * It has to fail silently, because it is the one piece of the page most
 * likely to be blocked: an ad blocker removes the script, and a drop handler
 * that called it unguarded would then throw and not load the save — a failure
 * nobody testing on their own machine would ever see.
 */

export type TrackEvent = 'save_dropped' | 'book_loaded' | 'demo_opened' | 'shared';

/** Why a save would not read, as coarsely as is still useful. */
export type SaveFailure = 'size' | 'version' | 'timeout' | 'parse';

interface Umami {
  track(event: string, data?: Record<string, string>): void;
}

const SESSION_KEY = 'factory-board:save-dropped';

function umami(): Umami | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as { umami?: Partial<Umami> }).umami;
  return typeof candidate?.track === 'function' ? (candidate as Umami) : null;
}

function send(event: string, data?: Record<string, string>): void {
  try {
    umami()?.track(event, data);
  } catch {
    // A counter is never worth an exception.
  }
}

/**
 * Whether this is the first save this tab has dropped.
 *
 * `save_dropped` counts people trying the board, not drops, so a player who
 * loads five autosaves is one — the launch is judged on the share of visitors
 * who try it. Storage can be unavailable (private windows, blocked site data);
 * then every drop counts, which errs towards the number being too high by a
 * little rather than the drop failing.
 */
function firstDropThisSession(): boolean {
  try {
    if (window.sessionStorage.getItem(SESSION_KEY)) return false;
    window.sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // Fall through: count it.
  }
  return true;
}

export function track(event: TrackEvent): void {
  if (!umami()) return;
  if (event === 'save_dropped' && !firstDropThisSession()) return;
  send(event);
}

export function trackSaveFailed(reason: SaveFailure): void {
  send('save_failed', { reason });
}

/**
 * The coarse reason for a parser's refusal, from its message.
 *
 * The parser names the version it cannot read, and that is the case worth
 * telling apart: a wave of them after a game patch is a reader to update, not
 * a lack of interest.
 */
export function failureReason(message: string): SaveFailure {
  if (/did not answer in time/i.test(message)) return 'timeout';
  if (/version|unsupported|update \d/i.test(message)) return 'version';
  return 'parse';
}
