'use client';

import { issueUrl } from '@/lib/about';

/**
 * The boundary of last resort: what shows when the *layout* throws.
 *
 * It replaces the root layout, so nothing above it exists — no theme, no
 * Chakra, no fonts. Plain elements and inline styles on purpose: a page that
 * is here because something broke should depend on as little as possible.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const message = error.message || 'An error with no message.';
  const report = issueUrl({
    title: `Board failed to render: ${message.slice(0, 80)}`,
    message: error.stack ?? message,
  });
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: '48px 24px',
          fontFamily: 'system-ui, sans-serif',
          color: '#1a1a1a',
          background: '#f6f5f2',
        }}
      >
        <title>Factory Board · something broke</title>
        <main style={{ maxWidth: '72ch', margin: '0 auto' }}>
          <h1 style={{ fontSize: 22, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Factory Board could not draw the page
          </h1>
          <p style={{ color: '#555' }}>
            Nothing was uploaded and nothing on your disk was touched.
          </p>
          <pre
            style={{
              background: '#e9e7e2',
              padding: '12px 16px',
              overflowX: 'auto',
              fontSize: 13,
              whiteSpace: 'pre-wrap',
            }}
          >
            {message}
          </pre>
          <p>
            <button
              type="button"
              onClick={reset}
              style={{
                background: '#b8481e',
                color: 'white',
                border: 0,
                padding: '8px 14px',
                fontFamily: 'inherit',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontSize: 12,
                cursor: 'pointer',
                marginRight: 16,
              }}
            >
              Try again
            </button>
            <a href={report} target="_blank" rel="noreferrer" style={{ color: '#b8481e' }}>
              Report it on GitHub →
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
