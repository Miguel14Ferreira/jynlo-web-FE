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

  it('creates, duplicates, reorders and removes separate editable layers',()=>{
    const component=TestBed.createComponent(TeamCrestEditorComponent).componentInstance;
    component.addLayer('symbol');
    expect(component.layers.length).toBe(1);
    const firstId=component.layers[0].id;
    component.layers[0].symbol='cycling';
    component.addLayer('text');
    component.layers[1].text='LISBOA';
    component.moveLayerOrder(-1);
    expect(component.layers[0].text).toBe('LISBOA');
    component.duplicateLayer();
    expect(component.layers.length).toBe(3);
    expect(new Set(component.layers.map(l=>l.id)).size).toBe(3);
    component.removeLayer();
    expect(component.layers.length).toBe(2);
    component.selectedLayerId=firstId;
    component.removeLayer();
    expect(component.layers.length).toBe(1);
  });

  it('reopens version-one designs without changing their existing appearance',()=>{
    const component=TestBed.createComponent(TeamCrestEditorComponent).componentInstance;
    const original={version:1,shape:'circle',symbol:'ball',pattern:'hoops',
      primary:'#112233',secondary:'#445566',textColor:'#FFFFFF',borderColor:'#223344',
      patternOpacity:40,borderWidth:8,symbolSize:60,symbolY:140,
      showInitials:true,innerBorder:false,initialsSize:30,initialsY:220,
      customInitials:'ABC',caption:''};
    component.savedDesign=JSON.stringify(original);
    expect(component.shape).toBe('circle');
    expect(component.layers).toEqual([]);
    component.addLayer('text');
    component.savedDesign=JSON.stringify(original);
    expect(component.layers).toEqual([]);
  });

  it('reopens version-two layer projects and resets stale layers for another team',()=>{
    const component=TestBed.createComponent(TeamCrestEditorComponent).componentInstance;
    const original={version:2,shape:'hex',symbol:'none',pattern:'stripes',
      primary:'#112233',secondary:'#445566',textColor:'#FFFFFF',borderColor:'#223344',
      patternOpacity:40,borderWidth:8,symbolSize:60,symbolY:140,
      showInitials:false,innerBorder:false,initialsSize:30,initialsY:220,
      customInitials:'',caption:'',layers:[
        {id:'layer-3',kind:'text',text:'CLUBE',symbol:'star',x:111,y:175,
         size:42,rotation:-25,color:'#FFBB33',opacity:75}]};
    component.savedDesign=JSON.stringify(original);
    expect(component.layers.length).toBe(1);
    expect(component.layers[0].rotation).toBe(-25);
    expect(component.layers[0].x).toBe(111);
    component.addLayer('symbol');
    expect(component.layers[1].id).toBe('layer-4');
    component.savedDesign=null;
    expect(component.layers).toEqual([]);
    expect(component.loadedFromTeam).toBeFalse();
  });

  it('enforces the six-layer limit even when adding multiple symbols',()=>{
    const component=TestBed.createComponent(TeamCrestEditorComponent).componentInstance;
    for(let i=0;i<9;i++)component.addLayer('symbol');
    expect(component.layers.length).toBe(6);
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
