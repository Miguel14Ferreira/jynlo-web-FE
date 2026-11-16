import { of, Subject, throwError } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { AuthenticationService } from '../../services/authethication.service';
import { TeamCommunityMembershipsService } from '../../services/team-community-memberships.service';
import { SportsTeamsService, SportsTeam, SportsTeamMember } from '../../services/sports-teams.service';
import { SportsTeamDetailComponent } from './sports-team-detail.component';

describe('Jynlo team profile — audit of real actions',()=>{
 let api:jasmine.SpyObj<SportsTeamsService>;
 let community:jasmine.SpyObj<TeamCommunityMembershipsService>;
 let auth:jasmine.SpyObj<AuthenticationService>;
 let component:SportsTeamDetailComponent;
 const team:SportsTeam={id:5,slug:'club-a',name:'Clube A',sport:'Futebol',location:null,description:null,
  ownerProfileId:2,chatEnabled:true,feedEnabled:true};
 const owner:SportsTeamMember={profileId:2,username:'Owner',role:'OWNER'};
 const player:SportsTeamMember={profileId:3,username:'Jogador',role:'PLAYER'};
 beforeEach(()=>{
  api=jasmine.createSpyObj<SportsTeamsService>('SportsTeamsService',
   ['detail','mine','members','honours','history','findPlayers','invite','remove','teamPendingInvitations','rememberedTeam','setKit','uploadLogo','removeLogo','rememberTeam']);
  community=jasmine.createSpyObj<TeamCommunityMembershipsService>('TeamCommunityMembershipsService',
   ['teamCommunities','discover','request','respond','remove']);
  auth=jasmine.createSpyObj<AuthenticationService>('AuthenticationService',['isLoggedIn']);
  auth.loggedInPerfilname='owner';
  auth.isLoggedIn.and.returnValue(true);
  api.rememberedTeam.and.returnValue(null);
  api.detail.and.returnValue(of(team));
  api.mine.and.returnValue(of([team]));
  api.members.and.returnValue(of([owner,player]));
  api.teamPendingInvitations.and.returnValue(of([]));
  api.honours.and.returnValue(of([]));
  api.history.and.returnValue(of([]));
  community.teamCommunities.and.returnValue(of([]));
  const route={snapshot:{paramMap:{get:()=>String(team.id)}}} as unknown as ActivatedRoute;
  component=new SportsTeamDetailComponent(route,api,community,auth,{detectChanges:()=>{}} as any);
  component.ngOnInit();
 });
 afterEach(()=>component.ngOnDestroy());
 it('renders known public team data before a slow detail request finishes',()=>{
  const later=new Subject<SportsTeam>();
  api.rememberedTeam.and.returnValue(team);
  api.detail.and.returnValue(later.asObservable());
  const copy=new SportsTeamDetailComponent(
   {snapshot:{paramMap:{get:()=>String(team.id)}}} as unknown as ActivatedRoute,
   api,community,auth,{detectChanges:()=>{}} as any
  );
  copy.ngOnInit();
  expect(copy.team?.name).toBe('Clube A');
  expect(copy.rosterVerified).toBeFalse();
  expect(copy.isMember).toBeFalse();
  later.next(team);later.complete();
  expect(copy.rosterVerified).toBeTrue();
  copy.ngOnDestroy();
 });
 it('allows owner to configure kit colors and displays returned branding',()=>{
  const updated={...team,kitPrimary:'#1144AA',kitSecondary:'#FFFFFF',logoUrl:null};
  api.setKit.and.returnValue(of(updated));
  component.kitPrimary='#1144aa';component.kitSecondary='#ffffff';
  component.saveTeamKit();
  expect(api.setKit).toHaveBeenCalledOnceWith(5,'#1144aa','#ffffff');
  expect(component.team?.kitPrimary).toBe('#1144AA');
  expect(component.brandingSaving).toBeFalse();
  expect(api.rememberTeam).toHaveBeenCalledOnceWith(updated);
 });
 it('does not let non-owners change a kit or upload a crest',()=>{
  component.isOwner=false;
  component.saveTeamKit();
  const input=document.createElement('input');
  input.type='file';
  component.uploadTeamLogo({target:input} as unknown as Event);
  expect(api.setKit).not.toHaveBeenCalled();
  expect(api.uploadLogo).not.toHaveBeenCalled();
 });
 it('rejects oversized logos before sending requests',()=>{
  const file=new File([new Uint8Array(5*1024*1024+1)],'large.png',{type:'image/png'});
  const input=document.createElement('input');
  input.type='file';
  Object.defineProperty(input,'files',{value:[file],configurable:true});
  component.uploadTeamLogo({target:input} as unknown as Event);
  expect(api.uploadLogo).not.toHaveBeenCalled();
  expect(component.feedback).toContain('5 MB');
 });
 it('keeps branding update uncertain after a network failure',()=>{
  api.setKit.and.returnValue(throwError(()=>Error('timeout')));
  component.saveTeamKit();
  expect(component.brandingSaving).toBeFalse();
  expect(component.feedback).toContain('Não foi possível confirmar');
 });
 it('loads ownership and membership case-insensitively from real roster',()=>{
  expect(component.isOwner).toBeTrue();
  expect(component.rosterVerified).toBeTrue();
  expect(component.isMember).toBeTrue();
  expect(component.members.length).toBe(2);
 });
 it('does not enable member content when roster cannot be verified',()=>{
  api.members.and.returnValue(throwError(()=>Error('offline')));
  component.ngOnInit();
  expect(component.rosterVerified).toBeFalse();
  expect(component.isMember).toBeFalse();
 });
 it('finds users and submits only the selected invitation',()=>{
  api.findPlayers.and.returnValue(of([{profileId:4,username:'Novo',fullName:'Novo Jogador'}]));
  api.invite.and.returnValue(of(void 0));
  component.playerQuery='Novo';
  component.searchPlayers();
  expect(component.availablePlayers.length).toBe(1);
  component.invitePlayer(component.availablePlayers[0]);
  expect(api.invite).toHaveBeenCalledOnceWith(5,4);
  expect(component.feedback).toContain('Convite enviado');
 });
 it('ignores obsolete player search responses after changing the query',()=>{
  const oldSearch=new Subject<{profileId:number;username:string;fullName:string|null}[]>();
  const newSearch=new Subject<{profileId:number;username:string;fullName:string|null}[]>();
  api.findPlayers.and.returnValues(oldSearch.asObservable(),newSearch.asObservable());
  component.playerQuery='Ana';
  component.searchPlayers();
  component.playerQuery='Bruno';
  component.invalidatePlayerSearch();
  component.searchPlayers();
  newSearch.next([{profileId:7,username:'Bruno',fullName:null}]);
  newSearch.complete();
  oldSearch.next([{profileId:8,username:'Ana',fullName:null}]);
  oldSearch.complete();
  expect(component.availablePlayers.map(player=>player.username)).toEqual(['Bruno']);
  expect(component.searchingPlayers).toBeFalse();
 });
 it('cannot invite a candidate who was removed by a newer search',()=>{
  api.findPlayers.and.returnValue(of([{profileId:4,username:'Novo',fullName:null}]));
  api.invite.and.returnValue(of(void 0));
  component.playerQuery='Novo';
  component.searchPlayers();
  const candidate=component.availablePlayers[0];
  component.invalidatePlayerSearch();
  component.invitePlayer(candidate);
  expect(api.invite).not.toHaveBeenCalled();
 });
 it('removes only confirmed non-owners after explicit confirmation',()=>{
  const confirmSpy=spyOn(window,'confirm').and.returnValue(true);
  api.remove.and.returnValue(of(void 0));
  // The next authoritative roster read reflects the confirmed removal.
  api.members.and.returnValue(of([owner]));
  component.removePlayer(player);
  expect(confirmSpy).toHaveBeenCalled();
  expect(api.remove).toHaveBeenCalledOnceWith(5,3);
  expect(component.members.map(m=>m.profileId)).toEqual([2]);
  component.removePlayer(owner);
  expect(api.remove).toHaveBeenCalledTimes(1);
 });
 it('leaves a community only after confirmation and owner verification',()=>{
  const membership={id:12,teamId:5,teamName:'Clube A',communityId:9,communityName:'Comunidade A',status:'ACTIVE' as const};
  community.teamCommunities.and.returnValue(of([membership]));
  component.loadCommunities();
  const confirmSpy=spyOn(window,'confirm').and.returnValue(false);
  community.remove.and.returnValue(of(void 0));
  component.leaveCommunity(membership);
  expect(community.remove).not.toHaveBeenCalled();
  confirmSpy.and.returnValue(true);
  component.leaveCommunity(membership);
  expect(community.remove).toHaveBeenCalledOnceWith(12);
  expect(component.feedback).toContain('removida');
 });
 it('blocks further membership actions after a server failure',()=>{
  spyOn(window,'confirm').and.returnValue(true);
  api.remove.and.returnValue(throwError(()=>Error('timeout')));
  component.removePlayer(player);
  expect(component.rosterVerified).toBeFalse();
  expect(component.isMember).toBeFalse();
  expect(component.feedback).toContain('confirmar a remoção');
 });

 it('revokes private panels when the refreshed roster no longer includes the player',()=>{
  auth.loggedInPerfilname='jogador';
  api.members.and.returnValue(of([owner,player]));
  component.refreshRoster();
  expect(component.isMember).toBeTrue();
  api.members.and.returnValue(of([owner]));
  component.refreshRoster();
  expect(component.rosterVerified).toBeTrue();
  expect(component.isMember).toBeFalse();
  expect(component.members.map(m=>m.profileId)).toEqual([2]);
 });
 it('fails closed if the current roster can no longer be verified',()=>{
  api.members.and.returnValue(throwError(()=>new Error('offline')));
  component.refreshRoster();
  expect(component.isMember).toBeFalse();
  expect(component.rosterVerified).toBeFalse();
 });

 it('allows only a confirmed player to leave their own team and revokes private panels',()=>{
  auth.loggedInPerfilname='jogador';
  component.isOwner=false;
  component.isMember=true;
  api.remove.and.returnValue(of(void 0));
  api.members.and.returnValue(of([owner]));
  const confirmSpy=spyOn(window,'confirm').and.returnValue(true);
  component.leaveTeam();
  expect(confirmSpy).toHaveBeenCalled();
  expect(api.remove).toHaveBeenCalledOnceWith(5,3);
  expect(component.isMember).toBeFalse();
  expect(component.members.map(m=>m.profileId)).toEqual([2]);
  expect(component.feedback).toContain('Saíste da equipa');
 });
 it('does not allow a team owner to leave without transferring ownership',()=>{
  spyOn(window,'confirm').and.returnValue(true);
  component.leaveTeam();
  expect(api.remove).not.toHaveBeenCalled();
 });
 it('does not retry an uncertain leave request or retain private permissions',()=>{
  auth.loggedInPerfilname='jogador';
  component.isOwner=false;
  component.isMember=true;
  api.remove.and.returnValue(throwError(()=>new Error('timeout')));
  spyOn(window,'confirm').and.returnValue(true);
  component.leaveTeam();
  expect(component.rosterVerified).toBeFalse();
  expect(component.isMember).toBeFalse();
  expect(component.feedback).toContain('Não foi possível confirmar a saída');
 });

 it('shows verified pending invitations only to a confirmed team owner',()=>{
  api.teamPendingInvitations.and.returnValue(of([{profileId:4,username:'Convidado',status:'INVITED'}]));
  component.loadPendingInvitations();
  expect(component.invitationsVerified).toBeTrue();
  expect(component.pendingPlayers.map(x=>x.username)).toEqual(['Convidado']);
  api.findPlayers.and.returnValue(of([{profileId:4,username:'Convidado',fullName:null}]));
  component.playerQuery='Convidado';
  component.searchPlayers();
  expect(component.availablePlayers).toEqual([]);
 });
 it('blocks new invitations after an uncertain response until verification',()=>{
  api.findPlayers.and.returnValue(of([{profileId:4,username:'Novo',fullName:null}]));
  api.invite.and.returnValue(throwError(()=>Error('timeout')));
  component.playerQuery='Novo';component.searchPlayers();
  component.invitePlayer(component.availablePlayers[0]);
  expect(component.invitationsVerified).toBeFalse();
  expect(component.feedback).toContain('Verifica os convites');
  component.invitePlayer({profileId:4,username:'Novo',fullName:null});
  expect(api.invite).toHaveBeenCalledTimes(1);
 });
 it('cancels only a verified pending invitation after confirmation',()=>{
  api.teamPendingInvitations.and.returnValue(of([{profileId:4,username:'Novo',status:'INVITED'}]));
  component.loadPendingInvitations();
  api.remove.and.returnValue(of(void 0));
  spyOn(window,'confirm').and.returnValue(true);
  component.cancelPendingInvitation(component.pendingPlayers[0]);
  expect(api.remove).toHaveBeenCalledOnceWith(5,4);
  expect(component.feedback).toContain('cancelado');
 });
});
