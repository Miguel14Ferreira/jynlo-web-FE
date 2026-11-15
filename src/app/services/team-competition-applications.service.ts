import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export type TeamCompetitionKind = 'TOURNAMENT'|'CHAMPIONSHIP';
export interface OpenTeamCompetition {
  id:number;
  communityId:number;
  communityName:string;
  type:TeamCompetitionKind;
  name:string;
  sport:string|null;
  applicationsOpen:boolean;
}
export interface TeamCompetitionApplication {
  id:number;
  teamId:number;
  teamName:string;
  communityId:number;
  competitionType:TeamCompetitionKind;
  competitionId:number;
  status:'PENDING'|'APPROVED'|'DECLINED';
}
@Injectable({providedIn:'root'})
export class TeamCompetitionApplicationsService {
  private readonly base=environment.apiUrl+'/api/team-competition-applications';
  constructor(private readonly http:HttpClient){}
  discover(q='',sport=''):Observable<OpenTeamCompetition[]>{
    return this.http.get<OpenTeamCompetition[]>(this.base+'/discover',{
      params:new HttpParams().set('q',q.trim()).set('sport',sport.trim())
    });
  }
  mine():Observable<TeamCompetitionApplication[]>{
    return this.http.get<TeamCompetitionApplication[]>(this.base+'/mine');
  }
  list(communityId:number,type:TeamCompetitionKind,competitionId:number):Observable<TeamCompetitionApplication[]>{
    return this.http.get<TeamCompetitionApplication[]>(
      this.base+'/communities/'+communityId+'/'+type+'/'+competitionId);
  }
  configure(communityId:number,type:TeamCompetitionKind,competitionId:number,open:boolean):
       Observable<OpenTeamCompetition>{
    return this.http.put<OpenTeamCompetition>(this.base+'/communities/'+communityId+'/'+type+
      '/'+competitionId+'/open',{open});
  }
  apply(communityId:number,type:TeamCompetitionKind,competitionId:number,teamId:number):
       Observable<TeamCompetitionApplication>{
    return this.http.post<TeamCompetitionApplication>(this.base+'/communities/'+communityId+
      '/'+type+'/'+competitionId,{teamId});
  }
  decide(id:number,approve:boolean):Observable<TeamCompetitionApplication>{
    return this.http.post<TeamCompetitionApplication>(this.base+'/'+id+
      '/'+(approve?'approve':'decline'),{});
  }
}
