import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MovableTextComponent } from './movable-text.component';

describe('MovableTextComponent', () => {
  let fixture: ComponentFixture<MovableTextComponent>;
  let component: MovableTextComponent;
  beforeEach(async () => {
    await TestBed.configureTestingModule({imports:[MovableTextComponent]}).compileComponents();
    fixture = TestBed.createComponent(MovableTextComponent);
    component = fixture.componentInstance;
    component.text = 'Futebol em Benfica';
    component.placement = {x:50,y:50,rotation:0,scale:1};
    fixture.detectChanges();
    spyOn(fixture.nativeElement as HTMLElement, 'getBoundingClientRect').and.returnValue({
      left:0,top:0,width:200,height:200,right:200,bottom:200,x:0,y:0,toJSON:()=>({})
    } as DOMRect);
  });

  it('drags and clamps the text using pointer movement', () => {
    const target = fixture.nativeElement.querySelector('.movable-text') as HTMLElement;
    spyOn(target,'setPointerCapture').and.stub();
    const changed = jasmine.createSpy('changed');
    component.placementChange.subscribe(changed);
    component.begin({button:0,pointerId:1,currentTarget:target,clientX:100,clientY:100,
      stopPropagation:()=>{},preventDefault:()=>{}} as unknown as PointerEvent,'move');
    component.move({pointerId:1,clientX:140,clientY:120,stopPropagation:()=>{}} as PointerEvent);
    expect(changed).toHaveBeenCalledWith(jasmine.objectContaining({x:70,y:60}));
    component.finish({pointerId:1} as PointerEvent);
  });

  it('rotates and resizes on separate handles', () => {
    const base = fixture.nativeElement.querySelector('.movable-text') as HTMLElement;
    const rotate = fixture.nativeElement.querySelector('.rotate') as HTMLElement;
    const resize = fixture.nativeElement.querySelector('.resize') as HTMLElement;
    spyOn(rotate,'setPointerCapture').and.stub();
    spyOn(resize,'setPointerCapture').and.stub();
    const states: any[] = [];
    component.placementChange.subscribe(value=>states.push(value));
    component.begin({button:0,pointerId:2,currentTarget:rotate,clientX:130,clientY:100,
      stopPropagation:()=>{},preventDefault:()=>{}} as unknown as PointerEvent,'rotate');
    component.move({pointerId:2,clientX:100,clientY:130,stopPropagation:()=>{}} as PointerEvent);
    expect(states[0].rotation).toBe(90);
    component.finish({pointerId:2} as PointerEvent);
    component.begin({button:0,pointerId:3,currentTarget:resize,clientX:120,clientY:120,
      stopPropagation:()=>{},preventDefault:()=>{}} as unknown as PointerEvent,'resize');
    component.move({pointerId:3,clientX:140,clientY:140,stopPropagation:()=>{}} as PointerEvent);
    expect(states[1].scale).toBeGreaterThan(1);
    component.finish({pointerId:3} as PointerEvent);
  });
});
