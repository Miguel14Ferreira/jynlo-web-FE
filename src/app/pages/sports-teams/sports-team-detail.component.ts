import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PublicTeamCommunity,TeamCommunityMembership,TeamCommunityMembershipsService } from '../../services/team-community-memberships.service';
import { SportsTeam, SportsTeamMember, SportsTeamsService, TeamCompetitionHistory, TeamChampionshipHonour } from '../../services/sports-teams.service';

@Component({
  standalone: true,
  selector: 'app-sports-team-detail',
  imports: [CommonModule, RouterLink, FormsModule],
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
      <section class="team-trophies"><h2>🏆 Troféus ({{trophies.length + championshipHonours.length}})</h2>
        <p *ngIf="historyLoading || honoursLoading">A carregar conquistas oficiais…</p>
        <p *ngIf="historyError" role="alert">{{historyError}}</p>
        <p *ngIf="honoursError" role="alert">{{honoursError}}</p>
        <p *ngIf="!historyLoading && !honoursLoading && !historyError && !honoursError && !trophies.length && !championshipHonours.length">Ainda não existem troféus oficiais nesta equipa.</p>
        <article *ngFor="let honour of championshipHonours" class="trophy">
          <strong>🏆 {{honour.competitionName}}</strong>
          <p>{{honour.championshipName}} · {{honour.seasonLabel}} · {{honour.communityName}}</p>
          <p>{{honour.format === 'LEAGUE' ? 'Liga' : honour.format === 'KNOCKOUT' ? 'Taça' : honour.format === 'CHAMPIONSHIP' ? 'Campeonato' : honour.format}} · {{honour.sport}}</p>
          <small>{{honour.awardedAt | date:'dd/MM/yyyy'}}</small>
        </article>
        <article *ngFor="let trophy of trophies" class="trophy">
          <strong>🏆 {{trophy.tournamentName}}</strong>
          <p>{{trophy.communityName}} · {{trophy.sport || 'Modalidade não indicada'}}</p>
          <small *ngIf="trophy.completedAt">{{trophy.completedAt | date:'dd/MM/yyyy'}}</small>
        </article>
      </section>
      <section><h2>Histórico de competições ({{history.length}})</h2>
        <p *ngIf="!historyLoading && !historyError && !history.length">Ainda não participou em torneios associados à equipa.</p>
        <p *ngFor="let entry of history">
          {{entry.tournamentName}} · {{entry.communityName}} —
          {{entry.champion ? '🏆 Campeão' : entry.archived ? 'Concluído' : 'Em curso'}}
        </p>
      </section>
      <section><h2>Competições</h2>
        <p>Encontra torneios e campeonatos com candidaturas abertas para esta equipa.</p>
        <a routerLink="/menu/teams/competitions" [queryParams]="{teamId: t.id}">Encontrar torneios e campeonatos</a>
      </section>
      <section><h2>Comunidades ({{activeCommunities.length}})</h2>
        <p *ngFor="let item of activeCommunities">{{item.communityName}}</p>
        <p *ngIf="!activeCommunities.length">Esta equipa ainda não está associada a comunidades.</p>
        <ng-container *ngIf="isOwner">
          <h3>Convites para comunidades</h3>
          <div *ngFor="let item of invitations">
            <p>{{item.communityName}}</p>
            <button type="button" [disabled]="busy" (click)="respond(item.id,true)">Aceitar</button>
            <button type="button" [disabled]="busy" (click)="respond(item.id,false)">Recusar</button>
          </div>
          <p *ngIf="feedback" role="status">{{feedback}}</p>
          <h3>Encontrar comunidades</h3>
          <p>Pesquisa comunidades públicas e pede adesão em nome desta equipa.</p>
          <div class="search-community">
            <input [(ngModel)]="communityQuery" maxlength="100" placeholder="Pesquisar comunidade"/>
            <button type="button" [disabled]="busy" (click)="searchCommunities()">Pesquisar</button>
          </div>
          <div *ngFor="let candidate of communityResults">
            <strong>{{candidate.name}}</strong> · {{candidate.sport||'Várias modalidades'}}
            <button type="button" [disabled]="busy || hasCommunity(candidate.id)"
              (click)="requestCommunity(candidate.id)">
              {{hasCommunity(candidate.id)?'Pedido existente':'Pedir adesão'}}
            </button>
          </div>
        </ng-container>
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
    .trophy{padding:.75rem;margin:.5rem 0;border:1px solid #a68f554d;border-radius:10px}
    .trophy p{margin:.4rem 0}
    .search-community{display:flex;gap:.5rem;flex-wrap:wrap}
    .search-community input{min-width:150px;flex:1;padding:.65rem;border:1px solid #6d8e7b;border-radius:8px;background:transparent;color:inherit}
    button{padding:.45rem .7rem;margin:.25rem;border:1px solid #6d9e7b;border-radius:8px;background:transparent;color:inherit;cursor:pointer}
    button:disabled{opacity:.5}
  `]
})
export class SportsTeamDetailComponent implements OnInit {
  team: SportsTeam | null = null;
  members: SportsTeamMember[] = [];
  history: TeamCompetitionHistory[] = [];
  historyLoading = false;
  historyError = '';
  championshipHonours: TeamChampionshipHonour[] = [];
  honoursLoading = false;
  honoursError = '';
  /** A tournament linked to a closed season is one trophy, not two. */
  get trophies(): TeamCompetitionHistory[] {
    const awardedInSeason = new Set(this.championshipHonours
      .filter(item => item.tournamentId !== null).map(item => item.tournamentId));
    return this.history.filter(item => item.champion && !awardedInSeason.has(item.tournamentId));
  }
  communities:TeamCommunityMembership[]=[];
  communityQuery='';communityResults:PublicTeamCommunity[]=[];
  isOwner=false;busy=false;feedback='';
  get activeCommunities(){return this.communities.filter(item=>item.status==='ACTIVE');}
  get invitations(){return this.communities.filter(item=>item.status==='PENDING_TEAM');}
  hasCommunity(id:number):boolean{return this.communities.some(item=>item.communityId===id&&item.status!=='DECLINED');}
  searchCommunities():void{
    if(!this.isOwner||this.busy)return;
    this.busy=true;this.feedback='';
    this.communityMemberships.discover(this.communityQuery).subscribe({
      next:items=>{this.communityResults=items;this.busy=false;},
      error:()=>{this.feedback='Não foi possível pesquisar comunidades.';this.busy=false;}
    });
  }
  requestCommunity(communityId:number):void{
    if(!this.team||!this.isOwner||this.busy||this.hasCommunity(communityId))return;
    this.busy=true;this.feedback='';
    this.communityMemberships.request(this.team.id,communityId).subscribe({
      next:()=>{this.busy=false;this.feedback='Pedido enviado aos responsáveis da comunidade.';this.loadCommunities();},
      error:()=>{this.busy=false;this.feedback='Não foi possível pedir adesão. Confirma o estado do pedido.';}
    });
  }
  error = '';
  constructor(private readonly route: ActivatedRoute, private readonly api: SportsTeamsService,
    private readonly communityMemberships:TeamCommunityMembershipsService) {}
  respond(id:number,accept:boolean):void{
    if(this.busy||!this.isOwner)return;
    this.busy=true;this.feedback='';
    this.communityMemberships.respond(id,accept).subscribe({
      next:()=>{this.busy=false;this.feedback=accept?'Convite aceite.':'Convite recusado.';this.loadCommunities();},
      error:()=>{this.busy=false;this.feedback='Não foi possível responder ao convite.';}
    });
  }
  loadCommunities():void{
    if(!this.team)return;
    this.communityMemberships.teamCommunities(this.team.id).subscribe({
      next:rows=>this.communities=rows,error:()=>this.communities=[]
    });
  }
  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isSafeInteger(id) || id <= 0) {this.error = 'Equipa inválida.'; return;}
    this.api.detail(id).subscribe({
      next: team => {
        this.team = team;
        this.api.mine().subscribe({next:owned=>this.isOwner=owned.some(x=>x.id===team.id),error:()=>this.isOwner=false});
        this.loadCommunities();
        this.historyLoading = true;
        this.honoursLoading = true;
        this.api.honours(team.id).subscribe({
          next: awards => {this.championshipHonours = awards; this.honoursLoading = false;},
          error: () => {this.honoursError = 'Não foi possível carregar os títulos dos campeonatos.'; this.honoursLoading = false;}
        });
        this.api.history(team.id).subscribe({
          next: entries => {this.history = entries; this.historyLoading = false;},
          error: () => {this.historyError = 'Não foi possível carregar o histórico de troféus.'; this.historyLoading = false;}
        });
        this.api.members(team.id).subscribe({next: players => this.members = players, error: () => this.members = []});
      },
      error: () => this.error = 'Não foi possível encontrar esta equipa.'
    });
  }
}
