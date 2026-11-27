import { EmojiQuickComponent } from './emoji-quick/emoji-quick.component';
import { TranslatePipe } from '../i18n/translate.pipe';
import { appTranslate } from '../i18n/i18n.service';
import {CommonModule} from '@angular/common';
import {HttpErrorResponse} from '@angular/common/http';
import {Component,Input,OnChanges,OnDestroy,OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Subscription,timeout} from 'rxjs';
import {reportSlowSend} from './slow-send-report';
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
 imports:[TranslatePipe, CommonModule,FormsModule,EmojiQuickComponent],
 template:`
  <section class="jynlo-call-chat" [attr.aria-label]="'Chat da chamada' | t">
   <header class="call-chat-head">
    <span class="call-chat-avatar" aria-hidden="true">{{peer.slice(0,1).toUpperCase()}}</span>
    <div class="call-chat-head-copy">
     <strong>{{ 'Chat da chamada' | t }}</strong>
     <small>{{ 'Conversa privada com @{{peer}}' | t:{peer: (peer)} }}</small>
    </div>
   </header>
   @if (loading) { <p class="call-chat-loading" role="status">{{ 'A abrir mensagens…' | t }}</p> }
   @if (syncWarning) { <p class="call-chat-warning" role="status">{{syncWarning}}</p> }
   <div class="call-chat-history" role="log" [attr.aria-label]="'Mensagens durante a chamada' | t" aria-live="polite">
    @if (!loading && !messages.length) { <p class="call-chat-empty">{{ 'Ainda não há mensagens. Inicia a conversa!' | t }}</p> }
    @for (message of messages; track message.id) {
     <article class="call-chat-bubble" [class.is-mine]="isMine(message)">
      <small class="call-chat-sender">{{isMine(message)?('Tu' | t):'@'+peer}}</small>
      @if (message.replyToText && !message.deletedAt) {
       <span class="call-chat-quote">↳ {{message.replyToText}}</span>
      }
      @if (message.deletedAt) {
       <p>{{ 'Mensagem removida' | t }}</p>
      } @else {
       @if (message.text) { <p>{{message.text}}</p> }
       @if (message.id; as messageId) {
        @for (attachment of messageAttachments(message); track attachment.index) {
         @if (isImage(attachment.mimeType)) {
          @if (attachmentUrl(messageId,attachment.index); as url) {
           <a [href]="url" target="_blank" rel="noopener" [attr.aria-label]="('Abrir imagem {{filename}}' | t:{filename: attachment.filename})">
            <img class="call-chat-image" [src]="url" [alt]="attachment.filename" loading="lazy">
           </a>
          } @else {
           <span class="call-chat-attachment-state">{{attachmentFailed(messageId,attachment.index)?('Imagem indisponível' | t):('A carregar imagem…' | t)}}</span>
          }
         } @else {
          <button type="button" class="call-chat-file" (click)="openAttachment(messageId,attachment.index,attachment.filename)">
           📎 {{attachment.filename}}
          </button>
         }
        }
       }
       @if (!message.text && !messageAttachments(message).length) { <p>{{ 'Mensagem' | t }}</p> }
      }
      <time>{{messageTime(message)}}</time>
     </article>
    }
    @if (pendingText) {
     <article class="call-chat-bubble is-mine is-pending" aria-busy="true">
      <small class="call-chat-sender">{{ 'Tu' | t }}</small>
      <p>{{pendingText}}</p>
      <time>🕓 {{ 'A enviar…' | t }}</time>
     </article>
    }
   </div>
   @if (error) { <p class="call-chat-warning" role="alert">{{error}}</p> }
   <form class="call-chat-composer" (ngSubmit)="sendMessage()">
    <app-emoji-quick (picked)="draft = (draft + $event).slice(0, 2000)"></app-emoji-quick>
    <textarea name="message" [(ngModel)]="draft" rows="2" maxlength="2000"
     (keydown)="onComposerKey($event)"
     [attr.aria-label]="'Escrever mensagem na chamada' | t" [placeholder]="'Escrever mensagem…' | t"
     [disabled]="accessRevoked"></textarea>
    <button type="submit" [disabled]="sending || accessRevoked || !draft.trim()"
     [attr.aria-label]="'Enviar mensagem durante a chamada' | t">{{ 'Enviar' | t }}</button>
   </form>
  </section>
 `,
 styles:[`
  .call-chat-bubble.is-pending{opacity:.7}
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
  .call-chat-image{display:block;width:100%;max-width:260px;max-height:240px;object-fit:contain;border-radius:8px;background:#071e2a}
  .call-chat-attachment-state{color:#c9d8db;font-size:.74rem}
  .call-chat-file{padding:5px;border:0;background:transparent;color:#c7fff1;text-align:left;overflow-wrap:anywhere;cursor:pointer}
  .call-chat-bubble small{color:#93f4da;font-size:.7rem;font-weight:800}
  .call-chat-bubble time{color:#b4cdd2;font-size:.64rem;text-align:right}
  .call-chat-quote{font-size:.71rem;color:#c2d8df;border-left:2px solid #8df4d8;padding-left:6px}
  .call-chat-composer{display:flex;gap:7px;align-items:flex-end;margin:0}
  .call-chat-composer textarea{flex:1;min-width:0;max-height:108px;min-height:44px;resize:vertical;
   font:inherit;font-size:.83rem;color:#effffb;background:#153844;border:1px solid #4c7b84;
   border-radius:10px;padding:10px}
  .call-chat-composer > button{min-height:44px;padding:0 12px;border-radius:10px;border:0;
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
 /** The message being sent, shown at once (like WhatsApp's clock) so the composer never looks stuck. */
 pendingText:string|null=null;
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
 /** Attachment URLs are ephemeral and scoped to the active authenticated peer. */
 private readonly mediaUrls=new Map<string,string>();
 private readonly mediaFailures=new Set<string>();
 private readonly mediaRequests=new Map<string,Subscription>();
 private mediaPeer='';
 private mediaEpoch=0;
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
  this.generation++;this.clearMedia();this.loadingNow=false;this.pendingRefresh=false;
  this.messages=[];this.draft='';this.error='';this.syncWarning='';this.accessRevoked=false;
  // An in-flight request belongs to the previous conversation. Its completion
  // is generation-guarded, so it must not keep the next peer's composer locked.
  this.writeBusy=false;this.sending=false;this.pendingText=null;
  this.locallyConfirmed.clear();
  if(this.pollTimer)this.refresh(false);
 }
 ngOnDestroy():void{
  this.generation++;this.clearMedia();
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
  this.chat.history(peer).pipe(timeout(15_000)).subscribe({
   next:rows=>{
    if(version!==this.generation||this.peer!==peer)return;
    if(!Array.isArray(rows)){this.syncWarning=appTranslate('Não foi possível validar o histórico.');return;}
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
    this.syncAttachments();
    this.syncWarning='';
   },
   error:(e:unknown)=>{
    if(version!==this.generation||this.peer!==peer)return;
    if(e instanceof HttpErrorResponse&&[401,403,404,410].includes(e.status)){
     this.messages=[];this.draft='';this.locallyConfirmed.clear();this.clearMedia();this.accessRevoked=true;
     this.error=appTranslate('Já não tens acesso ao chat deste contacto.');
    }else this.syncWarning=appTranslate('Não foi possível sincronizar as mensagens. O histórico pode estar desatualizado.');
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
 private mediaKey(messageId:number,index:number):string { return messageId+':'+index; }
 isImage(mime:string|null|undefined):boolean { return !!mime && mime.toLowerCase().startsWith('image/'); }
 messageAttachments(message:DirectChatMessage):{index:number;filename:string;mimeType:string;size:number}[] {
  if(message.deletedAt||!message.id)return [];
  if(message.attachments?.length)return message.attachments.filter(a=>Number.isSafeInteger(a.index)&&a.index>=0);
  return message.attachmentName ? [{index:0,filename:message.attachmentName,
   mimeType:message.attachmentMimeType||'application/octet-stream',size:message.attachmentSize||0}] : [];
 }
 attachmentUrl(messageId:number,index:number):string|null {
  return this.mediaUrls.get(this.mediaKey(messageId,index))||null;
 }
 attachmentFailed(messageId:number,index:number):boolean {
  return this.mediaFailures.has(this.mediaKey(messageId,index));
 }
 private clearMedia():void {
  this.mediaEpoch++;
  for(const request of this.mediaRequests.values())request.unsubscribe();
  this.mediaRequests.clear();
  for(const url of this.mediaUrls.values())URL.revokeObjectURL(url);
  this.mediaUrls.clear();this.mediaFailures.clear();this.mediaPeer='';
 }
 private syncAttachments():void {
  if(!this.peer||this.accessRevoked)return;
  if(this.mediaPeer!==this.peer){this.clearMedia();this.mediaPeer=this.peer;}
  const keep=new Set<string>();
  for(const message of this.messages){
   if(!message.id||message.deletedAt)continue;
   for(const file of this.messageAttachments(message)){
    const key=this.mediaKey(message.id,file.index);
    keep.add(key);
    if(!this.isImage(file.mimeType)||this.mediaUrls.has(key)||this.mediaFailures.has(key)||this.mediaRequests.has(key))continue;
    const peer=this.peer,epoch=this.mediaEpoch;
    const request=this.chat.downloadAttachmentAt(peer,message.id,file.index).subscribe({
     next:blob=>{
      if(epoch!==this.mediaEpoch||this.peer!==peer)return;
      if(!blob.type.startsWith('image/')){this.mediaFailures.add(key);return;}
      const url=URL.createObjectURL(blob);
      if(epoch!==this.mediaEpoch||this.peer!==peer){URL.revokeObjectURL(url);return;}
      this.mediaUrls.set(key,url);
     },
     error:()=>{if(epoch===this.mediaEpoch&&peer===this.peer)this.mediaFailures.add(key);}
    });
    this.mediaRequests.set(key,request);
    request.add(()=>this.mediaRequests.delete(key));
   }
  }
  for(const [key,url] of this.mediaUrls){
   if(!keep.has(key)){URL.revokeObjectURL(url);this.mediaUrls.delete(key);}
  }
  for(const [key,request] of this.mediaRequests){
   if(!keep.has(key)){request.unsubscribe();this.mediaRequests.delete(key);}
  }
  for(const key of this.mediaFailures){if(!keep.has(key))this.mediaFailures.delete(key);}
 }
 openAttachment(messageId:number,index:number,filename:string):void {
  if(!this.peer||this.accessRevoked)return;
  const peer=this.peer,epoch=this.mediaEpoch;
  this.chat.downloadAttachmentAt(peer,messageId,index).subscribe({
   next:blob=>{
    if(epoch!==this.mediaEpoch||peer!==this.peer)return;
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download=filename||'anexo';anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
   },
   error:()=>{if(epoch===this.mediaEpoch)this.error=appTranslate('Não foi possível obter o anexo.');}
  });
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
 /** Enter sends (as in the full chat); Shift+Enter keeps a new line. Never while composing (IME). */
 onComposerKey(event:KeyboardEvent):void{
  if(event.key!=='Enter'||event.shiftKey||event.isComposing)return;
  event.preventDefault();
  this.sendMessage();
 }
 sendMessage():void{
  const peer=this.peer,body=this.draft.trim(),version=this.generation;
  if(!peer||this.accessRevoked||this.writeBusy||!body||body.length>2000)return;
  this.writeBusy=true;this.sending=true;this.error='';
  this.pendingText=body;this.draft='';
  const startedAt=performance.now();let outcome:'ok'|'error'|'timeout'='ok';
  // A send that never answers must not leave the composer locked on «…».
  this.chat.send(peer,body).pipe(timeout(15_000)).subscribe({
   next:message=>{
    if(version!==this.generation||peer!==this.peer||this.accessRevoked)return;
    const accepted=typeof message.id==='number'&&Number.isSafeInteger(message.id)&&message.id>0&&
     !message.deletedAt&&message.username2?.toLowerCase()===peer.toLowerCase()&&
     message.text?.trim()===body;
    if(!accepted){
     this.error=appTranslate('O servidor não confirmou a mensagem. Consulta o histórico antes de repetir.');
     if(!this.draft.trim())this.draft=body;
     return;
    }
    this.locallyConfirmed.set(message.id!,{message,at:Date.now()});
    this.messages=this.messages.some(item=>item.id===message.id)?this.messages:
     [...this.messages,message].sort((a,b)=>(a.id||0)-(b.id||0)).slice(-60);
    this.syncAttachments();
    if(this.draft.trim()===body)this.draft='';
    this.refresh(true);
   },
   error:(e:unknown)=>{
    outcome=(e as {name?:string})?.name==='TimeoutError'?'timeout':'error';
    if(version===this.generation&&peer===this.peer){
     this.error=appTranslate('Não foi possível confirmar o envio. Consulta o histórico antes de repetir.');
     if(!this.draft.trim())this.draft=body;
    }
   }
  }).add(()=>{
   reportSlowSend('call',startedAt,outcome,'/api/chat/me/');
   if(version===this.generation&&peer===this.peer){this.writeBusy=false;this.sending=false;this.pendingText=null;}
  });
 }
}
