/**
 * "Convocatória": a chat message that points to one of the sender's sessions.
 * Same envelope as the server (SessionCallUp.java): `[JYNLO:SESSION:1]<id>`.
 * The server only accepts it from the session organiser while the session is
 * upcoming and open/full; the card always reloads the session from the API.
 */
export const CALLUP_PREFIX = '[JYNLO:SESSION:1]';
const FORMAT = /^\[JYNLO:SESSION:1\]([1-9][0-9]{0,14})$/;

export interface CallUpChoice { id: number; title: string; subtitle: string; }

export function encodeCallUp(id: number): string {
  return Number.isSafeInteger(id) && id > 0 ? CALLUP_PREFIX + id : '';
}

/** Session id of a well-formed call-up, otherwise null. */
export function readCallUp(text: string | null | undefined): number | null {
  const match = typeof text === 'string' ? FORMAT.exec(text.trim()) : null;
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : null;
}

export function isCallUpText(text: string | null | undefined): boolean {
  return typeof text === 'string' && text.trim().startsWith(CALLUP_PREFIX);
}
