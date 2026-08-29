'use client';

import { Button, Flex, Text } from '@chakra-ui/react';
import type { GameDatabase, RecipeSwap } from '@factory-board/planner';
import { Fragment } from 'react';
import { itemName, signed } from '@/lib/format';
import { describeLock, type UnlockState } from '@/lib/unlocks';
import { useBoard } from '@/state/board';
import { Label, NumTd, TableFrame, Td, Th } from './primitives';

/**
 * Whether a swap is worth putting in front of anyone.
 *
 * Machines are the currency the whole board counts in, so a swap that costs
 * one is not offered however good it looks elsewhere — three megawatts back
 * for two more assemblers is not a saving, it is a worse factory that draws
 * less. At the same machine count, less power or strictly less raw both count:
 * a recipe taking the same twelve constructors and forty fewer ore a minute is
 * a free node.
 *
 * A swap that introduces a warning is left out whatever it appears to save,
 * because the saving is not real: the solver reports a cycle by treating the
 * item as raw, which makes the plan look smaller by not making the thing.
 */
function worthwhile(swap: RecipeSwap): boolean {
  if (swap.current || swap.warnings.length > 0) return false;
  if (swap.machines < 0) return true;
  if (swap.machines > 0) return false;

  const deltas = Object.values(swap.raw);
  return swap.powerMW < -0.5 || (deltas.length > 0 && deltas.every((delta) => delta <= 0));
}

/** The raw resources a swap actually moves, biggest first. */
function rawSummary(db: GameDatabase, swap: RecipeSwap): string {
  const moved = Object.entries(swap.raw)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 2)
    .map(([item, delta]) => `${signed(delta)} ${itemName(db, item)}`);
  return moved.length === 0 ? 'same ore' : moved.join(' · ');
}

/**
 * What every alternate recipe would do to the plan you have.
 *
 * The board has always let you pick a different recipe, out of a dropdown that
 * listed all hundred and ten of the game's alternates whether or not you had
 * found the hard drive, and said nothing at all about what picking one would
 * cost. Both halves of that are answered here: each swap is priced against the
 * whole plan, and the ones you can build today are kept apart from the ones you
 * would have to go and find.
 *
 * One table rather than two, because two tables sizing their own columns put
 * the same four numbers in four different places.
 */
export function Alternates({
  db,
  swaps,
  unlocks,
}: {
  db: GameDatabase;
  swaps: readonly RecipeSwap[];
  unlocks: UnlockState;
}) {
  const { dispatch } = useBoard();

  /*
   * Ranked across the whole plan rather than grouped by product, because the
   * question this answers is "which one of these should I go after", and that
   * is a single ordering.
   */
  const worth = swaps
    .filter(worthwhile)
    .sort((a, b) => a.machines - b.machines || a.powerMW - b.powerMW);

  if (worth.length === 0) {
    return (
      <Text color="fg.subtle" fontSize="14px" py={4}>
        Nothing else the recipe book offers would build this plan with fewer machines, less power or
        less ore.
      </Text>
    );
  }

  const groups = unlocks.known
    ? [
        {
          key: 'yours',
          title: 'Yours already',
          note: 'the save says you have unlocked these',
          empty: 'Nothing you have unlocked would improve this plan.',
          rows: worth.filter((swap) => unlocks.unlocked(swap.recipe)),
        },
        {
          key: 'locked',
          title: 'Worth going after',
          note: 'what each would be worth to this plan, if you found it',
          empty: null,
          rows: worth.filter((swap) => !unlocks.unlocked(swap.recipe)),
        },
      ].filter((group) => group.rows.length > 0 || group.empty !== null)
    : [{ key: 'all', title: null, note: null, empty: null, rows: worth }];

  return (
    <>
      <TableFrame>
        <thead>
          <tr>
            <Th>Instead of what the plan uses</Th>
            <Th style={{ textAlign: 'end', width: '108px' }}>Machines</Th>
            <Th style={{ textAlign: 'end', width: '108px' }}>Power</Th>
            <Th style={{ width: '260px' }}>Raw</Th>
            <Th style={{ width: '92px' }} />
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.key}>
              {group.title ? (
                <tr>
                  <Td colSpan={5} bg="bg.muted" borderColor="border.default" py={1.5}>
                    <Flex gap={2} align="baseline" wrap="wrap">
                      <Label color="fg">{group.title}</Label>
                      <Text fontSize="12.5px" color="fg.muted">
                        {group.note}
                      </Text>
                    </Flex>
                  </Td>
                </tr>
              ) : null}

              {group.rows.length === 0 ? (
                <tr>
                  <Td colSpan={5} color="fg.muted" fontSize="13.5px">
                    {group.empty}
                  </Td>
                </tr>
              ) : null}

              {group.rows.map((swap) => {
                const lock = unlocks.unlocked(swap.recipe)
                  ? null
                  : describeLock(unlocks.behind(swap.recipe));
                return (
                  <tr key={`${swap.item}:${swap.recipe}`}>
                    <Td>
                      <Text fontSize="14px" fontWeight="600" lineHeight="1.25">
                        {swap.recipeName}
                      </Text>
                      <Text fontFamily="mono" fontSize="11px" color="fg.subtle">
                        {itemName(db, swap.item)}
                        {lock ? ` · needs ${lock}` : ''}
                      </Text>
                    </Td>
                    {/* The sign says which way it goes; status colour stays on the
                        bars, where it does not have to clear a text threshold. */}
                    <NumTd>{signed(swap.machines)}</NumTd>
                    <NumTd color="fg.muted">{signed(swap.powerMW, ' MW')}</NumTd>
                    <Td fontFamily="mono" fontSize="11.5px" color="fg.muted" whiteSpace="nowrap">
                      {rawSummary(db, swap)}
                    </Td>
                    <Td style={{ textAlign: 'end' }}>
                      <Button
                        size="xs"
                        borderRadius="0"
                        bg="bg.muted"
                        color="fg"
                        borderWidth="1px"
                        borderColor="border.default"
                        fontFamily="mono"
                        fontSize="10.5px"
                        letterSpacing="0.1em"
                        textTransform="uppercase"
                        _hover={{ bg: 'steel.100' }}
                        onClick={() =>
                          dispatch({ type: 'chooseRecipe', item: swap.item, recipe: swap.recipe })
                        }
                      >
                        Use it
                      </Button>
                    </Td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </TableFrame>

      <Text fontSize="13px" color="fg.subtle" mt={2.5}>
        Each is priced on its own against the plan above, so two of them do not simply add up — take
        one and the rest are worth re-reading.
      </Text>
    </>
  );
}
