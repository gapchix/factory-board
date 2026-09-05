import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Saira_Condensed } from 'next/font/google';
import type { ReactNode } from 'react';
import { Box } from '@chakra-ui/react';
import { DropAnywhere } from '@/components/drop-anywhere';
import { Footer } from '@/components/footer';
import { Header } from '@/components/header';
import { SITE_URL } from '@/lib/about';
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

const DESCRIPTION =
  'Plan a Satisfactory factory, then check it against your actual save file. Everything runs in your browser.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Factory Board', template: '%s · Factory Board' },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Factory Board',
    title: 'Factory Board',
    description: DESCRIPTION,
    url: '/',
  },
  twitter: { card: 'summary_large_image', title: 'Factory Board', description: DESCRIPTION },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body>
        <Providers>
          <Header />
          <DropAnywhere />
          <Box as="main" maxW="1320px" mx="auto" px={5} pt={6} pb={12}>
            {children}
          </Box>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
