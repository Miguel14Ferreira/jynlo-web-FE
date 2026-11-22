import { appTranslate } from '../i18n/i18n.service';
import { SessionDetail } from '../pages/model/session-detail';

/** Result IDs and scores must originate from the authorised official-result API. */
export interface OfficialGameScore {
  sessionId: number;
  roundId: number;
  scoreA: number | null;
  scoreB: number | null;
}

/** Shares only a public final score; never participant names or private details. */
export function publicSessionResultMessage(
  game: SessionDetail | null | undefined, result: OfficialGameScore | null | undefined
): string | null {
  if (!game || game.canSharePublicly !== true || game.status !== 'COMPLETED'
      || !result || result.sessionId !== game.id
      || !Number.isSafeInteger(game.id) || game.id <= 0
      || !Number.isSafeInteger(result.roundId) || result.roundId <= 0
      || !Number.isSafeInteger(result.scoreA) || (result.scoreA ?? -1) < 0
      || !Number.isSafeInteger(result.scoreB) || (result.scoreB ?? -1) < 0) {
    return null;
  }
  const sport = typeof game.sport === 'string' ? game.sport.trim().slice(0, 60) : '';
  return appTranslate('🏆 Resultado oficial Jynlo') + '\n'
    + (sport ? sport + ' · ' : '') + appTranslate('Equipa A {{a}} — {{b}} Equipa B', {a: result.scoreA ?? '', b: result.scoreB ?? ''}) + '\n'
    + 'https://jynlosports.com/sessions/' + game.id;
}
