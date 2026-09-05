'use client';

import { Box, Button, chakra, Flex, Text } from '@chakra-ui/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useRef, useState } from 'react';
import { unknownLines } from '@/lib/coverage';
import { defaultIsDemo, defaultSave, demoSave } from '@/lib/default-snapshot';
import { playTime } from '@/lib/format';
import { useBoard } from '@/state/board';
import { useGameData } from '@/state/game-data';
import { useDropFiles } from '@/hooks/use-drop-files';
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

/** One cell of the status strip. */
function Chip({
  label,
  value,
  last = false,
  action,
}: {
  label: string;
  value: string;
  last?: boolean;
  action?: { label: string; onClick: () => void } | undefined;
}) {
  return (
    <Box
      px={3}
      py={1}
      borderRightWidth={last ? '0' : '1px'}
      borderColor="border.subtle"
      maxW="240px"
    >
      <Label display="block">{label}</Label>
      <Flex gap={2} align="baseline">
        <Mono fontSize="13px" fontWeight="500" lineHeight="1.3" truncate>
          {value}
        </Mono>
        {action ? (
          <chakra.button
            type="button"
            onClick={action.onClick}
            fontFamily="mono"
            fontSize="10.5px"
            letterSpacing="0.08em"
            textTransform="uppercase"
            color="accent.solid"
            flex="none"
            cursor="pointer"
            _hover={{ textDecoration: 'underline' }}
          >
            {action.label}
          </chakra.button>
        ) : null}
      </Flex>
    </Box>
  );
}

/**
 * Where the game keeps the recipe book, for the one sentence that has to say
 * so. It is inside every install, under `CommunityResources/Docs`.
 */
const WHERE_DOCS_IS =
  'It is inside your Satisfactory install under CommunityResources/Docs — on Steam that is ' +
  'steamapps/common/Satisfactory, on Epic the Satisfactory folder under Epic Games, and on ' +
  'Linux ~/.steam/steam/steamapps/common/Satisfactory.';

export function Header() {
  const { snapshot, source, status, dispatch } = useBoard();
  const book = useGameData();
  const dropFiles = useDropFiles();
  const filesRef = useRef<HTMLInputElement>(null);
  const bookRef = useRef<HTMLInputElement>(null);

  /*
   * Two different things that used to be one, and the conflation locked the
   * page in the demo: the *baked* save can be the demo (no game installed),
   * and the reader can *ask* for the demo. Only the second has a way back.
   */
  /*
   * And a third thing the first two hid: on a build that baked the demo, a
   * real save dropped on the page is not the demo — the e2e suite found every
   * loaded save labelled "a demo base" on exactly the build a stranger gets.
   */
  const showingDemo = source?.kind === 'demo' || (source?.kind === 'default' && defaultIsDemo);
  const canReturn = defaultSave !== null && !defaultIsDemo;

  /*
   * And the same two questions about the recipe book, which is its own
   * thing now: the build may have baked the demo book, and a real one may
   * have been dropped on the page since.
   */
  const demoBook = book.source.kind === 'baked' && book.source.name === 'demo';
  const bookLabel =
    book.source.kind === 'user'
      ? `${book.source.name} · ${Object.keys(book.db.recipes).length}`
      : demoBook
        ? `demo · ${Object.keys(book.db.recipes).length}`
        : `your install · ${Object.keys(book.db.recipes).length}`;

  /*
   * A real save read against a book that does not know its recipes looks
   * like a broken board: every line unexplained, class names for labels.
   * This is the count that says the book is the problem, not the board.
   */
  const unknown = useMemo(
    () => (showingDemo ? [] : unknownLines(book.db, snapshot)),
    [book.db, showingDemo, snapshot],
  );

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

  /*
   * What the strip under the header has to say, if anything. A base that does
   * not exist has to say so, everywhere, permanently: numbers about a
   * fictional factory are indistinguishable from numbers about a real one
   * once they are on the screen, and the whole board is numbers. A demo
   * recipe book is the same kind of fact, and a book that cannot read the
   * save in front of it is the one thing a stranger has to be told first.
   */
  const notices: {
    label: string;
    text: string;
    tone: 'accent' | 'crit';
    action?: { label: string; onClick: () => void } | undefined;
  }[] = [];
  /*
   * A drop that failed, in the header rather than only in the drop zone: the
   * drop zone is not on screen once a save is loaded, and a second file that
   * would not read used to fail in silence.
   */
  if (status.kind === 'failed') {
    notices.push({
      label: 'Save',
      text: status.message,
      tone: 'crit',
      action: { label: 'Dismiss', onClick: () => dispatch({ type: 'dismiss' }) },
    });
  }
  if (showingDemo) {
    notices.push({
      label: 'Demo',
      text:
        'Every number on this page is from a base that does not exist — drop a .sav on the page' +
        (canReturn ? ', or use the button above to go back to your own save,' : '') +
        ' to see your own factory.',
      tone: 'accent',
    });
  }
  if (book.status.kind === 'extracting') {
    notices.push({ label: 'Recipes', text: `Reading ${book.status.fileName}…`, tone: 'accent' });
  } else if (book.status.kind === 'failed') {
    notices.push({ label: 'Recipes', text: book.status.message, tone: 'crit' });
  } else if (unknown.length > 0) {
    notices.push({
      label: 'Recipes',
      text:
        `This save runs ${unknown.length} line${unknown.length === 1 ? '' : 's'} the ` +
        (demoBook ? 'demo recipe book' : 'loaded recipe book') +
        ' does not know' +
        (snapshot?.modded ? ' — a modded save always will, for the mod recipes' : '') +
        (demoBook
          ? `. Drop your game's Docs/en-US.json on the page to read it properly. ${WHERE_DOCS_IS}`
          : '. If the book is from another game version, drop the current Docs/en-US.json.'),
      tone: 'accent',
    });
  } else if (demoBook) {
    notices.push({
      label: 'Recipes',
      text:
        'The recipe book is a hand-written demo set. Drop your game’s Docs/en-US.json on the ' +
        `page to use the real one, and it is remembered in this browser. ${WHERE_DOCS_IS}`,
      tone: 'accent',
    });
  }

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

        <Flex
          borderWidth="1px"
          borderColor={showingDemo || demoBook ? 'accent.solid' : 'border.default'}
          wrap="wrap"
          data-testid="status-strip"
        >
          {snapshot ? (
            <>
              <Chip
                label="Session"
                value={`${snapshot.sessionName}${snapshot.modded ? ' · modded' : ''}`}
              />
              <Chip label="Played" value={playTime(snapshot.playDurationSeconds)} />
              <Chip
                label={
                  showingDemo ? 'Showing' : source?.kind === 'default' ? 'Auto-loaded' : 'File'
                }
                value={showingDemo ? 'a demo base' : (source?.name ?? '—')}
              />
            </>
          ) : null}
          <Chip
            label="Recipes"
            value={bookLabel}
            last
            action={
              book.source.kind === 'user'
                ? { label: 'Forget', onClick: () => void book.forget() }
                : { label: 'Load yours', onClick: () => bookRef.current?.click() }
            }
          />
        </Flex>

        <input
          ref={filesRef}
          type="file"
          accept=".sav,.json"
          multiple
          hidden
          data-testid="file-input"
          onChange={(event) => {
            if (event.target.files) void dropFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <input
          ref={bookRef}
          type="file"
          accept=".json"
          hidden
          data-testid="book-input"
          onChange={(event) => {
            if (event.target.files) void dropFiles(event.target.files);
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
          onClick={() => filesRef.current?.click()}
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

      {notices.map((notice) => (
        <Flex
          key={notice.label + notice.text}
          bg={notice.tone === 'crit' ? 'bg.muted' : 'accent.subtle'}
          borderTopWidth="1px"
          borderColor={notice.tone === 'crit' ? 'status.crit' : 'accent.solid'}
          px={{ base: 4, md: 6 }}
          py={1.5}
          gap={3}
          align="baseline"
          wrap="wrap"
          data-testid={`notice-${notice.label.toLowerCase()}`}
        >
          <Label flex="none" color="fg">
            {notice.label}
          </Label>
          <Text fontSize="12.5px" lineHeight="1.5" color="fg.muted">
            {notice.text}
          </Text>
          {notice.action ? (
            <chakra.button
              type="button"
              onClick={notice.action.onClick}
              fontFamily="mono"
              fontSize="10.5px"
              letterSpacing="0.08em"
              textTransform="uppercase"
              color="accent.solid"
              flex="none"
              cursor="pointer"
              _hover={{ textDecoration: 'underline' }}
            >
              {notice.action.label}
            </chakra.button>
          ) : null}
        </Flex>
      ))}
    </Box>
  );
}
