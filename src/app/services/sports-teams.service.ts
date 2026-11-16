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
  logoUrl?: string | null;
  kitPrimary?: string | null;
  kitSecondary?: string | null;
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
export interface TeamPendingPlayerInvitation { profileId:number; username:string; status:'INVITED'; }
export interface SportsTeamPlayerCandidate { profileId:number; username:string; fullName:string|null; }

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
  attachments: Array<{index:number;filename:string;mimeType:string;size:number}>;
}
export interface TeamReactionState { counts: Record<string, number>; mine: string | null; }
export type TeamContentKind = 'chat' | 'feed';

@Injectable({ providedIn: 'root' })
export class SportsTeamsService {
  private readonly url = environment.apiUrl + '/api/teams';
  // In-memory public team preview only: never cache ownership, roster or chat permissions.
  private readonly recentTeams=new Map<number,{team:SportsTeam;at:number}>();
  rememberTeam(team:SportsTeam):void {
    if(!Number.isSafeInteger(team.id)||team.id<=0)return;
    this.recentTeams.set(team.id,{team,at:Date.now()});
    if(this.recentTeams.size>40)this.recentTeams.delete(this.recentTeams.keys().next().value!);
  }
  rememberedTeam(id:number):SportsTeam|null {
    const item=this.recentTeams.get(id);
    if(!item||Date.now()-item.at>120000)return null;
    return item.team;
  }

  constructor(private readonly http: HttpClient) {}

  members(id: number): Observable<SportsTeamMember[]> {
    return this.http.get<SportsTeamMember[]>(this.url + '/' + id + '/members');
  }
  joined(): Observable<SportsTeam[]> {
    return this.http.get<SportsTeam[]>(this.url + '/joined');
  }
  teamPendingInvitations(teamId:number):Observable<TeamPendingPlayerInvitation[]> {
    return this.http.get<TeamPendingPlayerInvitation[]>(this.url+'/'+teamId+'/invitations');
  }
  pendingInvitations(): Observable<SportsTeamInvitation[]> {
    return this.http.get<SportsTeamInvitation[]>(this.url + '/invitations/mine');
  }
  findPlayers(query:string):Observable<SportsTeamPlayerCandidate[]> {
    const term=query.trim();
    if(term.length<2||term.length>80)throw Error('Pesquisa entre 2 e 80 caracteres.');
    return this.http.get<SportsTeamPlayerCandidate[]>(this.url+'/players/search',{
      params:new HttpParams().set('q',term)
    });
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
  reactions(id: number, kind: TeamContentKind, ids: number[]): Observable<Record<number,TeamReactionState>> {
    return this.http.get<Record<number,TeamReactionState>>(this.url+'/'+id+'/'+kind+'/reactions', {
      params: new HttpParams().set('ids', ids.join(','))
    });
  }
  setReaction(id:number, kind:TeamContentKind, contentId:number, emoji:string): Observable<void> {
    return this.http.put<void>(this.url+'/'+id+'/'+kind+'/'+contentId+'/reaction',{emoji});
  }
  removeReaction(id:number, kind:TeamContentKind, contentId:number): Observable<void> {
    return this.http.delete<void>(this.url+'/'+id+'/'+kind+'/'+contentId+'/reaction');
  }
  searchContent(id: number, kind: TeamContentKind, query: string): Observable<TeamContentEntry[]> {
    return this.http.get<TeamContentEntry[]>(this.url + '/' + id + '/' + kind + '/search', {
      params: new HttpParams().set('q', query.trim())
    });
  }
  attachmentsAvailable(id:number, kind:TeamContentKind): Observable<{available:boolean}> {
    return this.http.get<{available:boolean}>(this.url+'/'+id+'/'+kind+'/attachments/availability');
  }
  uploadContentFiles(id:number, kind:TeamContentKind, files:File[], caption:string, replyToId:number|null): Observable<TeamContentEntry> {
    const form=new FormData();
    for(const file of files)form.append('files',file,file.name);
    if(caption.trim())form.append('caption',caption.trim());
    if(replyToId!==null)form.append('replyToMessageId',String(replyToId));
    return this.http.post<TeamContentEntry>(this.url+'/'+id+'/'+kind+'/attachments/batch',form);
  }
  downloadContentFile(id:number, kind:TeamContentKind, contentId:number, index:number): Observable<Blob> {
    return this.http.get(this.url+'/'+id+'/'+kind+'/attachments/'+contentId+'/'+index,{responseType:'blob'});
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
  setKit(id:number, primary:string|null, secondary:string|null):Observable<SportsTeam> {
    return this.http.put<SportsTeam>(this.url+'/'+id+'/kit',{primary,secondary});
  }
  uploadLogo(id:number,file:File):Observable<SportsTeam> {
    const form=new FormData();
    form.append('logo',file,file.name);
    return this.http.put<SportsTeam>(this.url+'/'+id+'/logo',form);
  }
  removeLogo(id:number):Observable<SportsTeam> {
    return this.http.delete<SportsTeam>(this.url+'/'+id+'/logo');
  }
  setFeatures(id: number, input: {feedEnabled?: boolean; chatEnabled?: boolean}): Observable<SportsTeam> {
    return this.http.patch<SportsTeam>(this.url + '/' + id + '/features', input);
  }
}
