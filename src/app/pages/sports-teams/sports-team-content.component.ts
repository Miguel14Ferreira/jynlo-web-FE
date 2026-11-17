import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription, interval, fromEvent, merge } from 'rxjs';
import { SportsTeamsService, TeamContentEntry, TeamContentKind, TeamReactionState } from '../../services/sports-teams.service';
import { DirectChatRealtimeService } from '../../services/direct-chat-realtime.service';

@Component({
  selector: 'app-sports-team-content',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="team-content" [class.team-chat-mode]="kind === 'chat'" [class.team-feed-mode]="kind === 'feed'">
      <ng-container *ngIf="!accessRevoked; else accessRevokedState">
      <div class="team-content-heading">
        <div class="team-content-heading-icon" aria-hidden="true">{{kind === 'chat' ? '💬' : '📰'}}</div>
        <div><h3>{{kind === 'chat' ? 'Conversa do plantel' : 'Publicações da equipa'}}</h3>
          <p class="team-content-note">Só os membros confirmados podem participar. Atualização automática.</p></div>
      </div>
      <ng-container *ngIf="showFeedComposerAtTop()" [ngTemplateOutlet]="teamComposer"></ng-container>
      <p role="alert" class="team-content-error" *ngIf="error">{{error}}</p>
      <p role="status" class="team-content-note" *ngIf="syncError">{{syncError}}</p>
      <form (ngSubmit)="search()" class="team-content-search">
        <label [for]="'team-search-' + kind + '-' + teamId">Pesquisar nesta {{kind === 'chat' ? 'conversa' : 'equipa'}}</label>
        <div class="team-content-search-controls">
          <input [id]="'team-search-' + kind + '-' + teamId" name="search" [(ngModel)]="searchTerm" (ngModelChange)="onSearchTermChanged()"
            placeholder="Escreve pelo menos 2 caracteres" maxlength="80"
            [disabled]="searching" />
          <button type="submit" [disabled]="searching || searchTerm.trim().length < 2">Pesquisar</button>
          <button type="button" *ngIf="searchActive" (click)="clearSearch()">Voltar {{kind === 'chat' ? 'ao chat' : 'às publicações'}}</button>
        </div>
      </form>
      <p class="team-content-note" *ngIf="searchActive">{{searching ? 'A pesquisar…' : ('Resultados encontrados: ' + searchResults.length)}}</p>
      <p *ngIf="loading" class="team-content-note">A carregar…</p>
      <p *ngIf="!loading && !searchActive && !items.length && !error" class="team-content-note">
        {{kind === 'chat' ? 'Ainda não existem mensagens nesta equipa.' : 'Ainda não há publicações.'}}
      </p>
      <div #historyPane class="team-content-history" aria-live="polite" (scroll)="onHistoryScroll()">
        <article *ngFor="let item of visibleEntries(); trackBy: trackMessage" class="team-content-entry" [class.team-feed-comment]="isFeedComment(item)">
          <div class="team-entry-header">
            <span class="team-entry-avatar" aria-hidden="true">{{(item.username || 'J').slice(0,1).toUpperCase()}}</span>
            <div class="team-entry-meta"><a class="team-author-link" [routerLink]="['/menu/perfis',item.username]" [attr.aria-label]="'Abrir perfil de @' + item.username">@{{item.username}}</a>
              <time>{{item.createdAt | date:'dd/MM/yyyy HH:mm'}}</time></div>
          </div>
          <p *ngIf="item.replyToId" class="team-content-reply">↳ {{replyPreview(item.replyToId)}}</p>
          <p>{{item.deleted ? (kind === 'chat' ? 'Mensagem eliminada' : 'Publicação eliminada') : item.body}}</p>
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
          <div class="team-reactions" *ngIf="!item.deleted" [attr.aria-label]="kind === 'chat' ? 'Reações à mensagem' : 'Reações à publicação'">
            <button type="button" *ngFor="let emoji of emojis" [disabled]="reactionBusyId !== null"
              [class.selected]="reactionsById[item.id]?.mine === emoji"
              [attr.aria-pressed]="reactionsById[item.id]?.mine === emoji"
              (click)="react(item, emoji)">{{emoji}}
              <small *ngIf="(reactionsById[item.id]?.counts?.[emoji] || 0) > 0">{{reactionsById[item.id]?.counts?.[emoji] || 0}}</small>
            </button>
          </div>
          <div class="team-content-actions" *ngIf="!item.deleted">
            <button type="button" (click)="reply(item)" [disabled]="sending" [attr.aria-label]="kind === 'chat' ? 'Responder à mensagem' : 'Comentar publicação'" [title]="kind === 'chat' ? 'Responder' : 'Comentar'">↩ <span>{{kind === 'chat' ? 'Responder' : 'Comentar'}}</span></button>
            <button type="button" *ngIf="item.canEdit" [disabled]="sending" (click)="beginEdit(item)" [attr.aria-label]="kind === 'chat' ? 'Editar mensagem' : 'Editar publicação'" title="Editar">✎ <span>Editar</span></button>
            <button type="button" *ngIf="item.canManage" [disabled]="sending" (click)="remove(item)" [attr.aria-label]="kind === 'chat' ? 'Eliminar mensagem' : 'Eliminar publicação'" title="Eliminar">× <span>Eliminar</span></button>
          </div>
          <div *ngIf="kind === 'feed' && replyTargetId === item.id" class="team-inline-comment-editor">
            <p class="team-content-note">A comentar publicação de @{{item.username}}</p>
            <ng-container [ngTemplateOutlet]="teamComposer"></ng-container>
          </div>
          <form *ngIf="editingId === item.id" (ngSubmit)="saveEdit(item)">
            <textarea name="editBody" [(ngModel)]="editingDraft" maxlength="2000" [disabled]="sending"></textarea>
            <button type="submit" [disabled]="sending || !editingDraft.trim()">Guardar</button>
            <button type="button" (click)="editingId = null">Cancelar</button>
          </form>
        </article>
      </div>
      <button *ngIf="kind === 'chat' && unseenBelow && !searchActive" type="button" class="team-new-messages" (click)="showLatest()" aria-label="Ver mensagens novas">↓ Mensagens novas</button>
      <ng-container *ngIf="kind === 'chat'" [ngTemplateOutlet]="teamComposer"></ng-container>
      </ng-container>
      <ng-template #teamComposer>
      <div *ngIf="replyTargetId" class="team-content-note">
        {{kind === 'chat' ? 'A responder a' : 'A comentar'}} {{replyPreview(replyTargetId)}}
        <button type="button" (click)="cancelReply()">Cancelar resposta</button>
      </div>
      <form (ngSubmit)="send()" class="team-content-editor">
        <label [for]="'team-content-' + kind + '-' + teamId">
          {{kind === 'chat' ? 'Mensagem' : replyTargetId ? 'Comentário' : 'Nova publicação'}}
        </label>
        <textarea [id]="'team-content-' + kind + '-' + teamId" name="body"
          [(ngModel)]="draft" maxlength="2000" [disabled]="sending" (keydown)="onComposerKeydown($event)"
          (paste)="onComposerPaste($event)"
          [placeholder]="kind === 'chat' ? 'Escreve uma mensagem…' : 'Partilha novidades com o plantel…'"></textarea>
        <div *ngIf="attachmentsEnabled" class="team-upload-selector">
          <label [for]="'team-upload-' + kind + '-' + teamId">📎 Anexar fotografias, vídeos ou PDF (até 4)</label>
          <input [id]="'team-upload-' + kind + '-' + teamId" type="file"
            multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,application/pdf"
            (change)="chooseFiles($event)" [disabled]="sending" />
          <p class="team-content-note" *ngIf="files.length">{{files.length}} ficheiro(s): {{filesLabel()}}</p>
          <button type="button" *ngIf="files.length" [disabled]="sending" (click)="clearFiles()">Retirar anexos</button>
        </div>
        <div class="team-composer-footer">
          <small *ngIf="kind === 'chat'">Enter para enviar · Shift + Enter para nova linha · Podes colar imagens</small>
          <small *ngIf="kind === 'feed'">Partilha notícias, fotografias ou momentos da equipa.</small>
          <button type="submit" [disabled]="sending || (!draft.trim() && !files.length)">
            {{sending ? 'A enviar…' : kind === 'chat' ? 'Enviar mensagem' : replyTargetId ? 'Comentar' : 'Publicar'}}
          </button>
        </div>
      </form>
      </ng-template>
      <ng-template #accessRevokedState><p role="alert" class="team-content-error">{{blockedReason}}</p></ng-template>
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
    /* Shared Jynlo message hierarchy: identifiable authors, readable media
       and a dedicated composer, not two cramped half-width columns. */
    .team-content {gap:1.1rem}
    .team-content-heading{display:flex;align-items:center;gap:.85rem;padding:.2rem 0 .8rem;border-bottom:1px solid #42798855}
    .team-content-heading-icon{display:grid;place-items:center;width:43px;height:43px;
      flex:none;background:#125362;border:1px solid #31888388;border-radius:13px;font-size:1.25rem}
    .team-content-heading h3{font-size:1.08rem;margin:0 0 .3rem;color:#e7fcf7}
    .team-content-history{max-height:min(62vh,650px);min-height:160px;gap:.8rem;padding:.15rem .2rem .6rem;
      overscroll-behavior:contain;scrollbar-gutter:stable}
    .team-content-entry{background:linear-gradient(140deg,#103e4b,#0b2c3a);
      border-color:#3a82905e;padding:1rem 1.1rem;border-radius:16px;min-width:0}
    .team-entry-header{display:flex;align-items:center;gap:.75rem;min-width:0}
    .team-entry-avatar{display:grid;place-items:center;width:39px;height:39px;
      flex:none;border-radius:50%;background:linear-gradient(135deg,#23bcae,#14758b);
      font-weight:850;color:#032731}
    .team-entry-meta{min-width:0;display:grid;gap:.15rem}
    .team-entry-meta strong{overflow-wrap:anywhere}
    .team-author-link{color:#79efda;font-weight:800;text-decoration:none;overflow-wrap:anywhere}
    .team-author-link:hover,.team-author-link:focus-visible{text-decoration:underline}
    .team-entry-meta time{margin:0;font-size:.75rem;color:#a1c0c8}
    .team-content-entry>p{line-height:1.6;color:#e4f6f8}
    .team-content-actions button{min-height:34px;display:inline-flex;align-items:center;gap:.3rem}
    .team-content-editor{background:#0c3543;border:1px solid #39898977;border-radius:15px;
      padding:1rem;gap:.85rem}
    .team-content-editor textarea{min-height:68px;max-height:230px;resize:vertical}
    .team-composer-footer{display:flex;align-items:center;justify-content:space-between;
      flex-wrap:wrap;gap:.7rem}
    .team-composer-footer small{font-size:.73rem;color:#9cbdc5}
    .team-composer-footer button{justify-self:auto;min-height:43px}
    .team-new-messages{justify-self:center;padding:.65rem 1rem;background:#125362;color:#bffff1;border:1px solid #30b9a7;border-radius:30px;cursor:pointer;font-weight:800}
    .team-new-messages:focus-visible{outline:2px solid #78f9dc;outline-offset:3px}
    .team-chat-mode .team-content-entry{max-width:min(100%,760px)}
    .team-feed-mode .team-content-entry{max-width:100%}
    .team-inline-comment-editor{margin-top:.75rem;padding:.8rem;border:1px solid #35bba4;border-radius:12px;background:#103c45;display:grid;gap:.55rem}
    .team-inline-comment-editor .team-content-editor{padding:.7rem}
    .team-feed-mode .team-feed-comment{margin-left:clamp(12px,4vw,48px);border-left:3px solid #36bca8;background:#0b303c}
    .team-feed-mode .team-feed-comment .team-entry-avatar{width:30px;height:30px;font-size:.8rem}
    .team-feed-mode .team-content-history{max-height:none;min-height:0}
    /* The feed composes above its cards; chat keeps the composer below history. */
    .team-feed-mode .team-content-editor{order:2}
    .team-feed-mode .team-content-search{order:3}
    .team-feed-mode .team-content-history{order:5}
    .team-feed-mode .team-content-heading{order:0}
    .team-feed-mode>p{order:4}
    .team-file-card{min-width:0;flex:1 1 200px}
    .team-file-card img,.team-file-card video{display:block;width:auto;height:auto;object-fit:contain}
    .team-content-search-controls button:focus-visible,.team-composer-footer button:focus-visible,
    .team-content-actions button:focus-visible{outline:2px solid #78f9dc;outline-offset:2px}
    @media(max-width:620px){
      .team-content-entry{padding:.85rem}
      .team-content-search-controls{flex-direction:column}
      .team-content-search-controls input,.team-content-search-controls button{width:100%;flex:auto}
      .team-content-editor{padding:.8rem}
      .team-composer-footer button{width:100%}
    }
  `]
})
export class SportsTeamContentComponent implements OnInit, OnChanges, OnDestroy {
  @Input({required:true}) teamId = 0;
  @ViewChild('historyPane') historyPane?:ElementRef<HTMLDivElement>;
  unseenBelow=false;
  private nearLatest=true;
  onHistoryScroll():void {
    if(this.kind!=='chat'||this.searchActive)return;
    const el=this.historyPane?.nativeElement;
    if(!el)return;
    this.nearLatest=el.scrollTop+el.clientHeight>=el.scrollHeight-85;
    if(this.nearLatest)this.unseenBelow=false;
  }
  private scrollIfReadingLatest():void {
    if(this.kind!=='chat'||!this.nearLatest||this.searchActive)return;
    const version=this.generation;
    setTimeout(()=>{
      if(version!==this.generation||!this.nearLatest||this.searchActive)return;
      const el=this.historyPane?.nativeElement;
      if(el)el.scrollTop=el.scrollHeight;
    },0);
  }
  showLatest():void {
    this.nearLatest=true;this.unseenBelow=false;
    const el=this.historyPane?.nativeElement;
    if(el)el.scrollTop=el.scrollHeight;
    this.scrollIfReadingLatest();
  }
  @Input({required:true}) kind: TeamContentKind = 'chat';
  replyTargetId: number | null = null;
  private feedRootDraft='';
  private feedRootFiles:File[]=[];
  private feedCommentDrafts=new Map<number,{draft:string;files:File[]}>();
  editingId: number | null = null;
  editingDraft = '';
  searchTerm = '';
  searchResults: TeamContentEntry[] = [];
  searchActive = false;
  searching = false;
  private searchVersion = 0;
  private searchRecheckBusy = false;
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
  blockedReason = 'Já não tens acesso a esta conversa.';
  sending = false;
  loading = true;
  private readonly subscriptions = new Subscription();
  private generation = 0;
  private readingGeneration: number | null = null;
  private readRequestId = 0;
  private writeVersion = 0;
  private readQueued = false;
  private blockUnavailable(failure:unknown):boolean {
    if(!(failure instanceof HttpErrorResponse)||![401,403,409].includes(failure.status))return false;
    this.accessRevoked=true;
    this.invalidatePendingRead();
    this.blockedReason=failure.status===409
      ? 'O chat ou feed da equipa foi desativado pelo responsável.'
      : 'Já não tens acesso a esta conversa.';
    this.items=[];this.draft='';this.replyTargetId=null;
    this.feedRootDraft='';this.feedRootFiles=[];this.feedCommentDrafts.clear();
    this.nearLatest=true;this.unseenBelow=false;
    this.editingId=null;this.editingDraft='';this.searchRecheckBusy=false;this.clearSearch();
    this.reactionVersion++;this.reactionsById={};this.clearFiles();
    this.clearPreviews();this.attachmentsEnabled=false;this.syncError='';
    this.error=this.blockedReason;
    return true;
  }
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
          && document.visibilityState === 'visible') this.read(true,true);
    }));
    this.subscriptions.add(this.realtime.connected$.subscribe(connected => {
      if (connected && document.visibilityState === 'visible') this.read(true,true);
    }));
    this.subscriptions.add(interval(10000).subscribe(() => {
      if (document.visibilityState === 'visible') this.read(true,true);
    }));
    this.subscriptions.add(merge(fromEvent(window, 'focus'),
      fromEvent(document, 'visibilitychange')).subscribe(() => {
      if (document.visibilityState === 'visible') this.read(true,true);
    }));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['teamId'] || changes['kind']) {
      this.generation++;
      this.invalidatePendingRead();
      this.accessRevoked = false;this.blockedReason='Já não tens acesso a esta conversa.';
      // Old requests may still complete, but their UI locks belong to the old conversation.
      this.sending=false;this.downloading=false;this.reactionBusyId=null;this.loading=true;
      this.items = [];this.error = '';this.syncError = '';this.draft = '';
      this.nearLatest=true;this.unseenBelow=false;
      this.replyTargetId = null;this.editingId = null;this.editingDraft='';
      this.feedRootDraft='';this.feedRootFiles=[];this.feedCommentDrafts.clear();
      this.searchRecheckBusy=false;this.clearSearch();this.searchTerm = '';
      this.reactionVersion++;this.reactionsById={};
      this.clearFiles();this.clearPreviews();this.attachmentsEnabled=false;
      this.checkAttachmentsAvailable();
      if (!changes['teamId']?.firstChange && !changes['kind']?.firstChange) this.read(false);
    }
  }

  trackMessage(_:number, entry:TeamContentEntry):number { return entry.id; }
  showFeedComposerAtTop():boolean {
    return this.kind==='feed' && (this.replyTargetId===null
      || !this.visibleEntries().some(item=>item.id===this.replyTargetId));
  }
  visibleEntries():TeamContentEntry[] {
    const entries=this.searchActive?this.searchResults:this.items;
    if(this.kind!=='feed')return entries;
    // Group replies beneath the original publication rather than treating
    // every comment as an unrelated post. Missing parents remain visible.
    const byId=new Map(entries.map(item=>[item.id,item]));
    const rootOf=(item:TeamContentEntry):number=>{
      let current=item;
      const seen=new Set<number>([item.id]);
      while(current.replyToId!=null && byId.has(current.replyToId)
            && !seen.has(current.replyToId)){
        current=byId.get(current.replyToId)!;
        seen.add(current.id);
      }
      return current.id;
    };
    const groups=new Map<number,TeamContentEntry[]>();
    for(const item of entries){
      const root=rootOf(item),group=groups.get(root)||[];
      group.push(item);groups.set(root,group);
    }
    return [...groups.entries()].sort((a,b)=>b[0]-a[0])
      .flatMap(([root,items])=>items.slice().sort((a,b)=>
        a.id===root?-1:b.id===root?1:a.id-b.id));
  }
  isFeedComment(item:TeamContentEntry):boolean {
    return this.kind==='feed' && item.replyToId!=null
      && (this.searchActive?this.searchResults:this.items).some(parent=>parent.id===item.replyToId);
  }
  replyPreview(id:number|null):string {
    const original=(this.searchActive?this.searchResults:[]).find(item=>item.id===id)
      || this.items.find(item=>item.id===id);
    if(!original)return 'uma mensagem anterior';
    if(original.deleted)return 'uma mensagem eliminada';
    return '@'+original.username+': '+original.body.slice(0,110);
  }


  read(silent:boolean, revalidateBlocked=false):void {
    if (this.readingGeneration === this.generation) { this.readQueued = true; return; }
    // Reopening a disabled chat requires a successful authenticated HTTP read.
    // Only background reconciliation may probe a blocked conversation.
    if (this.sending || (this.accessRevoked && !revalidateBlocked)
        || !Number.isSafeInteger(this.teamId) || this.teamId<=0) return;
    const version = this.generation;
    const requestId = ++this.readRequestId;
    const writeVersion = this.writeVersion;
    this.readingGeneration = version;
    if (!silent) {this.loading=true;this.error='';}
    this.api.content(this.teamId,this.kind).subscribe({
      next:items => {
        if(version!==this.generation || writeVersion!==this.writeVersion
            || requestId!==this.readRequestId)return;
        const wasBlocked=this.accessRevoked;
        this.accessRevoked=false;
        this.blockedReason='Já não tens acesso a esta conversa.';
        this.error='';
        const oldLatest=this.items.reduce((id,item)=>Math.max(id,item.id),0);
        const newLatest=items.reduce((id,item)=>Math.max(id,item.id),0);
        if(this.kind==='chat'&&!this.nearLatest&&oldLatest>0&&newLatest>oldLatest)
          this.unseenBelow=true;
        this.items=items;
        this.scrollIfReadingLatest();
        // Keep visible search hits consistent with live edits/deletions, without
        // unexpectedly discarding the user's search or scroll position.
        if(this.searchActive && this.searchResults.length){
          const latest=new Map(items.map(item=>[item.id,item]));
          this.searchResults=this.searchResults.map(item=>latest.get(item.id) || item);
        }
        // Remove already-displayed private blobs as soon as authenticated
        // reconciliation reports deletion or an attachment removal.
        for(const key of Object.keys(this.previews)){
          const [idText,indexText]=key.split(':');
          const messageId=Number(idText),index=Number(indexText);
          if(this.currentAttachment(messageId,index))continue;
          URL.revokeObjectURL(this.previews[key].url);
          delete this.previews[key];
          const position=this.previewOrder.indexOf(key);
          if(position!==-1)this.previewOrder.splice(position,1);
        }
        this.syncError='';this.loadReactions(items);
        this.revalidateVisibleSearch();
        if(wasBlocked)this.checkAttachmentsAvailable();
      },
      error:(failure:unknown) => {
        if(version!==this.generation || writeVersion!==this.writeVersion
            || requestId!==this.readRequestId)return;
        if(this.blockUnavailable(failure))return;
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

  onComposerKeydown(event:KeyboardEvent):void {
    if(this.kind!=='chat'||event.key!=='Enter'||event.shiftKey||event.altKey||
       event.ctrlKey||event.metaKey||event.isComposing)return;
    event.preventDefault();
    this.send();
  }

  send():void {
    const text=this.draft.trim();
    // An attachment can be sent without a caption, matching Mobile and backend.
    if(this.sending || (!text && !this.files.length) || text.length>2000)return;
    const version=this.generation;
    this.invalidatePendingRead();
    this.sending=true;this.error='';
    const uploads=[...this.files];
    const submittedReply=this.replyTargetId;
    const operation=uploads.length
      ? this.api.uploadContentFiles(this.teamId,this.kind,uploads,text,submittedReply)
      : this.api.sendContent(this.teamId,this.kind,text,submittedReply);
    operation.subscribe({
      next:item => {
        if(version!==this.generation||this.accessRevoked)return;
        if(!this.items.some(previous=>previous.id===item.id))
          this.items=[...this.items,item].sort((a,b)=>a.id-b.id);
        if(this.draft.trim()===text)this.draft='';
        if(uploads.length)this.clearFiles();
        if(this.replyTargetId===submittedReply && submittedReply!==null){
          if(this.kind==='feed'){
            this.feedCommentDrafts.delete(submittedReply);
            this.replyTargetId=null;
            this.draft=this.feedRootDraft;this.files=this.feedRootFiles;
            this.feedRootDraft='';this.feedRootFiles=[];
          }else this.replyTargetId=null;
        }
      },
      error:failure => {
        if(version===this.generation&&!this.accessRevoked&&!this.blockUnavailable(failure))
          this.error='Envio não confirmado. Consulta o histórico antes de repetir.';
      }
    }).add(() => {if(version===this.generation){this.sending=false;this.read(true);}});
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
      error:failure=>{if(current===this.attachmentProbeVersion&&version===this.generation){
        this.attachmentsEnabled=false;this.blockUnavailable(failure);
      }}
    });
  }
  chooseFiles(event:Event):void {
    const input=event.target as HTMLInputElement;
    const selected=Array.from(input.files||[]);
    input.value='';
    this.addFiles(selected);
  }
  onComposerPaste(event:ClipboardEvent):void {
    const images=Array.from(event.clipboardData?.files||[]).filter(file=>file.type.startsWith('image/'));
    if(!images.length)return;
    event.preventDefault();
    if(!this.attachmentsEnabled||this.sending||this.accessRevoked){
      this.error='Os anexos não estão disponíveis nesta conversa.';
      return;
    }
    this.addFiles(images);
  }
  private addFiles(selected:File[]):void {
    if(!selected.length||this.sending||this.accessRevoked||!this.attachmentsEnabled)return;
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
  private currentAttachment(messageId:number,index:number,mimeType?:string):boolean {
    // A late media response must never resurrect a preview after a message is
    // deleted or its attachments have been removed by a realtime refresh.
    // The authenticated live history takes precedence over potentially stale
    // search hits. Search-only older messages remain available when absent
    // from the latest-history window.
    const known=this.items.find(item=>item.id===messageId)
      ?? this.searchResults.find(item=>item.id===messageId);
    if(!known||known.deleted)return false;
    return (known.attachments||[]).some(file=>file.index===index
      && (!mimeType||file.mimeType===mimeType));
  }
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
      const position=this.previewOrder.indexOf(key);
      if(position!==-1)this.previewOrder.splice(position,1);
      return;
    }
    this.downloading=true;this.error='';
    const generation=this.generation;
    this.api.downloadContentFile(this.teamId,this.kind,entry.id,file.index).subscribe({
      next:blob=>{
        if(generation!==this.generation||this.accessRevoked
          ||!this.currentAttachment(entry.id,file.index,file.mimeType))return;
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
      error:failure=>{if(generation===this.generation&&!this.blockUnavailable(failure))
        this.error='Não foi possível abrir o anexo. Confirma a tua participação.';}
    }).add(()=>{if(generation===this.generation)this.downloading=false;});
  }
  private clearPreviews():void {
    for(const preview of Object.values(this.previews))URL.revokeObjectURL(preview.url);
    this.previews={};this.previewOrder.length=0;
  }
  download(entry:TeamContentEntry,index:number,filename:string):void {
    if(this.downloading||entry.deleted||!Number.isSafeInteger(index)||index<0||index>=4
      ||!this.currentAttachment(entry.id,index))return;
    this.downloading=true;this.error='';
    const generation=this.generation;
    this.api.downloadContentFile(this.teamId,this.kind,entry.id,index).subscribe({
      next:blob=>{
        if(generation!==this.generation||this.accessRevoked
          ||!this.currentAttachment(entry.id,index))return;
        const url=URL.createObjectURL(blob);
        try {
          const link=document.createElement('a');
          link.href=url;
          link.download=filename.replace(/[\\/\x00-\x1f\x7f]/g,'_').slice(0,160)||'anexo';
          link.click();
        }finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
      },
      error:failure=>{if(generation===this.generation&&!this.blockUnavailable(failure))
        this.error='Não foi possível descarregar o ficheiro. Confirma a tua participação.';}
    }).add(()=>{if(generation===this.generation)this.downloading=false;});
  }

  private loadReactions(items:TeamContentEntry[]):void {
    const ids=items.filter(item=>!item.deleted).slice(-100).map(item=>item.id);
    if(!ids.length)return;
    const version=++this.reactionVersion;
    const generation=this.generation;
    this.api.reactions(this.teamId,this.kind,ids).subscribe({
      next:reactions=>{
        if(version===this.reactionVersion && generation===this.generation&&!this.accessRevoked)
          this.reactionsById={...this.reactionsById,...reactions};
      },
      error:failure=>{
        if(version===this.reactionVersion && generation===this.generation)
          this.blockUnavailable(failure);
      }
    });
  }
  react(item:TeamContentEntry,emoji:string):void {
    if(item.deleted || this.reactionBusyId!==null || !this.emojis.includes(emoji))return;
    this.reactionBusyId=item.id;
    const generation=this.generation;
    const same=this.reactionsById[item.id]?.mine===emoji;
    const request=same
      ? this.api.removeReaction(this.teamId,this.kind,item.id)
      : this.api.setReaction(this.teamId,this.kind,item.id,emoji);
    request.subscribe({
      error:failure=>{if(generation===this.generation&&!this.blockUnavailable(failure))
        this.error='Não foi possível confirmar a reação. Consulta o histórico antes de repetir.';}
    }).add(()=>{if(generation===this.generation){this.reactionBusyId=null;if(!this.accessRevoked)this.loadReactions([item]);}});
  }

  private revalidateVisibleSearch():void {
    // Search hits may be older than the bounded 100-message timeline. A
    // content-free WebSocket hint must also reconcile those older results.
    if(!this.searchActive||this.searching||this.searchRecheckBusy||this.accessRevoked)return;
    const query=this.searchTerm.trim();
    if(query.length<2||query.length>80)return;
    const generation=this.generation,searchVersion=this.searchVersion;
    this.searchRecheckBusy=true;
    this.api.searchContent(this.teamId,this.kind,query).subscribe({
      next:results=>{
        if(generation!==this.generation||searchVersion!==this.searchVersion||!this.searchActive||this.accessRevoked)return;
        this.searchResults=results;
        const found=new Set(results.map(item=>item.id));
        for(const key of Object.keys(this.previews)){
          const id=Number(key.split(':')[0]);
          if(found.has(id)||this.items.some(item=>item.id===id&&!item.deleted))continue;
          URL.revokeObjectURL(this.previews[key].url);
          delete this.previews[key];
          const index=this.previewOrder.indexOf(key);
          if(index!==-1)this.previewOrder.splice(index,1);
        }
        this.loadReactions(results);
      },
      error:failure=>{
        if(generation===this.generation&&searchVersion===this.searchVersion){
          if(!this.blockUnavailable(failure))
            this.syncError='Não foi possível atualizar os resultados da pesquisa.';
        }
      }
    }).add(()=>{if(generation===this.generation)this.searchRecheckBusy=false;});
  }

  search():void {
    const query=this.searchTerm.trim();
    if(query.length<2 || query.length>80 || this.searching)return;
    const version=++this.searchVersion;
    const generation=this.generation;
    this.searching=true;this.searchActive=true;this.error='';
    this.api.searchContent(this.teamId,this.kind,query).subscribe({
      next:results=>{
        if(version===this.searchVersion && generation===this.generation&&!this.accessRevoked){this.searchResults=results;this.loadReactions(results);}
      },
      error:failure=>{
        if(version===this.searchVersion && generation===this.generation&&!this.blockUnavailable(failure))
          this.error='Não foi possível pesquisar as mensagens.';
      }
    }).add(()=>{if(version===this.searchVersion)this.searching=false;});
  }
  onSearchTermChanged():void {
    this.clearSearch();
  }
  clearSearch():void {
    this.searchVersion++;this.searchActive=false;this.searching=false;this.searchResults=[];
  }

  cancelReply():void {
    if(this.sending||this.replyTargetId===null)return;
    if(this.kind==='feed'){
      this.feedCommentDrafts.set(this.replyTargetId,{draft:this.draft,files:this.files});
      this.draft=this.feedRootDraft;this.files=this.feedRootFiles;
      this.feedRootDraft='';this.feedRootFiles=[];
    }
    this.replyTargetId=null;
  }
  reply(entry:TeamContentEntry):void {
    if(entry.deleted||this.sending)return;
    if(this.replyTargetId===entry.id){this.cancelReply();return;}
    if(this.kind==='feed'){
      if(this.replyTargetId===null){
        this.feedRootDraft=this.draft;this.feedRootFiles=this.files;
      }else{
        this.feedCommentDrafts.set(this.replyTargetId,{draft:this.draft,files:this.files});
      }
      const restored=this.feedCommentDrafts.get(entry.id);
      this.draft=restored?.draft||'';this.files=restored?.files||[];
    }
    this.replyTargetId=entry.id;
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
        if(version!==this.generation||this.accessRevoked)return;
        this.items=this.items.map(item=>item.id===updated.id?updated:item);
        this.searchResults=this.searchResults.map(item=>item.id===updated.id?updated:item);
        this.editingId=null;
      },
      error:failure=>{if(version===this.generation){
        // Editing a concurrently deleted message returns 409 too. Only the
        // authenticated history read can decide if the chat was disabled.
        if(failure instanceof HttpErrorResponse&&failure.status===409)
          this.error='Esta mensagem pode ter sido eliminada. A verificar o histórico.';
        else if(!this.blockUnavailable(failure))
          this.error='Edição não confirmada. Consulta o histórico antes de repetir.';
      }}
    }).add(()=>{if(version===this.generation){this.sending=false;this.read(true);}});
  }
  remove(entry:TeamContentEntry):void {
    if(this.sending || !entry.canManage || entry.deleted)return;
    if(!window.confirm('Eliminar esta mensagem da equipa?'))return;
    this.invalidatePendingRead();
    this.sending=true;this.error='';
    const version=this.generation;
    this.api.deleteContent(this.teamId,this.kind,entry.id).subscribe({
      next:()=>{
        if(version!==this.generation||this.accessRevoked)return;
        this.items=this.items.map(item=>item.id===entry.id?{...item,body:'',deleted:true,attachments:[]}:item);
        this.searchResults=this.searchResults.map(item=>item.id===entry.id?{...item,body:'',deleted:true,attachments:[]}:item);
        // An attachment preview must not remain on screen after removal.
        for(const key of Object.keys(this.previews)){
          if(!key.startsWith(entry.id+':'))continue;
          URL.revokeObjectURL(this.previews[key].url);
          delete this.previews[key];
          const index=this.previewOrder.indexOf(key);
          if(index!==-1)this.previewOrder.splice(index,1);
        }
      },
      error:failure=>{if(version===this.generation){
        if(failure instanceof HttpErrorResponse&&failure.status===409)
          this.error='A mensagem já pode ter sido eliminada. A verificar o histórico.';
        else if(!this.blockUnavailable(failure))
          this.error='Eliminação não confirmada. Consulta o histórico antes de repetir.';
      }}
    }).add(()=>{if(version===this.generation){this.sending=false;this.read(true);}});
  }

  ngOnDestroy():void {this.generation++;this.attachmentProbeVersion++;this.invalidatePendingRead();this.clearPreviews();this.subscriptions.unsubscribe();}
}
