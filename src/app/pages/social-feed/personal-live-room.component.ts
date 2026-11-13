import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild, inject } from '@angular/core';
import { firstValueFrom, interval, Subscription, timeout } from 'rxjs';
import { Room, RoomEvent, RemoteTrack, Track } from 'livekit-client';
import { PersonalLiveEvent, PersonalLiveService } from '../../services/personal-live.service';

@Component({
  selector:'app-personal-live-room',
  standalone:true,
  imports:[CommonModule],
  template:`
    <section class="personal-live" aria-label="Transmissão pessoal">
      <header>
        <div><strong><span class="live-dot">●</span> {{event.title}}</strong>
          <small>Direto de @{{event.username}} · {{participantCount}} participantes</small></div>
        <button type="button" class="close" (click)="event.canManage ? end() : leave()" aria-label="Sair do direto">×</button>
      </header>
      @if (error) {<p role="alert">{{error}}</p>}
      @if (connecting) {<p role="status">{{ connectionStatus }}</p>}
      @if (!connecting && room) {
        <p class="live-connection-status" role="status">● Transmissão ligada</p>
      }
      <div #stage class="personal-live-stage" aria-label="Vídeo da transmissão"></div>
      @if (event.canManage) {
        <footer aria-label="Controlos do direto">
          <button type="button" [disabled]="!room || connecting || deviceBusy"
            [attr.aria-pressed]="micOn" (click)="toggleMic()">{{ micOn ? 'Silenciar microfone' : 'Ligar microfone' }}</button>
          <button type="button" [disabled]="!room || connecting || deviceBusy"
            [attr.aria-pressed]="cameraOn" (click)="toggleCamera()">{{ cameraOn ? 'Desligar câmara' : 'Ligar câmara' }}</button>
          <button type="button" class="end" [disabled]="ending"
            (click)="end()">{{ ending ? 'A terminar…' : 'Terminar direto' }}</button>
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
    .personal-live-stage{min-height:260px;background:#021119;border-radius:.8rem;
      display:flex;flex-wrap:wrap;align-items:center;justify-content:center;overflow:hidden}
    .personal-live-stage video{max-width:100%;max-height:56dvh;object-fit:contain}
    footer{display:flex;flex-wrap:wrap;gap:.6rem}footer button{background:#184451;color:#fff;
      padding:.65rem;border:1px solid #47767e;border-radius:.6rem;cursor:pointer}
    footer .end{background:#932d42}footer button:disabled{opacity:.5;cursor:not-allowed}
    p[role="alert"]{color:#fecaca}.live-connection-status{color:#5eead4;margin:0;font-size:.82rem}
  `]
})
export class PersonalLiveRoomComponent implements OnInit, OnDestroy {
  @Input({required:true}) event!:PersonalLiveEvent;
  @Output() closed=new EventEmitter<void>();
  @ViewChild('stage') stage?:ElementRef<HTMLElement>;
  private readonly service=inject(PersonalLiveService);
  private heartbeats?:Subscription;
  private attached:HTMLMediaElement[]=[];
  room:Room|null=null;
  connecting=false;
  connectionStatus='A ligar à transmissão…';
  deviceBusy=false;
  ending=false;
  error='';
  cameraOn=false;
  micOn=false;
  participantCount=0;
  private destroyed=false;
  private ended=false;

  ngOnInit():void {void this.connect();}

  async connect():Promise<void> {
    if (this.room || this.connecting || this.destroyed) return;
    this.connecting=true;this.connectionStatus='A ligar à transmissão…';this.error='';
    let next:Room|null=null;
    try {
      const credentials=await firstValueFrom(this.service.join(this.event.id).pipe(timeout(12000)));
      if (this.destroyed) return;
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
      activeRoom.on(RoomEvent.ParticipantConnected,()=>this.countParticipants());
      activeRoom.on(RoomEvent.ParticipantDisconnected,()=>this.countParticipants());
      activeRoom.on(RoomEvent.Disconnected,()=>this.leave());
      this.room=activeRoom;
      await activeRoom.connect(credentials.serverUrl,credentials.token);
      if (this.destroyed) {await activeRoom.disconnect();return;}
      this.countParticipants();
      this.connecting=false;
      if (credentials.role==='HOST' && this.event.canManage) {
        this.heartbeats=interval(20000).subscribe(()=>
          this.service.heartbeat(this.event.id).pipe(timeout(10000)).subscribe({
            error:()=>{this.error='O direto terminou ou a ligação ao servidor falhou.';this.leave();}
          }));
        // Device permissions are independent: microphone failures must not
        // hide the controls or leave the room stuck in 'connecting'.
        this.deviceBusy=true;
        try {
          await activeRoom.localParticipant.setCameraEnabled(true);
          this.cameraOn=true;
        } catch {
          this.error='Não foi possível ativar a câmara. Podes tentar novamente nos controlos.';
        }
        try {
          await activeRoom.localParticipant.setMicrophoneEnabled(true);
          this.micOn=true;
        } catch {
          this.error='Não foi possível ativar o microfone. Podes tentar novamente nos controlos.';
        } finally {
          this.deviceBusy=false;
        }
      }
    } catch {
      if (next) await next.disconnect().catch(()=>{});
      if (this.room===next) this.room=null;
      this.error='Não foi possível entrar no direto. Verifica a ligação e as permissões.';
    } finally {this.connecting=false;}
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
    } else if (element instanceof HTMLAudioElement) {
      document.body.appendChild(element);
      this.attached.push(element);
    }
  }
  async toggleCamera():Promise<void> {
    if(!this.room || !this.event.canManage)return;
    try{await this.room.localParticipant.setCameraEnabled(!this.cameraOn);
      this.cameraOn=!this.cameraOn;}catch{this.error='Não foi possível alterar a câmara.';}
  }
  async toggleMic():Promise<void> {
    if(!this.room || !this.event.canManage)return;
    try{await this.room.localParticipant.setMicrophoneEnabled(!this.micOn);
      this.micOn=!this.micOn;}catch{this.error='Não foi possível alterar o microfone.';}
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
    this.heartbeats?.unsubscribe();this.heartbeats=undefined;
    const active=this.room;this.room=null;
    if(active)void active.disconnect();
    for(const el of this.attached)el.remove();
    this.attached=[];
    this.closed.emit();
  }
  ngOnDestroy():void {
    this.destroyed=true;
    if(this.event?.canManage && !this.ended) {
      // A host closing the window must not leave a stream orphaned.
      this.service.end(this.event.id).pipe(timeout(10000)).subscribe({error:()=>{}});
    }
    this.heartbeats?.unsubscribe();
    if(this.room)void this.room.disconnect();
    for(const el of this.attached)el.remove();
    this.attached=[];
  }
}
