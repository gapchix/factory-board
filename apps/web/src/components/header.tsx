'use client';

import { Box, Button, Flex, Text } from '@chakra-ui/react';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { playTime } from '@/lib/format';
import { useBoard } from '@/state/board';
import { useSaveLoader } from '@/hooks/use-save-loader';
import { Label, Mono } from './primitives';

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // The theme is unknown during prerender; render a stable placeholder until
  // the client resolves it, or the button flickers on first paint.
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
  const { snapshot, status, dispatch } = useBoard();
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
      <Flex maxW="1280px" mx="auto" px={5} py={3} gap={5} align="center" wrap="wrap">
        <Box>
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
          <Label display="block" mt={1}>
            Satisfactory · plan vs actual
          </Label>
        </Box>

        <Box flex="1" />

        {snapshot ? (
          <Flex borderWidth="1px" borderColor="border.default" wrap="wrap">
            {[
              ['Session', snapshot.sessionName],
              ['Played', playTime(snapshot.playDurationSeconds)],
              ['Build', String(snapshot.saveBuildVersion)],
            ].map(([label, value], index) => (
              <Box
                key={label}
                px={3}
                py={1}
                borderRightWidth={index < 2 ? '1px' : '0'}
                borderColor="border.subtle"
              >
                <Label display="block">{label}</Label>
                <Mono fontSize="13px" fontWeight="500" lineHeight="1.3">
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
          {snapshot ? 'Load another' : 'Load save file'}
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
