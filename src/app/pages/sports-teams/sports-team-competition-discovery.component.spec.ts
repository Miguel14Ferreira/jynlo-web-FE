import { of, Subject, throwError } from 'rxjs';
import { fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { TeamCompetitionDiscoveryComponent } from './sports-team-competition-discovery.component';
import { SportsTeamsService, SportsTeam } from '../../services/sports-teams.service';
import { TeamCompetitionApplicationsService, OpenTeamCompetition, TeamCompetitionApplication } from '../../services/team-competition-applications.service';

describe('Jynlo global team competition application safety',()=>{
 let teams:jasmine.SpyObj<SportsTeamsService>;
 let api:jasmine.SpyObj<TeamCompetitionApplicationsService>;
 let component:TeamCompetitionDiscoveryComponent;
 const team:SportsTeam={id:5,slug:'equipa-a',name:'Equipa A',sport:'Futebol',location:null,description:null,
  ownerProfileId:3,feedEnabled:false,chatEnabled:false};
 const tournament:OpenTeamCompetition={id:8,communityId:9,communityName:'Liga A',type:'TOURNAMENT',
  name:'Taça',sport:'Futebol',applicationsOpen:true};
 const pending:TeamCompetitionApplication={id:50,teamId:5,teamName:'Equipa A',communityId:9,
  competitionType:'TOURNAMENT',competitionId:8,status:'PENDING'};
 beforeEach(()=>{
  teams=jasmine.createSpyObj<SportsTeamsService>('SportsTeamsService',['mine','logoSrc']);
  teams.logoSrc.and.callFake(url=>url!=null&&url.startsWith('https://')?url:null);
  api=jasmine.createSpyObj<TeamCompetitionApplicationsService>('TeamCompetitionApplicationsService',
   ['mine','discover','apply']);
  teams.mine.and.returnValue(of([team]));
  api.mine.and.returnValue(of([]));
  api.discover.and.returnValue(of([tournament]));
  const route={snapshot:{queryParamMap:{get:()=>String(team.id)}}} as unknown as ActivatedRoute;
  component=new TeamCompetitionDiscoveryComponent(route,teams,api,{detectChanges:()=>{}} as any);
  component.ngOnInit();
 });
 it('keeps one verified team selection across competition cards',()=>{
  expect(component.selectedTeam).toBe(5);
  expect(component.teamsVerified).toBeTrue();
  component.selectedTeam=null;
  component.apply(tournament);
  expect(api.apply).not.toHaveBeenCalled();
  component.selectedTeam=5;
  api.apply.and.returnValue(of(pending));
  component.apply(tournament);
  expect(api.apply).toHaveBeenCalledOnceWith(9,'TOURNAMENT',8,5);
  expect(component.applicationLabel(tournament,5)).toBe('Pedido em análise');
 });
 it('shows only latest search even when older responses arrive last',()=>{
  const oldResponse=new Subject<OpenTeamCompetition[]>();
  const newResponse=new Subject<OpenTeamCompetition[]>();
  api.discover.and.returnValues(oldResponse.asObservable(),newResponse.asObservable());
  component.query='Futebol';
  component.search();
  component.query='Padel';
  component.search();
  newResponse.next([{...tournament,id:12,name:'Torneio Padel'}]);
  newResponse.complete();
  oldResponse.next([{...tournament,id:11,name:'Torneio antigo'}]);
  oldResponse.complete();
  expect(component.competitions.map(item=>item.name)).toEqual(['Torneio Padel']);
  expect(component.loading).toBeFalse();
 });
 it('does not update competition results after the screen is destroyed',()=>{
  const pending=new Subject<OpenTeamCompetition[]>();
  api.discover.and.returnValue(pending.asObservable());
  component.search();
  component.ngOnDestroy();
  pending.next([{...tournament,id:11}]);
  pending.complete();
  expect(component.competitions).toEqual([]);
 });
 it('shows the official team crest when provided and falls back after an image error',()=>{
  component.mine=[{...team,logoUrl:'https://cdn.example.com/teams/5/crest.png'}];
  expect(component.selectedTeamLogo).toBe('https://cdn.example.com/teams/5/crest.png');
  component.failedLogoUrl=component.selectedTeamLogo;
  expect(component.selectedTeamLogo).toBeNull();
  component.mine=[{...team,logoUrl:null}];
  expect(component.selectedTeamLogo).toBeNull();
 });

 it('does not confuse applications from different communities',()=>{
  component.applications=[{...pending,communityId:12}];
  expect(component.applicationFor(tournament,5)).toBeUndefined();
  expect(component.hasApplication(tournament,5)).toBeFalse();
  api.apply.and.returnValue(of(pending));
  component.apply(tournament);
  expect(api.apply).toHaveBeenCalledOnceWith(9,'TOURNAMENT',8,5);
 });

 it('does not submit twice when a pending request already exists',()=>{
  component.applications=[pending];
  expect(component.applicationLabel(tournament,5)).toBe('Pedido em análise');
  component.apply(tournament);
  expect(api.apply).not.toHaveBeenCalled();
 });
 it('distinguishes approved and declined applications',()=>{
  component.applications=[{...pending,status:'APPROVED'}];
  expect(component.applicationLabel(tournament,5)).toBe('Aprovada · inscrição por confirmar');
  component.applications=[{...pending,status:'DECLINED'}];
  expect(component.applicationLabel(tournament,5)).toBe('Candidatura recusada');
  expect(component.hasApplication(tournament,5)).toBeTrue();
 });
 it('does not record an application response after navigation away',()=>{
  const pendingRequest=new Subject<TeamCompetitionApplication>();
  api.apply.and.returnValue(pendingRequest.asObservable());
  component.apply(tournament);
  expect(component.saving).toBeTrue();
  component.ngOnDestroy();
  pendingRequest.next(pending);
  pendingRequest.complete();
  expect(component.applications).toEqual([]);
  expect(component.notice).toBe('');
 });

 it('keeps verified application state authoritative when an old request completes',()=>{
  const pendingRequest=new Subject<TeamCompetitionApplication>();
  api.apply.and.returnValue(pendingRequest.asObservable());
  component.apply(tournament);
  expect(component.saving).toBeTrue();
  // Simulate a newer validation generation without changing the persisted request.
  (component as any).ownershipVersion++;
  pendingRequest.next(pending);
  pendingRequest.complete();
  expect(component.applications).toEqual([]);
  expect(component.notice).toBe('');
 });

 it('blocks application until previous applications can be verified',()=>{
  component.applicationsVerified=false;
  component.apply(tournament);
  expect(api.apply).not.toHaveBeenCalled();
  api.mine.and.returnValue(throwError(()=>Error('offline')));
  component.refreshOwnershipAndApplications();
  expect(component.applicationsVerified).toBeFalse();
  expect(component.error).toContain('pedidos existentes');
  component.apply(tournament);
  expect(api.apply).not.toHaveBeenCalled();
 });
 it('blocks retry when a write failed after possibly reaching backend',()=>{
  api.apply.and.returnValue(throwError(()=>Error('timeout')));
  component.apply(tournament);
  expect(api.apply).toHaveBeenCalledOnceWith(9,'TOURNAMENT',8,5);
  expect(component.applicationsVerified).toBeFalse();
  component.apply(tournament);
  expect(api.apply).toHaveBeenCalledTimes(1);
 });
 it('recovers after verified list refresh without inventing applications',()=>{
  component.applicationsVerified=false;
  api.mine.and.returnValue(of([pending]));
  component.refreshOwnershipAndApplications();
  expect(component.applicationsVerified).toBeTrue();
  expect(component.hasApplication(tournament,5)).toBeTrue();
  component.apply(tournament);
  expect(api.apply).not.toHaveBeenCalled();
 });

 it('exits verification mode after a failed or stalled owner lookup',fakeAsync(()=>{
  teams.mine.and.returnValue(new Subject<SportsTeam[]>().asObservable());
  api.mine.and.returnValue(new Subject<TeamCompetitionApplication[]>().asObservable());
  component.refreshOwnershipAndApplications();
  expect(component.refreshingApplications).toBeTrue();
  tick(12001);
  expect(component.refreshingApplications).toBeFalse();
  expect(component.teamsVerified).toBeFalse();
  expect(component.applicationsVerified).toBeFalse();
  component.apply(tournament);
  expect(api.apply).not.toHaveBeenCalled();
 }));
 it('does not keep competition search spinning when the API stalls',fakeAsync(()=>{
  api.discover.and.returnValue(new Subject<OpenTeamCompetition[]>().asObservable());
  component.search();
  expect(component.loading).toBeTrue();
  tick(12001);
  expect(component.loading).toBeFalse();
  expect(component.searchError).toBeTrue();
  expect(component.error).toContain('demorou demasiado');
 }));
 it('does not trust late ownership results after the route was closed',()=>{
  const old=new Subject<SportsTeam[]>();
  teams.mine.and.returnValue(old.asObservable());
  component.refreshOwnershipAndApplications();
  component.ngOnDestroy();
  old.next([team]);old.complete();
  expect(component.teamsVerified).toBeFalse();
 });
 it('blocks applications when the competition has closed registrations',()=>{
  component.selectedTeam=5;
  component.apply({...tournament,applicationsOpen:false});
  expect(api.apply).not.toHaveBeenCalled();
  expect(component.applicationsVerified).toBeTrue();
 });
});
