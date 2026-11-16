import { CommonModule } from '@angular/common';
import { AuthenticationService } from '../../services/authethication.service';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PublicTeamCommunity,TeamCommunityMembership,TeamCommunityMembershipsService } from '../../services/team-community-memberships.service';
import { SportsTeam, SportsTeamMember, SportsTeamsService, SportsTeamPlayerCandidate, TeamCompetitionHistory, TeamChampionshipHonour } from '../../services/sports-teams.service';
import { SportsTeamContentComponent } from './sports-team-content.component';

@Component({
  standalone: true,
  selector: 'app-sports-team-detail',
  imports: [CommonModule, RouterLink, FormsModule, SportsTeamContentComponent],
  template: `
  <main class="team-detail" *ngIf="team as t; else state">
    <a class="team-back" routerLink="/menu/teams">← Voltar às equipas</a>
    <div class="team-hero">
      <p class="team-eyebrow">JYNLO · EQUIPA DESPORTIVA</p>
      <div class="team-hero-main">
        <span class="team-hero-crest" aria-hidden="true">{{ (t.name || 'E').charAt(0).toUpperCase() }}</span>
        <div>
          <h1>{{ t.name }}</h1>
          <p class="team-hero-meta">{{ t.sport || 'Várias modalidades' }} · {{ t.location || 'Localização por definir' }}</p>
          <p *ngIf="t.description">{{ t.description }}</p>
        </div>
      </div>
      <div class="team-hero-stats">
        <span><strong>{{rosterVerified ? members.length : '—'}}</strong> Jogadores</span>
        <span><strong>{{communitiesVerified ? activeCommunities.length : '—'}}</strong> Comunidades</span>
        <span><strong>{{trophies.length + championshipHonours.length}}</strong> Troféus</span>
        <a routerLink="/menu/teams/competitions" [queryParams]="{teamId:t.id}">Explorar competições →</a>
      </div>
    </div>
    <nav class="team-tabs" role="tablist" aria-label="Secções da equipa">
      <button type="button" role="tab" [attr.aria-selected]="activeTab === 'OVERVIEW'"
        [class.selected]="activeTab === 'OVERVIEW'" (click)="activeTab = 'OVERVIEW'">Visão geral</button>
      <button type="button" role="tab" [attr.aria-selected]="activeTab === 'TROPHIES'"
        [class.selected]="activeTab === 'TROPHIES'" (click)="activeTab = 'TROPHIES'">
        🏆 Troféus ({{trophies.length + championshipHonours.length}})
      </button>
      <button type="button" role="tab" [attr.aria-selected]="activeTab === 'FEED'"
        [class.selected]="activeTab === 'FEED'" (click)="activeTab = 'FEED'">Publicações</button>
      <button type="button" role="tab" [attr.aria-selected]="activeTab === 'CHAT'"
        [class.selected]="activeTab === 'CHAT'" (click)="activeTab = 'CHAT'">Mensagens</button>
    </nav>
    <p *ngIf="feedback" role="status" class="team-feedback">{{feedback}}</p>
    <div class="team-grid" role="tabpanel">
      <section *ngIf="activeTab === 'OVERVIEW'"><h2>Plantel ({{ rosterVerified ? members.length : '—' }})</h2>
        <p *ngIf="!rosterVerified" role="alert">Não foi possível confirmar o plantel. As opções de gestão estão temporariamente bloqueadas.</p>
        <div class="team-roster" *ngIf="rosterVerified && members.length">
          <div class="team-member" *ngFor="let player of members">
            <span class="team-member-avatar" aria-hidden="true">{{ (player.username || 'J').charAt(0).toUpperCase() }}</span>
            <div class="team-member-identity"><a [routerLink]="['/menu/perfis',player.username]">@{{player.username}}</a><small>{{player.role === 'OWNER' ? 'Responsável' : 'Jogador'}}</small></div>
            <button *ngIf="isOwner && player.role !== 'OWNER'" type="button" [disabled]="busy || !rosterVerified" (click)="removePlayer(player)">Remover</button>
          </div>
        </div>
        <p *ngIf="rosterVerified && members.length === 0">Ainda não existem jogadores no plantel.</p>
        <div *ngIf="isOwner && rosterVerified" class="team-player-search">
          <h3>Convidar jogadores</h3>
          <div class="search-community"><input [(ngModel)]="playerQuery" maxlength="80" placeholder="Nome ou utilizador" (keyup.enter)="searchPlayers()"/>
            <button type="button" [disabled]="busy || searchingPlayers || playerQuery.trim().length < 2" (click)="searchPlayers()">{{ searchingPlayers ? 'A procurar…' : 'Pesquisar jogadores' }}</button></div>
          <p *ngIf="playerSearchComplete && availablePlayers.length === 0">Não encontrámos novos jogadores com essa pesquisa.</p>
          <div *ngFor="let candidate of availablePlayers" class="team-candidate">
            <a [routerLink]="['/menu/perfis',candidate.username]">{{ candidate.fullName || candidate.username }} · @{{candidate.username}}</a>
            <button type="button" [disabled]="busy" (click)="invitePlayer(candidate)">Convidar</button>
          </div>
        </div>
      </section>
      <section *ngIf="activeTab === 'TROPHIES'" class="team-trophies"><h2>🏆 Troféus ({{trophies.length + championshipHonours.length}})</h2>
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
      <section *ngIf="activeTab === 'TROPHIES'"><h2>Histórico de competições ({{history.length}})</h2>
        <p *ngIf="!historyLoading && !historyError && !history.length">Ainda não participou em torneios associados à equipa.</p>
        <p *ngFor="let entry of history"><a [routerLink]="['/menu/communities',entry.communityId]">{{entry.tournamentName}}</a> · {{entry.communityName}} — {{entry.champion ? '🏆 Campeão' : entry.archived ? 'Concluído' : 'Em curso'}}</p>
      </section>
      <section *ngIf="activeTab === 'OVERVIEW'"><h2>Competições</h2>
        <p>Encontra torneios e campeonatos com candidaturas abertas para esta equipa.</p>
        <a routerLink="/menu/teams/competitions" [queryParams]="{teamId: t.id}">Encontrar torneios e campeonatos</a>
      </section>
      <section *ngIf="activeTab === 'OVERVIEW'"><h2>Comunidades ({{activeCommunities.length}})</h2>
        <p *ngFor="let item of activeCommunities"><a [routerLink]="['/menu/communities',item.communityId]">{{item.communityName}} →</a></p>
        <p *ngIf="!communitiesVerified" role="alert">Não foi possível confirmar as comunidades. Atualiza a página antes de gerir convites.</p>
        <p *ngIf="communitiesVerified && !activeCommunities.length">Esta equipa ainda não está associada a comunidades.</p>
        <ng-container *ngIf="isOwner && communitiesVerified">
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
      <section *ngIf="activeTab === 'FEED'" class="team-feature">
        <h2>Feed</h2>
        <button *ngIf="isOwner" type="button" [disabled]="featureSaving"
          (click)="toggleFeature('feedEnabled')">{{ t.feedEnabled ? 'Desativar feed' : 'Ativar feed' }}</button>
        <p *ngIf="!t.feedEnabled">Desativado pelo responsável da equipa.</p>
        <app-sports-team-content *ngIf="t.feedEnabled && rosterVerified && isMember" [teamId]="t.id" kind="feed"></app-sports-team-content>
        <p *ngIf="t.feedEnabled && (!rosterVerified || !isMember)">Disponível apenas para membros confirmados da equipa.</p>
      </section>
      <section *ngIf="activeTab === 'CHAT'" class="team-feature">
        <h2>Chat</h2>
        <button *ngIf="isOwner" type="button" [disabled]="featureSaving"
          (click)="toggleFeature('chatEnabled')">{{ t.chatEnabled ? 'Desativar chat' : 'Ativar chat' }}</button>
        <p *ngIf="!t.chatEnabled">Desativado pelo responsável da equipa.</p>
        <app-sports-team-content *ngIf="t.chatEnabled && rosterVerified && isMember" [teamId]="t.id" kind="chat"></app-sports-team-content>
        <p *ngIf="t.chatEnabled && (!rosterVerified || !isMember)">Disponível apenas para membros confirmados da equipa.</p>
      </section>
    </div>
  </main>
  <ng-template #state><main class="team-detail"><p role="alert">{{ error || 'A carregar equipa…' }}</p><a routerLink="/menu/teams">Voltar às equipas</a></main></ng-template>
  `,
  styleUrls: ['./sports-team-detail.component.css']
})
export class SportsTeamDetailComponent implements OnInit {
  team: SportsTeam | null = null;
  activeTab: 'OVERVIEW' | 'TROPHIES' | 'FEED' | 'CHAT' = 'OVERVIEW';
  members: SportsTeamMember[] = [];
  rosterVerified=false;communitiesVerified=false;isMember=false;
  playerQuery='';playerCandidates:SportsTeamPlayerCandidate[]=[];playerSearchComplete=false;searchingPlayers=false;
  get availablePlayers():SportsTeamPlayerCandidate[]{return this.playerCandidates.filter(p=>!this.members.some(m=>m.profileId===p.profileId));}
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
  isOwner=false;busy=false;featureSaving=false;feedback='';
  toggleFeature(field:'chatEnabled'|'feedEnabled'):void {
    if(!this.isOwner||!this.team||this.featureSaving)return;
    const previous=this.team;
    this.featureSaving=true;this.feedback='';
    this.api.setFeatures(previous.id,field==='chatEnabled'
      ? {chatEnabled:!previous.chatEnabled} : {feedEnabled:!previous.feedEnabled}).subscribe({
      next:updated=>{this.team=updated;this.featureSaving=false;},
      error:()=>{this.feedback='Não foi possível confirmar a configuração. Atualiza antes de repetir.';this.featureSaving=false;}
    });
  }
  get activeCommunities(){return this.communities.filter(item=>item.status==='ACTIVE');}
  get invitations(){return this.communities.filter(item=>item.status==='PENDING_TEAM');}
  hasCommunity(id:number):boolean{return this.communities.some(item=>item.communityId===id&&item.status!=='DECLINED');}
  searchCommunities():void{
    if(!this.isOwner||!this.communitiesVerified||this.busy)return;
    this.busy=true;this.feedback='';
    this.communityMemberships.discover(this.communityQuery).subscribe({
      next:items=>{this.communityResults=items;this.busy=false;},
      error:()=>{this.feedback='Não foi possível pesquisar comunidades.';this.busy=false;}
    });
  }
  requestCommunity(communityId:number):void{
    if(!this.team||!this.isOwner||!this.communitiesVerified||this.busy||this.hasCommunity(communityId))return;
    this.busy=true;this.feedback='';
    this.communityMemberships.request(this.team.id,communityId).subscribe({
      next:()=>{this.busy=false;this.feedback='Pedido enviado aos responsáveis da comunidade.';this.loadCommunities();},
      error:()=>{this.busy=false;this.communitiesVerified=false;this.feedback='Não foi possível confirmar o pedido. Atualiza as comunidades antes de repetir.';}
    });
  }
  error = '';
  constructor(private readonly route: ActivatedRoute, private readonly api: SportsTeamsService,
    private readonly communityMemberships:TeamCommunityMembershipsService,
    private readonly auth:AuthenticationService) {}
  respond(id:number,accept:boolean):void{
    if(this.busy||!this.isOwner||!this.communitiesVerified)return;
    this.busy=true;this.feedback='';
    this.communityMemberships.respond(id,accept).subscribe({
      next:()=>{this.busy=false;this.feedback=accept?'Convite aceite.':'Convite recusado.';this.loadCommunities();},
      error:()=>{this.busy=false;this.communitiesVerified=false;this.feedback='Não foi possível confirmar a resposta. Atualiza a lista antes de repetir.';}
    });
  }
  loadCommunities():void{
    if(!this.team)return;
    this.communityMemberships.teamCommunities(this.team.id).subscribe({
      next:rows=>{this.communities=rows;this.communitiesVerified=true;},
      error:()=>{this.communitiesVerified=false;this.feedback='Não foi possível confirmar as comunidades da equipa.';}
    });
  }
  searchPlayers():void{
    if(!this.isOwner||this.busy||this.searchingPlayers||this.playerQuery.trim().length<2)return;
    this.searchingPlayers=true;this.playerCandidates=[];this.playerSearchComplete=false;this.feedback='';
    this.api.findPlayers(this.playerQuery).subscribe({
      next:players=>{this.playerCandidates=players;this.playerSearchComplete=true;this.searchingPlayers=false;},
      error:()=>{this.searchingPlayers=false;this.feedback='Não foi possível pesquisar jogadores.';}
    });
  }
  invitePlayer(player:SportsTeamPlayerCandidate):void{
    if(!this.team||!this.isOwner||!this.rosterVerified||this.busy)return;
    const teamId=this.team.id;
    this.busy=true;this.feedback='';
    this.api.invite(teamId,player.profileId).subscribe({
      next:()=>{this.busy=false;this.playerCandidates=this.playerCandidates.filter(item=>item.profileId!==player.profileId);this.feedback='Convite enviado. O jogador entra no plantel quando aceitar.';},
      error:()=>{this.busy=false;this.feedback='Não foi possível confirmar o convite. Verifica o estado antes de repetir.';}
    });
  }
  removePlayer(player:SportsTeamMember):void{
    if(!this.team||!this.isOwner||!this.rosterVerified||this.busy||player.role==='OWNER')return;
    if(typeof window==='undefined'||!window.confirm('Remover @'+player.username+' do plantel?'))return;
    this.busy=true;this.feedback='';
    this.api.remove(this.team.id,player.profileId).subscribe({
      next:()=>{this.members=this.members.filter(m=>m.profileId!==player.profileId);this.busy=false;this.feedback='Jogador removido do plantel.';},
      error:()=>{this.rosterVerified=false;this.isMember=false;this.busy=false;this.feedback='Não foi possível confirmar a remoção. Recarrega o plantel antes de repetir.';}
    });
  }
  ngOnInit(): void {
    this.auth.isLoggedIn();
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
        this.api.members(team.id).subscribe({
          next: players => {this.members=players;this.rosterVerified=true;this.isMember=players.some(p=>p.username.toLowerCase()===this.auth.loggedInPerfilname?.toLowerCase());},
          error: () => {this.rosterVerified=false;this.isMember=false;}
        });
      },
      error: () => this.error = 'Não foi possível encontrar esta equipa.'
    });
  }
}
