import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PublicTeamCommunity,TeamCommunityMembership,TeamCommunityMembershipsService } from '../../services/team-community-memberships.service';
import { SportsTeam, SportsTeamMember, SportsTeamsService, TeamCompetitionHistory, TeamChampionshipHonour } from '../../services/sports-teams.service';
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
        <span><strong>{{members.length}}</strong> Jogadores</span>
        <span><strong>{{activeCommunities.length}}</strong> Comunidades</span>
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
    </nav>
    <div class="team-grid" role="tabpanel">
      <section *ngIf="activeTab === 'OVERVIEW'"><h2>Plantel ({{ members.length }})</h2>
        <div class="team-roster" *ngIf="members.length">
          <div class="team-member" *ngFor="let player of members">
            <span class="team-member-avatar" aria-hidden="true">{{ (player.username || 'J').charAt(0).toUpperCase() }}</span>
            <div><strong>@{{player.username}}</strong><small>{{player.role === 'OWNER' ? 'Responsável' : 'Jogador'}}</small></div>
          </div>
        </div>
        <p *ngIf="members.length === 0">A carregar plantel ou sem jogadores disponíveis.</p>
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
        <p *ngFor="let entry of history">
          {{entry.tournamentName}} · {{entry.communityName}} —
          {{entry.champion ? '🏆 Campeão' : entry.archived ? 'Concluído' : 'Em curso'}}
        </p>
      </section>
      <section *ngIf="activeTab === 'OVERVIEW'"><h2>Competições</h2>
        <p>Encontra torneios e campeonatos com candidaturas abertas para esta equipa.</p>
        <a routerLink="/menu/teams/competitions" [queryParams]="{teamId: t.id}">Encontrar torneios e campeonatos</a>
      </section>
      <section *ngIf="activeTab === 'OVERVIEW'"><h2>Comunidades ({{activeCommunities.length}})</h2>
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
      <section *ngIf="activeTab === 'OVERVIEW'" class="team-feature">
        <h2>Feed</h2>
        <button *ngIf="isOwner" type="button" [disabled]="featureSaving"
          (click)="toggleFeature('feedEnabled')">{{ t.feedEnabled ? 'Desativar feed' : 'Ativar feed' }}</button>
        <p *ngIf="!t.feedEnabled">Desativado pelo responsável da equipa.</p>
        <app-sports-team-content *ngIf="t.feedEnabled" [teamId]="t.id" kind="feed"></app-sports-team-content>
      </section>
      <section *ngIf="activeTab === 'OVERVIEW'" class="team-feature">
        <h2>Chat</h2>
        <button *ngIf="isOwner" type="button" [disabled]="featureSaving"
          (click)="toggleFeature('chatEnabled')">{{ t.chatEnabled ? 'Desativar chat' : 'Ativar chat' }}</button>
        <p *ngIf="!t.chatEnabled">Desativado pelo responsável da equipa.</p>
        <app-sports-team-content *ngIf="t.chatEnabled" [teamId]="t.id" kind="chat"></app-sports-team-content>
      </section>
    </div>
  </main>
  <ng-template #state><main class="team-detail"><p role="alert">{{ error || 'A carregar equipa…' }}</p></main></ng-template>
  `,
  styleUrls: ['./sports-team-detail.component.css']
})
export class SportsTeamDetailComponent implements OnInit {
  team: SportsTeam | null = null;
  activeTab: 'OVERVIEW' | 'TROPHIES' = 'OVERVIEW';
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
  isOwner=false;busy=false;featureSaving=false;feedback='';
  toggleFeature(field:'chatEnabled'|'feedEnabled'):void {
    if(!this.isOwner||!this.team||this.featureSaving)return;
    const previous=this.team;
    this.featureSaving=true;this.feedback='';
    this.api.setFeatures(previous.id,{[field]:!previous[field]}).subscribe({
      next:updated=>{this.team=updated;this.featureSaving=false;},
      error:()=>{this.feedback='Não foi possível confirmar a configuração. Atualiza antes de repetir.';this.featureSaving=false;}
    });
  }
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
