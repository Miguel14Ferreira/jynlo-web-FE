import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SportsTeam, SportsTeamsService } from '../../services/sports-teams.service';
import { CompetitionTeamInvitation, TeamCompetitionInvitationsService } from '../../services/team-competition-invitations.service';

@Component({
  selector: 'app-sports-teams',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="teams-directory">
      <header>
        <p class="eyebrow">JYNLO · EQUIPAS</p>
        <h1>Encontra a tua equipa</h1>
        <p>Cria uma identidade para a tua equipa e participa em diferentes comunidades e competições.</p>
        <a class="create-team-cta" href="#criar-equipa">+ Criar equipa</a>
        <a class="create-team-cta" routerLink="/menu/teams/competitions" style="margin-left:.6rem">Encontrar torneios</a>
      </header>

      <section class="team-panel" *ngIf="invitations.length" aria-label="Convites para competições">
        <h2>Convites para as tuas equipas</h2>
        <p>O responsável pode aceitar ou recusar. Aceitar não inscreve automaticamente os jogadores.</p>
        <article *ngFor="let invitation of invitations" class="team-invitation">
          <strong>{{ invitation.teamName }}</strong>
          <p>{{ invitation.competitionType === 'TOURNAMENT' ? 'Torneio' : 'Campeonato' }} ·
             {{ invitation.status === 'PENDING' ? 'Pendente' : invitation.status === 'ACCEPTED' ? 'Aceite' : 'Recusado' }}</p>
          <div *ngIf="invitation.status === 'PENDING'" class="inline-fields">
            <button type="button" (click)="respond(invitation.id, true)" [disabled]="responding">Aceitar convite</button>
            <button type="button" (click)="respond(invitation.id, false)" [disabled]="responding">Recusar convite</button>
          </div>
        </article>
      </section>

      <section class="team-panel" aria-label="Pesquisar equipas">
        <label for="team-search">Procurar equipas</label>
        <div class="inline-fields">
          <input id="team-search" type="search" [(ngModel)]="query" maxlength="100"
                 placeholder="Nome da equipa" (keyup.enter)="search()" />
          <button type="button" (click)="search()" [disabled]="loading">Pesquisar</button>
        </div>
      </section>

      <section id="criar-equipa" class="team-panel" aria-label="Criar equipa">
        <h2>Criar uma equipa</h2>
        <p>O feed e o chat ficam desligados até o responsável decidir ativá-los.</p>
        <form (ngSubmit)="create()" #teamForm="ngForm">
          <div class="inline-fields">
            <label>Nome <input name="name" [(ngModel)]="draft.name" required maxlength="100" /></label>
            <label>Modalidade <input name="sport" [(ngModel)]="draft.sport" maxlength="100" /></label>
            <label>Localização <input name="location" [(ngModel)]="draft.location" maxlength="100" /></label>
          </div>
          <label>Descrição <textarea name="description" [(ngModel)]="draft.description" maxlength="500"></textarea></label>
          <button type="submit" [disabled]="saving || teamForm.invalid">Criar equipa</button>
        </form>
      </section>

      <section class="team-panel" aria-label="As minhas equipas">
        <h2>As minhas equipas</h2>
        <p *ngIf="mineLoading">A carregar as tuas equipas…</p>
        <p *ngIf="!mineLoading && !mine.length">Ainda não administras nenhuma equipa.</p>
        <ul *ngIf="mine.length">
          <li *ngFor="let team of mine"><a [routerLink]="['/menu/teams', team.id]">{{team.name}}</a></li>
        </ul>
      </section>

      <p class="error" role="alert" *ngIf="error">{{ error }}</p>
      <p aria-live="polite" *ngIf="loading">A procurar equipas…</p>
      <section class="team-cards" aria-label="Resultados da pesquisa">
        <article *ngFor="let team of teams" class="team-panel">
          <div class="team-icon" aria-hidden="true">⚽</div>
          <div>
            <h2><a [routerLink]="['/menu/teams',team.id]">{{ team.name }}</a></h2>
            <p>{{ team.sport || 'Várias modalidades' }} · {{ team.location || 'Localização não indicada' }}</p>
            <p *ngIf="team.description">{{ team.description }}</p>
          </div>
        </article>
        <p *ngIf="!loading && !error && teams.length === 0">Ainda não foram encontradas equipas.</p>
      </section>
    </main>
  `,
  styles: [`
    .teams-directory {max-width:1000px;margin:2rem auto;padding:0 1rem;color:inherit}
    .eyebrow {font-size:.8rem;letter-spacing:.12em;color:#68cf72;font-weight:700}
    header h1 {font-size:clamp(1.7rem,4vw,2.5rem)}
    .team-panel {background:var(--card-bg,#182221);border:1px solid #4c666052;border-radius:16px;padding:1.25rem;margin:1rem 0}
    .inline-fields {display:flex;flex-wrap:wrap;gap:.75rem;align-items:end}
    label {display:flex;flex-direction:column;gap:.35rem;flex:1 1 180px}
    input,textarea {width:100%;background:transparent;color:inherit;padding:.7rem;border:1px solid #6d8a82;border-radius:9px}
    textarea {min-height:4rem}
    button {background:#76eb70;color:#08120b;font-weight:700;border:0;border-radius:9px;padding:.75rem 1rem;cursor:pointer}
    button:disabled {opacity:.55;cursor:not-allowed}
    .team-cards article {display:flex;gap:1rem;align-items:center}
    .create-team-cta {display:inline-block;margin-top:.75rem;padding:.75rem 1.1rem;border-radius:10px;background:#76eb70;color:#08120b;font-weight:800;text-decoration:none}
    .team-icon {font-size:2rem}
    .team-invitation{border-bottom:1px solid #839a8355;padding:1rem 0}
    a {color:inherit}
    .error {color:#e88b8b}
  `]
})
export class SportsTeamsComponent implements OnInit {
  query = '';
  teams: SportsTeam[] = [];
  mine: SportsTeam[] = [];
  mineLoading = false;
  invitations: CompetitionTeamInvitation[] = [];
  responding = false;
  draft = {name: '', sport: '', location: '', description: ''};
  saving = false;
  loading = false;
  error = '';

  constructor(private readonly api: SportsTeamsService,
              private readonly competitionInvites: TeamCompetitionInvitationsService) {}
  ngOnInit(): void { this.search(); this.loadInvitations(); this.loadMine(); }

  loadMine(): void {
    this.mineLoading = true;
    this.api.mine().subscribe({
      next: teams => {this.mine = teams; this.mineLoading = false;},
      error: () => {this.mine = []; this.mineLoading = false;}
    });
  }

  loadInvitations(): void {
    this.competitionInvites.mine().subscribe({
      next: rows => this.invitations = rows,
      error: () => this.invitations = []
    });
  }

  respond(id: number, accept: boolean): void {
    if (this.responding) return;
    this.responding = true;
    this.error = '';
    this.competitionInvites.respond(id, accept).subscribe({
      next: () => {this.responding = false; this.loadInvitations();},
      error: () => {this.responding = false; this.error = 'Não foi possível responder ao convite. Confirma o estado antes de repetir.';}
    });
  }

  search(): void {
    this.loading = true;
    this.error = '';
    this.api.discover(this.query).subscribe({
      next: data => { this.teams = data; this.loading = false; },
      error: () => { this.error = 'Não foi possível carregar equipas.'; this.loading = false; }
    });
  }

  create(): void {
    if (this.saving || !this.draft.name.trim()) return;
    this.saving = true;
    this.error = '';
    this.api.create(this.draft).subscribe({
      next: () => {
        this.saving = false;
        this.draft = {name: '', sport: '', location: '', description: ''};
        this.search();
        this.loadMine();
      },
      error: () => { this.saving = false; this.error = 'Não foi possível criar a equipa. Confirma que tens sessão iniciada.'; }
    });
  }
}
