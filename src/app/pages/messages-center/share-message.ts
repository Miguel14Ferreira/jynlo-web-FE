/** Versioned, validated in-app share cards. Never persist arbitrary URLs, tokens or private IDs. */
export type ShareKind = 'profile' | 'session' | 'community';
export interface ShareChoice { kind: ShareKind; id: string; title: string; subtitle: string; }
export interface SharedMessage extends ShareChoice { caption: string; route: string; }
const MARK = '[JYNLO:SHARE:1]';
const VALID_PROFILE = /^[\p{L}\p{N}_.-]{1,64}$/u;
const VALID_ID = /^[1-9][0-9]{0,14}$/;
const CONTROL = /[\x00-\x1f\x7f]/;
const KINDS: ShareKind[] = ['profile','session','community'];

export function shareRoute(choice: Pick<ShareChoice, 'kind'|'id'>): string | null {
  if (choice.kind === 'profile' && VALID_PROFILE.test(choice.id)) {
    return '/menu/profiles/' + encodeURIComponent(choice.id);
  }
  if (choice.kind === 'session' && VALID_ID.test(choice.id)) return '/sessions/' + choice.id;
  if (choice.kind === 'community' && VALID_ID.test(choice.id)) {
    return '/menu/communities/' + choice.id;
  }
  return null;
}

export function encodeShareMessage(choice: ShareChoice, caption: string): string {
  if (!KINDS.includes(choice.kind) || !shareRoute(choice) || !choice.title.trim()
      || choice.title.length > 110 || CONTROL.test(choice.title)
      || choice.subtitle.length > 120 || CONTROL.test(choice.subtitle)
      || caption.length > 1750 || CONTROL.test(caption)) return '';
  const encoded = MARK + JSON.stringify({ k:choice.kind, i:choice.id, t:choice.title,
    s:choice.subtitle, c:caption });
  return encoded.length <= 2000 ? encoded : '';
}

export function readSharedMessage(text: string | null | undefined): SharedMessage | null {
  if (!text || !text.startsWith(MARK) || text.length > 2000) return null;
  try {
    const data = JSON.parse(text.slice(MARK.length));
    if (!data || typeof data !== 'object' || !KINDS.includes(data.k)
        || typeof data.i !== 'string' || typeof data.t !== 'string'
        || typeof data.s !== 'string' || typeof data.c !== 'string') return null;
    const choice: ShareChoice = {kind:data.k, id:data.i, title:data.t, subtitle:data.s};
    const route = shareRoute(choice);
    if (!route || !choice.title.trim() || choice.title.length > 110
        || choice.subtitle.length > 120 || data.c.length > 1750
        || CONTROL.test(choice.title) || CONTROL.test(choice.subtitle)
        || CONTROL.test(data.c)) return null;
    return { ...choice, caption:data.c, route };
  } catch { return null; }
}
