/** Public-only cancellation message for sharing with guests outside Jynlo.
 * Accept only sport, local time and city. Never include exact addresses,
 * meeting notes, passwords or contact details from private sessions.
 */
export interface PublicSessionCancellation {
  sport?: string | null;
  gameDate?: string | null;
  city?: string | null;
}

function publicLabel(value: string | null | undefined, fallback = ''): string {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80) || fallback;
}

export function sessionCancellationNotice(item: PublicSessionCancellation): string {
  const time = typeof item.gameDate === 'string' ? Date.parse(item.gameDate) : NaN;
  const when = Number.isFinite(time)
    ? new Date(time).toLocaleString('pt-PT', {
        timeZone: 'Europe/Lisbon',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
    : '';
  const description = [
    publicLabel(item.sport, 'desporto'), when, publicLabel(item.city)
  ].filter(Boolean).join(' · ');
  return '⚠️ Sessão cancelada — ' + description +
    '. O organizador cancelou esta sessão e o jogo não se vai realizar. ' +
    'Por favor, não te desloques ao recinto.';
}
