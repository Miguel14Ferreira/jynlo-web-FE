import { LocalParticipant, Track } from 'livekit-client';
import { CallParticipantTileComponent } from './call-participant-tile.component';

describe('Call participant tile track selection', () => {
  const track = () => ({
    attach: jasmine.createSpy('attach'),
    detach: jasmine.createSpy('detach')
  });
  const camera = track();
  const screen = track();
  const participant = {
    videoTrackPublications: new Map([
      ['screen', {source: Track.Source.ScreenShare, track: screen, isMuted: false}],
      ['camera', {source: Track.Source.Camera, track: camera, isMuted: false}]
    ]),
    audioTrackPublications: new Map(),
    isSpeaking: false,
    isMicrophoneEnabled: true
  } as unknown as LocalParticipant;

  beforeEach(() => {
    camera.attach.calls.reset();
    camera.detach.calls.reset();
    screen.attach.calls.reset();
    screen.detach.calls.reset();
  });

  it('attaches a published local camera to the self preview without requiring a remote track', () => {
    const selfCamera=track();
    const self={
      ...participant,
      videoTrackPublications:new Map([
        ['camera',{source:Track.Source.Camera,track:selfCamera,isMuted:false}]
      ])
    } as unknown as LocalParticipant;
    const tile=new CallParticipantTileComponent();
    tile.participant=self;
    tile.local=true;
    tile.label='Tu';
    const video=document.createElement('video');
    (tile as any).videoElement={nativeElement:video};
    tile.ngAfterViewChecked();
    expect(tile.hasVideo).toBeTrue();
    expect(selfCamera.attach).toHaveBeenCalledOnceWith(video);
    expect(video.muted).toBeTrue(); // Even direct track attachment keeps the local preview silent.
    tile.ngOnDestroy();
    expect(selfCamera.detach).toHaveBeenCalledOnceWith(video);
  });

  it('keeps both remote and self video silent for autoplay while audio remains separate', () => {
    const remoteVideo=track();
    const remote={
      ...participant,
      videoTrackPublications:new Map([
        ['camera',{source:Track.Source.Camera,track:remoteVideo,isMuted:false}]
      ])
    } as unknown as LocalParticipant;
    const tile=new CallParticipantTileComponent();
    tile.participant=remote;
    const element=document.createElement('video');
    element.muted=true; // A previously used local media element.
    (tile as any).videoElement={nativeElement:element};
    tile.local=false;
    tile.ngAfterViewChecked();
    expect(element.muted).toBeTrue();
    expect(remoteVideo.attach).toHaveBeenCalledOnceWith(element);
    tile.local=true;
    tile.ngAfterViewChecked();
    expect(element.muted).toBeTrue();
    expect(remoteVideo.attach).toHaveBeenCalledTimes(1);
    tile.ngOnDestroy();
    expect(remoteVideo.detach).toHaveBeenCalledOnceWith(element);
  });

  it('keeps remote sound but detaches invisible video while minimized and restores it on expand', () => {
    const microphone = track();
    const device = {
      ...participant,
      audioTrackPublications: new Map([
        ['mic', {source: Track.Source.Microphone, track: microphone, isMuted:false}]
      ])
    } as unknown as LocalParticipant;
    const component = new CallParticipantTileComponent();
    component.participant = device;
    const video = document.createElement('video');
    const audio = document.createElement('audio');
    (component as any).videoElement = {nativeElement:video};
    (component as any).audioElement = {nativeElement:audio};
    component.ngAfterViewChecked();
    expect(camera.attach).toHaveBeenCalledOnceWith(video);
    expect(microphone.attach).toHaveBeenCalledOnceWith(audio);
    component.audioOnly = true;
    component.ngAfterViewChecked();
    expect(component.hasVideo).toBeFalse();
    expect(camera.detach).toHaveBeenCalledOnceWith(video);
    expect(microphone.detach).not.toHaveBeenCalled();
    component.audioOnly = false;
    component.ngAfterViewChecked();
    expect(camera.attach).toHaveBeenCalledTimes(2);
    expect(microphone.attach).toHaveBeenCalledTimes(1);
    component.ngOnDestroy();
  });

  it('separately adjusts remote microphone and shared-screen audio playback', () => {
    const microphone = track();
    const screenSound = track();
    const remote = {
      ...participant,
      audioTrackPublications: new Map([
        ['mic', {source: Track.Source.Microphone, track: microphone, isMuted:false}],
        ['screen', {source: Track.Source.ScreenShareAudio, track: screenSound, isMuted:false}]
      ])
    } as unknown as LocalParticipant;
    const component = new CallParticipantTileComponent();
    component.participant = remote;
    const micElement = document.createElement('audio');
    const shareElement = document.createElement('audio');
    (component as any).audioElement = {nativeElement: micElement};
    (component as any).screenAudioElement = {nativeElement: shareElement};
    component.microphoneVolume = 0.75;
    component.screenShareVolume = 0.2;
    component.ngAfterViewChecked();
    expect(micElement.volume).toBeCloseTo(0.75);
    expect(shareElement.volume).toBeCloseTo(0.2);
    component.microphoneVolume = 0;
    component.screenShareVolume = 1;
    component.ngAfterViewChecked();
    expect(micElement.volume).toBe(0);
    expect(shareElement.volume).toBe(1);
    expect(microphone.attach).toHaveBeenCalledOnceWith(micElement);
    expect(screenSound.attach).toHaveBeenCalledOnceWith(shareElement);
    component.ngOnDestroy();
  });

  it('routes microphone and shared-screen sound to the chosen speaker only when it changes', async () => {
    const microphone=track();
    const screenSound=track();
    const remote={
      ...participant,
      audioTrackPublications:new Map([
        ['mic',{source:Track.Source.Microphone,track:microphone,isMuted:false}],
        ['screen',{source:Track.Source.ScreenShareAudio,track:screenSound,isMuted:false}]
      ])
    } as unknown as LocalParticipant;
    const component=new CallParticipantTileComponent();
    component.participant=remote;
    component.audioOutputDeviceId='usb-speakers';
    const micElement=document.createElement('audio');
    const screenElement=document.createElement('audio');
    const micSink=jasmine.createSpy('micSink').and.resolveTo();
    const screenSink=jasmine.createSpy('screenSink').and.resolveTo();
    (micElement as any).setSinkId=micSink;
    (screenElement as any).setSinkId=screenSink;
    (component as any).audioElement={nativeElement:micElement};
    (component as any).screenAudioElement={nativeElement:screenElement};
    component.ngAfterViewChecked();
    component.ngAfterViewChecked();
    expect(micSink).toHaveBeenCalledOnceWith('usb-speakers');
    expect(screenSink).toHaveBeenCalledOnceWith('usb-speakers');
    component.audioOutputDeviceId='headphones';
    component.ngAfterViewChecked();
    expect(micSink).toHaveBeenCalledWith('headphones');
    expect(screenSink).toHaveBeenCalledWith('headphones');
    component.ngOnDestroy();
  });

  it('keeps a local camera preview when the user also shares a screen', () => {
    const component = new CallParticipantTileComponent();
    component.participant = participant;
    component.local = true;
    const video = document.createElement('video');
    (component as any).videoElement = {nativeElement: video};
    expect(component.hasVideo).toBeTrue();
    component.ngAfterViewChecked();
    expect(camera.attach).toHaveBeenCalledWith(video);
    expect(screen.attach).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('attaches the complete screen track to the independent presentation tile', () => {
    const component = new CallParticipantTileComponent();
    component.participant = participant;
    component.local = true;
    component.presentation = true;
    const video = document.createElement('video');
    (component as any).videoElement = {nativeElement: video};
    expect(component.isSharing).toBeTrue();
    component.ngAfterViewChecked();
    expect(screen.attach).toHaveBeenCalledWith(video);
    expect(camera.attach).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });
  it('reattaches the camera after Angular replaces its video element', () => {
    const component = new CallParticipantTileComponent();
    component.participant = participant;
    component.local = true;
    const first = document.createElement('video');
    const second = document.createElement('video');
    (component as any).videoElement = {nativeElement: first};
    component.ngAfterViewChecked();
    (component as any).videoElement = {nativeElement: second};
    component.ngAfterViewChecked();
    expect(camera.detach).toHaveBeenCalledOnceWith(first);
    expect(camera.attach).toHaveBeenCalledTimes(2);
    expect(camera.attach).toHaveBeenCalledWith(second);
    component.ngOnDestroy();
    expect(camera.detach).toHaveBeenCalledWith(second);
    expect(screen.attach).not.toHaveBeenCalled();
  });

  it('reattaches the remote microphone to a replacement audio element without duplication', () => {
    const microphone = track();
    const remote = {
      ...participant,
      audioTrackPublications: new Map([
        ['microphone', {source: Track.Source.Microphone, track: microphone, isMuted: false}]
      ])
    } as unknown as LocalParticipant;
    const component = new CallParticipantTileComponent();
    component.participant = remote;
    const first = document.createElement('audio');
    const second = document.createElement('audio');
    (component as any).audioElement = {nativeElement: first};
    component.ngAfterViewChecked();
    (component as any).audioElement = {nativeElement: second};
    component.ngAfterViewChecked();
    expect(microphone.detach).toHaveBeenCalledOnceWith(first);
    expect(microphone.attach).toHaveBeenCalledTimes(2);
    expect(microphone.attach).toHaveBeenCalledWith(second);
    component.ngAfterViewChecked();
    expect(microphone.attach).toHaveBeenCalledTimes(2);
    component.ngOnDestroy();
    expect(microphone.detach).toHaveBeenCalledWith(second);
  });

  it('detaches the previous camera before attaching a replacement camera track', () => {
    const oldCamera = track();
    const newCamera = track();
    const device = {
      ...participant,
      videoTrackPublications: new Map([
        ['camera', {source: Track.Source.Camera, track: oldCamera, isMuted: false}]
      ])
    } as unknown as LocalParticipant;
    const component = new CallParticipantTileComponent();
    component.participant = device;
    component.local = true;
    const element = document.createElement('video');
    (component as any).videoElement = {nativeElement: element};
    component.ngAfterViewChecked();
    (device.videoTrackPublications.get('camera') as any).track = newCamera;
    component.ngAfterViewChecked();
    expect(oldCamera.detach).toHaveBeenCalledOnceWith(element);
    expect(newCamera.attach).toHaveBeenCalledOnceWith(element);
    component.ngOnDestroy();
  });

  it('selects the remote microphone instead of screen-share audio in group calls', () => {
    const microphone = track();
    const sharedAudio = track();
    const remote = {
      ...participant,
      audioTrackPublications: new Map([
        ['screen-audio', {source: Track.Source.ScreenShareAudio, track: sharedAudio, isMuted: false}],
        ['microphone', {source: Track.Source.Microphone, track: microphone, isMuted: false}]
      ])
    } as unknown as LocalParticipant;
    const component = new CallParticipantTileComponent();
    component.participant = remote;
    const element = document.createElement('audio');
    (component as any).audioElement = {nativeElement: element};
    component.ngAfterViewChecked();
    expect(microphone.attach).toHaveBeenCalledOnceWith(element);
    expect(sharedAudio.attach).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('does not misidentify shared system audio as an active microphone', () => {
    const sharedAudio = track();
    const remote = {
      ...participant,
      audioTrackPublications: new Map([
        ['screen-audio', {source: Track.Source.ScreenShareAudio, track: sharedAudio, isMuted: false}]
      ])
    } as unknown as LocalParticipant;
    const component = new CallParticipantTileComponent();
    component.participant = remote;
    (component as any).audioElement = {nativeElement: document.createElement('audio')};
    component.ngAfterViewChecked();
    expect(sharedAudio.attach).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('plays remote system audio once beside the microphone, without duplicating the presentation audio', () => {
    const microphone = track();
    const sharedAudio = track();
    const remote = {
      ...participant,
      audioTrackPublications: new Map([
        ['screen', {source: Track.Source.ScreenShareAudio, track: sharedAudio, isMuted: false}],
        ['microphone', {source: Track.Source.Microphone, track: microphone, isMuted: false}]
      ])
    } as unknown as LocalParticipant;
    const cameraTile = new CallParticipantTileComponent();
    cameraTile.participant = remote;
    const microphoneElement = document.createElement('audio');
    const sharedElement = document.createElement('audio');
    (cameraTile as any).audioElement = {nativeElement: microphoneElement};
    (cameraTile as any).screenAudioElement = {nativeElement: sharedElement};
    cameraTile.ngAfterViewChecked();
    cameraTile.ngAfterViewChecked();
    expect(microphone.attach).toHaveBeenCalledOnceWith(microphoneElement);
    expect(sharedAudio.attach).toHaveBeenCalledOnceWith(sharedElement);

    const presentationTile = new CallParticipantTileComponent();
    presentationTile.participant = remote;
    presentationTile.presentation = true;
    (presentationTile as any).screenAudioElement = {nativeElement: document.createElement('audio')};
    presentationTile.ngAfterViewChecked();
    expect(sharedAudio.attach).toHaveBeenCalledTimes(1);
    presentationTile.ngOnDestroy();
    cameraTile.ngOnDestroy();
    expect(sharedAudio.detach).toHaveBeenCalledOnceWith(sharedElement);
  });

  it('never plays the same remote microphone twice while sharing a screen', () => {
    const audioTrack = {
      attach: jasmine.createSpy('audioAttach'),
      detach: jasmine.createSpy('audioDetach')
    };
    const remote = {
      ...participant,
      audioTrackPublications: new Map([
        ['microphone', {source: Track.Source.Microphone, track: audioTrack, isMuted: false}]
      ])
    } as unknown as LocalParticipant;
    const screenTile = new CallParticipantTileComponent();
    screenTile.participant = remote;
    screenTile.presentation = true;
    screenTile.local = false;
    (screenTile as any).audioElement = {nativeElement: document.createElement('audio')};
    screenTile.ngAfterViewChecked();
    expect(audioTrack.attach).not.toHaveBeenCalled();
    screenTile.ngOnDestroy();

    const cameraTile = new CallParticipantTileComponent();
    cameraTile.participant = remote;
    cameraTile.presentation = false;
    cameraTile.local = false;
    (cameraTile as any).audioElement = {nativeElement: document.createElement('audio')};
    cameraTile.ngAfterViewChecked();
    expect(audioTrack.attach).toHaveBeenCalledTimes(1);
    cameraTile.ngOnDestroy();
  });

});
