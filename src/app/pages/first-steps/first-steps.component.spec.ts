import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthenticationService } from '../../services/authethication.service';
import { FirstStepsService, firstStepsChoices } from '../../services/first-steps.service';
import { FirstStepsComponent } from './first-steps.component';
import { FirstStepsPromptComponent } from './first-steps-prompt.component';

describe('First steps', () => {
  let steps: jasmine.SpyObj<FirstStepsService>;
  beforeEach(() => {
    steps = jasmine.createSpyObj('FirstStepsService', ['get', 'save', 'catalog', 'skipped', 'skip']);
    steps.catalog.and.returnValue(of(['Andebol', 'Futebol', 'Padel', 'Xadrez']));
    steps.get.and.returnValue(of({ favoriteSports: [], location: 'Braga', needed: true }));
    steps.save.and.returnValue(of({ favoriteSports: ['Padel'], location: 'Porto', needed: false }));
    steps.skipped.and.returnValue(false);
    TestBed.configureTestingModule({
      imports: [FirstStepsComponent, FirstStepsPromptComponent],
      providers: [provideRouter([]), { provide: FirstStepsService, useValue: steps },
        { provide: AuthenticationService, useValue: { loggedInPerfilname: 'ana' } }]
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
});
