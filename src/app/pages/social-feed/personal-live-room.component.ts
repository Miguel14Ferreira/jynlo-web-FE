import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild, inject } from '@angular/core';
import { firstValueFrom, interval, Subscription, timeout, finalize, Subject, takeUntil } from 'rxjs';
import { Room, RoomEvent, RemoteTrack, Track } from 'livekit-client';
import { PersonalLiveEvent, PersonalLiveService, PersonalLiveChatMessage,
  PersonalLiveControls, PersonalLiveGuestRequest } from '../../services/personal-live.service';

@Component({
  selector:'app-personal-live-room',
  standalone:true,
  imports:[CommonModule,FormsModule],
  template:`
    <section class="personal-live" aria-label="Transmissão pessoal">
      <header>
        <div><strong><span class="live-dot">●</span> {{event.title}}</strong>
          <small>Direto de @{{event.username}} · {{participantCount}} participantes</small></div>
        <button type="button" class="close" [disabled]="ending"
          (click)="event.canManage ? requestEnd() : leave()"
          [attr.aria-label]="event.canManage ? 'Terminar direto' : 'Sair do direto'">×</button>
      </header>
      @if (error) {<p role="alert">{{error}}</p>}
      @if (connecting) {<p role="status">{{ connectionStatus }}</p>}
      @if (!connecting && room && !reconnecting) {
        <p class="live-connection-status" role="status">● Transmissão ligada</p>
      }
      @if (reconnecting) {
        <p class="live-reconnection-status" role="status">A recuperar a ligação ao direto… Os controlos ficam temporariamente indisponíveis.</p>
      }
      @if (switchingRole) {
        <p class="live-reconnection-status" role="status">A atualizar a participação no direto…</p>
      }
      <div class="live-toolbar" aria-label="Ações da transmissão">
        <button type="button" (click)="shareLive()" [disabled]="closing || ending">Partilhar direto</button>
        <button type="button" (click)="toggleFullscreen()" [disabled]="!room">Ampliar vídeo</button>
        @if (audioBlocked) {
          <button type="button" (click)="enableAudio()" [disabled]="!room">
            Ativar som da transmissão
          </button>
        }
        @if (shareFeedback) { <span role="status">{{shareFeedback}}</span> }
      </div>
      <div class="personal-live-layout">
        <div class="live-stage-container">
          <div #stage class="personal-live-stage" aria-label="Vídeo da transmissão">
            @if (!videoTiles) {
              <div class="live-stage-empty" role="status">
                <strong>À espera da imagem…</strong>
                <span>{{role === 'VIEWER' ? 'O vídeo aparece quando o apresentador ligar a câmara.' : 'Liga a câmara para começares a transmitir vídeo.'}}</span>
              </div>
            }
          </div>
          <div class="live-stage-info">
            <span>● {{participantCount}} {{participantCount === 1 ? 'pessoa na sala' : 'pessoas na sala'}}</span>
            @if (role==='GUEST') { <strong>Estás como convidado</strong> }
          </div>
        </div>
        <aside class="live-chat" aria-label="Chat da transmissão em direto">
          <header><strong>Chat em direto</strong>
            <small>{{messages.length}} mensagens recentes</small></header>
          @if (controls && !controls.chatEnabled) {
            <p class="chat-notice" role="status">O apresentador desativou as mensagens dos espectadores.</p>
          }
          @if (controls?.mutedByHost) {
            <p class="chat-notice" role="status">O apresentador silenciou as tuas mensagens.</p>
          }
          <div #chatHistory class="live-chat-history" aria-live="polite" aria-label="Mensagens recentes do direto">
            @for (message of messages; track message.id) {
              <div class="live-chat-message">
                <strong>@{{message.username}}</strong>
                <span>{{message.message}}</span>
                @if (event.canManage && message.username.toLowerCase() !== event.username.toLowerCase()) {
                  <button type="button" [disabled]="moderationBusy"
                    (click)="toggleViewerMute(message.username,!isViewerMuted(message.username))">
                    {{isViewerMuted(message.username)?'Permitir':'Silenciar'}}
                  </button>
                }
              </div>
            }
            @if (!messages.length) { <p>As mensagens vão aparecer aqui.</p> }
          </div>
          <form class="live-chat-input" (ngSubmit)="sendMessage()">
            <input name="liveMessage" [(ngModel)]="draft" maxlength="500"
              placeholder="Escrever mensagem…" aria-label="Mensagem para o direto"
              [disabled]="!room || connecting || reconnecting || sending || (!event.canManage && (!controls?.chatEnabled || controls?.mutedByHost))">
            <button type="submit" [disabled]="!room || connecting || reconnecting || sending || !draft.trim() ||
              (!event.canManage && (!controls?.chatEnabled || controls?.mutedByHost))">Enviar</button>
          </form>
          @if (!event.canManage) {
            <div class="live-guest-request">
              @if (controls?.requestStatus === 'PENDING') {
                <p>Pedido para participar enviado. Aguarda a aprovação.</p>
              } @else if (controls?.isGuest) {
                <p>Pedido aprovado! Liga a câmara e/ou o microfone quando estiveres preparado.</p>
              } @else {
                <button type="button" [disabled]="moderationBusy || !room || connecting || reconnecting"
                  (click)="requestGuest()">Pedir para entrar no direto</button>
              }
            </div>
          }
          @if (event.canManage && controls) {
            <div class="live-moderation">
              <button type="button" [disabled]="moderationBusy"
                (click)="toggleChat()">{{controls.chatEnabled?'Desativar chat':'Ativar chat'}}</button>
              @for (request of controls.pendingRequests;track request.id) {
                <div class="live-guest-row">
                  <span>@{{request.username}} quer participar</span>
                  <button type="button" [disabled]="moderationBusy" (click)="decideGuest(request,true)">Aceitar</button>
                  <button type="button" [disabled]="moderationBusy" (click)="decideGuest(request,false)">Recusar</button>
                </div>
              }
              @if (controls.guestUsername) {
                <div class="live-guest-row">
                  <span>Convidado: @{{controls.guestUsername}}</span>
                  <button type="button" [disabled]="moderationBusy" (click)="removeGuest()">Retirar do direto</button>
                </div>
              }
            </div>
          }
        </aside>
      </div>
      @if (event.canManage || role==='GUEST') {
        <footer aria-label="Controlos do direto">
          <button type="button" [disabled]="!room || connecting || reconnecting || deviceBusy"
            [attr.aria-pressed]="micOn" (click)="toggleMic()">{{ micOn ? 'Silenciar microfone' : 'Ligar microfone' }}</button>
          <button type="button" [disabled]="!room || connecting || reconnecting || deviceBusy"
            [attr.aria-pressed]="cameraOn" (click)="toggleCamera()">{{ cameraOn ? 'Desligar câmara' : 'Ligar câmara' }}</button>
          <button type="button" [disabled]="!room || connecting || reconnecting || deviceBusy"
            [attr.aria-pressed]="screenOn" (click)="toggleScreenShare()">
            {{ screenOn ? 'Parar partilha de ecrã' : 'Partilhar ecrã' }}
          </button>
          @if (event.canManage) {
            <button type="button" class="end" [disabled]="ending"
              (click)="requestEnd()">{{ ending ? 'A terminar…' : 'Terminar direto' }}</button>
          }
        </footer>
      }
      @if (!room && !connecting && error && !ended && !controlsUnavailable && !closing) {
        <button type="button" (click)="connect()">Tentar novamente</button>
      }
      @if (confirmingEnd) {
        <div class="live-confirm-backdrop" role="presentation">
          <section class="live-confirm-dialog" role="alertdialog" aria-modal="true"
            aria-labelledby="personal-live-end-title" aria-describedby="personal-live-end-desc">
            <h3 id="personal-live-end-title">Terminar o direto?</h3>
            <p id="personal-live-end-desc">A transmissão vai terminar para todos os espectadores e convidados.</p>
            <div class="live-confirm-actions">
              <button type="button" [disabled]="ending" (click)="confirmingEnd=false">Continuar em direto</button>
              <button type="button" class="end" [disabled]="ending"
                (click)="end()">{{ending ? 'A terminar…' : 'Terminar para todos'}}</button>
            </div>
          </section>
        </div>
      }
    </section>
  `,
  styles:[`
    .personal-live{display:grid;gap:.8rem;width:min(1120px,calc(100vw - 24px));max-height:94dvh;
      padding:clamp(.7rem,1.6vw,1.25rem);border-radius:1rem;background:#0b1925;
      border:1px solid #2d5862;color:#f2fffc;overflow:auto;box-sizing:border-box}
    header{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}
    header div{display:grid;gap:.3rem}header small{color:#a7c6ce}
    .live-dot{color:#fb7185}.close{background:transparent;border:0;border-radius:0;
      color:#fff;font-size:1.6rem;cursor:pointer}
    .personal-live-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,320px);
      gap:12px;min-width:0;min-height:0}
    .live-stage-container{display:flex;flex-direction:column;gap:.5rem;min-width:0}
    .personal-live-stage{min-height:320px;background:#020b14;border-radius:.8rem;
      display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));
      gap:8px;align-content:center;overflow:hidden;padding:8px;box-sizing:border-box}
    .personal-live-stage:fullscreen{align-content:center;padding:20px;background:#020b14}
    :host ::ng-deep .personal-live-stage .live-video-tile{min-width:0;position:relative;display:grid;
      place-items:center;overflow:hidden;background:#0a2531;border-radius:10px;min-height:180px}
    :host ::ng-deep .personal-live-stage .live-video-tile video{width:100%;height:100%;max-height:64dvh;
      object-fit:contain;display:block}
    /* Give a shared screen priority over face-camera tiles, Discord-style. */
    :host ::ng-deep .personal-live-stage .live-screen-tile{
      grid-column:1 / -1;min-height:clamp(240px,48dvh,650px);
      background:#020b14}
    :host ::ng-deep .personal-live-stage .live-screen-tile video{
      max-height:70dvh;object-fit:contain}
    :host ::ng-deep .personal-live-stage:fullscreen .live-screen-tile{
      min-height:75dvh}
    :host ::ng-deep .personal-live-stage .live-video-label{position:absolute;left:9px;bottom:9px;
      padding:5px 9px;border-radius:20px;background:#051b27d9;color:white;font-size:.76rem}
    .live-stage-empty{display:grid;gap:.5rem;text-align:center;justify-items:center;
      padding:2rem;color:#adc9cf}
    .live-stage-empty strong{color:#fff}
    .live-stage-info{display:flex;gap:.7rem;flex-wrap:wrap;align-items:center;
      font-size:.78rem;color:#9ecbd0}
    .live-stage-info strong{color:#5eead4}
    .live-toolbar{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
    .live-toolbar button{border:1px solid #376c73;background:#163943;color:#effffd;
      padding:.48rem .75rem;border-radius:.6rem;cursor:pointer;font:inherit;font-size:.82rem}
    .live-toolbar button:disabled{opacity:.5;cursor:not-allowed}
    .live-toolbar span{font-size:.79rem;color:#5eead4}
    @media(max-width:760px){
      .personal-live-layout{grid-template-columns:1fr}
      .personal-live-stage{min-height:250px}
      .live-chat-history{max-height:25dvh}
    }
    footer{display:flex;flex-wrap:wrap;gap:.6rem}footer button{background:#184451;color:#fff;
      padding:.65rem;border:1px solid #47767e;border-radius:.6rem;cursor:pointer}
    footer .end{background:#932d42}footer button:disabled{opacity:.5;cursor:not-allowed}
    p[role="alert"]{color:#fecaca}.live-connection-status{color:#5eead4;margin:0;font-size:.82rem}
    .live-reconnection-status{color:#fde68a;margin:0;font-size:.85rem}
    .live-chat{min-width:0;min-height:260px;display:flex;flex-direction:column;gap:9px;
      border:1px solid #285c66;border-radius:10px;padding:10px;background:#0b202b}
    .live-chat header{align-items:center;flex-wrap:wrap}
    .live-chat-history{display:grid;align-content:start;gap:9px;min-height:120px;
      max-height:37dvh;overflow:auto;overflow-wrap:anywhere}
    .live-chat-message{display:flex;flex-wrap:wrap;align-items:baseline;gap:5px;font-size:.79rem}
    .live-chat-message strong{color:#64dfcb}.live-chat-message button{border:0;
      color:#ffb9c5;background:transparent;cursor:pointer;font-size:.72rem}
    .live-chat-input{display:flex;gap:5px}.live-chat-input input{flex:1;min-width:0;
      border:1px solid #437783;border-radius:7px;padding:8px;background:#092a36;color:#fff}
    .live-chat-input button,.live-moderation button,.live-guest-request button{
      border:1px solid #398f88;border-radius:7px;padding:6px 9px;
      background:#15504d;color:white;cursor:pointer;font-size:.79rem}
    .live-chat button:disabled{opacity:.55;cursor:not-allowed}
    .live-chat .chat-notice{font-size:.76rem;color:#ffd9ad;margin:0}
    .live-guest-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;
      border-top:1px solid #41616b;padding-top:7px}
    .live-guest-row span{flex:1 1 100%;font-size:.78rem}
    .live-moderation,.live-guest-request{display:grid;gap:8px}
    .live-guest-request p{font-size:.78rem;color:#7fe8d7}
    .live-confirm-backdrop{position:fixed;inset:0;background:rgba(0,5,12,.78);
      z-index:4000;display:grid;place-items:center;padding:1rem}
    .live-confirm-dialog{background:#0b2631;border:1px solid #47767e;color:#f2fffc;
      padding:1.3rem;border-radius:1rem;width:min(420px,100%);
      box-shadow:0 18px 65px rgba(0,0,0,.6);box-sizing:border-box}
    .live-confirm-dialog h3{margin:0 0 .75rem;font-size:1.15rem}
    .live-confirm-dialog p{color:#c4d7dc;line-height:1.5}
    .live-confirm-actions{display:flex;gap:.6rem;justify-content:flex-end;flex-wrap:wrap}
    .live-confirm-actions button{background:#184451;color:#fff;border:1px solid #47767e;
      border-radius:.6rem;padding:.65rem .85rem;cursor:pointer}
    .live-confirm-actions .end{background:#932d42}
    .live-confirm-actions button:disabled{opacity:.5}

  `]
})
export class PersonalLiveRoomComponent implements OnInit, OnDestroy {
  @Input({required:true}) event!:PersonalLiveEvent;
  @Output() closed=new EventEmitter<'LEFT'|'ENDED'>();
  @ViewChild('stage') stage?:ElementRef<HTMLElement>;
  @ViewChild('chatHistory') chatHistory?:ElementRef<HTMLElement>;
  private readonly service=inject(PersonalLiveService);
  private readonly destroy$=new Subject<void>();
  closing=false;
  private heartbeats?:Subscription;
  private interactionPoll?:Subscription;
  private rejoining=false;
  switchingRole=false;
  private attached:HTMLMediaElement[]=[];
  private readonly trackOwners=new Map<HTMLMediaElement,string>();
  private lastMessageId:number|null=null;
  videoTiles=0;
  audioBlocked=false;
  shareFeedback='';
  room:Room|null=null;
  connecting=false;
  connectionStatus='A ligar à transmissão…';
  deviceBusy=false;
  reconnecting=false;
  ending=false;
  confirmingEnd=false;
  private heartbeatFailures=0;
  private heartbeatBusy=false;
  error='';
  cameraOn=false;
  micOn=false;
  screenOn=false;
  participantCount=0;
  private destroyed=false;
  private ended=false;
  messages:PersonalLiveChatMessage[]=[];
  controls:PersonalLiveControls|null=null;
  draft='';
  role:'HOST'|'GUEST'|'VIEWER'='VIEWER';
  sending=false;
  moderationBusy=false;

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event:Event):void {
    if(!this.confirmingEnd || this.ending)return;
    event.preventDefault();
    this.confirmingEnd=false;
  }

  ngOnInit():void {
    void this.connect();
    this.refreshInteractions();
    this.interactionPoll=interval(3000).subscribe(()=>this.refreshInteractions());
  }

  async connect(roleChange=false):Promise<void> {
    if (this.room || this.connecting || this.destroyed || this.closing ||
        (this.rejoining && !roleChange)) return;
    this.connecting=true;this.connectionStatus='A ligar à transmissão…';this.error='';
    let next:Room|null=null;
    try {
      const credentials=await firstValueFrom(this.service.join(this.event.id).pipe(timeout(12000)));
      if (this.destroyed || this.closing) return;
      next=new Room({adaptiveStream:true,dynacast:true});
      const activeRoom=next;
      activeRoom.on(RoomEvent.TrackSubscribed,(track:RemoteTrack,publication,participant)=>{
        if (this.room===activeRoom)
          this.attach(track,participant.name || participant.identity,false,participant.identity,
            publication.source===Track.Source.ScreenShare);
      });
      activeRoom.on(RoomEvent.TrackUnsubscribed,track=>{
        for (const element of track.detach()) {
          if(this.room===activeRoom)this.detachElement(element);
          else element.remove();
        }
      });
      activeRoom.on(RoomEvent.LocalTrackPublished,publication=>{
        if (this.room!==activeRoom || !publication.track)return;
        if(publication.source===Track.Source.Camera)
          this.attach(publication.track,'Tu',true);
        if(publication.source===Track.Source.ScreenShare) {
          this.screenOn=true;
          this.attach(publication.track,'O teu ecrã',true,undefined,true);
        }
      });
      activeRoom.on(RoomEvent.LocalTrackUnpublished,publication=>{
        if(publication.track)for(const el of publication.track.detach()){
          if(this.room===activeRoom)this.detachElement(el);
          else el.remove();
        }
        if(this.room===activeRoom){
          if(publication.source===Track.Source.ScreenShare)this.screenOn=false;
          if(publication.source===Track.Source.Camera)this.cameraOn=false;
          if(publication.source===Track.Source.Microphone)this.micOn=false;
        }
      });
      activeRoom.on(RoomEvent.Reconnecting,()=>{
        if(this.room===activeRoom&&!this.closing) {
          this.reconnecting=true;
          this.connectionStatus='A recuperar a ligação…';
        }
      });
      activeRoom.on(RoomEvent.Reconnected,()=>{
        if(this.room===activeRoom&&!this.closing) {
          this.reconnecting=false;
          this.countParticipants();
          this.syncLocalMedia(activeRoom);
          this.refreshInteractions();
        }
      });
      activeRoom.on(RoomEvent.ParticipantConnected,()=>{
        if(this.room===activeRoom)this.countParticipants();
      });
      activeRoom.on(RoomEvent.ParticipantDisconnected,participant=>{
        if(this.room!==activeRoom)return;
        // LiveKit may disconnect a participant before TrackUnsubscribed arrives.
        // Remove any media owned by that identity so no frozen tile remains.
        for(const [element,owner] of this.trackOwners)
          if(owner===participant.identity)this.detachElement(element);
        this.countParticipants();
      });
      activeRoom.on(RoomEvent.Disconnected,()=>{
        if(this.room!==activeRoom || this.rejoining || this.destroyed || this.closing)return;
        void this.recoverDisconnectedRoom(activeRoom);
      });
      this.room=activeRoom;
      await activeRoom.connect(credentials.serverUrl,credentials.token);
      if (this.destroyed || this.closing || this.room!==activeRoom) {
        await activeRoom.disconnect();return;
      }
      this.countParticipants();
      this.role=credentials.role;
      this.reconnecting=false;
      this.connecting=false;
      if (credentials.role==='HOST' || credentials.role==='GUEST') {
        if (credentials.role==='HOST') {
          this.heartbeats?.unsubscribe();
          this.heartbeatFailures=0;
          this.heartbeatBusy=false;
          this.heartbeats=interval(20000).pipe(takeUntil(this.destroy$)).subscribe(()=>{
            if(this.heartbeatBusy||this.closing||this.destroyed||this.reconnecting)return;
            this.heartbeatBusy=true;
            this.service.heartbeat(this.event.id).pipe(
              timeout(10000),takeUntil(this.destroy$),
              finalize(()=>this.heartbeatBusy=false)
            ).subscribe({
              next:()=>{
                if(this.heartbeatFailures>0 && this.error.includes('servidor instável'))
                  this.error='';
                this.heartbeatFailures=0;
              },
              error:()=>{
                if(this.destroyed||this.closing||this.room!==activeRoom)return;
                this.heartbeatFailures++;
                // A failed HTTP heartbeat is not proof that the LiveKit stream
                // ended. Keep the host's media active and retry on the next tick.
                this.error=this.heartbeatFailures>=3
                  ? 'A ligação ao servidor continua instável. O direto mantém-se aberto enquanto recuperamos.'
                  : 'Ligação ao servidor instável. Vamos tentar novamente.';
              }
            });
          });
        }
        // A newly admitted guest must choose when to activate their devices.
        // Hosts retain the existing auto-start behaviour for their broadcasts.
        if (credentials.role==='HOST') {
          this.deviceBusy=true;
          try {
            await activeRoom.localParticipant.setCameraEnabled(true);
            if(this.room===activeRoom&&!this.destroyed&&!this.closing)this.cameraOn=true;
          } catch {
            this.error='Não foi possível ativar a câmara. Podes tentar novamente nos controlos.';
          }
          try {
            if(this.room===activeRoom&&!this.destroyed&&!this.closing) {
              await activeRoom.localParticipant.setMicrophoneEnabled(true);
              if(this.room===activeRoom&&!this.destroyed&&!this.closing)this.micOn=true;
            }
          } catch {
            this.error='Não foi possível ativar o microfone. Podes tentar novamente nos controlos.';
          } finally {
            if(this.room===activeRoom)this.deviceBusy=false;
          }
          if(this.room===activeRoom)this.syncLocalMedia(activeRoom);
        }
      }
    } catch(error:unknown) {
      if(next && this.room===next)await this.disconnectForRetry(next);
      else if(next)await next.disconnect().catch(()=>{});
      if(this.destroyed||this.closing)return;
      if(error instanceof HttpErrorResponse && (error.status===404 || error.status===410)){
        // A previously shared broadcast may already have ended by the time
        // the viewer joins. Do not advertise a retry or end it a second time.
        this.handleBroadcastEnded();
      } else {
        this.error='Não foi possível entrar no direto. Verifica a ligação e as permissões.';
      }
    } finally {this.connecting=false;}
  }
  private async recoverDisconnectedRoom(activeRoom:Room):Promise<void> {
    if(this.room!==activeRoom || this.destroyed || this.closing)return;
    const previousRole=this.role;
    this.error='A ligação ao direto foi interrompida. A verificar o estado da transmissão…';
    await this.disconnectForRetry(activeRoom);
    if(this.destroyed || this.closing)return;
    try {
      const state=await firstValueFrom(this.service.controls(this.event.id).pipe(timeout(10000)));
      if(this.destroyed || this.closing || this.room)return;
      this.controls=state;
      // A host may revoke a guest's publishing token, requiring a fresh
      // spectator token. Rejoin only on an actual role change, not on an outage.
      if(previousRole==='GUEST' && !state.isGuest){
        this.lastRoleChangeAt=Date.now();
        await this.connect();
      } else {
        this.error='A ligação ao direto foi interrompida. Podes tentar entrar novamente.';
      }
    } catch(error:unknown) {
      if(this.destroyed || this.closing || this.room)return;
      if(error instanceof HttpErrorResponse && (error.status===404 || error.status===410))
        this.handleBroadcastEnded();
      else this.error='A ligação ao direto foi interrompida. Podes tentar entrar novamente.';
    }
  }
  private handleBroadcastEnded():void {
    if(this.destroyed || this.closing || this.ended)return;
    this.ended=true;
    this.controlsUnavailable=true;
    this.error='Este direto terminou ou já não está disponível.';
    this.leave('ENDED');
  }
  private syncLocalMedia(activeRoom:Room):void {
    if(this.room!==activeRoom||this.destroyed||this.closing)return;
    const local=activeRoom.localParticipant;
    const camera=local.getTrackPublication(Track.Source.Camera);
    const microphone=local.getTrackPublication(Track.Source.Microphone);
    const screen=local.getTrackPublication(Track.Source.ScreenShare);
    this.cameraOn=!!camera && !camera.isMuted;
    this.micOn=!!microphone && !microphone.isMuted;
    this.screenOn=!!screen && !screen.isMuted;
  }
  private async disconnectForRetry(activeRoom:Room):Promise<void> {
    if(this.room!==activeRoom || this.destroyed || this.closing)return;
    // Invalidate the room immediately so old LiveKit events cannot affect
    // replacement media or permissions during an asynchronous disconnect.
    this.room=null;
    this.reconnecting=false;
    this.heartbeats?.unsubscribe();this.heartbeats=undefined;
    this.cameraOn=false;this.micOn=false;this.screenOn=false;
    this.deviceBusy=false;
    this.role='VIEWER';
    this.participantCount=0;
    for(const element of [...this.attached])this.detachElement(element);
    this.trackOwners.clear();
    await activeRoom.disconnect().catch(()=>{});
  }
  private messagesLoading=false;
  private controlsLoading=false;
  private controlsRevision=0;
  private controlsMutation=false;
  private lastRoleChangeAt=0;
  controlsUnavailable=false;

  refreshInteractions():void {
    if(this.destroyed||this.closing||this.controlsUnavailable)return;
    // Polling runs every three seconds, while a request may take ten.
    // Never overlap polls of the same resource: an older response could
    // otherwise overwrite fresh chat messages or guest permissions.
    if(!this.messagesLoading){
      this.messagesLoading=true;
      this.service.messages(this.event.id).pipe(
        timeout(10000),takeUntil(this.destroy$),finalize(()=>this.messagesLoading=false)
      ).subscribe({
        next:entries=>{
          if(this.destroyed||this.closing)return;
          const history=this.chatHistory?.nativeElement;
          const nearBottom=!history || history.scrollHeight-history.scrollTop-history.clientHeight<80;
          const newest=entries.length?entries[entries.length-1].id:null;
          const changed=newest!==this.lastMessageId;
          this.messages=entries;
          this.lastMessageId=newest;
          // Preserve a viewer's scroll position while reading older messages.
          if(changed && nearBottom && history)
            requestAnimationFrame(()=>{
              if(!this.destroyed&&!this.closing && history.isConnected)
                history.scrollTop=history.scrollHeight;
            });
        },
        error:()=>{}
      });
    }
    if(!this.controlsLoading && !this.controlsMutation){
      const revision=this.controlsRevision;
      this.controlsLoading=true;
      this.service.controls(this.event.id).pipe(
        timeout(10000),takeUntil(this.destroy$),finalize(()=>this.controlsLoading=false)
      ).subscribe({
        next:state=>{
          if(this.destroyed||this.closing||revision!==this.controlsRevision)return;
          this.controls=state;
          if(this.room && !this.connecting && !this.rejoining && !this.reconnecting &&
              ((state.isGuest && this.role==='VIEWER') ||
               (!state.isGuest && this.role==='GUEST'))) {
            // Avoid repeated token requests when the API and LiveKit briefly
            // disagree about the assigned guest role.
            const now=Date.now();
            if(now-this.lastRoleChangeAt>=5000){
              this.lastRoleChangeAt=now;
              void this.reconnectRole();
            }
          }
        },
        error:(error:unknown)=>{
          if(this.destroyed||this.closing)return;
          if(error instanceof HttpErrorResponse &&
             (error.status===404 || error.status===410)){
            // The broadcast was removed or has ended on the server.
            this.handleBroadcastEnded();
          }
          // Do not disconnect on transient network, auth or server failures.
        }
      });
    }
  }
  private async reconnectRole():Promise<void> {
    if(this.rejoining||this.destroyed||this.closing)return;
    this.lastRoleChangeAt=Date.now();
    this.rejoining=true;
    this.switchingRole=true;
    this.controlsRevision++;
    const current=this.room;
    try {
      // Wait for the old identity to leave LiveKit before joining with the
      // upgraded/downgraded token. Otherwise two connections may compete.
      if(current)await this.disconnectForRetry(current);
      if(!this.destroyed&&!this.closing)await this.connect(true);
    } finally {
      this.rejoining=false;
      this.switchingRole=false;
    }
  }
  isViewerMuted(username:string):boolean {
    return !!this.controls?.mutedUsernames.some(
      value=>value.toLowerCase()===username.toLowerCase());
  }
  sendMessage():void {
    const content=this.draft.trim();
    if(!content||this.sending||!this.room||this.connecting||this.reconnecting||
       this.switchingRole||content.length>500||
       (!this.event.canManage && (!this.controls?.chatEnabled || this.controls.mutedByHost)))return;
    this.sending=true;this.error='';
    this.service.sendMessage(this.event.id,content).pipe(timeout(10000),takeUntil(this.destroy$),
      finalize(()=>this.sending=false)).subscribe({
      next:()=>{
        // Keep any new draft typed while the previous message was in flight.
        if(this.draft.trim()===content)this.draft='';
        this.refreshInteractions();
      },
      error:()=>{this.error='Não foi possível enviar a mensagem. Verifica se o chat está ativo.';}
    });
  }
  toggleChat():void {
    if(!this.event.canManage||!this.controls||this.moderationBusy)return;
    this.moderationBusy=true;this.controlsMutation=true;this.controlsRevision++;
    this.service.setChatEnabled(this.event.id,!this.controls.chatEnabled).pipe(timeout(10000),takeUntil(this.destroy$),
      finalize(()=>{
        this.moderationBusy=false;this.controlsMutation=false;this.refreshInteractions();
      })).subscribe({
      next:state=>this.controls=state,
      error:()=>this.error='Não foi possível alterar a moderação do chat.'
    });
  }
  toggleViewerMute(username:string,muted:boolean):void {
    if(!this.event.canManage||this.moderationBusy)return;
    this.moderationBusy=true;this.controlsMutation=true;this.controlsRevision++;
    this.service.muteViewer(this.event.id,username,muted).pipe(timeout(10000),takeUntil(this.destroy$),
      finalize(()=>{
        this.moderationBusy=false;this.controlsMutation=false;this.refreshInteractions();
      })).subscribe({
      next:state=>this.controls=state,
      error:()=>this.error='Não foi possível alterar o silêncio do espectador.'
    });
  }
  requestGuest():void {
    if(this.event.canManage||this.moderationBusy||!this.room||this.connecting||
       this.reconnecting||this.switchingRole||
       this.controls?.isGuest||this.controls?.requestStatus==='PENDING')return;
    this.moderationBusy=true;this.controlsMutation=true;this.controlsRevision++;
    this.service.requestToJoin(this.event.id).pipe(timeout(10000),takeUntil(this.destroy$),
      finalize(()=>{
        this.moderationBusy=false;this.controlsMutation=false;this.refreshInteractions();
      })).subscribe({
      next:()=>{},
      error:()=>this.error='Não foi possível enviar o pedido para participar.'
    });
  }
  decideGuest(request:PersonalLiveGuestRequest,approve:boolean):void {
    if(!this.event.canManage||this.moderationBusy)return;
    this.moderationBusy=true;this.controlsMutation=true;this.controlsRevision++;
    this.service.decideGuest(this.event.id,request.id,approve).pipe(timeout(10000),takeUntil(this.destroy$),
      finalize(()=>{
        this.moderationBusy=false;this.controlsMutation=false;this.refreshInteractions();
      })).subscribe({
      next:()=>{},
      error:()=>this.error='Não foi possível responder ao pedido.'
    });
  }
  removeGuest():void {
    if(!this.event.canManage||this.moderationBusy)return;
    this.moderationBusy=true;this.controlsMutation=true;this.controlsRevision++;
    this.service.removeGuest(this.event.id).pipe(timeout(10000),takeUntil(this.destroy$),
      finalize(()=>{
        this.moderationBusy=false;this.controlsMutation=false;this.refreshInteractions();
      })).subscribe({
      next:()=>{},
      error:()=>this.error='Não foi possível retirar o convidado.'
    });
  }

  private countParticipants():void {
    if(this.room)this.participantCount=this.room.remoteParticipants.size+1;
  }
  private detachElement(element:HTMLMediaElement):void {
    // Idempotent: both a disconnect and TrackUnsubscribed can report the same track.
    if(!this.attached.includes(element))return;
    this.trackOwners.delete(element);
    if(element instanceof HTMLVideoElement && element.parentElement?.classList.contains('live-video-tile')){
      element.parentElement.remove();
      this.videoTiles=Math.max(0,this.videoTiles-1);
    } else element.remove();
    this.attached=this.attached.filter(item=>item!==element);
    if(!this.attached.some(item=>item instanceof HTMLAudioElement))
      this.audioBlocked=false;
  }
  private attach(track:{attach:()=>HTMLMediaElement},label:string,isLocal:boolean,
    owner?:string,isScreen=false):void {
    const stage=this.stage?.nativeElement;
    if(!stage || this.destroyed || this.closing)return;
    const element=track.attach();
    element.autoplay=true;
    if(element instanceof HTMLVideoElement) {
      element.playsInline=true;
      // Audio is provided by separate LiveKit audio tracks; always mute video
      // elements so they can autoplay without browser audio restrictions.
      element.muted=true;
      const tile=document.createElement('div');
      tile.className=isScreen?'live-video-tile live-screen-tile':'live-video-tile';
      const name=document.createElement('span');
      name.className='live-video-label';
      name.textContent=isScreen
        ? (isLocal?'O teu ecrã':'Ecrã de @'+label.replace(/^@/,''))
        : (isLocal?label:'@'+label.replace(/^@/,''));
      tile.append(element,name);
      stage.appendChild(tile);
      this.attached.push(element);
      if(owner)this.trackOwners.set(element,owner);
      this.videoTiles++;
    } else if(element instanceof HTMLAudioElement && !isLocal) {
      element.style.display='none';
      stage.appendChild(element);
      this.attached.push(element);
      if(owner)this.trackOwners.set(element,owner);
      // Browsers can refuse automatic remote audio; offer a user-gesture retry.
      void element.play().catch(()=>{
        if(this.attached.includes(element) && !this.closing)this.audioBlocked=true;
      });
    } else element.remove();
  }
  async enableAudio():Promise<void> {
    const remoteAudio=this.attached.filter(
      (item):item is HTMLAudioElement=>item instanceof HTMLAudioElement
    );
    if(!remoteAudio.length){this.audioBlocked=false;return;}
    const results=await Promise.allSettled(remoteAudio.map(element=>element.play()));
    this.audioBlocked=results.some(result=>result.status==='rejected');
    if(this.audioBlocked)this.error='O navegador bloqueou o áudio. Verifica as permissões de som.';
    else if(this.error.includes('bloqueou o áudio'))this.error='';
  }
  async shareLive():Promise<void> {
    const url=new URL('/menu/feed',window.location.origin);
    url.searchParams.set('personalLive',String(this.event.id));
    try {
      if(typeof navigator.share==='function') {
        await navigator.share({title:this.event.title,url:url.href});
        this.shareFeedback='Direto partilhado.';
      } else {
        await navigator.clipboard.writeText(url.href);
        this.shareFeedback='Link do direto copiado.';
      }
    } catch(error) {
      if(error instanceof DOMException && error.name==='AbortError')return;
      this.shareFeedback='Não foi possível partilhar. Copia o endereço do direto.';
    }
  }
  async toggleFullscreen():Promise<void> {
    const stage=this.stage?.nativeElement;
    if(!stage)return;
    try {
      if(document.fullscreenElement)await document.exitFullscreen();
      else await stage.requestFullscreen();
    } catch {this.error='Não foi possível ampliar o vídeo neste dispositivo.';}
  }
  async toggleScreenShare():Promise<void> {
    if(!this.room || this.connecting || this.reconnecting || this.rejoining || this.deviceBusy ||
       (this.role!=='HOST' && this.role!=='GUEST'))return;
    const activeRoom=this.room;
    this.deviceBusy=true;
    try {
      const enabled=!this.screenOn;
      await activeRoom.localParticipant.setScreenShareEnabled(enabled);
      if(this.room===activeRoom&&!this.destroyed&&!this.closing)this.syncLocalMedia(activeRoom);
    } catch {
      if(this.room===activeRoom&&!this.closing)
        this.error='Não foi possível partilhar o ecrã. Verifica as permissões do navegador.';
    } finally {if(this.room===activeRoom)this.deviceBusy=false;}
  }
  async toggleCamera():Promise<void> {
    // Guests accepted by the host may publish their own media, just like the host.
    if(!this.room || this.connecting || this.reconnecting || this.rejoining || this.deviceBusy ||
       (this.role!=='HOST' && this.role!=='GUEST'))return;
    const activeRoom=this.room;
    this.deviceBusy=true;
    try{
      const enabled=!this.cameraOn;
      await activeRoom.localParticipant.setCameraEnabled(enabled);
      if(this.room===activeRoom && !this.destroyed && !this.closing)this.syncLocalMedia(activeRoom);
    }catch{
      if(this.room===activeRoom)this.error='Não foi possível alterar a câmara.';
    }finally{if(this.room===activeRoom)this.deviceBusy=false;}
  }
  async toggleMic():Promise<void> {
    if(!this.room || this.connecting || this.reconnecting || this.rejoining || this.deviceBusy ||
       (this.role!=='HOST' && this.role!=='GUEST'))return;
    const activeRoom=this.room;
    this.deviceBusy=true;
    try{
      const enabled=!this.micOn;
      await activeRoom.localParticipant.setMicrophoneEnabled(enabled);
      if(this.room===activeRoom && !this.destroyed && !this.closing)this.syncLocalMedia(activeRoom);
    }catch{
      if(this.room===activeRoom)this.error='Não foi possível alterar o microfone.';
    }finally{if(this.room===activeRoom)this.deviceBusy=false;}
  }
  requestEnd():void {
    if(!this.event.canManage || this.ended || this.ending || this.closing)return;
    this.confirmingEnd=true;
  }
  end():void {
    if(!this.event.canManage || !this.confirmingEnd || this.ended || this.ending)return;
    this.ending=true;
    this.service.end(this.event.id).pipe(timeout(10000)).subscribe({
      next:()=>{this.ended=true;this.confirmingEnd=false;this.leave('ENDED');},
      error:(error:unknown)=>{
        // A repeated end can legitimately report "already ended".
        if(error instanceof HttpErrorResponse && (error.status===404 || error.status===410)){
          this.handleBroadcastEnded();
          return;
        }
        if(!this.destroyed&&!this.closing){
          this.ending=false;
          this.error='Não foi possível terminar o direto. Tenta novamente.';
        }
      }
    });
  }
  leave(reason:'LEFT'|'ENDED'='LEFT'):void {
    if(this.closing)return;
    this.closing=true;
    this.lastMessageId=null;
    this.controlsUnavailable=true;
    this.confirmingEnd=false;
    this.heartbeats?.unsubscribe();this.heartbeats=undefined;
    this.interactionPoll?.unsubscribe();this.interactionPoll=undefined;
    this.reconnecting=false;
    this.switchingRole=false;
    this.deviceBusy=false;
    this.screenOn=false;
    this.audioBlocked=false;
    this.destroy$.next();
    const active=this.room;this.room=null;
    this.role='VIEWER';
    if(active)void active.disconnect().catch(()=>{});
    for(const el of [...this.attached])this.detachElement(el);
    this.attached=[];
    this.trackOwners.clear();
    this.videoTiles=0;
    this.participantCount=0;
    this.closed.emit(reason);
  }
  ngOnDestroy():void {
    this.destroyed=true;
    this.switchingRole=false;
    this.deviceBusy=false;
    this.screenOn=false;
    this.audioBlocked=false;
    this.destroy$.next();this.destroy$.complete();
    if(this.event?.canManage && !this.ended) {
      // A pending end request can fail after navigation. Retry the idempotent
      // server-side end operation on teardown to avoid orphaned broadcasts.
      // The API may return "already ended" for a duplicate request.
      this.service.end(this.event.id).pipe(timeout(10000)).subscribe({error:()=>{}});
    }
    this.heartbeats?.unsubscribe();
    this.interactionPoll?.unsubscribe();
    const activeRoom=this.room;
    this.room=null; // Ignore late LiveKit callbacks from a destroyed component.
    if(activeRoom)void activeRoom.disconnect().catch(()=>{});
    for(const el of [...this.attached])this.detachElement(el);
    this.attached=[];
    this.trackOwners.clear();
    this.videoTiles=0;
    this.participantCount=0;
  }
}
