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
  type ReactNode,
} from 'react';
import { defaultSave } from '@/lib/default-snapshot';
import { loadPlan, savePlan } from '@/lib/plan-storage';

export type LoadStatus =
  { kind: 'idle' } | { kind: 'parsing'; fileName: string } | { kind: 'failed'; message: string };

/** Where the loaded snapshot came from, so the UI can say so. */
export interface SnapshotSource {
  readonly kind: 'default' | 'file';
  readonly name: string;
}

interface BoardState {
  targets: ProductionTarget[];
  recipeChoices: Record<string, string>;
  snapshot: WorldSnapshot | null;
  source: SnapshotSource | null;
  status: LoadStatus;
}

type Action =
  | { type: 'addTarget'; item: string; ratePerMinute: number }
  | { type: 'setRate'; index: number; ratePerMinute: number }
  | { type: 'removeTarget'; index: number }
  | { type: 'setTargets'; targets: ProductionTarget[] }
  | { type: 'chooseRecipe'; item: string; recipe: string }
  | { type: 'clearPlan' }
  | { type: 'restore'; targets: ProductionTarget[]; recipeChoices: Record<string, string> }
  | { type: 'parsing'; fileName: string }
  | { type: 'loaded'; snapshot: WorldSnapshot; source: SnapshotSource }
  | { type: 'failed'; message: string }
  | { type: 'clearSave' };

const initialState: BoardState = {
  targets: [],
  recipeChoices: {},
  snapshot: null,
  source: null,
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
    case 'removeTarget':
      return { ...state, targets: state.targets.filter((_, i) => i !== action.index) };
    case 'setTargets':
      return { ...state, targets: action.targets };
    case 'chooseRecipe':
      return {
        ...state,
        recipeChoices: { ...state.recipeChoices, [action.item]: action.recipe },
      };
    case 'clearPlan':
      return { ...state, targets: [], recipeChoices: {} };
    case 'restore':
      return { ...state, targets: action.targets, recipeChoices: action.recipeChoices };
    case 'parsing':
      return { ...state, status: { kind: 'parsing', fileName: action.fileName } };
    case 'loaded':
      return {
        ...state,
        snapshot: action.snapshot,
        source: action.source,
        status: { kind: 'idle' },
      };
    case 'failed':
      return { ...state, status: { kind: 'failed', message: action.message } };
    case 'clearSave':
      return { ...state, snapshot: null, source: null, status: { kind: 'idle' } };
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

  // Restore after mount, never during render: localStorage does not exist while
  // the static export is being prerendered.
  useEffect(() => {
    const stored = loadPlan();
    if (stored) {
      dispatch({
        type: 'restore',
        targets: stored.targets,
        recipeChoices: stored.recipeChoices,
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
  }, []);

  useEffect(() => {
    savePlan({ targets: state.targets, recipeChoices: state.recipeChoices });
  }, [state.targets, state.recipeChoices]);

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
