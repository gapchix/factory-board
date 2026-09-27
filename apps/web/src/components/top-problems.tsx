'use client';

import { Box, Button, Flex, Heading, Text, Textarea } from '@chakra-ui/react';
import { useState } from 'react';
import { SITE_URL, WHERE_SAVES_ARE } from '@/lib/about';
import { type ProblemRow, type ShareInput, shareText } from '@/lib/share';
import { track } from '@/lib/track';
import { Label } from './primitives';

const smallButton = {
  size: 'xs',
  borderRadius: '0',
  fontFamily: 'mono',
  fontSize: '10.5px',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
} as const;

/**
 * Put text on the clipboard, or show it to be copied by hand.
 *
 * The clipboard is refused often enough to plan for: a page not served over
 * HTTPS, a browser that asks and is told no, an embedded view. Then the text
 * is shown selected in a box, so the button still does what it said.
 */
function useCopy() {
  const [state, setState] = useState<'idle' | 'copied' | { manual: string }>('idle');
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState({ manual: text });
    }
  };
  return { state, copy, reset: () => setState('idle') };
}

function ManualCopy({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <Box mt={2} data-testid="manual-copy">
      <Text fontSize="12px" color="fg.muted" mb={1}>
        This browser would not let the page copy it. Select it and copy it yourself:
      </Text>
      <Textarea
        readOnly
        value={text}
        rows={Math.min(10, text.split('\n').length)}
        fontFamily="mono"
        fontSize="12px"
        borderRadius="0"
        onFocus={(event) => event.currentTarget.select()}
        autoFocus
      />
      <Button {...smallButton} variant="ghost" mt={1} onClick={onClose}>
        Close
      </Button>
    </Box>
  );
}

/**
 * The one thing a stranger has to be told first: this is not their base, and
 * how to get theirs here. The drop works anywhere on the page, so this is
 * mostly the path, because finding the file is the hard part.
 */
export function YourSave() {
  const { state, copy, reset } = useCopy();
  return (
    <Box
      borderWidth="2px"
      borderStyle="dashed"
      borderColor="accent.solid"
      bg="accent.subtle"
      px={{ base: 4, md: 6 }}
      py={5}
      mb={6}
      data-testid="your-save"
    >
      <Heading
        as="h2"
        fontFamily="heading"
        fontWeight="600"
        fontSize="22px"
        textTransform="uppercase"
        letterSpacing="0.02em"
        mb={1.5}
      >
        What is wrong with your base?
      </Heading>
      <Text fontSize="14px" color="fg.muted" maxW="72ch" mb={3}>
        Everything below is a demo base. Drop your own save anywhere on this page and the board
        reads it in this tab and tells you which lines are slow, why, and what to fix first. Nothing
        is uploaded.
      </Text>
      <Flex gap={2} align="center" wrap="wrap">
        <Label color="fg" flex="none">
          Saves are in
        </Label>
        <Box
          as="code"
          fontFamily="mono"
          fontSize="12.5px"
          bg="bg.surface"
          borderWidth="1px"
          borderColor="border.default"
          px={2}
          py={0.5}
          overflowWrap="anywhere"
        >
          {WHERE_SAVES_ARE}
        </Box>
        <Button
          {...smallButton}
          variant="outline"
          borderColor="border.default"
          onClick={() => void copy(WHERE_SAVES_ARE)}
          data-testid="copy-save-path"
        >
          {state === 'copied' ? 'Copied' : 'Copy path'}
        </Button>
      </Flex>
      <Text fontSize="12.5px" color="fg.subtle" mt={2}>
        Paste it into the Explorer address bar, open the folder with your session&apos;s number, and
        drop the newest .sav here, or all three autosaves together for a history.
      </Text>
      {typeof state === 'object' ? <ManualCopy text={state.manual} onClose={reset} /> : null}
    </Box>
  );
}

/**
 * The few things most worth fixing, at the top of the Overview.
 *
 * The bottleneck list further down has every line; this is the short answer
 * to "what do I do tonight". Each problem says what is wrong, as read from
 * the save, and then what to try, labelled as such, because the first is a
 * reading and the second is advice.
 */
export function TopProblems({
  rows,
  power,
  sessionName,
}: {
  rows: readonly ProblemRow[];
  power: ShareInput['power'];
  sessionName: string;
}) {
  const { state, copy, reset } = useCopy();
  const [withName, setWithName] = useState(false);

  const share = () => {
    track('shared');
    void copy(
      shareText({ rows, power, sessionName: withName ? sessionName : null, url: SITE_URL }),
    );
  };

  return (
    <Box
      bg="bg.surface"
      borderWidth="1px"
      borderColor="border.default"
      borderTopWidth="3px"
      borderTopColor={rows.length > 0 ? 'fg.default' : 'border.default'}
      px={{ base: 4, md: 5 }}
      py={4}
      mb={6}
      data-testid="top-problems"
    >
      <Flex align="baseline" gap={3} mb={3} wrap="wrap">
        <Text
          fontFamily="heading"
          fontWeight="600"
          fontSize="19px"
          textTransform="uppercase"
          letterSpacing="0.03em"
        >
          {rows.length > 0 ? 'Fix these first' : 'Nothing slow'}
        </Text>
        <Label>
          {rows.length > 0 ? 'worst first, one row per cause' : 'every line keeping up'}
        </Label>
        <Box flex="1" />
        <Flex gap={2} align="center" wrap="wrap">
          <Box as="label" display="flex" gap={1.5} alignItems="center" cursor="pointer">
            <input
              type="checkbox"
              checked={withName}
              onChange={(event) => setWithName(event.target.checked)}
            />
            <Label color="fg.muted">Include session name</Label>
          </Box>
          <Button
            {...smallButton}
            bg="accent.solid"
            color="accent.contrast"
            onClick={share}
            data-testid="share"
          >
            {state === 'copied' ? 'Copied' : 'Copy for Reddit / Discord'}
          </Button>
        </Flex>
      </Flex>

      {rows.length === 0 ? (
        <Text fontSize="14px" color="fg.muted">
          Every measured line is running at 95% or better. The list below has the detail.
        </Text>
      ) : (
        <Flex as="ol" direction="column" gap={3.5} listStyleType="none" m={0} p={0}>
          {rows.map((row, index) => (
            <Flex as="li" key={row.key} gap={3} align="baseline" data-testid="problem">
              <Text
                fontFamily="mono"
                fontSize="13px"
                color="fg.subtle"
                flex="none"
                w="1.2em"
                textAlign="right"
              >
                {index + 1}
              </Text>
              <Box minW={0}>
                <Text fontWeight="600" fontSize="15px">
                  {row.title}
                </Text>
                {row.why ? (
                  <Text fontSize="13.5px" color="fg.muted" lineHeight="1.45">
                    {row.why}
                  </Text>
                ) : null}
                {row.fix ? (
                  <Flex gap={2} align="baseline" mt={0.5}>
                    <Label color="fg" flex="none">
                      Try
                    </Label>
                    <Text fontSize="13.5px" lineHeight="1.45" data-testid="fix">
                      {row.fix}
                    </Text>
                  </Flex>
                ) : null}
              </Box>
            </Flex>
          ))}
        </Flex>
      )}
      {typeof state === 'object' ? <ManualCopy text={state.manual} onClose={reset} /> : null}
    </Box>
  );
}
