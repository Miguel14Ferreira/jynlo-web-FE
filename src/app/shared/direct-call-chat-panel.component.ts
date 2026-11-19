import {CommonModule} from '@angular/common';
import {HttpErrorResponse} from '@angular/common/http';
import {Component,Input,OnChanges,OnDestroy,OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Subscription} from 'rxjs';
import {DirectChatService} from '../services/direct-chat.service';
import {DirectChatRealtimeService} from '../services/direct-chat-realtime.service';
import {DirectChatMessage} from '../pages/model/direct-chat';

/** Teams-style in-call drawer. Reuse the authenticated direct-chat endpoint;
 * never create a second, ephemeral "call chat" conversation.
 * Socket payloads only invalidate the history; data comes from the API.
 */
@Component({
 selector:'app-direct-call-chat-panel',
 standalone:true,
 imports:[CommonModule,FormsModule],
 template:`
  <section class="jynlo-call-chat" aria-label="Chat da chamada">
   <header class="call-chat-head">
    <span class="call-chat-avatar" aria-hidden="true">{{peer.slice(0,1).toUpperCase()}}</span>
    <div class="call-chat-head-copy">
     <strong>Chat da chamada</strong>
     <small>Conversa privada com @{{peer}}</small>
    </div>
   </header>
   @if (loading) { <p class="call-chat-loading" role="status">A abrir mensagens…</p> }
   @if (syncWarning) { <p class="call-chat-warning" role="status">{{syncWarning}}</p> }
   <div class="call-chat-history" role="log" aria-label="Mensagens durante a chamada" aria-live="polite">
    @if (!loading && !messages.length) { <p class="call-chat-empty">Ainda não há mensagens. Inicia a conversa!</p> }
    @for (message of messages; track message.id) {
     <article class="call-chat-bubble" [class.is-mine]="isMine(message)">
      <small class="call-chat-sender">{{isMine(message)?'Tu':'@'+peer}}</small>
      @if (message.replyToText && !message.deletedAt) {
       <span class="call-chat-quote">↳ {{message.replyToText}}</span>
      }
      <p>{{message.deletedAt?'Mensagem removida':(message.text || (message.attachmentName || (message.attachments?.length?'Anexo partilhado':'Mensagem')))}}</p>
      <time>{{messageTime(message)}}</time>
     </article>
    }
   </div>
   @if (error) { <p class="call-chat-warning" role="alert">{{error}}</p> }
   <form class="call-chat-composer" (ngSubmit)="sendMessage()">
    <textarea name="message" [(ngModel)]="draft" rows="2" maxlength="2000"
     aria-label="Escrever mensagem na chamada" placeholder="Escrever mensagem…"
     [disabled]="sending || accessRevoked"></textarea>
    <button type="submit" [disabled]="sending || accessRevoked || !draft.trim()"
     aria-label="Enviar mensagem durante a chamada">{{sending?'…':'Enviar'}}</button>
   </form>
  </section>
 `,
 styles:[`
  :host{display:flex;min-height:0;min-width:0}
  .jynlo-call-chat{display:flex;flex-direction:column;flex:1;gap:9px;min-height:0;min-width:0;
   border:1px solid #3d8790;background:#08222f;border-radius:16px;padding:12px;color:#eafff8}
  .call-chat-head{display:flex;align-items:center;gap:10px;min-width:0}
  .call-chat-avatar{display:grid;place-items:center;flex:0 0 39px;height:39px;border-radius:50%;
   border:1px solid #72e8d0;background:#164b56;font-weight:900;color:#b4ffe9}
  .call-chat-head-copy{min-width:0;display:grid;gap:3px}
  .call-chat-head-copy strong{font-size:.95rem}
  .call-chat-head-copy small{color:#adccd0;font-size:.74rem;overflow-wrap:anywhere}
  .call-chat-history{flex:1;min-height:110px;overflow:auto;display:flex;flex-direction:column;
   gap:8px;overscroll-behavior:contain;padding:5px 2px;scrollbar-width:thin}
  .call-chat-bubble{max-width:92%;align-self:flex-start;padding:9px 11px;border-radius:13px;
   background:#173d4b;display:grid;gap:4px;overflow-wrap:anywhere}
  .call-chat-bubble.is-mine{align-self:flex-end;background:#11616a}
  .call-chat-bubble p{margin:0;font-size:.82rem;line-height:1.45;white-space:pre-wrap}
  .call-chat-bubble small{color:#93f4da;font-size:.7rem;font-weight:800}
  .call-chat-bubble time{color:#b4cdd2;font-size:.64rem;text-align:right}
  .call-chat-quote{font-size:.71rem;color:#c2d8df;border-left:2px solid #8df4d8;padding-left:6px}
  .call-chat-composer{display:flex;gap:7px;align-items:flex-end;margin:0}
  .call-chat-composer textarea{flex:1;min-width:0;max-height:108px;min-height:44px;resize:vertical;
   font:inherit;font-size:.83rem;color:#effffb;background:#153844;border:1px solid #4c7b84;
   border-radius:10px;padding:10px}
  .call-chat-composer button{min-height:44px;padding:0 12px;border-radius:10px;border:0;
   background:#83efd3;color:#042a32;font:inherit;font-size:.79rem;font-weight:900;cursor:pointer}
  .call-chat-composer button:disabled{opacity:.45;cursor:default}
  .call-chat-composer :is(button,textarea):focus-visible{outline:3px solid #b4ffe9;outline-offset:2px}
  .call-chat-loading,.call-chat-empty{color:#afced1;font-size:.81rem}
  .call-chat-warning{color:#ffd0d0;background:#482936;border-radius:8px;padding:8px;font-size:.75rem}
  @media(max-width:650px){.jynlo-call-chat{padding:10px;border-radius:12px}}
 `]
})
export class DirectCallChatPanelComponent implements OnInit,OnChanges,OnDestroy {
 @Input() peer='';
 messages:DirectChatMessage[]=[];
 draft='';
 sending=false;
 loading=false;
 error='';
 syncWarning='';
 accessRevoked=false;
 private generation=0;
 private loadingNow=false;
 private pendingRefresh=false;
 private writeBusy=false;
 /** Keep only recently acknowledged sends while the server read catches up. */
 private readonly locallyConfirmed=new Map<number,{message:DirectChatMessage;at:number}>();
 private pollTimer:ReturnType<typeof setInterval>|null=null;
 private realtimeSubscription:Subscription|null=null;
 constructor(private readonly chat:DirectChatService,private readonly realtime:DirectChatRealtimeService){}
 ngOnInit():void{
  // The main inbox owns the authenticated WebSocket connection. This panel
  // listens to its invalidations and uses HTTP to validate every update.
  this.realtimeSubscription=this.realtime.messages$.subscribe(message=>{
   const other=this.peer.toLowerCase();
   if(other&&(message.username1?.toLowerCase()===other||message.username2?.toLowerCase()===other))
    this.refresh(true);
  });
  this.pollTimer=setInterval(()=>{if(typeof document==='undefined'||!document.hidden)this.refresh(true);},12000);
  this.refresh(false);
 }
 ngOnChanges():void{
  this.generation++;this.loadingNow=false;this.pendingRefresh=false;
  this.messages=[];this.draft='';this.error='';this.syncWarning='';this.accessRevoked=false;
  // An in-flight request belongs to the previous conversation. Its completion
  // is generation-guarded, so it must not keep the next peer's composer locked.
  this.writeBusy=false;this.sending=false;
  this.locallyConfirmed.clear();
  if(this.pollTimer)this.refresh(false);
 }
 ngOnDestroy():void{
  this.generation++;
  if(this.pollTimer)clearInterval(this.pollTimer);
  this.realtimeSubscription?.unsubscribe();
  this.locallyConfirmed.clear();
 }
 refresh(silent=true):void{
  if(!this.peer||this.accessRevoked)return;
  if(this.loadingNow){this.pendingRefresh=true;return;}
  const version=this.generation,peer=this.peer;
  this.loadingNow=true;
  if(!silent)this.loading=true;
  this.chat.history(peer).subscribe({
   next:rows=>{
    if(version!==this.generation||this.peer!==peer)return;
    if(!Array.isArray(rows)){this.syncWarning='Não foi possível validar o histórico.';return;}
    const messages=new Map<number,DirectChatMessage>();
    const serverIds=new Set<number>();
    for(const item of rows){
     if(typeof item.id!=='number'||!Number.isSafeInteger(item.id)||item.id<=0)continue;
     serverIds.add(item.id);
     messages.set(item.id,item);
    }
    const now=Date.now();
    for(const [id,entry] of this.locallyConfirmed){
     if(serverIds.has(id)||now-entry.at>45_000){this.locallyConfirmed.delete(id);continue;}
     messages.set(id,entry.message);
    }
    // A deletion or redaction on the server takes precedence over the old UI.
    this.messages=[...messages.values()].sort((a,b)=>(a.id||0)-(b.id||0)).slice(-60);
    this.syncWarning='';
   },
   error:(e:unknown)=>{
    if(version!==this.generation||this.peer!==peer)return;
    if(e instanceof HttpErrorResponse&&[401,403,404,410].includes(e.status)){
     this.messages=[];this.draft='';this.locallyConfirmed.clear();this.accessRevoked=true;
     this.error='Já não tens acesso ao chat deste contacto.';
    }else this.syncWarning='Não foi possível sincronizar as mensagens. O histórico pode estar desatualizado.';
   },
   complete:()=>this.finishRefresh(version,peer)
  }).add(()=>this.finishRefresh(version,peer));
 }
 private finishRefresh(version:number,peer:string):void{
  if(version!==this.generation||peer!==this.peer)return;
  if(!this.loadingNow)return;
  this.loadingNow=false;this.loading=false;
  if(this.pendingRefresh){this.pendingRefresh=false;this.refresh(true);}
 }
 isMine(message:DirectChatMessage):boolean{
  // An authenticated direct conversation has only the peer and the viewer.
  return message.username1.toLowerCase()!==this.peer.toLowerCase();
 }
 messageTime(message:DirectChatMessage):string{
  const value=message.date||'';
  const date=Date.parse(value);
  return Number.isFinite(date)?new Date(date).toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'}):'';
 }
 sendMessage():void{
  const peer=this.peer,body=this.draft.trim(),version=this.generation;
  if(!peer||this.accessRevoked||this.writeBusy||!body||body.length>2000)return;
  this.writeBusy=true;this.sending=true;this.error='';
  this.chat.send(peer,body).subscribe({
   next:message=>{
    if(version!==this.generation||peer!==this.peer)return;
    const accepted=typeof message.id==='number'&&Number.isSafeInteger(message.id)&&message.id>0&&
     !message.deletedAt&&message.username2?.toLowerCase()===peer.toLowerCase()&&
     message.text?.trim()===body;
    if(!accepted){
     this.error='O servidor não confirmou a mensagem. Consulta o histórico antes de repetir.';
     return;
    }
    this.locallyConfirmed.set(message.id!,{message,at:Date.now()});
    this.messages=this.messages.some(item=>item.id===message.id)?this.messages:
     [...this.messages,message].sort((a,b)=>(a.id||0)-(b.id||0)).slice(-60);
    if(this.draft.trim()===body)this.draft='';
    this.refresh(true);
   },
   error:()=>{
    if(version===this.generation&&peer===this.peer)
     this.error='Não foi possível confirmar o envio. Consulta o histórico antes de repetir.';
   }
  }).add(()=>{
   if(version===this.generation&&peer===this.peer){this.writeBusy=false;this.sending=false;}
  });
 }
}
