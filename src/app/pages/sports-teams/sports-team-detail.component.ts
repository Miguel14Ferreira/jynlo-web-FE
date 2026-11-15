import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SportsTeam, SportsTeamMember, SportsTeamsService } from '../../services/sports-teams.service';

@Component({
  standalone: true,
  selector: 'app-sports-team-detail',
  imports: [CommonModule, RouterLink],
  template: `
  <main class="team-detail" *ngIf="team as t; else state">
    <a routerLink="/menu/teams">← Equipas</a>
    <div class="team-hero">
      <p>JYNLO · EQUIPA</p>
      <h1>{{ t.name }}</h1>
      <p>{{ t.sport || 'Modalidade não indicada' }} · {{ t.location || 'Localização não indicada' }}</p>
      <p *ngIf="t.description">{{ t.description }}</p>
    </div>
    <div class="team-grid">
      <section><h2>Plantel ({{ members.length }})</h2>
        <p *ngFor="let player of members">{{ player.username }} · {{ player.role === 'OWNER' ? 'Responsável' : 'Jogador' }}</p>
        <p *ngIf="members.length === 0">A carregar plantel ou sem jogadores disponíveis.</p>
      </section>
      <section><h2>Competições</h2>
        <p>Encontra torneios e campeonatos com candidaturas abertas para esta equipa.</p>
        <a routerLink="/menu/teams/competitions" [queryParams]="{teamId: t.id}">Encontrar torneios e campeonatos</a>
      </section>
      <section><h2>Feed</h2><p>{{ t.feedEnabled ? 'Feed ativado. A publicação para equipas está em desenvolvimento.' : 'Desativado pelo responsável da equipa.' }}</p></section>
      <section><h2>Chat</h2><p>{{ t.chatEnabled ? 'Chat ativado. O acesso ficará disponível após a ligação aos membros da equipa.' : 'Desativado pelo responsável da equipa.' }}</p></section>
    </div>
  </main>
  <ng-template #state><main class="team-detail"><p role="alert">{{ error || 'A carregar equipa…' }}</p></main></ng-template>
  `,
  styles: [`
    .team-detail{max-width:980px;margin:2rem auto;padding:0 1rem;color:inherit}
    .team-hero{padding:2rem;background:linear-gradient(130deg,#1e4034,#11201d);border-radius:18px;color:white;margin:1rem 0}
    .team-hero>p:first-child{color:#96fa89;font-size:.8rem;letter-spacing:.15em}
    .team-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:1rem}
    .team-grid section{padding:1.25rem;border:1px solid #6c968044;border-radius:14px}
    h2{font-size:1.1rem}
  `]
})
export class SportsTeamDetailComponent implements OnInit {
  team: SportsTeam | null = null;
  members: SportsTeamMember[] = [];
  error = '';
  constructor(private readonly route: ActivatedRoute, private readonly api: SportsTeamsService) {}
  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isSafeInteger(id) || id <= 0) {this.error = 'Equipa inválida.'; return;}
    this.api.detail(id).subscribe({
      next: team => {
        this.team = team;
        this.api.members(team.id).subscribe({next: players => this.members = players, error: () => this.members = []});
      },
      error: () => this.error = 'Não foi possível encontrar esta equipa.'
    });
  }
}
