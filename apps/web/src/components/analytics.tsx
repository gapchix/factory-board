import Script from 'next/script';
import { SITE_URL } from '@/lib/about';

/**
 * The hosted copy's visit counter, and nothing on any other build.
 *
 * Rendered only when `FACTORY_BOARD_UMAMI_ID` is set at build time, which only
 * the hosted build does, so `npm run dev` and a local export never load it.
 * `data-domains` is a second lock: the script ignores any host but the
 * hosted one, so a copy of the export served from anywhere else counts
 * nothing. What it may send is decided in `lib/track`
 * ([ADR 37](../../../../docs/adr/0037-the-hosted-copy-counts-visits.md)).
 */
export function Analytics() {
  const websiteId = process.env.FACTORY_BOARD_UMAMI_ID;
  if (!websiteId) return null;
  return (
    <Script
      src="https://stats.gapchix.io/script.js"
      data-website-id={websiteId}
      data-domains={new URL(SITE_URL).hostname}
      strategy="afterInteractive"
    />
  );
}
