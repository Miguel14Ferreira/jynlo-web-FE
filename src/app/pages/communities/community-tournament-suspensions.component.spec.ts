import { of, throwError } from 'rxjs';
import { CommunityGroup } from '../model/community-group';
import { CommunityTournamentSuspensionsComponent } from './community-tournament-suspensions.component';
import { CommunityDisciplineService, CommunityTournamentSuspension } from '../../services/community-discipline.service';

describe('Community tournament suspensions panel', () => {
  const community = {
    id: 7,
    members: [
      { profileId: 10, username: 'owner', fullName: 'Owner', role: 'OWNER' },
      { profileId: 11, username: 'member', fullName: 'Jogador', role: 'MEMBER' },
      { profileId: 12, username: 'admin', fullName: 'Admin', role: 'ADMIN' }
    ]
  } as CommunityGroup;
  const active: CommunityTournamentSuspension = {
    id: 41, communityId: 7, targetProfileId: 11, issuedByProfileId: 10,
    reason: 'Incidente', startsAt: '2020-01-01T00:00:00Z',
    endsAt: '2099-01-01T00:00:00Z', revokedAt: null,
    revokedByProfileId: null, revocationReason: null
  };
  const api = jasmine.createSpyObj<CommunityDisciplineService>(
    'CommunityDisciplineService', [
      'tournamentSuspensions', 'myTournamentSuspensions',
      'issueTournamentSuspension', 'liftTournamentSuspension'
    ]);
  const detector = jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck']);
  let component: CommunityTournamentSuspensionsComponent;

  beforeEach(() => {
    api.tournamentSuspensions.and.returnValue(of([active]));
    api.myTournamentSuspensions.and.returnValue(of([active]));
    api.issueTournamentSuspension.and.returnValue(of(active));
    api.liftTournamentSuspension.and.returnValue(of({
      ...active, revokedAt: '2026-11-06T16:00:00Z',
      revokedByProfileId: 10, revocationReason: 'Revisão'
    }));
    component = new CommunityTournamentSuspensionsComponent(api, detector);
    component.community = community;
    component.canManage = true;
    for (const method of Object.values(api)) {
      if (typeof method === 'function' && (method as jasmine.Spy).calls) {
        (method as jasmine.Spy).calls.reset();
      }
    }
  });

  it('only offers ordinary members as suspension targets', () => {
    expect(component.eligibleMembers.map(member => member.profileId)).toEqual([11]);
    component.targetProfileId = 12;
    component.reason = 'Incidente';
    expect(component.canIssue()).toBeFalse();
  });

  it('checks duration boundaries before accepting a suspension', () => {
    component.targetProfileId = 11;
    component.reason = 'Motivo';
    component.days = 31;
    expect(component.canIssue()).toBeFalse();
    component.days = 0;
    expect(component.canIssue()).toBeFalse();
    component.days = 2;
    expect(component.canIssue()).toBeTrue();
  });

  it('registers a community-scoped suspension and updates the list', () => {
    component.targetProfileId = 11;
    component.days = 3;
    component.reason = '  Comportamento grave  ';
    component.issue();
    expect(api.issueTournamentSuspension).toHaveBeenCalledOnceWith(7, 11, 3, 'Comportamento grave');
    expect(component.suspensions[0].id).toBe(41);
    expect(component.feedback).toContain('Suspensão registada');
    expect(component.targetProfileId).toBeNull();
  });

  it('only managers can issue or lift suspensions', () => {
    component.canManage = false;
    component.targetProfileId = 11;
    component.reason = 'Motivo';
    component.issue();
    component.suspensions = [active];
    component.liftReasons[41] = 'Revisão';
    component.lift(41);
    expect(api.issueTournamentSuspension).not.toHaveBeenCalled();
    expect(api.liftTournamentSuspension).not.toHaveBeenCalled();
  });

  it('loads only the authenticated member history when not a manager', () => {
    component.canManage = false;
    component.load();
    expect(api.myTournamentSuspensions).toHaveBeenCalledOnceWith(7);
    expect(api.tournamentSuspensions).not.toHaveBeenCalled();
  });

  it('lifts an active suspension with an audited reason', () => {
    component.suspensions = [active];
    component.liftReasons[41] = '  Revisão  ';
    component.lift(41);
    expect(api.liftTournamentSuspension).toHaveBeenCalledOnceWith(7, 41, 'Revisão');
    expect(component.suspensions[0].revokedAt).toBeTruthy();
  });

  it('does not claim success on backend rejection', () => {
    api.issueTournamentSuspension.and.returnValue(throwError(() => new Error('forbidden')));
    component.targetProfileId = 11;
    component.reason = 'Motivo';
    component.issue();
    expect(component.error).toContain('Não foi possível');
    expect(component.saving).toBeFalse();
    expect(component.feedback).toBe('');
  });
  it('suggests matching member usernames and requires an explicit selection for suspension', () => {
    component.onMemberQueryChange('mem');
    expect(component.targetProfileId).toBeNull();
    expect(component.suggestedMembers.map(member => member.username)).toEqual(['member']);
    component.selectMember(11);
    expect(component.targetProfileId).toBe(11);
    expect(component.memberQuery).toContain('@member');
    component.onMemberQueryChange('owner');
    expect(component.targetProfileId).toBeNull();
    expect(component.suggestedMembers).toEqual([]);
  });

});
