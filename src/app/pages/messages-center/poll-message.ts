/**
 * "Sondagem": a group-chat question with 2–6 options. Same envelope as the
 * server (ChatPoll.java): `[JYNLO:POLL:1]<question>\n<option>\n<option>…`.
 */
export const POLL_PREFIX = '[JYNLO:POLL:1]';
export const POLL_MAX_QUESTION = 140;
export const POLL_MAX_OPTION = 60;
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 6;

export interface ChatPollContent { question: string; options: string[]; }

const CONTROL = /[\u0000-\u001f\u007f]/;

function clean(question: string, options: string[]): ChatPollContent | null {
  const q = (question || '').trim();
  const opts = (options || []).map(option => (option || '').trim()).filter(option => option.length > 0);
  if (!q || q.length > POLL_MAX_QUESTION || CONTROL.test(q)) return null;
  if (opts.length < POLL_MIN_OPTIONS || opts.length > POLL_MAX_OPTIONS) return null;
  const seen = new Set<string>();
  for (const option of opts) {
    const key = option.toLocaleLowerCase('pt-PT');
    if (option.length > POLL_MAX_OPTION || CONTROL.test(option) || seen.has(key)) return null;
    seen.add(key);
  }
  return { question: q, options: opts };
}

/** Encoded text, or '' when the poll is not valid (empty options are dropped). */
export function encodePoll(question: string, options: string[]): string {
  const poll = clean(question, options);
  return poll ? POLL_PREFIX + [poll.question, ...poll.options].join('\n') : '';
}

export function readPoll(text: string | null | undefined): ChatPollContent | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith(POLL_PREFIX)) return null;
  const lines = trimmed.slice(POLL_PREFIX.length).split(/\r\n|\r|\n/);
  const options = lines.slice(1);
  if (options.some(option => option.trim().length === 0)) return null;
  return clean(lines[0], options);
}

export function isPollText(text: string | null | undefined): boolean {
  return typeof text === 'string' && text.trim().startsWith(POLL_PREFIX);
}

/** Ready-made polls for a game (texts are translated when applied). */
export const POLL_TEMPLATES: { question: string; options: string[] }[] = [
  { question: 'Quem leva o quê?', options: ['Levo bola', 'Levo coletes', 'Levo água'] },
  { question: 'Contamos contigo?', options: ['Vou', 'Talvez', 'Não posso'] },
  { question: 'Que dia dá mais jeito?', options: ['Sábado', 'Domingo'] }
];
