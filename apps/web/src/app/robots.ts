import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/about';

// A static export has no request to be dynamic for; the file is written once, at build.
export const dynamic = 'force-static';

/** Everything is public and static; there is nothing to keep a crawler out of. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    host: SITE_URL,
  };
}
