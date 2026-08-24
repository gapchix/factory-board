import type { NextConfig } from 'next';

const config: NextConfig = {
  // Static export: the app has no server side. See docs/adr/0001-client-side-only.md
  output: 'export',
  reactStrictMode: true,
  transpilePackages: [
    '@factory-board/planner',
    '@factory-board/game-data',
    '@factory-board/save-reader',
  ],
  typedRoutes: true,
};

export default config;
