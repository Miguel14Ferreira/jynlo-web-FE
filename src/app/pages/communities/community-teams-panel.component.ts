import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SportsTeamsService, SportsTeam } from '../../services/sports-teams.service';
import { TeamCommunityMembership,TeamCommunityMembershipsService } from '../../services/team-community-memberships.service';

@Component({
  standalone:true,
  selector:'app-community-teams-panel',
  imports:[CommonModule,FormsModule,RouterLink],
  template:`
    <section class="community-teams" aria-label="Equipas associadas à comunidade">
      <div class="heading">
        <div><h3>Equipas da comunidade</h3><p>Equipas mantêm o plantel e o perfil próprios.</p></div>
        <span>{{active.length}} equipas</span>
      </div>
      <p *ngIf="loading">A carregar equipas…</p>
      <p *ngIf="error" role="alert" class="error">{{error}}</p>
      <p *ngIf="notice" role="status">{{notice}}</p>
      <p *ngIf="!loading && active.length===0">Esta comunidade ainda não tem equipas associadas.</p>
      <ul><li *ngFor="let membership of active">
        <a [routerLink]="['/menu/teams',membership.teamId]">{{membership.teamName}}</a>
        <button type="button" *ngIf="canManage" [disabled]="busy" (click)="remove(membership.id)">Remover equipa</button>
      </li></ul>
      <ng-container *ngIf="canManage">
        <h4>Convidar equipa existente</h4>
        <div class="form-row">
          <input [(ngModel)]="query" maxlength="100" (keyup.enter)="search()" placeholder="Pesquisar equipa pelo nome"/>
          <button type="button" [disabled]="busy||!query.trim()" (click)="search()">Pesquisar</button>
        </div>
        <ul><li *ngFor="let team of matches">
          <span>{{team.name}} · {{team.sport || 'Várias modalidades'}}</span>
          <button type="button" [disabled]="busy||hasRelation(team.id)"
             (click)="invite(team.id)">{{hasRelation(team.id)?'Pedido existente':'Convidar equipa'}}</button>
        </li></ul>
        <h4>Pedidos e convites pendentes</h4>
        <ul><li *ngFor="let membership of pending">
          <span>{{membership.teamName}} · {{membership.status==='PENDING_COMMUNITY'?'Pediu adesão':'Convite enviado'}}</span>
          <ng-container *ngIf="membership.status==='PENDING_COMMUNITY'">
            <button type="button" [disabled]="busy" (click)="respond(membership.id,true)">Aceitar</button>
            <button type="button" [disabled]="busy" (click)="respond(membership.id,false)">Recusar</button>
          </ng-container>
        </li></ul>
      </ng-container>
      <small>Associar uma equipa não adiciona automaticamente os jogadores como membros individuais.</small>
    </section>
  `,
  styles:[`
    .community-teams{padding:1rem;border:1px solid #77978066;border-radius:14px;margin:1rem 0}
    .heading{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap}
    .heading p,small{opacity:.78}ul{list-style:none;padding:0}
    li{padding:.65rem 0;display:flex;align-items:center;flex-wrap:wrap;gap:.7rem;border-bottom:1px solid #77978044}
    .form-row{display:flex;flex-wrap:wrap;gap:.5rem}
    input{padding:.65rem;min-width:150px;flex:1;border:1px solid #779780;border-radius:8px;color:inherit;background:transparent}
    button{padding:.5rem .7rem;border:1px solid #6aab7d;border-radius:8px;background:transparent;color:inherit;cursor:pointer}
    button:disabled{opacity:.5}.error{color:#e89696}
  `]
})
export class CommunityTeamsPanelComponent implements OnChanges {
  @Input({required:true}) communityId!:number;
  @Input() canManage=false;
  rows:TeamCommunityMembership[]=[];matches:SportsTeam[]=[];query='';
  loading=false;busy=false;error='';notice='';private revision=0;
  get active(){return this.rows.filter(r=>r.status==='ACTIVE');}
  get pending(){return this.rows.filter(r=>r.status==='PENDING_COMMUNITY'||r.status==='PENDING_TEAM');}
  constructor(private readonly service:TeamCommunityMembershipsService,
      private readonly teams:SportsTeamsService){}
  ngOnChanges():void{this.rows=[];this.matches=[];this.query='';this.reload();}
  hasRelation(id:number){return this.rows.some(r=>r.teamId===id);}
  reload():void{
    if(!this.communityId)return;
    const revision=++this.revision;this.loading=true;this.error='';
    this.service.communityTeams(this.communityId).subscribe({
      next:rows=>{if(revision===this.revision){this.rows=rows;this.loading=false;}},
      error:()=>{if(revision===this.revision){this.error='Não foi possível carregar as equipas.';this.loading=false;}}
    });
  }
  search():void{
    if(this.busy||!this.query.trim())return;
    const revision=this.revision;this.busy=true;this.error='';
    this.teams.discover(this.query).subscribe({
      next:rows=>{if(revision===this.revision){this.matches=rows;this.busy=false;}},
      error:()=>{if(revision===this.revision){this.error='Pesquisa indisponível.';this.busy=false;}}
    });
  }
  invite(teamId:number):void{
    if(!this.canManage||this.busy||this.hasRelation(teamId))return;
    this.busy=true;this.error='';this.notice='';
    this.service.invite(this.communityId,teamId).subscribe({
      next:()=>{this.busy=false;this.notice='Convite enviado ao responsável da equipa.';this.reload();},
      error:()=>{this.busy=false;this.error='Não foi possível convidar. Verifica os pedidos existentes.';}
    });
  }
  respond(id:number,accept:boolean):void{
    if(!this.canManage||this.busy)return;
    this.busy=true;this.error='';
    this.service.respond(id,accept).subscribe({
      next:()=>{this.busy=false;this.notice=accept?'Pedido aceite.':'Pedido recusado.';this.reload();},
      error:()=>{this.busy=false;this.error='Não foi possível confirmar a decisão.';}
    });
  }
  remove(id:number):void{
    if(!this.canManage||this.busy)return;
    this.busy=true;this.error='';
    this.service.remove(id).subscribe({
      next:()=>{this.busy=false;this.notice='Equipa removida da comunidade.';this.reload();},
      error:()=>{this.busy=false;this.error='Não foi possível remover a equipa.';}
    });
  }
}
