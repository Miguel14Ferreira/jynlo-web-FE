import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export type MessageMode = 'DIRECT' | 'REQUEST' | 'PENDING' | 'RECEIVED' | 'NOT_ALLOWED';
export interface MessageAvailability { mode: MessageMode; reason: string | null; }
export interface IncomingMessageRequest { id: number; username: string; fullName: string | null; profilePicUrl: string | null; text: string; createdAt: string; }
export type MessagePolicy = 'EVERYONE' | 'FOLLOWING' | 'COMMUNITIES';

/** Message requests: writing to someone who is not a friend yet (Instagram style). */
@Injectable({ providedIn: 'root' })
export class MessageRequestsService {
  private readonly url = environment.apiUrl + '/api/messages/requests';
  constructor(private readonly http: HttpClient) {}
  availability(username: string): Observable<MessageAvailability> {
    return this.http.get<MessageAvailability>(this.url + '/availability/' + encodeURIComponent(username));
  }
  send(username: string, text: string): Observable<void> { return this.http.post<void>(this.url, { username, text }); }
  incoming(): Observable<IncomingMessageRequest[]> { return this.http.get<IncomingMessageRequest[]>(this.url); }
  /** Requests I sent that are still waiting (shown in my inbox like a conversation). */
  sent(): Observable<IncomingMessageRequest[]> { return this.http.get<IncomingMessageRequest[]>(this.url + '/sent'); }
  accept(id: number): Observable<void> { return this.http.post<void>(this.url + '/' + id + '/accept', null); }
  decline(id: number): Observable<void> { return this.http.post<void>(this.url + '/' + id + '/decline', null); }
  policy(): Observable<{ policy: MessagePolicy }> { return this.http.get<{ policy: MessagePolicy }>(this.url + '/policy'); }
  setPolicy(policy: MessagePolicy): Observable<{ policy: MessagePolicy }> { return this.http.put<{ policy: MessagePolicy }>(this.url + '/policy', { policy }); }
}
