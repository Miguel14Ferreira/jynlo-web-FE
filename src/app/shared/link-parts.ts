/** Splits chat text into plain text and clickable web links (http/https only, never javascript: etc.). */
export interface LinkPart { text: string; url: string | null; internal: boolean; }

const LINK = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|(?:^|(?<=\s))jynlosports\.com(?:\/[^\s<>"']*)?)/gi;
const TRAILING = /[.,;:!?)\]}»"']+$/;

export function linkParts(value: string | null | undefined): LinkPart[] {
  const text = value ?? '';
  const parts: LinkPart[] = [];
  let index = 0;
  for (const match of text.matchAll(LINK)) {
    const start = match.index ?? 0;
    let raw = match[0];
    const trailing = raw.match(TRAILING)?.[0] ?? '';
    if (trailing) raw = raw.slice(0, raw.length - trailing.length);
    if (!raw) continue;
    const href = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
    let url: URL | null = null;
    try { url = new URL(href); } catch { url = null; }
    if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) continue;
    if (start > index) parts.push({ text: text.slice(index, start), url: null, internal: false });
    parts.push({ text: raw, url: url.href, internal: /(^|\.)jynlosports\.com$/i.test(url.hostname) });
    index = start + raw.length;
  }
  if (index < text.length) parts.push({ text: text.slice(index), url: null, internal: false });
  return parts.length ? parts : [{ text, url: null, internal: false }];
}
