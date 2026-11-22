import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthenticationService } from '../../services/authethication.service';
import { FirstStepsService, firstStepsChoices } from '../../services/first-steps.service';
import { FirstStepsComponent, suggestedCommunities } from './first-steps.component';
import { CommunityGroupsService } from '../../services/community-groups.service';
import { FirstStepsPromptComponent } from './first-steps-prompt.component';

describe('First steps', () => {
  let steps: jasmine.SpyObj<FirstStepsService>;
  let communities: jasmine.SpyObj<CommunityGroupsService>;
  beforeEach(() => {
    steps = jasmine.createSpyObj('FirstStepsService', ['get', 'save', 'catalog', 'skipped', 'skip']);
    steps.catalog.and.returnValue(of(['Andebol', 'Futebol', 'Padel', 'Xadrez']));
    steps.get.and.returnValue(of({ favoriteSports: [], location: 'Braga', needed: true }));
    steps.save.and.returnValue(of({ favoriteSports: ['Padel'], location: 'Porto', needed: false }));
    steps.skipped.and.returnValue(false);
    communities = jasmine.createSpyObj('CommunityGroupsService', ['mine', 'search', 'followCommunity', 'unfollowCommunity']);
    communities.mine.and.returnValue(of([]));
    communities.search.and.returnValue(of({ communities: [], page: 0, hasMore: false } as any));
    communities.followCommunity.and.returnValue(of({ count: 1, following: true }));
    TestBed.configureTestingModule({
      imports: [FirstStepsComponent, FirstStepsPromptComponent],
      providers: [provideRouter([]), { provide: FirstStepsService, useValue: steps },
        { provide: AuthenticationService, useValue: { loggedInPerfilname: 'ana' } },
        { provide: CommunityGroupsService, useValue: communities }]
    });
  });

  it('orders popular sports first and filters the whole catalog', () => {
    expect(firstStepsChoices(['Xadrez', 'Padel', 'Futebol'], '', [])).toEqual(['Futebol', 'Padel']);
    expect(firstStepsChoices(['Xadrez', 'Padel'], 'xa', [])).toEqual(['Xadrez']);
    expect(firstStepsChoices(['Xadrez', 'Padel'], '', ['Xadrez'])[0]).toBe('Xadrez');
  });

  it('saves sports and city, then opens Explore filtered', () => {
    const fixture = TestBed.createComponent(FirstStepsComponent);
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.city).toBe('Braga');
    c.save();
    expect(c.error).toBe('firstSteps.pickOne');
    c.toggle('Padel'); c.city = ' Porto ';
    c.save();
    expect(steps.save).toHaveBeenCalledWith(['Padel'], 'Porto');
    expect(router.navigate).toHaveBeenCalledWith(['/menu/discover'], { queryParams: { sport: 'Padel', city: 'Porto' } });
  });

  it('caps the selection at ten', () => {
    const c = TestBed.createComponent(FirstStepsComponent).componentInstance;
    for (let i = 0; i < 12; i++) c.toggle('S' + i);
    expect(c.selected.length).toBe(10);
  });

  it('prompt shows only when needed and remembers "not now"', () => {
    const fixture = TestBed.createComponent(FirstStepsPromptComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.visible).toBeTrue();
    fixture.componentInstance.later();
    expect(steps.skip).toHaveBeenCalledWith('ana');
    expect(fixture.componentInstance.visible).toBeFalse();
  });

  it('prompt stays hidden when skipped or on error', () => {
    steps.skipped.and.returnValue(true);
    const a = TestBed.createComponent(FirstStepsPromptComponent); a.detectChanges();
    expect(a.componentInstance.visible).toBeFalse();
    expect(steps.get).not.toHaveBeenCalled();
    steps.skipped.and.returnValue(false);
    steps.get.and.returnValue(throwError(() => new Error('x')));
    const b = TestBed.createComponent(FirstStepsPromptComponent); b.detectChanges();
    expect(b.componentInstance.visible).toBeFalse();
  });

  it('after saving, suggests public communities in the chosen sports before exploring', () => {
    communities.mine.and.returnValue(of([{ id: 9 } as any]));
    communities.search.and.returnValue(of({ communities: [
      { id: 9, name: 'Já sou membro', visibility: 'PUBLIC' },
      { id: 3, name: 'Padel Porto', visibility: 'PUBLIC', sport: 'Padel', description: null },
      { id: 4, name: 'Privada', visibility: 'PRIVATE' }], page: 0, hasMore: false } as any));
    const fixture = TestBed.createComponent(FirstStepsComponent);
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    c.toggle('Padel');
    c.save();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(c.suggestions?.map(group => group.id)).toEqual([3]);
    c.toggleFollow(3);
    expect(communities.followCommunity).toHaveBeenCalledWith(3);
    expect(c.isFollowed(3)).toBeTrue();
    c.finish();
    expect(router.navigate).toHaveBeenCalledWith(['/menu/discover'], { queryParams: { sport: 'Padel', city: 'Braga' } });
  });

  it('interleaves sports and skips duplicates', () => {
    const a = [{ id: 1, visibility: 'PUBLIC' }, { id: 3, visibility: 'PUBLIC' }];
    const b = [{ id: 4, visibility: 'PUBLIC' }, { id: 1, visibility: 'PUBLIC' }];
    expect(suggestedCommunities([a, b] as any, [], 8).map((g: any) => g.id)).toEqual([1, 4, 3]);
  });

  it('a new account opens first steps by itself, once per browser session', () => {
    sessionStorage.removeItem('jynlo.firstSteps.opened.ana');
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    TestBed.createComponent(FirstStepsPromptComponent).detectChanges();
    expect(navigate).toHaveBeenCalledWith(['/menu/first-steps']);
    navigate.calls.reset();
    TestBed.createComponent(FirstStepsPromptComponent).detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    sessionStorage.removeItem('jynlo.firstSteps.opened.ana');
  });
});
