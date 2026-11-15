import { CommonModule } from '@angular/common';
import { GlobalTeamEnrollmentComponent } from './global-team-enrollment.component';
import { Component, Input, OnChanges } from '@angular/core';
import { TeamCompetitionApplicationsService, TeamCompetitionApplication, TeamCompetitionKind } from '../../services/team-competition-applications.service';

/** Organizer-only application management, separate from outbound team invitations. */
@Component({
  standalone:true,
  selector:'app-team-competition-applications',
  imports:[CommonModule,GlobalTeamEnrollmentComponent],
  template:`
    <section class="team-applications">
      <h6>Candidaturas de equipas</h6>
      <p>Permite que equipas da Jynlo encontrem esta competição e peçam participação.</p>
      <p *ngIf="error" role="alert" class="error">{{error}}</p>
      <p *ngIf="notice" role="status">{{notice}}</p>
      <p *ngIf="loading">A carregar candidaturas…</p>
      <ng-container *ngIf="settingsLoaded">
        <p><strong>Pesquisa pública:</strong> {{open?'Candidaturas abertas':'Desativada'}}</p>
        <button type="button" [disabled]="busy" (click)="toggle()">
          {{open?'Fechar candidaturas':'Abrir candidaturas a equipas'}}
        </button>
        <h6>Pedidos recebidos</h6>
        <p *ngIf="!applications.length">Ainda não há pedidos de participação.</p>
        <article *ngFor="let application of applications" class="application-row">
          <strong>{{application.teamName}}</strong>
          <span>{{application.status==='PENDING'?'Pendente':
            application.status==='APPROVED'?'Aprovado':'Recusado'}}</span>
          <div *ngIf="application.status==='PENDING'" class="buttons">
            <button type="button" [disabled]="busy" (click)="decide(application.id,true)">Aprovar pedido</button>
            <button type="button" [disabled]="busy" (click)="decide(application.id,false)">Recusar pedido</button>
          </div>
          <app-global-team-enrollment *ngIf="application.status==='APPROVED'"
            [communityId]="communityId" [competitionId]="competitionId" [type]="type"
            [globalTeamId]="application.teamId"></app-global-team-enrollment>
        </article>
        <p class="fine">A aprovação confirma a candidatura. A inscrição e os jogadores continuam sujeitos às regras da competição.</p>
      </ng-container>
    </section>
  `,
  styles:[`
    .team-applications{border:1px solid #679e7866;border-radius:14px;padding:1rem;margin:1rem 0}
    .application-row{padding:.75rem 0;border-top:1px solid #679e7844;display:flex;gap:.7rem;align-items:center;flex-wrap:wrap}
    .buttons{display:flex;flex-wrap:wrap;gap:.5rem}button{border:1px solid #75bb8b;border-radius:8px;
       padding:.55rem .8rem;background:transparent;color:inherit;cursor:pointer}
    button:disabled{opacity:.5;cursor:default}.fine{font-size:.8rem;opacity:.8}.error{color:#f39494}
  `]
})
export class TeamCompetitionApplicationsComponent implements OnChanges {
  @Input({required:true}) communityId!:number;
  @Input({required:true}) competitionId!:number;
  @Input({required:true}) type!:TeamCompetitionKind;
  applications:TeamCompetitionApplication[]=[];
  settingsLoaded=false;open=false;busy=false;loading=false;error='';notice='';
  private revision=0;
  constructor(private readonly api:TeamCompetitionApplicationsService){}
  ngOnChanges():void{
    const version=++this.revision;this.settingsLoaded=false;this.loading=true;
    this.open=false;this.applications=[];this.error='';this.notice='';
    if(!this.communityId||!this.competitionId)return;
    this.api.settings(this.communityId,this.type,this.competitionId).subscribe({
      next:settings=>{
        if(version!==this.revision)return;
        this.open=settings.applicationsOpen;
        this.settingsLoaded=true;
        this.loadApplications(version);
      },
      error:()=>{if(version===this.revision){this.loading=false;this.error='Não foi possível obter a configuração de candidaturas.';}}
    });
  }
  private loadApplications(version:number):void{
    this.api.list(this.communityId,this.type,this.competitionId).subscribe({
      next:rows=>{if(version===this.revision){this.applications=rows;this.loading=false;}},
      error:()=>{if(version===this.revision){this.loading=false;this.error='Não foi possível carregar os pedidos.';}}
    });
  }
  toggle():void{
    if(this.busy||!this.settingsLoaded)return;
    const version=this.revision;this.busy=true;this.error='';this.notice='';
    this.api.configure(this.communityId,this.type,this.competitionId,!this.open).subscribe({
      next:updated=>{if(version===this.revision){this.open=updated.applicationsOpen;this.notice='Configuração guardada.';}this.busy=false;},
      error:()=>{if(version===this.revision)this.error='Não foi possível alterar as candidaturas. Verifica se a competição e comunidade são elegíveis.';this.busy=false;}
    });
  }
  decide(id:number,approve:boolean):void{
    if(this.busy)return;
    const version=this.revision;this.busy=true;this.error='';this.notice='';
    this.api.decide(id,approve).subscribe({
      next:updated=>{
        if(version===this.revision){
          this.applications=this.applications.map(row=>row.id===id?updated:row);
          this.notice=approve?'Pedido aprovado. Confirma depois a inscrição e o plantel.':'Pedido recusado.';
        }
        this.busy=false;
      },
      error:()=>{if(version===this.revision)this.error='Não foi possível confirmar a decisão. Atualiza o estado antes de repetir.';this.busy=false;}
    });
  }
}
