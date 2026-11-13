import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Room, RoomEvent, Track, RemoteTrack, RemoteParticipant } from 'livekit-client';
import { Subscription, finalize, firstValueFrom, interval, startWith, switchMap, catchError, of, timeout } from 'rxjs';
import { CommunityLiveEvent, CommunityLiveService } from '../../services/community-live.service';

/**
 * Community-scoped live video. The host publishes; viewers always subscribe
 * only. Unlike the private-call client this component never alters call state.
 */
@Component({
  selector: 'app-community-live-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="live-panel" [hidden]="!enabled" aria-label="Transmissões em direto da comunidade">
      <div class="live-panel-heading">
        <div><strong>Diretos da comunidade</strong><p>Jogos, treinos e eventos em direto</p></div>
        <button type="button" class="live-refresh" (click)="load()" [disabled]="busy">Atualizar</button>
      </div>
      @if (error) { <p role="alert" class="live-error">{{ error }}</p> }
      @if (events.length) {
        <div class="live-event-list">
          @for (event of events; track event.id) {
            <article class="live-event">
              <div>
                <span class="live-status" [class.is-live]="event.status === 'LIVE'">
                  {{ event.status === 'LIVE' ? '● Em direto' : event.status === 'SCHEDULED' ? 'Agendado' : 'Terminado' }}
                </span>
                <strong>{{ event.title }}</strong>
                <small>{{ event.scheduledAt | date:'dd/MM/yyyy HH:mm' }}</small>
                @if (event.description) { <p>{{ event.description }}</p> }
              </div>
              <div class="live-event-actions">
                @if (event.status === 'LIVE') {
                  <button type="button" (click)="join(event)" [disabled]="busy || !!room">
                    {{ event.canManage ? 'Entrar como apresentador' : 'Assistir' }}
                  </button>
                  @if (event.canManage) {
                    <button type="button" class="secondary" (click)="end(event)" [disabled]="busy">Terminar</button>
                  }
                } @else if (event.status === 'SCHEDULED' && event.canManage) {
                  <button type="button" (click)="start(event)" [disabled]="busy">Iniciar direto</button>
                }
              </div>
            </article>
          }
        </div>
      }
      @if (canManage && !room) {
        <form class="live-schedule" (ngSubmit)="schedule()">
          <label>Título do direto
            <input name="liveTitle" [(ngModel)]="title" maxlength="120" required [disabled]="busy"
              placeholder="Ex.: Jogo de futebol de sábado"/>
          </label>
          <label>Descrição (opcional)
            <textarea name="liveDescription" [(ngModel)]="description" maxlength="1000" rows="2"
              [disabled]="busy"></textarea>
          </label>
          <label>Data e hora
            <input name="liveDate" type="datetime-local" [(ngModel)]="date" required [disabled]="busy"/>
          </label>
          <button type="submit" [disabled]="busy || !title.trim() || !date">Agendar transmissão</button>
        </form>
      }
      @if (room) {
        <div class="live-player" role="region" aria-label="Transmissão em direto">
          <div class="live-player-header">
            <strong>{{ active?.title }}</strong>
            <span>{{ hosting ? 'A transmitir' : 'A assistir' }}</span>
            <button type="button" (click)="leave()">Sair</button>
          </div>
          <div class="live-media" #stage aria-label="Vídeo e áudio da transmissão"></div>
          @if (hosting) {
            <div class="live-host-tools">
              <button type="button" (click)="toggleCamera()"> {{ cameraOn ? 'Desligar câmara' : 'Ligar câmara' }} </button>
              <button type="button" (click)="toggleMic()"> {{ micOn ? 'Silenciar microfone' : 'Ligar microfone' }} </button>
            </div>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .live-panel{border:1px solid #2c6c70;border-radius:16px;background:#092632;padding:16px;color:#e8f8f7;display:grid;gap:16px}
    .live-panel-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}
    .live-panel-heading strong{font-size:1.1rem}
    .live-panel-heading p,.live-event p{font-size:.82rem;color:#b1cbcd;margin:4px 0}
    .live-panel button{border-radius:9px;padding:9px 12px;background:#17675f;border:1px solid #56aea4;color:#f1fffc;cursor:pointer;font:inherit;font-size:.85rem}
    .live-panel button.secondary,.live-panel .live-refresh{background:transparent}
    .live-panel button:disabled{opacity:.55;cursor:not-allowed}
    .live-panel input,.live-panel textarea{width:100%;box-sizing:border-box;padding:9px;border:1px solid #337379;background:#061c29;border-radius:8px;color:#fff;font:inherit}
    .live-event-list{display:grid;gap:9px}
    .live-event{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px;background:#0c303e;border:1px solid #24525d;border-radius:10px}
    .live-event>div:first-child{display:grid;gap:5px}
    .live-event small{color:#bed3d5}
    .live-event-actions{display:flex;flex-wrap:wrap;gap:8px}
    .live-status{font-size:.73rem;color:#d2dce1}.live-status.is-live{color:#69edc8}
    .live-schedule{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .live-schedule label{display:grid;gap:5px;font-size:.81rem}
    .live-schedule label:first-child,.live-schedule label:nth-child(2){grid-column:1/-1}
    .live-error{background:#3c2331;color:#ffd1df;padding:9px;border-radius:8px}
    .live-player{display:grid;gap:10px}
    .live-player-header,.live-host-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .live-player-header>button{margin-left:auto}
    .live-media{min-height:220px;background:#020e16;border-radius:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;overflow:hidden}
    .live-media video{display:block;object-fit:contain;max-width:100%;max-height:65vh}
    @media(max-width:680px){.live-event{align-items:stretch;flex-direction:column}.live-schedule{grid-template-columns:minmax(0,1fr)}}
  `]
})
export class CommunityLivePanelComponent implements OnChanges, OnDestroy {
  @Input({required:true}) communityId!: number;
  @ViewChild('stage') stage?: ElementRef<HTMLElement>;
  private readonly api = inject(CommunityLiveService);
  private updates = new Subscription();
  private readonly attached = new Set<HTMLMediaElement>();
  private requestVersion = 0;
  events: CommunityLiveEvent[] = [];
  enabled = false;
  canManage = false;
  title = '';
  description = '';
  date = '';
  error = '';
  busy = false;
  active: CommunityLiveEvent | null = null;
  room: Room | null = null;
  hosting = false;
  cameraOn = false;
  micOn = false;
  ngOnChanges(): void {
    this.leave();
    this.events = [];
    this.enabled = false;
    this.canManage = false;
    this.requestVersion++;
    this.updates.unsubscribe();
    this.updates = new Subscription();
    const current = this.communityId;
    if (!current) return;
    const version = this.requestVersion;
    this.updates.add(this.api.capabilities(current).pipe(timeout(10000),
      catchError(() => of({enabled:false,canManage:false})))
      .subscribe(capabilities => {
        if (version !== this.requestVersion) return;
        this.enabled = capabilities.enabled;
        this.canManage = capabilities.canManage;
        if (!this.enabled) return;
        // Refresh visible live events without page reload; permission is
        // revalidated on every REST request.
        this.updates.add(interval(15000).pipe(startWith(0), switchMap(() =>
          this.api.list(current).pipe(timeout(10000),
            catchError(() => of([] as CommunityLiveEvent[])))
        )).subscribe(events => {
          if (version !== this.requestVersion) return;
          this.events = events;
          if (this.active && !events.some(e =>
              e.id === this.active?.id && e.status === 'LIVE')) this.leave();
        }));
      }));
  }

  load(): void {
    if (this.busy || !this.communityId) return;
    const version = this.requestVersion;
    this.api.list(this.communityId).pipe(timeout(10000)).subscribe({
      next: events => { if (version === this.requestVersion) { this.events = events; this.error = ''; } },
      error: () => { this.error = 'Não foi possível atualizar as transmissões.'; }
    });
  }

  schedule(): void {
    if (this.busy || !this.title.trim() || !this.date || !this.communityId) return;
    const startsAt = new Date(this.date);
    if (!Number.isFinite(startsAt.getTime())) { this.error = 'Data inválida.'; return; }
    this.busy = true;
    this.api.schedule(this.communityId, this.title.trim(), this.description.trim(),
      startsAt.toISOString()).pipe(finalize(() => this.busy = false)).subscribe({
      next: () => { this.title=''; this.description=''; this.date=''; this.error=''; this.load(); },
      error: () => this.error = 'Não foi possível agendar. Confirma as permissões e a data.'
    });
  }

  start(event: CommunityLiveEvent): void {
    if (this.busy) return;
    this.busy = true;
    this.api.start(this.communityId, event.id).pipe(finalize(() => this.busy = false)).subscribe({
      next: () => { this.load(); },
      error: () => this.error = 'Não foi possível iniciar. Verifica a ligação e a disponibilidade do vídeo.'
    });
  }

  end(event: CommunityLiveEvent): void {
    if (this.busy) return;
    this.busy = true;
    this.api.end(this.communityId, event.id).pipe(finalize(() => this.busy = false)).subscribe({
      next: () => { this.leave(); this.load(); },
      error: () => this.error = 'Não foi possível terminar a transmissão.'
    });
  }

  async join(event: CommunityLiveEvent): Promise<void> {
    if (this.busy || this.room) return;
    this.busy = true;
    this.error = '';
    const origin = this.communityId;
    try {
      const access = await firstValueFrom(this.api.join(origin, event.id).pipe(timeout(12000)));
      if (origin !== this.communityId) return;
      const room = new Room({ adaptiveStream:true, dynacast:true });
      this.room = room;
      this.hosting = access.role === 'HOST';
      this.active = event;
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _publication, _participant: RemoteParticipant) => {
        if (this.room !== room) return;
        this.attach(track);
      });
      room.on(RoomEvent.TrackUnsubscribed, track => {
        for (const element of track.detach()) element.remove();
      });
      room.on(RoomEvent.Disconnected, () => { if (this.room === room) this.leave(); });
      await room.connect(access.serverUrl, access.token);
      if (this.room !== room) { room.disconnect(); return; }
      if (this.hosting) {
        // A host explicitly chose to enter. Never start capture for spectators.
        await room.localParticipant.setCameraEnabled(true);
        this.cameraOn = true;
        await room.localParticipant.setMicrophoneEnabled(true);
        this.micOn = true;
        for (const publication of room.localParticipant.videoTrackPublications.values()) {
          if (publication.track && !publication.isMuted) this.attach(publication.track);
        }
      }
    } catch {
      this.error = 'Não foi possível entrar no direto. Verifica as permissões da câmara e do microfone.';
      this.leave();
    } finally { this.busy = false; }
  }

  private attach(track: {kind: Track.Kind; attach: () => HTMLMediaElement}): void {
    const stage = this.stage?.nativeElement;
    if (!stage) return;
    const element = track.attach();
    if (track.kind === Track.Kind.Video) {
      element.muted = this.hosting;
      element.setAttribute('playsinline','');
      element.setAttribute('aria-label', 'Vídeo em direto');
    } else {
      element.setAttribute('aria-label', 'Áudio do direto');
    }
    this.attached.add(element);
    stage.appendChild(element);
  }

  async toggleCamera(): Promise<void> {
    if (!this.hosting || !this.room) return;
    try {
      await this.room.localParticipant.setCameraEnabled(!this.cameraOn);
      this.cameraOn = !this.cameraOn;
    } catch { this.error = 'Não foi possível alterar a câmara.'; }
  }

  async toggleMic(): Promise<void> {
    if (!this.hosting || !this.room) return;
    try {
      await this.room.localParticipant.setMicrophoneEnabled(!this.micOn);
      this.micOn = !this.micOn;
    } catch { this.error = 'Não foi possível alterar o microfone.'; }
  }

  leave(): void {
    const room = this.room;
    this.room = null;
    this.active = null;
    this.hosting = false;
    this.cameraOn = false;
    this.micOn = false;
    room?.disconnect();
    for (const element of this.attached) element.remove();
    this.attached.clear();
  }

  ngOnDestroy(): void {
    this.requestVersion++;
    this.updates.unsubscribe();
    this.leave();
  }
}
