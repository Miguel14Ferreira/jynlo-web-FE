import { AfterViewChecked, Component, ElementRef, Input, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../i18n/translate.pipe';
import { LocalParticipant, RemoteParticipant, Track } from 'livekit-client';

/** Each remote participant owns a separate audio element, preventing a third
 * caller from replacing the first caller's microphone playback. */
@Component({
  standalone: true,
  selector: 'app-call-participant-tile',
  imports: [CommonModule, TranslatePipe],
  template: `
    <article class="connect-tile" [class.speaking]="participant.isSpeaking"
      [class.presenting]="presentation" [class.with-video]="hasVideo">
      <video #video autoplay playsinline [muted]="local" [hidden]="!hasVideo"
        [attr.aria-label]="label"></video>
      @if (!hasVideo) {
        <div class="connect-avatar" aria-hidden="true">
          @if (avatarUrl && !avatarFailed) {
            <img [src]="avatarUrl" alt="" referrerpolicy="no-referrer"
              (error)="avatarFailed=true">
          } @else {
            <span>{{ label.slice(0,1).toUpperCase() }}</span>
          }
        </div>
      }
      <audio #audio autoplay></audio>
      <audio #screenAudio autoplay></audio>
      <div class="connect-person">
        <span class="connect-speaker" aria-hidden="true"></span>
        <strong>{{ label }}</strong>
        @if (local && label !== ('calls.you' | t)) {
          <span class="connect-self">{{ 'calls.you' | t }}</span>
        }
        @if (participant.isMicrophoneEnabled === false) {
          <span class="connect-muted" [attr.aria-label]="'calls.micOff' | t">⌁</span>
        }
      </div>
    </article>
  `,
  styles: [`
    :host{display:block;min-width:0;min-height:0}
    .connect-tile{position:relative;display:flex;align-items:center;justify-content:center;
      min-height:170px;height:100%;overflow:hidden;border:1px solid #315562;border-radius:17px;
      background:radial-gradient(circle at 50% 40%,#26313b,#111923 74%);color:#eafff9}
    .connect-tile.speaking{border-color:#44ecc1;box-shadow:inset 0 0 0 2px #44ecc122}
    .connect-tile video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#0a2029}
    .connect-tile video[hidden]{display:none}
    /* Desktop/window/tab shares must fit in full, never be cropped like webcam video. */
    .connect-tile.presenting video{object-fit:contain}
    .connect-tile.presenting video[muted]{transform:none}
    .connect-tile:not(.presenting) video[muted]{transform:scaleX(-1)}
    .connect-avatar{display:grid;place-items:center;width:clamp(70px,10vw,112px);aspect-ratio:1;
      border-radius:50%;border:3px solid #8396a777;background:#34414f;font-size:clamp(2rem,4vw,2.7rem);
      font-weight:850;box-shadow:0 0 0 10px #8ba5bc12;overflow:hidden}
    .connect-avatar img{display:block;width:100%;height:100%;object-fit:cover}
    .connect-tile.speaking .connect-avatar{border-color:#5bf1cb;box-shadow:0 0 0 9px #4be8c32c}
    .connect-person{position:absolute;left:12px;bottom:12px;display:flex;align-items:center;gap:7px;
      max-width:calc(100% - 24px);padding:7px 12px;border-radius:11px;background:#071e29dc;
      font-size:.8rem;white-space:nowrap}
    .connect-person strong{overflow:hidden;text-overflow:ellipsis;min-width:0}
    .connect-speaker{flex:0 0 7px;width:7px;height:7px;border-radius:50%;background:#688f97}
    .speaking .connect-speaker{background:#50edbb;box-shadow:0 0 0 4px #40dba72c}
    .connect-self{color:#9de9d6;font-size:.66rem}.connect-muted{color:#ffbbc2}
    @media(prefers-reduced-motion:reduce){.connect-tile{transition:none}}
  `]
})
export class CallParticipantTileComponent implements AfterViewChecked, OnDestroy {
  @Input({required:true}) participant!: LocalParticipant | RemoteParticipant;
  @Input() label = '';
  private _avatarUrl: string | null = null;
  avatarFailed = false;
  @Input() set avatarUrl(value: string | null) {
    if (this._avatarUrl !== value) this.avatarFailed = false;
    this._avatarUrl = value;
  }
  get avatarUrl(): string | null { return this._avatarUrl; }
  @Input() local = false;
  /** A separate presentation tile never replaces the user's own camera preview. */
  @Input() presentation = false;
  /** Compact/minimized calls keep audio playback but never attach hidden video. */
  @Input() audioOnly = false;
  /** Independently adjustable playback volume for every remote microphone. */
  @Input() volume = 1;
  /** Incoming microphone gain is independent of shared-tab/system audio. */
  @Input() microphoneVolume?: number;
  @Input() screenShareVolume?: number;
  /** Route custom remote audio elements to the speaker chosen in call settings. */
  @Input() audioOutputDeviceId?: string;
  @ViewChild('video') private videoElement?: ElementRef<HTMLVideoElement>;
  @ViewChild('audio') private audioElement?: ElementRef<HTMLAudioElement>;
  @ViewChild('screenAudio') private screenAudioElement?: ElementRef<HTMLAudioElement>;
  private lastVideo: {attach(e: HTMLMediaElement): void; detach(e: HTMLMediaElement): void} | null = null;
  private lastAudio: {attach(e: HTMLMediaElement): void; detach(e: HTMLMediaElement): void} | null = null;
  private attachedVideoElement: HTMLVideoElement | null = null;
  private attachedAudioElement: HTMLAudioElement | null = null;
  private lastScreenAudio: {attach(e: HTMLMediaElement): void; detach(e: HTMLMediaElement): void} | null = null;
  private attachedScreenAudioElement: HTMLAudioElement | null = null;
  private readonly audioSinks = new WeakMap<HTMLAudioElement, string>();

  private syncAudioOutput(element?: HTMLAudioElement): void {
    if (!element || typeof element.setSinkId !== 'function') return;
    const deviceId=this.audioOutputDeviceId || 'default';
    if (this.audioSinks.get(element)===deviceId) return;
    this.audioSinks.set(element,deviceId);
    void element.setSinkId(deviceId).catch(() => {
      // The browser can reject unplugged speakers; permit a later retry.
      if (this.audioSinks.get(element)===deviceId) this.audioSinks.delete(element);
    });
  }

  private get activeVideo() {
    if (this.audioOnly) return null;
    const publications=[...this.participant.videoTrackPublications.values()];
    const desired=this.presentation ? Track.Source.ScreenShare : Track.Source.Camera;
    return publications.find(p=>p.source===desired && !!p.track && !p.isMuted)?.track || null;
  }
  get hasVideo(): boolean { return !!this.activeVideo; }
  get isSharing(): boolean { return this.presentation; }

  ngAfterViewChecked(): void {
    const video=this.videoElement?.nativeElement;
    const nextVideo=this.activeVideo;
    // Angular can replace a media element while keeping the same LiveKit
    // track (e.g. expanded/minimized call or a refreshed participant tile).
    // Reattach to the new element; a track reference alone is insufficient.
    if (video !== this.attachedVideoElement || this.lastVideo !== nextVideo) {
      if (this.attachedVideoElement) this.lastVideo?.detach(this.attachedVideoElement);
      this.lastVideo=nextVideo;
      this.attachedVideoElement=video ?? null;
      if (video) nextVideo?.attach(video);
    }
    const audio=this.audioElement?.nativeElement;
    if (audio) audio.volume=Math.max(0,Math.min(1,this.microphoneVolume ?? this.volume));
    this.syncAudioOutput(audio);
    // A shared screen has its own video tile, but must not attach the same
    // remote microphone a second time (otherwise callers hear an echo).
    const nextAudio=(this.local || this.presentation) ? null :
      ([...this.participant.audioTrackPublications.values()]
        .find(p=>p.source===Track.Source.Microphone && !!p.track && !p.isMuted)?.track || null);
    if (audio !== this.attachedAudioElement || this.lastAudio !== nextAudio) {
      if (this.attachedAudioElement) this.lastAudio?.detach(this.attachedAudioElement);
      this.lastAudio=nextAudio;
      this.attachedAudioElement=audio ?? null;
      if (audio) nextAudio?.attach(audio);
    }
    // Screen-share audio is an independent track. Play it once from the
    // participant's camera tile, never from the separate presentation stage.
    const screenAudio=this.screenAudioElement?.nativeElement;
    if (screenAudio) screenAudio.volume=Math.max(0,Math.min(1,this.screenShareVolume ?? this.volume));
    this.syncAudioOutput(screenAudio);
    const nextScreenAudio=(this.local || this.presentation) ? null :
      ([...this.participant.audioTrackPublications.values()]
        .find(p=>p.source===Track.Source.ScreenShareAudio && !!p.track && !p.isMuted)?.track || null);
    if (screenAudio !== this.attachedScreenAudioElement || this.lastScreenAudio !== nextScreenAudio) {
      if (this.attachedScreenAudioElement)
        this.lastScreenAudio?.detach(this.attachedScreenAudioElement);
      this.lastScreenAudio=nextScreenAudio;
      this.attachedScreenAudioElement=screenAudio ?? null;
      if (screenAudio) nextScreenAudio?.attach(screenAudio);
    }
  }

  ngOnDestroy(): void {
    if (this.attachedVideoElement) this.lastVideo?.detach(this.attachedVideoElement);
    if (this.attachedAudioElement) this.lastAudio?.detach(this.attachedAudioElement);
    if (this.attachedScreenAudioElement)
      this.lastScreenAudio?.detach(this.attachedScreenAudioElement);
    this.attachedVideoElement=null;
    this.attachedAudioElement=null;
    this.attachedScreenAudioElement=null;
    this.lastVideo=null;
    this.lastAudio=null;
    this.lastScreenAudio=null;
  }
}
