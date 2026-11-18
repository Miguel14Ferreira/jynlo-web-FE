import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthenticationService } from '../../services/authethication.service';
import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { Subscription, interval, fromEvent, merge, timeout } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PublicTeamCommunity,TeamCommunityMembership,TeamCommunityMembershipsService } from '../../services/team-community-memberships.service';
import { SportsTeam, SportsTeamMember, SportsTeamsService, SportsTeamPlayerCandidate, TeamPendingPlayerInvitation, TeamCompetitionHistory, TeamChampionshipHonour, TeamKitPattern } from '../../services/sports-teams.service';
import { SportsTeamContentComponent } from './sports-team-content.component';
import { SportsTeamChallengesComponent } from './sports-team-challenges.component';

@Component({
  standalone: true,
  selector: 'app-sports-team-detail',
  imports: [CommonModule, RouterLink, FormsModule, SportsTeamContentComponent, SportsTeamChallengesComponent],
  template: `
  <main class="team-detail" *ngIf="team as t; else state">
    <a class="team-back" routerLink="/menu/teams">← Voltar às equipas</a>
    <div class="team-hero">
      <p class="team-eyebrow">JYNLO · EQUIPA DESPORTIVA</p>
      <div class="team-hero-main">
        <span class="team-hero-crest" aria-hidden="true" [style.--kit-primary]="t.kitPrimary || '#16caba'">
          <img *ngIf="logoSrc(t.logoUrl) && !logoBroken" [src]="logoSrc(t.logoUrl)!" (error)="logoBroken=true" alt="" class="team-crest-photo">
          <ng-container *ngIf="!logoSrc(t.logoUrl) || logoBroken">{{ (t.name || 'E').charAt(0).toUpperCase() }}</ng-container>
        </span>
        <div>
          <h1>{{ t.name }}</h1>
          <p class="team-hero-meta">{{ t.sport || 'Várias modalidades' }} · {{ t.location || 'Localização por definir' }}</p>
          <p *ngIf="t.description">{{ t.description }}</p>
        </div>
      </div>
      <div class="team-kit-strip" aria-label="Modelo oficial do equipamento">
        <span class="team-shirt" [class]="'team-shirt kit-' + (t.kitPattern || 'PLAIN').toLowerCase()"
          [style.--shirt-primary]="t.kitPrimary || '#16caba'"
          [style.--shirt-secondary]="t.kitSecondary || '#f2fafc'" aria-hidden="true"></span>
        <span>Equipamento · {{ kitLabel(t.kitPattern || 'PLAIN') }}</span>
      </div>
      <section *ngIf="isOwner" class="team-branding" aria-label="Personalizar identidade da equipa">
        <div class="team-branding-heading">
          <div><h2>Identidade da equipa</h2><p>Logótipo e cores oficiais, visíveis no perfil e nos cartões.</p></div>
          <span>Responsável</span>
        </div>
        <div class="team-branding-controls">
          <label class="team-upload">Adicionar ou mudar logótipo
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" [disabled]="brandingSaving"
              (change)="uploadTeamLogo($event)">
          </label>
          <button type="button" *ngIf="t.logoUrl" (click)="removeTeamLogo()" [disabled]="brandingSaving">Remover logótipo</button>
          <label>Cor principal <input type="color" [(ngModel)]="kitPrimary" [disabled]="brandingSaving"></label>
          <label>Cor secundária <input type="color" [(ngModel)]="kitSecondary" [disabled]="brandingSaving"></label>
          <fieldset class="team-pattern-options" [disabled]="brandingSaving" aria-label="Desenho do equipamento">
            <legend>Modelo de camisola</legend>
            <button *ngFor="let option of kitPatterns" type="button"
              [class.chosen]="kitPattern === option.id"
              [attr.aria-pressed]="kitPattern === option.id"
              (click)="kitPattern = option.id">
              <span class="team-shirt pattern-sample" [class]="'team-shirt pattern-sample kit-' + option.id.toLowerCase()"
                [style.--shirt-primary]="kitPrimary" [style.--shirt-secondary]="kitSecondary" aria-hidden="true"></span>
              {{option.label}}
            </button>
          </fieldset>
          <button type="button" class="team-branding-save" [disabled]="brandingSaving" (click)="saveTeamKit()">
            {{brandingSaving?'A guardar…':'Guardar equipamento'}}
          </button>
        </div>
      </section>
      <section *ngIf="isOwner" class="team-danger-zone" aria-label="Administração da equipa">
        <div>
          <strong>Administração da equipa</strong>
          <p>A eliminação só é permitida se não existirem jogadores, convites,
            mensagens, competições ou associações guardadas. O histórico é protegido.</p>
        </div>
        <button type="button" class="team-delete-button" [disabled]="deletingTeam || busy || brandingSaving || featureSaving"
          (click)="deleteTeam()">{{deletingTeam ? 'A eliminar…' : 'Eliminar equipa'}}</button>
      </section>
      <div class="team-hero-stats">
        <span><strong>{{rosterVerified ? members.length : '—'}}</strong> Jogadores</span>
        <span><strong>{{communitiesVerified ? activeCommunities.length : '—'}}</strong> Comunidades</span>
        <span><strong>{{trophiesVerified ? trophies.length + championshipHonours.length : '—'}}</strong> Troféus</span>
        <a routerLink="/menu/teams/competitions" [queryParams]="{teamId:t.id}">Explorar competições →</a>
      </div>
    </div>
    <nav class="team-tabs" role="tablist" aria-label="Secções da equipa">
      <button type="button" role="tab" [attr.aria-selected]="activeTab === 'OVERVIEW'"
        [class.selected]="activeTab === 'OVERVIEW'" (click)="selectTab('OVERVIEW')">Visão geral</button>
      <button type="button" role="tab" [attr.aria-selected]="activeTab === 'TROPHIES'"
        [class.selected]="activeTab === 'TROPHIES'" (click)="selectTab('TROPHIES')">
        🏆 Troféus ({{trophiesVerified ? trophies.length + championshipHonours.length : '—'}})
      </button>
      <button type="button" role="tab" [attr.aria-selected]="activeTab === 'FEED'"
        [class.selected]="activeTab === 'FEED'" (click)="selectTab('FEED')">Publicações</button>
      <button type="button" role="tab" [attr.aria-selected]="activeTab === 'CHAT'"
        [class.selected]="activeTab === 'CHAT'" (click)="selectTab('CHAT')">Mensagens</button>
      <button *ngIf="isOwner && rosterVerified" type="button" role="tab" [attr.aria-selected]="activeTab === 'CHALLENGES'"
        [class.selected]="activeTab === 'CHALLENGES'" (click)="selectTab('CHALLENGES')">Desafios</button>
    </nav>
    <p *ngIf="feedback" role="status" class="team-feedback">{{feedback}}</p>
    <div class="team-grid" role="tabpanel">
      <section *ngIf="activeTab === 'OVERVIEW'"><h2>Plantel ({{ rosterVerified ? members.length : '—' }})</h2>
        <p *ngIf="!rosterVerified" role="alert">Não foi possível confirmar o plantel. As opções de gestão estão temporariamente bloqueadas.</p>
        <div class="team-roster-toolbar" *ngIf="rosterVerified && members.length > 4">
          <label for="team-roster-filter">Encontrar jogador</label>
          <input id="team-roster-filter" type="search" [(ngModel)]="rosterQuery" maxlength="80" placeholder="Pesquisar pelo nome de utilizador" autocomplete="off">
          <span role="status">{{visibleRoster.length}} de {{members.length}} jogadores</span>
        </div>
        <div class="team-roster" *ngIf="rosterVerified && visibleRoster.length">
          <div class="team-member" *ngFor="let player of visibleRoster; trackBy: trackRosterMember">
            <span class="team-member-avatar" aria-hidden="true">
              <img *ngIf="playerAvatarSrc(player.profilePicUrl) && !brokenPlayerAvatars.has(player.profileId)"
                [src]="playerAvatarSrc(player.profilePicUrl)!" loading="lazy" decoding="async"
                (error)="brokenPlayerAvatars.add(player.profileId)" alt="">
              <ng-container *ngIf="!playerAvatarSrc(player.profilePicUrl) || brokenPlayerAvatars.has(player.profileId)">{{ (player.username || 'J').charAt(0).toUpperCase() }}</ng-container>
            </span>
            <div class="team-member-identity"><a [routerLink]="['/menu/perfis',player.username]">@{{player.username}}</a><small>{{player.role === 'OWNER' ? 'Responsável' : 'Jogador'}}</small></div>
            <button *ngIf="isOwner && player.role !== 'OWNER'" type="button" [attr.aria-label]="'Remover @' + player.username + ' da equipa'" [disabled]="busy || !rosterVerified" (click)="removePlayer(player)">Remover</button>
          </div>
        </div>
        <p *ngIf="rosterVerified && members.length === 0">Ainda não existem jogadores no plantel.</p>
        <p *ngIf="rosterVerified && members.length > 0 && !visibleRoster.length" role="status">Não existem jogadores que correspondam à pesquisa.</p>
        <button *ngIf="rosterVerified && isMember && !isOwner" type="button"
          class="team-leave-button" [disabled]="busy"
          (click)="leaveTeam()">Sair da equipa</button>
        <div *ngIf="isOwner && rosterVerified" class="team-player-search">
          <h3>Convites pendentes ({{invitationsVerified?pendingPlayers.length:'—'}})</h3>
          <p *ngIf="!invitationsVerified" role="alert">Não foi possível confirmar os convites. Novos envios bloqueados.</p>
          <p class="team-content-note" *ngIf="invitationsVerified">Convites sincronizados automaticamente.</p>
          <div *ngFor="let invite of (invitationsVerified?pendingPlayers:[])" class="team-candidate">
            <span>@{{invite.username}} · A aguardar resposta</span>
            <button type="button" [disabled]="busy" (click)="cancelPendingInvitation(invite)">Cancelar convite</button>
          </div>
          <h3>Convidar jogadores</h3>
          <div class="search-community"><input [(ngModel)]="playerQuery" (ngModelChange)="invalidatePlayerSearch()" maxlength="80" placeholder="Nome ou utilizador" (keyup.enter)="searchPlayers()"/>
            <button type="button" [disabled]="busy || searchingPlayers || playerQuery.trim().length < 2" (click)="searchPlayers()">{{ searchingPlayers ? 'A procurar…' : 'Pesquisar jogadores' }}</button></div>
          <p *ngIf="playerSearchComplete && availablePlayers.length === 0">Não encontrámos novos jogadores com essa pesquisa.</p>
          <div *ngFor="let candidate of availablePlayers" class="team-candidate">
            <a [routerLink]="['/menu/perfis',candidate.username]">{{ candidate.fullName || candidate.username }} · @{{candidate.username}}</a>
            <button type="button" [attr.aria-label]="'Convidar @' + candidate.username + ' para a equipa'" [disabled]="busy || !invitationsVerified" (click)="invitePlayer(candidate)">Convidar</button>
          </div>
        </div>
      </section>
      <section *ngIf="activeTab === 'TROPHIES'" class="team-trophies"><h2>🏆 Troféus ({{trophiesVerified ? trophies.length + championshipHonours.length : '—'}})</h2>
        <p *ngIf="historyLoading || honoursLoading">A carregar conquistas oficiais…</p>
        <p *ngIf="historyError" role="alert">{{historyError}}</p>
        <p *ngIf="honoursError" role="alert">{{honoursError}}</p>
        <button type="button" *ngIf="!historyLoading && !honoursLoading && (historyError || honoursError)"
          (click)="retryTrophies()">Voltar a tentar carregar troféus</button>
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
        <div *ngFor="let item of activeCommunities" class="team-community">
          <a [routerLink]="['/menu/communities',item.communityId]">{{item.communityName}} →</a>
          <button *ngIf="isOwner" type="button" [disabled]="busy || !communitiesVerified"
            [attr.aria-label]="'Retirar equipa de ' + item.communityName"
            (click)="leaveCommunity(item)">Sair da comunidade</button>
        </div>
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
      <section *ngIf="activeTab === 'CHALLENGES' && isOwner && rosterVerified">
        <app-sports-team-challenges [teamId]="t.id" [isOwner]="isOwner && rosterVerified"
          [sport]="t.sport"></app-sports-team-challenges>
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
export class SportsTeamDetailComponent implements OnInit, OnDestroy {
  private readonly rosterSubscriptions = new Subscription();
  private rosterRequest = 0;
  private rosterLoading = false;
  team: SportsTeam | null = null;
  logoBroken=false;
  brokenPlayerAvatars=new Set<number>();
  playerAvatarSrc(url:string|null|undefined):string|null{return this.api.playerAvatarSrc(url);}
  logoSrc(url:string|null|undefined):string|null{return this.api.logoSrc(url);}
  activeTab: 'OVERVIEW' | 'TROPHIES' | 'FEED' | 'CHAT' | 'CHALLENGES' = 'OVERVIEW';
  private trophiesRequestedForTeam:number|null=null;
  get trophiesVerified():boolean{return this.trophiesRequestedForTeam===this.team?.id && !this.historyLoading && !this.honoursLoading && !this.historyError && !this.honoursError;}
  selectTab(tab:'OVERVIEW'|'TROPHIES'|'FEED'|'CHAT'|'CHALLENGES'):void {
    this.activeTab=tab;
    if(tab==='TROPHIES')this.loadTrophies();
  }
  retryTrophies():void {
    if(this.activeTab!=='TROPHIES'||this.historyLoading||this.honoursLoading)return;
    this.trophiesRequestedForTeam=null;
    this.loadTrophies();
  }
  private loadTrophies():void {
    const id=this.team?.id;
    if(!id||this.trophiesRequestedForTeam===id)return;
    this.trophiesRequestedForTeam=id;
    this.historyLoading=true;this.honoursLoading=true;
    this.historyError='';this.honoursError='';
    this.api.honours(id).pipe(timeout(15000)).subscribe({
      next:awards=>{
        if(this.team?.id!==id)return;
        this.championshipHonours=awards;this.honoursLoading=false;this.render();
      },
      error:()=>{
        if(this.team?.id!==id)return;
        this.honoursError='Não foi possível carregar os títulos dos campeonatos.';
        this.honoursLoading=false;this.render();
      }
    });
    this.api.history(id).pipe(timeout(15000)).subscribe({
      next:entries=>{
        if(this.team?.id!==id)return;
        this.history=entries;this.historyLoading=false;this.render();
      },
      error:()=>{
        if(this.team?.id!==id)return;
        this.historyError='Não foi possível carregar o histórico de troféus.';
        this.historyLoading=false;this.render();
      }
    });
  }
  members: SportsTeamMember[] = [];
  rosterQuery='';
  trackRosterMember(_:number,player:SportsTeamMember):number{return player.profileId;}
  get visibleRoster():SportsTeamMember[]{
    const query=this.rosterQuery.trim().toLocaleLowerCase();
    return this.members.filter(player=>!query||player.username.toLocaleLowerCase().includes(query))
      .slice().sort((a,b)=>{
        if(a.role==='OWNER' && b.role!=='OWNER')return -1;
        if(b.role==='OWNER' && a.role!=='OWNER')return 1;
        return a.username.localeCompare(b.username,undefined,{sensitivity:'base'});
      });
  }
  pendingPlayers:TeamPendingPlayerInvitation[]=[];
  invitationsVerified=false;
  private pendingRequest=0;
  private pendingLoading=false;
  rosterVerified=false;communitiesVerified=false;isMember=false;
  playerQuery='';playerCandidates:SportsTeamPlayerCandidate[]=[];playerSearchComplete=false;searchingPlayers=false;
  private playerSearchVersion=0;
  get availablePlayers():SportsTeamPlayerCandidate[]{return this.playerCandidates.filter(p=>!this.members.some(m=>m.profileId===p.profileId)&&!this.pendingPlayers.some(invite=>invite.profileId===p.profileId));}
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
  isOwner=false;busy=false;featureSaving=false;deletingTeam=false;feedback='';
  kitPrimary='#16caba';kitSecondary='#f2fafc';kitPattern:TeamKitPattern='PLAIN';brandingSaving=false;
  readonly kitPatterns:ReadonlyArray<{id:TeamKitPattern;label:string}>=[
    {id:'PLAIN',label:'Lisa'},{id:'STRIPES',label:'Riscas'},{id:'DIAGONAL',label:'Faixa diagonal'}
  ];
  kitLabel(pattern:TeamKitPattern):string{return this.kitPatterns.find(p=>p.id===pattern)?.label||'Lisa';}
  private readonly maxTeamLogoBytes=5*1024*1024;
  saveTeamKit():void {
    if(!this.team||!this.isOwner||this.brandingSaving)return;
    this.brandingSaving=true;this.feedback='';
    this.api.setKit(this.team.id,this.kitPrimary,this.kitSecondary,this.kitPattern).pipe(timeout(15000)).subscribe({
      next:updated=>{this.team=updated;this.brandingSaving=false;this.api.rememberTeam(updated);
        this.kitPattern=updated.kitPattern||'PLAIN';
        this.feedback='Equipamento guardado.';this.render();},
      error:()=>{this.brandingSaving=false;this.feedback='Não foi possível confirmar o equipamento. Consulta a equipa antes de repetir.';this.render();}
    });
  }
  uploadTeamLogo(event:Event):void {
    const input=event.target as HTMLInputElement;
    const file=input.files?.[0];
    input.value='';
    if(!file||!this.team||!this.isOwner||this.brandingSaving)return;
    if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||
       file.size<1||file.size>this.maxTeamLogoBytes){
      this.feedback='Escolhe uma imagem PNG, JPG, WebP ou GIF até 5 MB.';return;
    }
    this.brandingSaving=true;this.feedback='';
    this.api.uploadLogo(this.team.id,file).pipe(timeout(30000)).subscribe({
      next:updated=>{this.team=updated;this.logoBroken=false;this.api.rememberTeam(updated);this.brandingSaving=false;
        this.feedback='Logótipo atualizado.';this.render();},
      error:()=>{this.brandingSaving=false;this.feedback='Não foi possível confirmar o logótipo. Consulta a equipa antes de repetir.';this.render();}
    });
  }
  removeTeamLogo():void {
    if(!this.team||!this.isOwner||this.brandingSaving||!this.team.logoUrl)return;
    if(typeof window==='undefined'||!window.confirm('Remover o logótipo da equipa?'))return;
    this.brandingSaving=true;this.feedback='';
    this.api.removeLogo(this.team.id).pipe(timeout(15000)).subscribe({
      next:updated=>{this.team=updated;this.api.rememberTeam(updated);this.brandingSaving=false;
        this.feedback='Logótipo removido.';this.render();},
      error:()=>{this.brandingSaving=false;this.feedback='Não foi possível confirmar a remoção. Consulta a equipa antes de repetir.';this.render();}
    });
  }

  deleteTeam():void {
    if(!this.team||!this.isOwner||this.deletingTeam||this.busy||
       this.brandingSaving||this.featureSaving||typeof window==='undefined')return;
    const current=this.team;
    const confirmed=window.confirm(
      'Eliminar definitivamente a equipa "'+current.name+'"?\n\n'
      +'Esta ação não pode ser anulada. Se houver jogadores, convites, mensagens, '
      +'competições ou histórico, o servidor não permitirá a eliminação.');
    if(!confirmed)return;
    this.deletingTeam=true;this.feedback='';
    this.api.deleteEmptyTeam(current.id).pipe(timeout(15000)).subscribe({
      next:()=>{
        if(this.rosterSubscriptions.closed)return;
        this.deletingTeam=false;this.api.forgetTeam(current.id);
        void this.router.navigate(['/menu/teams']);
      },
      error:(failure:unknown)=>{
        if(this.rosterSubscriptions.closed)return;
        this.deletingTeam=false;
        this.feedback=failure instanceof HttpErrorResponse && failure.status===409
          ? 'Não é possível eliminar esta equipa porque tem jogadores, convites, publicações, mensagens ou ligações históricas. Estes dados ficam protegidos.'
          : 'Não foi possível confirmar a eliminação. Consulta a equipa antes de tentares novamente.';
        this.render();
      }
    });
  }

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
    private readonly auth:AuthenticationService,
    private readonly cdr:ChangeDetectorRef,
    private readonly router:Router) {}
  private render():void{if(!this.rosterSubscriptions.closed)this.cdr.detectChanges();}
  respond(id:number,accept:boolean):void{
    if(this.busy||!this.isOwner||!this.communitiesVerified)return;
    this.busy=true;this.feedback='';
    this.communityMemberships.respond(id,accept).subscribe({
      next:()=>{this.busy=false;this.feedback=accept?'Convite aceite.':'Convite recusado.';this.loadCommunities();},
      error:()=>{this.busy=false;this.communitiesVerified=false;this.feedback='Não foi possível confirmar a resposta. Atualiza a lista antes de repetir.';}
    });
  }
  leaveCommunity(item:TeamCommunityMembership):void{
    if(!this.team||!this.isOwner||!this.communitiesVerified||this.busy)return;
    if(typeof window==='undefined'||!window.confirm('Retirar a equipa de '+item.communityName+'?'))return;
    this.busy=true;this.feedback='';
    this.communityMemberships.remove(item.id).subscribe({
      next:()=>{
        this.communities=this.communities.filter(row=>row.id!==item.id);
        this.busy=false;this.feedback='Equipa removida da comunidade.';
        this.loadCommunities();
      },
      error:()=>{
        this.busy=false;this.communitiesVerified=false;
        this.feedback='Não foi possível confirmar a saída. Atualiza as comunidades antes de repetir.';
      }
    });
  }
  loadCommunities():void{
    if(!this.team)return;
    this.communityMemberships.teamCommunities(this.team.id).pipe(timeout(15000)).subscribe({
      next:rows=>{this.communities=rows;this.communitiesVerified=true;this.render();},
      error:()=>{this.communitiesVerified=false;this.feedback='Não foi possível confirmar as comunidades da equipa.';this.render();}
    });
  }
  invalidatePlayerSearch():void{
    this.playerSearchVersion++;
    this.playerCandidates=[];this.playerSearchComplete=false;this.searchingPlayers=false;
  }
  searchPlayers():void{
    if(!this.isOwner||!this.rosterVerified||this.busy||this.searchingPlayers||this.playerQuery.trim().length<2)return;
    const version=++this.playerSearchVersion;
    this.searchingPlayers=true;this.playerCandidates=[];this.playerSearchComplete=false;this.feedback='';
    this.api.findPlayers(this.playerQuery).subscribe({
      next:players=>{
        if(version!==this.playerSearchVersion)return;
        this.playerCandidates=players;this.playerSearchComplete=true;this.searchingPlayers=false;
      },
      error:()=>{
        if(version!==this.playerSearchVersion)return;
        this.searchingPlayers=false;this.feedback='Não foi possível pesquisar jogadores.';
      }
    });
  }
  loadPendingInvitations():void {
    if(!this.team||!this.isOwner||this.busy||this.pendingLoading)return;
    const teamId=this.team.id,version=++this.pendingRequest;
    this.pendingLoading=true;
    // Keep the last verified list visible while a background refresh runs.
    this.api.teamPendingInvitations(teamId).pipe(timeout(15000)).subscribe({
      next:items=>{
        if(version!==this.pendingRequest||this.team?.id!==teamId||!this.isOwner)return;
        this.pendingPlayers=items;this.invitationsVerified=true;this.render();
      },
      error:()=>{
        if(version!==this.pendingRequest||this.team?.id!==teamId)return;
        this.pendingPlayers=[];this.invitationsVerified=false;
        this.feedback='Não foi possível confirmar os convites pendentes.';
        this.render();
      }
    }).add(()=>{if(version===this.pendingRequest)this.pendingLoading=false;});
  }
  cancelPendingInvitation(invite:TeamPendingPlayerInvitation):void {
    if(!this.team||!this.isOwner||!this.invitationsVerified||this.busy||
      !this.pendingPlayers.some(p=>p.profileId===invite.profileId))return;
    if(typeof window==='undefined'||!window.confirm('Cancelar convite para @'+invite.username+'?'))return;
    const teamId=this.team.id;
    this.busy=true;this.feedback='';
    this.api.remove(teamId,invite.profileId).subscribe({
      next:()=>{this.busy=false;this.feedback='Convite cancelado.';this.loadPendingInvitations();},
      error:()=>{this.busy=false;this.invitationsVerified=false;this.pendingPlayers=[];this.feedback='Não foi possível confirmar o cancelamento. Verifica os convites antes de repetir.';}
    });
  }
  invitePlayer(player:SportsTeamPlayerCandidate):void{
    if(!this.team||!this.isOwner||!this.rosterVerified||!this.invitationsVerified||this.busy||
      !this.availablePlayers.some(candidate=>candidate.profileId===player.profileId))return;
    const teamId=this.team.id;
    this.busy=true;this.feedback='';
    this.api.invite(teamId,player.profileId).subscribe({
      next:()=>{this.busy=false;this.playerCandidates=this.playerCandidates.filter(item=>item.profileId!==player.profileId);this.feedback='Convite enviado. O jogador entra no plantel quando aceitar.';this.loadPendingInvitations();},
      error:()=>{this.busy=false;this.invitationsVerified=false;this.invalidatePlayerSearch();this.feedback='Não foi possível confirmar o convite. Verifica os convites antes de repetir.';}
    });
  }
  refreshRoster():void {
    if(!this.team || this.rosterLoading || this.busy)return;
    const teamId=this.team.id;
    const request=++this.rosterRequest;
    this.rosterLoading=true;
    this.api.members(teamId).pipe(timeout(15000)).subscribe({
      next:players=>{
        if(request!==this.rosterRequest || this.team?.id!==teamId)return;
        this.members=players;
        this.rosterVerified=true;
        // The authenticated roster already provides OWNER/PLAYER roles.
        // A separate GET /teams/mine is redundant and slows the team detail.
        const username=this.auth.loggedInPerfilname?.toLowerCase();
        const ownRole=players.find(p=>p.username.toLowerCase()===username)?.role;
        this.isMember=ownRole==='OWNER'||ownRole==='PLAYER';
        this.isOwner=ownRole==='OWNER';
        if(!this.isOwner){
          this.pendingRequest++;this.pendingLoading=false;
          this.pendingPlayers=[];this.invitationsVerified=false;
        }else {
          // Refresh pending invitations alongside the roster, including when
          // another player accepts or declines without the captain clicking.
          this.loadPendingInvitations();
        }
        this.render();
      },
      error:()=>{
        if(request!==this.rosterRequest || this.team?.id!==teamId)return;
        // Do not keep a stale authorization decision after a failed refresh.
        this.rosterVerified=false;this.isMember=false;this.isOwner=false;
        this.pendingRequest++;this.pendingLoading=false;
        this.pendingPlayers=[];this.invitationsVerified=false;
        this.render();
      }
    }).add(()=>{if(request===this.rosterRequest){this.rosterLoading=false;this.render();}});
  }
  leaveTeam():void {
    if(!this.team||!this.rosterVerified||!this.isMember||this.isOwner||this.busy)return;
    const currentUsername=this.auth.loggedInPerfilname?.toLowerCase();
    const player=this.members.find(member=>member.role==='PLAYER'
      && member.username.toLowerCase()===currentUsername);
    if(!player)return;
    if(typeof window==='undefined'||!window.confirm(
      'Sair desta equipa? Deixarás de ter acesso ao chat e às publicações privadas.'))return;
    const teamId=this.team.id;
    this.busy=true;this.feedback='';
    this.api.remove(teamId,player.profileId).subscribe({
      next:()=>{
        // Remove private panels immediately; the next roster read is authoritative.
        this.isMember=false;
        this.members=this.members.filter(member=>member.profileId!==player.profileId);
        this.busy=false;
        this.feedback='Saíste da equipa. O acesso ao chat e às publicações foi retirado.';
        this.refreshRoster();
      },
      error:()=>{
        // A timeout may hide a committed removal: do not retry automatically.
        this.isMember=false;this.rosterVerified=false;this.busy=false;
        this.feedback='Não foi possível confirmar a saída. Verifica o plantel antes de tentares novamente.';
      }
    });
  }
  removePlayer(player:SportsTeamMember):void{
    if(!this.team||!this.isOwner||!this.rosterVerified||this.busy||player.role==='OWNER')return;
    if(typeof window==='undefined'||!window.confirm('Remover @'+player.username+' do plantel?'))return;
    this.busy=true;this.feedback='';
    this.api.remove(this.team.id,player.profileId).subscribe({
      next:()=>{this.members=this.members.filter(m=>m.profileId!==player.profileId);this.busy=false;this.feedback='Jogador removido do plantel.';this.refreshRoster();},
      error:()=>{this.rosterVerified=false;this.isMember=false;this.busy=false;this.feedback='Não foi possível confirmar a remoção. Recarrega o plantel antes de repetir.';}
    });
  }
  ngOnInit(): void {
    this.auth.isLoggedIn();
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isSafeInteger(id) || id <= 0) {this.error = 'Equipa inválida.'; return;}
    // Paint the public team identity instantly when opened from a team card.
    // Private content and management remain disabled until the server verifies membership.
    this.team=this.api.rememberedTeam(id);
    this.api.detail(id).pipe(timeout(15000)).subscribe({
      next: team => {
        this.team = team;
        this.logoBroken=false;
        this.kitPrimary=team.kitPrimary||'#16caba';
        this.kitSecondary=team.kitSecondary||'#f2fafc';
        this.kitPattern=team.kitPattern||'PLAIN';
        this.render();
        this.loadCommunities();
        // Trophy/history requests are unnecessary on the initial squad screen.
        // Load them once, when the user actually opens the trophies tab.
        if(this.activeTab==='TROPHIES')this.loadTrophies();
        this.refreshRoster();
      },
      error: () => {this.error = 'Não foi possível confirmar os dados da equipa. Tenta abrir novamente.';this.render();}
    });
    this.rosterSubscriptions.add(interval(30000).subscribe(()=>{
      if(typeof document!=='undefined' && document.visibilityState==='visible')this.refreshRoster();
    }));
    if(typeof window!=='undefined' && typeof document!=='undefined')
      this.rosterSubscriptions.add(merge(fromEvent(window,'focus'),fromEvent(document,'visibilitychange'))
        .subscribe(()=>{if(document.visibilityState==='visible')this.refreshRoster();}));
  }
  ngOnDestroy():void {
    this.rosterRequest++;this.pendingRequest++;this.pendingLoading=false;
    this.rosterSubscriptions.unsubscribe();
  }
}
