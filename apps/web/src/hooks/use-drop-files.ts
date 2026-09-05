'use client';

import { useCallback } from 'react';
import { useSaveLoader } from '@/hooks/use-save-loader';
import { useBoard } from '@/state/board';
import { useGameData } from '@/state/game-data';

/**
 * Sends whatever landed on the page to the right reader.
 *
 * Two kinds of file matter: a `.sav` is a world, and a `Docs.json` is the
 * recipe book to read it with. Both come off the player's own disk, so one
 * drop zone takes both — and takes several at once, because the three
 * autosave slots are a series and a book dropped alongside them is read
 * first so the saves land against it.
 */
export function useDropFiles() {
  const { loadSaves } = useSaveLoader();
  const { loadDocs } = useGameData();
  const { dispatch } = useBoard();

  return useCallback(
    async (dropped: FileList | readonly File[]) => {
      const files = Array.from(dropped);
      const books = files.filter((file) => /\.json$/i.test(file.name));
      const saves = files.filter((file) => /\.sav$/i.test(file.name));
      if (books.length === 0 && saves.length === 0) {
        if (files.length > 0) {
          dispatch({
            type: 'failed',
            message: `${files[0]!.name} is neither a .sav nor a Docs.json. Drop a save, or your game's Docs/en-US.json.`,
          });
        }
        return;
      }
      // Last book wins, which is what dropping one means.
      for (const book of books) await loadDocs(book);
      if (saves.length > 0) await loadSaves(saves);
    },
    [dispatch, loadDocs, loadSaves],
  );
}
