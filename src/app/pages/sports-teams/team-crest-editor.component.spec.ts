import { TestBed } from '@angular/core/testing';
import { TeamCrestEditorComponent } from './team-crest-editor.component';

describe('TeamCrestEditorComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TeamCrestEditorComponent]
    }).compileComponents();
  });

  it('derives safe initials from the team name', () => {
    const fixture=TestBed.createComponent(TeamCrestEditorComponent);
    fixture.componentInstance.teamName='Jynlo Futebol Clube';
    expect(fixture.componentInstance.initials).toBe('JFC');
    fixture.componentInstance.customInitials='A&B!';
    expect(fixture.componentInstance.initials).toBe('AB');
  });

  it('rejects invalid foundation years before exporting', () => {
    const fixture=TestBed.createComponent(TeamCrestEditorComponent);
    const component=fixture.componentInstance;
    const emit=spyOn(component.generated,'emit');
    component.year='202!';
    component.save();
    expect(component.error).toContain('quatro algarismos');
    expect(emit).not.toHaveBeenCalled();
  });

  it('does not export when disabled', () => {
    const fixture=TestBed.createComponent(TeamCrestEditorComponent);
    const component=fixture.componentInstance;
    const emit=spyOn(component.generated,'emit');
    component.disabled=true;
    component.save();
    expect(emit).not.toHaveBeenCalled();
  });
});
