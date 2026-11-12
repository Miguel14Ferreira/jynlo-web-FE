import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { RoomEvent, Track } from 'livekit-client';
import { DirectCallClientService } from './direct-call-client.service';
import { DirectCallEvent, DirectChatRealtimeService } from './direct-chat-realtime.service';
import { DirectCallToneService } from './direct-call-tone.service';

describe('Direct calls gated by authenticated realtime and backend availability', () => {
  let calls: DirectCallClientService;
  let http: HttpTestingController;
  let events: Subject<DirectCallEvent>;
  let connect: jasmine.Spy;
  let tones: {needsGesture$: BehaviorSubject<boolean>; prime: jasmine.Spy; sync: jasmine.Spy};

  beforeEach(() => {
    events = new Subject<DirectCallEvent>();
    connect = jasmine.createSpy('connect');
    tones = {needsGesture$:new BehaviorSubject(false), prime:jasmine.createSpy('prime'), sync:jasmine.createSpy('sync')};
    const token = 'eyJhbGciOiJub25lIn0.' +
      btoa(JSON.stringify({sub:'ana',exp:4102444800})).replace(/=+$/,'') + '.fixture';
    spyOn(localStorage,'getItem').and.callFake(key => key === 't' ? token : null);
    TestBed.configureTestingModule({providers:[
      provideHttpClient(), provideHttpClientTesting(),
      {provide:Router,useValue:{events:new Subject()}},
      {provide:DirectChatRealtimeService,useValue:{calls$:events.asObservable(),connect}},
      {provide:DirectCallToneService,useValue:tones}
    ]});
    calls=TestBed.inject(DirectCallClientService);
    http=TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Group membership refresh is best-effort and may be started by a
    // mocked peer connection in older unit tests. Finish those scoped GETs.
    http.match(req => /\/api\/calls\/direct\/[^/]+\/members$/.test(req.url))
      .forEach(req => req.flush({participants:[],pending:[]}));
    calls.ngOnDestroy();
    http.verify();
  });

  it('keeps an existing screen share visible if stopping it fails', async () => {
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    spyOnProperty(calls,'canShareScreen','get').and.returnValue(true);
    const screen={source:Track.Source.ScreenShare,track:{},isMuted:false};
    const participant={
      videoTrackPublications:new Map([['screen',screen]]),
      setScreenShareEnabled:jasmine.createSpy('share').and.rejectWith(new Error('device busy'))
    };
    const room:any={localParticipant:participant,disconnect:jasmine.createSpy('disconnect')};
    calls.room=room;
    calls.screenShareEnabled$.next(true);
    const version=calls.mediaChanged$.value;
    await calls.setScreenShare(false);
    expect(participant.setScreenShareEnabled).toHaveBeenCalledOnceWith(false);
    expect(calls.screenShareEnabled$.value).toBeTrue();
    expect(calls.screenShareFeedback$.value).toBe('calls.screenShareFailed');
    expect(calls.busyMedia$.value).toBeFalse();
    expect(calls.mediaChanged$.value).toBeGreaterThan(version);
  });

  it('does not mark a screen as shared when the browser picker is cancelled', async () => {
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    spyOnProperty(calls,'canShareScreen','get').and.returnValue(true);
    const participant={
      videoTrackPublications:new Map(),
      setScreenShareEnabled:jasmine.createSpy('share').and.rejectWith(new DOMException('Cancelled','NotAllowedError'))
    };
    calls.room={localParticipant:participant,disconnect:jasmine.createSpy('disconnect')} as any;
    await calls.setScreenShare(true);
    expect(calls.screenShareEnabled$.value).toBeFalse();
    expect(calls.screenShareFeedback$.value).toBe('calls.screenShareCancelled');
    expect(calls.busyMedia$.value).toBeFalse();
  });

  it('uses a live screen publication rather than a stale share button state', async () => {
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    spyOnProperty(calls,'canShareScreen','get').and.returnValue(true);
    const participant={
      videoTrackPublications:new Map([
        ['screen',{source:Track.Source.ScreenShare,track:{},isMuted:false}]
      ]),
      setScreenShareEnabled:jasmine.createSpy('share').and.resolveTo()
    };
    calls.room={localParticipant:participant,disconnect:jasmine.createSpy('disconnect')} as any;
    calls.screenShareFeedback$.next('calls.screenShareFailed');
    await calls.setScreenShare(true);
    expect(calls.screenShareEnabled$.value).toBeTrue();
    expect(calls.screenShareFeedback$.value).toBeNull();
    participant.videoTrackPublications.clear();
    await calls.setScreenShare(false);
    expect(calls.screenShareEnabled$.value).toBeFalse();
  });

  it('does not reveal an incoming call while provider is unconfigured', () => {
    http.expectOne(r => r.url.endsWith('/api/calls/direct/availability')).flush({enabled:false});
    events.next({callId:'uuid',caller:'bea',peer:'ana',media:'video',
      status:'RINGING',actor:'bea',expiresAt:new Date(Date.now()+60000).toISOString()});
    expect(calls.available$.value).toBeFalse();
    expect(calls.state$.value).toBeNull();
    expect(connect).toHaveBeenCalled();
  });

  it('only offers authenticated calls addressed to the current account and allows decline', () => {
    http.expectOne(r => r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    events.next({callId:'wrong',caller:'bea',peer:'carla',media:'voice',
      status:'RINGING',actor:'bea',expiresAt:new Date(Date.now()+60000).toISOString()});
    expect(calls.state$.value).toBeNull();

    events.next({callId:'abc',caller:'bea',peer:'ana',media:'voice',
      status:'RINGING',actor:'bea',expiresAt:new Date(Date.now()+60000).toISOString()});
    expect(calls.state$.value?.phase).toBe('incoming');
    expect(calls.state$.value?.peer).toBe('bea');
    calls.decline();
    const decline=http.expectOne(r => r.url.endsWith('/api/calls/direct/abc/decline'));
    expect(decline.request.method).toBe('POST');
    decline.flush(null);
    expect(calls.state$.value).toBeNull();
  });


  it('starts and stops a ringtone only for live outgoing and incoming invitation states', async () => {
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const room = {
      on: jasmine.createSpy('on').and.callFake(() => room),
      connect: jasmine.createSpy('connect').and.resolveTo(),
      disconnect: jasmine.createSpy('disconnect').and.resolveTo(),
      canPlaybackAudio:true,
      remoteParticipants:new Map(),
      localParticipant:{setMicrophoneEnabled:jasmine.createSpy('mic').and.resolveTo()}
    };
    spyOn(calls as any,'createRoom').and.returnValue(room);
    const starting = calls.start('bea','voice');
    expect(tones.prime).toHaveBeenCalledTimes(1);
    const expiry = new Date(Date.now()+60_000).toISOString();
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/bea')).flush({
      callId:'tone-outgoing',peer:'bea',media:'voice',serverUrl:'wss://example.test',
      token:'test',expiresAt:expiry
    });
    await starting;
    expect(tones.sync).toHaveBeenCalledWith('dialing');
    events.next({callId:'tone-outgoing',caller:'ana',peer:'bea',media:'voice',
      status:'ACTIVE',actor:'bea',expiresAt:expiry});
    expect(tones.sync).toHaveBeenCalledWith('active');
    calls.end();
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/tone-outgoing/end')).flush(null);
    expect(tones.sync).toHaveBeenCalledWith(undefined);
    events.next({callId:'tone-incoming',caller:'bea',peer:'ana',media:'voice',
      status:'RINGING',actor:'bea',expiresAt:expiry});
    expect(tones.sync).toHaveBeenCalledWith('incoming');
    calls.decline();
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/tone-incoming/decline')).flush(null);
    expect(tones.sync).toHaveBeenCalledWith(undefined);
  });

  it('only asks to enable remote sound when LiveKit reports autoplay is blocked', async () => {
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const listeners=new Map<string,()=>void>();
    const room = {
      on:jasmine.createSpy('on').and.callFake((event:string,cb:()=>void)=>{listeners.set(event,cb);return room;}),
      connect:jasmine.createSpy('connect').and.resolveTo(),
      disconnect:jasmine.createSpy('disconnect').and.resolveTo(),
      canPlaybackAudio:true,
      startAudio:jasmine.createSpy('startAudio').and.callFake(async()=>{room.canPlaybackAudio=true;}),
      remoteParticipants:new Map(),
      localParticipant:{setMicrophoneEnabled:jasmine.createSpy('mic').and.resolveTo()}
    };
    spyOn(calls as any,'createRoom').and.returnValue(room);
    const starting=calls.start('bea','voice');
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/bea')).flush({
      callId:'audio-block',peer:'bea',media:'voice',serverUrl:'wss://example.test',
      token:'test',expiresAt:new Date(Date.now()+60_000).toISOString()
    });
    await starting;
    expect(calls.audioPlaybackBlocked$.value).toBeFalse();
    room.canPlaybackAudio=false;
    listeners.get(RoomEvent.AudioPlaybackStatusChanged)?.();
    expect(calls.audioPlaybackBlocked$.value).toBeTrue();
    await calls.allowAudio();
    expect(room.startAudio).toHaveBeenCalledTimes(1);
    expect(calls.audioPlaybackBlocked$.value).toBeFalse();
    calls.end();
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/audio-block/end')).flush(null);
    expect(calls.audioPlaybackBlocked$.value).toBeFalse();
  });

  it('explains disabled provider and rechecks readiness after it is configured', () => {
    expect(calls.availabilityStatus$.value).toBe('checking');
    http.expectOne(r => r.url.endsWith('/api/calls/direct/availability')).flush({enabled:false});
    expect(calls.available$.value).toBeFalse();
    expect(calls.availabilityStatus$.value).toBe('notConfigured');
    calls.refreshAvailability();
    expect(calls.availabilityStatus$.value).toBe('checking');
    http.expectOne(r => r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    expect(calls.available$.value).toBeTrue();
    expect(calls.availabilityStatus$.value).toBe('ready');
  });

  it('distinguishes unauthorised availability requests from an unconfigured provider', () => {
    http.expectOne(r => r.url.endsWith('/api/calls/direct/availability'))
      .flush({}, {status:403,statusText:'Forbidden'});
    expect(calls.available$.value).toBeFalse();
    expect(calls.availabilityStatus$.value).toBe('requestFailed');
    calls.refreshAvailability();
    http.expectOne(r => r.url.endsWith('/api/calls/direct/availability')).flush({enabled:false});
    expect(calls.availabilityStatus$.value).toBe('notConfigured');
  });

  it('recovers a missed incoming ringing event without creating a second call', () => {
    http.expectOne(r => r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    calls.recoverPendingCall();
    const request = http.expectOne(r => r.url.endsWith('/api/calls/direct/pending'));
    expect(request.request.method).toBe('GET');
    request.flush({callId:'recovered-uuid',caller:'bea',peer:'ana',media:'video',
      expiresAt:new Date(Date.now()+60_000).toISOString()});
    expect(calls.state$.value?.phase).toBe('incoming');
    expect(calls.state$.value?.peer).toBe('bea');
    calls.recoverPendingCall();
    http.expectNone(r => r.url.endsWith('/api/calls/direct/pending'));
    calls.decline();
    http.expectOne(r => r.url.endsWith('/api/calls/direct/recovered-uuid/decline')).flush(null);
  });

  it('ignores pending invitations for another account and expired calls', () => {
    http.expectOne(r => r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    calls.recoverPendingCall();
    http.expectOne(r => r.url.endsWith('/api/calls/direct/pending'))
      .flush({callId:'wrong-user',caller:'bea',peer:'carla',media:'voice',
        expiresAt:new Date(Date.now()+60_000).toISOString()});
    expect(calls.state$.value).toBeNull();
    calls.recoverPendingCall();
    http.expectOne(r => r.url.endsWith('/api/calls/direct/pending'))
      .flush({callId:'expired',caller:'bea',peer:'ana',media:'voice',
        expiresAt:new Date(Date.now()-5_000).toISOString()});
    expect(calls.state$.value).toBeNull();
  });

  it('retries a missed invitation without concurrent requests or phantom calls', () => {
    http.expectOne(r => r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    calls.recoverPendingCall();
    calls.recoverPendingCall();
    const req=http.match(r => r.url.endsWith('/api/calls/direct/pending'));
    expect(req.length).toBe(1);
    req[0].flush({}, {status:503,statusText:'Unavailable'});
    expect(calls.state$.value).toBeNull();
    calls.recoverPendingCall();
    http.expectOne(r => r.url.endsWith('/api/calls/direct/pending')).flush(null);
    expect(calls.state$.value).toBeNull();
  });

  it('keeps LiveKit connection failure visible after the disconnect callback and ENDED echo', async () => {
    http.expectOne(r => r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const listeners = new Map<string, () => void>();
    const room = {
      on: jasmine.createSpy('on').and.callFake((event: string, cb: () => void) => {
        listeners.set(event, cb); return room;
      }),
      connect: jasmine.createSpy('connect').and.rejectWith(new Error('LiveKit connection refused')),
      disconnect: jasmine.createSpy('disconnect').and.callFake(() => {
        listeners.get('disconnected')?.(); return Promise.resolve();
      }),
      remoteParticipants: new Map(),
      localParticipant: {setMicrophoneEnabled: jasmine.createSpy('microphone')}
    };
    spyOn(calls as any, 'createRoom').and.returnValue(room);
    const starting=calls.start('bea','voice');
    http.expectOne(r => r.url.endsWith('/api/calls/direct/bea'))
      .flush({callId:'call-failed',peer:'bea',media:'voice',
        serverUrl:'wss://livekit.example.test',token:'fixture',
        expiresAt:new Date(Date.now()+60_000).toISOString()});
    await starting;
    http.expectOne(r => r.url.endsWith('/api/calls/direct/call-failed/end')).flush(null);
    expect(calls.state$.value?.phase).toBe('error');
    expect(calls.state$.value?.error).toBe('calls.connectionFailed');
    expect(room.disconnect).toHaveBeenCalled();
    events.next({callId:'call-failed',caller:'ana',peer:'bea',media:'voice',
      status:'ENDED',actor:'ana',expiresAt:new Date().toISOString()});
    expect(calls.state$.value?.phase).toBe('error');
    calls.closeError();
    expect(calls.state$.value).toBeNull();
  });

  it('recovers camera publication using another available camera when default is busy', async () => {
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const room:any={
      on:jasmine.createSpy('on').and.callFake(() => room),
      connect:jasmine.createSpy('connect').and.resolveTo(),
      disconnect:jasmine.createSpy('disconnect').and.resolveTo(),
      remoteParticipants:new Map(),
      localParticipant:{
        setMicrophoneEnabled:jasmine.createSpy('microphone').and.resolveTo(),
        setCameraEnabled:jasmine.createSpy('camera').and.callFake(async (_enabled:boolean,options?:any)=>{
          if (!options?.deviceId) throw new DOMException('Another application is using the camera','NotReadableError');
          return undefined;
        })
      }
    };
    spyOn(calls as any,'createRoom').and.returnValue(room);
    calls.devices$.next([{kind:'videoinput',deviceId:'usb-camera',groupId:'a',label:'USB camera'} as MediaDeviceInfo]);
    const starting=calls.start('bea','video');
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/bea')).flush({
      callId:'recovered-camera',peer:'bea',media:'video',serverUrl:'wss://livekit.example.test',
      token:'fixture',expiresAt:new Date(Date.now()+60000).toISOString()
    });
    await starting;
    expect(room.localParticipant.setCameraEnabled).toHaveBeenCalledWith(true, {
      deviceId:{exact:'usb-camera'},resolution:{width:640,height:360,frameRate:15}
    });
    expect(calls.state$.value?.cameraEnabled).toBeTrue();
    expect(calls.state$.value?.error).toBeUndefined();
    expect(calls.selectedDevices$.value.videoinput).toBe('usb-camera');
    calls.end();
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/recovered-camera/end')).flush(null);
  });

  it('recovers an incompatible default camera using a lower resolution', async () => {
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const room:any={
      on:jasmine.createSpy('on').and.callFake(()=>room),
      connect:jasmine.createSpy('connect').and.resolveTo(),
      disconnect:jasmine.createSpy('disconnect').and.resolveTo(),
      remoteParticipants:new Map(),
      localParticipant:{
        setMicrophoneEnabled:jasmine.createSpy('mic').and.resolveTo(),
        setCameraEnabled:jasmine.createSpy('camera').and.callFake(async (_enabled:boolean,options?:any)=>{
          if (!options?.resolution) throw new DOMException('Unsupported video profile','OverconstrainedError');
        })
      }
    };
    spyOn(calls as any,'createRoom').and.returnValue(room);
    const start=calls.start('bea','video');
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/bea')).flush({
      callId:'fallback-resolution',peer:'bea',media:'video',serverUrl:'wss://livekit.example.test',
      token:'fixture',expiresAt:new Date(Date.now()+60000).toISOString()
    });
    await start;
    expect(room.localParticipant.setCameraEnabled).toHaveBeenCalledWith(true,{
      resolution:{width:640,height:360,frameRate:15}
    });
    expect(calls.state$.value?.cameraEnabled).toBeTrue();
    calls.end();
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/fallback-resolution/end')).flush(null);
  });

  it('does not treat a screen share as evidence that the camera is published', async () => {
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const room:any={
      on:jasmine.createSpy('on').and.callFake(()=>room),
      connect:jasmine.createSpy('connect').and.resolveTo(),
      disconnect:jasmine.createSpy('disconnect').and.resolveTo(),
      remoteParticipants:new Map(),
      localParticipant:{
        videoTrackPublications:new Map([
          ['share',{source:Track.Source.ScreenShare,track:{},isMuted:false}]
        ]),
        setMicrophoneEnabled:jasmine.createSpy('mic').and.resolveTo(),
        setCameraEnabled:jasmine.createSpy('camera').and.resolveTo()
      }
    };
    spyOn(calls as any,'createRoom').and.returnValue(room);
    const start=calls.start('bea','video');
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/bea')).flush({
      callId:'screen-is-not-camera',peer:'bea',media:'video',serverUrl:'wss://livekit.example.test',
      token:'fixture',expiresAt:new Date(Date.now()+60000).toISOString()
    });
    await start;
    expect(calls.state$.value?.cameraEnabled).toBeFalse();
    expect(calls.state$.value?.error).toBe('calls.cameraPublicationFailed');
    calls.end();
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/screen-is-not-camera/end')).flush(null);
  });

  it('restarts a stale mobile camera only on explicit retry and leaves healthy video untouched', async () => {
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const ended={source:Track.Source.Camera,track:{
      mediaStreamTrack:{readyState:'ended'}
    },isMuted:false};
    const healthy={source:Track.Source.Camera,track:{
      mediaStreamTrack:{readyState:'live'}
    },isMuted:false};
    const publications=new Map<string,any>([['camera',ended]]);
    const toggle=jasmine.createSpy('toggle').and.callFake(async (enabled:boolean) => {
      if (!enabled) publications.clear();
      else publications.set('camera',healthy);
    });
    const room:any={
      localParticipant:{videoTrackPublications:publications,setCameraEnabled:toggle},
      disconnect:jasmine.createSpy('disconnect')
    };
    calls.room=room;
    calls.state$.next({id:'mobile-recovery',peer:'bea',media:'video',
      phase:'active',micEnabled:true,cameraEnabled:true});
    await calls.setCamera(true);
    expect(toggle.calls.allArgs().map(args=>args[0])).toEqual([false,true]);
    expect(calls.state$.value?.cameraEnabled).toBeTrue();
    expect(calls.state$.value?.error).toBeUndefined();

    toggle.calls.reset();
    await calls.setCamera(true);
    expect(toggle).toHaveBeenCalledOnceWith(true,undefined);
    calls.room=null;
  });

  it('reports an unpublished camera track without terminating the call', async () => {
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const room:any={
      on:jasmine.createSpy('on').and.callFake(()=>room),
      connect:jasmine.createSpy('connect').and.resolveTo(),
      disconnect:jasmine.createSpy('disconnect').and.resolveTo(),
      remoteParticipants:new Map(),
      localParticipant:{
        videoTrackPublications:new Map(),
        setMicrophoneEnabled:jasmine.createSpy('mic').and.resolveTo(),
        setCameraEnabled:jasmine.createSpy('camera').and.resolveTo()
      }
    };
    spyOn(calls as any,'createRoom').and.returnValue(room);
    const start=calls.start('bea','video');
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/bea')).flush({
      callId:'missing-publication',peer:'bea',media:'video',serverUrl:'wss://livekit.example.test',
      token:'fixture',expiresAt:new Date(Date.now()+60000).toISOString()
    });
    await start;
    expect(calls.state$.value?.cameraEnabled).toBeFalse();
    expect(calls.state$.value?.error).toBe('calls.cameraPublicationFailed');
    expect(room.disconnect).not.toHaveBeenCalled();
    calls.end();
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/missing-publication/end')).flush(null);
  });

  it('preserves permission-denied camera diagnostics and never retries hardware automatically', async () => {
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const room:any={
      on:jasmine.createSpy('on').and.callFake(() => room),
      connect:jasmine.createSpy('connect').and.resolveTo(),
      disconnect:jasmine.createSpy('disconnect').and.resolveTo(),
      remoteParticipants:new Map(),
      localParticipant:{
        setMicrophoneEnabled:jasmine.createSpy('mic').and.resolveTo(),
        setCameraEnabled:jasmine.createSpy('camera').and.rejectWith(
          new DOMException('Camera access denied','NotAllowedError'))
      }
    };
    spyOn(calls as any,'createRoom').and.returnValue(room);
    calls.devices$.next([{kind:'videoinput',deviceId:'another',label:'Another'} as MediaDeviceInfo]);
    const starting=calls.start('bea','video');
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/bea')).flush({
      callId:'camera-denied',peer:'bea',media:'video',serverUrl:'wss://livekit.example.test',
      token:'fixture',expiresAt:new Date(Date.now()+60000).toISOString()
    });
    await starting;
    expect(room.localParticipant.setCameraEnabled).toHaveBeenCalledTimes(1);
    expect(calls.state$.value?.cameraEnabled).toBeFalse();
    expect(calls.state$.value?.error).toBe('calls.cameraDenied');
    expect(room.disconnect).not.toHaveBeenCalled();
    calls.end();
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/camera-denied/end')).flush(null);
  });

  it('allows selection of camera hardware during a call and refuses vanished devices', async () => {
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const room:any={
      on:jasmine.createSpy('on').and.callFake(() => room),
      connect:jasmine.createSpy('connect').and.resolveTo(),
      disconnect:jasmine.createSpy('disconnect').and.resolveTo(),
      switchActiveDevice:jasmine.createSpy('switch').and.resolveTo(true),
      remoteParticipants:new Map(),
      localParticipant:{setMicrophoneEnabled:jasmine.createSpy('mic').and.resolveTo()}
    };
    spyOn(calls as any,'createRoom').and.returnValue(room);
    const starting=calls.start('bea','voice');
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/bea')).flush({
      callId:'select-device',peer:'bea',media:'voice',serverUrl:'wss://livekit.example.test',
      token:'fixture',expiresAt:new Date(Date.now()+60000).toISOString()
    });
    await starting;
    calls.devices$.next([{kind:'audioinput',deviceId:'mic-2',label:'USB microphone'} as MediaDeviceInfo]);
    await calls.selectDevice('audioinput','missing');
    expect(calls.state$.value?.error).toBe('calls.deviceMissing');
    expect(room.switchActiveDevice).not.toHaveBeenCalled();
    await calls.selectDevice('audioinput','mic-2');
    expect(room.switchActiveDevice).toHaveBeenCalledWith('audioinput','mic-2');
    expect(calls.selectedDevices$.value.audioinput).toBe('mic-2');
    expect(calls.state$.value?.error).toBeUndefined();
    calls.end();
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/select-device/end')).flush(null);
  });

  it('keeps the current call and selected microphone after an input switch fails', async () => {
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const room:any={
      on:jasmine.createSpy('on').and.callFake(()=>room),
      connect:jasmine.createSpy('connect').and.resolveTo(),
      disconnect:jasmine.createSpy('disconnect').and.resolveTo(),
      switchActiveDevice:jasmine.createSpy('switch').and.rejectWith(
        new DOMException('Device busy','NotReadableError')),
      remoteParticipants:new Map(),
      localParticipant:{setMicrophoneEnabled:jasmine.createSpy('mic').and.resolveTo()}
    };
    spyOn(calls as any,'createRoom').and.returnValue(room);
    const starting=calls.start('bea','voice');
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/bea')).flush({
      callId:'switch-failed',peer:'bea',media:'voice',serverUrl:'wss://livekit.example.test',
      token:'fixture',expiresAt:new Date(Date.now()+60000).toISOString()
    });
    await starting;
    calls.devices$.next([{kind:'audioinput',deviceId:'mic-new',label:'USB microphone'} as MediaDeviceInfo]);
    calls.selectedDevices$.next({audioinput:'mic-old'});
    const beforeState=calls.state$.value;
    await calls.selectDevice('audioinput','mic-new');
    expect(calls.selectedDevices$.value.audioinput).toBe('mic-old');
    expect(calls.state$.value?.id).toBe(beforeState?.id);
    expect(calls.state$.value?.micEnabled).toBe(beforeState?.micEnabled);
    expect(calls.state$.value?.error).toBe('calls.microphoneBusy');
    expect(room.disconnect).not.toHaveBeenCalled();
    expect(calls.busyMedia$.value).toBeFalse();
    calls.end();
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/switch-failed/end')).flush(null);
  });

  it('does not toggle the microphone while an audio input switch is still pending', async () => {
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    let releaseSwitch: ((value:boolean)=>void)|undefined;
    const room:any={
      on:jasmine.createSpy('on').and.callFake(()=>room),
      connect:jasmine.createSpy('connect').and.resolveTo(),
      disconnect:jasmine.createSpy('disconnect').and.resolveTo(),
      switchActiveDevice:jasmine.createSpy('switch').and.returnValue(
        new Promise<boolean>(resolve=>{releaseSwitch=resolve;})),
      remoteParticipants:new Map(),
      localParticipant:{setMicrophoneEnabled:jasmine.createSpy('mic').and.resolveTo()}
    };
    spyOn(calls as any,'createRoom').and.returnValue(room);
    const starting=calls.start('bea','voice');
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/bea')).flush({
      callId:'switch-concurrent',peer:'bea',media:'voice',serverUrl:'wss://livekit.example.test',
      token:'fixture',expiresAt:new Date(Date.now()+60000).toISOString()
    });
    await starting;
    calls.devices$.next([{kind:'audioinput',deviceId:'mic-new',label:'USB microphone'} as MediaDeviceInfo]);
    const pending=calls.selectDevice('audioinput','mic-new');
    expect(calls.busyMedia$.value).toBeTrue();
    const previousCount=room.localParticipant.setMicrophoneEnabled.calls.count();
    await calls.setMicrophone(false);
    expect(room.localParticipant.setMicrophoneEnabled.calls.count()).toBe(previousCount);
    releaseSwitch?.(true);
    await pending;
    expect(calls.selectedDevices$.value.audioinput).toBe('mic-new');
    expect(calls.busyMedia$.value).toBeFalse();
    calls.end();
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/switch-concurrent/end')).flush(null);
  });

  it('switches an active camera to the default without first turning video off', async () => {
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const room:any={
      switchActiveDevice:jasmine.createSpy('switch').and.resolveTo(true),
      localParticipant:{setCameraEnabled:jasmine.createSpy('camera')}
    };
    calls.room=room;
    calls.state$.next({id:'atomic-camera',peer:'bea',media:'video',phase:'active',
      micEnabled:true,cameraEnabled:true,startedAt:Date.now()});
    calls.selectedDevices$.next({videoinput:'usb-camera'});
    spyOn(calls,'refreshDevices').and.resolveTo();
    await calls.useDefaultCamera();
    expect(room.switchActiveDevice).toHaveBeenCalledOnceWith('videoinput','default');
    expect(room.localParticipant.setCameraEnabled).not.toHaveBeenCalled();
    expect(calls.selectedDevices$.value.videoinput).toBeUndefined();
    expect(calls.state$.value?.cameraEnabled).toBeTrue();
    expect(calls.busyMedia$.value).toBeFalse();
    calls.room=null;
  });

  it('preserves active camera and selection when switching to default fails', async () => {
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const room:any={
      switchActiveDevice:jasmine.createSpy('switch').and.rejectWith(
        new DOMException('Camera busy','NotReadableError')),
      localParticipant:{setCameraEnabled:jasmine.createSpy('camera')}
    };
    calls.room=room;
    calls.state$.next({id:'camera-fallback-failed',peer:'bea',media:'video',phase:'active',
      micEnabled:true,cameraEnabled:true,startedAt:Date.now()});
    calls.selectedDevices$.next({videoinput:'usb-camera'});
    spyOn(calls,'refreshDevices').and.resolveTo();
    await calls.useDefaultCamera();
    expect(calls.selectedDevices$.value.videoinput).toBe('usb-camera');
    expect(calls.state$.value?.cameraEnabled).toBeTrue();
    expect(calls.state$.value?.phase).toBe('active');
    expect(calls.state$.value?.error).toBe('calls.cameraBusy');
    expect(room.localParticipant.setCameraEnabled).not.toHaveBeenCalled();
    expect(calls.busyMedia$.value).toBeFalse();
    calls.room=null;
  });

  it('keeps the same call duration across a temporary LiveKit reconnection', async () => {
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const listeners=new Map<string,()=>void>();
    const peers=new Map<string,object>([['peer',{identity:'peer'}]]);
    const room:any={
      on:jasmine.createSpy('on').and.callFake((event:string,cb:()=>void)=>{
        listeners.set(event,cb);return room;
      }),
      connect:jasmine.createSpy('connect').and.resolveTo(),
      disconnect:jasmine.createSpy('disconnect').and.resolveTo(),
      remoteParticipants:peers,
      localParticipant:{setMicrophoneEnabled:jasmine.createSpy('mic').and.resolveTo()}
    };
    spyOn(calls as any,'createRoom').and.returnValue(room);
    const starting=calls.start('bea','voice');
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/bea')).flush({
      callId:'duration',peer:'bea',media:'voice',serverUrl:'wss://livekit.example.test',
      token:'fixture',expiresAt:new Date(Date.now()+60000).toISOString()
    });
    await starting;
    const started=calls.state$.value?.startedAt;
    expect(started).toEqual(jasmine.any(Number));
    peers.clear();
    listeners.get(RoomEvent.ParticipantDisconnected)?.();
    expect(calls.state$.value?.startedAt).toBe(started);
    peers.set('peer',{identity:'peer'});
    listeners.get(RoomEvent.ParticipantConnected)?.();
    expect(calls.state$.value?.startedAt).toBe(started);
    calls.end();
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/duration/end')).flush(null);
  });

  it('preserves muted media and refreshes the room view after transport reconnection', async () => {
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const listeners=new Map<string,(...args:any[])=>void>();
    const peers=new Map<string,object>([['peer',{identity:'peer'}]]);
    const room:any={
      on:jasmine.createSpy('on').and.callFake((event:string,cb:(...args:any[])=>void)=>{
        listeners.set(event,cb);return room;
      }),
      connect:jasmine.createSpy('connect').and.resolveTo(),
      disconnect:jasmine.createSpy('disconnect').and.resolveTo(),
      canPlaybackAudio:true,
      remoteParticipants:peers,
      localParticipant:{
        setMicrophoneEnabled:jasmine.createSpy('mic').and.resolveTo(),
        setCameraEnabled:jasmine.createSpy('camera').and.resolveTo()
      }
    };
    spyOn(calls as any,'createRoom').and.returnValue(room);
    const startedCall=calls.start('bea','voice');
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/bea')).flush({
      callId:'transport-reconnect',peer:'bea',media:'voice',serverUrl:'wss://livekit.example.test',
      token:'fixture',expiresAt:new Date(Date.now()+60000).toISOString()
    });
    await startedCall;
    calls.state$.next({...calls.state$.value!,phase:'active',micEnabled:false,cameraEnabled:true});
    calls.connectionQuality$.next('lost');
    const startedAt=calls.state$.value?.startedAt;
    const previousMic=room.localParticipant.setMicrophoneEnabled.calls.count();
    const previousCamera=room.localParticipant.setCameraEnabled.calls.count();
    const revision=calls.mediaChanged$.value;

    listeners.get(RoomEvent.Reconnecting)?.();
    expect(calls.state$.value?.phase).toBe('connecting');
    expect(calls.connectionQuality$.value).toBe('unknown');
    listeners.get(RoomEvent.LocalTrackUnpublished)?.({source:'camera'});
    listeners.get(RoomEvent.TrackMuted)?.({source:'microphone'},room.localParticipant);
    expect(calls.state$.value?.cameraEnabled).toBeTrue();
    expect(calls.state$.value?.micEnabled).toBeFalse();
    expect(calls.state$.value?.error).toBeUndefined();

    listeners.get(RoomEvent.Reconnected)?.();
    expect(calls.state$.value?.phase).toBe('active');
    expect(calls.state$.value?.startedAt).toBe(startedAt);
    expect(calls.mediaChanged$.value).toBeGreaterThan(revision);
    expect(calls.connectionQuality$.value).toBe('unknown');
    expect(room.localParticipant.setMicrophoneEnabled.calls.count()).toBe(previousMic);
    expect(room.localParticipant.setCameraEnabled.calls.count()).toBe(previousCamera);
    expect(room.disconnect).not.toHaveBeenCalled();
    calls.end();
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/transport-reconnect/end')).flush(null);
  });

  it('reports lost camera and microphone publications after reconnection without restarting capture', async () => {
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const listeners=new Map<string,(...args:any[])=>void>();
    const videoTrackPublications=new Map<string,any>([
      ['camera',{source:Track.Source.Camera,track:{},isMuted:false}]
    ]);
    const audioTrackPublications=new Map<string,any>([
      ['microphone',{source:Track.Source.Microphone,track:{},isMuted:false}]
    ]);
    const localParticipant={
      videoTrackPublications, audioTrackPublications,
      setMicrophoneEnabled:jasmine.createSpy('mic').and.resolveTo(),
      setCameraEnabled:jasmine.createSpy('camera').and.resolveTo()
    };
    const room:any={
      on:jasmine.createSpy('on').and.callFake((event:string,cb:(...args:any[])=>void)=>{
        listeners.set(event,cb);return room;
      }),
      connect:jasmine.createSpy('connect').and.resolveTo(),
      disconnect:jasmine.createSpy('disconnect').and.resolveTo(),
      canPlaybackAudio:true,
      remoteParticipants:new Map([['peer',{identity:'peer'}]]),
      localParticipant
    };
    spyOn(calls as any,'createRoom').and.returnValue(room);
    const starting=calls.start('bea','voice');
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/bea')).flush({
      callId:'missing-publications',peer:'bea',media:'voice',
      serverUrl:'wss://livekit.example.test',token:'fixture',
      expiresAt:new Date(Date.now()+60000).toISOString()
    });
    await starting;
    calls.state$.next({...calls.state$.value!,phase:'active',micEnabled:true,cameraEnabled:true});
    const micCalls=localParticipant.setMicrophoneEnabled.calls.count();
    const cameraCalls=localParticipant.setCameraEnabled.calls.count();

    listeners.get(RoomEvent.Reconnecting)?.();
    videoTrackPublications.clear();
    audioTrackPublications.clear();
    listeners.get(RoomEvent.Reconnected)?.();

    expect(calls.state$.value?.phase).toBe('active');
    expect(calls.state$.value?.cameraEnabled).toBeFalse();
    expect(calls.state$.value?.micEnabled).toBeFalse();
    expect(calls.state$.value?.error).toBe('calls.microphoneMissing');
    expect(localParticipant.setMicrophoneEnabled.calls.count()).toBe(micCalls);
    expect(localParticipant.setCameraEnabled.calls.count()).toBe(cameraCalls);
    calls.end();
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/missing-publications/end')).flush(null);
  });

  it('refreshes remote camera tiles on publish, unpublish and subscription failures, but ignores stale rooms', async () => {
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const listeners=new Map<string,(...args:any[])=>void>();
    const room:any={
      on:jasmine.createSpy('on').and.callFake((event:string,cb:(...args:any[])=>void)=>{
        listeners.set(event,cb);return room;
      }),
      connect:jasmine.createSpy('connect').and.resolveTo(),
      disconnect:jasmine.createSpy('disconnect').and.resolveTo(),
      canPlaybackAudio:true,
      remoteParticipants:new Map([['peer',{identity:'peer'}]]),
      localParticipant:{setMicrophoneEnabled:jasmine.createSpy('mic').and.resolveTo()}
    };
    spyOn(calls as any,'createRoom').and.returnValue(room);
    const starting=calls.start('bea','voice');
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/bea')).flush({
      callId:'remote-media-events',peer:'bea',media:'voice',
      serverUrl:'wss://livekit.example.test',token:'fixture',
      expiresAt:new Date(Date.now()+60000).toISOString()
    });
    await starting;
    for (const event of [
      RoomEvent.TrackPublished, RoomEvent.TrackUnpublished,
      RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackSubscriptionFailed
    ]) {
      const revision=calls.mediaChanged$.value;
      expect(listeners.has(event)).toBeTrue();
      listeners.get(event)?.();
      expect(calls.mediaChanged$.value).toBe(revision+1);
    }
    calls.end();
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/remote-media-events/end')).flush(null);
    const afterEnd=calls.mediaChanged$.value;
    listeners.get(RoomEvent.TrackSubscribed)?.();
    listeners.get(RoomEvent.TrackUnpublished)?.();
    expect(calls.mediaChanged$.value).toBe(afterEnd);
  });

  it('does not reactivate a call without a remote peer after reconnect', async () => {
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const listeners=new Map<string,(...args:any[])=>void>();
    const room:any={
      on:jasmine.createSpy('on').and.callFake((event:string,cb:(...args:any[])=>void)=>{
        listeners.set(event,cb);return room;
      }),
      connect:jasmine.createSpy('connect').and.resolveTo(),
      disconnect:jasmine.createSpy('disconnect').and.resolveTo(),
      canPlaybackAudio:true,
      remoteParticipants:new Map(),
      localParticipant:{setMicrophoneEnabled:jasmine.createSpy('mic').and.resolveTo()}
    };
    spyOn(calls as any,'createRoom').and.returnValue(room);
    const starting=calls.start('bea','voice');
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/bea')).flush({
      callId:'empty-reconnect',peer:'bea',media:'voice',serverUrl:'wss://livekit.example.test',
      token:'fixture',expiresAt:new Date(Date.now()+60000).toISOString()
    });
    await starting;
    listeners.get(RoomEvent.Reconnecting)?.();
    listeners.get(RoomEvent.Reconnected)?.();
    expect(calls.state$.value?.phase).toBe('connecting');
    expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledTimes(1);
    calls.end();
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/empty-reconnect/end')).flush(null);
  });

  it('allows an established call to continue without microphone permission', async () => {
    http.expectOne(r => r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const room = {
      on: jasmine.createSpy('on').and.callFake(() => room),
      connect: jasmine.createSpy('connect').and.resolveTo(),
      disconnect: jasmine.createSpy('disconnect').and.resolveTo(),
      remoteParticipants: new Map(),
      localParticipant: {
        setMicrophoneEnabled: jasmine.createSpy('microphone').and.rejectWith(new Error('Denied')),
        setCameraEnabled: jasmine.createSpy('camera').and.resolveTo()
      }
    };
    spyOn(calls as any, 'createRoom').and.returnValue(room);
    const starting=calls.start('bea','video');
    http.expectOne(r => r.url.endsWith('/api/calls/direct/bea'))
      .flush({callId:'call-media',peer:'bea',media:'video',
        serverUrl:'wss://livekit.example.test',token:'fixture',
        expiresAt:new Date(Date.now()+60_000).toISOString()});
    await starting;
    expect(calls.state$.value?.id).toBe('call-media');
    expect(calls.state$.value?.phase).toBe('dialing');
    expect(calls.state$.value?.micEnabled).toBeFalse();
    expect(calls.state$.value?.cameraEnabled).toBeTrue();
    expect(calls.state$.value?.error).toBe('calls.microphoneAccessError');
    expect(room.disconnect).not.toHaveBeenCalled();
    http.expectNone(r => r.url.endsWith('/api/calls/direct/call-media/end'));
    room.localParticipant.setMicrophoneEnabled.and.resolveTo();
    await calls.setMicrophone(true);
    expect(calls.state$.value?.micEnabled).toBeTrue();
    expect(calls.state$.value?.error).toBeUndefined();
    calls.end();
    http.expectOne(r => r.url.endsWith('/api/calls/direct/call-media/end')).flush(null);
  });

  it('keeps an unexpected LiveKit disconnect visible instead of silently closing', async () => {
    http.expectOne(r => r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const listeners = new Map<string, () => void>();
    const room = {
      on: jasmine.createSpy('on').and.callFake((event: string, cb: () => void) => {
        listeners.set(event, cb); return room;
      }),
      connect: jasmine.createSpy('connect').and.resolveTo(),
      disconnect: jasmine.createSpy('disconnect').and.resolveTo(),
      remoteParticipants: new Map(),
      localParticipant: {setMicrophoneEnabled: jasmine.createSpy('microphone').and.resolveTo()}
    };
    spyOn(calls as any, 'createRoom').and.returnValue(room);
    const starting=calls.start('bea','voice');
    http.expectOne(r => r.url.endsWith('/api/calls/direct/bea'))
      .flush({callId:'call-disconnected',peer:'bea',media:'voice',
        serverUrl:'wss://livekit.example.test',token:'fixture',
        expiresAt:new Date(Date.now()+60_000).toISOString()});
    await starting;
    listeners.get('disconnected')?.();
    http.expectOne(r => r.url.endsWith('/api/calls/direct/call-disconnected/end')).flush(null);
    expect(calls.state$.value?.phase).toBe('error');
    expect(calls.state$.value?.error).toBe('calls.connectionLost');
    calls.closeError();
  });

  it('rejects outgoing calls before backend readiness is confirmed', async () => {
    http.expectOne(r => r.url.endsWith('/api/calls/direct/availability')).flush({enabled:false});
    await calls.start('bea','voice');
    http.expectNone(r => r.url.endsWith('/api/calls/direct/bea'));
    expect(calls.state$.value).toBeNull();
  });

  it('preserves a call when the same account receives a refreshed access token', async () => {
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const room = {
      on: jasmine.createSpy('on').and.callFake(() => room),
      connect: jasmine.createSpy('connect').and.resolveTo(),
      disconnect: jasmine.createSpy('disconnect').and.resolveTo(),
      remoteParticipants: new Map(),
      localParticipant: {setMicrophoneEnabled: jasmine.createSpy('microphone').and.resolveTo()}
    };
    spyOn(calls as any,'createRoom').and.returnValue(room);
    const firstToken = localStorage.getItem('t')!;
    const starting = calls.start('bea','voice');
    const request = http.expectOne(r=>r.url.endsWith('/api/calls/direct/bea'));
    const rotated = firstToken + '-refreshed';
    (localStorage.getItem as jasmine.Spy).and.callFake((key:string)=>key==='t'?rotated:null);
    calls.ensureConnected();
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    request.flush({callId:'still-active',peer:'bea',media:'voice',
      serverUrl:'wss://livekit.example.test',token:'fixture',
      expiresAt:new Date(Date.now()+60000).toISOString()});
    await starting;
    expect(room.connect).toHaveBeenCalled();
    expect(room.disconnect).not.toHaveBeenCalled();
    expect(calls.state$.value?.id).toBe('still-active');
    http.expectNone(r=>r.url.endsWith('/api/calls/direct/still-active/end'));
    calls.end();
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/still-active/end')).flush(null);
  });

  it('does not terminate the call during a peer full-WebRTC reconnection', async () => {
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const listeners = new Map<string,()=>void>();
    const peers = new Map<string,object>([['peer',{identity:'peer'}]]);
    const room = {
      on: jasmine.createSpy('on').and.callFake((event:string, cb:()=>void)=>{
        listeners.set(event,cb);return room;
      }),
      connect: jasmine.createSpy('connect').and.resolveTo(),
      disconnect: jasmine.createSpy('disconnect').and.resolveTo(),
      remoteParticipants: peers,
      localParticipant:{setMicrophoneEnabled:jasmine.createSpy('mic').and.resolveTo()}
    };
    spyOn(calls as any,'createRoom').and.returnValue(room);
    const starting=calls.start('bea','voice');
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/bea'))
      .flush({callId:'rejoin',peer:'bea',media:'voice',
        serverUrl:'wss://livekit.example.test',token:'fixture',
        expiresAt:new Date(Date.now()+60000).toISOString()});
    await starting;
    peers.clear();
    listeners.get('participantDisconnected')?.();
    expect(calls.state$.value?.phase).toBe('connecting');
    http.expectNone(r=>r.url.endsWith('/api/calls/direct/rejoin/end'));
    peers.set('peer',{identity:'peer'});
    listeners.get('participantConnected')?.();
    expect(calls.state$.value?.phase).toBe('active');
    http.expectNone(r=>r.url.endsWith('/api/calls/direct/rejoin/end'));
    calls.end();
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/rejoin/end')).flush(null);
  });

  it('reports real provider readiness separately from absent settings', () => {
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/availability'))
      .flush({enabled:false,status:'invalidCredentials'});
    expect(calls.available$.value).toBeFalse();
    expect(calls.availabilityStatus$.value).toBe('invalidCredentials');
    calls.refreshAvailability();
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/availability'))
      .flush({enabled:false,status:'providerUnavailable'});
    expect(calls.availabilityStatus$.value).toBe('providerUnavailable');
  });


  it('only sends invited members to the scoped authenticated endpoint in an active room', async () => {
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const room={remoteParticipants:new Map(),localParticipant:{},disconnect:jasmine.createSpy('disconnect')};
    calls.room=room as any;
    calls.state$.next({id:'call-123',peer:'bea',media:'voice',phase:'active',
      micEnabled:true,cameraEnabled:false});
    const sending=calls.inviteMember('carlos');
    const request=http.expectOne(r=>r.url.endsWith('/api/calls/direct/call-123/invite/carlos'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush(null);
    await sending;
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/call-123/members'))
      .flush({participants:[{username:'ana',identity:'jynlo-user-12'},
        {username:'bea',identity:'jynlo-user-13'}],pending:['carlos']});
    expect(calls.members$.value.pending).toEqual(['carlos']);
    expect(calls.invitationError$.value).toBeNull();
    calls.end();
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/call-123/end')).flush(null);
  });

  it('does not invite from a pending call or leak a stale membership response across logout', async () => {
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const invalid=await calls.inviteMember('carlos');
    expect(invalid).toBeFalse();
    http.expectNone(r=>r.url.includes('/invite/'));
    calls.room={remoteParticipants:new Map(),disconnect:()=>{}} as any;
    calls.state$.next({id:'privacy-call',peer:'bea',media:'video',phase:'active',
      micEnabled:true,cameraEnabled:false});
    calls.refreshMembers();
    const pending=http.expectOne(r=>r.url.endsWith('/api/calls/direct/privacy-call/members'));
    calls.end();
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/privacy-call/end')).flush(null);
    pending.flush({participants:[{username:'ana',identity:'jynlo-user-12'}],pending:[]});
    expect(calls.members$.value.participants).toEqual([]);
  });

  it('reacts to authenticated group changes without ending the remaining callers', () => {
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    calls.room={remoteParticipants:new Map(),disconnect:()=>{}} as any;
    calls.state$.next({id:'call-123',peer:'bea',media:'voice',phase:'active',
      micEnabled:true,cameraEnabled:false});
    const expiry=new Date(Date.now()+50000).toISOString();
    events.next({callId:'call-123',caller:'ana',peer:'bea',actor:'carlos',media:'voice',
      status:'MEMBERS_CHANGED',expiresAt:expiry});
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/call-123/members'))
      .flush({participants:[{username:'ana',identity:'jynlo-user-12'},
        {username:'bea',identity:'jynlo-user-13'},
        {username:'carlos',identity:'jynlo-user-14'}],pending:[]});
    expect(calls.members$.value.participants).toHaveSize(3);
    events.next({callId:'call-123',caller:'ana',peer:'carlos',actor:'carlos',media:'voice',
      status:'LEFT',expiresAt:expiry});
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/call-123/members'))
      .flush({participants:[{username:'ana',identity:'jynlo-user-12'},
        {username:'bea',identity:'jynlo-user-13'}],pending:[]});
    expect(calls.state$.value?.phase).toBe('active');
    expect(calls.members$.value.participants).toHaveSize(2);
    calls.end();
    http.expectOne(r=>r.url.endsWith('/api/calls/direct/call-123/end')).flush(null);
  });

  it('handles a backend call conflict with an actionable error instead of showing a phantom call', async () => {
    http.expectOne(r => r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const sending=calls.start('bea','video');
    const request=http.expectOne(r => r.url.endsWith('/api/calls/direct/bea'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({media:'video'});
    request.flush({message:'Already in a call'}, {status:409,statusText:'Conflict'});
    await sending;
    expect(calls.state$.value?.phase).toBe('error');
    expect(calls.state$.value?.error).toBe('calls.busy');
    calls.closeError();
    expect(calls.state$.value).toBeNull();
  });

  it('explains the exact signalling failure class instead of always saying unavailable', async () => {
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/availability'))
      .flush({enabled:true});
    const examples: Array<{status:number; statusText:string; key:string}> = [
      {status:403,statusText:'Forbidden',key:'calls.notAllowed'},
      {status:409,statusText:'Conflict',key:'calls.busy'},
      {status:429,statusText:'Too Many Requests',key:'calls.rateLimited'},
      {status:503,statusText:'Unavailable',key:'calls.providerUnavailable'},
      {status:500,statusText:'Server Error',key:'calls.serverError'},
      {status:401,statusText:'Unauthorized',key:'calls.sessionExpired'},
      {status:0,statusText:'Unknown Error',key:'calls.networkError'}
    ];
    for (const item of examples) {
      const sending=calls.start('bea','voice');
      http.expectOne(req => req.url.endsWith('/api/calls/direct/bea'))
        .flush({message:'hidden backend detail'}, {status:item.status,statusText:item.statusText});
      await sending;
      expect(calls.state$.value?.phase).toBe('error');
      expect(calls.state$.value?.error).toBe(item.key);
      calls.closeError();
    }
  });

  it('reports unexpected local camera and microphone loss without restarting capture', async () => {
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const listeners=new Map<string,(...args:any[])=>void>();
    const room:any={
      on:jasmine.createSpy('on').and.callFake((event:string,handler:(...args:any[])=>void)=>{
        listeners.set(event,handler); return room;
      }),
      connect:jasmine.createSpy('connect').and.resolveTo(),
      disconnect:jasmine.createSpy('disconnect').and.resolveTo(),
      remoteParticipants:new Map(),
      localParticipant:{
        setMicrophoneEnabled:jasmine.createSpy('mic').and.resolveTo(),
        setCameraEnabled:jasmine.createSpy('camera').and.resolveTo()
      }
    };
    spyOn(calls as any,'createRoom').and.returnValue(room);
    const starting=calls.start('bea','voice');
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/bea')).flush({
      callId:'track-lost',peer:'bea',media:'voice',serverUrl:'wss://livekit.example.test',
      token:'fixture',expiresAt:new Date(Date.now()+60000).toISOString()
    });
    await starting;
    calls.state$.next({...calls.state$.value!,phase:'active',micEnabled:true,cameraEnabled:true});
    const micCalls=room.localParticipant.setMicrophoneEnabled.calls.count();
    const camCalls=room.localParticipant.setCameraEnabled.calls.count();
    listeners.get(RoomEvent.LocalTrackUnpublished)?.({source:'camera'});
    expect(calls.state$.value?.cameraEnabled).toBeFalse();
    expect(calls.state$.value?.error).toBe('calls.cameraMissing');
    expect(calls.state$.value?.micEnabled).toBeTrue();
    listeners.get(RoomEvent.TrackMuted)?.({source:'microphone'},room.localParticipant);
    expect(calls.state$.value?.micEnabled).toBeFalse();
    expect(calls.state$.value?.error).toBe('calls.microphoneMissing');
    expect(calls.state$.value?.phase).toBe('active');
    expect(room.localParticipant.setMicrophoneEnabled.calls.count()).toBe(micCalls);
    expect(room.localParticipant.setCameraEnabled.calls.count()).toBe(camCalls);
    expect(room.disconnect).not.toHaveBeenCalled();
    calls.end();
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/track-lost/end')).flush(null);
  });

  it('ignores remote mutes and voluntary camera toggles during a media operation', async () => {
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const listeners=new Map<string,(...args:any[])=>void>();
    const room:any={
      on:jasmine.createSpy('on').and.callFake((event:string,handler:(...args:any[])=>void)=>{
        listeners.set(event,handler); return room;
      }),
      connect:jasmine.createSpy('connect').and.resolveTo(),
      disconnect:jasmine.createSpy('disconnect').and.resolveTo(),
      remoteParticipants:new Map(),
      localParticipant:{setMicrophoneEnabled:jasmine.createSpy('mic').and.resolveTo()}
    };
    spyOn(calls as any,'createRoom').and.returnValue(room);
    const starting=calls.start('bea','voice');
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/bea')).flush({
      callId:'track-safe',peer:'bea',media:'voice',serverUrl:'wss://livekit.example.test',
      token:'fixture',expiresAt:new Date(Date.now()+60000).toISOString()
    });
    await starting;
    calls.state$.next({...calls.state$.value!,phase:'active',micEnabled:true,cameraEnabled:true});
    listeners.get(RoomEvent.TrackMuted)?.({source:'microphone'},{identity:'remote'});
    expect(calls.state$.value?.micEnabled).toBeTrue();
    calls.busyMedia$.next(true);
    listeners.get(RoomEvent.LocalTrackUnpublished)?.({source:'camera'});
    expect(calls.state$.value?.cameraEnabled).toBeTrue();
    calls.busyMedia$.next(false);
    calls.end();
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/track-safe/end')).flush(null);
  });

  it('ignores replayed expired invitations instead of ringing indefinitely', () => {
    http.expectOne(r => r.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    events.next({callId:'abc',caller:'bea',peer:'ana',media:'video',
      status:'RINGING',actor:'bea',expiresAt:new Date(Date.now()-10000).toISOString()});
    expect(calls.state$.value).toBeNull();
  });
  it('recovers disconnected selected microphone without ending the LiveKit call', async () => {
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const room:any = {
      switchActiveDevice:jasmine.createSpy('switch').and.resolveTo(true),
      disconnect:jasmine.createSpy('disconnect')
    };
    calls.room = room;
    calls.state$.next({id:'keep-active',peer:'bea',phase:'active',media:'voice',
      micEnabled:true,cameraEnabled:false,startedAt:Date.now()});
    calls.selectedDevices$.next({audioinput:'unplugged-mic'});
    spyOn(calls,'refreshDevices').and.callFake(async () => {
      calls.devices$.next([{kind:'audioinput',deviceId:'built-in',label:'Built-in'} as MediaDeviceInfo]);
      calls.selectedDevices$.next({});
      calls.deviceScanStatus$.next('ready');
    });
    await (calls as any).recoverDisconnectedDevices();
    expect(room.switchActiveDevice).toHaveBeenCalledOnceWith('audioinput','default');
    expect(calls.state$.value?.phase).toBe('active');
    expect(calls.state$.value?.micEnabled).toBeTrue();
    expect(room.disconnect).not.toHaveBeenCalled();
    calls.room = null;
  });

  it('does not start a microphone when it was muted before unplugging', async () => {
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const room:any = {switchActiveDevice:jasmine.createSpy('switch')};
    calls.room = room;
    calls.state$.next({id:'muted',peer:'bea',phase:'active',media:'voice',
      micEnabled:false,cameraEnabled:false,startedAt:Date.now()});
    calls.selectedDevices$.next({audioinput:'unplugged-mic'});
    spyOn(calls,'refreshDevices').and.callFake(async () => {
      calls.devices$.next([]);
      calls.selectedDevices$.next({});
      calls.deviceScanStatus$.next('ready');
    });
    await (calls as any).recoverDisconnectedDevices();
    expect(room.switchActiveDevice).not.toHaveBeenCalled();
    expect(calls.state$.value?.micEnabled).toBeFalse();
    calls.room = null;
  });

  it('reports a failed fallback but keeps the active call and other tracks', async () => {
    http.expectOne(req=>req.url.endsWith('/api/calls/direct/availability')).flush({enabled:true});
    const room:any = {
      switchActiveDevice:jasmine.createSpy('switch').and.rejectWith(
        new DOMException('Camera busy','NotReadableError')),
      disconnect:jasmine.createSpy('disconnect')
    };
    calls.room = room;
    calls.state$.next({id:'failed-fallback',peer:'bea',phase:'active',media:'video',
      micEnabled:true,cameraEnabled:true,startedAt:Date.now()});
    calls.selectedDevices$.next({videoinput:'disconnected-camera'});
    spyOn(calls,'refreshDevices').and.callFake(async () => {
      calls.devices$.next([]);
      calls.selectedDevices$.next({});
      calls.deviceScanStatus$.next('ready');
    });
    await (calls as any).recoverDisconnectedDevices();
    expect(room.switchActiveDevice).toHaveBeenCalledOnceWith('videoinput','default');
    expect(calls.state$.value?.error).toBe('calls.cameraBusy');
    expect(calls.state$.value?.micEnabled).toBeTrue();
    expect(calls.state$.value?.phase).toBe('active');
    expect(room.disconnect).not.toHaveBeenCalled();
    expect(calls.busyMedia$.value).toBeFalse();
    calls.room = null;
  });

});
