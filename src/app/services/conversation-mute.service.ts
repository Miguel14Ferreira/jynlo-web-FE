import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, Subject, tap } from 'rxjs';
import { environment } from 'src/environment/environment';

export type MutableConversationKind = 'direct' | 'community' | 'session' | 'private' | 'team';
export interface MutedConversation { kind: MutableConversationKind; id: string; }

/**
 * Per-account persisted preferences. Never cache this in localStorage:
 * a logout/login or a change on another device must not inherit stale mutes.
 */
@Injectable({ providedIn: 'root' })
export class ConversationMuteService {
  private readonly url = environment.apiUrl + '/api/notifications/me/conversation-mutes';
  private readonly changed = new Subject<void>();
  readonly changes$ = this.changed.asObservable();

  constructor(private readonly http: HttpClient) {}

  list(): Observable<MutedConversation[]> {
    return this.http.get<MutedConversation[]>(this.url);
  }

  set(kind: MutableConversationKind, id: string | number, muted: boolean): Observable<MutedConversation> {
    return this.http.put<MutedConversation>(this.url, {
      kind, id: String(id), muted
    }).pipe(tap(() => this.changed.next()));
  }
}

export function isConversationMuted(
  mutes: ReadonlyArray<MutedConversation> | null | undefined,
  kind: MutableConversationKind, id: string | number
): boolean {
  const key = String(id).toLowerCase();
  return Boolean(mutes?.some(item => item.kind === kind && item.id.toLowerCase() === key));
}
