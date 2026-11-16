import { of } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { SportsTeamsService } from '../../services/sports-teams.service';
import { TeamCompetitionInvitationsService } from '../../services/team-competition-invitations.service';
import { SportsTeamsComponent } from './sports-teams.component';

describe('Jynlo team creation deep link from competition search',()=>{
 let teams:jasmine.SpyObj<SportsTeamsService>;
 let invitations:jasmine.SpyObj<TeamCompetitionInvitationsService>;
 beforeEach(()=>{
  teams=jasmine.createSpyObj<SportsTeamsService>('SportsTeamsService',['discover','mine']);
  invitations=jasmine.createSpyObj<TeamCompetitionInvitationsService>('TeamCompetitionInvitationsService',['mine']);
  teams.discover.and.returnValue(of([]));
  teams.mine.and.returnValue(of([]));
  invitations.mine.and.returnValue(of([]));
 });
 const open=(create:string|null)=>{
  const route={snapshot:{queryParamMap:{get:(key:string)=>key==='create'?create:null}}} as unknown as ActivatedRoute;
  const component=new SportsTeamsComponent(teams,invitations,route);
  component.ngOnInit();
  return component;
 };
 it('opens the form directly when the caller requests creation',()=>{
  expect(open('1').createExpanded).toBeTrue();
 });
 it('keeps the normal team directory uncluttered without a creation request',()=>{
  expect(open(null).createExpanded).toBeFalse();
  expect(open('0').createExpanded).toBeFalse();
 });
});
