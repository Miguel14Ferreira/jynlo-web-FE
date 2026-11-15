import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, interval, fromEvent, merge, EMPTY } from 'rxjs';
import { SportsTeamsService, TeamContentEntry, TeamContentKind } from '../../services/sports-teams.service';

@Component({
  selector: 'app-sports-team-content',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="team-content">
      <p class="team-content-note">Exclusivo do responsável e dos membros confirmados.</p>
      <p role="alert" class="team-content-error" *ngIf="error">{{error}}</p>
      <p role="status" class="team-content-note" *ngIf="syncError">{{syncError}}</p>
      <p *ngIf="loading" class="team-content-note">A carregar…</p>
      <p *ngIf="!loading && !items.length && !error" class="team-content-note">
        {{kind === 'chat' ? 'Ainda não existem mensagens nesta equipa.' : 'Ainda não há publicações.'}}
      </p>
      <div class="team-content-history" aria-live="polite">
        <article *ngFor="let item of items; trackBy: trackMessage" class="team-content-entry">
          <strong>@{{item.username}}</strong>
          <time>{{item.createdAt | date:'dd/MM/yyyy HH:mm'}}</time>
          <p *ngIf="item.replyToId" class="team-content-reply">↳ Resposta à mensagem #{{item.replyToId}}</p>
          <p>{{item.deleted ? 'Mensagem eliminada' : item.body}}</p>
          <small *ngIf="item.editedAt && !item.deleted">Editada</small>
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
        A responder à mensagem #{{replyTargetId}}
        <button type="button" (click)="replyTargetId = null">Cancelar resposta</button>
      </div>
      <form (ngSubmit)="send()" class="team-content-editor">
        <label [for]="'team-content-' + kind + '-' + teamId">
          {{kind === 'chat' ? 'Mensagem' : 'Nova publicação'}}
        </label>
        <textarea [id]="'team-content-' + kind + '-' + teamId" name="body"
          [(ngModel)]="draft" maxlength="2000" [disabled]="sending"
          [placeholder]="kind === 'chat' ? 'Escreve uma mensagem…' : 'Partilha novidades com o plantel…'"></textarea>
        <button type="submit" [disabled]="sending || !draft.trim()">
          {{sending ? 'A enviar…' : kind === 'chat' ? 'Enviar' : 'Publicar'}}
        </button>
      </form>
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
    .team-content-entry form {display:grid;gap:.4rem;margin-top:.6rem}
    .team-content-entry textarea {min-height:65px;background:#072b38;color:white;border:1px solid #448b90;border-radius:8px;padding:.6rem}
  `]
})
export class SportsTeamContentComponent implements OnInit, OnChanges, OnDestroy {
  @Input({required:true}) teamId = 0;
  @Input({required:true}) kind: TeamContentKind = 'chat';
  replyTargetId: number | null = null;
  editingId: number | null = null;
  editingDraft = '';
  items: TeamContentEntry[] = [];
  draft = '';
  error = '';
  syncError = '';
  sending = false;
  loading = true;
  private readonly subscriptions = new Subscription();
  private generation = 0;
  private reading = false;

  constructor(private readonly api: SportsTeamsService) {}

  ngOnInit(): void {
    this.read(false);
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
      this.items = [];this.error = '';this.syncError = '';this.draft = '';
      this.replyTargetId = null;this.editingId = null;
      if (!changes['teamId']?.firstChange && !changes['kind']?.firstChange) this.read(false);
    }
  }

  trackMessage(_:number, entry:TeamContentEntry):number { return entry.id; }

  read(silent:boolean):void {
    if (this.reading || this.sending || !Number.isSafeInteger(this.teamId) || this.teamId<=0) return;
    this.reading = true;
    const version = this.generation;
    if (!silent) {this.loading=true;this.error='';}
    this.api.content(this.teamId,this.kind).subscribe({
      next:items => {
        if(version!==this.generation)return;
        this.items=items;this.syncError='';
      },
      error:() => {
        if(version!==this.generation)return;
        if(silent)this.syncError='A sincronização falhou. O histórico pode estar desatualizado.';
        else this.error='Não foi possível abrir esta conversa. Confirma que és membro e que está ativada.';
      },
      complete:() => {},
    }).add(() => {
      this.reading=false;
      if(version===this.generation && !silent)this.loading=false;
    });
  }

  send():void {
    const text=this.draft.trim();
    if(this.sending || !text || text.length>2000)return;
    const version=this.generation;
    this.sending=true;this.error='';
    this.api.sendContent(this.teamId,this.kind,text,this.replyTargetId).subscribe({
      next:item => {
        if(version!==this.generation)return;
        if(!this.items.some(previous=>previous.id===item.id))
          this.items=[...this.items,item].sort((a,b)=>a.id-b.id);
        if(this.draft.trim()===text){this.draft='';this.replyTargetId=null;}
      },
      error:() => {
        if(version===this.generation)
          this.error='Envio não confirmado. Consulta o histórico antes de repetir.';
      }
    }).add(() => {this.sending=false;this.read(true);});
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
    if(this.sending || entry.username!==this.username || !body)return;
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

  ngOnDestroy():void {this.generation++;this.subscriptions.unsubscribe();}
}
