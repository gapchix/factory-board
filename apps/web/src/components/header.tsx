'use client';

import { Box, Button, Flex, Text } from '@chakra-ui/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { defaultIsDemo, defaultSave, demoSave } from '@/lib/default-snapshot';
import { playTime } from '@/lib/format';
import { gameDatabase } from '@/lib/game-database';
import { useBoard } from '@/state/board';
import { useSaveLoader } from '@/hooks/use-save-loader';
import { Label, Mono } from './primitives';

const ROUTES = [
  { href: '/', label: 'Overview' },
  { href: '/base', label: 'Base' },
  { href: '/plan', label: 'Planner' },
  { href: '/history', label: 'History' },
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
            px={3}
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
  /*
   * A base that does not exist has to say so, everywhere, permanently. Numbers
   * about a fictional factory are indistinguishable from numbers about a real
   * one once they are on the screen, and the whole board is numbers.
   */
  /*
   * Two different things that used to be one, and the conflation locked the
   * page in the demo: the *baked* save can be the demo (no game installed),
   * and the reader can *ask* for the demo. Only the second has a way back.
   */
  const showingDemo = source?.kind === 'demo' || defaultIsDemo;
  const canReturn = defaultSave !== null && !defaultIsDemo;

  /*
   * Swapping the demo in and out is a dispatch, not a reload: it replaces the
   * snapshot in memory and nothing on disk, so your own save is one click away
   * again. That is also why it works on a built export, where there is no
   * script to run.
   */
  const showDemo = () => {
    if (demoSave) {
      dispatch({ type: 'loaded', snapshot: demoSave, source: { kind: 'demo', name: 'demo' } });
    }
  };

  /*
   * The way back. Clearing from the demo would leave an empty page and a
   * request to drop a file, when the save the board opened on is still sitting
   * in the bundle — so where there is one, this button is a return ticket
   * rather than a bin.
   */
  const restore = () => {
    if (!defaultSave || defaultIsDemo) return dispatch({ type: 'clearSave' });
    dispatch({
      type: 'loaded',
      snapshot: defaultSave.snapshot,
      source: { kind: 'default', name: defaultSave.source },
    });
  };

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
      <Flex maxW="1320px" mx="auto" px={5} py={3} gap={4} align="center" wrap="wrap">
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
          <Flex
            borderWidth="1px"
            borderColor={showingDemo ? 'accent.solid' : 'border.default'}
            wrap="wrap"
          >
            {[
              ['Session', snapshot.sessionName],
              ['Played', playTime(snapshot.playDurationSeconds)],
              [
                showingDemo ? 'Showing' : source?.kind === 'default' ? 'Auto-loaded' : 'File',
                showingDemo ? 'a demo base' : (source?.name ?? '—'),
              ],
            ].map(([label, value], index) => (
              <Box
                key={label}
                px={3}
                py={1}
                borderRightWidth={index < 2 ? '1px' : '0'}
                borderColor="border.subtle"
                maxW="168px"
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

        {showingDemo || !demoSave ? null : (
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
            onClick={showDemo}
          >
            Demo
          </Button>
        )}

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
            onClick={showingDemo && canReturn ? restore : () => dispatch({ type: 'clearSave' })}
          >
            {showingDemo && canReturn ? 'Your save' : 'Clear'}
          </Button>
        ) : null}

        <ThemeToggle />
      </Flex>

      {showingDemo ? (
        <Flex
          bg="accent.subtle"
          borderTopWidth="1px"
          borderColor="accent.solid"
          px={{ base: 4, md: 6 }}
          py={1.5}
          gap={3}
          align="baseline"
          wrap="wrap"
        >
          <Label flex="none" color="fg">
            Demo
          </Label>
          <Text fontSize="12.5px" lineHeight="1.5" color="fg.muted">
            Every number on this page is from a base that does not exist.{' '}
            {/* And only claim the install is missing when it is: this banner sat
                beside a button offering to go back to the real save it said
                could not be found. */}
            {gameDatabase.sourceBuildId === 0
              ? 'No Satisfactory install was found, so the board is running on its own hand-written data'
              : 'The recipes are your own install’s; the factory is not'}{' '}
            — drop a{' '}
            <Box as="span" fontFamily="mono">
              .sav
            </Box>{' '}
            on the page{canReturn ? ', use the button above to go back to your own save,' : ''} or
            run{' '}
            <Box as="span" fontFamily="mono">
              npm run extract
            </Box>{' '}
            with the game installed, to see your own factory.
          </Text>
        </Flex>
      ) : null}
    </Box>
  );
}
