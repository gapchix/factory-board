'use client';

import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { ChakraProvider } from '@chakra-ui/react';
import { useServerInsertedHTML } from 'next/navigation';
import { ThemeProvider } from 'next-themes';
import { useState, type ReactNode } from 'react';
import { system } from '@/theme/system';

/**
 * Hands Emotion's collected styles to Next during prerender.
 *
 * Without this, the markup generated at build time carries no style rules and
 * React tears down the tree on hydration (error #418). `compat = true` is what
 * makes Emotion record insertions for us to replay.
 */
function EmotionRegistry({ children }: { children: ReactNode }) {
  const [cache] = useState(() => {
    const created = createCache({ key: 'fb' });
    created.compat = true;
    return created;
  });

  useServerInsertedHTML(() => (
    <style
      data-emotion={`${cache.key} ${Object.keys(cache.inserted).join(' ')}`}
      dangerouslySetInnerHTML={{ __html: Object.values(cache.inserted).join(' ') }}
    />
  ));

  return <CacheProvider value={cache}>{children}</CacheProvider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <EmotionRegistry>
      <ChakraProvider value={system}>
        <ThemeProvider attribute="class" disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </ChakraProvider>
    </EmotionRegistry>
  );
}
