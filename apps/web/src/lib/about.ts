import { version } from '../../package.json';

/**
 * The few facts the page states about itself: where its source is, which
 * version it is, and where it is meant to be hosted. In one place so the
 * footer, the error page and the metadata cannot disagree.
 */
export const APP_VERSION: string = version;

export const REPO_URL = 'https://github.com/gapchix/factory-board';

/**
 * Where the hosted copy lives, for absolute URLs in metadata. Overridable at
 * build time so a fork or a staging copy does not advertise this one.
 */
export const SITE_URL: string =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://factory-board.gapchix.io';

/**
 * A prefilled bug report.
 *
 * Everything a report needs and nothing it should not: the message, the
 * version, which game build wrote the save, and the browser — never the save
 * itself, which is personal and stays on the reader's disk unless they choose
 * otherwise.
 */
export function issueUrl(details: {
  readonly title: string;
  readonly message: string;
  readonly saveBuildVersion?: number | undefined;
}): string {
  const agent = typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent;
  const body = [
    '**What happened**',
    '',
    '```',
    details.message,
    '```',
    '',
    `- Factory Board v${APP_VERSION}`,
    `- Game build: ${details.saveBuildVersion ?? 'no save loaded'}`,
    `- Browser: ${agent}`,
    '',
    '**What you were doing**',
    '',
    '(which view, which file — the save itself is not needed unless asked)',
  ].join('\n');
  const params = new URLSearchParams({ title: details.title, body });
  return `${REPO_URL}/issues/new?${params.toString()}`;
}
