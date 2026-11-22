import { appTranslate } from '../../i18n/i18n.service';
import { CommunityRound, CommunityRoundEntryDraft, CommunitySetScore } from '../model/community-group';

/** Set scoring is appropriate only to these racket disciplines, not all duels. */
const SUPPORTED = new Set(['ténis', 'padel', 'badminton', 'squash',
  'pickleball', 'ténis de mesa', 'ténis de praia'].map(normalize));

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

export function racketSupportsSets(sport: string | null | undefined): boolean {
  return sport != null && SUPPORTED.has(normalize(sport));
}

export function racketUsesPointsPerSet(sport: string | null | undefined): boolean {
  return sport != null && new Set(['badminton', 'squash', 'pickleball', 'ténis de mesa'])
    .has(normalize(sport));
}

export type RacketSide = 'A' | 'B';
export type RacketMatchFormat = 'SINGLES' | 'DOUBLES';

/**
 * Winner is derived exclusively from completed set scores, not from a player's
 * previous W/L selection. Back end repeats these checks and checks W/L consistency.
 */
export function racketMatchWinner(
  entries: Pick<CommunityRoundEntryDraft, 'team'>[],
  format: RacketMatchFormat,
  sets: CommunitySetScore[]
): RacketSide | null {
  const count = format === 'SINGLES' ? 1 : 2;
  if (entries.length !== count * 2
      || entries.filter(e => e.team === 'A').length !== count
      || entries.filter(e => e.team === 'B').length !== count
      || sets.length < 1 || sets.length > 5) return null;
  let a = 0, b = 0;
  for (const set of sets) {
    const x = set.sideA, y = set.sideB;
    if (x == null || y == null || !Number.isInteger(x) || !Number.isInteger(y)
        || x < 0 || y < 0 || x > 99 || y > 99 || x === y) return null;
    if (x > y) a++; else b++;
  }
  return a === b ? null : a > b ? 'A' : 'B';
}

export function recordedRacketMatch(round: CommunityRound): boolean {
  return !!round.matchFormat && racketSupportsSets(round.sport)
    && Array.isArray(round.setScores) && round.setScores.length > 0;
}
