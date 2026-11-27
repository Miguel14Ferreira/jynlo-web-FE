/**
 * Link to share on WhatsApp and other apps. On the production site it points at the API's share page, which
 * gives link previews a real card (sport, place, time, free spots) and sends people straight on to the site.
 * Elsewhere (development, previews) it is the plain site address.
 */
export const SHARE_API = 'https://api.jynlosports.com/api/share';

export function shareCardUrl(kind: 'sessions' | 'communities', id: number, origin: string): string {
  let host = '';
  try { host = new URL(origin).hostname; } catch { /* keep the plain link */ }
  if (host === 'jynlosports.com' || host === 'www.jynlosports.com') return `${SHARE_API}/${kind}/${id}`;
  const path = kind === 'sessions' ? '/sessions/' : '/menu/communities/';
  return new URL(path + id, origin).toString();
}
