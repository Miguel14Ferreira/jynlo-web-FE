import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export type TeamChallengeStatus = 'PENDING'|'ACCEPTED'|'DECLINED'|'CANCELLED';
export interface TeamChallenge {
  id: number;
  challengerTeamId: number;
  challengerTeamName: string;
  challengedTeamId: number;
  challengedTeamName: string;
  status: TeamChallengeStatus;
  message: string | null;
  sessionId: number | null;
  createdAt: string;
  respondedAt: string | null;
}

/** Invitations are accepted by the challenged captain; they do not auto-enroll players. */
@Injectable({providedIn:'root'})
export class SportsTeamChallengesService {
  private readonly base=environment.apiUrl+'/api/team-challenges';
  constructor(private readonly http:HttpClient){}
  forTeam(teamId:number):Observable<TeamChallenge[]> {
    return this.http.get<TeamChallenge[]>(this.base+'/teams/'+teamId);
  }
  challenge(teamId:number,challengedTeamId:number,message:string):Observable<TeamChallenge> {
    return this.http.post<TeamChallenge>(this.base+'/teams/'+teamId,{challengedTeamId,message});
  }
  respond(id:number,accept:boolean):Observable<TeamChallenge> {
    return this.http.post<TeamChallenge>(this.base+'/'+id+'/'+(accept?'accept':'decline'),{});
  }
  cancel(id:number):Observable<TeamChallenge> {
    return this.http.post<TeamChallenge>(this.base+'/'+id+'/cancel',{});
  }
  linkSession(id:number,sessionId:number):Observable<TeamChallenge> {
    return this.http.post<TeamChallenge>(this.base+'/'+id+'/session',{sessionId});
  }
}
