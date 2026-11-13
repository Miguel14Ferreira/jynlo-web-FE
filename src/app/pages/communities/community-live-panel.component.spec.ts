import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Track } from 'livekit-client';
import { CommunityLivePanelComponent } from './community-live-panel.component';
import { CommunityLiveService, CommunityLiveEvent } from '../../services/community-live.service';

describe('Community broadcast panel', () => {
  let live: jasmine.SpyObj<CommunityLiveService>;

  beforeEach(async () => {
    live = jasmine.createSpyObj<CommunityLiveService>(
      'CommunityLiveService', ['capabilities', 'list', 'schedule', 'start', 'end', 'join']);
    live.capabilities.and.returnValue(of({canManage:true,enabled:true}));
    live.list.and.returnValue(of([]));
    live.schedule.and.returnValue(of({} as CommunityLiveEvent));
    await TestBed.configureTestingModule({
      imports: [CommunityLivePanelComponent],
      providers: [{provide:CommunityLiveService, useValue:live}]
    }).compileComponents();
  });

  it('lets an organizer schedule the first live event even when the community has no events', () => {
    const fixture=TestBed.createComponent(CommunityLivePanelComponent);
    fixture.componentRef.setInput('communityId', 7);
    fixture.detectChanges();
    const c=fixture.componentInstance;
    expect(c.canManage).toBeTrue();
    expect((fixture.nativeElement as HTMLElement).querySelector('.live-schedule')).not.toBeNull();
    c.title='Jogo de sábado';
    c.description='Futebol';
    c.date='2026-12-12T18:00';
    c.schedule();
    expect(live.schedule).toHaveBeenCalled();
    expect(c.title).toBe('');
    fixture.destroy();
  });

  it('never displays stream controls when the provider is not configured', () => {
    live.capabilities.and.returnValue(of({canManage:true,enabled:false}));
    const fixture=TestBed.createComponent(CommunityLivePanelComponent);
    fixture.componentRef.setInput('communityId', 7);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.live-panel')?.hasAttribute('hidden')).toBeTrue();
    expect(live.list).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('mutes visual-only remote video to support mobile autoplay without silencing separate audio', () => {
    const fixture=TestBed.createComponent(CommunityLivePanelComponent);
    fixture.componentRef.setInput('communityId', 7);
    fixture.detectChanges();
    const c=fixture.componentInstance;
    const stage=document.createElement('div');
    (c as any).stageElement=stage;
    const video=document.createElement('video');
    const attach=jasmine.createSpy('attach').and.returnValue(video);
    (c as any).attach({kind:Track.Kind.Video,attach});
    expect(attach).toHaveBeenCalledTimes(1);
    expect(video.muted).toBeTrue();
    expect(video.getAttribute('playsinline')).toBe('');
    expect(stage.contains(video)).toBeTrue();
    c.leave();
    expect(stage.contains(video)).toBeFalse();
    fixture.destroy();
  });

  it('prevents viewers from seeing host scheduling tools', () => {
    live.capabilities.and.returnValue(of({canManage:false,enabled:true}));
    const fixture=TestBed.createComponent(CommunityLivePanelComponent);
    fixture.componentRef.setInput('communityId', 7);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.live-schedule')).toBeNull();
    fixture.destroy();
  });
});
