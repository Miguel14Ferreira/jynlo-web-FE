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
   ['detail','mine','members','honours','history','findPlayers','invite','remove']);
  community=jasmine.createSpyObj<TeamCommunityMembershipsService>('TeamCommunityMembershipsService',
   ['teamCommunities','discover','request','respond','remove']);
  auth=jasmine.createSpyObj<AuthenticationService>('AuthenticationService',['isLoggedIn']);
  auth.loggedInPerfilname='owner';
  auth.isLoggedIn.and.returnValue(true);
  api.detail.and.returnValue(of(team));
  api.mine.and.returnValue(of([team]));
  api.members.and.returnValue(of([owner,player]));
  api.honours.and.returnValue(of([]));
  api.history.and.returnValue(of([]));
  community.teamCommunities.and.returnValue(of([]));
  const route={snapshot:{paramMap:{get:()=>String(team.id)}}} as unknown as ActivatedRoute;
  component=new SportsTeamDetailComponent(route,api,community,auth);
  component.ngOnInit();
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
});
