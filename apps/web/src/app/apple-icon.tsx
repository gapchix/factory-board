import { ImageResponse } from 'next/og';

// A static export has no request to be dynamic for; the image is made once, at build.
export const dynamic = 'force-static';

/**
 * The home-screen icon, drawn at build time from the same shapes as
 * `icon.svg`: Safari and iOS do not take an SVG favicon, so this is the PNG
 * they get. Generated rather than committed so there is one source of truth
 * for the mark.
 */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#D95A18',
      }}
    >
      <svg viewBox="0 0 64 64" width="180" height="180">
        <path fill="#FFFFFF" d="M18 14h30v9H28v8h17v9H28v10H18z" />
      </svg>
    </div>,
    size,
  );
}
