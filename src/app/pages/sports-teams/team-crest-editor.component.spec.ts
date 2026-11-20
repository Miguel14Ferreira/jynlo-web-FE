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

  it('rejects unsupported custom initials before exporting', () => {
    const fixture=TestBed.createComponent(TeamCrestEditorComponent);
    const component=fixture.componentInstance;
    const emit=spyOn(component.generated,'emit');
    component.customInitials='J!NLO';
    component.save();
    expect(component.error).toContain('iniciais');
    expect(emit).not.toHaveBeenCalled();
  });

  it('reopens the exact editable parameters saved with a generated emblem',()=>{
    const fixture=TestBed.createComponent(TeamCrestEditorComponent);
    const component=fixture.componentInstance;
    const saved={version:1,shape:'hex',symbol:'cycling',pattern:'stripes',
      primary:'#112233',secondary:'#ffeeee',textColor:'#ffffff',borderColor:'#004455',
      patternOpacity:55,borderWidth:5,symbolSize:82,symbolY:130,
      showInitials:false,innerBorder:true,initialsSize:42,initialsY:240,
      customInitials:'JYN',caption:'LISBOA'};
    component.savedDesign=JSON.stringify(saved);
    expect(component.loadedFromTeam).toBeTrue();
    expect(component.shape).toBe('hex');
    expect(component.symbol).toBe('cycling');
    expect(component.patternOpacity).toBe(55);
    expect(component.showInitials).toBeFalse();
    expect(component.caption).toBe('LISBOA');
    component.applyPreset('minimal');
    expect(component.shape).toBe('circle');
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
