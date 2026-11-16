import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
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
        <button type="button" (click)="search()" [disabled]="loading">Pesquisar</button>
      </div>
      <p *ngIf="error" role="alert" class="error">{{error}}</p>
      <p *ngIf="notice" role="status">{{notice}}</p>
      <p *ngIf="!applicationsVerified" role="alert">Não foi possível confirmar as candidaturas anteriores. Para evitar pedidos repetidos, o envio está temporariamente bloqueado.</p>
      <button *ngIf="!applicationsVerified || !teamsVerified" type="button" class="refresh-state" [disabled]="saving || refreshingApplications"
        (click)="refreshOwnershipAndApplications()">{{refreshingApplications?'A confirmar…':'Verificar equipas e candidaturas'}}</button>
      <p *ngIf="loading">A procurar competições…</p>
      <section class="card" *ngIf="applications.length">
        <h2>Pedidos das tuas equipas</h2>
        <p *ngFor="let application of applications">
          {{application.teamName}} · {{application.competitionType==='TOURNAMENT'?'Torneio':'Campeonato'}}
          · {{application.status==='PENDING'?'Em análise':application.status==='APPROVED'?'Aprovado pelo organizador':'Recusado'}}
        </p>
      </section>
      <section class="card team-picker">
        <h2>Escolher a equipa</h2>
        <p *ngIf="!teamsVerified">Ainda não foi possível confirmar as equipas que geres.</p>
        <label for="choose-team-for-competition">Equipa que se candidata</label>
        <select id="choose-team-for-competition" [disabled]="!teamsVerified || saving"
                [ngModel]="selectedTeam" (ngModelChange)="selectedTeam=$event">
          <option [ngValue]="null">Selecionar equipa</option>
          <option *ngFor="let team of mine" [ngValue]="team.id">{{team.name}}</option>
        </select>
      </section>
      <section class="results">
        <article class="card" *ngFor="let item of competitions">
          <small>{{item.type==='TOURNAMENT'?'Torneio':'Campeonato'}} · {{item.communityName}}</small>
          <h2>{{item.name}}</h2>
          <p>{{item.sport || 'Modalidade não indicada'}}</p>
          <button type="button" [disabled]="saving || !selectedTeam || !teamsVerified || !applicationsVerified || hasApplication(item,selectedTeam)"
                  (click)="apply(item)">{{applicationLabel(item,selectedTeam) || (saving?'A enviar…':'Pedir participação')}}</button>
          <p *ngIf="selectedTeam && hasApplication(item,selectedTeam)">{{applicationLabel(item,selectedTeam)}}</p>
        </article>
      </section>
      <p *ngIf="!loading && !competitions.length">Não há competições a aceitar candidaturas com estes filtros.</p>
      <p *ngIf="!mine.length">Precisas de criar ou administrar uma equipa para pedir participação.</p>
      <a routerLink="/menu/teams" fragment="criar-equipa">Criar equipa</a>
      <p class="note">A aprovação não inscreve automaticamente o plantel. A inscrição final depende das regras da competição.</p>
    </main>
  `,
  styles:[`
    .team-discover{max-width:1000px;margin:2rem auto;padding:0 1rem}
    .filters{display:flex;flex-wrap:wrap;gap:1rem;align-items:end;margin:1.5rem 0}
    .filters label{display:flex;flex-direction:column;flex:1;min-width:150px}
    input,select{min-height:42px;width:100%;padding:.65rem;color:inherit;background:transparent;border:1px solid #779587;border-radius:9px}
    button{margin:.5rem 0;padding:.75rem 1rem;border:0;border-radius:9px;background:#78e979;color:#102315;font-weight:750;cursor:pointer}
    button:disabled{opacity:.5;cursor:default}.results{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem}
    .card{border:1px solid #74947a66;border-radius:14px;padding:1.25rem;margin:1rem 0}
    .team-picker{max-width:520px}.team-picker h2{margin:.2rem 0 .4rem;font-size:1.12rem}
    .team-picker label{display:block;margin-bottom:.4rem;font-weight:700}
    .team-picker select{background:#0b2938;color:#f3fafc}
    small,.note{opacity:.75}.error{color:#ed9393}
  `]
})
export class TeamCompetitionDiscoveryComponent implements OnInit {
  query='';sport='';selectedTeam:number|null=null;mine:SportsTeam[]=[];
  competitions:OpenTeamCompetition[]=[];applications:TeamCompetitionApplication[]=[];
  error='';notice='';loading=false;saving=false;
  teamsVerified=false;applicationsVerified=false;refreshingApplications=false;
  constructor(private readonly route:ActivatedRoute,private readonly teams:SportsTeamsService,
              private readonly api:TeamCompetitionApplicationsService){}
  ngOnInit():void{
    this.refreshOwnershipAndApplications();
    this.search();
  }
  search():void{
    if(this.loading)return;
    this.loading=true;this.error='';
    this.api.discover(this.query,this.sport).subscribe({
      next:items=>{this.competitions=items;this.loading=false;},
      error:()=>{this.error='Não foi possível pesquisar competições.';this.loading=false;}
    });
  }
  refreshOwnershipAndApplications():void{
    if(this.saving||this.refreshingApplications)return;
    this.refreshingApplications=true;
    this.teamsVerified=false;this.applicationsVerified=false;this.error='';
    let pending=2;
    const done=()=>{pending--;if(pending===0)this.refreshingApplications=false;};
    this.teams.mine().subscribe({
      next:teams=>{
        this.mine=teams;this.teamsVerified=true;
        const requested=Number(this.route.snapshot.queryParamMap.get('teamId'));
        if(Number.isSafeInteger(requested)&&teams.some(team=>team.id===requested))this.selectedTeam=requested;
        else if(!teams.some(team=>team.id===this.selectedTeam))this.selectedTeam=null;
        done();
      },
      error:()=>{this.teamsVerified=false;this.error='Não foi possível confirmar as tuas equipas.';done();}
    });
    this.api.mine().subscribe({
      next:apps=>{this.applications=apps;this.applicationsVerified=true;done();},
      error:()=>{this.applicationsVerified=false;this.error='Não foi possível confirmar os pedidos existentes.';done();}
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
    if(this.saving||!this.teamsVerified||!this.applicationsVerified||
      !teamId||!this.mine.some(team=>team.id===teamId)||
      this.hasApplication(item,teamId))return;
    this.saving=true;this.error='';this.notice='';
    this.api.apply(item.communityId,item.type,item.id,teamId).subscribe({
      next:application=>{
        this.applications=[application,...this.applications];this.saving=false;
        this.notice='Pedido enviado ao organizador. Podes acompanhar o estado nesta página.';
      },
      error:()=>{
        this.saving=false;this.applicationsVerified=false;
        this.error='Não foi possível confirmar o pedido. Verifica os pedidos existentes antes de repetir.';
      }
    });
  }
}
