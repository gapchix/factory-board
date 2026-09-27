'use client';

import { Box, Button, chakra, Flex, Text } from '@chakra-ui/react';
import type { WorldSnapshot } from '@factory-board/save-reader';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useRef, useState } from 'react';
import { WHERE_SAVES_ARE } from '@/lib/about';
import { unknownLines } from '@/lib/coverage';
import { defaultIsDemo, defaultSave, demoSave, isDemo } from '@/lib/default-snapshot';
import { playTime } from '@/lib/format';
import { track } from '@/lib/track';
import { useBoard, type SnapshotSource } from '@/state/board';
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
    // On a phone the five views do not fit across; the strip scrolls sideways
    // inside itself rather than pushing the whole page wider.
    <Flex gap={0} borderWidth="1px" borderColor="border.default" maxW="100%" overflowX="auto">
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

/** A small text button, for the actions that sit beside a value. */
function TextAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <chakra.button
      type="button"
      onClick={onClick}
      fontFamily="mono"
      fontSize="10.5px"
      letterSpacing="0.08em"
      textTransform="uppercase"
      color="accent.solid"
      flex="none"
      cursor="pointer"
      _hover={{ textDecoration: 'underline' }}
      _focusVisible={{ outline: '2px solid', outlineColor: 'accent.solid', outlineOffset: '2px' }}
    >
      {label}
    </chakra.button>
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
        {action ? <TextAction label={action.label} onClick={action.onClick} /> : null}
      </Flex>
    </Box>
  );
}

/**
 * Where the two files a visitor needs are, for the sentences that have to say
 * so. Saves are where the game keeps them; the recipe book is inside every
 * install, under `CommunityResources/Docs`.
 */
const WHERE_DOCS_IS =
  'inside your Satisfactory install under CommunityResources/Docs — on Steam that is ' +
  'steamapps/common/Satisfactory, on Epic the Satisfactory folder under Epic Games, and on ' +
  'Linux ~/.steam/steam/steamapps/common/Satisfactory';

interface Notice {
  readonly label: string;
  readonly text: string;
  readonly tone: 'accent' | 'crit';
  readonly action?: { label: string; onClick: () => void } | undefined;
}

export function Header() {
  const { snapshot, source, status, dispatch } = useBoard();
  const book = useGameData();
  const dropFiles = useDropFiles();
  const filesRef = useRef<HTMLInputElement>(null);
  const bookRef = useRef<HTMLInputElement>(null);
  /*
   * The save the demo replaced, so the Demo button is a round trip on a hosted
   * copy too. There the save the board opened on *is* the demo, so the way
   * back used to be "drop your file again".
   */
  const stashed = useRef<{ snapshot: WorldSnapshot; source: SnapshotSource } | null>(null);

  /*
   * Three things that used to be one, and the conflations locked the page
   * in the demo: the *baked* save can be the demo (no game installed), the
   * reader can *ask* for the demo, and — on a build that baked the demo — a
   * real save dropped on the page is not the demo, however the page opened.
   */
  const showingDemo = isDemo(source);
  const canReturn = stashed.current !== null || (defaultSave !== null && !defaultIsDemo);

  /*
   * And the same questions about the recipe book, which is its own thing now:
   * the build may have baked the demo book, and a real one may have been
   * dropped on the page since.
   */
  const demoBook = book.source.kind === 'baked' && book.source.name === 'demo';
  const recipeCount = useMemo(() => Object.keys(book.db.recipes).length, [book.db]);
  const bookLabel =
    book.source.kind === 'user'
      ? `${book.source.name} · ${recipeCount}`
      : demoBook
        ? `demo · ${recipeCount}`
        : book.source.name === 'hosted'
          ? `game build ${book.db.sourceBuildId} · ${recipeCount}`
          : `your install · ${recipeCount}`;

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
   * Swapping the demo in is a dispatch, not a reload: it replaces the
   * snapshot in memory and nothing on disk, so what was there is one click
   * away again. That is also why it works on a built export, where there is
   * no script to run.
   */
  const showDemo = () => {
    if (!demoSave) return;
    if (snapshot && source && !showingDemo) stashed.current = { snapshot, source };
    dispatch({ type: 'loaded', snapshot: demoSave, source: { kind: 'demo', name: 'demo' } });
    track('demo_opened');
  };

  /*
   * The way back: the save the demo replaced, else the one the build baked in
   * where that is not the demo itself. Clearing from the demo would otherwise
   * leave an empty page and a request to drop a file, when the save is still
   * in memory or in the bundle — so this is a return ticket, not a bin.
   */
  const restore = () => {
    const back =
      stashed.current ??
      (defaultSave && !defaultIsDemo
        ? {
            snapshot: defaultSave.snapshot,
            source: { kind: 'default' as const, name: defaultSave.source },
          }
        : null);
    stashed.current = null;
    if (!back) return dispatch({ type: 'clearSave' });
    dispatch({ type: 'loaded', snapshot: back.snapshot, source: back.source });
  };

  /*
   * What the strip under the header has to say, if anything. A base that does
   * not exist has to say so, everywhere, permanently: numbers about a
   * fictional factory are indistinguishable from numbers about a real one
   * once they are on the screen, and the whole board is numbers. A demo
   * recipe book is the same kind of fact, and a book that cannot read the
   * save in front of it is the one thing a stranger has to be told first.
   *
   * One notice per fact, and the first visit to a hosted copy — demo base
   * *and* demo book — gets one notice for both rather than two paragraphs.
   */
  const notices: Notice[] = [];
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
  if (book.status.kind === 'extracting') {
    notices.push({ label: 'Recipes', text: `Reading ${book.status.fileName}…`, tone: 'accent' });
  } else if (book.status.kind === 'failed') {
    notices.push({ label: 'Recipes', text: book.status.message, tone: 'crit' });
  }

  if (showingDemo && demoBook) {
    notices.push({
      label: 'Demo',
      text:
        'This is a demo base with a demo recipe book. To see your own factory, drop your save ' +
        `and your game’s Docs/en-US.json anywhere on this page: saves live in ${WHERE_SAVES_ARE}, ` +
        `and the recipe book is ${WHERE_DOCS_IS}. Nothing leaves your browser.`,
      tone: 'accent',
    });
  } else if (showingDemo) {
    notices.push({
      label: 'Demo',
      text:
        'Every number on this page is from a base that does not exist — drop a .sav anywhere on ' +
        'the page' +
        (canReturn ? ', or use the button above to go back to your own save,' : '') +
        ' to see your own factory.',
      tone: 'accent',
    });
  } else if (book.status.kind === 'idle' && unknown.length > 0) {
    notices.push({
      label: 'Recipes',
      text:
        `This save runs ${unknown.length} line${unknown.length === 1 ? '' : 's'} the ` +
        (demoBook ? 'demo recipe book' : 'loaded recipe book') +
        ' does not know' +
        (snapshot?.modded ? ' — a modded save always will, for the mod recipes' : '') +
        (demoBook
          ? `. Drop your game’s Docs/en-US.json anywhere on the page to read it properly; it is ${WHERE_DOCS_IS}.`
          : '. If the book is from another game version, drop the current Docs/en-US.json.'),
      tone: 'accent',
    });
  } else if (book.status.kind === 'idle' && demoBook) {
    notices.push({
      label: 'Recipes',
      text:
        'The recipe book is a hand-written demo set. Drop your game’s Docs/en-US.json anywhere ' +
        `on the page to use the real one; it is ${WHERE_DOCS_IS}.`,
      tone: 'accent',
    });
  }
  if (book.source.kind === 'user' && !book.source.remembered) {
    notices.push({
      label: 'Recipes',
      text:
        `${book.source.name} is in use but could not be remembered — this browser is not ` +
        'letting the page store anything, so it will be asked for again next visit.',
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
          aria-label="Load a save or a recipe book"
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
          aria-label="Load a recipe book"
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
          {snapshot && !showingDemo ? 'Load another' : 'Load save'}
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
          <Text fontSize="12.5px" lineHeight="1.5" color="fg.muted" maxW="110ch">
            {notice.text}
          </Text>
          {notice.action ? (
            <TextAction label={notice.action.label} onClick={notice.action.onClick} />
          ) : null}
        </Flex>
      ))}
    </Box>
  );
}
