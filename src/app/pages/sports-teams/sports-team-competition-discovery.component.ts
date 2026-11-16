import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { timeout } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SportsTeam, SportsTeamsService } from '../../services/sports-teams.service';
import { OpenTeamCompetition, TeamCompetitionApplication,
  TeamCompetitionApplicationsService } from '../../services/team-competition-applications.service';

@Component({
  standalone:true,
  selector:'app-team-competition-discovery',
  imports:[CommonModule,FormsModule,RouterLink],
  template:`
    <main class="team-discover">
      <a routerLink="/menu/teams">← Voltar às equipas</a>
      <h1>Encontrar torneios e campeonatos</h1>
      <p>Encontra competições públicas com candidaturas abertas e pede participação como responsável de uma equipa.</p>
      <div class="filters">
        <label>Nome ou comunidade<input [(ngModel)]="query" maxlength="80" (keyup.enter)="search()"/></label>
        <label>Modalidade<input [(ngModel)]="sport" maxlength="80" (keyup.enter)="search()"/></label>
        <button type="button" (click)="search()">Pesquisar</button>
      </div>
      <p *ngIf="error" role="alert" class="error">{{error}}</p>
      <p *ngIf="notice" role="status">{{notice}}</p>
      <p *ngIf="!refreshingApplications && !applicationsVerified" role="alert">Não foi possível confirmar as candidaturas anteriores. Para evitar pedidos repetidos, o envio está temporariamente bloqueado.</p>
      <button *ngIf="!applicationsVerified || !teamsVerified" type="button" class="refresh-state" [disabled]="saving || refreshingApplications"
        (click)="refreshOwnershipAndApplications()">{{refreshingApplications?'A confirmar…':'Verificar equipas e candidaturas'}}</button>
      <p *ngIf="loading" role="status">A procurar competições…</p>
      <section class="card" *ngIf="applications.length">
        <h2>Pedidos das tuas equipas</h2>
        <p *ngFor="let application of applications">
          {{application.teamName}} · {{application.competitionType==='TOURNAMENT'?'Torneio':'Campeonato'}}
          · {{application.status==='PENDING'?'Em análise':application.status==='APPROVED'?'Aprovado pelo organizador':'Recusado'}}
        </p>
      </section>
      <section class="card team-picker" aria-label="Escolher equipa para candidatura">
        <h2>Escolher a equipa</h2>
        <p *ngIf="!refreshingApplications && !teamsVerified">Ainda não foi possível confirmar as equipas que geres.</p>
        <label for="choose-team-for-competition">Equipa que se candidata</label>
        <select id="choose-team-for-competition" [disabled]="!teamsVerified || saving"
                [ngModel]="selectedTeam" (ngModelChange)="selectedTeam=$event">
          <option [ngValue]="null">Selecionar equipa</option>
          <option *ngFor="let team of mine" [ngValue]="team.id">{{team.name}}</option>
        </select>
        <div class="selected-team-kit" *ngIf="selectedTeam && selectedTeamIdentity as team"
          aria-label="Equipamento da equipa selecionada">
          <span class="team-shirt" [class]="'team-shirt kit-' + (team.kitPattern || 'PLAIN').toLowerCase()"
            [style.--shirt-primary]="team.kitPrimary || '#16caba'"
            [style.--shirt-secondary]="team.kitSecondary || '#f2fafc'" aria-hidden="true"></span>
          <span><strong>{{team.name}}</strong> · Equipamento oficial</span>
        </div>
      </section>
      <section class="results">
        <article class="card" *ngFor="let item of competitions">
          <small>{{item.type==='TOURNAMENT'?'Torneio':'Campeonato'}} · {{item.communityName}}</small>
          <h2>{{item.name}}</h2>
          <p>{{item.sport || 'Modalidade não indicada'}}</p>
          <p *ngIf="!item.applicationsOpen" role="status">Candidaturas encerradas</p>
          <button type="button" [disabled]="saving || !item.applicationsOpen || !selectedTeam || !teamsVerified || !applicationsVerified || hasApplication(item,selectedTeam)"
                  (click)="apply(item)">{{applicationLabel(item,selectedTeam) || (saving?'A enviar…':'Pedir participação')}}</button>
          <p *ngIf="selectedTeam && hasApplication(item,selectedTeam)">{{applicationLabel(item,selectedTeam)}}</p>
        </article>
      </section>
      <p *ngIf="!loading && !searchError && !competitions.length">Não há competições a aceitar candidaturas com estes filtros.</p>
      <p *ngIf="teamsVerified && !mine.length">Precisas de criar ou administrar uma equipa para pedir participação.</p>
      <a class="create-team-link" routerLink="/menu/teams" [queryParams]="{create:1}">Criar equipa</a>
      <p class="note">A aprovação não inscreve automaticamente o plantel. A inscrição final depende das regras da competição.</p>
    </main>
  `,
  styles:[`
    :host{display:block;min-height:100vh;background:linear-gradient(145deg,#07111f,#0b293b);color:#f5fafb}
    .team-discover{box-sizing:border-box;width:min(1180px,100%);margin:0 auto;padding:6.5rem 1.25rem 4rem;display:grid;gap:1rem}
    .team-discover h1{margin:.2rem 0 0;font-size:clamp(1.7rem,3vw,2.5rem);letter-spacing:-.025em;line-height:1.12;color:#f5fafb}
    .team-discover h2{font-size:1.15rem;line-height:1.35;color:#f5fafb;margin:0 0 .65rem}
    .team-discover p{color:#bcd7e1;line-height:1.55;margin:.2rem 0}
    .team-discover>a{color:#72f4df;font-weight:750;text-decoration:none;justify-self:start}
    .team-discover>a:hover{text-decoration:underline}
    .team-discover .filters{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:.85rem;align-items:end;margin:.3rem 0}
    .team-discover label{display:grid;gap:.4rem;font-weight:700;font-size:.92rem;color:#e8f9fc}
    .team-discover input,.team-discover select{box-sizing:border-box;display:block;width:100%;min-height:46px;max-width:100%;border:1px solid #34808d;border-radius:10px;background:#0b303e;color:#f5fafb;padding:.65rem .8rem;font:inherit}
    .team-discover select{background:#0b303e!important;color:#f5fafb!important}
    .team-discover option{background:#0b303e;color:#f5fafb}
    .team-discover input:focus-visible,.team-discover select:focus-visible,.team-discover button:focus-visible,.team-discover a:focus-visible{outline:2px solid #73f6dd;outline-offset:2px}
    .team-discover button{border:1px solid #20ccae;border-radius:10px;background:#24d5bd;color:#062d37;min-height:46px;padding:.68rem 1rem;font:inherit;font-weight:800;cursor:pointer}
    .team-discover button:hover:not(:disabled){background:#69edd9}
    .team-discover button:disabled{opacity:.6;cursor:not-allowed}
    .team-discover .refresh-state{justify-self:start;background:#0b3544;color:#defcf9;border-color:#377d8b}
    .team-discover .card{box-sizing:border-box;min-width:0;max-width:100%;border:1px solid #347c8b80!important;border-radius:16px!important;background:#0a2a3b!important;color:#f5fafb!important;box-shadow:none!important;padding:1.1rem!important;margin:0!important}
    .team-discover .card p,.team-discover .card small{color:#bcd7e1!important}
    .team-discover .team-picker{width:min(100%,560px)}
    .team-discover .team-picker select{margin-top:.25rem}
    .team-discover .selected-team-kit{display:flex;align-items:center;gap:.8rem;flex-wrap:wrap;margin-top:1rem;
      font-size:.84rem;color:#defcf9}
    .team-discover .selected-team-kit .team-shirt{display:flex;align-items:center;justify-content:center;
      width:52px;height:56px;flex:none;border-radius:11px;background:#08202d;border:1px solid #3e8391}
    .team-discover .selected-team-kit .team-shirt:after{content:'';width:34px;height:42px;
      clip-path:polygon(22% 0,78% 0,100% 20%,88% 42%,77% 35%,77% 100%,23% 100%,23% 35%,12% 42%,0 20%);
      background:var(--shirt-primary)}
    .team-discover .selected-team-kit .kit-stripes:after{background:repeating-linear-gradient(90deg,
      var(--shirt-primary) 0 8px,var(--shirt-secondary) 8px 15px)}
    .team-discover .selected-team-kit .kit-diagonal:after{background:linear-gradient(125deg,
      var(--shirt-primary) 0 36%,var(--shirt-secondary) 36% 55%,var(--shirt-primary) 55% 100%)}

    .team-discover .results{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,265px),1fr));gap:.9rem}
    .team-discover .results .card{display:grid;align-content:start;gap:.65rem}
    .team-discover .results .card button{justify-self:start}
    .team-discover .error,.team-discover [role="alert"]{color:#ffb7bc;border-left:3px solid #eb9198;padding:.35rem .65rem}
    .team-discover .create-team-link{border:1px solid #337e8e;border-radius:10px;padding:.5rem .8rem}
    .team-discover .note{font-size:.9rem;color:#9dbec9}
    @media(max-width:720px){.team-discover{padding:5.5rem 1rem 3rem}.team-discover .filters{grid-template-columns:1fr}.team-discover .filters button{width:100%}.team-discover .results{grid-template-columns:1fr}}
  `]
})
export class TeamCompetitionDiscoveryComponent implements OnInit, OnDestroy {
  query='';sport='';selectedTeam:number|null=null;mine:SportsTeam[]=[];
  competitions:OpenTeamCompetition[]=[];applications:TeamCompetitionApplication[]=[];
  error='';notice='';loading=false;saving=false;searchError=false;
  private searchVersion=0;private ownershipVersion=0;private destroyed=false;
  private readonly requestTimeout=12000;
  get selectedTeamIdentity(){return this.mine.find(team=>team.id===this.selectedTeam)||null;}
  teamsVerified=false;applicationsVerified=false;refreshingApplications=false;
  constructor(private readonly route:ActivatedRoute,private readonly teams:SportsTeamsService,
              private readonly api:TeamCompetitionApplicationsService,
              private readonly cdr:ChangeDetectorRef){}
  private render():void{if(!this.destroyed)this.cdr.detectChanges();}
  ngOnInit():void{
    this.refreshOwnershipAndApplications();
    this.search();
  }
  ngOnDestroy():void{
    this.destroyed=true;this.searchVersion++;this.ownershipVersion++;
  }
  search():void{
    const version=++this.searchVersion;
    const query=this.query.trim(),sport=this.sport.trim();
    this.loading=true;this.searchError=false;this.error='';
    this.competitions=[];
    this.api.discover(query,sport).pipe(timeout(this.requestTimeout)).subscribe({
      next:items=>{
        if(this.destroyed||version!==this.searchVersion)return;
        this.competitions=items;this.loading=false;this.render();
      },
      error:()=>{
        if(this.destroyed||version!==this.searchVersion)return;
        this.searchError=true;this.error='A pesquisa de competições demorou demasiado ou falhou. Tenta novamente.';
        this.loading=false;this.render();
      }
    });
  }
  refreshOwnershipAndApplications():void{
    if(this.saving||this.refreshingApplications)return;
    const version=++this.ownershipVersion;
    this.refreshingApplications=true;
    this.teamsVerified=false;this.applicationsVerified=false;this.error='';
    let pending=2;
    const done=()=>{
      if(this.destroyed||version!==this.ownershipVersion)return;
      pending--;
      if(pending===0)this.refreshingApplications=false;
      this.render();
    };
    this.teams.mine().pipe(timeout(this.requestTimeout)).subscribe({
      next:teams=>{
        if(this.destroyed||version!==this.ownershipVersion)return;
        this.mine=teams;this.teamsVerified=true;
        const requested=Number(this.route.snapshot.queryParamMap.get('teamId'));
        if(Number.isSafeInteger(requested)&&teams.some(team=>team.id===requested))this.selectedTeam=requested;
        else if(!teams.some(team=>team.id===this.selectedTeam))this.selectedTeam=null;
        done();
      },
      error:()=>{
        if(this.destroyed||version!==this.ownershipVersion)return;
        this.mine=[];this.selectedTeam=null;this.teamsVerified=false;
        this.error='Não foi possível confirmar as tuas equipas. Verifica a ligação e tenta novamente.';
        done();
      }
    });
    this.api.mine().pipe(timeout(this.requestTimeout)).subscribe({
      next:apps=>{
        if(this.destroyed||version!==this.ownershipVersion)return;
        this.applications=apps;this.applicationsVerified=true;done();
      },
      error:()=>{
        if(this.destroyed||version!==this.ownershipVersion)return;
        this.applications=[];this.applicationsVerified=false;
        this.error='Não foi possível confirmar os pedidos existentes. Tenta novamente.';
        done();
      }
    });
  }
  applicationFor(item:OpenTeamCompetition,teamId:number|null):TeamCompetitionApplication|undefined{
    return teamId===null?undefined:this.applications.find(a=>a.teamId===teamId
      &&a.competitionType===item.type&&a.competitionId===item.id);
  }
  hasApplication(item:OpenTeamCompetition,teamId:number|null):boolean{
    return !!this.applicationFor(item,teamId);
  }
  applicationLabel(item:OpenTeamCompetition,teamId:number|null):string|null{
    const status=this.applicationFor(item,teamId)?.status;
    return status==='PENDING'?'Pedido em análise':status==='APPROVED'?'Candidatura aprovada':
      status==='DECLINED'?'Candidatura recusada':null;
  }
  apply(item:OpenTeamCompetition):void{
    const teamId=this.selectedTeam;
    if(this.saving||!item.applicationsOpen||!this.teamsVerified||!this.applicationsVerified||
      !teamId||!this.mine.some(team=>team.id===teamId)||
      this.hasApplication(item,teamId))return;
    this.saving=true;this.error='';this.notice='';
    this.api.apply(item.communityId,item.type,item.id,teamId).pipe(timeout(this.requestTimeout)).subscribe({
      next:application=>{
        this.applications=[application,...this.applications];this.saving=false;
        this.notice='Pedido enviado ao organizador. Podes acompanhar o estado nesta página.';this.render();
      },
      error:()=>{
        this.saving=false;this.applicationsVerified=false;
        this.error='Não foi possível confirmar o pedido. Verifica os pedidos existentes antes de repetir.';this.render();
      }
    });
  }
}
