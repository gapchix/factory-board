'use client';

import { Box, Text } from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';
import { useDropFiles } from '@/hooks/use-drop-files';

/**
 * The whole page is the drop target.
 *
 * The banner has said "drop a .sav on the page" since the demo existed, and
 * the only element that took a drop was the drop zone — which is not on
 * screen once a save is loaded, and a demo base is loaded on every first
 * visit. A file dropped anywhere else did what browsers do with a dropped
 * file: navigated away to show its bytes. So the window listens, and says so
 * while a file is being dragged over it.
 *
 * Only file drags count. Dragging text or a link across the page must not
 * light this up, and `dataTransfer.types` says which it is before the drop.
 */
export function DropAnywhere() {
  const dropFiles = useDropFiles();
  const [active, setActive] = useState(false);
  /* Enter/leave fire for every child crossed; the drag is over the page until
   * the count returns to zero. */
  const depth = useRef(0);

  useEffect(() => {
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files');

    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setActive(true);
    };
    const onOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      // Without this the browser refuses the drop.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setActive(false);
      const files = event.dataTransfer?.files;
      if (files && files.length > 0) void dropFiles(files);
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    // Says the page is catching drops — for the browser tests, which otherwise
    // drop a file into the moment between the HTML arriving and React waking.
    document.body.dataset['dropReady'] = '1';
    return () => {
      delete document.body.dataset['dropReady'];
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [dropFiles]);

  if (!active) return null;

  return (
    <Box
      position="fixed"
      inset="0"
      zIndex="30"
      bg="accent.subtle"
      opacity="0.96"
      borderWidth="3px"
      borderStyle="dashed"
      borderColor="accent.solid"
      display="flex"
      alignItems="center"
      justifyContent="center"
      pointerEvents="none"
      data-testid="drop-anywhere"
    >
      <Box textAlign="center" px={6}>
        <Text
          fontFamily="heading"
          fontWeight="600"
          fontSize="28px"
          textTransform="uppercase"
          letterSpacing="0.03em"
        >
          Drop to load
        </Text>
        <Text fontSize="14px" color="fg.muted" mt={1}>
          A .sav, several autosaves at once, or your Docs/en-US.json. Nothing leaves this tab.
        </Text>
      </Box>
    </Box>
  );
}
