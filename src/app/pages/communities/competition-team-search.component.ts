import { CommonModule } from '@angular/common';
import { GlobalTeamEnrollmentComponent } from './global-team-enrollment.component';
import { Component, Input, OnChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { SportsTeam, SportsTeamsService } from '../../services/sports-teams.service';
import { TeamCommunityMembership,TeamCommunityMembershipsService } from '../../services/team-community-memberships.service';
import { CompetitionTeamInvitation, CompetitionTeamInvitationType,
  TeamCompetitionInvitationsService } from '../../services/team-competition-invitations.service';

@Component({
  standalone: true,
  selector: 'app-competition-team-search',
  imports: [CommonModule, FormsModule, GlobalTeamEnrollmentComponent],
  template: `
    <div class="search-teams">
      <button type="button" class="search-toggle" (click)="open = !open"
              [attr.aria-expanded]="open">
        {{ open ? 'Fechar pesquisa' : 'Pesquisar equipa' }}
      </button>
      <div *ngIf="open" class="search-content">
        <p>Encontra uma equipa existente na Jynlo e convida o seu responsável.</p>
        <h4>Equipas da comunidade</h4>
        <p *ngIf="!associated.length">Ainda não há equipas associadas.</p>
        <ul><li *ngFor="let team of associated">
          <strong>{{team.teamName}}</strong>
          <span *ngIf="invitationFor(team.teamId) as invitation">Convite: {{invitation.status}}
            <app-global-team-enrollment *ngIf="invitation.status==='ACCEPTED'"
              [communityId]="communityId" [competitionId]="competitionId" [type]="type"
              [globalTeamId]="team.teamId"></app-global-team-enrollment>
          </span>
          <button type="button" *ngIf="!invitationFor(team.teamId)" [disabled]="busy"
            (click)="invite(team.teamId)">Convidar para a competição</button>
        </li></ul>
        <h4>Outras equipas da Jynlo</h4>
        <label [for]="'team-query-' + type + '-' + competitionId">Nome da equipa</label>
        <div class="search-row">
          <input [id]="'team-query-' + type + '-' + competitionId"
                 [(ngModel)]="query" maxlength="100"
                 (keyup.enter)="search()" placeholder="Pesquisar equipa…" />
          <button type="button" (click)="search()" [disabled]="busy || !query.trim()">Pesquisar</button>
        </div>
        <p *ngIf="error" role="alert" class="error">{{ error }}</p>
        <p *ngIf="notice" role="status">{{ notice }}</p>
        <p *ngIf="busy" aria-live="polite">A processar…</p>
        <ul *ngIf="!busy">
          <li *ngFor="let team of results">
            <div><strong>{{ team.name }}</strong>
              <small>{{ team.sport || 'Várias modalidades' }} · {{ team.location || 'Sem localização' }}</small>
            </div>
            <span *ngIf="invitationFor(team.id) as invited">Convite: {{ invited.status === 'PENDING' ? 'pendente' : invited.status === 'ACCEPTED' ? 'aceite' : 'recusado' }}
              <app-global-team-enrollment *ngIf="invited.status==='ACCEPTED'"
                [communityId]="communityId" [competitionId]="competitionId" [type]="type"
                [globalTeamId]="team.id"></app-global-team-enrollment>
            </span>
            <button *ngIf="!invitationFor(team.id)" type="button" (click)="invite(team.id)">Convidar equipa</button>
          </li>
        </ul>
        <p *ngIf="searched && !busy && results.length === 0">Não foram encontradas equipas.</p>
        <p class="hint">O convite não inscreve automaticamente a equipa nem os seus jogadores.
          Após a aceitação, o organizador confirma a participação na competição.</p>
      </div>
    </div>
  `,
  styles: [`
    .search-teams{margin:.75rem 0;padding:.85rem;border:1px solid #809b8066;border-radius:12px}
    .search-toggle,.search-row button,li button{background:#78e979;color:#102315;border:0;
      padding:.65rem 1rem;border-radius:9px;font-weight:700;cursor:pointer}
    .search-toggle:disabled,button:disabled{opacity:.6;cursor:default}
    .search-content{padding:.8rem 0}.search-row{display:flex;flex-wrap:wrap;gap:.5rem;margin:.5rem 0}
    input{flex:1;min-width:150px;padding:.7rem;border-radius:9px;border:1px solid #72917f;
      background:transparent;color:inherit}
    ul{list-style:none;padding:0}li{display:flex;justify-content:space-between;align-items:center;
      flex-wrap:wrap;gap:.5rem;padding:.8rem 0;border-bottom:1px solid #84978842}
    small{display:block;opacity:.75}.error{color:#e88a8a}.hint{font-size:.85rem;opacity:.8}
  `]
})
export class CompetitionTeamSearchComponent implements OnChanges {
  @Input({required:true}) communityId!: number;
  @Input({required:true}) competitionId!: number;
  @Input({required:true}) type!: CompetitionTeamInvitationType;
  open = false;
  query = '';
  searched = false;
  busy = false;
  error = '';
  notice = '';
  results: SportsTeam[] = [];
  associated:TeamCommunityMembership[]=[];
  invitations: CompetitionTeamInvitation[] = [];
  private revision = 0;

  constructor(private readonly teams: SportsTeamsService,
              private readonly invites: TeamCompetitionInvitationsService,
              private readonly communityMemberships:TeamCommunityMembershipsService) {}

  ngOnChanges(): void {
    ++this.revision;
    this.open = false;
    this.query = '';
    this.results = [];
    this.associated=[];
    this.invitations = [];
    this.searched = false;
    const rev = this.revision;
    if (this.communityId > 0 && this.competitionId > 0) {
      this.communityMemberships.communityTeams(this.communityId).subscribe({
        next:rows=>{if(this.revision===rev)this.associated=rows.filter(m=>m.status==='ACTIVE');},
        error:()=>{if(this.revision===rev)this.associated=[];}
      });
      this.invites.list(this.communityId, this.type, this.competitionId).subscribe({
        next: rows => {if (this.revision === rev) this.invitations = rows;},
        error: () => { /* Search can still be used even if invitation history is unavailable. */ }
      });
    }
  }

  invitationFor(id: number): CompetitionTeamInvitation | undefined {
    return this.invitations.find(item => item.teamId === id);
  }

  search(): void {
    if (!this.query.trim() || this.busy) return;
    const rev = ++this.revision;
    this.busy = true;
    this.error = '';
    this.notice = '';
    this.teams.discover(this.query).pipe(finalize(() => {
      if (this.revision === rev) this.busy = false;
    })).subscribe({
      next: rows => {
        if (this.revision !== rev) return;
        this.results = rows;
        this.searched = true;
      },
      error: () => {if (this.revision === rev) this.error = 'Não foi possível pesquisar equipas.';}
    });
  }

  invite(teamId: number): void {
    if (this.busy || this.invitationFor(teamId)) return;
    const rev = ++this.revision;
    this.busy = true;
    this.error = '';
    this.notice = '';
    this.invites.invite(this.communityId, this.type, this.competitionId, teamId)
      .pipe(finalize(() => {if (this.revision === rev) this.busy = false;}))
      .subscribe({
        next: invitation => {
          if (this.revision !== rev) return;
          this.invitations = [...this.invitations, invitation];
          this.notice = 'Convite registado. O responsável poderá responder na área de equipas.';
        },
        error: () => {
          if (this.revision === rev)
            this.error = 'Não foi possível enviar o convite. Confirma se já existe outro pedido.';
        }
      });
  }
}
