import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate } from '../../i18n/i18n.service';
import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SportsTeamsService, SportsTeam } from '../../services/sports-teams.service';
import { TeamCommunityMembership,TeamCommunityMembershipsService } from '../../services/team-community-memberships.service';

@Component({
  standalone:true,
  selector:'app-community-teams-panel',
  imports:[TranslatePipe, CommonModule,FormsModule,RouterLink],
  template:`
    <section class="community-teams" [attr.aria-label]="'Equipas associadas à comunidade' | t">
      <div class="heading">
        <div><h3>{{ 'Equipas da comunidade' | t }}</h3><p>{{ 'Equipas mantêm o plantel e o perfil próprios.' | t }}</p></div>
        <span *ngIf="!loading">{{ '{{activeCount}} equipas' | t:{activeCount: (active.length)} }}</span>
      </div>
      <p *ngIf="loading">{{ 'A carregar equipas…' | t }}</p>
      <p *ngIf="error" role="alert" class="error">{{error}}</p>
      <p *ngIf="notice" role="status">{{notice}}</p>
      <p *ngIf="!loading && active.length===0">{{ 'Esta comunidade ainda não tem equipas associadas.' | t }}</p>
      <ul><li *ngFor="let membership of active">
        <a [routerLink]="['/menu/teams',membership.teamId]">{{membership.teamName}}</a>
        <button type="button" *ngIf="canManage" [disabled]="busy" (click)="remove(membership.id)">{{ 'Remover equipa' | t }}</button>
      </li></ul>
      <ng-container *ngIf="!canManage && mine.length">
        <h4>{{ 'Pedir entrada com uma das minhas equipas' | t }}</h4>
        <div *ngFor="let team of mine" class="form-row">
          <span>{{team.name}}</span>
          <button type="button" [disabled]="busy||hasRelation(team.id)" (click)="request(team.id)">
            {{hasRelation(team.id)?('Pedido existente' | t):('Pedir adesão' | t)}}
          </button>
        </div>
      </ng-container>
      <ng-container *ngIf="canManage">
        <h4>{{ 'Convidar equipa existente' | t }}</h4>
        <div class="form-row">
          <input [(ngModel)]="query" maxlength="100" (keyup.enter)="search()" [placeholder]="'Pesquisar equipa pelo nome' | t"/>
          <button type="button" [disabled]="busy||!query.trim()" (click)="search()">{{ 'Pesquisar' | t }}</button>
        </div>
        <ul><li *ngFor="let team of matches">
          <span>{{team.name}} · {{team.sport || ('Várias modalidades' | t)}}</span>
          <button type="button" [disabled]="busy||hasRelation(team.id)"
             (click)="invite(team.id)">{{hasRelation(team.id)?('Pedido existente' | t):('Convidar equipa' | t)}}</button>
        </li></ul>
        <h4>{{ 'Pedidos e convites pendentes' | t }}</h4>
        <ul><li *ngFor="let membership of pending">
          <span>{{membership.teamName}} · {{membership.status==='PENDING_COMMUNITY'?('Pediu adesão' | t):('Convite enviado' | t)}}</span>
          <ng-container *ngIf="membership.status==='PENDING_COMMUNITY'">
            <button type="button" [disabled]="busy" (click)="respond(membership.id,true)">{{ 'Aceitar' | t }}</button>
            <button type="button" [disabled]="busy" (click)="respond(membership.id,false)">{{ 'Recusar' | t }}</button>
          </ng-container>
        </li></ul>
      </ng-container>
      <small>{{ 'Associar uma equipa não adiciona automaticamente os jogadores como membros individuais.' | t }}</small>
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
  rows:TeamCommunityMembership[]=[];matches:SportsTeam[]=[];mine:SportsTeam[]=[];query='';
  loading=false;busy=false;error='';notice='';private revision=0;
  get active(){return this.rows.filter(r=>r.status==='ACTIVE');}
  get pending(){return this.rows.filter(r=>r.status==='PENDING_COMMUNITY'||r.status==='PENDING_TEAM');}
  constructor(private readonly service:TeamCommunityMembershipsService,
      private readonly teams:SportsTeamsService){}
  ngOnChanges():void{
    this.rows=[];this.matches=[];this.mine=[];this.query='';this.reload();
    if(!this.canManage)this.teams.mine().subscribe({next:rows=>this.mine=rows,error:()=>this.mine=[]});
  }
  hasRelation(id:number){return this.rows.some(r=>r.teamId===id&&r.status!=='DECLINED');}
  reload():void{
    if(!this.communityId)return;
    const revision=++this.revision;this.loading=true;this.error='';
    this.service.communityTeams(this.communityId).subscribe({
      next:rows=>{if(revision===this.revision){this.rows=rows;this.loading=false;}},
      error:()=>{if(revision===this.revision){this.error=appTranslate('Não foi possível carregar as equipas.');this.loading=false;}}
    });
  }
  search():void{
    if(this.busy||!this.query.trim())return;
    const revision=this.revision;this.busy=true;this.error='';
    this.teams.discover(this.query).subscribe({
      next:rows=>{if(revision===this.revision){this.matches=rows;this.busy=false;}},
      error:()=>{if(revision===this.revision){this.error=appTranslate('Pesquisa indisponível.');this.busy=false;}}
    });
  }
  request(teamId:number):void{
    if(this.canManage||this.busy||this.hasRelation(teamId)||!this.mine.some(t=>t.id===teamId))return;
    this.busy=true;this.error='';this.notice='';
    this.service.request(teamId,this.communityId).subscribe({
      next:()=>{this.busy=false;this.notice=appTranslate('Pedido enviado aos responsáveis da comunidade.');this.reload();},
      error:()=>{this.busy=false;this.error=appTranslate('Não foi possível pedir adesão. Confirma se a comunidade é pública.');}
    });
  }
  invite(teamId:number):void{
    if(!this.canManage||this.busy||this.hasRelation(teamId))return;
    this.busy=true;this.error='';this.notice='';
    this.service.invite(this.communityId,teamId).subscribe({
      next:()=>{this.busy=false;this.notice=appTranslate('Convite enviado ao responsável da equipa.');this.reload();},
      error:()=>{this.busy=false;this.error=appTranslate('Não foi possível convidar. Verifica os pedidos existentes.');}
    });
  }
  respond(id:number,accept:boolean):void{
    if(!this.canManage||this.busy)return;
    this.busy=true;this.error='';
    this.service.respond(id,accept).subscribe({
      next:()=>{this.busy=false;this.notice=accept?'Pedido aceite.':'Pedido recusado.';this.reload();},
      error:()=>{this.busy=false;this.error=appTranslate('Não foi possível confirmar a decisão.');}
    });
  }
  remove(id:number):void{
    if(!this.canManage||this.busy)return;
    this.busy=true;this.error='';
    this.service.remove(id).subscribe({
      next:()=>{this.busy=false;this.notice=appTranslate('Equipa removida da comunidade.');this.reload();},
      error:()=>{this.busy=false;this.error=appTranslate('Não foi possível remover a equipa.');}
    });
  }
}
