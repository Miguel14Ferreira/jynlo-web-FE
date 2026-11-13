import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild, inject } from '@angular/core';
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
        <button type="button" class="close" (click)="event.canManage ? end() : leave()" aria-label="Sair do direto">×</button>
      </header>
      @if (error) {<p role="alert">{{error}}</p>}
      @if (connecting) {<p role="status">{{ connectionStatus }}</p>}
      @if (!connecting && room && !reconnecting) {
        <p class="live-connection-status" role="status">● Transmissão ligada</p>
      }
      @if (reconnecting) {
        <p class="live-reconnection-status" role="status">A recuperar a ligação ao direto… Os controlos ficam temporariamente indisponíveis.</p>
      }
      <div class="personal-live-layout">
        <div #stage class="personal-live-stage" aria-label="Vídeo da transmissão"></div>
        <aside class="live-chat" aria-label="Chat da transmissão em direto">
          <header><strong>Chat em direto</strong>
            <small>{{messages.length}} mensagens recentes</small></header>
          @if (controls && !controls.chatEnabled) {
            <p class="chat-notice" role="status">O apresentador desativou as mensagens dos espectadores.</p>
          }
          @if (controls?.mutedByHost) {
            <p class="chat-notice" role="status">O apresentador silenciou as tuas mensagens.</p>
          }
          <div class="live-chat-history" aria-live="polite">
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
                <p>Estás a participar com vídeo neste direto.</p>
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
          @if (event.canManage) {
            <button type="button" class="end" [disabled]="ending"
              (click)="end()">{{ ending ? 'A terminar…' : 'Terminar direto' }}</button>
          }
        </footer>
      }
      @if (!room && !connecting && error) {
        <button type="button" (click)="connect()">Tentar novamente</button>
      }
    </section>
  `,
  styles:[`
    .personal-live{display:grid;gap:.8rem;width:min(760px,calc(100vw - 32px));max-height:88dvh;
      padding:1rem;border-radius:1rem;background:#0b2631;border:1px solid #368a83;color:#f2fffc;
      overflow:auto;box-sizing:border-box}
    header{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}
    header div{display:grid;gap:.3rem}header small{color:#a7c6ce}
    .live-dot{color:#fb7185}.close{background:transparent;border:0;border-radius:0;
      color:#fff;font-size:1.6rem;cursor:pointer}
    .personal-live-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(230px,285px);
      gap:12px;min-width:0}
    @media(max-width:700px){.personal-live-layout{grid-template-columns:1fr}}
    .personal-live-stage{min-height:260px;background:#021119;border-radius:.8rem;
      display:flex;flex-wrap:wrap;align-items:center;justify-content:center;overflow:hidden}
    .personal-live-stage video{max-width:100%;max-height:56dvh;object-fit:contain}
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

  `]
})
export class PersonalLiveRoomComponent implements OnInit, OnDestroy {
  @Input({required:true}) event!:PersonalLiveEvent;
  @Output() closed=new EventEmitter<void>();
  @ViewChild('stage') stage?:ElementRef<HTMLElement>;
  private readonly service=inject(PersonalLiveService);
  private readonly destroy$=new Subject<void>();
  private closing=false;
  private heartbeats?:Subscription;
  private interactionPoll?:Subscription;
  private rejoining=false;
  private attached:HTMLMediaElement[]=[];
  room:Room|null=null;
  connecting=false;
  connectionStatus='A ligar à transmissão…';
  deviceBusy=false;
  reconnecting=false;
  ending=false;
  private heartbeatFailures=0;
  private heartbeatBusy=false;
  error='';
  cameraOn=false;
  micOn=false;
  participantCount=0;
  private destroyed=false;
  private ended=false;
  messages:PersonalLiveChatMessage[]=[];
  controls:PersonalLiveControls|null=null;
  draft='';
  role:'HOST'|'GUEST'|'VIEWER'='VIEWER';
  sending=false;
  moderationBusy=false;

  ngOnInit():void {
    void this.connect();
    this.refreshInteractions();
    this.interactionPoll=interval(3000).subscribe(()=>this.refreshInteractions());
  }

  async connect():Promise<void> {
    if (this.room || this.connecting || this.destroyed || this.closing) return;
    this.connecting=true;this.connectionStatus='A ligar à transmissão…';this.error='';
    let next:Room|null=null;
    try {
      const credentials=await firstValueFrom(this.service.join(this.event.id).pipe(timeout(12000)));
      if (this.destroyed || this.closing) return;
      next=new Room({adaptiveStream:true,dynacast:true});
      const activeRoom=next;
      activeRoom.on(RoomEvent.TrackSubscribed,(track:RemoteTrack)=>{
        if (this.room===activeRoom) this.attach(track);
      });
      activeRoom.on(RoomEvent.TrackUnsubscribed,track=>{
        for (const element of track.detach()) {element.remove();this.attached=this.attached.filter(el=>el!==element);}
      });
      activeRoom.on(RoomEvent.LocalTrackPublished,publication=>{
        if (this.room===activeRoom && publication.track &&
            publication.source===Track.Source.Camera) this.attach(publication.track);
      });
      activeRoom.on(RoomEvent.LocalTrackUnpublished,publication=>{
        if (publication.track) for (const el of publication.track.detach()) el.remove();
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
          this.refreshInteractions();
        }
      });
      activeRoom.on(RoomEvent.ParticipantConnected,()=>this.countParticipants());
      activeRoom.on(RoomEvent.ParticipantDisconnected,()=>this.countParticipants());
      activeRoom.on(RoomEvent.Disconnected,()=>{
        // Ignore a late event from the previous connection when upgrading a
        // viewer to a host-approved guest or revoking guest permissions.
        if (this.room===activeRoom && !this.rejoining && !this.destroyed) this.leave();
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
              next:()=>{this.heartbeatFailures=0;},
              error:()=>{
                if(this.destroyed||this.closing)return;
                // Preserve a healthy stream after one transient HTTP failure.
                if(++this.heartbeatFailures>=3) {
                  this.error='Não foi possível manter o direto ativo. Verifica a ligação.';
                  this.leave();
                } else {
                  this.error='Ligação ao servidor instável. Vamos tentar novamente.';
                }
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
            if(this.room===activeRoom&&!this.destroyed)this.cameraOn=true;
          } catch {
            this.error='Não foi possível ativar a câmara. Podes tentar novamente nos controlos.';
          }
          try {
            if(this.room===activeRoom&&!this.destroyed) {
              await activeRoom.localParticipant.setMicrophoneEnabled(true);
              if(this.room===activeRoom&&!this.destroyed)this.micOn=true;
            }
          } catch {
            this.error='Não foi possível ativar o microfone. Podes tentar novamente nos controlos.';
          } finally {
            this.deviceBusy=false;
          }
        }
      }
    } catch {
      if (next) await next.disconnect().catch(()=>{});
      if (this.room===next) this.room=null;
      if(!this.destroyed&&!this.closing)
        this.error='Não foi possível entrar no direto. Verifica a ligação e as permissões.';
    } finally {this.connecting=false;}
  }
  private messagesLoading=false;
  private controlsLoading=false;

  refreshInteractions():void {
    if(this.destroyed||this.closing)return;
    // Polling runs every three seconds, while a request may take ten.
    // Never overlap polls of the same resource: an older response could
    // otherwise overwrite fresh chat messages or guest permissions.
    if(!this.messagesLoading){
      this.messagesLoading=true;
      this.service.messages(this.event.id).pipe(
        timeout(10000),takeUntil(this.destroy$),finalize(()=>this.messagesLoading=false)
      ).subscribe({
        next:entries=>{if(!this.destroyed)this.messages=entries;},
        error:()=>{}
      });
    }
    if(!this.controlsLoading){
      this.controlsLoading=true;
      this.service.controls(this.event.id).pipe(
        timeout(10000),takeUntil(this.destroy$),finalize(()=>this.controlsLoading=false)
      ).subscribe({
        next:state=>{
          if(this.destroyed)return;
          this.controls=state;
          if(this.room && !this.connecting && !this.rejoining &&
              ((state.isGuest && this.role==='VIEWER') ||
               (!state.isGuest && this.role==='GUEST')))void this.reconnectRole();
        },
        error:()=>{}
      });
    }
  }
  private async reconnectRole():Promise<void> {
    if(this.rejoining||this.destroyed||this.closing)return;
    this.rejoining=true;
    this.heartbeats?.unsubscribe();this.heartbeats=undefined;
    const current=this.room;this.room=null;
    this.role='VIEWER';
    this.cameraOn=false;this.micOn=false;
    for(const el of this.attached)el.remove();
    this.attached=[];
    try {
      if(current)await current.disconnect().catch(()=>{});
      if(!this.destroyed&&!this.closing)await this.connect();
    } finally {this.rejoining=false;}
  }
  isViewerMuted(username:string):boolean {
    return !!this.controls?.mutedUsernames.some(
      value=>value.toLowerCase()===username.toLowerCase());
  }
  sendMessage():void {
    const content=this.draft.trim();
    if(!content||this.sending||!this.room||this.connecting||this.reconnecting||content.length>500||
       (!this.event.canManage && (!this.controls?.chatEnabled || this.controls.mutedByHost)))return;
    this.sending=true;this.error='';
    this.service.sendMessage(this.event.id,content).pipe(timeout(10000),takeUntil(this.destroy$),
      finalize(()=>this.sending=false)).subscribe({
      next:()=>{this.draft='';this.refreshInteractions();},
      error:()=>{this.error='Não foi possível enviar a mensagem. Verifica se o chat está ativo.';}
    });
  }
  toggleChat():void {
    if(!this.event.canManage||!this.controls||this.moderationBusy)return;
    this.moderationBusy=true;
    this.service.setChatEnabled(this.event.id,!this.controls.chatEnabled).pipe(timeout(10000),takeUntil(this.destroy$),
      finalize(()=>this.moderationBusy=false)).subscribe({
      next:state=>this.controls=state,
      error:()=>this.error='Não foi possível alterar a moderação do chat.'
    });
  }
  toggleViewerMute(username:string,muted:boolean):void {
    if(!this.event.canManage||this.moderationBusy)return;
    this.moderationBusy=true;
    this.service.muteViewer(this.event.id,username,muted).pipe(timeout(10000),takeUntil(this.destroy$),
      finalize(()=>this.moderationBusy=false)).subscribe({
      next:state=>this.controls=state,
      error:()=>this.error='Não foi possível alterar o silêncio do espectador.'
    });
  }
  requestGuest():void {
    if(this.event.canManage||this.moderationBusy||!this.room||this.connecting||this.reconnecting||
       this.controls?.isGuest||this.controls?.requestStatus==='PENDING')return;
    this.moderationBusy=true;
    this.service.requestToJoin(this.event.id).pipe(timeout(10000),takeUntil(this.destroy$),
      finalize(()=>this.moderationBusy=false)).subscribe({
      next:()=>this.refreshInteractions(),
      error:()=>this.error='Não foi possível enviar o pedido para participar.'
    });
  }
  decideGuest(request:PersonalLiveGuestRequest,approve:boolean):void {
    if(!this.event.canManage||this.moderationBusy)return;
    this.moderationBusy=true;
    this.service.decideGuest(this.event.id,request.id,approve).pipe(timeout(10000),takeUntil(this.destroy$),
      finalize(()=>this.moderationBusy=false)).subscribe({
      next:()=>this.refreshInteractions(),
      error:()=>this.error='Não foi possível responder ao pedido.'
    });
  }
  removeGuest():void {
    if(!this.event.canManage||this.moderationBusy)return;
    this.moderationBusy=true;
    this.service.removeGuest(this.event.id).pipe(timeout(10000),takeUntil(this.destroy$),
      finalize(()=>this.moderationBusy=false)).subscribe({
      next:()=>this.refreshInteractions(),
      error:()=>this.error='Não foi possível retirar o convidado.'
    });
  }

  private countParticipants():void {
    if(this.room)this.participantCount=this.room.remoteParticipants.size+1;
  }
  private attach(track:{attach:()=>HTMLMediaElement}):void {
    const element=track.attach();
    element.autoplay=true;
    if(element instanceof HTMLVideoElement && this.stage?.nativeElement) {
      this.stage.nativeElement.appendChild(element);
      this.attached.push(element);
    } else if (element instanceof HTMLAudioElement && this.stage?.nativeElement) {
      this.stage.nativeElement.appendChild(element);
      this.attached.push(element);
    }
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
      if(this.room===activeRoom && !this.destroyed)this.cameraOn=enabled;
    }catch{
      if(this.room===activeRoom)this.error='Não foi possível alterar a câmara.';
    }finally{this.deviceBusy=false;}
  }
  async toggleMic():Promise<void> {
    if(!this.room || this.connecting || this.reconnecting || this.rejoining || this.deviceBusy ||
       (this.role!=='HOST' && this.role!=='GUEST'))return;
    const activeRoom=this.room;
    this.deviceBusy=true;
    try{
      const enabled=!this.micOn;
      await activeRoom.localParticipant.setMicrophoneEnabled(enabled);
      if(this.room===activeRoom && !this.destroyed)this.micOn=enabled;
    }catch{
      if(this.room===activeRoom)this.error='Não foi possível alterar o microfone.';
    }finally{this.deviceBusy=false;}
  }
  end():void {
    if(!this.event.canManage || this.ended || this.ending)return;
    this.ending=true;
    this.service.end(this.event.id).pipe(timeout(10000)).subscribe({
      next:()=>{this.ended=true;this.leave();},
      error:()=>{this.ending=false;this.error='Não foi possível terminar o direto. Tenta novamente.';}
    });
  }
  leave():void {
    if(this.closing)return;
    this.closing=true;
    this.heartbeats?.unsubscribe();this.heartbeats=undefined;
    this.interactionPoll?.unsubscribe();this.interactionPoll=undefined;
    this.reconnecting=false;
    this.destroy$.next();
    const active=this.room;this.room=null;
    this.role='VIEWER';
    if(active)void active.disconnect();
    for(const el of this.attached)el.remove();
    this.attached=[];
    this.closed.emit();
  }
  ngOnDestroy():void {
    this.destroyed=true;
    this.destroy$.next();this.destroy$.complete();
    if(this.event?.canManage && !this.ended && !this.ending) {
      // A host closing the window must not leave a stream orphaned.
      this.service.end(this.event.id).pipe(timeout(10000)).subscribe({error:()=>{}});
    }
    this.heartbeats?.unsubscribe();
    this.interactionPoll?.unsubscribe();
    if(this.room)void this.room.disconnect();
    for(const el of this.attached)el.remove();
    this.attached=[];
  }
}
