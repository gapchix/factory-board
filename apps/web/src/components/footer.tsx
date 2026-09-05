import { Box, Flex, Text } from '@chakra-ui/react';
import { APP_VERSION, REPO_URL } from '@/lib/about';

/**
 * The line at the bottom every hosted page needs and a local one never
 * missed: what this is, which version, where the source is, and the one
 * promise a save-file tool has to make out loud.
 */
export function Footer() {
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
        <Text flex="1" minW="40ch" textAlign={{ base: 'start', md: 'end' }}>
          Runs entirely in your browser. Nothing is uploaded.
        </Text>
      </Flex>
    </Box>
  );
}
