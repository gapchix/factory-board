'use client';

import { Box, Button, Flex, Text } from '@chakra-ui/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { playTime } from '@/lib/format';
import { useBoard } from '@/state/board';
import { useSaveLoader } from '@/hooks/use-save-loader';
import { Label, Mono } from './primitives';

const ROUTES = [
  { href: '/', label: 'Overview' },
  { href: '/base', label: 'Base' },
  { href: '/plan', label: 'Planner' },
  { href: '/progress', label: 'Progression' },
] as const;

function Nav() {
  const pathname = usePathname();
  return (
    <Flex gap={0} borderWidth="1px" borderColor="border.default">
      {ROUTES.map((route, index) => {
        const active = pathname === route.href;
        return (
          <Box
            key={route.href}
            asChild
            px={4}
            py={2}
            borderRightWidth={index < ROUTES.length - 1 ? '1px' : '0'}
            borderColor="border.default"
            bg={active ? 'accent.solid' : 'transparent'}
            color={active ? 'accent.contrast' : 'fg.muted'}
            fontFamily="mono"
            fontSize="11.5px"
            letterSpacing="0.1em"
            textTransform="uppercase"
            _hover={active ? {} : { color: 'accent.solid' }}
          >
            <Link href={route.href} aria-current={active ? 'page' : undefined}>
              {route.label}
            </Link>
          </Box>
        );
      })}
    </Flex>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // The theme is unknown during prerender; render a stable label until the
  // client resolves it, or the button flickers on first paint.
  useEffect(() => setMounted(true), []);

  return (
    <Button
      variant="outline"
      size="sm"
      borderRadius="0"
      fontFamily="mono"
      fontSize="11px"
      letterSpacing="0.1em"
      textTransform="uppercase"
      borderColor="border.default"
      color="fg.muted"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label="Toggle colour theme"
    >
      {mounted && resolvedTheme === 'dark' ? 'Light' : 'Dark'}
    </Button>
  );
}

export function Header() {
  const { snapshot, source, status, dispatch } = useBoard();
  const loadSave = useSaveLoader();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Box
      as="header"
      position="sticky"
      top="0"
      zIndex="20"
      bg="bg.surface"
      borderBottomWidth="2px"
      borderColor="fg.default"
    >
      <Flex maxW="1320px" mx="auto" px={5} py={3} gap={5} align="center" wrap="wrap">
        <Box asChild>
          <Link href="/">
            <Text
              fontFamily="heading"
              fontWeight="700"
              fontSize="27px"
              lineHeight="1"
              textTransform="uppercase"
              whiteSpace="nowrap"
            >
              Factory
              <Box as="span" color="accent.solid">
                Board
              </Box>
            </Text>
          </Link>
        </Box>

        <Nav />

        <Box flex="1" />

        {snapshot ? (
          <Flex borderWidth="1px" borderColor="border.default" wrap="wrap">
            {[
              ['Session', snapshot.sessionName],
              ['Played', playTime(snapshot.playDurationSeconds)],
              [source?.kind === 'default' ? 'Auto-loaded' : 'File', source?.name ?? '—'],
            ].map(([label, value], index) => (
              <Box
                key={label}
                px={3}
                py={1}
                borderRightWidth={index < 2 ? '1px' : '0'}
                borderColor="border.subtle"
                maxW="220px"
              >
                <Label display="block">{label}</Label>
                <Mono fontSize="13px" fontWeight="500" lineHeight="1.3" truncate>
                  {value}
                </Mono>
              </Box>
            ))}
          </Flex>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept=".sav"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void loadSave(file);
            event.target.value = '';
          }}
        />

        <Button
          size="sm"
          borderRadius="0"
          bg="accent.solid"
          color="accent.contrast"
          fontFamily="mono"
          fontSize="11.5px"
          letterSpacing="0.1em"
          textTransform="uppercase"
          _hover={{ filter: 'brightness(1.08)' }}
          onClick={() => inputRef.current?.click()}
          loading={status.kind === 'parsing'}
          loadingText="Parsing"
        >
          {snapshot ? 'Load another' : 'Load save'}
        </Button>

        {snapshot ? (
          <Button
            size="sm"
            variant="outline"
            borderRadius="0"
            borderColor="border.default"
            color="fg.muted"
            fontFamily="mono"
            fontSize="11px"
            letterSpacing="0.1em"
            textTransform="uppercase"
            onClick={() => dispatch({ type: 'clearSave' })}
          >
            Clear
          </Button>
        ) : null}

        <ThemeToggle />
      </Flex>
    </Box>
  );
}
