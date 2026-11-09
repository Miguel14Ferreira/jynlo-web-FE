import { TestBed } from '@angular/core/testing';
import { CommunityTabsComponent } from './community-tabs.component';

describe('CommunityTabsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CommunityTabsComponent] }).compileComponents();
  });

  function render(options: { competitions?: boolean; archives?: boolean; rankings?: boolean; active?: 'home' | 'ranking' } = {}) {
    const fixture = TestBed.createComponent(CommunityTabsComponent);
    fixture.componentRef.setInput('hasCompetitions', options.competitions ?? false);
    fixture.componentRef.setInput('canBrowseHistoricalArchives', options.archives ?? false);
    fixture.componentRef.setInput('rankingsEnabled', options.rankings ?? false);
    fixture.componentRef.setInput('activeTab', options.active ?? 'home');
    fixture.detectChanges();
    return fixture;
  }

  it('keeps base tabs, localized labels and current state without extra competition tabs', () => {
    const root = render().nativeElement as HTMLElement;
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('.community-tabs button'));
    expect(buttons.length).toBe(5);
    expect(root.querySelector('nav[aria-label]')).not.toBeNull();
    expect(buttons[0].getAttribute('aria-current')).toBe('true');
    expect(buttons.slice(1).every(button => button.getAttribute('aria-current') === null)).toBeTrue();
    expect(buttons.map(button => button.textContent?.trim()).every(Boolean)).toBeTrue();
  });

  it('keeps navigation spacing owned by the detail shell, without nested top margin', () => {
    const root = render().nativeElement as HTMLElement;
    const nav = root.querySelector<HTMLElement>('nav.community-tabs');
    expect(nav).not.toBeNull();
    expect(getComputedStyle(nav!).marginTop).toBe('0px');
  });

  it('exposes tournament, archive and statistics tabs only when enabled', () => {
    const root = render({ competitions: true, archives: true, rankings: true, active: 'ranking' })
      .nativeElement as HTMLElement;
    const buttons = root.querySelectorAll<HTMLButtonElement>('.community-tabs button');
    expect(buttons.length).toBe(8);
    expect(buttons[5].getAttribute('aria-current')).toBe('true');
    expect(buttons[0].getAttribute('aria-current')).toBeNull();
  });

  it('keeps all eight enabled tabs in a readable horizontal rail', () => {
    const root = render({ competitions:true, archives:true, rankings:true }).nativeElement as HTMLElement;
    const nav = root.querySelector<HTMLElement>('.community-tabs')!;
    const buttons = Array.from(nav.querySelectorAll<HTMLButtonElement>('button'));
    expect(buttons.length).toBe(8);
    expect(getComputedStyle(nav).overflowX).toBe('auto');
    expect(buttons.every(button => button.type === 'button')).toBeTrue();
    expect(buttons.every(button => getComputedStyle(button).whiteSpace === 'nowrap')).toBeTrue();
    expect(buttons.filter(button => button.getAttribute('aria-current') === 'true').length).toBe(1);
  });

  it('emits the requested tab but never owns routing or state transitions', () => {
    const fixture = render({ competitions: true, archives: true, rankings: true });
    const handler = jasmine.createSpy('tab-request');
    fixture.componentInstance.tabRequested.subscribe(handler);
    const root = fixture.nativeElement as HTMLElement;
    const buttons = root.querySelectorAll<HTMLButtonElement>('.community-tabs button');
    buttons[1].click();
    buttons[2].click();
    buttons[5].click();
    expect(handler.calls.allArgs()).toEqual([['feed'], ['chat'], ['ranking']]);
    expect(fixture.componentInstance.activeTab).toBe('home');
  });

  it('keeps historical archive navigation without showing statistics when rankings are off', () => {
    const root = render({ archives: true, rankings: false }).nativeElement as HTMLElement;
    const buttons = root.querySelectorAll('.community-tabs button');
    expect(buttons.length).toBe(6);
  });
});
