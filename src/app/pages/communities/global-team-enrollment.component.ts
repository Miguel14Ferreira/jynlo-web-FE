import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate } from '../../i18n/i18n.service';
import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { TeamCompetitionEnrollmentsService,GlobalTeamCompetitionEntry,
 GlobalTeamRosterCandidate,EnrollmentCompetitionType } from '../../services/team-competition-enrollments.service';

@Component({
  standalone:true,
  selector:'app-global-team-enrollment',
  imports:[TranslatePipe, CommonModule],
  template:`
    <section class="enrollment">
      <p *ngIf="error" role="alert">{{error}}</p>
      <p *ngIf="notice" role="status">{{notice}}</p>
      <ng-container *ngIf="!entry">
        <button type="button" [disabled]="busy" (click)="finalize()">
          {{ 'Finalizar inscrição da equipa' | t }}
        </button>
        <small>{{ 'Cria a entrada nesta prova sem registar jogadores. Apenas após consentimento do capitão.' | t }}</small>
      </ng-container>
      <ng-container *ngIf="entry">
        <strong>{{ '{{name}} — Inscrição criada' | t:{name: (entry.name)} }}</strong>
        <p>{{ 'A equipa mantém a sua identidade global. Escolhe jogadores do plantel confirmado para convidar.' | t }}</p>
        <button type="button" [disabled]="busy" (click)="loadRoster()">{{ 'Consultar plantel' | t }}</button>
        <div *ngFor="let person of roster">
          <label><input type="checkbox" [checked]="selected.has(person.profileId)"
                        [disabled]="busy||!person.communityMember"
                        (change)="select(person.profileId,$any($event.target).checked)"/>
            {{person.username}}</label>
          <small *ngIf="!person.communityMember">{{ 'Precisa de aderir individualmente à comunidade.' | t }}</small>
        </div>
        <button type="button" *ngIf="roster.length" [disabled]="busy||!selected.size"
                (click)="inviteSelected()">{{ 'Convidar {{size}} jogadores' | t:{size: (selected.size)} }}</button>
      </ng-container>
    </section>
  `,
  styles:[`
    .enrollment{border:1px solid #749d7a66;padding:.7rem;margin:.6rem 0;border-radius:10px}
    button{padding:.6rem .8rem;border:1px solid #77ab83;border-radius:8px;color:inherit;background:transparent;cursor:pointer}
    button:disabled{opacity:.5;cursor:default}p[role=alert]{color:#eb9696}
    small{font-size:.8rem;opacity:.75;display:block;margin:.35rem 0}
    label{display:block;padding:.4rem 0}
  `]
})
export class GlobalTeamEnrollmentComponent implements OnChanges {
  @Input({required:true}) communityId!:number;
  @Input({required:true}) competitionId!:number;
  @Input({required:true}) type!:EnrollmentCompetitionType;
  @Input({required:true}) globalTeamId!:number;
  busy=false;error='';notice='';
  entry:GlobalTeamCompetitionEntry|null=null;
  roster:GlobalTeamRosterCandidate[]=[];
  selected=new Set<number>();
  private generation=0;
  constructor(private readonly api:TeamCompetitionEnrollmentsService){}
  ngOnChanges():void{
    const generation=++this.generation;
    this.entry=null;this.roster=[];this.selected.clear();this.error='';this.notice='';
    if(!this.communityId||!this.competitionId||!this.globalTeamId)return;
    this.api.existing(this.communityId,this.type,this.competitionId,this.globalTeamId).subscribe({
      next:entry=>{if(generation===this.generation)this.entry=entry;},
      error:()=>{ /* No enrollment yet: keep the create action visible. */ }
    });
  }
  finalize():void{
    if(this.busy||this.entry||!this.globalTeamId)return;
    const generation=this.generation;
    this.busy=true;this.error='';this.notice='';
    this.api.finalize(this.communityId,this.type,this.competitionId,this.globalTeamId).subscribe({
      next:entry=>{if(generation===this.generation){
        this.entry=entry;this.notice=appTranslate('Equipa inscrita. Agora convida os jogadores.');
        this.busy=false;this.loadRoster();
      }},
      error:()=>{if(generation===this.generation){
        this.error=appTranslate('Não foi possível finalizar. Confirma se a equipa já foi inscrita, se a prova está em preparação e se o convite foi aceite.');
        this.busy=false;
      }}
    });
  }
  loadRoster():void{
    if(this.busy)return;
    const generation=this.generation;this.busy=true;this.error='';
    this.api.roster(this.communityId,this.type,this.competitionId,this.globalTeamId).subscribe({
      next:players=>{if(generation===this.generation){this.roster=players;this.busy=false;}},
      error:()=>{if(generation===this.generation){this.busy=false;this.error=appTranslate('Não foi possível carregar os jogadores.');}}
    });
  }
  select(profileId:number,checked:boolean):void{
    if(checked)this.selected.add(profileId);else this.selected.delete(profileId);
    this.selected=new Set(this.selected);
  }
  inviteSelected():void{
    if(!this.entry||!this.selected.size||this.busy)return;
    const generation=this.generation;this.busy=true;this.error='';this.notice='';
    this.api.invitePlayers(this.communityId,this.type,this.competitionId,
      this.globalTeamId,[...this.selected]).subscribe({
      next:result=>{if(generation===this.generation){
        this.notice=appTranslate('{{n}} convites enviados. Cada jogador deve aceitar.',{n:result.invitationsSent});
        this.selected.clear();this.selected=new Set();this.busy=false;
      }},
      error:()=>{if(generation===this.generation){
        this.error=appTranslate('Não foi possível enviar os convites. Verifica a elegibilidade e os convites já existentes.');
        this.busy=false;
      }}
    });
  }
}
