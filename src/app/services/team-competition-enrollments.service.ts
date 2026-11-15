import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export type EnrollmentCompetitionType = 'TOURNAMENT'|'CHAMPIONSHIP';
export interface GlobalTeamCompetitionEntry {
  id:number;globalTeamId:number;communityId:number;competitionId:number;
  competitionType:EnrollmentCompetitionType;name:string;
  confirmedGlobalPlayers:number;message:string;
}
export interface GlobalTeamRosterCandidate {
  profileId:number;username:string;communityMember:boolean;
}
@Injectable({providedIn:'root'})
export class TeamCompetitionEnrollmentsService {
  private readonly base=environment.apiUrl+'/api/team-competition-enrollments';
  constructor(private readonly http:HttpClient){}
  finalize(communityId:number,type:EnrollmentCompetitionType,
           competitionId:number,globalTeamId:number):Observable<GlobalTeamCompetitionEntry>{
    return this.http.post<GlobalTeamCompetitionEntry>(
      this.base+'/communities/'+communityId+'/'+type+'/'+competitionId,{globalTeamId});
  }
  roster(communityId:number,type:EnrollmentCompetitionType,competitionId:number,
         globalTeamId:number):Observable<GlobalTeamRosterCandidate[]>{
    return this.http.get<GlobalTeamRosterCandidate[]>(
      this.base+'/communities/'+communityId+'/'+type+'/'+competitionId+'/teams/'+globalTeamId+'/roster');
  }
  invitePlayers(communityId:number,type:EnrollmentCompetitionType,
                competitionId:number,globalTeamId:number,profileIds:number[]):Observable<{invitationsSent:number}>{
    return this.http.post<{invitationsSent:number}>(
      this.base+'/communities/'+communityId+'/'+type+'/'+competitionId+'/invite-players',
      {globalTeamId,profileIds});
  }
}
