import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export type ChatPollKind = 'session' | 'community' | 'private' | 'team';
export interface ChatPollVoter { username: string; profilePicUrl: string | null; }
export interface ChatPollResult { messageId: number; counts: number[]; total: number; mine: number | null; voters?: ChatPollVoter[][]; }

@Injectable({ providedIn: 'root' })
export class ChatPollService {
  private readonly base = environment.apiUrl + '/api/messages/polls';
  constructor(private readonly http: HttpClient) {}

  private url(kind: ChatPollKind, conversationId: string): string {
    return this.base + '/' + kind + '/' + encodeURIComponent(conversationId);
  }

  results(kind: ChatPollKind, conversationId: string, ids: number[]): Observable<ChatPollResult[]> {
    return this.http.get<ChatPollResult[]>(this.url(kind, conversationId),
      { params: new HttpParams().set('ids', ids.join(',')) });
  }

  vote(kind: ChatPollKind, conversationId: string, messageId: number, option: number | null): Observable<ChatPollResult> {
    const url = this.url(kind, conversationId) + '/' + messageId;
    return option === null ? this.http.delete<ChatPollResult>(url) : this.http.put<ChatPollResult>(url, { option });
  }
}
