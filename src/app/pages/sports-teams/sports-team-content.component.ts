import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, interval, fromEvent, merge } from 'rxjs';
import { SportsTeamsService, TeamContentEntry, TeamContentKind, TeamReactionState } from '../../services/sports-teams.service';
import { DirectChatRealtimeService } from '../../services/direct-chat-realtime.service';

@Component({
  selector: 'app-sports-team-content',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="team-content">
      <ng-container *ngIf="!accessRevoked; else accessRevokedState">
      <p class="team-content-note">Exclusivo do responsável e dos membros confirmados.</p>
      <p role="alert" class="team-content-error" *ngIf="error">{{error}}</p>
      <p role="status" class="team-content-note" *ngIf="syncError">{{syncError}}</p>
      <form (ngSubmit)="search()" class="team-content-search">
        <label [for]="'team-search-' + kind + '-' + teamId">Pesquisar nesta {{kind === 'chat' ? 'conversa' : 'equipa'}}</label>
        <div class="team-content-search-controls">
          <input [id]="'team-search-' + kind + '-' + teamId" name="search" [(ngModel)]="searchTerm"
            placeholder="Escreve pelo menos 2 caracteres" maxlength="80"
            [disabled]="searching" />
          <button type="submit" [disabled]="searching || searchTerm.trim().length < 2">Pesquisar</button>
          <button type="button" *ngIf="searchActive" (click)="clearSearch()">Voltar ao chat</button>
        </div>
      </form>
      <p class="team-content-note" *ngIf="searchActive">{{searching ? 'A pesquisar…' : ('Resultados encontrados: ' + searchResults.length)}}</p>
      <p *ngIf="loading" class="team-content-note">A carregar…</p>
      <p *ngIf="!loading && !searchActive && !items.length && !error" class="team-content-note">
        {{kind === 'chat' ? 'Ainda não existem mensagens nesta equipa.' : 'Ainda não há publicações.'}}
      </p>
      <div class="team-content-history" aria-live="polite">
        <article *ngFor="let item of (searchActive ? searchResults : items); trackBy: trackMessage" class="team-content-entry">
          <strong>@{{item.username}}</strong>
          <time>{{item.createdAt | date:'dd/MM/yyyy HH:mm'}}</time>
          <p *ngIf="item.replyToId" class="team-content-reply">↳ {{replyPreview(item.replyToId)}}</p>
          <p>{{item.deleted ? 'Mensagem eliminada' : item.body}}</p>
          <div class="team-private-files" *ngIf="!item.deleted && item.attachments?.length">
            <div *ngFor="let file of item.attachments" class="team-file-card">
              <p>📎 {{file.filename}} ({{(file.size/1024/1024) | number:'1.1-1'}} MB)</p>
              <button type="button" *ngIf="canPreview(file.mimeType)"
                [disabled]="downloading" (click)="preview(item,file)">Ver anexo</button>
              <button type="button" [disabled]="downloading"
                (click)="download(item,file.index,file.filename)">Descarregar</button>
              <img *ngIf="previews[previewKey(item.id,file.index)]?.type === 'image'"
                [src]="previews[previewKey(item.id,file.index)]?.url || ''"
                [alt]="'Anexo de ' + item.username" loading="lazy" />
              <video *ngIf="previews[previewKey(item.id,file.index)]?.type === 'video'"
                [src]="previews[previewKey(item.id,file.index)]?.url || ''" controls preload="none"></video>
            </div>
          </div>
          <small *ngIf="item.editedAt && !item.deleted">Editada</small>
          <div class="team-reactions" *ngIf="!item.deleted" aria-label="Reações à mensagem">
            <button type="button" *ngFor="let emoji of emojis" [disabled]="reactionBusyId !== null"
              [class.selected]="reactionsById[item.id]?.mine === emoji"
              [attr.aria-pressed]="reactionsById[item.id]?.mine === emoji"
              (click)="react(item, emoji)">{{emoji}}
              <small *ngIf="(reactionsById[item.id]?.counts?.[emoji] || 0) > 0">{{reactionsById[item.id]?.counts?.[emoji] || 0}}</small>
            </button>
          </div>
          <div class="team-content-actions" *ngIf="!item.deleted">
            <button type="button" (click)="reply(item)" [disabled]="sending">Responder</button>
            <button type="button" *ngIf="item.canEdit" [disabled]="sending" (click)="beginEdit(item)">Editar</button>
            <button type="button" *ngIf="item.canManage" [disabled]="sending" (click)="remove(item)">Eliminar</button>
          </div>
          <form *ngIf="editingId === item.id" (ngSubmit)="saveEdit(item)">
            <textarea name="editBody" [(ngModel)]="editingDraft" maxlength="2000" [disabled]="sending"></textarea>
            <button type="submit" [disabled]="sending || !editingDraft.trim()">Guardar</button>
            <button type="button" (click)="editingId = null">Cancelar</button>
          </form>
        </article>
      </div>
      <div *ngIf="replyTargetId" class="team-content-note">
        A responder a {{replyPreview(replyTargetId)}}
        <button type="button" (click)="replyTargetId = null">Cancelar resposta</button>
      </div>
      <form (ngSubmit)="send()" class="team-content-editor">
        <label [for]="'team-content-' + kind + '-' + teamId">
          {{kind === 'chat' ? 'Mensagem' : 'Nova publicação'}}
        </label>
        <textarea [id]="'team-content-' + kind + '-' + teamId" name="body"
          [(ngModel)]="draft" maxlength="2000" [disabled]="sending"
          [placeholder]="kind === 'chat' ? 'Escreve uma mensagem…' : 'Partilha novidades com o plantel…'"></textarea>
        <div *ngIf="attachmentsEnabled" class="team-upload-selector">
          <label [for]="'team-upload-' + kind + '-' + teamId">📎 Anexar fotografias, vídeos ou PDF (até 4)</label>
          <input [id]="'team-upload-' + kind + '-' + teamId" type="file"
            multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,application/pdf"
            (change)="chooseFiles($event)" [disabled]="sending" />
          <p class="team-content-note" *ngIf="files.length">{{files.length}} ficheiro(s): {{filesLabel()}}</p>
          <button type="button" *ngIf="files.length" [disabled]="sending" (click)="clearFiles()">Retirar anexos</button>
        </div>
        <button type="submit" [disabled]="sending || (!draft.trim() && !files.length)">
          {{sending ? 'A enviar…' : kind === 'chat' ? 'Enviar' : 'Publicar'}}
        </button>
      </form>
      </ng-container>
      <ng-template #accessRevokedState><p role="alert" class="team-content-error">Já não tens acesso a esta conversa.</p></ng-template>
    </div>`,
  styles: [`
    .team-content {display:grid;gap:.75rem;min-width:0}
    .team-content-note {color:#b9d0d9;font-size:.85rem;margin:0}
    .team-content-error {color:#ff9eaf}
    .team-content-history {display:grid;gap:.6rem;max-height:430px;overflow:auto}
    .team-content-entry {background:#102f3b;border:1px solid #285c6b;border-radius:12px;padding:.8rem;overflow-wrap:anywhere}
    .team-content-entry strong {color:#79efda}
    .team-content-entry time {margin-left:.8rem;color:#9ebcc6;font-size:.75rem}
    .team-content-entry p {white-space:pre-wrap;margin:.5rem 0 0}
    .team-content-editor {display:grid;gap:.5rem}
    .team-content-editor textarea {width:100%;min-height:84px;padding:.8rem;box-sizing:border-box;border-radius:10px;border:1px solid #367f8a;background:#0d3441;color:white}
    .team-content-editor button {justify-self:start;background:#24ceb8;color:#052c31;padding:.65rem 1.1rem;border:0;border-radius:9px;font-weight:800;cursor:pointer}
    .team-content-editor button:disabled {opacity:.5;cursor:not-allowed}
    .team-content-actions {display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.55rem}
    .team-content-actions button, .team-content-note button {background:#123e4b;border:1px solid #30788b;border-radius:8px;color:#b3fff0;padding:.3rem .6rem;cursor:pointer}
    .team-content-reply {font-size:.8rem;color:#a8d6db}
    .team-reactions {display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.65rem}
    .team-reactions button {border:1px solid #296777;background:#0c3242;border-radius:50px;padding:.3rem .55rem;cursor:pointer}
    .team-reactions button.selected {border-color:#48ecd1;background:#17565a}
    .team-reactions button:disabled {opacity:.55;cursor:not-allowed}
    .team-reactions small {color:#cffff5;margin-left:.2rem}
    .team-content-search {display:grid;gap:.4rem}
    .team-content-search label {font-size:.82rem;color:#b9d0d9}
    .team-content-search-controls {display:flex;flex-wrap:wrap;gap:.5rem}
    .team-content-search input {flex:1 1 190px;min-width:0;padding:.65rem;border:1px solid #367f8a;border-radius:9px;color:#fff;background:#0d3441}
    .team-content-search button {padding:.55rem .7rem;border:1px solid #398b8a;border-radius:9px;color:#cefff4;background:#113b4b;cursor:pointer}
    .team-content-search button:disabled {opacity:.5;cursor:not-allowed}
    .team-content-entry form {display:grid;gap:.4rem;margin-top:.6rem}
    .team-content-entry textarea {min-height:65px;background:#072b38;color:white;border:1px solid #448b90;border-radius:8px;padding:.6rem}
    .team-private-files {display:flex;flex-wrap:wrap;gap:.5rem;margin:.6rem 0}
    .team-file-card {display:grid;gap:.5rem;max-width:100%;padding:.65rem;border-radius:11px;border:1px solid #34777e;background:#10404d}
    .team-file-card p {margin:0;font-size:.8rem;overflow-wrap:anywhere}
    .team-file-card button {padding:.5rem .7rem;border-radius:10px;border:1px solid #34777e;background:#144552;color:#c9fff3;cursor:pointer}
    .team-file-card img,.team-file-card video {max-width:min(100%,550px);max-height:360px;border-radius:10px}
    .team-upload-selector {display:grid;gap:.3rem}
    .team-upload-selector input {color:#d5faf4;max-width:100%}
    .team-upload-selector p {overflow-wrap:anywhere}
  `]
})
export class SportsTeamContentComponent implements OnInit, OnChanges, OnDestroy {
  @Input({required:true}) teamId = 0;
  @Input({required:true}) kind: TeamContentKind = 'chat';
  replyTargetId: number | null = null;
  editingId: number | null = null;
  editingDraft = '';
  searchTerm = '';
  searchResults: TeamContentEntry[] = [];
  searchActive = false;
  searching = false;
  private searchVersion = 0;
  readonly emojis = ['👍','❤️','😂','🔥','👏'];
  reactionsById: Record<number,TeamReactionState> = {};
  reactionBusyId: number | null = null;
  private reactionVersion = 0;
  attachmentsEnabled = false;
  files: File[] = [];
  downloading = false;
  previews: Record<string,{url:string;type:'image'|'video'}> = {};
  private readonly previewOrder:string[] = [];
  private attachmentProbeVersion = 0;
  items: TeamContentEntry[] = [];
  draft = '';
  error = '';
  syncError = '';
  accessRevoked = false;
  sending = false;
  loading = true;
  private readonly subscriptions = new Subscription();
  private generation = 0;
  private readingGeneration: number | null = null;
  private readRequestId = 0;
  private writeVersion = 0;
  private readQueued = false;
  private invalidatePendingRead(): void {
    this.writeVersion++;
    this.readRequestId++;
    this.readingGeneration = null;
    this.readQueued = false;
  }

  constructor(private readonly api: SportsTeamsService,
    private readonly realtime: DirectChatRealtimeService) {}

  ngOnInit(): void {
    this.read(false);
    this.checkAttachmentsAvailable();
    this.realtime.connect();
    this.subscriptions.add(this.realtime.teamContentInvalidated$.subscribe(event => {
      if (event.teamId === this.teamId && event.kind === this.kind
          && document.visibilityState === 'visible') this.read(true);
    }));
    this.subscriptions.add(this.realtime.connected$.subscribe(connected => {
      if (connected && document.visibilityState === 'visible') this.read(true);
    }));
    this.subscriptions.add(interval(10000).subscribe(() => {
      if (document.visibilityState === 'visible') this.read(true);
    }));
    this.subscriptions.add(merge(fromEvent(window, 'focus'),
      fromEvent(document, 'visibilitychange')).subscribe(() => {
      if (document.visibilityState === 'visible') this.read(true);
    }));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['teamId'] || changes['kind']) {
      this.generation++;
      this.invalidatePendingRead();
      this.accessRevoked = false;
      this.items = [];this.error = '';this.syncError = '';this.draft = '';
      this.replyTargetId = null;this.editingId = null;
      this.clearSearch();this.searchTerm = '';
      this.reactionVersion++;this.reactionsById={};
      this.clearFiles();this.clearPreviews();this.attachmentsEnabled=false;
      this.checkAttachmentsAvailable();
      if (!changes['teamId']?.firstChange && !changes['kind']?.firstChange) this.read(false);
    }
  }

  trackMessage(_:number, entry:TeamContentEntry):number { return entry.id; }
  replyPreview(id:number|null):string {
    const original=(this.searchActive?this.searchResults:[]).find(item=>item.id===id)
      || this.items.find(item=>item.id===id);
    if(!original)return 'uma mensagem anterior';
    if(original.deleted)return 'uma mensagem eliminada';
    return '@'+original.username+': '+original.body.slice(0,110);
  }


  read(silent:boolean):void {
    if (this.readingGeneration === this.generation) { this.readQueued = true; return; }
    if (this.sending || this.accessRevoked || !Number.isSafeInteger(this.teamId) || this.teamId<=0) return;
    const version = this.generation;
    const requestId = ++this.readRequestId;
    const writeVersion = this.writeVersion;
    this.readingGeneration = version;
    if (!silent) {this.loading=true;this.error='';}
    this.api.content(this.teamId,this.kind).subscribe({
      next:items => {
        if(version!==this.generation || writeVersion!==this.writeVersion
            || requestId!==this.readRequestId)return;
        this.items=items;this.syncError='';this.loadReactions(items);
      },
      error:(failure:unknown) => {
        if(version!==this.generation || writeVersion!==this.writeVersion
            || requestId!==this.readRequestId)return;
        if(failure instanceof HttpErrorResponse && (failure.status===401 || failure.status===403)) {
          this.accessRevoked=true;this.items=[];this.draft='';this.replyTargetId=null;
          this.editingId=null;this.editingDraft='';this.clearSearch();
          this.reactionVersion++;this.reactionsById={};this.clearFiles();
          this.clearPreviews();this.attachmentsEnabled=false;this.syncError='';
          this.error='Já não tens acesso a esta conversa.';
          return;
        }
        if(silent)this.syncError='A sincronização falhou. O histórico pode estar desatualizado.';
        else this.error='Não foi possível abrir esta conversa. Confirma que és membro e que está ativada.';
      }
    }).add(() => {
      if(requestId!==this.readRequestId)return;
      this.readingGeneration=null;
      if(version===this.generation && !silent)this.loading=false;
      if(this.readQueued){this.readQueued=false;this.read(true);}
    });
  }

  send():void {
    const text=this.draft.trim();
    if(this.sending || !text || text.length>2000)return;
    const version=this.generation;
    this.invalidatePendingRead();
    this.sending=true;this.error='';
    const uploads=[...this.files];
    const operation=uploads.length
      ? this.api.uploadContentFiles(this.teamId,this.kind,uploads,text,this.replyTargetId)
      : this.api.sendContent(this.teamId,this.kind,text,this.replyTargetId);
    operation.subscribe({
      next:item => {
        if(version!==this.generation)return;
        if(!this.items.some(previous=>previous.id===item.id))
          this.items=[...this.items,item].sort((a,b)=>a.id-b.id);
        if(this.draft.trim()===text){this.draft='';this.replyTargetId=null;}
        if(uploads.length)this.clearFiles();
      },
      error:() => {
        if(version===this.generation)
          this.error='Envio não confirmado. Consulta o histórico antes de repetir.';
      }
    }).add(() => {this.sending=false;this.read(true);});
  }


  private checkAttachmentsAvailable():void {
    const current=++this.attachmentProbeVersion;
    const version=this.generation;
    if(!Number.isSafeInteger(this.teamId)||this.teamId<=0)return;
    this.api.attachmentsAvailable(this.teamId,this.kind).subscribe({
      next:result=>{
        if(current===this.attachmentProbeVersion&&version===this.generation)
          this.attachmentsEnabled=result.available===true;
      },
      error:()=>{if(current===this.attachmentProbeVersion)this.attachmentsEnabled=false;}
    });
  }
  chooseFiles(event:Event):void {
    const input=event.target as HTMLInputElement;
    const selected=Array.from(input.files||[]);
    input.value='';
    if(!selected.length)return;
    const allowed=new Set(['image/jpeg','image/png','image/webp','image/gif',
      'video/mp4','video/webm','application/pdf']);
    const combined=[...this.files,...selected];
    if(combined.length>4 || combined.some(file=>!allowed.has(file.type)||!file.size
      || file.size>(file.type.startsWith('video/')?20:5)*1024*1024)
      || combined.reduce((sum,file)=>sum+file.size,0)>40*1024*1024){
      this.error='Até 4 anexos e 40 MB no total: fotos/PDF até 5 MB e vídeos até 20 MB.';
      return;
    }
    this.files=combined;this.error='';
  }
  clearFiles():void {this.files=[];}
  filesLabel():string {return this.files.map(file=>file.name).join(', ');}
  previewKey(messageId:number,index:number):string{return messageId+':'+index;}
  canPreview(mime:string):boolean {
    return ['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'].includes(mime);
  }
  preview(entry:TeamContentEntry,file:{index:number;mimeType:string;filename:string}):void {
    if(this.downloading||entry.deleted||!this.canPreview(file.mimeType)
      ||file.index<0||file.index>=4)return;
    const key=this.previewKey(entry.id,file.index);
    if(this.previews[key]){
      URL.revokeObjectURL(this.previews[key].url);
      delete this.previews[key];
      return;
    }
    this.downloading=true;this.error='';
    const generation=this.generation;
    this.api.downloadContentFile(this.teamId,this.kind,entry.id,file.index).subscribe({
      next:blob=>{
        if(generation!==this.generation)return;
        if(blob.type!==file.mimeType){
          this.error='O tipo do ficheiro recebido não corresponde ao anexo.';
          return;
        }
        if(this.previewOrder.length>=8){
          const first=this.previewOrder.shift();
          if(first && this.previews[first]){
            URL.revokeObjectURL(this.previews[first].url);
            delete this.previews[first];
          }
        }
        const url=URL.createObjectURL(blob);
        this.previews[key]={url,type:file.mimeType.startsWith('image/')?'image':'video'};
        this.previewOrder.push(key);
      },
      error:()=>{if(generation===this.generation)
        this.error='Não foi possível abrir o anexo. Confirma a tua participação.';}
    }).add(()=>{this.downloading=false;});
  }
  private clearPreviews():void {
    for(const preview of Object.values(this.previews))URL.revokeObjectURL(preview.url);
    this.previews={};this.previewOrder.length=0;
  }
  download(entry:TeamContentEntry,index:number,filename:string):void {
    if(this.downloading||entry.deleted||!Number.isSafeInteger(index)||index<0||index>=4)return;
    this.downloading=true;this.error='';
    this.api.downloadContentFile(this.teamId,this.kind,entry.id,index).subscribe({
      next:blob=>{
        const url=URL.createObjectURL(blob);
        try {
          const link=document.createElement('a');
          link.href=url;
          link.download=filename.replace(/[\\/\x00-\x1f\x7f]/g,'_').slice(0,160)||'anexo';
          link.click();
        }finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
      },
      error:()=>{this.error='Não foi possível descarregar o ficheiro. Confirma a tua participação.';}
    }).add(()=>{this.downloading=false;});
  }

  private loadReactions(items:TeamContentEntry[]):void {
    const ids=items.filter(item=>!item.deleted).slice(-100).map(item=>item.id);
    if(!ids.length)return;
    const version=++this.reactionVersion;
    const generation=this.generation;
    this.api.reactions(this.teamId,this.kind,ids).subscribe({
      next:reactions=>{
        if(version===this.reactionVersion && generation===this.generation)
          this.reactionsById={...this.reactionsById,...reactions};
      }
    });
  }
  react(item:TeamContentEntry,emoji:string):void {
    if(item.deleted || this.reactionBusyId!==null || !this.emojis.includes(emoji))return;
    this.reactionBusyId=item.id;
    const same=this.reactionsById[item.id]?.mine===emoji;
    const request=same
      ? this.api.removeReaction(this.teamId,this.kind,item.id)
      : this.api.setReaction(this.teamId,this.kind,item.id,emoji);
    request.subscribe({
      error:()=>{this.error='Não foi possível confirmar a reação. Consulta o histórico antes de repetir.';}
    }).add(()=>{this.reactionBusyId=null;this.loadReactions([item]);});
  }

  search():void {
    const query=this.searchTerm.trim();
    if(query.length<2 || query.length>80 || this.searching)return;
    const version=++this.searchVersion;
    const generation=this.generation;
    this.searching=true;this.searchActive=true;this.error='';
    this.api.searchContent(this.teamId,this.kind,query).subscribe({
      next:results=>{
        if(version===this.searchVersion && generation===this.generation){this.searchResults=results;this.loadReactions(results);}
      },
      error:()=>{
        if(version===this.searchVersion && generation===this.generation)
          this.error='Não foi possível pesquisar as mensagens.';
      }
    }).add(()=>{if(version===this.searchVersion)this.searching=false;});
  }
  clearSearch():void {
    this.searchVersion++;this.searchActive=false;this.searching=false;this.searchResults=[];
  }

  reply(entry:TeamContentEntry):void {
    if(!entry.deleted)this.replyTargetId=entry.id;
  }
  beginEdit(entry:TeamContentEntry):void {
    if(entry.deleted || !entry.canEdit)return;
    this.editingId=entry.id;this.editingDraft=entry.body;this.error='';
  }
  saveEdit(entry:TeamContentEntry):void {
    const body=this.editingDraft.trim();
    if(this.sending || !entry.canEdit || !body)return;
    this.invalidatePendingRead();
    this.sending=true;this.error='';
    const version=this.generation;
    this.api.editContent(this.teamId,this.kind,entry.id,body).subscribe({
      next:updated=>{
        if(version!==this.generation)return;
        this.items=this.items.map(item=>item.id===updated.id?updated:item);
        this.editingId=null;
      },
      error:()=>{if(version===this.generation)this.error='Edição não confirmada. Consulta o histórico antes de repetir.';}
    }).add(()=>{this.sending=false;this.read(true);});
  }
  remove(entry:TeamContentEntry):void {
    if(this.sending || !entry.canManage || entry.deleted)return;
    if(!window.confirm('Eliminar esta mensagem da equipa?'))return;
    this.invalidatePendingRead();
    this.sending=true;this.error='';
    const version=this.generation;
    this.api.deleteContent(this.teamId,this.kind,entry.id).subscribe({
      next:()=>{
        if(version!==this.generation)return;
        this.items=this.items.map(item=>item.id===entry.id?{...item,body:'',deleted:true}:item);
      },
      error:()=>{if(version===this.generation)this.error='Eliminação não confirmada. Consulta o histórico antes de repetir.';}
    }).add(()=>{this.sending=false;this.read(true);});
  }

  ngOnDestroy():void {this.generation++;this.clearPreviews();this.subscriptions.unsubscribe();}
}
