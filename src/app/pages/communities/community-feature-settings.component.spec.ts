import { TestBed } from '@angular/core/testing';
import { CommunityFeatureSettingsComponent } from './community-feature-settings.component';

describe('CommunityFeatureSettingsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CommunityFeatureSettingsComponent] }).compileComponents();
  });

  async function render(editing = false, saving = false) {
    const fixture = TestBed.createComponent(CommunityFeatureSettingsComponent);
    fixture.componentRef.setInput('editing', editing);
    fixture.componentRef.setInput('saving', saving);
    fixture.componentRef.setInput('draft', {
      rankingsEnabled: true,
      individualTournamentsEnabled: true,
      teamTournamentsEnabled: false
    });
    fixture.detectChanges();
    // Angular template-driven forms apply their initial value and disabled state
    // on a microtask; observe the settled DOM rather than the initial placeholder.
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('shows the management action and existing PT/EN translation keys without editing by default', async () => {
    const fixture = await render();
    const root = fixture.nativeElement as HTMLElement;
    const buttons = root.querySelectorAll<HTMLButtonElement>('button');
    expect(buttons.length).toBe(1);
    expect(root.querySelector('input')).toBeNull();
    const edit = jasmine.createSpy('edit');
    fixture.componentInstance.editRequested.subscribe(edit);
    buttons[0].click();
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it('emits immutable feature draft changes without mutating the parent object', async () => {
    const fixture = await render(true);
    const initial = fixture.componentInstance.draft;
    const captured: any[] = [];
    fixture.componentInstance.draftChange.subscribe(value => captured.push(value));
    const root = fixture.nativeElement as HTMLElement;
    const checkboxes = root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    // 4th: "Destaques do mês" (off unless the community turned it on).
    expect(checkboxes.length).toBe(4);
    expect(Array.from(checkboxes).map(item => item.checked)).toEqual([true,false,true,false]);
    checkboxes[1].click();
    expect(captured.length).toBe(1);
    expect(captured[0].teamTournamentsEnabled).toBeTrue();
    expect(initial.teamTournamentsEnabled).toBeFalse();
  });

  it('keeps save/cancel events and disables all editing while saving', async () => {
    const fixture = await render(true, true);
    const root = fixture.nativeElement as HTMLElement;
    expect(Array.from(root.querySelectorAll<HTMLInputElement>('input')).every(input => input.disabled)).toBeTrue();
    const buttons = root.querySelectorAll<HTMLButtonElement>('button');
    expect(buttons.length).toBe(2);
    expect(Array.from(buttons).every(button => button.disabled)).toBeTrue();
    const events = jasmine.createSpy('save');
    fixture.componentInstance.saveRequested.subscribe(events);
    buttons[0].click();
    expect(events).not.toHaveBeenCalled();
  });

  it('preserves save feedback and error accessibility', async () => {
    const fixture = await render();
    fixture.componentRef.setInput('feedback', 'Guardado');
    fixture.componentRef.setInput('error', 'Erro');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Guardado');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Erro');
  });
});
