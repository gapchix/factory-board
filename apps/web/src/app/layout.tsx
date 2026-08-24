import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Saira_Condensed } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from './providers';

const display = Saira_Condensed({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const body = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Factory Board',
  description:
    'Plan a Satisfactory factory, then check it against your actual save file. Everything runs in your browser.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
