import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, map, of } from 'rxjs';
import { JwtHelperService } from '@auth0/angular-jwt';
import { environment } from 'src/environment/environment';
import { ChatReactionEvent, DirectChatRealtimeService } from './direct-chat-realtime.service';

export type ChatReactionKind = 'direct' | 'session' | 'community' | 'private' | 'team';
export interface ChatReactionSummary {
  messageId: number;
  counts: Record<string, number>;
  myEmoji: string | null;
}
export interface ChatReactionParticipant {
  username: string;
  displayName: string;
  profilePicUrl: string | null;
  emoji: string;
  mine: boolean;
}
export const CHAT_REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '👏', '🔥'] as const;

/**
 * Batches all reaction reads triggered by a rendered message list into a
 * single GET per conversation, rather than one HTTP request per message.
 * All changes remain server-authoritative; ambiguous PUTs are never retried.
 */
@Injectable({ providedIn: 'root' })
export class ChatReactionStoreService {
  private readonly base = environment.apiUrl + '/api/messages/reactions';
  private readonly jwt = new JwtHelperService();
  private readonly cache = new Map<string, ChatReactionSummary>();
  private readonly watchers = new Map<string, number>();
  private readonly pending = new Map<string, Set<number>>();
  private readonly busy = new Set<string>();
  private readonly failed = new Set<string>();
  // Per-message generations invalidate an HTTP snapshot whenever a newer
  // server event, write or reconnect supersedes it. Use a global sequence so
  // unwatch/re-watch cannot accidentally reuse a generation.
  private readonly revisions = new Map<string, number>();
  private sequence = 0;
  private scheduled = false;
  private connectedOnce = false;
  private wasConnected = false;
  readonly changed = new BehaviorSubject<number>(0);

  constructor(private readonly http: HttpClient, realtime: DirectChatRealtimeService) {
    realtime.reactions$.subscribe(event => this.applySocketEvent(event));
    realtime.connected$.subscribe(connected => {
      if (!connected) {
        this.wasConnected = false;
        return;
      }
      if (!this.connectedOnce) {
        this.connectedOnce = true;
        this.wasConnected = true;
        return;
      }
      if (this.wasConnected) return; // Duplicate AUTH is not a reconnect.
      this.wasConnected = true;
      this.cache.clear();
      this.failed.clear();
      for (const key of this.watchers.keys()) {
        this.touch(key); // Invalidate any GET from before the outage.
        const [kind, id, rawMessage] = key.split(':');
        this.queue(kind as ChatReactionKind, id, Number(rawMessage));
      }
      this.changed.next(this.changed.value + 1);
    });
  }

  private touch(key: string): number {
    const revision = ++this.sequence;
    this.revisions.set(key, revision);
    return revision;
  }

  private conversation(kind: ChatReactionKind, id: string | number): string {
    return kind + ':' + String(id).toLowerCase();
  }

  private key(kind: ChatReactionKind, id: string | number, messageId: number): string {
    return this.conversation(kind, id) + ':' + messageId;
  }

  get(kind: ChatReactionKind, id: string | number, messageId: number): ChatReactionSummary | undefined {
    return this.cache.get(this.key(kind, id, messageId));
  }

  isBusy(kind: ChatReactionKind, id: string | number, messageId: number): boolean {
    return this.busy.has(this.key(kind, id, messageId));
  }

  hasFailed(kind: ChatReactionKind, id: string | number, messageId: number): boolean {
    return this.failed.has(this.key(kind, id, messageId));
  }

  /** A failed read never hides the button permanently. Retry is user initiated. */
  retry(kind: ChatReactionKind, id: string | number, messageId: number): void {
    const key = this.key(kind, id, messageId);
    if (!this.watchers.has(key) || this.busy.has(key)) return;
    this.failed.delete(key);
    this.queue(kind, String(id).toLowerCase(), messageId);
    this.changed.next(this.changed.value + 1);
  }

  watch(kind: ChatReactionKind, id: string | number, messageId: number): void {
    if (!Number.isSafeInteger(messageId) || messageId <= 0) return;
    const key = this.key(kind, id, messageId);
    this.watchers.set(key, (this.watchers.get(key) || 0) + 1);
    if (!this.cache.has(key)) this.queue(kind, String(id).toLowerCase(), messageId);
  }

  unwatch(kind: ChatReactionKind, id: string | number, messageId: number): void {
    const key = this.key(kind, id, messageId);
    const count = this.watchers.get(key) || 0;
    if (count <= 1) {
      this.watchers.delete(key);
      // Removed/unmounted conversations cannot keep old reaction counts.
      this.cache.delete(key);
      this.failed.delete(key);
      this.revisions.delete(key);
    } else this.watchers.set(key, count - 1);
  }

  private queue(kind: ChatReactionKind, id: string, messageId: number): void {
    const conv = this.conversation(kind, id);
    const batch = this.pending.get(conv) || new Set<number>();
    batch.add(messageId);
    this.pending.set(conv, batch);
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => this.flush());
  }

  private flush(): void {
    this.scheduled = false;
    const pending = [...this.pending.entries()];
    this.pending.clear();
    for (const [conversation, ids] of pending) {
      const separator = conversation.indexOf(':');
      const kind = conversation.slice(0, separator) as ChatReactionKind;
      const id = conversation.slice(separator + 1);
      const active = [...ids].filter(msgId => this.watchers.has(this.key(kind, id, msgId)));
      for (let start = 0; start < active.length; start += 100) {
        const page = active.slice(start, start + 100);
        const revisions = new Map(page.map(msgId => {
          const key = this.key(kind, id, msgId);
          return [key, this.touch(key)] as const;
        }));
        const params = new HttpParams().set('ids', page.join(','));
        this.read(kind, id, page, params).subscribe({
          next: summaries => {
            const byId = new Map(summaries.map(item => [item.messageId, item]));
            for (const msgId of page) {
              const key = this.key(kind, id, msgId);
              // A newer socket event, overlapping GET, mutation or reconnect
              // supersedes this snapshot. Never repaint with older counts.
              if (this.watchers.has(key) && !this.busy.has(key)
                  && this.revisions.get(key) === revisions.get(key)) {
                this.cache.set(key, byId.get(msgId)
                  || { messageId: msgId, counts: {}, myEmoji: null });
                this.failed.delete(key);
              }
            }
            this.changed.next(this.changed.value + 1);
          },
          error: () => {
            // No fictitious aggregate or blind mutation. Surface a retry to the user.
            for (const msgId of page) {
              const key = this.key(kind, id, msgId);
              if (this.watchers.has(key) && this.revisions.get(key) === revisions.get(key)) {
                this.failed.add(key);
              }
            }
            this.changed.next(this.changed.value + 1);
          }
        });
      }
    }
  }

  /** Team chats keep their reactions under /api/teams/{id}/chat: same emojis, different shape. */
  private teamUrl(id: string | number): string {
    return environment.apiUrl + '/api/teams/' + encodeURIComponent(String(id)) + '/chat';
  }

  private read(kind: ChatReactionKind, id: string, page: number[], params: HttpParams): Observable<ChatReactionSummary[]> {
    if (kind !== 'team') return this.http.get<ChatReactionSummary[]>(this.url(kind, id), { params });
    return this.http.get<Record<string, {counts: Record<string, number>; mine: string | null}>>(
      this.teamUrl(id) + '/reactions', { params }).pipe(map(byId => page.map(messageId => {
        const state = byId?.[String(messageId)];
        return { messageId, counts: state?.counts || {}, myEmoji: state?.mine ?? null };
      })));
  }

  private write(kind: ChatReactionKind, id: string | number, messageId: number, current: ChatReactionSummary,
                emoji: string): Observable<ChatReactionSummary> {
    const removing = current.myEmoji === emoji;
    if (kind !== 'team') {
      const url = this.url(kind, id) + '/' + messageId;
      return removing ? this.http.delete<ChatReactionSummary>(url) : this.http.put<ChatReactionSummary>(url, { emoji });
    }
    const url = this.teamUrl(id) + '/' + messageId + '/reaction';
    const counts = { ...current.counts };
    if (current.myEmoji) counts[current.myEmoji] = Math.max(0, (counts[current.myEmoji] || 0) - 1);
    if (!removing) counts[emoji] = (counts[emoji] || 0) + 1;
    for (const key of Object.keys(counts)) if (!counts[key]) delete counts[key];
    const next: ChatReactionSummary = { messageId, counts, myEmoji: removing ? null : emoji };
    return (removing ? this.http.delete<void>(url) : this.http.put<void>(url, { emoji })).pipe(map(() => next));
  }

  /** Fetch names only when a member opens a particular message's reaction details. */
  participants(kind: ChatReactionKind, id: string | number,
      messageId: number): Observable<ChatReactionParticipant[]> {
    if (kind === 'team') return of([]);
    return this.http.get<ChatReactionParticipant[]>(
      this.url(kind, id) + '/' + encodeURIComponent(String(messageId)) + '/participants'
    );
  }

  toggle(kind: ChatReactionKind, id: string | number, messageId: number,
         emoji: string, onError: () => void): void {
    if (!CHAT_REACTION_EMOJIS.includes(emoji as typeof CHAT_REACTION_EMOJIS[number])) return;
    const key = this.key(kind, id, messageId);
    const current = this.cache.get(key);
    if (!current || this.busy.has(key)) return;
    this.busy.add(key);
    const revision = this.touch(key); // Invalidate pre-write GET requests.
    const expectedEmoji = current.myEmoji === emoji ? null : emoji;
    const request = this.write(kind, id, messageId, current, emoji);
    request.subscribe({
      next: result => {
        this.busy.delete(key);
        if (this.revisions.get(key) === revision) {
          // No newer server event has arrived: this persisted write is latest.
          if (this.watchers.has(key)) this.cache.set(key, result);
          this.touch(key);
        } else if (this.watchers.has(key)) {
          // Another actor/socket update raced with the HTTP reply. Fetch the
          // aggregate again rather than trusting either out-of-order payload.
          this.queue(kind, String(id).toLowerCase(), messageId);
        }
        this.changed.next(this.changed.value + 1);
      },
      error: () => {
        this.busy.delete(key);
        const confirmedBySocket = this.revisions.get(key) !== revision
          && this.cache.get(key)?.myEmoji === expectedEmoji;
        // A committed socket confirmation may beat a lost HTTP response.
        // Do not announce a failure when the desired reaction was confirmed.
        if (!confirmedBySocket) onError();
        if (this.watchers.has(key)) this.queue(kind, String(id).toLowerCase(), messageId);
        this.changed.next(this.changed.value + 1);
      }
    });
  }

  private url(kind: ChatReactionKind, id: string | number): string {
    return this.base + '/' + encodeURIComponent(kind) + '/' + encodeURIComponent(String(id));
  }

  private currentUsername(): string {
    try {
      const token = localStorage.getItem('t');
      return token ? (this.jwt.decodeToken(token)?.sub || '').toLowerCase() : '';
    } catch { return ''; }
  }

  private applySocketEvent(event: ChatReactionEvent): void {
    if (!event || !Number.isSafeInteger(event.messageId) || event.messageId <= 0
        || !['direct', 'session', 'community'].includes(event.kind)) return;
    const key = this.key(event.kind, event.conversationId, event.messageId);
    // Ignore unrelated rooms; do not grow revisions for every reaction
    // arriving while no corresponding message is mounted.
    if (!this.watchers.has(key) && !this.busy.has(key)) return;
    this.touch(key); // Invalidate older HTTP GET and mutation acknowledgements.
    const current = this.cache.get(key);
    if (!current) {
      if (this.watchers.has(key)) this.queue(event.kind, event.conversationId, event.messageId);
      return;
    }
    this.failed.delete(key);
    this.cache.set(key, {
      messageId: event.messageId,
      counts: event.counts || {},
      myEmoji: this.currentUsername() === event.actorUsername?.toLowerCase()
        ? event.emoji : current.myEmoji
    });
    this.changed.next(this.changed.value + 1);
  }
}
