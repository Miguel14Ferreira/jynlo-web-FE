import { TestBed } from '@angular/core/testing';
import { CommunitySeasonCreateFormComponent } from './community-season-create-form.component';

describe('CommunitySeasonCreateFormComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({imports:[CommunitySeasonCreateFormComponent]}).compileComponents();
  });
  async function render(saving=false) {
    const fixture=TestBed.createComponent(CommunitySeasonCreateFormComponent);
    fixture.componentRef.setInput('name','Época 2026');
    fixture.componentRef.setInput('startsAt','2026-10-26T19:00');
    fixture.componentRef.setInput('saving',saving);
    fixture.detectChanges();
    await fixture.whenStable();fixture.detectChanges();
    return fixture;
  }
  it('keeps date/time input, draft name and the native creation button', async () => {
    const root=(await render()).nativeElement as HTMLElement;
    const inputs=root.querySelectorAll<HTMLInputElement>('input:not(.jynlo-date-picker-proxy)');
    expect(inputs.length).toBe(2);
    expect(inputs[0].value).toBe('Época 2026');
    // Shown as dd/mm/aaaa hh:mm on every browser; the stored value stays 2026-10-26T19:00.
    expect(inputs[1].getAttribute('data-date-kind')).toBe('datetime-local');
    expect(inputs[1].value).toBe('26/10/2026 19:00');
    expect(root.querySelector('button')?.getAttribute('type')).toBe('button');
  });
  it('emits draft changes separately without creating a season by itself', async () => {
    const fixture=await render();
    const name=jasmine.createSpy('name'),date=jasmine.createSpy('date'),create=jasmine.createSpy('create');
    fixture.componentInstance.nameChange.subscribe(name);
    fixture.componentInstance.startsAtChange.subscribe(date);
    fixture.componentInstance.createRequested.subscribe(create);
    const inputs=(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('input');
    inputs[0].value='Nova época';inputs[0].dispatchEvent(new Event('input',{bubbles:true}));
    await fixture.whenStable();
    expect(name).toHaveBeenCalledOnceWith('Nova época');
    expect(date).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    (fixture.nativeElement as HTMLElement).querySelector('button')?.click();
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('allows an optional sport for multi-sport communities without creating results', async () => {
    const fixture = await render();
    fixture.componentRef.setInput('sports', ['Futebol', 'Ténis']);
    fixture.componentRef.setInput('sport', '');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const selector = root.querySelector<HTMLSelectElement>('select');
    expect(selector).not.toBeNull();
    expect(selector?.options.length).toBe(3);
    expect(selector?.options[0].value).toBe('');
    const changed = jasmine.createSpy('sportChanged');
    const create = jasmine.createSpy('create');
    fixture.componentInstance.sportChange.subscribe(changed);
    fixture.componentInstance.createRequested.subscribe(create);
    selector!.value = 'Ténis';
    selector!.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    expect(changed).toHaveBeenCalledOnceWith('Ténis');
    expect(create).not.toHaveBeenCalled();
  });

  it('disables creating during persistence without erasing the draft', async () => {
    const root=(await render(true)).nativeElement as HTMLElement;
    expect(root.querySelector<HTMLButtonElement>('button')?.disabled).toBeTrue();
    expect(root.querySelector<HTMLInputElement>('input')?.value).toBe('Época 2026');
  });
});
