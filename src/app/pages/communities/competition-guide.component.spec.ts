import { TestBed } from '@angular/core/testing';
import { CompetitionGuideComponent } from './competition-guide.component';

describe('CompetitionGuideComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CompetitionGuideComponent] }).compileComponents();
  });

  function render(canManage = true, individualEnabled = true, teamEnabled = true) {
    const fixture = TestBed.createComponent(CompetitionGuideComponent);
    fixture.componentRef.setInput('canManage', canManage);
    fixture.componentRef.setInput('individualEnabled', individualEnabled);
    fixture.componentRef.setInput('teamEnabled', teamEnabled);
    fixture.componentRef.setInput('sport', 'Futebol');
    fixture.detectChanges();
    return fixture;
  }

  it('keeps each organizer creation action and the guide close action wired to the parent', () => {
    const fixture = render();
    const root = fixture.nativeElement as HTMLElement;
    const individual = jasmine.createSpy('individual');
    const team = jasmine.createSpy('team');
    const close = jasmine.createSpy('close');
    fixture.componentInstance.individualSelected.subscribe(individual);
    fixture.componentInstance.teamSelected.subscribe(team);
    fixture.componentInstance.closeRequested.subscribe(close);
    const buttons = root.querySelectorAll<HTMLButtonElement>('.competition-guide button');
    expect(buttons.length).toBe(3);
    buttons[0].click();
    buttons[1].click();
    buttons[2].click();
    expect(individual).toHaveBeenCalledOnceWith('Futebol');
    expect(team).toHaveBeenCalledOnceWith('Futebol');
    expect(close).toHaveBeenCalledTimes(1);
    expect(root.querySelectorAll('.guide-option').length).toBe(2);
  });

  it('hides creation buttons for a non-organizer and shows disabled notices for disabled sports', () => {
    const guest = render(false);
    expect((guest.nativeElement as HTMLElement).querySelectorAll('.guide-option button').length).toBe(0);
    const disabled = render(true, false, false);
    const root = disabled.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.guide-option button').length).toBe(0);
    expect(root.querySelectorAll('.guide-coming').length).toBe(2);
    expect(root.querySelector('.guide-community-note[role="note"]')).not.toBeNull();
  });
  it('shows the verified individual engine for swimming without offering an unsupported team format', () => {
    const fixture = render();
    const select = (fixture.nativeElement as HTMLElement).querySelector('select') as HTMLSelectElement;
    select.value = 'Natação';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.capabilities.individual).toBe('SWIM_BEST_TIME');
    expect(fixture.componentInstance.capabilities.team).toBe('UNAVAILABLE');
    expect(root.querySelectorAll('.guide-option button').length).toBe(1);
  });

});
