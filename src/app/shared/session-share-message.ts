import { appTranslate } from '../i18n/i18n.service';
/**
 * A short game-first invitation. WhatsApp adds its own link preview when
 * supported; do not repeat promotional copy in the message.
 * Only pass fields already authorised for public sharing.
 */
export interface ShareableGame {
  sport?: string | null;
  city?: string | null;
  gameDate?: string | null;
  remainingPlaces?: number | null;
}

export function compactSessionShareMessage(
  session: ShareableGame, locale: 'pt-PT' | 'en-GB'
): string {
  const clean = (v: string | null | undefined): string =>
    (v || '').replace(/[\r\n\t]+/g, ' ').trim();
  const sport = clean(session.sport);
  const city = clean(session.city);
  const english = locale === 'en-GB';
  // WhatsApp clients may render non-BMP emoji as replacement glyphs.
  // A clean, short, labelled text invitation survives browser, share-sheet
  // and chat encodings without losing the meaningful session information.
  const lines = [sport || (english ? 'Sports game' : 'Jogo desportivo')];
  const start = session.gameDate ? Date.parse(session.gameDate) : NaN;
  if (Number.isFinite(start)) {
    lines.push((english ? 'When: ' : 'Quando: ') + new Intl.DateTimeFormat(locale, {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(new Date(start)));
  }
  if (city) lines.push((english ? 'Location: ' : 'Local: ') + city);
  const spots = session.remainingPlaces;
  if (typeof spots === 'number' && Number.isSafeInteger(spots) && spots > 0) {
    lines.push((english ? 'Places: ' : 'Vagas: ') + spots + (english
      ? (spots === 1 ? ' left' : ' left')
      : (spots === 1 ? appTranslate(' disponível') : appTranslate(' disponíveis'))));
  }
  return lines.join('\n');
}
