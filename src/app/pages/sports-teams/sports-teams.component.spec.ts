import { of } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { SportsTeamsService } from '../../services/sports-teams.service';
import { TeamCompetitionInvitationsService } from '../../services/team-competition-invitations.service';
import { SportsTeamsComponent } from './sports-teams.component';

describe('Jynlo team creation deep link from competition search',()=>{
 let teams:jasmine.SpyObj<SportsTeamsService>;
 let invitations:jasmine.SpyObj<TeamCompetitionInvitationsService>;
 let router:jasmine.SpyObj<Router>;
 beforeEach(()=>{
  teams=jasmine.createSpyObj<SportsTeamsService>('SportsTeamsService',['discover','mine','create']);
  invitations=jasmine.createSpyObj<TeamCompetitionInvitationsService>('TeamCompetitionInvitationsService',['mine']);
  router=jasmine.createSpyObj<Router>('Router',['navigate']);
  router.navigate.and.returnValue(Promise.resolve(true));
  teams.discover.and.returnValue(of([]));
  teams.mine.and.returnValue(of([]));
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
 it('keeps the normal team directory uncluttered without a creation request',()=>{
  expect(open(null).createExpanded).toBeFalse();
  expect(open('0').createExpanded).toBeFalse();
 });
});
