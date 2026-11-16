import { of, throwError } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { SportsTeamsService } from '../../services/sports-teams.service';
import { TeamCompetitionInvitationsService } from '../../services/team-competition-invitations.service';
import { SportsTeamsComponent } from './sports-teams.component';

describe('Jynlo team creation deep link from competition search',()=>{
 let teams:jasmine.SpyObj<SportsTeamsService>;
 let invitations:jasmine.SpyObj<TeamCompetitionInvitationsService>;
 let router:jasmine.SpyObj<Router>;
 beforeEach(()=>{
  teams=jasmine.createSpyObj<SportsTeamsService>('SportsTeamsService',['discover','mine','joined','create','pendingInvitations','respond']);
  invitations=jasmine.createSpyObj<TeamCompetitionInvitationsService>('TeamCompetitionInvitationsService',['mine']);
  router=jasmine.createSpyObj<Router>('Router',['navigate']);
  router.navigate.and.returnValue(Promise.resolve(true));
  teams.discover.and.returnValue(of([]));
  teams.mine.and.returnValue(of([]));
  teams.joined.and.returnValue(of([]));
  teams.pendingInvitations.and.returnValue(of([]));
  invitations.mine.and.returnValue(of([]));
 });
 const open=(create:string|null)=>{
  const route={snapshot:{queryParamMap:{get:(key:string)=>key==='create'?create:null}}} as unknown as ActivatedRoute;
  const component=new SportsTeamsComponent(teams,invitations,route,router);
  component.ngOnInit();
  return component;
 };
 it('opens the form directly when the caller requests creation',()=>{
  expect(open('1').createExpanded).toBeTrue();
 });
 it('navigates directly to team details after server-confirmed creation',()=>{
  const component=open('1');
  teams.create.and.returnValue(of({
   id:16,slug:'amigos',name:'Amigos',sport:null,location:null,description:null,ownerProfileId:2,
   feedEnabled:false,chatEnabled:false
  }));
  component.draft.name='Amigos';
  component.create();
  expect(router.navigate).toHaveBeenCalledOnceWith(['/menu/teams',16]);
  expect(component.createExpanded).toBeFalse();
 });
 it('presents team roster invitations and opens the team after acceptance',()=>{
  teams.pendingInvitations.and.returnValue(of([{teamId:8,teamName:'Equipa B',status:'INVITED'}]));
  teams.respond.and.returnValue(of(void 0));
  const component=open(null);
  expect(component.teamInvitations.length).toBe(1);
  expect(component.teamInvitationsVerified).toBeTrue();
  component.respondTeam(8,true);
  expect(teams.respond).toHaveBeenCalledOnceWith(8,true);
  expect(router.navigate).toHaveBeenCalledOnceWith(['/menu/teams',8]);
  expect(component.teamResponding).toBeFalse();
 });
 it('does not repeat roster invitation response after ambiguous failure',()=>{
  teams.pendingInvitations.and.returnValue(of([{teamId:8,teamName:'Equipa B',status:'INVITED'}]));
  teams.respond.and.returnValue(throwError(()=>Error('timeout')));
  const component=open(null);
  component.respondTeam(8,false);
  expect(component.teamInvitationsVerified).toBeFalse();
  component.respondTeam(8,false);
  expect(teams.respond).toHaveBeenCalledTimes(1);
 });
 it('lists confirmed joined squads separately from owned teams',()=>{
  teams.joined.and.returnValue(of([{
   id:8,slug:'equipa-b',name:'Equipa B',sport:'Futebol',location:null,description:null,
   ownerProfileId:3,feedEnabled:true,chatEnabled:true
  }]));
  const component=open(null);
  expect(component.joined.map(t=>t.id)).toEqual([8]);
  expect(component.mine).toEqual([]);
 });
 it('separates roster invitations from competition invitations',()=>{
  const component=open(null);
  expect(component.teamInvitations).toEqual([]);
  expect(component.invitations).toEqual([]);
 });
 it('keeps the normal team directory uncluttered without a creation request',()=>{
  expect(open(null).createExpanded).toBeFalse();
  expect(open('0').createExpanded).toBeFalse();
 });
});
