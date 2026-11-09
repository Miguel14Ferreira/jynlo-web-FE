import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from 'src/environment/environment';
import { SessionDetail } from '../pages/model/session-detail';
import { SessionSummary } from '../pages/model/session-summary';
import { MySessionsResponse } from '../pages/model/my-sessions-response';
import { SessionMessage } from '../pages/model/session-message';
import { CreateSessionRequest } from '../pages/model/create-session-request';
import { SessionParticipant } from '../pages/model/session-participant';

/** A private vote, never exposed to other participants. */
export interface MyVenueRating {
  venueId: number;
  score: number;
  updatedAt: string;
}

/** Positive only: no public player stars or rankings. */
/** Kept private to the organizer. This is not a global player score. */
export type OrganizerExclusionReason =
  'NO_SHOW' | 'UNSPORTING_CONDUCT' | 'DISRESPECTFUL_BEHAVIOUR' | 'ABUSIVE_BEHAVIOUR' | 'OTHER';

export type PlayerComplimentType = 'FAIR_PLAY' | 'GREAT_TEAMMATE' | 'POSITIVE_ENERGY';

export interface PlayerCompliment {
  senderUsername: string;
  recipientUsername: string;
  type: PlayerComplimentType;
  updatedAt: string;
}

export interface SessionSearchFilters {
  query?: string;
  sport?: string;
  city?: string;
  availability?: string;
  privateGame?: boolean;
  freeOnly?: boolean;
  sort?: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  from?: string;
  to?: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface PendingSessionInvite {
  id: number;
  sessionId: number;
  inviterUsername: string;
  createdAt: string;
  /** Only safe session metadata, accessible to the authenticated invitee. */
  sport?: string | null;
  city?: string | null;
  gameDate?: string | null;
  maxParticipants?: number | null;
  participantCount?: number | null;
  status?: 'OPEN' | 'FULL' | 'CANCELLED' | 'COMPLETED' | null;
}

export interface JoinSessionResponse {
  state: 'PARTICIPANT' | 'WAITLISTED';
  waitlistPosition: number | null;
}

export interface SessionOverallRating {
  overallScore: number;
  updatedAt: string;
}

export type SessionTeamScoreSource = 'FORM' | 'EXCEL_POINTS' | 'RANDOM' | 'MANUAL';

export interface SessionTeamPlayer {
  username: string;
  strengthScore: number;
  statsAvailable: boolean;
  games: number;
  wins: number;
  goals: number;
  assists: number;
  /** Guest players are not navigable Jynlo accounts. */
  guest?: boolean;
  displayName?: string;
}

/** Guest names only: never notes, receipt, or private contact details. */
export interface SessionConfirmedGuest {
  id: number;
  name: string;
  teamCode: 'A' | 'B' | null;
}

/** Metadata visible only to viewers authorized to open the session itself. */
export interface SessionContext {
  communities: { id: number; name: string }[];
  seasonGame: boolean;
  seasonName: string | null;
}

/** Optional community membership after a verified, completed game. */
export interface PostGameCommunitySuggestion {
  id: number;
  name: string;
  requiresApproval: boolean;
}
export interface PostGameCommunityJoinResult {
  communityId: number;
  state: 'JOINED' | 'REQUESTED';
}

export interface SessionGuestRequest {
  id: number;
  name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'LINKED' | 'CANCELLED';
  note: string;
  teamCode?: string | null;
}

export interface SessionTeamSuggestion {
  teamA: SessionTeamPlayer[];
  teamB: SessionTeamPlayer[];
  teamAScore: number;
  teamBScore: number;
  playersWithStats: number;
  totalPlayers: number;
}

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  private readonly baseUrl = environment.apiUrl + '/api/sessions';

  constructor(private http: HttpClient) {}

  context(id: number): Observable<SessionContext> {
    return this.http.get<SessionContext>(this.baseUrl + '/' + id + '/context');
  }

  postGameCommunities(id: number): Observable<PostGameCommunitySuggestion[]> {
    return this.http.get<PostGameCommunitySuggestion[]>(
      this.baseUrl + '/' + id + '/post-game-communities');
  }

  joinCommunityAfterGame(id: number, communityId: number): Observable<PostGameCommunityJoinResult> {
    return this.http.post<PostGameCommunityJoinResult>(
      this.baseUrl + '/' + id + '/post-game-communities/' + communityId + '/join', {});
  }

  issueGuestLink(id:number): Observable<{token:string}> {
    return this.http.post<{token:string}>(this.baseUrl+'/'+id+'/guest-link',{});
  }
  /** Names and teams only. The server permits confirmed participants or creator. */
  confirmedGuests(id:number): Observable<SessionConfirmedGuest[]> {
    return this.http.get<SessionConfirmedGuest[]>(this.baseUrl+'/'+id+'/guest-confirmed-guests');
  }

  guestRequests(id:number): Observable<SessionGuestRequest[]> {
    return this.http.get<SessionGuestRequest[]>(this.baseUrl+'/'+id+'/guest-requests');
  }
  reviewGuestRequest(id:number,requestId:number,approve:boolean): Observable<SessionGuestRequest> {
    return this.http.post<SessionGuestRequest>(
      this.baseUrl+'/'+id+'/guest-requests/'+requestId+'/decision',{approve});
  }

  cancelGuestRequest(id:number,requestId:number): Observable<SessionGuestRequest> {
    return this.http.post<SessionGuestRequest>(
      this.baseUrl+'/'+id+'/guest-requests/'+requestId+'/cancel',{});
  }

  pendingInvites(): Observable<PendingSessionInvite[]> {
    return this.http.get<PendingSessionInvite[]>(environment.apiUrl + '/api/session-invites/pending');
  }

  acceptInvite(sessionId: number, inviteId: number): Observable<JoinSessionResponse> {
    return this.http.post<JoinSessionResponse>(`${this.baseUrl}/${sessionId}/invites/${inviteId}/accept`, null);
  }

  declineInvite(sessionId: number, inviteId: number): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${sessionId}/invites/${inviteId}/decline`, null);
  }

  invitePlayer(sessionId: number, username: string): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(`${this.baseUrl}/${sessionId}/invites`, { username });
  }

  discover(filters: SessionSearchFilters = {}): Observable<SessionSummary[]> {
    let params = new HttpParams();

    if (filters.query?.trim()) {
      params = params.set('query', filters.query.trim());
    }
    if (filters.sport?.trim()) {
      params = params.set('sport', filters.sport.trim());
    }
    if (filters.city?.trim()) {
      params = params.set('city', filters.city.trim());
    }
    if (filters.availability) {
      params = params.set('availability', filters.availability);
    }
    if (filters.privateGame !== undefined) {
      params = params.set('privateGame', String(filters.privateGame));
    }
    if (filters.freeOnly !== undefined) {
      params = params.set('freeOnly', String(filters.freeOnly));
    }
    if (filters.sort) {
      params = params.set('sort', filters.sort);
    }
    if (filters.latitude !== undefined) {
      params = params.set('latitude', String(filters.latitude));
    }
    if (filters.longitude !== undefined) {
      params = params.set('longitude', String(filters.longitude));
    }
    if (filters.radiusKm !== undefined) {
      params = params.set('radiusKm', String(filters.radiusKm));
    }
    if (filters.from) {
      params = params.set('from', filters.from);
    }
    if (filters.to) {
      params = params.set('to', filters.to);
    }
    if (filters.minPrice !== undefined) {
      params = params.set('minPrice', String(filters.minPrice));
    }
    if (filters.maxPrice !== undefined) {
      params = params.set('maxPrice', String(filters.maxPrice));
    }

    return this.http.get<SessionSummary[]>(this.baseUrl, { params });
  }

  detail(id: number): Observable<SessionDetail> {
    return this.http.get<SessionDetail>(this.baseUrl + '/' + id);
  }

  updateCapacity(id: number, maxParticipants: number): Observable<SessionDetail> {
    return this.http.patch<SessionDetail>(
      this.baseUrl + '/' + id + '/capacity', null,
      { params: new HttpParams().set('maxParticipants', String(maxParticipants)) });
  }

  /** Private organiser-only update; the backend enforces ownership and timing. */
  updateMeetingPoint(id: number, instructions: string | null): Observable<SessionDetail> {
    return this.http.patch<SessionDetail>(this.baseUrl + '/' + id + '/meeting-point',
      { meetingPointInstructions: instructions });
  }

  join(id: number, password?: string): Observable<JoinSessionResponse> {
    return this.http.post<JoinSessionResponse>(
      this.baseUrl + '/' + id + '/join',
      { password: password?.trim() || null }
    );
  }

  openRegistration(id: number): Observable<SessionDetail> {
    return this.http.post<SessionDetail>(`${this.baseUrl}/${id}/registration/open`, null);
  }

  leave(id: number): Observable<void> {
    return this.http.post<void>(this.baseUrl + '/' + id + '/leave', null);
  }

  mine(): Observable<MySessionsResponse> {
    return this.http.get<MySessionsResponse>(this.baseUrl + '/mine');
  }

  cancel(id: number): Observable<void> {
    return this.http.post<void>(this.baseUrl + '/' + id + '/cancel', null);
  }

  complete(id: number): Observable<void> {
    return this.http.post<void>(this.baseUrl + '/' + id + '/complete', null);
  }

  reportDidNotOccur(id: number): Observable<void> {
    return this.http.post<void>(
      this.baseUrl + '/' + id + '/problems/not-occurred',
      null
    );
  }

  reportProblem(
    id: number,
    type: 'NOT_OCCURRED' | 'VENUE_PROBLEM' | 'OTHER',
    details?: string
  ): Observable<void> {
    return this.http.post<void>(
      this.baseUrl + '/' + id + '/problems',
      { type, details: details?.trim() || null }
    );
  }

  /** Load feedback that this signed-in player sent after a session. */
  sentCompliments(sessionId: number): Observable<PlayerCompliment[]> {
    return this.http.get<PlayerCompliment[]>(`${this.baseUrl}/${sessionId}/compliments/me`);
  }

  /** Private compliments received by the signed-in player. */
  receivedCompliments(sessionId: number): Observable<PlayerCompliment[]> {
    return this.http.get<PlayerCompliment[]>(`${this.baseUrl}/${sessionId}/compliments/received/me`);
  }

  giveCompliment(sessionId: number, recipientUsername: string, type: PlayerComplimentType): Observable<PlayerCompliment> {
    return this.http.put<PlayerCompliment>(
      `${this.baseUrl}/${sessionId}/compliments/players/${encodeURIComponent(recipientUsername)}/me`,
      { type }
    );
  }

  myVenueRating(sessionId: number): Observable<MyVenueRating | null> {
    return this.http.get<MyVenueRating | null>(
      this.baseUrl + '/' + sessionId + '/venue-rating/me'
    );
  }

  rateVenue(sessionId: number, score: number): Observable<MyVenueRating> {
    return this.http.put<MyVenueRating>(
      this.baseUrl + '/' + sessionId + '/venue-rating/me',
      { score }
    );
  }

  myOverallRating(id: number): Observable<SessionOverallRating | null> {
    return this.http.get<SessionOverallRating | null>(
      this.baseUrl + '/' + id + '/ratings/me'
    );
  }

  rateOverall(id: number, overallScore: number): Observable<SessionOverallRating> {
    return this.http.put<SessionOverallRating>(
      this.baseUrl + '/' + id + '/ratings/me',
      { overallScore }
    );
  }

  messages(id: number): Observable<SessionMessage[]> {
    return this.http.get<SessionMessage[]>(this.baseUrl + '/' + id + '/messages');
  }

  postMessage(id: number, body: string, replyToMessageId?: number): Observable<SessionMessage> {
    return this.http.post<SessionMessage>(
      this.baseUrl + '/' + id + '/messages',
      { body: body.trim(), ...(replyToMessageId ? { replyToMessageId } : {}) }
    );
  }

  editMessage(id: number, messageId: number, text: string): Observable<SessionMessage> {
    return this.http.put<SessionMessage>(this.baseUrl + '/' + id + '/messages/' + messageId, {text});
  }

  deleteMessage(id: number, messageId: number): Observable<SessionMessage> {
    return this.http.delete<SessionMessage>(
      this.baseUrl + '/' + id + '/messages/' + messageId);
  }

  attachmentsAvailable(id: number): Observable<{ available: boolean }> {
    return this.http.get<{ available: boolean }>(
      this.baseUrl + '/' + id + '/messages/attachments/availability');
  }

  sendAttachment(id: number, file: File, caption: string,
                 replyToMessageId?: number): Observable<SessionMessage> {
    const form = new FormData();
    form.append('file', file, file.name);
    if (caption.trim()) form.append('caption', caption.trim());
    if (replyToMessageId) form.append('replyToMessageId', String(replyToMessageId));
    return this.http.post<SessionMessage>(this.baseUrl + '/'
      + id + '/messages/attachments', form);
  }

  downloadAttachment(id: number, messageId: number): Observable<Blob> {
    return this.http.get(this.baseUrl + '/' + id
      + '/messages/attachments/' + messageId, { responseType: 'blob' });
  }

  participants(id: number): Observable<SessionParticipant[]> {
    return this.http.get<SessionParticipant[]>(this.baseUrl + '/' + id + '/participants');
  }

  teamSuggestion(id: number, source: SessionTeamScoreSource = 'FORM'): Observable<SessionTeamSuggestion> {
    return this.http.get<SessionTeamSuggestion>(
      this.baseUrl + '/' + id + '/teams/suggestion',
      { params: new HttpParams().set('source', source) }
    );
  }

  confirmTeams(id: number, source: SessionTeamScoreSource = 'FORM', preview?: SessionTeamSuggestion): Observable<SessionTeamSuggestion> {
    return this.http.post<SessionTeamSuggestion>(
      this.baseUrl + '/' + id + '/teams/confirm',
      (source === 'RANDOM' || source === 'MANUAL') ? { teamA: preview?.teamA.map(player => player.username) ?? [], teamB: preview?.teamB.map(player => player.username) ?? [] } : null,
      { params: new HttpParams().set('source', source) }
    );
  }

  futureExclusionStatus(id: number, participantId: number): Observable<{ excluded: boolean }> {
    return this.http.get<{ excluded: boolean }>(
      this.baseUrl + '/' + id + '/participants/' + participantId + '/future-exclusion'
    );
  }

  excludeFromFutureSessions(
    id: number, participantId: number, reason: OrganizerExclusionReason
  ): Observable<{ excluded: boolean }> {
    return this.http.put<{ excluded: boolean }>(
      this.baseUrl + '/' + id + '/participants/' + participantId + '/future-exclusion', { reason }
    );
  }

  allowFutureSessions(id: number, participantId: number): Observable<{ excluded: boolean }> {
    return this.http.delete<{ excluded: boolean }>(
      this.baseUrl + '/' + id + '/participants/' + participantId + '/future-exclusion'
    );
  }

  removeParticipant(id: number, participantId: number): Observable<void> {
    return this.http.delete<void>(
      this.baseUrl + '/' + id + '/participants/' + participantId
    );
  }

  create(request: CreateSessionRequest, photo?: File): Observable<SessionDetail> {
    if (!photo) {
      return this.http.post<SessionDetail>(this.baseUrl, request);
    }

    const formData = new FormData();
    formData.append(
      'session',
      new Blob([JSON.stringify(request)], { type: 'application/json' })
    );
    formData.append('photo', photo);

    return this.http.post<SessionDetail>(this.baseUrl, formData);
  }
}
