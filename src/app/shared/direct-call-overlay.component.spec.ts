import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { Track } from 'livekit-client';
import { CommunityService } from '../services/community.service';
import { DirectCallClientService, DirectCallState } from '../services/direct-call-client.service';
import { DirectCallOverlayComponent } from './direct-call-overlay.component';

describe('Global incoming call popup', () => {
  let fixture: ComponentFixture<DirectCallOverlayComponent>;
  let state: BehaviorSubject<DirectCallState | null>;
  let ringtoneBlocked: BehaviorSubject<boolean>;
  let calls: any;
  let navigate: jasmine.Spy;

  const invitation = (media: 'voice' | 'video' = 'video'): DirectCallState => ({
    id: 'call-one',
    peer: 'beatriz',
    media,
    phase: 'incoming',
    micEnabled: false,
    cameraEnabled: false,
    expiresAt: Date.now() + 60_000
  });

  beforeEach(async () => {
    localStorage.removeItem('d24-language');
    state = new BehaviorSubject<DirectCallState | null>(null);
    ringtoneBlocked = new BehaviorSubject(false);
    navigate = jasmine.createSpy('navigate').and.resolveTo(true);
    calls = {
      state$: state,
      mediaChanged$: new BehaviorSubject(0),
      connectionQuality$: new BehaviorSubject('unknown'),
      devices$: new BehaviorSubject([]),
      deviceScanStatus$: new BehaviorSubject('ready'),
      selectedDevices$: new BehaviorSubject({}),
      audioPlaybackBlocked$: new BehaviorSubject(false),
      ringtoneBlocked$: ringtoneBlocked,
      busyMedia$: new BehaviorSubject(false),
      screenShareEnabled$: new BehaviorSubject(false),
      members$: new BehaviorSubject({participants:[],pending:[]}),
      invitationBusy$: new BehaviorSubject(false),
      invitationError$: new BehaviorSubject(null),
      inviteMember: jasmine.createSpy('inviteMember').and.returnValue(Promise.resolve(true)),
      canShareScreen: false,
      room: null,
      accept: jasmine.createSpy('accept'),
      decline: jasmine.createSpy('decline'),
      closeError: jasmine.createSpy('closeError'),
      end: jasmine.createSpy('end'),
      allowRingtone: jasmine.createSpy('allowRingtone'),
      allowAudio: jasmine.createSpy('allowAudio'),
      refreshDevices: jasmine.createSpy('refreshDevices')
    };
    await TestBed.configureTestingModule({
      imports: [DirectCallOverlayComponent],
      providers: [{provide: Router, useValue:{navigate}},
        {provide: DirectCallClientService, useValue: calls},
        {provide: CommunityService, useValue: {
          friends: () => of([{username:'carlos',fullName:'Carlos Silva',nickname:'Carlos',profilePicUrl:null,chatBlocked:false,blockedByMe:false}]),
          publicProfile: (username: string) => of({username, profilePicUrl: username === 'beatriz' ? 'https://example.com/beatriz.jpg' : null})
        }}]
    }).compileComponents();
    fixture = TestBed.createComponent(DirectCallOverlayComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    localStorage.removeItem('d24-language');
  });

  it('subscribes to live video revisions in expanded calls so the self preview refreshes', () => {
    state.next({...invitation('video'), phase:'active', cameraEnabled:true, startedAt:Date.now()});
    fixture.detectChanges();
    const expanded=fixture.nativeElement.querySelector('.call-backdrop') as HTMLElement;
    expect(expanded).not.toBeNull();
    expect(expanded.querySelector('.call-refresh')).not.toBeNull();
    calls.mediaChanged$.next(7);
    fixture.detectChanges();
    expect(expanded.querySelector('.call-refresh')?.textContent).toContain('7');
  });

  it('focuses a camera, switches participant and restores the layout with Escape', () => {
    const self = {identity:'local-user', videoTrackPublications:new Map()} as any;
    const friend = {identity:'remote-user', videoTrackPublications:new Map()} as any;
    calls.room = {localParticipant:self,remoteParticipants:new Map([['remote-user',friend]])};
    state.next({...invitation('video'),phase:'active',startedAt:Date.now()});
    const overlay = fixture.componentInstance;
    overlay.toggleCameraFocus('remote-user');
    expect(overlay.focusedCamera).toBe(friend);
    expect(overlay.cameraZoomed).toBeFalse();
    overlay.zoomCamera('remote-user');
    expect(overlay.cameraZoomed).toBeTrue();
    overlay.toggleCameraFocus('local-user');
    expect(overlay.focusedCamera).toBe(self);
    expect(overlay.cameraZoomed).toBeFalse();
    overlay.onEscapeCameraFocus();
    expect(overlay.focusedCamera).toBeNull();
    expect(overlay.cameraZoomed).toBeFalse();
  });

  it('clears any enlarged camera when a call ends', () => {
    const overlay = fixture.componentInstance;
    state.next({...invitation('video'),phase:'active',startedAt:Date.now()});
    overlay.zoomCamera('remote-user');
    expect(overlay.cameraZoomed).toBeTrue();
    state.next(null);
    expect(overlay.focusedCameraIdentity).toBeNull();
    expect(overlay.cameraZoomed).toBeFalse();
  });

  it('shows the caller public profile photo instead of the initial when available', () => {
    state.next(invitation('voice'));
    fixture.detectChanges();
    const img = fixture.nativeElement.querySelector('.call-incoming-avatar img') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('https://example.com/beatriz.jpg');

    // A broken image must fall back to initials, not leave an empty circle.
    img.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.call-incoming-avatar img')).toBeNull();
    expect(fixture.nativeElement.querySelector('.call-incoming-avatar').textContent).toContain('B');
  });

  it('uses roster identity for group avatars instead of showing the original caller on every tile', () => {
    const overlay = fixture.componentInstance;
    const self = {identity:'jynlo-user-1'} as any;
    const originalPeer = {identity:'jynlo-user-2'} as any;
    const guest = {identity:'jynlo-user-3'} as any;
    calls.room = {
      localParticipant: self,
      remoteParticipants: new Map([
        ['peer', originalPeer],
        ['guest', guest]
      ])
    };
    state.next({...invitation('voice'), phase:'active', startedAt: Date.now()});

    // The room may connect before the roster arrives. Unknown group
    // identities must not inherit the original peer's photograph.
    expect(overlay.participantUsername(guest)).toBeNull();
    expect(overlay.participantUsername(originalPeer)).toBeNull();
    expect(overlay.participantUsername(self)).toBeNull();

    calls.members$.next({participants:[
      {identity:'jynlo-user-1',username:'ana'},
      {identity:'jynlo-user-2',username:'beatriz'},
      {identity:'jynlo-user-3',username:'carlos'}
    ],pending:[]});
    expect(overlay.participantUsername(self)).toBe('ana');
    expect(overlay.participantUsername(originalPeer)).toBe('beatriz');
    expect(overlay.participantUsername(guest)).toBe('carlos');

    calls.room.remoteParticipants.delete('guest');
    calls.members$.next({participants:[], pending:[]});
    expect(overlay.participantUsername(originalPeer)).toBeNull(
      'Even a sole remote cannot be identified without the verified roster');
  });

  it('resets presentation, focus and both playback volumes between calls', () => {
    state.next({...invitation('video'), phase: 'active', startedAt: Date.now()});
    const overlay = fixture.componentInstance;
    overlay.focusedPresentationIdentity = 'old-presenter';
    overlay.showOwnSharePreview = false;
    overlay.presentationZoomed = true;
    overlay.focusOnly = true;
    overlay.setVolume('old-member', 25);
    overlay.setScreenVolume('old-member', 40);

    state.next(null);
    expect(overlay.focusedPresentationIdentity).toBeNull();
    expect(overlay.showOwnSharePreview).toBeTrue();
    expect(overlay.presentationZoomed).toBeFalse();
    expect(overlay.focusOnly).toBeFalse();
    expect(overlay.volumeFor('old-member')).toBe(1);
    expect(overlay.screenVolumeFor('old-member')).toBe(1);

    state.next({...invitation('video'), id: 'call-two', phase: 'active', startedAt: Date.now()});
    fixture.detectChanges();
    expect(overlay.focusOnly).toBeFalse();
    expect(overlay.presentationZoomed).toBeFalse();
  });

  it('does not cover or block any page while there is no call', () => {
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('.call-incoming-float')).toBeNull();
    expect(host.querySelector('.call-backdrop')).toBeNull();
  });

  it('shows an accessible, non-modal floating card with the caller and media type', () => {
    state.next(invitation());
    fixture.detectChanges();
    const popup: HTMLElement = fixture.nativeElement.querySelector('.call-incoming-float');
    expect(popup).not.toBeNull();
    expect(popup.getAttribute('role')).toBe('alertdialog');
    expect(popup.getAttribute('aria-modal')).toBe('false');
    expect(popup.textContent).toContain('beatriz');
    expect(popup.textContent).toContain('Videochamada');
    expect(popup.querySelectorAll('.call-incoming-actions button').length).toBe(2);
    expect(fixture.nativeElement.querySelector('.call-backdrop')).toBeNull();
  });

  it('accepts from the compact card and transitions to the existing full call view', () => {
    state.next(invitation('voice'));
    calls.accept.and.callFake(() => {
      state.next({...invitation('voice'), phase: 'connecting'});
      return Promise.resolve();
    });
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.call-incoming-accept') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(calls.accept).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('.call-incoming-float')).toBeNull();
    const dialog: HTMLElement = fixture.nativeElement.querySelector('.call-backdrop');
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('beatriz');
  });


  it('shows a clean connecting state without premature clock or connection quality', () => {
    state.next({...invitation('voice'), phase:'dialing'});
    fixture.detectChanges();
    const body = fixture.nativeElement as HTMLElement;
    expect(body.querySelector('.connect-waiting')).toBeTruthy();
    expect(body.querySelector('.call-metric')).toBeNull();
    expect(body.textContent).toContain('À espera de resposta');
    expect(body.querySelector('.call-brand')?.textContent).toContain('Connect');
  });

  it('supports minimized mode without terminating the live call', () => {
    state.next({...invitation('voice'),phase:'active',startedAt:Date.now()});
    fixture.detectChanges();
    const minimize=fixture.nativeElement.querySelector('.connect-minimize') as HTMLButtonElement;
    expect(minimize).toBeTruthy();
    minimize.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.call-backdrop')).toBeNull();
    expect(fixture.nativeElement.querySelector('.connect-mini')).toBeTruthy();
    expect(calls.end).not.toHaveBeenCalled();
    (fixture.nativeElement.querySelector('.connect-mini-expand') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.call-backdrop')).toBeTruthy();
    state.next(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.connect-mini')).toBeNull();
  });

  it('finds eligible friends in the invitation picker', () => {
    state.next({...invitation('voice'),phase:'active',startedAt:Date.now()});
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.connect-invite-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.connect-contact-option')?.textContent).toContain('Carlos');
    // Query filtering is a pure component getter; test without triggering
    // ngModel's deferred write-back during Angular change detection.
    fixture.componentInstance.inviteUsername = 'nobody';
    expect(fixture.componentInstance.matchingContacts).toEqual([]);
  });

  it('invites a username only through the authenticated calling service', async () => {
    state.next({...invitation('voice'),phase:'active',startedAt:Date.now()});
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.connect-invite-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const input=fixture.nativeElement.querySelector('#connect-invite-name') as HTMLInputElement;
    expect(input).toBeTruthy();
    input.value='carlos';
    fixture.componentInstance.inviteUsername = 'carlos';
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.connect-invite-form button') as HTMLButtonElement).click();
    // The call clock intentionally runs continuously, so whenStable() never
    // resolves. Flush only the invitation's own microtask.
    await Promise.resolve();
    fixture.detectChanges();
    expect(calls.inviteMember).toHaveBeenCalledOnceWith('carlos');
    expect(fixture.componentInstance.inviteUsername).toBe('');
    expect(calls.end).not.toHaveBeenCalled();
  });

  it('exposes a camera toggle even if the call began as voice only', () => {
    state.next({...invitation('voice'),phase:'active',startedAt:Date.now()});
    fixture.detectChanges();
    const controls = fixture.nativeElement.querySelectorAll('.call-buttons button') as NodeListOf<HTMLButtonElement>;
    expect(Array.from(controls).some(button=>button.textContent?.includes('Ativar câmara'))).toBeTrue();
    expect(Array.from(controls).some(button=>button.textContent?.includes('Convidar pessoas'))).toBeTrue();
  });
  it('rejects a call without showing the full screen or navigating', () => {
    state.next(invitation());
    calls.decline.and.callFake(() => state.next(null));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.call-incoming-decline') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(calls.decline).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('.call-backdrop')).toBeNull();
    expect(fixture.nativeElement.querySelector('.call-incoming-float')).toBeNull();
  });

  it('offers the sound unlock only when browser autoplay was blocked', () => {
    state.next(invitation());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.call-incoming-audio')).toBeNull();
    ringtoneBlocked.next(true);
    fixture.detectChanges();
    const unlock: HTMLButtonElement = fixture.nativeElement.querySelector('.call-incoming-audio button');
    expect(unlock).not.toBeNull();
    unlock.click();
    expect(calls.allowRingtone).toHaveBeenCalledTimes(1);
  });

  it('uses the same compact incoming UI for voice calls and Escape to reject', () => {
    state.next(invitation('voice'));
    fixture.detectChanges();
    const popup: HTMLElement = fixture.nativeElement.querySelector('.call-incoming-float');
    expect(popup.textContent).toContain('Chamada de voz');
    popup.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    expect(calls.decline).toHaveBeenCalledTimes(1);
  });

  it('removes the compact popup when a call expires or is answered on another device', () => {
    state.next(invitation());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.call-incoming-float')).not.toBeNull();
    state.next(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.call-incoming-float')).toBeNull();
  });
  it('opens the conversation without hanging up and keeps the call minimized', () => {
    state.next({...invitation(), phase:'active', startedAt:Date.now()});
    fixture.detectChanges();
    const chatButton = fixture.nativeElement.querySelector('.connect-chat-button') as HTMLButtonElement;
    expect(chatButton).toBeTruthy();
    chatButton.click();
    expect(fixture.componentInstance.minimized).toBeTrue();
    expect(navigate).toHaveBeenCalledOnceWith(['/menu/messages'], {
      queryParams: {kind:'direct', id:'beatriz'}
    });
    expect(calls.end).not.toHaveBeenCalled();
  });

  it('uses audio-only participant tiles when minimized, without stopping the call', () => {
    const local = {identity:'local',videoTrackPublications:new Map(),audioTrackPublications:new Map()};
    const remote = {identity:'remote',videoTrackPublications:new Map(),audioTrackPublications:new Map()};
    calls.room = {localParticipant:local,remoteParticipants:new Map([['remote',remote]])};
    state.next({...invitation('video'),phase:'active',startedAt:Date.now()});
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.connect-minimize') as HTMLButtonElement).click();
    fixture.detectChanges();
    const tile = fixture.debugElement.query(
      element => element.name === 'app-call-participant-tile');
    expect(tile).toBeTruthy();
    expect(tile.componentInstance.audioOnly).toBeTrue();
    expect(calls.end).not.toHaveBeenCalled();
  });

  it('observes LiveKit track revisions while minimized so remote audio tiles update', () => {
    state.next({...invitation('voice'),phase:'active',startedAt:Date.now()});
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.connect-minimize') as HTMLButtonElement).click();
    fixture.detectChanges();
    const refresh = fixture.nativeElement.querySelector('.connect-mini .call-refresh') as HTMLElement;
    expect(refresh).toBeTruthy();
    expect(refresh.textContent).toContain('0');
    calls.mediaChanged$.next(1);
    fixture.detectChanges();
    expect(refresh.textContent).toContain('1');
    expect(calls.end).not.toHaveBeenCalled();
  });

  it('keeps the minimized call interactive without preventing message composition', () => {
    state.next({...invitation('voice'),phase:'active',startedAt:Date.now()});
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.connect-minimize') as HTMLButtonElement).click();
    fixture.detectChanges();
    const floating=fixture.nativeElement.querySelector('.connect-mini') as HTMLElement;
    expect(floating).toBeTruthy();
    expect(floating.querySelectorAll('button').length).toBe(3);
    expect(floating.querySelector('.connect-mini-chat')).toBeTruthy();
    expect(floating.querySelector('.connect-mini-expand')).toBeTruthy();
    expect(floating.querySelector('.connect-mini-hangup')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.call-backdrop')).toBeNull();
    expect(calls.end).not.toHaveBeenCalled();
  });

  it('lets the user switch between the minimized call and chat without ending the call', () => {
    state.next({...invitation('video'),phase:'active',startedAt:Date.now()});
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.connect-minimize') as HTMLButtonElement).click();
    fixture.detectChanges();
    const mini = fixture.nativeElement.querySelector('.connect-mini') as HTMLElement;
    expect(mini).toBeTruthy();
    (mini.querySelector('.connect-mini-chat') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith(['/menu/messages'], {
      queryParams: {kind:'direct',id:'beatriz'}
    });
    expect(calls.end).not.toHaveBeenCalled();
    (mini.querySelector('.connect-mini-expand') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.call-backdrop')).toBeTruthy();
    expect(calls.end).not.toHaveBeenCalled();
  });

  it('labels the chat navigation in the selected language without ending the call', () => {
    state.next({...invitation('voice'),phase:'active',startedAt:Date.now()});
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.connect-chat-button') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toContain('sem terminar a chamada');
    (fixture.nativeElement.querySelector('.connect-minimize') as HTMLButtonElement).click();
    fixture.detectChanges();
    const compact = fixture.nativeElement.querySelector('.connect-mini-chat') as HTMLButtonElement;
    expect(compact.getAttribute('aria-label')).toContain('sem terminar a chamada');
    expect(calls.end).not.toHaveBeenCalled();
  });

  it('shows a real reconnecting status in the minimized call', () => {
    state.next({...invitation('voice'),phase:'connecting',startedAt:Date.now()});
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.connect-minimize') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.connect-mini-name')?.textContent)
      .toContain('A reconectar');
    expect(calls.end).not.toHaveBeenCalled();
  });

  it('explains how to select the entire monitor before starting a screen share', () => {
    calls.canShareScreen = true;
    state.next({...invitation('video'), phase:'active', startedAt:Date.now()});
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Ecrã inteiro');
    calls.screenShareEnabled$.next(true);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Ecrã inteiro');
  });

  it('does not show a redundant manual refresh button in media settings', () => {
    state.next({...invitation(), phase:'active', startedAt:Date.now()});
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.call-settings-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(calls.refreshDevices).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.call-scan')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Dispositivos detetados automaticamente');
  });

  it('keeps the presentation in a primary stage with both cameras in the filmstrip', () => {
    const makeTrack = () => ({
      attach: jasmine.createSpy('attach'),
      detach: jasmine.createSpy('detach')
    });
    const local = {
      identity: 'local',
      videoTrackPublications: new Map([
        ['camera', {source: Track.Source.Camera, track: makeTrack(), isMuted: false}]
      ]),
      audioTrackPublications: new Map(), isSpeaking: false, isMicrophoneEnabled: true
    };
    const remote = {
      identity: 'remote',
      videoTrackPublications: new Map([
        ['screen', {source: Track.Source.ScreenShare, track: makeTrack(), isMuted: false}],
        ['camera', {source: Track.Source.Camera, track: makeTrack(), isMuted: false}]
      ]),
      audioTrackPublications: new Map(), isSpeaking: false, isMicrophoneEnabled: true
    };
    calls.room = {localParticipant: local, remoteParticipants: new Map([['remote', remote]])};
    state.next({...invitation('video'), phase: 'active', startedAt: Date.now()});
    fixture.detectChanges();

    const body = fixture.nativeElement as HTMLElement;
    const stage = body.querySelector('.connect-presentation-stage');
    const filmstrip = body.querySelector('.connect-camera-strip');
    expect(stage).toBeTruthy();
    expect(stage?.querySelectorAll('app-call-participant-tile').length).toBe(1);
    expect(filmstrip?.querySelectorAll('app-call-participant-tile').length).toBe(2);
    expect(body.querySelectorAll('.connect-presentation-tile').length).toBe(1);
    expect(calls.end).not.toHaveBeenCalled();
  });

  it('always shows the publisher their own screen preview while spotlighting a remote share', () => {
    const track = () => ({
      attach: jasmine.createSpy('attach'),
      detach: jasmine.createSpy('detach')
    });
    const local = {
      identity: 'local',
      videoTrackPublications: new Map([
        ['screen', {source: Track.Source.ScreenShare, track: track(), isMuted: false}],
        ['camera', {source: Track.Source.Camera, track: track(), isMuted: false}]
      ]),
      audioTrackPublications: new Map(), isSpeaking: false, isMicrophoneEnabled: true
    };
    const remote = {
      identity: 'remote',
      videoTrackPublications: new Map([
        ['screen', {source: Track.Source.ScreenShare, track: track(), isMuted: false}]
      ]),
      audioTrackPublications: new Map(), isSpeaking: false, isMicrophoneEnabled: true
    };
    calls.room = { localParticipant: local, remoteParticipants: new Map([['remote', remote]]) };
    calls.setScreenShare = jasmine.createSpy('setScreenShare');
    state.next({...invitation('video'), phase: 'active', startedAt: Date.now()});
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.focusedPresentation?.identity).toBe('remote');
    expect(host.querySelectorAll('.connect-presentation-tile').length).toBe(1);
    expect(host.querySelectorAll('.connect-self-share-tile').length).toBe(1);
    expect(host.textContent).toContain('A tua partilha');

    const switcher = host.querySelector('.connect-share-switcher');
    expect(switcher?.querySelectorAll('button').length).toBe(2);
    (switcher?.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.focusedPresentation?.identity).toBe('local');
    expect(host.querySelectorAll('.connect-self-share-tile').length).toBe(1);

    (host.querySelector('.connect-self-share-heading button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelector('.connect-self-share-tile')).toBeNull();
    expect(host.querySelector('.connect-self-share-heading')).toBeTruthy();

    (host.querySelector('.connect-self-share-heading button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.querySelector('.connect-self-share-tile')).toBeTruthy();
    (host.querySelector('.connect-self-stop') as HTMLButtonElement).click();
    expect(calls.setScreenShare).toHaveBeenCalledWith(false);
    expect(calls.end).not.toHaveBeenCalled();
  });

  it('does not display a local publisher preview when only the remote person shares', () => {
    const track = () => ({attach: jasmine.createSpy('attach'), detach: jasmine.createSpy('detach')});
    const local = {identity:'local', videoTrackPublications:new Map(),
      audioTrackPublications:new Map(), isSpeaking:false, isMicrophoneEnabled:true};
    const remote = {identity:'remote',videoTrackPublications:new Map([
      ['screen',{source:Track.Source.ScreenShare,track:track(),isMuted:false}]
    ]),audioTrackPublications:new Map(), isSpeaking:false, isMicrophoneEnabled:true};
    calls.room = {localParticipant:local,remoteParticipants:new Map([['remote',remote]])};
    state.next({...invitation('video'),phase:'active',startedAt:Date.now()});
    fixture.detectChanges();
    const host=fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.connect-presentation-tile')).toBeTruthy();
    expect(host.querySelector('.connect-self-share-preview')).toBeNull();
  });

  it('expands the shared screen on click and restores the call layout', () => {
    const track = {attach: jasmine.createSpy('attach'), detach: jasmine.createSpy('detach')};
    const local = {identity:'local', videoTrackPublications:new Map(),
      audioTrackPublications:new Map(), isSpeaking:false, isMicrophoneEnabled:true};
    const remote = {identity:'remote', videoTrackPublications:new Map([
      ['screen', {source:Track.Source.ScreenShare, track, isMuted:false}]
    ]),audioTrackPublications:new Map(),isSpeaking:false,isMicrophoneEnabled:true};
    calls.room = {localParticipant:local,remoteParticipants:new Map([['remote',remote]])};
    state.next({...invitation('video'),phase:'active',startedAt:Date.now()});
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const stage = host.querySelector('.connect-presentation-stage') as HTMLElement;
    const hit = host.querySelector('.connect-presentation-zoom-hit') as HTMLButtonElement;
    expect(hit).toBeTruthy();
    expect(stage.classList.contains('is-zoomed')).toBeFalse();
    hit.click();
    fixture.detectChanges();
    expect(stage.classList.contains('is-zoomed')).toBeTrue();
    expect(hit.getAttribute('aria-label')).toContain('Reduzir');
    hit.click();
    fixture.detectChanges();
    expect(stage.classList.contains('is-zoomed')).toBeFalse();
    expect(calls.end).not.toHaveBeenCalled();
  });

  it('adjusts remote voice and screen-share audio separately without changing the call', () => {
    const track = {attach: jasmine.createSpy('attach'), detach: jasmine.createSpy('detach')};
    const local = {identity:'local', videoTrackPublications:new Map(),
      audioTrackPublications:new Map(), isSpeaking:false, isMicrophoneEnabled:true};
    const remote = {identity:'remote', videoTrackPublications:new Map([
      ['screen', {source:Track.Source.ScreenShare, track, isMuted:false}]
    ]),audioTrackPublications:new Map(),isSpeaking:false,isMicrophoneEnabled:true};
    calls.room = {localParticipant:local,remoteParticipants:new Map([['remote',remote]])};
    state.next({...invitation('video'),phase:'active',startedAt:Date.now()});
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const sliders = host.querySelectorAll('.connect-share-audio input[type="range"]');
    expect(sliders.length).toBe(2);
    const voice = sliders[0] as HTMLInputElement;
    const screen = sliders[1] as HTMLInputElement;
    voice.value = '40';
    voice.dispatchEvent(new Event('input'));
    screen.value = '85';
    screen.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.volumeFor('remote')).toBeCloseTo(0.4);
    expect(fixture.componentInstance.screenVolumeFor('remote')).toBeCloseTo(0.85);
    expect(calls.end).not.toHaveBeenCalled();
  });

  it('lets users change the other participant voice volume even without a shared screen', () => {
    const local = {identity:'local', videoTrackPublications:new Map(),
      audioTrackPublications:new Map(), isSpeaking:false, isMicrophoneEnabled:true};
    const remote = {identity:'remote', videoTrackPublications:new Map(),
      audioTrackPublications:new Map(), isSpeaking:false, isMicrophoneEnabled:true};
    calls.room = {localParticipant:local,remoteParticipants:new Map([['remote',remote]])};
    state.next({...invitation('voice'),phase:'active',startedAt:Date.now()});
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.connect-presentation-stage')).toBeNull();
    const mixer = host.querySelector('.connect-share-audio');
    const sliders = mixer?.querySelectorAll('input[type="range"]');
    expect(sliders?.length).toBe(1);
    const voice = sliders?.[0] as HTMLInputElement;
    voice.value = '65';
    voice.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.volumeFor('remote')).toBeCloseTo(0.65);
    expect(calls.end).not.toHaveBeenCalled();
  });

  it('uses uniformly sized SVG icons in active-call controls instead of font glyphs', () => {
    state.next({...invitation('video'),phase:'active',startedAt:Date.now()});
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const actions = Array.from(host.querySelectorAll('.call-buttons button'))
      .filter(button => button.querySelector('.call-action-icon'));
    expect(actions.length).toBeGreaterThanOrEqual(4);
    for (const action of actions) {
      const icon = action.querySelector('.call-action-icon') as SVGElement;
      expect(icon.getAttribute('viewBox')).toBe('0 0 24 24');
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      expect(getComputedStyle(icon).width).toBe('18px');
      expect(getComputedStyle(icon).height).toBe('18px');
      expect(getComputedStyle(action).alignItems).toBe('center');
      expect(getComputedStyle(action).justifyContent).toBe('center');
    }
  });

  it('shows a useful message when device enumeration is unavailable', () => {
    state.next({...invitation('voice'),phase:'active',startedAt:Date.now()});
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.call-settings-button') as HTMLButtonElement).click();
    calls.deviceScanStatus$.next('unavailable');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('não permite consultar os dispositivos');
    const camera = fixture.nativeElement.querySelector('#call-camera') as HTMLSelectElement;
    expect(camera.disabled).toBeTrue();
  });

  it('offers microphone recovery without mistakenly requesting a camera', () => {
    state.next({...invitation('voice'),phase:'active',startedAt:Date.now(),
      error:'calls.microphoneDenied',micEnabled:false,cameraEnabled:false});
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Tentar microfone novamente');
    expect(fixture.nativeElement.textContent).toContain('Escolher outro microfone');
    expect(fixture.nativeElement.textContent).not.toContain('Tentar câmara novamente');
  });

  it('guides users to site permissions after a camera denial, without retrying on their behalf', () => {
    state.next({...invitation('video'), phase:'active', startedAt:Date.now(),
      error:'calls.cameraDenied', cameraEnabled:false});
    fixture.detectChanges();
    const host=fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('permissões do site');
    expect(host.textContent).toContain('barra de endereço');
    expect(host.querySelector('.call-retry')).toBeTruthy();
    expect(calls.end).not.toHaveBeenCalled();
  });

  it('shows distinct recovery instructions for disconnected and busy hardware', () => {
    expect(fixture.componentInstance.recoveryHintKey('calls.microphoneBusy'))
      .toBe('calls.recoveryBusyHint');
    expect(fixture.componentInstance.recoveryHintKey('calls.cameraMissing'))
      .toBe('calls.recoveryMissingHint');
    expect(fixture.componentInstance.recoveryHintKey('calls.microphoneDenied'))
      .toBe('calls.recoveryPermissionHint');
    expect(fixture.componentInstance.recoveryHintKey('calls.connectionLost')).toBeNull();
  });

});
