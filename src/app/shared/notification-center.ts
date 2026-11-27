/** Same rules as the app's notification centre: kind per type, day groups, short times and grouped related alerts. */
export type NotificationKind = 'chat' | 'invite' | 'session' | 'payment' | 'social' | 'tournament' | 'community' | 'venue' | 'other';
export type DayBucket = 'today' | 'yesterday' | 'older';
interface Groupable { id: number; createdAt: string; type?: string | null; subject?: string | null; sessionId?: number | null;
  communityId?: number | null; privateGroupId?: number | null; sportsTeamId?: number | null; relatedUsername?: string | null; postId?: number | null; }
export interface NotificationRow<T> { key: string; items: T[]; lead: T; bucket: DayBucket; }

const KINDS: Record<Exclude<NotificationKind, 'other'>, string[]> = {
  chat: ['CHAT_MESSAGE', 'CALL_INCOMING', 'CALL_MISSED', 'ADMIN_MESSAGE'],
  invite: ['SESSION_INVITE', 'COMMUNITY_INVITE', 'TEAM_MEMBER_INVITE', 'AVAILABILITY_REQUEST', 'AVAILABILITY_REMINDER'],
  session: ['WAITLIST_PROMOTED', 'SESSION_REMOVED', 'SESSION_CANCELLED', 'SESSION_MEETING_POINT_UPDATED', 'SESSION_DETAILS_UPDATED',
    'SESSION_POST_GAME_REVIEW', 'SESSION_REMINDER', 'NEARBY_SESSION', 'COMMUNITY_SESSION_CREATED', 'ATTENDANCE_DISPUTE_ACCEPTED', 'ATTENDANCE_DISPUTE_REJECTED'],
  payment: ['PAYMENT_REMINDER'],
  social: ['SOCIAL_NEW_FOLLOWER', 'SOCIAL_POST_LIKED', 'SOCIAL_POST_COMMENTED', 'SOCIAL_STORY_LIKED', 'SOCIAL_STORY_REPLIED'],
  tournament: ['TOURNAMENT_RESULT', 'TOURNAMENT_LEADER'],
  community: ['COMMUNITY_JOIN_REQUEST', 'COMMUNITY_JOIN_ACCEPTED', 'COMMUNITY_JOIN_REJECTED', 'TEAM_ADMIN_TRANSFER', 'TEAM_ADMIN_ASSIGNED'],
  venue: ['VENUE_BOOKING', 'VENUE_EDIT_DECISION'],
};

export function notificationKind(type: string | null | undefined): NotificationKind {
  const t = (type ?? '').toUpperCase();
  for (const [kind, types] of Object.entries(KINDS)) if (types.includes(t)) return kind as NotificationKind;
  return 'other';
}

function startOfDay(ms: number): number { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }

export function dayBucket(createdAt: string, now = Date.now()): DayBucket {
  const ms = Date.parse(createdAt);
  if (!Number.isFinite(ms)) return 'older';
  const today = startOfDay(now);
  if (ms >= today) return 'today';
  if (ms >= today - 86400000) return 'yesterday';
  return 'older';
}

export function shortTime(createdAt: string, t: (k: string, p?: Record<string, unknown>) => string, locale = 'pt-PT', now = Date.now()): string {
  const ms = Date.parse(createdAt);
  if (!Number.isFinite(ms)) return '';
  const diff = now - ms, bucket = dayBucket(createdAt, now);
  if (bucket === 'today') {
    if (diff < 60000) return t('Agora');
    if (diff < 3600000) return t('Há {{n}} min', { n: Math.floor(diff / 60000) });
    return t('Há {{n}} h', { n: Math.floor(diff / 3600000) });
  }
  const time = new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  if (bucket === 'yesterday') return t('Ontem, {{time}}', { time });
  const sameYear = new Date(ms).getFullYear() === new Date(now).getFullYear();
  return new Date(ms).toLocaleDateString(locale, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

function groupKey(item: Groupable, bucket: DayBucket): string | null {
  const type = (item.type ?? '').toUpperCase();
  if (type === 'CHAT_MESSAGE') return [bucket, 'chat', item.sportsTeamId ?? '', item.privateGroupId ?? '', item.sessionId ?? '',
    item.communityId ?? '', item.relatedUsername || item.subject || ''].join('|');
  if (type === 'SOCIAL_POST_LIKED' && item.postId) return bucket + '|like|' + item.postId;
  return null;
}

export function buildSections<T extends Groupable>(items: T[], now = Date.now()): { id: DayBucket; rows: NotificationRow<T>[] }[] {
  const sorted = [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const sections: Record<DayBucket, NotificationRow<T>[]> = { today: [], yesterday: [], older: [] };
  const byKey = new Map<string, NotificationRow<T>>();
  for (const item of sorted) {
    const bucket = dayBucket(item.createdAt, now);
    const key = groupKey(item, bucket);
    const existing = key ? byKey.get(key) : undefined;
    if (existing) { existing.items.push(item); continue; }
    const row: NotificationRow<T> = { key: key || 'n' + item.id, items: [item], lead: item, bucket };
    if (key) byKey.set(key, row);
    sections[bucket].push(row);
  }
  return (['today', 'yesterday', 'older'] as DayBucket[]).map(id => ({ id, rows: sections[id] })).filter(s => s.rows.length);
}
