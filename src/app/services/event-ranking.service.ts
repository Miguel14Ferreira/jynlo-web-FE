import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export type EventRankingKind = 'TIME' | 'SCORE' | 'POSITION';
export interface EventRankingPlaced { participantId: number; name: string; value: number | null; place: number | null; points: number; didNotFinish: boolean; }
export interface EventRankingEvent { id: number; name: string; heldOn: string | null; results: EventRankingPlaced[]; }
export interface EventRankingRow { position: number; participantId: number; name: string; points: number; events: number; wins: number; podiums: number; best: number | null; }
export interface EventRankingOverview {
  tournamentId: number; status: string; valueKind: EventRankingKind; pointsByPlace: number[]; canManage: boolean;
  participants: { id: number; name: string }[]; events: EventRankingEvent[]; table: EventRankingRow[];
}
export interface EventRankingResultInput { participantId: number; value: number | null; position: number | null; didNotFinish: boolean; }

/** "Classificação por provas" API. */
@Injectable({ providedIn: 'root' })
export class EventRankingService {
  constructor(private readonly http: HttpClient) {}

  private url(communityId: number, tournamentId: number): string {
    return environment.apiUrl + '/api/communities/' + communityId + '/tournaments/' + tournamentId + '/event-ranking';
  }
  overview(c: number, t: number): Observable<EventRankingOverview> { return this.http.get<EventRankingOverview>(this.url(c, t)); }
  setKind(c: number, t: number, valueKind: EventRankingKind): Observable<EventRankingOverview> {
    return this.http.put<EventRankingOverview>(this.url(c, t) + '/value-kind', { valueKind });
  }
  setPoints(c: number, t: number, pointsByPlace: string): Observable<EventRankingOverview> {
    return this.http.put<EventRankingOverview>(this.url(c, t) + '/points', { pointsByPlace });
  }
  saveEvent(c: number, t: number, eventId: number | null, body: { name: string; heldOn: string | null; results: EventRankingResultInput[] }): Observable<EventRankingOverview> {
    return eventId
      ? this.http.put<EventRankingOverview>(this.url(c, t) + '/events/' + eventId, body)
      : this.http.post<EventRankingOverview>(this.url(c, t) + '/events', body);
  }
  deleteEvent(c: number, t: number, eventId: number): Observable<EventRankingOverview> {
    return this.http.delete<EventRankingOverview>(this.url(c, t) + '/events/' + eventId);
  }
  complete(c: number, t: number): Observable<EventRankingOverview> {
    return this.http.post<EventRankingOverview>(this.url(c, t) + '/complete', {});
  }
}
