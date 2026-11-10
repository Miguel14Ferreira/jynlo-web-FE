import { convertToParamMap } from '@angular/router';
import { of, Subject } from 'rxjs';

import { CommunitiesComponent } from './communities.component';
import { CommunityGroup, CommunityInvite } from '../model/community-group';

describe('Community entry and email invite destinations', () => {
  let component: CommunitiesComponent;
  let query: Record<string, string>;

  beforeEach(() => {
    component = Object.create(CommunitiesComponent.prototype) as CommunitiesComponent;
    component.isDetailMode = false;
    component.communities = [];
    component.invites = [];
    component.loading = false;
    component.errorMessage = '';
    query = {};
    (component as any).route = {
      snapshot: {
        paramMap: convertToParamMap({}),
        get queryParamMap() { return convertToParamMap(query); }
      }
    };
  });

  it('shows the onboarding screen only to accounts without memberships', () => {
    expect(component.showMineView()).toBeFalse();
    component.communities = [{ id: 10 } as CommunityGroup];
    expect(component.showMineView()).toBeTrue();
    component.communities = [];
    expect(component.showMineView()).toBeFalse();
  });

  it('keeps exploring and the My Communities view explicitly available', () => {
    component.communities = [{ id: 10 } as CommunityGroup];
    query = { view: 'explore' };
    expect(component.showMineView()).toBeFalse();
    query = { view: 'mine' };
    expect(component.showMineView()).toBeTrue();
    component.communities = [];
    expect(component.showMineView()).toBeTrue();
  });

  it('opens a My Communities discovery-style card on the correct detail route', () => {
    const navigate = jasmine.createSpy('navigate');
    (component as any).router = { navigate };
    const group = {
      id: 42, name: 'CNG', description: 'Grupo de futebol',
      sport: 'Futebol', sports: ['Futebol', 'Futsal'],
      visibility: 'PRIVATE', memberCount: 3,
      photoUrl: null
    } as CommunityGroup;
    component.communities = [group];
    query = { view: 'mine' };

    expect(component.showMineView()).toBeTrue();
    expect(component.communitySports(group)).toEqual(['Futebol', 'Futsal']);
    component.open(group);
    expect(navigate).toHaveBeenCalledOnceWith(['/menu/communities', 42]);
  });

  it('keeps the email invitation inbox visible with additional invite query parameters', () => {
    query = { view: 'mine', invite: '27' };
    expect(component.showMineView()).toBeTrue();
    expect(component.isTargetedInvite({ id: 27 } as CommunityInvite)).toBeTrue();
    expect(component.isTargetedInvite({ id: 26 } as CommunityInvite)).toBeFalse();
    query['invite'] = '27x';
    expect(component.isTargetedInvite({ id: 27 } as CommunityInvite)).toBeFalse();
  });

  it('prioritizes the invite from the email, preserving all other invitations', () => {
    query = { view: 'mine', invite: '27' };
    (component as any).communityService = {
      mine: () => of([]),
      myInvites: () => of([
        { id: 13 }, { id: 27 }, { id: 18 }
      ])
    };
    component.reload();
    expect(component.loading).toBeFalse();
    expect(component.invites.map(invite => invite.id)).toEqual([27, 13, 18]);
    expect(component.showMineView()).toBeTrue();
  });

  it('does not display the welcome view as a false no-membership conclusion while loading', () => {
    const groups = new Subject<CommunityGroup[]>();
    (component as any).communityService = {
      mine: () => groups.asObservable(),
      myInvites: () => of([])
    };
    component.reload();
    expect(component.loading).toBeTrue();
    groups.next([{ id: 10 } as CommunityGroup]);
    groups.complete();
    expect(component.loading).toBeFalse();
    expect(component.showMineView()).toBeTrue();
  });

  it('preserves explicit invite deep links even on a community-detail page', () => {
    query = { view: 'mine', invite: '27' };
    component.isDetailMode = true;
    expect(component.showMineView()).toBeFalse();
  });
});
