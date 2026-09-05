'use client';

import { Box, Button, Flex, Heading, Text } from '@chakra-ui/react';
import { useEffect } from 'react';
import { Mono } from '@/components/primitives';
import { issueUrl } from '@/lib/about';
import { useBoard } from '@/state/board';

/**
 * What a page shows when a view throws.
 *
 * Without this a throw was a blank page: React unmounts the tree and the
 * board simply vanishes, with nothing to say what happened or how to report
 * it. Every view is computed from a save, and a stranger's save is the one
 * input the board has never seen — so the first version anyone else opens has
 * to fail somewhere better than nowhere
 * ([ADR 36](../../../../docs/adr/0036-the-board-meets-a-strangers-save.md)).
 *
 * The header stays: this boundary wraps the page, not the layout, so the
 * reader can still load another save or clear the one that broke it.
 */
export default function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { snapshot, dispatch } = useBoard();

  useEffect(() => {
    // The console is where a developer will look; the page is for everyone else.
    console.error(error);
  }, [error]);

  const message = error.message || 'An error with no message.';
  const report = issueUrl({
    title: `Board failed: ${message.slice(0, 80)}`,
    message: error.stack ?? message,
    saveBuildVersion: snapshot?.saveBuildVersion,
  });

  return (
    <Box maxW="72ch" mx="auto" mt={10} data-testid="page-error">
      <Heading
        as="h2"
        fontFamily="heading"
        fontWeight="600"
        fontSize="24px"
        textTransform="uppercase"
        letterSpacing="0.03em"
        mb={3}
      >
        Something in this save broke the board
      </Heading>
      <Text color="fg.muted" fontSize="14px" mb={3}>
        The view threw while reading{' '}
        {snapshot ? (
          <>
            <Mono>{snapshot.sessionName}</Mono>
            {snapshot.modded ? ', a modded save' : ''}
          </>
        ) : (
          'the page'
        )}
        . Nothing was uploaded and nothing on your disk was touched.
      </Text>
      <Box
        bg="bg.muted"
        borderWidth="1px"
        borderColor="border.default"
        px={4}
        py={3}
        mb={4}
        overflowX="auto"
      >
        <Mono fontSize="12.5px" whiteSpace="pre-wrap">
          {message}
        </Mono>
      </Box>
      <Flex gap={3} wrap="wrap" align="center">
        <Button
          size="sm"
          borderRadius="0"
          bg="accent.solid"
          color="accent.contrast"
          fontFamily="mono"
          fontSize="11.5px"
          letterSpacing="0.1em"
          textTransform="uppercase"
          onClick={reset}
        >
          Try again
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
            onClick={() => {
              dispatch({ type: 'clearSave' });
              reset();
            }}
          >
            Clear the save
          </Button>
        ) : null}
        <Box asChild fontFamily="mono" fontSize="11.5px" color="accent.solid">
          <a href={report} target="_blank" rel="noreferrer">
            Report it on GitHub →
          </a>
        </Box>
      </Flex>
      <Text color="fg.subtle" fontSize="12.5px" mt={4} maxW="60ch">
        The report is prefilled with the message, the version and your browser. It does not include
        the save; if one is needed to reproduce this, it will be asked for.
      </Text>
    </Box>
  );
}
