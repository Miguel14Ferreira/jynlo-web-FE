import { of, Subject, throwError } from 'rxjs';
import { CompetitionTeamSearchComponent } from './competition-team-search.component';
import { SportsTeamsService } from '../../services/sports-teams.service';
import { TeamCommunityMembershipsService } from '../../services/team-community-memberships.service';
import { TeamCompetitionInvitationsService } from '../../services/team-competition-invitations.service';

describe('Jynlo competition team invitations — verified previous requests', () => {
  let component: CompetitionTeamSearchComponent;
  let teams: jasmine.SpyObj<SportsTeamsService>;
  let memberships: jasmine.SpyObj<TeamCommunityMembershipsService>;
  let invitations: jasmine.SpyObj<TeamCompetitionInvitationsService>;

  beforeEach(() => {
    teams = jasmine.createSpyObj<SportsTeamsService>('SportsTeamsService', ['discover']);
    memberships = jasmine.createSpyObj<TeamCommunityMembershipsService>(
      'TeamCommunityMembershipsService', ['communityTeams']);
    invitations = jasmine.createSpyObj<TeamCompetitionInvitationsService>(
      'TeamCompetitionInvitationsService', ['list', 'invite']);
    memberships.communityTeams.and.returnValue(of([]));
    invitations.list.and.returnValue(of([]));
    component = new CompetitionTeamSearchComponent(teams, invitations, memberships);
    component.communityId = 7;
    component.competitionId = 8;
    component.type = 'TOURNAMENT';
    component.ngOnChanges();
    component.results = [{id:15,name:'Equipa A'} as any];
  });

  it('blocks inviting when previous invitation records cannot be verified', () => {
    component.invitationsVerified = false;
    component.invite(15);
    expect(invitations.invite).not.toHaveBeenCalled();
  });

  it('only submits invitations for teams shown by confirmed results', () => {
    component.invite(99);
    expect(invitations.invite).not.toHaveBeenCalled();
  });

  it('blocks resending an uncertain POST until the previous list is rechecked', () => {
    invitations.invite.and.returnValue(throwError(() => Error('timeout')));
    component.invite(15);
    expect(invitations.invite).toHaveBeenCalledTimes(1);
    expect(component.invitationsVerified).toBeFalse();
    expect(component.error).toContain('pode ter sido entregue');
    component.invite(15);
    expect(invitations.invite).toHaveBeenCalledTimes(1);
    invitations.list.and.returnValue(of([]));
    component.refreshInvitations();
    expect(component.invitationsVerified).toBeTrue();
  });

  it('does not trust an obsolete invitation inventory response', () => {
    const old = new Subject<any[]>();
    invitations.list.and.returnValues(old.asObservable(), of([]));
    component.refreshInvitations();
    component.refreshInvitations();
    old.next([{id:1,teamId:15,status:'ACCEPTED'}]);
    old.complete();
    expect(component.invitationsVerified).toBeTrue();
    expect(component.invitations).toEqual([]);
  });
});
