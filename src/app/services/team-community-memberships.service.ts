import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export type TeamCommunityStatus = 'PENDING_TEAM'|'PENDING_COMMUNITY'|'ACTIVE'|'DECLINED';
export interface TeamCommunityMembership {
  id:number; teamId:number; teamName:string; communityId:number; communityName:string;
  status:TeamCommunityStatus;
}
@Injectable({providedIn:'root'})
export class TeamCommunityMembershipsService {
  private readonly base=environment.apiUrl+'/api/team-community-memberships';
  constructor(private readonly http:HttpClient){}
  communityTeams(id:number):Observable<TeamCommunityMembership[]>{
    return this.http.get<TeamCommunityMembership[]>(this.base+'/communities/'+id);
  }
  teamCommunities(id:number):Observable<TeamCommunityMembership[]>{
    return this.http.get<TeamCommunityMembership[]>(this.base+'/teams/'+id);
  }
  invite(communityId:number,teamId:number):Observable<TeamCommunityMembership>{
    return this.http.post<TeamCommunityMembership>(this.base+'/communities/'+communityId+'/invite',{teamId});
  }
  request(teamId:number,communityId:number):Observable<TeamCommunityMembership>{
    return this.http.post<TeamCommunityMembership>(this.base+'/teams/'+teamId+'/request',{communityId});
  }
  respond(id:number,accept:boolean):Observable<TeamCommunityMembership>{
    return this.http.post<TeamCommunityMembership>(this.base+'/'+id+'/'+(accept?'accept':'decline'),{});
  }
  remove(id:number):Observable<void>{
    return this.http.delete<void>(this.base+'/'+id);
  }
}
