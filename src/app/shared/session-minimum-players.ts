/** Keep the suggested minimum in sync with SessionMinimumPlayers on the API. */
export function suggestedMinimumPlayers(sport: string | null | undefined, capacity: number): number {
  const max = Number.isSafeInteger(capacity) && capacity >= 2 ? capacity : 2;
  const s = (sport || '').trim().toLocaleLowerCase();
  const suggested = /futebol|futsal|basquetebol|basketball/.test(s) ? 6
    : /padel|pádel/.test(s) ? 4 : 2;
  return Math.min(max, suggested);
}

export function missingMinimumPlayers(confirmed: number, minimum: number): number {
  return Math.max(0, minimum - confirmed);
}

/** Players still missing for an open session to happen (0 when the minimum is reached or it is not open). */
export function playersMissingForGame(session: { sport?: string | null; maxParticipants: number; participantCount: number;
  minPlayers?: number | null; status?: string | null }): number {
  const status = (session.status || 'OPEN').toUpperCase();
  if (status !== 'OPEN' && status !== 'FULL') return 0;
  const minimum = session.minPlayers ?? suggestedMinimumPlayers(session.sport, session.maxParticipants);
  return missingMinimumPlayers(session.participantCount, minimum);
}
