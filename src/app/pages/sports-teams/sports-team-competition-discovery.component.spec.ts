import { of, throwError } from 'rxjs';
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
  teams=jasmine.createSpyObj<SportsTeamsService>('SportsTeamsService',['mine']);
  api=jasmine.createSpyObj<TeamCompetitionApplicationsService>('TeamCompetitionApplicationsService',
   ['mine','discover','apply']);
  teams.mine.and.returnValue(of([team]));
  api.mine.and.returnValue(of([]));
  api.discover.and.returnValue(of([tournament]));
  const route={snapshot:{queryParamMap:{get:()=>String(team.id)}}} as unknown as ActivatedRoute;
  component=new TeamCompetitionDiscoveryComponent(route,teams,api);
  component.ngOnInit();
 });
 it('does not submit twice when a pending request already exists',()=>{
  component.applications=[pending];
  expect(component.applicationLabel(tournament,5)).toBe('Pedido em análise');
  component.apply(tournament);
  expect(api.apply).not.toHaveBeenCalled();
 });
 it('distinguishes approved and declined applications',()=>{
  component.applications=[{...pending,status:'APPROVED'}];
  expect(component.applicationLabel(tournament,5)).toBe('Candidatura aprovada');
  component.applications=[{...pending,status:'DECLINED'}];
  expect(component.applicationLabel(tournament,5)).toBe('Candidatura recusada');
  expect(component.hasApplication(tournament,5)).toBeTrue();
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
});
