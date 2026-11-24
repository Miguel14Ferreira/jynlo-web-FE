import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export type InboxKind = 'direct' | 'community' | 'session' | 'team';

export interface InboxReference {
  kind: InboxKind;
  id: string;
}

export interface DirectReadReceipt {
  peerUsername: string;
  /** The last message ID the other account confirmed reading; 0 = no receipt. */
  lastReadMessageId: number;
}

export interface InboxSummary extends InboxReference {
  latestMessageId: number | null;
  latestText: string | null;
  latestSender: string | null;
  latestAt: string | null;
  unreadCount: number;
}

export interface ChatSearchHit {
  id: number;
  sender: string;
  text: string;
  createdAt: string | null;
  replyToMessageId?: number | null;
  replyToSender?: string | null;
  replyToText?: string | null;
}

export interface ChatSearchResponse {
  results: ChatSearchHit[];
  hasMore: boolean;
  page: number;
}

@Injectable({ providedIn: 'root' })
export class InboxApiService {
  private readonly url = environment.apiUrl + '/api/messages/inbox';

  constructor(private readonly http: HttpClient) {}

  summaries(conversations: InboxReference[]): Observable<InboxSummary[]> {
    return this.http.post<InboxSummary[]>(this.url + '/summaries', { conversations });
  }

  /** Search persisted messages (not just the 30 messages in the open UI). */
  searchMessages(conversation: InboxReference, query: string, page = 0): Observable<ChatSearchResponse> {
    return this.http.get<ChatSearchResponse>(this.url + '/search', {
      params: { kind: conversation.kind, id: conversation.id, q: query, page }
    });
  }

  /** Bounded 41-message window around a hit, with the same server-side authorization. */
  messageContext(conversation: InboxReference, messageId: number): Observable<ChatSearchHit[]> {
    return this.http.get<ChatSearchHit[]>(this.url + '/context', {
      params: { kind: conversation.kind, id: conversation.id, messageId }
    });
  }

  /** The peer's server-confirmed read cursor, never a delivery inference. */
  directReadReceipt(peerUsername: string): Observable<DirectReadReceipt> {
    return this.http.get<DirectReadReceipt>(
      this.url + '/direct/' + encodeURIComponent(peerUsername) + '/receipt'
    );
  }

  /** Tells the server this conversation is on screen (or not anymore), so it creates no alerts for it. */
  viewing(conversation: InboxReference, open: boolean): Observable<void> {
    return this.http.put<void>(this.url + '/viewing', { kind: conversation.kind, id: conversation.id, open });
  }

  markRead(conversation: InboxReference, lastSeenMessageId: number): Observable<InboxSummary> {
    return this.http.put<InboxSummary>(this.url + '/read', {
      kind: conversation.kind, id: conversation.id, lastSeenMessageId
    });
  }

  /** Private group chats share the same server read cursors (kind=private). */
  privateGroupSummaries(groupIds: number[]): Observable<Array<Omit<InboxSummary, 'kind'> & { kind: 'private' }>> {
    return this.http.post<Array<Omit<InboxSummary, 'kind'> & { kind: 'private' }>>(this.url + '/summaries', {
      conversations: groupIds.slice(0, 150).map(id => ({ kind: 'private', id: String(id) }))
    });
  }

  /** Team chats share the same server read cursors (kind=team). */
  markTeamChatRead(teamId: number, lastSeenMessageId: number): Observable<unknown> {
    return this.http.put(this.url + '/read', { kind: 'team', id: String(teamId), lastSeenMessageId });
  }

  markPrivateGroupRead(groupId: number, lastSeenMessageId: number): Observable<unknown> {
    return this.http.put(this.url + '/read', { kind: 'private', id: String(groupId), lastSeenMessageId });
  }
}
