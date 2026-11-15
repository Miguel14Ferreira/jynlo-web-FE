import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export type CompetitionTeamInvitationType = 'TOURNAMENT' | 'CHAMPIONSHIP';
export interface CompetitionTeamInvitation {
  id: number;
  teamId: number;
  teamName: string;
  communityId: number;
  competitionType: CompetitionTeamInvitationType;
  competitionId: number;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
}

@Injectable({providedIn: 'root'})
export class TeamCompetitionInvitationsService {
  private readonly base = environment.apiUrl + '/api/team-competition-invitations';
  constructor(private readonly http: HttpClient) {}
  list(communityId: number, type: CompetitionTeamInvitationType, competitionId: number):
      Observable<CompetitionTeamInvitation[]> {
    return this.http.get<CompetitionTeamInvitation[]>(
      this.base + '/communities/' + communityId + '/' + type + '/' + competitionId);
  }
  invite(communityId: number, type: CompetitionTeamInvitationType,
         competitionId: number, teamId: number): Observable<CompetitionTeamInvitation> {
    return this.http.post<CompetitionTeamInvitation>(
      this.base + '/communities/' + communityId + '/' + type + '/' + competitionId, {teamId});
  }
  mine(): Observable<CompetitionTeamInvitation[]> {
    return this.http.get<CompetitionTeamInvitation[]>(this.base + '/mine');
  }
  respond(id: number, accept: boolean): Observable<CompetitionTeamInvitation> {
    return this.http.post<CompetitionTeamInvitation>(
      this.base + '/' + id + '/' + (accept ? 'accept' : 'decline'), {});
  }
}
