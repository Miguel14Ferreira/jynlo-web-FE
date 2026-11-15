import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

/** Global team identity, not the existing community-scoped permanent-team record. */
export interface SportsTeam {
  id: number;
  slug: string;
  name: string;
  sport: string | null;
  location: string | null;
  description: string | null;
  ownerProfileId: number;
  feedEnabled: boolean;
  chatEnabled: boolean;
}

export interface CreateSportsTeam {
  name: string;
  sport?: string | null;
  location?: string | null;
  description?: string | null;
}


export interface SportsTeamMember {
  profileId: number;
  username: string;
  role: 'OWNER' | 'PLAYER';
}
export interface SportsTeamInvitation {
  teamId: number;
  teamName: string;
  status: 'INVITED';
}

/** A trophy is earned only when the server has finalized an undisputed winner. */
export interface TeamChampionshipHonour {
  championshipId: number;
  championshipName: string;
  seasonLabel: string;
  communityId: number;
  communityName: string;
  tournamentId: number | null;
  ownedEventId: number | null;
  competitionName: string;
  format: string;
  sport: string;
  awardedAt: string;
}

export interface TeamCompetitionHistory {
  tournamentId: number;
  tournamentName: string;
  communityId: number;
  communityName: string;
  sport: string | null;
  status: string;
  completedAt: string | null;
  champion: boolean;
  archived: boolean;
}

export interface TeamContentEntry {
  id: number;
  teamId: number;
  username: string;
  body: string;
  createdAt: string;
  replyToId: number | null;
  editedAt: string | null;
  deleted: boolean;
  canManage: boolean;
  canEdit: boolean;
}
export type TeamContentKind = 'chat' | 'feed';

@Injectable({ providedIn: 'root' })
export class SportsTeamsService {
  private readonly url = environment.apiUrl + '/api/teams';
  constructor(private readonly http: HttpClient) {}

  members(id: number): Observable<SportsTeamMember[]> {
    return this.http.get<SportsTeamMember[]>(this.url + '/' + id + '/members');
  }
  pendingInvitations(): Observable<SportsTeamInvitation[]> {
    return this.http.get<SportsTeamInvitation[]>(this.url + '/invitations/mine');
  }
  invite(teamId: number, profileId: number): Observable<void> {
    return this.http.post<void>(this.url + '/' + teamId + '/invitations', {profileId});
  }
  respond(teamId: number, accept: boolean): Observable<void> {
    return this.http.post<void>(this.url + '/' + teamId + '/invitations/' + (accept ? 'accept' : 'decline'), {});
  }
  remove(teamId: number, profileId: number): Observable<void> {
    return this.http.delete<void>(this.url + '/' + teamId + '/members/' + profileId);
  }

  discover(query = ''): Observable<SportsTeam[]> {
    return this.http.get<SportsTeam[]>(this.url, {
      params: new HttpParams().set('q', query.trim())
    });
  }
  mine(): Observable<SportsTeam[]> {
    return this.http.get<SportsTeam[]>(this.url + '/mine');
  }
  honours(id: number): Observable<TeamChampionshipHonour[]> {
    return this.http.get<TeamChampionshipHonour[]>(this.url + '/' + id + '/honours');
  }
  history(id: number): Observable<TeamCompetitionHistory[]> {
    return this.http.get<TeamCompetitionHistory[]>(this.url + '/' + id + '/history');
  }
  detail(id: number): Observable<SportsTeam> {
    return this.http.get<SportsTeam>(this.url + '/' + id);
  }
  create(input: CreateSportsTeam): Observable<SportsTeam> {
    return this.http.post<SportsTeam>(this.url, input);
  }
  content(id: number, kind: TeamContentKind): Observable<TeamContentEntry[]> {
    return this.http.get<TeamContentEntry[]>(this.url + '/' + id + '/' + kind);
  }
  searchContent(id: number, kind: TeamContentKind, query: string): Observable<TeamContentEntry[]> {
    return this.http.get<TeamContentEntry[]>(this.url + '/' + id + '/' + kind + '/search', {
      params: new HttpParams().set('q', query.trim())
    });
  }
  sendContent(id: number, kind: TeamContentKind, body: string, replyToId: number | null = null): Observable<TeamContentEntry> {
    return this.http.post<TeamContentEntry>(this.url + '/' + id + '/' + kind, {body, replyToId});
  }
  editContent(id:number, kind:TeamContentKind, contentId:number, body:string): Observable<TeamContentEntry> {
    return this.http.patch<TeamContentEntry>(this.url+'/'+id+'/'+kind+'/'+contentId,{body});
  }
  deleteContent(id:number, kind:TeamContentKind, contentId:number): Observable<void> {
    return this.http.delete<void>(this.url+'/'+id+'/'+kind+'/'+contentId);
  }
  setFeatures(id: number, input: {feedEnabled?: boolean; chatEnabled?: boolean}): Observable<SportsTeam> {
    return this.http.patch<SportsTeam>(this.url + '/' + id + '/features', input);
  }
}
