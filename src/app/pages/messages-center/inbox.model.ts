export type InboxKind = 'direct' | 'community' | 'session';
export type InboxFilter = 'all' | InboxKind | 'recent';

export interface InboxConversation {
  key: string;
  kind: InboxKind;
  id: string | number;
  title: string;
  subtitle: string;
  avatarUrl?: string | null;
  latestText?: string;
  latestAt?: string;
  /** Only WebSocket messages received during this browser visit. Not server read receipts. */
  newThisVisit: number;
  /** Server-sourced persistent unread count; absent only when summaries are unavailable. */
  unreadCount?: number;
  latestMessageId?: number | null;
}

export interface InboxMessage {
  id: number;
  key: string;
  sender: string;
  text: string;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  attachments?: {index: number; filename: string; mimeType: string; size: number}[];
  attachmentName?: string | null;
  attachmentMimeType?: string | null;
  attachmentSize?: number | null;
  replyToMessageId?: number | null;
  replyToSender?: string | null;
  replyToText?: string | null;
}

export function inboxKey(kind: InboxKind, id: string | number): string {
  return kind + ':' + (kind === 'direct' ? String(id).toLowerCase() : String(id));
}

export function mergeInboxMessages(messages: InboxMessage[]): InboxMessage[] {
  const byId = new Map<number, InboxMessage>();
  for (const message of messages) {
    if (Number.isFinite(message.id) && message.id > 0) byId.set(message.id, message);
  }
  // Message IDs are monotonically assigned by the backend within each chat
  // stream. Prefer them over optional/invalid timestamps: a live message
  // without a parseable date must never jump above older history.
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

export function orderInbox(conversations: InboxConversation[]): InboxConversation[] {
  return [...conversations].sort((a, b) => {
    const dateA = a.latestAt ? Date.parse(a.latestAt) || 0 : 0;
    const dateB = b.latestAt ? Date.parse(b.latestAt) || 0 : 0;
    return dateB - dateA || a.title.localeCompare(b.title, 'pt', { sensitivity: 'base' })
      || a.key.localeCompare(b.key);
  });
}

export function matchesInboxSearch(conversation: InboxConversation, term: string): boolean {
  const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const query = fold(term.trim());
  return !query || fold(conversation.title + ' ' + conversation.subtitle + ' ' + (conversation.latestText || '')).includes(query);
}
