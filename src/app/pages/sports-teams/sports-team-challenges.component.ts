import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { timeout } from 'rxjs';
import { SportsTeam, SportsTeamsService } from '../../services/sports-teams.service';
import { SportsTeamChallengesService, TeamChallenge } from '../../services/sports-team-challenges.service';

@Component({
  standalone:true,
  selector:'app-sports-team-challenges',
  imports:[CommonModule,FormsModule,RouterLink],
  template:`
  <section class="challenges" aria-label="Desafios entre equipas">
    <div class="heading">
      <div>
        <p class="eyebrow">JYNLO · RIVALIDADES</p>
        <h2>Desafios entre equipas</h2>
        <p>Desafia outra equipa. A sessão só é associada após a aceitação,
        sem inscrever ninguém automaticamente.</p>
      </div>
      <button type="button" [disabled]="busy" (click)="refresh()">Verificar desafios</button>
    </div>
    <p role="alert" *ngIf="error" class="error">{{error}}</p>
    <p role="status" *ngIf="feedback" class="feedback">{{feedback}}</p>
    <p *ngIf="loading" role="status">A consultar desafios…</p>
    <ng-container *ngIf="!loading">
      <p *ngIf="!items.length&&!error" class="empty">
        Esta equipa ainda não tem desafios. Podes lançar o primeiro a partir daqui.
      </p>
      <div class="challenge-list">
        <article *ngFor="let challenge of items" class="challenge-card">
          <div class="challenge-top">
            <strong>{{challenge.challengerTeamName}} <span>vs.</span> {{challenge.challengedTeamName}}</strong>
            <span class="status" [class.pending]="challenge.status==='PENDING'">
              {{statusLabel(challenge.status)}}</span>
          </div>
          <p *ngIf="challenge.message">{{challenge.message}}</p>
          <small>{{challenge.createdAt | date:'dd/MM/yyyy'}}</small>
          <div class="actions" *ngIf="isOwner">
            <ng-container *ngIf="challenge.status==='PENDING'&&challenge.challengedTeamId===teamId">
              <button type="button" class="primary" [disabled]="busy" (click)="respond(challenge,true)">
                Aceitar desafio</button>
              <button type="button" [disabled]="busy" (click)="respond(challenge,false)">Recusar</button>
            </ng-container>
            <button type="button" *ngIf="challenge.status==='PENDING'&&challenge.challengerTeamId===teamId"
              [disabled]="busy" (click)="cancel(challenge)">Cancelar convite</button>
            <ng-container *ngIf="challenge.status==='ACCEPTED'&&!challenge.sessionId">
              <p class="hint">Cria uma sessão pública normalmente e associa-a aqui.
                A organização do jogo e as inscrições mantêm as regras habituais.</p>
              <label [attr.for]="'challenge-session-'+challenge.id">ID da sessão criada por ti</label>
              <div class="link-form">
                <input [id]="'challenge-session-'+challenge.id" type="number" min="1"
                  inputmode="numeric" [disabled]="busy"
                  [(ngModel)]="sessionInputs[challenge.id]" placeholder="Ex.: 123">
                <button type="button" class="primary" [disabled]="busy||!validSession(challenge.id)"
                  (click)="linkSession(challenge)">Associar sessão</button>
              </div>
            </ng-container>
          </div>
          <a *ngIf="challenge.sessionId" [routerLink]="['/menu/events',challenge.sessionId]">
            Abrir sessão associada</a>
          <a *ngIf="challenge.challengerTeamId!==teamId" [routerLink]="['/menu/teams',challenge.challengerTeamId]">
            Ver equipa desafiante</a>
          <a *ngIf="challenge.challengedTeamId!==teamId" [routerLink]="['/menu/teams',challenge.challengedTeamId]">
            Ver equipa desafiada</a>
        </article>
      </div>
    </ng-container>
    <div *ngIf="isOwner" class="create">
      <h3>Lançar um desafio</h3>
      <p>Procura uma equipa da mesma modalidade. Apenas o respetivo responsável poderá aceitar.</p>
      <div class="search">
        <input [(ngModel)]="query" maxlength="80" placeholder="Pesquisar equipa" [disabled]="busy"
          (keyup.enter)="findTeams()">
        <button type="button" (click)="findTeams()" [disabled]="busy||searching||query.trim().length<2">
          {{searching?'A procurar…':'Pesquisar'}}</button>
      </div>
      <div class="candidates" *ngIf="candidates.length">
        <button type="button" *ngFor="let team of candidates" [disabled]="busy"
          [class.selected]="selectedTeamId===team.id" [attr.aria-pressed]="selectedTeamId===team.id"
          (click)="selectedTeamId=team.id">
          {{team.name}} <small>{{team.sport||'Modalidade por definir'}}</small>
        </button>
      </div>
      <label for="challenge-message">Mensagem opcional</label>
      <textarea id="challenge-message" [(ngModel)]="message" maxlength="280"
        placeholder="Que tal um jogo entre as nossas equipas?" [disabled]="busy"></textarea>
      <button type="button" class="primary" [disabled]="busy||!selectedTeamId"
        (click)="invite()">Enviar desafio</button>
    </div>
  </section>
  `,
  styles:[`
    .challenges{display:grid;gap:18px;min-width:0;color:var(--text,#eefaff)}
    .heading{display:flex;justify-content:space-between;align-items:start;gap:14px;flex-wrap:wrap}
    .heading p,.create p,.hint,.empty{color:#aacbd0;line-height:1.55}
    .heading h2{font-size:clamp(20px,3vw,27px);margin:4px 0}
    .eyebrow{font-size:11px;letter-spacing:1.3px;font-weight:900;color:#80e9d8}
    .challenge-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr));gap:12px}
    .challenge-card,.create{border:1px solid #357680a8;border-radius:15px;background:#103543;padding:17px;min-width:0}
    .challenge-card{display:grid;align-content:start;gap:10px}
    .challenge-top{display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between}
    .challenge-top strong{font-size:17px;overflow-wrap:anywhere}
    .challenge-top span{color:#96c6c9}
    .challenge-top .status{padding:4px 9px;background:#244957;border-radius:100px;font-size:12px}
    .challenge-top .status.pending{background:#4e4b2d;color:#fff0a5}
    .actions,.link-form,.search{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .create{display:grid;gap:11px}
    .candidates{display:flex;flex-wrap:wrap;gap:8px}
    .candidates button{display:flex;flex-direction:column;gap:3px}
    .candidates .selected{border-color:#7cf5da;background:#1f5a61}
    input,textarea{min-height:44px;background:#082b36;color:#f5ffff;border:1px solid #59919b;border-radius:10px;padding:10px;max-width:100%}
    textarea{min-height:72px;resize:vertical;width:100%}
    .search input{flex:1;min-width:160px}
    .link-form input{width:130px}
    button{min-height:44px;border:1px solid #55929b;border-radius:10px;padding:9px 14px;background:#164455;color:#f0ffff;cursor:pointer}
    button.primary{background:#0f897e;border-color:#20b5a1;font-weight:800}
    button:disabled{cursor:not-allowed;opacity:.55}
    .feedback{color:#7ff3d4}.error{color:#ffb6ad}
    a{color:#8affdf;text-decoration:underline;text-underline-offset:3px}
    @media(max-width:600px){.actions button,.link-form button,.create>.primary{flex:1;min-width:140px}.heading>button{width:100%}}
  `]
})
export class SportsTeamChallengesComponent implements OnInit,OnDestroy {
  @Input({required:true}) teamId=0;
  @Input() isOwner=false;
  @Input() sport:string|null=null;
  items:TeamChallenge[]=[];
  candidates:SportsTeam[]=[];
  selectedTeamId:number|null=null;
  query='';
  message='';
  loading=true;
  searching=false;
  busy=false;
  error='';
  feedback='';
  sessionInputs:Record<number,string>={};
  private generation=0;
  private searchVersion=0;
  private destroyed=false;
  constructor(private readonly api:SportsTeamChallengesService,
      private readonly teams:SportsTeamsService,private readonly cd:ChangeDetectorRef){}
  ngOnInit():void{this.refresh();}
  ngOnDestroy():void{this.destroyed=true;this.generation++;this.searchVersion++;}
  private render():void{if(!this.destroyed)this.cd.markForCheck();}
  statusLabel(value:TeamChallenge['status']):string {
    return {PENDING:'A aguardar',ACCEPTED:'Aceite',DECLINED:'Recusado',CANCELLED:'Cancelado'}[value];
  }
  validSession(id:number):boolean {
    return /^[1-9][0-9]*$/.test(this.sessionInputs[id]||'')
      &&Number.isSafeInteger(Number(this.sessionInputs[id]));
  }
  refresh():void {
    if(!Number.isSafeInteger(this.teamId)||this.teamId<=0||this.busy)return;
    const version=++this.generation;this.loading=true;this.error='';
    this.api.forTeam(this.teamId).pipe(timeout(12000)).subscribe({
      next:items=>{if(this.destroyed||version!==this.generation)return;
        this.items=items;this.loading=false;this.render();},
      error:()=>{if(this.destroyed||version!==this.generation)return;
        this.items=[];this.loading=false;this.error='Não foi possível confirmar os desafios desta equipa.';this.render();}
    });
  }
  findTeams():void {
    if(!this.isOwner||this.busy||this.query.trim().length<2)return;
    const version=++this.searchVersion;this.searching=true;this.candidates=[];this.selectedTeamId=null;this.error='';
    this.teams.discover(this.query).pipe(timeout(12000)).subscribe({
      next:items=>{if(this.destroyed||version!==this.searchVersion)return;
        this.candidates=items.filter(x=>x.id!==this.teamId
          &&(!this.sport||!x.sport||x.sport.toLowerCase()===this.sport.toLowerCase()));
        this.searching=false;this.render();},
      error:()=>{if(this.destroyed||version!==this.searchVersion)return;
        this.searching=false;this.error='Pesquisa indisponível. Tenta novamente.';this.render();}
    });
  }
  invite():void {
    if(!this.isOwner||this.busy||!this.selectedTeamId
        ||!this.candidates.some(x=>x.id===this.selectedTeamId))return;
    this.busy=true;this.error='';this.feedback='';
    this.api.challenge(this.teamId,this.selectedTeamId,this.message).pipe(timeout(12000)).subscribe({
      next:()=>{if(this.destroyed)return;this.busy=false;this.message='';this.selectedTeamId=null;
        this.candidates=[];this.feedback='Desafio enviado. A outra equipa terá de aceitar.';this.refresh();},
      error:(e:HttpErrorResponse)=>{if(this.destroyed)return;this.busy=false;
        this.error=e.status===409?'Já existe um desafio entre estas equipas. Confirma a lista antes de repetir.':
          'Não foi possível confirmar o envio. Verifica os desafios antes de voltares a tentar.';this.render();}
    });
  }
  private mutate(request:import('rxjs').Observable<TeamChallenge>,success:string):void {
    if(this.busy)return;
    this.busy=true;this.error='';this.feedback='';
    request.pipe(timeout(12000)).subscribe({
      next:()=>{if(this.destroyed)return;this.busy=false;this.feedback=success;this.refresh();},
      error:(e:HttpErrorResponse)=>{if(this.destroyed)return;this.busy=false;
        this.error=e.status===409?'Este desafio foi alterado noutra sessão. Verifica o estado antes de repetir.':
          'Não foi possível confirmar a alteração. Consulta novamente os desafios.';this.refresh();}
    });
  }
  respond(item:TeamChallenge,accept:boolean):void {
    if(!this.isOwner||item.challengedTeamId!==this.teamId||item.status!=='PENDING')return;
    this.mutate(this.api.respond(item.id,accept),accept?'Desafio aceite. Podem organizar a sessão.':'Desafio recusado.');
  }
  cancel(item:TeamChallenge):void {
    if(!this.isOwner||item.challengerTeamId!==this.teamId||item.status!=='PENDING')return;
    this.mutate(this.api.cancel(item.id),'Convite cancelado.');
  }
  linkSession(item:TeamChallenge):void {
    if(!this.isOwner||item.status!=='ACCEPTED'||item.sessionId||!this.validSession(item.id))return;
    this.mutate(this.api.linkSession(item.id,Number(this.sessionInputs[item.id])),
      'Sessão associada ao desafio.');
  }
}
