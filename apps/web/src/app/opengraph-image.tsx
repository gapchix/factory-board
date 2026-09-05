import { ImageResponse } from 'next/og';

// A static export has no request to be dynamic for; the image is made once, at build.
export const dynamic = 'force-static';

/**
 * The card a link to the board unfurls into.
 *
 * Drawn at build time so it cannot drift from the header: the same rust, the
 * same two-tone wordmark, and the one sentence the product is.
 */
export const alt = 'Factory Board — plan a Satisfactory factory, then check it against your save';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        background: '#161311',
        color: '#F3EDE6',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        <div
          style={{
            width: 88,
            height: 88,
            background: '#D95A18',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg viewBox="0 0 64 64" width="88" height="88">
            <path fill="#FFFFFF" d="M18 14h30v9H28v8h17v9H28v10H18z" />
          </svg>
        </div>
        <div style={{ display: 'flex', fontSize: 84, fontWeight: 700, letterSpacing: -2 }}>
          <span>FACTORY</span>
          <span style={{ color: '#FF8845' }}>BOARD</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontSize: 44, lineHeight: 1.25, maxWidth: 1000 }}>
          Plan a Satisfactory factory, then check it against your actual save file.
        </div>
        <div style={{ fontSize: 28, color: '#A89F95' }}>
          Starving lines, backed-up lines, dead grids, what to build next. Runs entirely in your
          browser.
        </div>
      </div>
    </div>,
    size,
  );
}
