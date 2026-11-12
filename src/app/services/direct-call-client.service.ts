import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { JwtHelperService } from '@auth0/angular-jwt';
import { BehaviorSubject, filter, firstValueFrom, Subscription, TimeoutError, timeout } from 'rxjs';
import { ConnectionQuality, MediaDeviceFailure, Room, RoomEvent, Track } from 'livekit-client';
import { environment } from 'src/environment/environment';
import { DirectCallEvent, DirectChatRealtimeService } from './direct-chat-realtime.service';
import { DirectCallToneService } from './direct-call-tone.service';
import { appTranslate } from '../i18n/i18n.service';

export type CallPhase = 'incoming' | 'dialing' | 'connecting' | 'active' | 'error';
export type CallMedia = 'voice' | 'video';
export type CallAvailabilityStatus = 'idle' | 'checking' | 'ready' | 'notConfigured'
  | 'invalidCredentials' | 'providerUnavailable' | 'requestFailed';
export interface DirectCallState {
  id: string;
  peer: string;
  media: CallMedia;
  phase: CallPhase;
  expiresAt?: number;
  error?: string;
  micEnabled: boolean;
  cameraEnabled: boolean;
  /** Timestamp is set once when connected, retained across reconnections. */
  startedAt?: number;
}
interface CallSession {
  callId: string;
  peer: string;
  media: CallMedia;
  serverUrl: string;
  token: string;
  expiresAt: string;
}
/** The authenticated pending call response contains no LiveKit credentials. */
export interface CallMember { username: string; identity: string; }
export interface CallMembership { participants: CallMember[]; pending: string[]; }
interface PendingCallInvitation {
  callId: string;
  caller: string;
  peer: string;
  media: CallMedia;
  expiresAt: string;
}

/**
 * One active private call per browser. Transport is LiveKit WebRTC; the
 * application websocket only carries authenticated invitations and status.
 * Nothing is recorded or persisted by this client.
 */
@Injectable({ providedIn: 'root' })
export class DirectCallClientService implements OnDestroy {
  readonly state$ = new BehaviorSubject<DirectCallState | null>(null);
  readonly available$ = new BehaviorSubject<boolean>(false);
  readonly availabilityStatus$ = new BehaviorSubject<CallAvailabilityStatus>('idle');
  readonly mediaChanged$ = new BehaviorSubject<number>(0);
  /** Only display LiveKit's manual audio-unlock control if autoplay was blocked. */
  readonly audioPlaybackBlocked$ = new BehaviorSubject<boolean>(false);
  readonly ringtoneBlocked$: BehaviorSubject<boolean>;
  readonly devices$ = new BehaviorSubject<MediaDeviceInfo[]>([]);
  readonly deviceScanStatus$ = new BehaviorSubject<'idle'|'scanning'|'ready'|'unavailable'>('idle');
  readonly selectedDevices$ = new BehaviorSubject<Partial<Record<MediaDeviceKind, string>>>({});
  readonly connectionQuality$ = new BehaviorSubject<'unknown'|'excellent'|'good'|'poor'|'lost'>('unknown');
  readonly busyMedia$ = new BehaviorSubject<boolean>(false);
  readonly screenShareEnabled$ = new BehaviorSubject<boolean>(false);
  readonly screenShareFeedback$ = new BehaviorSubject<string | null>(null);
  readonly members$ = new BehaviorSubject<CallMembership>({participants:[],pending:[]});
  readonly invitationBusy$ = new BehaviorSubject<boolean>(false);
  readonly invitationError$ = new BehaviorSubject<string | null>(null);
  room: Room | null = null;
  private readonly base = environment.apiUrl + '/api/calls/direct';
  private readonly jwt = new JwtHelperService();
  private readonly subscriptions = new Subscription();
  private identityToken: string | null = null;
  private ringTimer?: ReturnType<typeof setTimeout>;
  private peerExitTimer?: ReturnType<typeof setTimeout>;
  private refreshingDevices = false;
  private readonly onDevicesChanged = (): void => { void this.recoverDisconnectedDevices(); };
  /** Suppress transient track-loss diagnostics while LiveKit restores transport. */
  private transportReconnecting = false;
  private generation = 0;
  private checking = false;
  private recoveringPending = false;
  private pendingTimer?: ReturnType<typeof setInterval>;
  private backgroundCallNotification: Notification | null = null;
  private readonly onForeground = (): void => {
    if (document.visibilityState === 'visible') {
      this.dismissBackgroundCallNotification();
      this.recoverPendingCall();
    }
  };

  constructor(private readonly http: HttpClient,
              private readonly realtime: DirectChatRealtimeService,
              router: Router,
              private readonly tones: DirectCallToneService) {
    this.ringtoneBlocked$ = tones.needsGesture$;
    this.subscriptions.add(this.state$.subscribe(call => {
      this.tones.sync(call?.phase);
      if (call?.phase !== 'incoming') this.dismissBackgroundCallNotification();
    }));
    this.subscriptions.add(this.realtime.calls$.subscribe(call => this.onEvent(call)));
    this.subscriptions.add(router.events.pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.ensureConnected()));
    this.ensureConnected();
    window.addEventListener('storage', this.onStorage);
    window.addEventListener('focus', this.onForeground);
    document.addEventListener('visibilitychange', this.onForeground);
    navigator.mediaDevices?.addEventListener?.('devicechange', this.onDevicesChanged);
    // Recover RINGING invitations even if the socket dropped the event.
    this.pendingTimer = setInterval(() => {
      this.recoverPendingCall();
      if (this.state$.value?.phase === 'active') this.refreshMembers();
    }, 8_000);
    if (this.realtime.connected$) {
      this.subscriptions.add(this.realtime.connected$.subscribe(connected => {
        if (connected) this.recoverPendingCall();
      }));
    }
  }

  private readonly onStorage = (event: StorageEvent): void => {
    if (event.key === 't' || event.key === null) this.ensureConnected();
  };

  /** Both the availability check and the call buttons fail closed. */
  refreshAvailability(): void {
    if (this.checking) return;
    const token = localStorage.getItem('t');
    if (!token || !this.username()) {
      this.available$.next(false);
      this.availabilityStatus$.next('idle');
      return;
    }
    this.checking = true;
    this.available$.next(false);
    this.availabilityStatus$.next('checking');
    this.http.get<{enabled: boolean; status?: string}>(this.base + '/availability')
      .pipe(timeout(8000)).subscribe({
        next: result => {
          this.checking = false;
          if (localStorage.getItem('t') !== token) return;
          const ready = result.enabled === true;
          this.available$.next(ready);
          const status: CallAvailabilityStatus = ready ? 'ready'
            : result.status === 'invalidCredentials' ? 'invalidCredentials'
            : result.status === 'providerUnavailable' ? 'providerUnavailable'
            : 'notConfigured';
          this.availabilityStatus$.next(status);
        },
        error: () => {
          this.checking = false;
          if (localStorage.getItem('t') !== token) return;
          this.available$.next(false);
          this.availabilityStatus$.next('requestFailed');
        }
      });
  }

  /** Read-only recovery: never starts a second call or exposes room tokens. */
  recoverPendingCall(): void {
    if (this.recoveringPending || this.state$.value || !this.available$.value
        || document.visibilityState === 'hidden') return;
    const username = this.username().toLowerCase();
    const token = localStorage.getItem('t');
    if (!username || !token) return;
    this.recoveringPending = true;
    this.http.get<PendingCallInvitation | null>(this.base + '/pending')
      .pipe(timeout(8000)).subscribe({
        next: invite => {
          this.recoveringPending = false;
          if (localStorage.getItem('t') !== token || !this.available$.value
              || this.state$.value || !invite
              || typeof invite.callId !== 'string'
              || typeof invite.caller !== 'string'
              || typeof invite.peer !== 'string'
              || invite.peer.toLowerCase() !== username
              || !['voice', 'video'].includes(invite.media)) return;
          this.onEvent({...invite,status:'RINGING',actor:invite.caller});
        },
        error: () => { this.recoveringPending = false; }
      });
  }

  private subjectFor(token: string | null): string {
    try { return token ? String(this.jwt.decodeToken(token)?.sub || '').toLowerCase() : ''; }
    catch { return ''; }
  }

  private username(): string {
    return this.subjectFor(localStorage.getItem('t'));
  }

  ensureConnected(): void {
    const token = localStorage.getItem('t');
    let valid = false;
    try { valid = !!token && !!this.username() && !this.jwt.isTokenExpired(token); }
    catch { valid = false; }
    if (!valid) {
      this.identityToken = null;
      this.available$.next(false);
      this.availabilityStatus$.next('idle');
      this.dropCall();
      return;
    }
    if (this.identityToken && token !== this.identityToken
        && this.subjectFor(token) !== this.subjectFor(this.identityToken)) {
      this.dropCall();
    }
    if (token !== this.identityToken) {
      // Refreshing an access JWT for the same account must not hang up a
      // LiveKit room or invalidate an in-flight outgoing call.
      const ongoing = !!this.state$.value;
      this.identityToken = token;
      if (!ongoing) {
        this.available$.next(false);
        this.availabilityStatus$.next('idle');
        this.refreshAvailability();
      }
    }
    this.realtime.connect();
  }

  /**
   * The HTTP signalling step can fail before a LiveKit room is joined.
   * Never collapse 403/409/429/503 into a WebRTC or microphone error.
   * Codes are safe to show: no server internals, peer information or tokens.
   */
  private startFailureMessage(error: unknown): string {
    if (error instanceof TimeoutError) return 'calls.timeout';
    if (!(error instanceof HttpErrorResponse)) return 'calls.unavailable';
    switch (error.status) {
      case 0: return 'calls.networkError';
      case 400: return 'calls.invalidRequest';
      case 401: return 'calls.sessionExpired';
      case 403: return 'calls.notAllowed';
      case 404: return 'calls.notFound';
      case 409: return 'calls.busy';
      case 429: return 'calls.rateLimited';
      case 503: return 'calls.providerUnavailable';
      case 500:
      case 502:
      case 504: return 'calls.serverError';
      default: return 'calls.unavailable';
    }
  }

  async start(peer: string, media: CallMedia): Promise<void> {
    if (this.state$.value || !this.available$.value || !peer) return;
    // Unlock Web Audio while the outgoing call click still has user activation;
    // the HTTP response and subsequent LiveKit connect are asynchronous.
    this.tones.prime();
    const version = ++this.generation;
    const callerToken = localStorage.getItem('t');
    try {
      const session = await firstValueFrom(this.http.post<CallSession>(
        this.base + '/' + encodeURIComponent(peer), {media}).pipe(timeout(10000)));
      if (version !== this.generation
          || this.subjectFor(localStorage.getItem('t')) !== this.subjectFor(callerToken)) {
        void this.http.post<void>(this.base + '/' + session.callId + '/end', {}).subscribe({error:()=>{}});
        return;
      }
      this.state$.next({id: session.callId, peer: session.peer, media,
        phase:'dialing', micEnabled:false, cameraEnabled:false,
        expiresAt: Date.parse(session.expiresAt)});
      this.scheduleExpiry(session.callId, Date.parse(session.expiresAt));
      await this.join(session, version);
    } catch (error) {
      if (version === this.generation) {
        this.state$.next({id:'',peer,media,phase:'error',micEnabled:false,
          cameraEnabled:false,error:this.startFailureMessage(error)});
      }
    }
  }

  async accept(): Promise<void> {
    const call=this.state$.value;
    if (!call || call.phase !== 'incoming') return;
    const version=++this.generation;
    this.clearRingTimer();
    this.state$.next({...call,phase:'connecting'});
    try {
      const session=await firstValueFrom(this.http.post<CallSession>(
        this.base + '/' + encodeURIComponent(call.id) + '/accept', {}).pipe(timeout(10000)));
      if (version !== this.generation || this.state$.value?.id !== call.id) return;
      await this.join(session, version);
    } catch (error) {
      if (version === this.generation) {
        this.state$.next({...call,phase:'error',error:this.startFailureMessage(error)});
      }
    }
  }

  /** Server validates invitation recipient, active membership and direct-chat ACL.
   * No LiveKit room credentials are exposed until the recipient accepts.
   */
  async inviteMember(username: string): Promise<boolean> {
    const call = this.state$.value;
    const recipient = username.trim();
    if (!call || call.phase !== 'active' || !this.room || this.invitationBusy$.value
        || !/^[\p{L}\p{N}_.-]{2,128}$/u.test(recipient)) {
      this.invitationError$.next('calls.inviteInvalid');
      return false;
    }
    const token = localStorage.getItem('t');
    this.invitationBusy$.next(true);
    this.invitationError$.next(null);
    try {
      await firstValueFrom(this.http.post<void>(this.base + '/' +
        encodeURIComponent(call.id) + '/invite/' + encodeURIComponent(recipient), {})
        .pipe(timeout(10000)));
      if (this.state$.value?.id === call.id &&
          this.subjectFor(localStorage.getItem('t')) === this.subjectFor(token)) {
        this.refreshMembers();
        return true;
      }
      return false;
    } catch (error) {
      if (this.state$.value?.id === call.id)
        this.invitationError$.next(this.startFailureMessage(error));
      return false;
    } finally {
      this.invitationBusy$.next(false);
    }
  }

  /** Authorized, room-scoped membership; stale HTTP responses cannot cross
   * the logout, identity or call boundary.
   */
  refreshMembers(): void {
    const call = this.state$.value;
    if (!call || call.phase !== 'active' || !this.room) return;
    const version = this.generation;
    const identity = this.subjectFor(localStorage.getItem('t'));
    this.http.get<CallMembership>(this.base + '/' + encodeURIComponent(call.id)
      + '/members').pipe(timeout(10000)).subscribe({
      next: list => {
        if (version !== this.generation || this.state$.value?.id !== call.id
            || identity !== this.subjectFor(localStorage.getItem('t'))) return;
        if (!Array.isArray(list?.participants) || !Array.isArray(list?.pending)) return;
        this.members$.next({
          participants: list.participants.filter(p => !!p && typeof p.username === 'string'
            && typeof p.identity === 'string').slice(0,6),
          pending: list.pending.filter(p => typeof p === 'string').slice(0,4)
        });
        this.mediaChanged$.next(this.mediaChanged$.value + 1);
      },
      error: () => { /* Group call media remains functional during REST retries. */ }
    });
  }

  decline(): void {
    const call=this.state$.value;
    if (!call || call.phase !== 'incoming') return;
    this.dropCall();
    this.http.post<void>(this.base + '/' + encodeURIComponent(call.id) + '/decline', {})
      .subscribe({error:()=>{}});
  }

  end(): void {
    const call=this.state$.value;
    this.dropCall();
    if (call?.id) {
      this.http.post<void>(this.base + '/' + encodeURIComponent(call.id) + '/end', {})
        .subscribe({error:()=>{}});
    }
  }

  closeError(): void {
    if (this.state$.value?.phase === 'error') this.dropCall();
  }

  async setMicrophone(enabled: boolean): Promise<void> {
    const room=this.room;
    // Use the same media-operation lock as camera/device switching so that a
    // microphone toggle cannot race an in-flight input device replacement.
    if (!room || this.busyMedia$.value) return;
    this.busyMedia$.next(true);
    try {
      await room.localParticipant.setMicrophoneEnabled(enabled);
      if (room === this.room) this.update({micEnabled:enabled,error:undefined});
    } catch (error) {
      // Do not claim that the microphone was toggled when the browser refused.
      if (room === this.room) this.update({error:this.mediaFailure(error,'microphone')});
    } finally {
      this.busyMedia$.next(false);
      void this.refreshDevices();
    }
  }

  /** Device labels are revealed only when the browser grants permission. */
  async refreshDevices(): Promise<void> {
    const room=this.room;
    if (!room || this.refreshingDevices) return;
    if (!navigator.mediaDevices?.enumerateDevices) {
      this.deviceScanStatus$.next('unavailable');
      return;
    }
    this.refreshingDevices=true;
    this.deviceScanStatus$.next('scanning');
    try {
      const devices=await navigator.mediaDevices.enumerateDevices();
      if (room !== this.room) return;
      const supported=devices.filter(d=>['videoinput','audioinput','audiooutput'].includes(d.kind));
      this.devices$.next(supported);
      const selected={...this.selectedDevices$.value};
      for (const kind of ['videoinput','audioinput','audiooutput'] as MediaDeviceKind[]) {
        if (selected[kind] && !supported.some(d=>d.kind===kind && d.deviceId===selected[kind])) {
          delete selected[kind];
        }
      }
      this.selectedDevices$.next(selected);
      this.deviceScanStatus$.next('ready');
    } catch {
      if (room === this.room) this.deviceScanStatus$.next('unavailable');
      // A denied enumerateDevices request must not disconnect an ongoing call.
    } finally {
      this.refreshingDevices=false;
    }
  }

  /**
   * When a specifically selected device disappears, try the browser default
   * without restarting the room or touching the other media tracks.
   * A failed fallback remains visible as an error rather than faking success.
   */
  private async recoverDisconnectedDevices(): Promise<void> {
    const room=this.room;
    if (!room) return;
    const previouslySelected={...this.selectedDevices$.value};
    await this.refreshDevices();
    if (room!==this.room || this.busyMedia$.value || this.deviceScanStatus$.value!=='ready') return;
    const disappeared=(kind:MediaDeviceKind): boolean =>
      !!previouslySelected[kind] &&
      !this.devices$.value.some(d=>d.kind===kind && d.deviceId===previouslySelected[kind]);
    const recoverKinds:MediaDeviceKind[]=[];
    if (disappeared('videoinput') && this.state$.value?.cameraEnabled)
      recoverKinds.push('videoinput');
    if (disappeared('audioinput') && this.state$.value?.micEnabled)
      recoverKinds.push('audioinput');
    if (disappeared('audiooutput')) recoverKinds.push('audiooutput');
    if (!recoverKinds.length) return;

    this.busyMedia$.next(true);
    try {
      for (const kind of recoverKinds) {
        if (room!==this.room) return;
        try {
          const switched=await room.switchActiveDevice(kind,'default');
          if (!switched) throw new Error('Default device unavailable');
          if (room===this.room) {
            this.update({error:undefined});
            this.mediaChanged$.next(this.mediaChanged$.value+1);
          }
        } catch (error) {
          if (room!==this.room) return;
          // Other tracks must keep playing. Only report the failed device.
          this.update({error:kind==='videoinput' ? this.mediaFailure(error,'camera')
            : kind==='audioinput' ? this.mediaFailure(error,'microphone')
            : 'calls.speakerUnavailable'});
        }
      }
    } finally {
      this.busyMedia$.next(false);
    }
  }

  /**
   * Reconcile a local device that vanished or stopped publishing outside an
   * explicit user action. Never restart capture or unmute without consent.
   */
  private markUnexpectedLocalTrackLoss(source: Track.Source): void {
    const state=this.state$.value;
    if (!state || this.busyMedia$.value) return;
    if (source===Track.Source.Camera && state.cameraEnabled) {
      this.update({cameraEnabled:false,error:'calls.cameraMissing'});
    } else if (source===Track.Source.Microphone && state.micEnabled) {
      this.update({micEnabled:false,error:'calls.microphoneMissing'});
    }
  }

  /**
   * LiveKit may lose a local publication during transport recovery without
   * delivering another TrackUnpublished event after Reconnected. Reflect the
   * actual published media instead of leaving a misleading "camera on" UI.
   * Never reacquire hardware or override deliberate user mute settings.
   */
  private reconcileLocalMediaAfterReconnect(room: Room): void {
    if (room !== this.room || this.busyMedia$.value) return;
    const local = room.localParticipant;
    const state = this.state$.value;
    if (!state) return;
    if (state.cameraEnabled && local.videoTrackPublications &&
        ![...local.videoTrackPublications.values()].some(pub =>
          pub.source === Track.Source.Camera && !!pub.track && !pub.isMuted)) {
      this.update({cameraEnabled:false,error:'calls.cameraMissing'});
    }
    if (state.micEnabled && local.audioTrackPublications &&
        ![...local.audioTrackPublications.values()].some(pub =>
          pub.source === Track.Source.Microphone && !!pub.track && !pub.isMuted)) {
      this.update({micEnabled:false,error:'calls.microphoneMissing'});
    }
  }

  /** Translate native browser/LiveKit errors into actionable PT/EN i18n codes. */
  private mediaFailure(error: unknown, kind: 'camera'|'microphone'): string {
    const name=error && typeof error==='object' && 'name' in error
      ? String((error as {name:unknown}).name) : '';
    const failure=MediaDeviceFailure.getFailure(error);
    const prefix=kind==='camera' ? 'calls.camera' : 'calls.microphone';
    if (failure===MediaDeviceFailure.PermissionDenied
      || ['NotAllowedError','PermissionDeniedError','SecurityError'].includes(name)) return prefix+'Denied';
    if (failure===MediaDeviceFailure.NotFound
      || ['NotFoundError','DevicesNotFoundError'].includes(name)) return prefix+'Missing';
    if (failure===MediaDeviceFailure.DeviceInUse
      || ['NotReadableError','TrackStartError'].includes(name)) return prefix+'Busy';
    if (['OverconstrainedError','ConstraintNotSatisfiedError'].includes(name)) return kind==='camera' ? 'calls.cameraConstraints' : prefix+'InvalidDevice';
    if (name==='CAMERA_PUBLICATION_FAILED') return 'calls.cameraPublicationFailed';
    if (['AbortError','NotSupportedError'].includes(name)) return prefix+'AccessError';
    return kind==='camera' ? 'calls.cameraAccessError' : 'calls.microphoneAccessError';
  }

  /** A resolved capture attempt still needs a published video track. */
  private assertCameraPublished(room: Room): void {
    const publications=room.localParticipant.videoTrackPublications;
    // Some deterministic test doubles don't implement publication collections.
    if (publications && ![...publications.values()].some(pub =>
      pub.source===Track.Source.Camera && !!pub.track && !pub.isMuted
      && pub.track.mediaStreamTrack?.readyState !== 'ended'))
      throw {name:'CAMERA_PUBLICATION_FAILED'};
  }

  /**
   * Progressive recovery: first let the browser choose; then try relaxed
   * capture constraints and available device IDs. Stale IDs must not trap
   * a call, and permission denial must never trigger repeated prompts.
   */
  private async enableCameraWithFallback(room: Room): Promise<void> {
    // Mobile backgrounding can leave a stale publication while the UI still
    // says that the camera is enabled. On an explicit retry only, discard the
    // broken camera before asking LiveKit to capture again. Never restart an
    // actually healthy webcam or reactivate a camera the user switched off.
    const publications=room.localParticipant.videoTrackPublications;
    if (this.state$.value?.cameraEnabled && publications) {
      const cameras=[...publications.values()].filter(pub=>pub.source===Track.Source.Camera);
      const healthy=cameras.some(pub=>!!pub.track && !pub.isMuted
        && pub.track.mediaStreamTrack?.readyState !== 'ended');
      if (cameras.length && !healthy) {
        await room.localParticipant.setCameraEnabled(false);
        if (room!==this.room) return;
      }
    }
    const enable=async (options?: Parameters<typeof room.localParticipant.setCameraEnabled>[1]): Promise<void> => {
      await room.localParticipant.setCameraEnabled(true,options);
      this.assertCameraPublished(room);
    };
    let firstError: unknown;
    try {
      await enable();
      this.selectedDevices$.next({...this.selectedDevices$.value,videoinput:undefined});
      return;
    } catch (error) {
      firstError=error;
      if (this.mediaFailure(error,'camera')==='calls.cameraDenied') throw error;
    }

    // Lower resolution avoids cameras that reject LiveKit's initial capture
    // constraints. Do not force an exact deviceId on this fallback.
    try {
      await enable({resolution:{width:640,height:360,frameRate:15}});
      this.selectedDevices$.next({...this.selectedDevices$.value,videoinput:undefined});
      return;
    } catch (error) {
      if (this.mediaFailure(error,'camera')==='calls.cameraDenied') throw error;
    }

    await this.refreshDevices();
    const devices=this.devices$.value.filter(d=>d.kind==='videoinput' && !!d.deviceId && d.deviceId!=='default');
    for (const device of devices) {
      if (room!==this.room) return;
      try {
        // Exact selection may be necessary for a second external camera.
        // The relaxed profile is intentionally used on that device as well.
        await enable({deviceId:{exact:device.deviceId},resolution:{width:640,height:360,frameRate:15}});
        this.selectedDevices$.next({...this.selectedDevices$.value,videoinput:device.deviceId});
        return;
      } catch (error) {
        if (this.mediaFailure(error,'camera')==='calls.cameraDenied') throw error;
      }
    }
    throw firstError;
  }

  async setCamera(enabled: boolean): Promise<void> {
    const room=this.room;
    if (!room || this.busyMedia$.value) return;
    this.busyMedia$.next(true);
    try {
      if (enabled) {
        await this.enableCameraWithFallback(room);
      } else {
        await room.localParticipant.setCameraEnabled(false);
      }
      if (room===this.room) {
        this.update({cameraEnabled:enabled,
          media:enabled ? 'video' : this.state$.value?.media || 'voice',error:undefined});
        this.mediaChanged$.next(this.mediaChanged$.value+1);
      }
    } catch (error) {
      if (room===this.room) this.update({cameraEnabled:false,error:this.mediaFailure(error,'camera')});
    } finally {
      this.busyMedia$.next(false);
      void this.refreshDevices();
    }
  }

  /**
   * Prefer an atomic LiveKit camera switch when returning to system default.
   * Disabling and recreating an already-active camera causes a black flash and
   * can permanently lose the old stream if the fallback device is unavailable.
   */
  async useDefaultCamera(): Promise<void> {
    const room=this.room;
    if (!room || this.busyMedia$.value) return;
    if (!this.state$.value?.cameraEnabled) {
      await this.setCamera(true);
      return;
    }
    this.busyMedia$.next(true);
    try {
      const changed=await room.switchActiveDevice('videoinput','default');
      if (!changed) throw new DOMException('Default camera unavailable','NotReadableError');
      if (room===this.room) {
        this.selectedDevices$.next({...this.selectedDevices$.value,videoinput:undefined});
        this.update({cameraEnabled:true,error:undefined});
        this.mediaChanged$.next(this.mediaChanged$.value+1);
      }
    } catch (error) {
      // Do not disable the existing camera or forget a still-valid selection.
      if (room===this.room) this.update({error:this.mediaFailure(error,'camera')});
    } finally {
      this.busyMedia$.next(false);
      void this.refreshDevices();
    }
  }

  get canShareScreen(): boolean {
    return typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  }

  async setScreenShare(enabled: boolean): Promise<void> {
    const room=this.room;
    if (!room || !this.canShareScreen || this.busyMedia$.value) return;
    this.screenShareFeedback$.next(null);
    this.busyMedia$.next(true);
    try {
      await room.localParticipant.setScreenShareEnabled(enabled);
      if (this.room===room) {
        // The browser may end sharing from its own toolbar. The publication,
        // not the last button press, is authoritative when one is available.
        const publication=[...room.localParticipant.videoTrackPublications.values()]
          .find(pub=>pub.source===Track.Source.ScreenShare);
        this.screenShareEnabled$.next(publication
          ? !!publication.track && !publication.isMuted : enabled);
      }
    } catch (error) {
      // A denied/cancelled picker must never report an existing share as
      // stopped; likewise a failed stop must not conceal a live screen track.
      if (this.room===room) {
        const publication=[...room.localParticipant.videoTrackPublications.values()]
          .find(pub=>pub.source===Track.Source.ScreenShare);
        this.screenShareEnabled$.next(publication
          ? !!publication.track && !publication.isMuted : this.screenShareEnabled$.value);
        const errorName = error && typeof error === 'object' && 'name' in error
          ? String((error as {name: unknown}).name) : '';
        this.screenShareFeedback$.next(errorName === 'NotAllowedError' || errorName === 'AbortError'
          ? 'calls.screenShareCancelled' : 'calls.screenShareFailed');
      }
    } finally {
      if (this.room===room) {
        this.busyMedia$.next(false);
        this.mediaChanged$.next(this.mediaChanged$.value+1);
      }
    }
  }

  async selectDevice(kind: MediaDeviceKind, deviceId: string): Promise<void> {
    const room=this.room;
    if (!room || this.busyMedia$.value || !['videoinput','audioinput','audiooutput'].includes(kind)) return;
    if (!deviceId) {
      if (kind==='videoinput') await this.useDefaultCamera();
      else {
        try {
          const changed=await room.switchActiveDevice(kind,'default');
          if (changed && room===this.room) {
            this.selectedDevices$.next({...this.selectedDevices$.value,[kind]:undefined});
            this.update({error:undefined});
          }
        } catch { if (room===this.room) this.update({error:'calls.deviceMissing'}); }
      }
      return;
    }
    // A client supplied ID cannot select a device which has disappeared.
    if (!this.devices$.value.some(d=>d.deviceId===deviceId && d.kind===kind)) {
      this.update({error:'calls.deviceMissing'});
      void this.refreshDevices();
      return;
    }
    this.busyMedia$.next(true);
    try {
      if (kind==='videoinput' && !this.state$.value?.cameraEnabled) {
        await room.localParticipant.setCameraEnabled(true,{deviceId:{exact:deviceId}});
        if (room===this.room) this.update({cameraEnabled:true,error:undefined});
      } else if (kind==='audioinput' && !this.state$.value?.micEnabled) {
        await room.localParticipant.setMicrophoneEnabled(true,{deviceId:{exact:deviceId}});
        if (room===this.room) this.update({micEnabled:true,error:undefined});
      } else {
        let switched=false;
        try { switched=await room.switchActiveDevice(kind,deviceId); }
        catch (error) { if (kind!=='videoinput') throw error; }
        if (!switched && kind==='videoinput') {
          // Mobile browsers sometimes reject replaceTrack: recreate capture.
          await room.localParticipant.setCameraEnabled(false);
          if (room===this.room) this.update({cameraEnabled:false});
          await room.localParticipant.setCameraEnabled(true,{deviceId:{ideal:deviceId},resolution:{width:640,height:360,frameRate:15}});
          this.assertCameraPublished(room);
          if (room===this.room) this.update({cameraEnabled:true});
          switched=true;
        }
        if (!switched) throw new DOMException('Device was not switched','NotReadableError');
      }
      if (room===this.room) {
        this.selectedDevices$.next({...this.selectedDevices$.value,[kind]:deviceId});
        this.update({error:undefined});
        this.mediaChanged$.next(this.mediaChanged$.value+1);
      }
    } catch (error) {
      if (room===this.room) {
        // A failed hardware switch must not infer camera state from the number
        // of publications (which may include a screen share or muted tracks).
        const cameraPublished = [...(room.localParticipant.videoTrackPublications?.values() || [])]
          .some(pub => pub.source===Track.Source.Camera && !!pub.track && !pub.isMuted);
        this.update({
          cameraEnabled:kind==='videoinput'
            ? cameraPublished || (!!this.state$.value?.cameraEnabled &&
                !room.localParticipant.videoTrackPublications)
            : !!this.state$.value?.cameraEnabled,
          error:kind==='videoinput'
            ? this.mediaFailure(error,'camera')
            : kind==='audioinput' ? this.mediaFailure(error,'microphone')
            : 'calls.speakerUnavailable'
        });
      }
    } finally {
      this.busyMedia$.next(false);
      void this.refreshDevices();
    }
  }

  async allowAudio(): Promise<void> {
    const room = this.room;
    if (!room) return;
    try {
      // Must be initiated by the actual button click, not a later promise.
      await room.startAudio();
      if (this.room === room) {
        this.audioPlaybackBlocked$.next(room.canPlaybackAudio === false);
        this.update({error: undefined});
      }
    } catch {
      if (this.room === room) {
        this.audioPlaybackBlocked$.next(true);
        this.update({error:'calls.audioBlocked'});
      }
    }
  }

  allowRingtone(): void {
    this.tones.prime();
  }

  /** Factory for deterministic LiveKit integration tests without real hardware. */
  private createRoom(): Room {
    return new Room({adaptiveStream:true,dynacast:true});
  }

  /**
   * Keep the real error visible when LiveKit fails. end() used to clear the
   * overlay and the echoed ENDED event hid the explanation milliseconds later.
   */
  private failConnection(session: CallSession, version: number, message: string): void {
    if (version !== this.generation) return;
    ++this.generation;
    this.transportReconnecting=false;
    this.clearRingTimer();
    this.clearPeerExitTimer();
    const room=this.room;
    this.room=null; // suppress Disconnected callback triggered by our cleanup
    if (room) void room.disconnect();
    this.state$.next({id:session.callId,peer:session.peer,media:session.media,
      phase:'error',micEnabled:false,cameraEnabled:false,error:message});
    this.mediaChanged$.next(this.mediaChanged$.value+1);
    // Release the server-side call. Even if signalling fails, keep error
    // explanation visible until the user explicitly closes the dialog.
    this.http.post<void>(this.base + '/' + encodeURIComponent(session.callId) + '/end', {})
      .subscribe({error:()=>{}});
  }

  private async join(session: CallSession, version: number): Promise<void> {
    const room=this.createRoom();
    this.room=room;
    // A camera published after joining (or a fresh screen-share track) needs
    // an immediate view refresh on the publishing browser as well.
    room.on(RoomEvent.LocalTrackPublished, () => {
      if (room===this.room) this.mediaChanged$.next(this.mediaChanged$.value+1);
    });
    // A remote publication can appear or vanish before subscription is
    // established. Refresh tiles for both events, otherwise the last camera
    // frame or an empty placeholder may persist until another user action.
    const refreshRoomMedia = (): void => {
      if (room === this.room && version === this.generation)
        this.mediaChanged$.next(this.mediaChanged$.value+1);
    };
    room.on(RoomEvent.TrackPublished, refreshRoomMedia);
    room.on(RoomEvent.TrackUnpublished, refreshRoomMedia);
    room.on(RoomEvent.TrackSubscribed, refreshRoomMedia);
    room.on(RoomEvent.TrackUnsubscribed, refreshRoomMedia);
    room.on(RoomEvent.TrackSubscriptionFailed, refreshRoomMedia);
    room.on(RoomEvent.ActiveSpeakersChanged, refreshRoomMedia);
    room.on(RoomEvent.TrackMuted, (publication, participant) => {
      if (room!==this.room) return;
      this.mediaChanged$.next(this.mediaChanged$.value+1);
      // A spontaneous local mute is not the same as a user clicking Mute.
      if (participant===room.localParticipant && !this.busyMedia$.value
          && !this.transportReconnecting)
        this.markUnexpectedLocalTrackLoss(publication.source);
    });
    room.on(RoomEvent.TrackUnmuted, () => {
      if (room===this.room) this.mediaChanged$.next(this.mediaChanged$.value+1);
    });
    room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
      if (room!==this.room) return;
      this.mediaChanged$.next(this.mediaChanged$.value+1);
      if (publication.source===Track.Source.ScreenShare) this.screenShareEnabled$.next(false);
      else if (!this.busyMedia$.value && !this.transportReconnecting)
        this.markUnexpectedLocalTrackLoss(publication.source);
    });
    room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      if (room!==this.room || participant!==room.localParticipant) return;
      const status=quality===ConnectionQuality.Excellent ? 'excellent'
        : quality===ConnectionQuality.Good ? 'good'
        : quality===ConnectionQuality.Poor ? 'poor'
        : quality===ConnectionQuality.Lost ? 'lost' : 'unknown';
      this.connectionQuality$.next(status);
    });
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (this.room === room)
        this.audioPlaybackBlocked$.next(room.canPlaybackAudio === false);
    });
    room.on(RoomEvent.ParticipantConnected, () => {
      if (this.room===room && version===this.generation) {
        this.clearPeerExitTimer();
        this.update({phase:'active'});
        this.refreshMembers();
        this.mediaChanged$.next(this.mediaChanged$.value + 1);
      }
    });
    room.on(RoomEvent.ParticipantDisconnected, () => {
      if (this.room!==room || version!==this.generation) return;
      // LiveKit also emits this event when a peer performs a full WebRTC
      // reconnect. Don't terminate the server call before it rejoins.
      this.clearPeerExitTimer();
      // Other group members may still be connected after one member leaves.
      if (room.remoteParticipants.size > 0) {
        this.mediaChanged$.next(this.mediaChanged$.value + 1);
        this.refreshMembers();
        return;
      }
      this.update({phase:'connecting'});
      this.peerExitTimer=setTimeout(() => {
        this.peerExitTimer=undefined;
        if (this.room===room && version===this.generation
            && room.remoteParticipants.size===0)
          this.failConnection(session,version,'calls.peerDisconnected');
      },20_000);
    });
    room.on(RoomEvent.Reconnecting, () => {
      if (this.room!==room || version!==this.generation) return;
      this.transportReconnecting=true;
      this.connectionQuality$.next('unknown');
      this.update({phase:'connecting'});
      this.mediaChanged$.next(this.mediaChanged$.value+1);
    });
    room.on(RoomEvent.Reconnected, () => {
      if (this.room!==room || version!==this.generation) return;
      this.transportReconnecting=false;
      this.connectionQuality$.next('unknown');
      this.audioPlaybackBlocked$.next(room.canPlaybackAudio === false);
      if (room.remoteParticipants.size>0) {
        this.clearPeerExitTimer();
        this.update({phase:'active'});
      }
      // Reconcile truly missing publications after recovery, without
      // re-opening media permissions or changing a deliberately muted track.
      this.reconcileLocalMediaAfterReconnect(room);
      this.mediaChanged$.next(this.mediaChanged$.value+1);
      void this.refreshDevices();
      this.refreshMembers();
    });
    room.on(RoomEvent.Disconnected, () => {
      if (this.room===room) this.failConnection(session,version,'calls.connectionLost');
    });
    try {
      await room.connect(session.serverUrl,session.token,{autoSubscribe:true});
    } catch {
      this.failConnection(session,version,'calls.connectionFailed');
      return;
    }
    if (version!==this.generation) {void room.disconnect();return;}
    this.audioPlaybackBlocked$.next(room.canPlaybackAudio === false);
    void this.refreshDevices();
    // Microphone/camera permission failures should not end an established
    // room: stay connected as listener and let the user retry the devices.
    let micEnabled=false;
    let cameraEnabled=false;
    let microphoneError: string | undefined;
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
      micEnabled=true;
    } catch (error) {
      microphoneError=this.mediaFailure(error,'microphone');
      if (version===this.generation) this.update({error:microphoneError});
    }
    if (version!==this.generation) {void room.disconnect();return;}
    if (session.media==='video') {
      // Reuse the same safe fallback and browser-specific diagnostics as the
      // in-call Retry camera control, instead of a separate fragile path.
      this.update({micEnabled});
      await this.setCamera(true);
      cameraEnabled=this.state$.value?.cameraEnabled === true;
      // An unrelated successful camera publication must not hide a blocked mic.
      if (microphoneError && cameraEnabled) this.update({error:microphoneError});
    }
    if (version!==this.generation) {void room.disconnect();return;}
    this.update({micEnabled:micEnabled,cameraEnabled:cameraEnabled});
    if (room.remoteParticipants.size) this.update({phase:'active'});
    if (this.state$.value?.phase === 'active') this.refreshMembers();
    this.mediaChanged$.next(this.mediaChanged$.value+1);
  }

  /**
   * Only show a system notification when the user has already granted browser
   * permission and this tab is backgrounded. Never request notification access
   * because somebody is calling, and never show a second foreground popup.
   * This doesn't promise notifications if the browser/tab is completely closed.
   */
  private notifyBackgroundIncoming(call: DirectCallEvent): void {
    if (document.visibilityState !== 'hidden' || typeof Notification === 'undefined'
        || Notification.permission !== 'granted') return;
    try {
      this.dismissBackgroundCallNotification();
      const notification = new Notification(appTranslate('calls.incoming'), {
        body: call.caller + ' · ' + appTranslate(
          call.media === 'video' ? 'calls.video' : 'calls.voice'),
        tag: 'jynlo-incoming-call',
        silent: true
      });
      notification.onclick = () => {
        window.focus();
        this.dismissBackgroundCallNotification();
      };
      this.backgroundCallNotification = notification;
    } catch {
      // Notifications are best-effort: the in-page call card remains available.
    }
  }

  private dismissBackgroundCallNotification(): void {
    const notice = this.backgroundCallNotification;
    this.backgroundCallNotification = null;
    if (notice) {
      try { notice.close(); } catch { /* Browser already dismissed it. */ }
    }
  }

  private onEvent(call: DirectCallEvent): void {
    const user=this.username().toLowerCase();
    if (!user || !this.available$.value) return;
    if (call.status==='RINGING') {
      if (call.peer.toLowerCase()!==user || this.state$.value) return;
      const expiresAt=Date.parse(call.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt<=Date.now()) return;
      this.state$.next({id:call.callId,peer:call.caller,media:call.media,
        phase:'incoming',expiresAt,micEnabled:false,cameraEnabled:false});
      this.notifyBackgroundIncoming(call);
      this.scheduleExpiry(call.callId,expiresAt);
      return;
    }
    const state=this.state$.value;
    if (!state || state.id!==call.callId) return;
    if (call.status==='MEMBERS_CHANGED' || call.status==='LEFT') {
      if (call.status==='LEFT' && call.actor.toLowerCase()===user) {
        this.dropCall();
      } else if (state.phase==='active') this.refreshMembers();
      return;
    }
    if (call.status==='ACTIVE') {
      if (state.phase!=='incoming' && state.phase!=='error') {
        this.clearRingTimer();
        this.update({phase:'active'});
        this.refreshMembers();
      } else if (state.phase==='incoming') {
        // Accepted by another device belonging to the same recipient account.
        this.dropCall();
      }
    }
    if (call.status==='DECLINED' || call.status==='ENDED') {
      // A late server echo must not hide a locally detected connection error.
      if (state.phase!=='error') this.dropCall();
    }
  }

  private scheduleExpiry(id: string, expiresAt: number): void {
    this.clearRingTimer();
    this.ringTimer=setTimeout(() => {
      const state=this.state$.value;
      if (state?.id===id && (state.phase==='incoming' || state.phase==='dialing')) this.end();
    },Math.max(0,expiresAt-Date.now()));
  }

  private clearRingTimer(): void {
    if (this.ringTimer) clearTimeout(this.ringTimer);
    this.ringTimer=undefined;
  }

  private clearPeerExitTimer(): void {
    if (this.peerExitTimer) clearTimeout(this.peerExitTimer);
    this.peerExitTimer=undefined;
  }

  private update(patch: Partial<DirectCallState>): void {
    const state=this.state$.value;
    if (state) {
      const startedAt=patch.phase==='active' ? (state.startedAt || Date.now()) : state.startedAt;
      this.state$.next({...state,...patch,startedAt});
    }
  }

  private dropCall(): void {
    this.dismissBackgroundCallNotification();
    ++this.generation;
    this.transportReconnecting=false;
    this.clearRingTimer();
    this.clearPeerExitTimer();
    const room=this.room;
    this.room=null;
    if (room) room.disconnect();
    this.state$.next(null);
    this.audioPlaybackBlocked$.next(false);
    this.devices$.next([]);
    this.selectedDevices$.next({});
    this.connectionQuality$.next('unknown');
    this.screenShareEnabled$.next(false);
    this.screenShareFeedback$.next(null);
    this.busyMedia$.next(false);
    this.members$.next({participants:[],pending:[]});
    this.invitationBusy$.next(false);
    this.invitationError$.next(null);
    this.mediaChanged$.next(this.mediaChanged$.value+1);
  }

  ngOnDestroy(): void {
    window.removeEventListener('storage',this.onStorage);
    window.removeEventListener('focus',this.onForeground);
    document.removeEventListener('visibilitychange',this.onForeground);
    navigator.mediaDevices?.removeEventListener?.('devicechange',this.onDevicesChanged);
    if (this.pendingTimer) clearInterval(this.pendingTimer);
    this.subscriptions.unsubscribe();
    this.dropCall();
  }
}
