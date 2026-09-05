'use client';

import type { ProductionTarget } from '@factory-board/planner';
import type { WorldSnapshot } from '@factory-board/save-reader';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react';
import { defaultSave } from '@/lib/default-snapshot';
import { digestOf, type DigestSource } from '@/lib/history';
import { recordPoint } from '@/lib/history-store';
import { loadPlan, savePlan } from '@/lib/plan-storage';
import { loadZoneNames, saveZoneNames } from '@/lib/zone-storage';
import type { ZoneName, ZonePoint } from '@/lib/zones';
import { useGameData } from '@/state/game-data';

export type LoadStatus =
  | { kind: 'idle' }
  /** `bytes` is what is being read, so a big save can say it will take a moment. */
  | { kind: 'parsing'; fileName: string; bytes: number }
  | { kind: 'failed'; message: string };

/** Where the loaded snapshot came from, so the UI can say so. */
export interface SnapshotSource {
  readonly kind: 'default' | 'file' | 'demo';
  readonly name: string;
}

interface BoardState {
  targets: ProductionTarget[];
  recipeChoices: Record<string, string>;
  /**
   * Target item → a point in the zone it is to be built in.
   *
   * A point rather than a zone id: ids are positional, so the next autosave
   * hands "zone-2" to somewhere else entirely.
   */
  zoneAssignments: Record<string, ZonePoint>;
  /** Names the player has given places in the base, pinned the same way. */
  zoneNames: ZoneName[];
  snapshot: WorldSnapshot | null;
  source: SnapshotSource | null;
  /**
   * The other saves of the last drop, for the history. Kept in state rather
   * than written on arrival so they are digested against whatever recipe
   * book is current, and again when a new one is dropped, exactly like the
   * snapshot on screen.
   */
  earlier: readonly { source: string; snapshot: DigestSource }[];
  status: LoadStatus;
}

type Action =
  | { type: 'addTarget'; item: string; ratePerMinute: number }
  | { type: 'setRate'; index: number; ratePerMinute: number }
  | { type: 'removeTarget'; index: number }
  | { type: 'setTargets'; targets: ProductionTarget[] }
  | { type: 'chooseRecipe'; item: string; recipe: string }
  | { type: 'assignZone'; item: string; at: ZonePoint | null }
  | { type: 'setZoneNames'; names: ZoneName[] }
  | { type: 'clearPlan' }
  | {
      type: 'restore';
      targets: ProductionTarget[];
      recipeChoices: Record<string, string>;
      zoneAssignments: Record<string, ZonePoint>;
      zoneNames: ZoneName[];
    }
  | { type: 'parsing'; fileName: string; bytes: number }
  | {
      type: 'loaded';
      snapshot: WorldSnapshot;
      source: SnapshotSource;
      earlier?: readonly { source: string; snapshot: DigestSource }[] | undefined;
    }
  | { type: 'failed'; message: string }
  /** The reader has read the failure; the save that loaded before it stays. */
  | { type: 'dismiss' }
  | { type: 'clearSave' };

const initialState: BoardState = {
  targets: [],
  recipeChoices: {},
  zoneAssignments: {},
  zoneNames: [],
  snapshot: null,
  source: null,
  earlier: [],
  status: { kind: 'idle' },
};

function reducer(state: BoardState, action: Action): BoardState {
  switch (action.type) {
    case 'addTarget': {
      // Adding the same item twice raises the rate rather than duplicating the row.
      const existing = state.targets.findIndex((t) => t.item === action.item);
      if (existing >= 0) {
        const targets = state.targets.map((t, i) =>
          i === existing ? { ...t, ratePerMinute: t.ratePerMinute + action.ratePerMinute } : t,
        );
        return { ...state, targets };
      }
      return {
        ...state,
        targets: [...state.targets, { item: action.item, ratePerMinute: action.ratePerMinute }],
      };
    }
    case 'setRate':
      return {
        ...state,
        targets: state.targets.map((t, i) =>
          i === action.index ? { ...t, ratePerMinute: action.ratePerMinute } : t,
        ),
      };
    case 'removeTarget': {
      const removed = state.targets[action.index]?.item;
      const zoneAssignments = { ...state.zoneAssignments };
      if (removed) delete zoneAssignments[removed];
      return {
        ...state,
        targets: state.targets.filter((_, i) => i !== action.index),
        zoneAssignments,
      };
    }
    case 'setTargets':
      return { ...state, targets: action.targets };
    case 'chooseRecipe':
      return {
        ...state,
        recipeChoices: { ...state.recipeChoices, [action.item]: action.recipe },
      };
    case 'assignZone': {
      const zoneAssignments = { ...state.zoneAssignments };
      if (action.at) zoneAssignments[action.item] = action.at;
      else delete zoneAssignments[action.item];
      return { ...state, zoneAssignments };
    }
    case 'setZoneNames':
      return { ...state, zoneNames: action.names };
    case 'clearPlan':
      // Where things go belongs to the plan; what places are called does not.
      return { ...state, targets: [], recipeChoices: {}, zoneAssignments: {} };
    case 'restore':
      return {
        ...state,
        targets: action.targets,
        recipeChoices: action.recipeChoices,
        zoneAssignments: action.zoneAssignments,
        zoneNames: action.zoneNames,
      };
    case 'parsing':
      return {
        ...state,
        status: { kind: 'parsing', fileName: action.fileName, bytes: action.bytes },
      };
    case 'loaded':
      return {
        ...state,
        snapshot: action.snapshot,
        source: action.source,
        earlier: action.earlier ?? [],
        status: { kind: 'idle' },
      };
    case 'failed':
      return { ...state, status: { kind: 'failed', message: action.message } };
    case 'dismiss':
      return state.status.kind === 'failed' ? { ...state, status: { kind: 'idle' } } : state;
    case 'clearSave':
      return { ...state, snapshot: null, source: null, earlier: [], status: { kind: 'idle' } };
    default:
      return state;
  }
}

interface BoardContextValue extends BoardState {
  dispatch: React.Dispatch<Action>;
  addTarget: (item: string, ratePerMinute: number) => void;
}

const BoardContext = createContext<BoardContextValue | null>(null);

export function BoardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  // The recipe book the history is digested against. It can change under the
  // board when one is dropped on the page; a digest is re-recorded then, which
  // overwrites the same point with better numbers.
  const { db } = useGameData();
  /**
   * Whether what was in storage has been read back yet.
   *
   * The restore effect and the two that write back all run on mount, and the
   * writers would otherwise persist the *initial* empty state on top of
   * whatever storage was holding — the restore is a dispatch, so it does not
   * take effect until the next render, and the write happens first. That threw
   * a plan away on **every page load**: set targets, reload, and they were
   * gone, which read as "the planner is not used" rather than "the planner
   * cannot remember anything".
   *
   * State rather than a ref, deliberately. A ref set inside the restore effect
   * is already true by the time the writers run in the *same* commit, which is
   * the bug wearing a guard. State makes them wait for the render that actually
   * holds the restored plan.
   */
  const [restored, setRestored] = useState(false);

  // Restore after mount, never during render: localStorage does not exist while
  // the static export is being prerendered.
  useEffect(() => {
    const stored = loadPlan();
    const zoneNames = loadZoneNames();
    if (stored || zoneNames.length > 0) {
      dispatch({
        type: 'restore',
        targets: stored?.targets ?? [],
        recipeChoices: stored?.recipeChoices ?? {},
        zoneAssignments: stored?.zoneAssignments ?? {},
        zoneNames,
      });
    }
    // A save baked in at build time opens automatically, so the dashboard has
    // something to show on first paint. Dropping a file in replaces it.
    if (defaultSave) {
      dispatch({
        type: 'loaded',
        snapshot: defaultSave.snapshot,
        source: { kind: 'default', name: defaultSave.source },
      });
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    savePlan({
      targets: state.targets,
      recipeChoices: state.recipeChoices,
      zoneAssignments: state.zoneAssignments,
    });
  }, [restored, state.targets, state.recipeChoices, state.zoneAssignments]);

  useEffect(() => {
    if (!restored) return;
    saveZoneNames(state.zoneNames);
  }, [restored, state.zoneNames]);

  /*
   * Every save that passes through the board is written down, whichever view
   * happens to be open. The game keeps three rotating autosave slots, so a
   * moment nobody recorded is gone within a quarter of an hour — and the only
   * moment the board is certain to see is the one it is holding right now.
   */
  useEffect(() => {
    if (!state.snapshot || !state.source) return;
    void recordPoint(digestOf(db, state.snapshot, state.source.name));
  }, [db, state.snapshot, state.source]);

  /*
   * And the saves that were already on disk when the page opened. Three
   * rotating autosave slots are a time series nobody was reading: without this
   * History starts at a single point and a session's shape only appears after
   * an hour with the tab left open. Recording is keyed by the session's own
   * clock, so seeding the same saves twice leaves one point each.
   */
  useEffect(() => {
    if (!defaultSave) return;
    for (const seed of defaultSave.earlier) {
      void recordPoint(digestOf(db, seed.snapshot, seed.source));
    }
  }, [db]);

  // And the rest of the last drop, the same way: three autosave slots dropped
  // together are a series, digested against the book of the moment.
  useEffect(() => {
    for (const seed of state.earlier) {
      void recordPoint(digestOf(db, seed.snapshot, seed.source));
    }
  }, [db, state.earlier]);

  const addTarget = useCallback((item: string, ratePerMinute: number) => {
    dispatch({ type: 'addTarget', item, ratePerMinute });
  }, []);

  const value = useMemo<BoardContextValue>(
    () => ({ ...state, dispatch, addTarget }),
    [state, addTarget],
  );

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

export function useBoard(): BoardContextValue {
  const context = useContext(BoardContext);
  if (!context) throw new Error('useBoard must be used inside <BoardProvider>');
  return context;
}
