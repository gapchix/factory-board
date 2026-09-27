import { Box, Flex, Text } from '@chakra-ui/react';
import { APP_VERSION, REPO_URL } from '@/lib/about';

/**
 * The line at the bottom every hosted page needs and a local one never
 * missed: what this is, which version, where the source is, and the one
 * promise a save-file tool has to make out loud.
 *
 * The hosted copy also counts visits, and says so here in the same breath as
 * the promise, because a privacy line that leaves that out is not true
 * ([ADR 37](../../../../docs/adr/0037-the-hosted-copy-counts-visits.md)). A
 * donate link appears only where one is configured.
 */
export function Footer() {
  const counted = Boolean(process.env.FACTORY_BOARD_UMAMI_ID);
  const donate = process.env.FACTORY_BOARD_DONATE_URL;
  return (
    <Box as="footer" borderTopWidth="1px" borderColor="border.default" mt={16}>
      <Flex
        maxW="1320px"
        mx="auto"
        px={5}
        py={4}
        gap={4}
        wrap="wrap"
        align="baseline"
        fontFamily="mono"
        fontSize="11.5px"
        letterSpacing="0.06em"
        color="fg.subtle"
      >
        <Text>Factory Board v{APP_VERSION}</Text>
        <Text>MIT</Text>
        <Box asChild color="fg.muted" _hover={{ color: 'accent.solid' }}>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
        </Box>
        {donate ? (
          <Box asChild color="fg.muted" _hover={{ color: 'accent.solid' }}>
            <a href={donate} target="_blank" rel="noreferrer">
              Buy me a coffee
            </a>
          </Box>
        ) : null}
        <Text flex="1" minW={{ base: 'auto', md: '40ch' }} textAlign={{ base: 'start', md: 'end' }}>
          Runs entirely in your browser. Your save is never uploaded.
          {counted ? ' Visits are counted, anonymously, with nothing from the save.' : ''}
        </Text>
      </Flex>
    </Box>
  );
}
