import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
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

  it('ends the broadcast for everyone when the host selects the player exit', () => {
    const event: CommunityLiveEvent={
      id:25,communityId:7,title:'Jogo de sábado',description:null,
      status:'LIVE',scheduledAt:new Date().toISOString(),
      startedAt:new Date().toISOString(),endedAt:null,canManage:true
    };
    // Keep the current live event in the first poll: an empty list means
    // the remote server has already ended it, and correctly calls leave().
    live.list.and.returnValue(of([event]));
    const fixture=TestBed.createComponent(CommunityLivePanelComponent);
    fixture.componentRef.setInput('communityId', 7);
    fixture.detectChanges();
    const c=fixture.componentInstance;
    const disconnect=jasmine.createSpy('disconnect');
    c.active=event;
    c.hosting=true;
    c.room={disconnect} as any;
    live.end.and.returnValue(of({...event,status:'ENDED'}));
    // Exercise the same handler wired to the host-only End button. A mocked
    // LiveKit room is not a full Room instance for DOM rendering.
    c.end(event);
    expect(live.end).toHaveBeenCalledOnceWith(7,25);
    expect(disconnect).toHaveBeenCalled();
    expect(c.room).toBeNull();
    fixture.destroy();
  });

  it('preserves an active broadcast after a transient polling timeout', fakeAsync(() => {
    const event: CommunityLiveEvent={
      id:25,communityId:7,title:'Jogo',description:null,status:'LIVE',
      scheduledAt:new Date().toISOString(),startedAt:new Date().toISOString(),
      endedAt:null,canManage:true
    };
    live.list.and.returnValues(of([event]),
      throwError(() => new HttpErrorResponse({status:0})));
    const fixture=TestBed.createComponent(CommunityLivePanelComponent);
    fixture.componentRef.setInput('communityId',7);
    fixture.detectChanges();
    const c=fixture.componentInstance;
    const disconnect=jasmine.createSpy('disconnect');
    c.room={disconnect} as any;
    c.active=event;
    tick(15001);
    expect(live.list).toHaveBeenCalledTimes(2);
    expect(c.room).not.toBeNull();
    expect(c.active?.id).toBe(25);
    expect(disconnect).not.toHaveBeenCalled();
    fixture.destroy();
  }));

  it('disconnects an active viewer when community permission is revoked', fakeAsync(() => {
    const event: CommunityLiveEvent={
      id:25,communityId:7,title:'Jogo',description:null,status:'LIVE',
      scheduledAt:new Date().toISOString(),startedAt:new Date().toISOString(),
      endedAt:null,canManage:false
    };
    live.list.and.returnValues(of([event]),
      throwError(() => new HttpErrorResponse({status:403})));
    const fixture=TestBed.createComponent(CommunityLivePanelComponent);
    fixture.componentRef.setInput('communityId',7);
    fixture.detectChanges();
    const c=fixture.componentInstance;
    const disconnect=jasmine.createSpy('disconnect');
    c.room={disconnect} as any;
    c.active=event;
    tick(15001);
    expect(live.list).toHaveBeenCalledTimes(2);
    expect(c.enabled).toBeFalse();
    expect(c.room).toBeNull();
    expect(disconnect).toHaveBeenCalled();
    fixture.destroy();
  }));

  it('prevents viewers from seeing host scheduling tools', () => {
    live.capabilities.and.returnValue(of({canManage:false,enabled:true}));
    const fixture=TestBed.createComponent(CommunityLivePanelComponent);
    fixture.componentRef.setInput('communityId', 7);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.live-schedule')).toBeNull();
    fixture.destroy();
  });
});
