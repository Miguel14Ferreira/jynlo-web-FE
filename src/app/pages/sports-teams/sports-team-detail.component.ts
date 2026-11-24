import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate } from '../../i18n/i18n.service';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthenticationService } from '../../services/authethication.service';
import { Component, OnDestroy, OnInit, ChangeDetectorRef, ElementRef, ViewChild, inject } from '@angular/core';
import { Subscription, interval, fromEvent, merge, timeout } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PublicTeamCommunity,TeamCommunityMembership,TeamCommunityMembershipsService } from '../../services/team-community-memberships.service';
import { SportsTeam, SportsTeamMember, SportsTeamsService, SportsTeamPlayerCandidate, TeamPendingPlayerInvitation, TeamCompetitionHistory, TeamChampionshipHonour, TeamKitPattern, TeamKitKind, TeamKitVariant } from '../../services/sports-teams.service';
import { SportsTeamContentComponent } from './sports-team-content.component';
import { SportsTeamChallengesComponent } from './sports-team-challenges.component';
import { TeamCrestEditorComponent } from './team-crest-editor.component';

type KitDesign = Omit<TeamKitVariant,'type'>;

import { TeamRosterImportComponent } from './team-roster-import.component';
import { injectAppDialog } from '../../shared/app-dialog/app-dialog.service';
@Component({
  standalone: true,
  selector: 'app-sports-team-detail',
  imports: [TranslatePipe, CommonModule, RouterLink, FormsModule, SportsTeamContentComponent, SportsTeamChallengesComponent, TeamCrestEditorComponent, TeamRosterImportComponent],
  template: `
  <main class="team-detail" *ngIf="team as t; else state">
    <a class="team-back" routerLink="/menu/teams">{{ '← Voltar às equipas' | t }}</a>
    <div class="team-hero">
      <p class="team-eyebrow">{{ 'JYNLO · EQUIPA DESPORTIVA' | t }}</p>
      <div class="team-hero-main">
        <span class="team-hero-crest" aria-hidden="true" [style.--kit-primary]="t.kitPrimary || '#16caba'">
          <img *ngIf="logoSrc(t.logoUrl) && !logoBroken" [src]="logoSrc(t.logoUrl)!" (error)="logoBroken=true" alt="" class="team-crest-photo">
          <ng-container *ngIf="!logoSrc(t.logoUrl) || logoBroken">{{ (t.name || 'E').charAt(0).toUpperCase() }}</ng-container>
        </span>
        <div>
          <h1>{{ t.name }}</h1>
          <p class="team-hero-meta">{{ t.sport || ('Várias modalidades' | t) }} · {{ t.location || ('Localização por definir' | t) }}</p>
          <p *ngIf="t.description">{{ t.description }}</p>
        </div>
      </div>
      <div class="team-kit-strip" [attr.aria-label]="'Modelo oficial do equipamento' | t">
        <span class="team-shirt" [class]="'team-shirt kit-' + (t.kitPattern || 'PLAIN').toLowerCase()"
          [style.--shirt-primary]="t.kitPrimary || '#16caba'"
          [style.--shirt-secondary]="t.kitSecondary || '#f2fafc'" aria-hidden="true"></span>
        <span>{{ 'Equipamento · {{kitPattern}}' | t:{kitPattern: (kitLabel(t.kitPattern || 'PLAIN'))} }}</span>
      </div>
      <div class="team-social-follow" [attr.aria-label]="'Seguidores da equipa' | t">
        @if (followerState; as state) {
          <span><strong>{{state.count}}</strong> {{state.count===1 ? 'seguidor' : 'seguidores'}}</span>
          <button type="button" [disabled]="followBusy" [attr.aria-pressed]="state.following"
            (click)="toggleTeamFollow()">{{followBusy?('A atualizar…' | t):state.following?('A seguir ✓' | t):('Seguir equipa +' | t)}}</button>
        } @else if (followError) {
          <span role="status">{{followError}}</span>
          <button type="button" (click)="loadTeamFollowers()">{{ 'Tentar novamente' | t }}</button>
        }
      </div>
      <div class="team-hero-stats">
        <span><strong>{{rosterVerified ? members.length : '—'}}</strong> {{ 'Jogadores' | t }}</span>
        <span><strong>{{communitiesVerified ? activeCommunities.length : '—'}}</strong> {{ 'Comunidades' | t }}</span>
        <span><strong>{{trophiesVerified ? trophies.length + championshipHonours.length : '—'}}</strong> {{ 'Troféus' | t }}</span>
        <a routerLink="/menu/teams/competitions" [queryParams]="{teamId:t.id}">{{ 'Explorar competições →' | t }}</a>
        <button *ngIf="isOwner && rosterVerified" type="button" class="team-branding-shortcut"
          (click)="selectTab('SETTINGS')" [attr.aria-label]="'Personalizar emblema e equipamento da equipa' | t">
          {{ 'Personalizar equipa' | t }}
        </button>
      </div>
    </div>
    <nav #teamTabs class="team-tabs" [attr.aria-label]="'Secções da equipa' | t">
      <button type="button" data-team-tab="OVERVIEW" [attr.aria-current]="activeTab === 'OVERVIEW' ? 'page' : null"
        [class.selected]="activeTab === 'OVERVIEW'" (click)="selectTab('OVERVIEW')">{{ 'Visão geral' | t }}</button>
      <button type="button" data-team-tab="SQUAD" [attr.aria-current]="activeTab === 'SQUAD' ? 'page' : null"
        [class.selected]="activeTab === 'SQUAD'" (click)="selectTab('SQUAD')">{{ 'Plantel' | t }}</button>
      <button type="button" data-team-tab="COMMUNITIES" [attr.aria-current]="activeTab === 'COMMUNITIES' ? 'page' : null"
        [class.selected]="activeTab === 'COMMUNITIES'" (click)="selectTab('COMMUNITIES')">{{ 'Comunidades' | t }}</button>
      <button type="button" data-team-tab="TROPHIES" [attr.aria-current]="activeTab === 'TROPHIES' ? 'page' : null"
        [class.selected]="activeTab === 'TROPHIES'" (click)="selectTab('TROPHIES')">{{ '🏆 Troféus' | t }}</button>
      <button type="button" data-team-tab="FEED" [attr.aria-current]="activeTab === 'FEED' ? 'page' : null"
        [class.selected]="activeTab === 'FEED'" (click)="selectTab('FEED')">{{ 'Publicações' | t }}</button>
      <button type="button" data-team-tab="CHAT" [attr.aria-current]="activeTab === 'CHAT' ? 'page' : null"
        [class.selected]="activeTab === 'CHAT'" (click)="selectTab('CHAT')">{{ 'Mensagens' | t }}</button>
      <button *ngIf="isOwner && rosterVerified" type="button" data-team-tab="CHALLENGES" [attr.aria-current]="activeTab === 'CHALLENGES' ? 'page' : null"
        [class.selected]="activeTab === 'CHALLENGES'" (click)="selectTab('CHALLENGES')">{{ 'Desafios' | t }}</button>
      <button *ngIf="isOwner && rosterVerified" type="button" data-team-tab="SETTINGS" [attr.aria-current]="activeTab === 'SETTINGS' ? 'page' : null"
        [class.selected]="activeTab === 'SETTINGS'" (click)="selectTab('SETTINGS')">{{ 'Identidade e gestão' | t }}</button>
    </nav>
    <p *ngIf="feedback" role="status" class="team-feedback">{{feedback}}</p>
    <div class="team-grid" aria-live="off">
      <section *ngIf="activeTab === 'OVERVIEW'" class="team-dashboard">
        <h2>{{ 'O espaço da tua equipa' | t }}</h2>
        <p>{{ 'Consulta o plantel, acompanha a comunidade e entra nas conversas sem perder tempo.' | t }}</p>
        <div class="team-dashboard-links">
          <button type="button" (click)="selectTab('SQUAD')">
            <span aria-hidden="true">👥</span><strong>{{ 'Plantel' | t }}</strong>
            <small>{{rosterVerified ? ('{{n}} jogadores' | t:{n: members.length}) : ('A confirmar jogadores' | t)}}</small>
          </button>
          <button type="button" (click)="selectTab('COMMUNITIES')">
            <span aria-hidden="true">🤝</span><strong>{{ 'Comunidades' | t }}</strong>
            <small>{{communitiesVerified ? ('{{n}} associadas' | t:{n: activeCommunities.length}) : ('A confirmar associações' | t)}}</small>
          </button>
          <button type="button" (click)="selectTab('FEED')">
            <span aria-hidden="true">📰</span><strong>{{ 'Publicações' | t }}</strong><small>{{ 'Novidades do plantel' | t }}</small>
          </button>
          <button type="button" (click)="selectTab('CHAT')">
            <span aria-hidden="true">💬</span><strong>{{ 'Mensagens' | t }}</strong><small>{{ 'Conversa da equipa' | t }}</small>
          </button>
          <button type="button" (click)="selectTab('TROPHIES')">
            <span aria-hidden="true">🏆</span><strong>{{ 'Conquistas' | t }}</strong><small>{{ 'Títulos e histórico' | t }}</small>
          </button>
          <a [routerLink]="['/menu/teams/competitions']" [queryParams]="{teamId:t.id}">
            <span aria-hidden="true">⚔️</span><strong>{{ 'Competições' | t }}</strong><small>{{ 'Encontrar torneios e campeonatos' | t }}</small>
          </a>
        </div>
      </section>
      <section *ngIf="activeTab === 'SQUAD'"><h2>{{ 'Plantel ({{members}})' | t:{members: (rosterVerified ? members.length : '—')} }}</h2>
        <p *ngIf="!rosterVerified" role="alert">{{ 'Não foi possível confirmar o plantel. As opções de gestão estão temporariamente bloqueadas.' | t }}</p>
        <div class="team-roster-toolbar" *ngIf="rosterVerified && members.length > 4">
          <label for="team-roster-filter">{{ 'Encontrar jogador' | t }}</label>
          <input id="team-roster-filter" type="search" [(ngModel)]="rosterQuery" maxlength="80" [placeholder]="'Pesquisar pelo nome de utilizador' | t" autocomplete="off">
          <span role="status">{{ '{{visibleRosterCount}} de {{membersCount}} jogadores' | t:{visibleRosterCount: (visibleRoster.length), membersCount: (members.length)} }}</span>
        </div>
        <div class="team-roster" *ngIf="rosterVerified && visibleRoster.length">
          <article class="team-member" *ngFor="let player of visibleRoster; trackBy: trackRosterMember">
            <a class="team-member-avatar team-member-profile-link" [routerLink]="['/menu/profiles',player.username]" [attr.aria-label]="('Abrir perfil de @{{username}}' | t:{username: player.username})">
              <img *ngIf="playerAvatarSrc(player.profilePicUrl) && !brokenPlayerAvatars.has(player.profileId)"
                [src]="playerAvatarSrc(player.profilePicUrl)!" loading="lazy" decoding="async"
                (error)="brokenPlayerAvatars.add(player.profileId)" alt="">
              <ng-container *ngIf="!playerAvatarSrc(player.profilePicUrl) || brokenPlayerAvatars.has(player.profileId)">{{ (player.username || 'J').charAt(0).toUpperCase() }}</ng-container>
            </a>
            <div class="team-member-identity">
              <a class="team-member-name" [routerLink]="['/menu/profiles',player.username]">{{player.fullName || player.username}}</a>
              <span class="team-member-handle">@{{player.username}}<ng-container *ngIf="player.shirtNumber != null"> · nº {{player.shirtNumber}}</ng-container><ng-container *ngIf="player.position"> · {{player.position}}</ng-container></span>
              <span *ngIf="player.bio" class="team-member-bio">{{player.bio}}</span>
            </div>
            <span class="team-member-role" [class.team-member-role-owner]="player.role === 'OWNER'">
              {{player.role === 'OWNER' ? ('Responsável' | t) : ('Jogador' | t)}}
            </span>
            <div class="team-member-actions">
              <a class="team-member-open" [routerLink]="['/menu/profiles',player.username]" [attr.aria-label]="('Ver perfil de @{{username}}' | t:{username: player.username})" [title]="'Ver perfil' | t">↗</a>
              <button *ngIf="isOwner && player.role !== 'OWNER'" type="button" class="team-member-remove"
                [attr.aria-label]="('Remover @{{username}} da equipa' | t:{username: player.username})" [title]="'Remover jogador da equipa' | t"
                [disabled]="busy || !rosterVerified" (click)="removePlayer(player)">{{ 'Remover' | t }}</button>
            </div>
          </article>
        </div>
        <p *ngIf="rosterVerified && members.length === 0">{{ 'Ainda não existem jogadores no plantel.' | t }}</p>
        <p *ngIf="rosterVerified && members.length > 0 && !visibleRoster.length" role="status">{{ 'Não existem jogadores que correspondam à pesquisa.' | t }}</p>
        <button *ngIf="rosterVerified && isMember && !isOwner" type="button"
          class="team-leave-button" [disabled]="busy"
          (click)="leaveTeam()">{{ 'Sair da equipa' | t }}</button>
        <div *ngIf="isOwner && rosterVerified" class="team-player-search">
          <h3>{{ 'Convites pendentes ({{pendingPlayers}})' | t:{pendingPlayers: (invitationsVerified?pendingPlayers.length:'—')} }}</h3>
          <p *ngIf="!invitationsVerified" role="alert">{{ 'Não foi possível confirmar os convites. Novos envios bloqueados.' | t }}</p>
          <p class="team-content-note" *ngIf="invitationsVerified">{{ 'Convites sincronizados automaticamente.' | t }}</p>
          <p *ngIf="invitationsVerified && !pendingPlayers.length" class="team-empty-hint">{{ 'Não tens convites por responder.' | t }}</p>
          <div *ngFor="let invite of (invitationsVerified?pendingPlayers:[]); trackBy: trackPendingPlayer" class="team-candidate team-invite-card">
            <a class="team-candidate-avatar team-member-profile-link" [routerLink]="['/menu/profiles',invite.username]" [attr.aria-label]="('Abrir perfil de @{{username}}' | t:{username: invite.username})">{{(invite.username || 'J').slice(0,1).toUpperCase()}}</a>
            <div class="team-candidate-identity">
              <a [routerLink]="['/menu/profiles',invite.username]">@{{invite.username}}</a>
              <small>{{ 'A aguardar resposta' | t }}</small>
            </div>
            <button type="button" [disabled]="busy || pendingLoading" (click)="cancelPendingInvitation(invite)">{{ 'Cancelar convite' | t }}</button>
          </div>
          <h3>{{ 'Convidar jogadores' | t }}</h3>
          <div class="search-community team-player-discovery">
            <label for="team-player-query">{{ 'Nome ou utilizador' | t }}</label>
            <input id="team-player-query" type="search" [(ngModel)]="playerQuery" (ngModelChange)="invalidatePlayerSearch()"
              maxlength="80" [placeholder]="'Pesquisar jogadores na Jynlo' | t" autocomplete="off" (keyup.enter)="searchPlayers()">
            <button type="button" [disabled]="busy || searchingPlayers || playerQuery.trim().length < 2 || !invitationsVerified"
              (click)="searchPlayers()">{{ searchingPlayers ? ('A procurar…' | t) : ('Pesquisar jogadores' | t) }}</button>
          </div>
          <p *ngIf="playerSearchComplete && availablePlayers.length === 0" class="team-empty-hint" role="status">{{ 'Não encontrámos jogadores disponíveis nesta pesquisa.' | t }}</p>
          <div *ngFor="let candidate of availablePlayers; trackBy: trackCandidate" class="team-candidate team-player-result">
            <a class="team-candidate-avatar team-member-profile-link" [routerLink]="['/menu/profiles',candidate.username]" [attr.aria-label]="('Abrir perfil de @{{username}}' | t:{username: candidate.username})">{{(candidate.username || 'J').slice(0,1).toUpperCase()}}</a>
            <div class="team-candidate-identity">
              <a [routerLink]="['/menu/profiles',candidate.username]">{{candidate.fullName || candidate.username}}</a>
              <small>@{{candidate.username}}</small>
            </div>
            <button type="button" [attr.aria-label]="('Convidar @{{username}} para a equipa' | t:{username: candidate.username})"
              [disabled]="busy || !invitationsVerified || !rosterVerified" (click)="invitePlayer(candidate)">{{ 'Convidar' | t }}</button>
          </div>
          <app-team-roster-import [teamId]="t.id" [members]="members" (imported)="loadPendingInvitations()" (rosterChanged)="refreshRoster()"></app-team-roster-import>
        </div>
      </section>
      <section *ngIf="activeTab === 'TROPHIES'" class="team-trophies"><h2>{{ '🏆 Troféus ({{championshipHonours}})' | t:{championshipHonours: (trophiesVerified ? trophies.length + championshipHonours.length : '—')} }}</h2>
        <p *ngIf="historyLoading || honoursLoading">{{ 'A carregar conquistas oficiais…' | t }}</p>
        <p *ngIf="historyError" role="alert">{{historyError}}</p>
        <p *ngIf="honoursError" role="alert">{{honoursError}}</p>
        <button type="button" *ngIf="!historyLoading && !honoursLoading && (historyError || honoursError)"
          (click)="retryTrophies()">{{ 'Voltar a tentar carregar troféus' | t }}</button>
        <p *ngIf="!historyLoading && !honoursLoading && !historyError && !honoursError && !trophies.length && !championshipHonours.length">{{ 'Ainda não existem troféus oficiais nesta equipa.' | t }}</p>
        <article *ngFor="let honour of championshipHonours" class="trophy">
          <strong>🏆 {{honour.competitionName}}</strong>
          <p>{{honour.championshipName}} · {{honour.seasonLabel}} · {{honour.communityName}}</p>
          <p>{{honour.format === 'LEAGUE' ? ('Liga' | t) : honour.format === 'KNOCKOUT' ? ('Taça' | t) : honour.format === 'CHAMPIONSHIP' ? ('Campeonato' | t) : honour.format}} · {{honour.sport}}</p>
          <small>{{honour.awardedAt | date:('dd/MM/yyyy' | t)}}</small>
        </article>
        <article *ngFor="let trophy of trophies" class="trophy">
          <strong>🏆 {{trophy.tournamentName}}</strong>
          <p>{{trophy.communityName}} · {{trophy.sport || ('Modalidade não indicada' | t)}}</p>
          <small *ngIf="trophy.completedAt">{{trophy.completedAt | date:('dd/MM/yyyy' | t)}}</small>
        </article>
      </section>
      <section *ngIf="activeTab === 'TROPHIES'"><h2>{{ 'Histórico de competições ({{historyCount}})' | t:{historyCount: (history.length)} }}</h2>
        <p *ngIf="!historyLoading && !historyError && !history.length">{{ 'Ainda não participou em torneios associados à equipa.' | t }}</p>
        <p *ngFor="let entry of history"><a [routerLink]="['/menu/communities',entry.communityId]">{{entry.tournamentName}}</a> · {{entry.communityName}} — {{entry.champion ? ('🏆 Campeão' | t) : entry.archived ? ('Concluído' | t) : ('Em curso' | t)}}</p>
      </section>
      <section *ngIf="activeTab === 'OVERVIEW'" class="team-competition-next"><h2>{{ 'Competições' | t }}</h2>
        <p>{{ 'Encontra torneios e campeonatos com candidaturas abertas para esta equipa.' | t }}</p>
        <a routerLink="/menu/teams/competitions" [queryParams]="{teamId: t.id}">{{ 'Encontrar torneios e campeonatos' | t }}</a>
      </section>
      <section *ngIf="activeTab === 'COMMUNITIES'"><h2>{{ 'Comunidades ({{activeCommunitiesCount}})' | t:{activeCommunitiesCount: (activeCommunities.length)} }}</h2>
        <div *ngFor="let item of activeCommunities; trackBy: trackTeamCommunity" class="team-community">
          <span class="team-community-avatar" aria-hidden="true">{{item.communityName.slice(0,1).toUpperCase()}}</span>
          <div class="team-community-identity">
            <a [routerLink]="['/menu/communities',item.communityId]">{{item.communityName}}</a>
            <small>{{ 'Equipa associada' | t }}</small>
          </div>
          <button *ngIf="isOwner" type="button" [disabled]="busy || !communitiesVerified"
            [attr.aria-label]="('Retirar equipa de {{communityName}}' | t:{communityName: item.communityName})"
            (click)="leaveCommunity(item)">{{ 'Sair da comunidade' | t }}</button>
        </div>
        <p *ngIf="!communitiesVerified" role="alert">{{ 'Não foi possível confirmar as comunidades. Atualiza a página antes de gerir convites.' | t }}</p>
        <p *ngIf="communitiesVerified && !activeCommunities.length">{{ 'Esta equipa ainda não está associada a comunidades.' | t }}</p>
        <ng-container *ngIf="isOwner && communitiesVerified">
          <h3>{{ 'Convites para comunidades ({{invitationsCount}})' | t:{invitationsCount: (invitations.length)} }}</h3>
          <p *ngIf="!invitations.length" class="team-empty-hint">{{ 'Não há convites pendentes.' | t }}</p>
          <div *ngFor="let item of invitations; trackBy: trackTeamCommunity" class="team-community team-community-invite">
            <span class="team-community-avatar" aria-hidden="true">{{item.communityName.slice(0,1).toUpperCase()}}</span>
            <div class="team-community-identity">
              <a [routerLink]="['/menu/communities',item.communityId]">{{item.communityName}}</a>
              <small>{{ 'Convite recebido · a aguardar decisão' | t }}</small>
            </div>
            <div class="team-community-actions">
              <button type="button" [disabled]="busy" (click)="respond(item.id,true)">{{ 'Aceitar' | t }}</button>
              <button type="button" [disabled]="busy" (click)="respond(item.id,false)">{{ 'Recusar' | t }}</button>
            </div>
          </div>
          <h3>{{ 'Encontrar comunidades' | t }}</h3>
          <p>{{ 'Pesquisa comunidades públicas e pede adesão em nome desta equipa.' | t }}</p>
          <div class="search-community team-community-search">
            <label for="team-community-query">{{ 'Nome da comunidade' | t }}</label>
            <input id="team-community-query" type="search" [(ngModel)]="communityQuery"
              (ngModelChange)="invalidateCommunitySearch()" maxlength="100" [placeholder]="'Pesquisar comunidades' | t"
              (keyup.enter)="searchCommunities()" autocomplete="off">
            <button type="button" [disabled]="busy || searchingCommunities || communityQuery.trim().length < 2"
              (click)="searchCommunities()">{{searchingCommunities?('A pesquisar…' | t):('Pesquisar' | t)}}</button>
          </div>
          <p *ngIf="communitySearchComplete && !communityResults.length" role="status" class="team-empty-hint">
            {{ 'Não encontramos comunidades para esta pesquisa.' | t }}
          </p>
          <div *ngFor="let candidate of communityResults; trackBy: trackCommunityCandidate" class="team-community team-community-discovery">
            <span class="team-community-avatar" aria-hidden="true">{{candidate.name.slice(0,1).toUpperCase()}}</span>
            <div class="team-community-identity">
              <a [routerLink]="['/menu/communities',candidate.id]">{{candidate.name}}</a>
              <small>{{candidate.sport||('Várias modalidades' | t)}}</small>
            </div>
            <button type="button" [disabled]="busy || hasCommunity(candidate.id)"
              (click)="requestCommunity(candidate.id)">
              {{hasCommunity(candidate.id)?('Pedido existente' | t):('Pedir adesão' | t)}}
            </button>
          </div>
        </ng-container>
      </section>
      <section *ngIf="activeTab === 'SETTINGS' && isOwner && rosterVerified" class="team-settings">
        <section *ngIf="isOwner" class="team-branding" [attr.aria-label]="'Personalizar identidade da equipa' | t">
        <div class="team-branding-heading">
          <div><h2>{{ 'Identidade da equipa' | t }}</h2><p>{{ 'Logótipo e cores oficiais, visíveis no perfil e nos cartões.' | t }}</p></div>
          <span>{{ 'Responsável' | t }}</span>
        </div>
        <app-team-crest-editor [teamName]="t.name" [savedDesign]="t.crestDesign" [disabled]="brandingSaving" (generated)="saveGeneratedCrest($event)"></app-team-crest-editor>
        <div class="team-logo-actions">
          <label class="team-upload">{{ 'Adicionar ou mudar logótipo' | t }}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" [disabled]="brandingSaving"
              (change)="uploadTeamLogo($event)">
          </label>
          <button type="button" *ngIf="t.logoUrl" (click)="removeTeamLogo()" [disabled]="brandingSaving">{{ 'Remover logótipo' | t }}</button>
        </div>
        <section class="team-kit-editor" [attr.aria-label]="'Editor de equipamentos' | t">
          <div class="team-kit-collection" role="group" [attr.aria-label]="'Selecionar conjunto de equipamento' | t">
            <button type="button" *ngFor="let choice of kitKinds"
              [disabled]="brandingSaving"
              [attr.aria-pressed]="activeKitKind===choice.id"
              [class.selected]="activeKitKind===choice.id"
              (click)="switchKit(choice.id)">{{ choice.label | t }}</button>
          </div>
          <button type="button" *ngIf="activeKitKind!=='PRIMARY'"
            class="team-kit-remove-variant" [disabled]="brandingSaving"
            (click)="removeCurrentVariant()">{{ (activeKitKind==='ALTERNATE'?'Eliminar desenho alternativo':'Eliminar desenho de treino') | t }}</button>
          <div class="team-kit-editor-heading">
            <div><h3>{{ 'Desenhar equipamento' | t }}</h3>
              <p>{{ 'Escolhe o modelo e as cores. Vê o resultado em grande antes de guardar.' | t }}</p></div>
            <span class="team-kit-preview-tag">{{ 'PRÉ-VISUALIZAÇÃO' | t }}</span>
          </div>
          <div class="team-kit-designer">
            <div class="team-kit-preview-stage">
              <svg class="team-kit-big-shirt" viewBox="0 0 320 336" role="img"
                   [attr.aria-label]="('Pré-visualização {{garmentLabel}}, padrão {{kitLabel}}' | t:{garmentLabel: garmentLabel(kitGarment), kitLabel: kitLabel(kitPattern)})">
                <defs>
                  <clipPath id="jynloTeamKitOutline"><path [attr.d]="kitGarmentPath"/>
                  </clipPath>
                  <linearGradient id="jynloTeamKitShading" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stop-color="#ffffff" stop-opacity=".22"/>
                    <stop offset=".46" stop-color="#ffffff" stop-opacity="0"/>
                    <stop offset="1" stop-color="#00121a" stop-opacity=".26"/>
                  </linearGradient>
                </defs>
                <g clip-path="url(#jynloTeamKitOutline)">
                  <rect x="0" y="0" width="320" height="336" [attr.fill]="kitPrimary"/>
                  <ng-container *ngIf="kitPattern === 'STRIPES'">
                    <rect *ngFor="let x of kitStripePositions" [attr.x]="x" y="0" width="22" height="336"
                      [attr.fill]="kitSecondary"/>
                  </ng-container>
                  <path *ngIf="kitPattern === 'DIAGONAL'" d="M260 -40 340 2 82 362 -4 318Z" [attr.fill]="kitSecondary"/>
                  <ng-container *ngIf="kitPattern === 'HOOPS'">
                    <rect *ngFor="let y of kitHoopPositions" x="0" [attr.y]="y" width="320" height="35" [attr.fill]="kitSecondary"/>
                  </ng-container>
                  <rect *ngIf="kitPattern === 'HALVES'" x="160" y="0" width="160" height="336" [attr.fill]="kitSecondary"/>
                  <path *ngIf="kitPattern === 'CHEVRON'" d="M-20 65 160 226 340 65 340 112 160 274 -20 112Z" [attr.fill]="kitSecondary"/>
                  <rect x="0" y="0" width="320" height="336" fill="url(#jynloTeamKitShading)"/>
                </g>
                <path [attr.d]="kitGarmentPath" fill="none" stroke="#eafffa" stroke-opacity=".65" stroke-width="2.5"/>
                <path *ngIf="kitGarment==='jersey'||kitGarment==='polo'" d="M112 30 Q126 57 160 57 Q194 57 208 30 L196 20 Q160 43 124 20Z"
                  [attr.fill]="kitAccent" stroke="#ffffff" stroke-opacity=".6" stroke-width="2"/>
                <path *ngIf="kitGarment==='jersey'||kitGarment==='polo'" d="M91 126 57 146 M229 126 263 146 M91 290 Q160 312 229 290"
                  fill="none" [attr.stroke]="kitAccent" stroke-width="6" stroke-opacity=".8"/>
                <g *ngIf="kitSide==='back'" text-anchor="middle" fill="#ffffff" stroke="#09232a" stroke-width="0.8" paint-order="stroke"
                   font-family="Arial,sans-serif" font-weight="900">
                  <text x="160" y="113" font-size="19">{{kitPlayerName.slice(0,14).toUpperCase()}}</text>
                  <text x="160" y="225" font-size="100">{{kitPlayerNumber.slice(0,2)}}</text>
                </g>
              </svg>
              <div class="team-kit-preview-caption">
                <strong>{{ kitLabel(kitPattern) }}</strong>
                <span>{{ 'Equipamento da equipa · Visualização ilustrativa' | t }}</span>
                <div class="team-kit-swatch-pair" aria-hidden="true">
                  <i [style.background]="kitPrimary"></i><i [style.background]="kitSecondary"></i>
                </div>
              </div>
            </div>
            <div class="team-kit-config">
              <div role="group" [attr.aria-label]="'Visualizar frente ou costas' | t" class="team-kit-side-controls">
                <button type="button" [attr.aria-pressed]="kitSide==='front'" (click)="kitSide='front'">{{ 'Frente' | t }}</button>
                <button type="button" [attr.aria-pressed]="kitSide==='back'" (click)="kitSide='back'">{{ 'Costas' | t }}</button>
              </div>
              <div *ngIf="kitSide==='back'" class="team-kit-back-fields">
                <label>{{ 'Nome ilustrativo' | t }} <input [(ngModel)]="kitPlayerName" maxlength="14" [placeholder]="'ATLETA' | t" [disabled]="brandingSaving"></label>
                <label>{{ 'Número ilustrativo' | t }} <input [(ngModel)]="kitPlayerNumber" maxlength="2" inputmode="numeric" pattern="[0-9]*" placeholder="10" [disabled]="brandingSaving"></label>
              </div>
              <label class="team-garment-control">{{ 'Tipo de equipamento — pré-visualização' | t }}
                <select [(ngModel)]="kitGarment" [disabled]="brandingSaving">
                  <option value="jersey">{{ 'Camisola de jogo' | t }}</option><option value="singlet">{{ 'Singlet / atletismo' | t }}</option>
                  <option value="vest">{{ 'Colete de treino' | t }}</option><option value="polo">{{ 'Polo / golfe' | t }}</option>
                  <option value="cycling">{{ 'Jersey de ciclismo' | t }}</option><option value="rashguard">{{ 'Rashguard / combate' | t }}</option>
                </select></label>
              <p class="team-kit-save-hint">{{ 'O tipo de peça, as cores, o padrão, o nome e o número são guardados na equipa. O nome e número são exemplos de personalização, não dados de cada atleta.' | t }}</p>
              <div class="team-kit-color-row">
                <label>{{ 'Cor principal' | t }} <input type="color" [(ngModel)]="kitPrimary" [disabled]="brandingSaving"></label>
                <label>{{ 'Cor secundária' | t }} <input type="color" [(ngModel)]="kitSecondary" [disabled]="brandingSaving"></label>
                <label>{{ 'Cor de destaque' | t }} <input type="color" [(ngModel)]="kitAccent" [disabled]="brandingSaving"></label>
              </div>
              <fieldset class="team-pattern-options" [disabled]="brandingSaving" [attr.aria-label]="'Desenho do equipamento' | t">
                <legend>{{ 'Padrão de cores' | t }}</legend>
                <div class="team-pattern-grid">
                  <button *ngFor="let option of kitPatterns" type="button"
                    [class.chosen]="kitPattern === option.id"
                    [attr.aria-pressed]="kitPattern === option.id"
                    (click)="kitPattern = option.id">
                    <span class="team-shirt pattern-sample" [class]="'team-shirt pattern-sample kit-' + option.id.toLowerCase()"
                      [style.--shirt-primary]="kitPrimary" [style.--shirt-secondary]="kitSecondary" aria-hidden="true"></span>
                    <span>{{ option.label | t }}</span>
                    <small *ngIf="kitPattern === option.id">{{ 'Selecionado' | t }}</small>
                  </button>
                </div>
              </fieldset>
              <p class="team-kit-save-hint">{{ 'As alterações só ficam oficiais depois de guardares o equipamento.' | t }}</p>
              <button type="button" class="team-branding-save" [disabled]="brandingSaving" (click)="saveTeamKit()">
                {{brandingSaving?('A guardar…' | t):('Guardar equipamento' | t)}}
              </button>
            </div>
          </div>
        </section>
      </section>
      <section *ngIf="isOwner" class="team-danger-zone" [attr.aria-label]="'Administração da equipa' | t">
        <div>
          <strong>{{ 'Administração da equipa' | t }}</strong>
          <p>{{ 'A eliminação só é permitida se não existirem jogadores, convites, mensagens, competições ou associações guardadas. O histórico é protegido.' | t }}</p>
        </div>
        <button type="button" class="team-delete-button" [disabled]="deletingTeam || busy || brandingSaving || featureSaving"
          (click)="deleteTeam()">{{deletingTeam ? ('A eliminar…' | t) : ('Eliminar equipa' | t)}}</button>
      </section>
      </section>
      <section *ngIf="activeTab === 'FEED'" class="team-feature">
        <div class="team-feature-title">
          <h2>{{ 'Publicações' | t }}</h2>
          <details *ngIf="isOwner" class="team-feature-settings">
            <summary [attr.aria-label]="('Definições de feed' | t)">⚙ <span>{{ 'Definições' | t }}</span></summary>
            <button type="button" [disabled]="featureSaving"
              (click)="toggleFeature('feedEnabled')">{{ t.feedEnabled ? ('Desativar feed' | t) : ('Ativar feed' | t) }}</button>
            <button type="button" [disabled]="featureSaving" (click)="toggleFeature('membersCanPost')">
              {{ t.membersCanPost === false ? ('Deixar todos os membros publicar' | t) : ('Só eu publico no feed e Stories' | t) }}</button>
          </details>
        </div>
        <p *ngIf="!t.feedEnabled">{{ 'Desativado pelo responsável da equipa.' | t }}</p>
        <p *ngIf="t.feedEnabled && t.membersCanPost === false" class="team-feature-note">{{ 'Só o responsável publica no feed e em Stories desta equipa.' | t }}</p>
        <app-sports-team-content *ngIf="t.feedEnabled && rosterVerified && isMember" [teamId]="t.id" kind="feed"></app-sports-team-content>
        <p *ngIf="t.feedEnabled && (!rosterVerified || !isMember)">{{ 'Disponível apenas para membros confirmados da equipa.' | t }}</p>
      </section>
      <section *ngIf="activeTab === 'CHALLENGES' && isOwner && rosterVerified">
        <app-sports-team-challenges [teamId]="t.id" [isOwner]="isOwner && rosterVerified"
          [sport]="t.sport"></app-sports-team-challenges>
      </section>
      <section *ngIf="activeTab === 'CHAT'" class="team-feature">
        <div class="team-feature-title">
          <h2>{{ 'Mensagens' | t }}</h2>
          <details *ngIf="isOwner" class="team-feature-settings">
            <summary [attr.aria-label]="('Definições de chat' | t)">⚙ <span>{{ 'Definições' | t }}</span></summary>
            <button type="button" [disabled]="featureSaving"
              (click)="toggleFeature('chatEnabled')">{{ t.chatEnabled ? ('Desativar chat' | t) : ('Ativar chat' | t) }}</button>
          </details>
        </div>
        <p *ngIf="!t.chatEnabled">{{ 'Desativado pelo responsável da equipa.' | t }}</p>
        <app-sports-team-content *ngIf="t.chatEnabled && rosterVerified && isMember" [teamId]="t.id" kind="chat"></app-sports-team-content>
        <p *ngIf="t.chatEnabled && (!rosterVerified || !isMember)">{{ 'Disponível apenas para membros confirmados da equipa.' | t }}</p>
      </section>
    </div>
  </main>
  <ng-template #state><main class="team-detail"><p role="alert">{{ error || ('A carregar equipa…' | t) }}</p><a routerLink="/menu/teams">{{ 'Voltar às equipas' | t }}</a></main></ng-template>
  `,
  styleUrls: ['./sports-team-detail.component.css']
})
export class SportsTeamDetailComponent implements OnInit, OnDestroy {
  private readonly appDialog = injectAppDialog();
  private readonly rosterSubscriptions = new Subscription();
  private rosterRequest = 0;
  private rosterLoading = false;
  team: SportsTeam | null = null;
  followerState:{count:number;following:boolean}|null=null;
  followBusy=false;
  followError='';
  private followRequest=0;
  loadTeamFollowers():void {
    const id=this.team?.id;
    if(!id)return;
    const serial=++this.followRequest;
    this.followError='';
    this.api.followerState(id).pipe(timeout(12000)).subscribe({
      next:state=>{if(this.team?.id!==id||serial!==this.followRequest)return;
        this.followerState=state;this.render();},
      error:()=>{if(this.team?.id!==id||serial!==this.followRequest)return;
        this.followerState=null;this.followError=appTranslate('Seguidores temporariamente indisponíveis.');this.render();}
    });
  }
  toggleTeamFollow():void {
    if(!this.team||!this.followerState||this.followBusy)return;
    const id=this.team.id;
    const follows=this.followerState.following;
    const serial=++this.followRequest;
    this.followBusy=true;this.followError='';
    const call=follows?this.api.unfollowTeam(id):this.api.followTeam(id);
    call.pipe(timeout(12000)).subscribe({
      next:state=>{if(this.team?.id!==id||serial!==this.followRequest)return;
        this.followerState=state;this.followBusy=false;this.render();},
      error:()=>{if(this.team?.id!==id||serial!==this.followRequest)return;
        this.followBusy=false;this.followError=appTranslate('Não foi possível confirmar a alteração.');this.loadTeamFollowers();}
    });
  }

  logoBroken=false;
  brokenPlayerAvatars=new Set<number>();
  playerAvatarSrc(url:string|null|undefined):string|null{return this.api.playerAvatarSrc(url);}
  logoSrc(url:string|null|undefined):string|null{return this.api.logoSrc(url);}
  activeTab: 'OVERVIEW' | 'SQUAD' | 'COMMUNITIES' | 'TROPHIES' | 'FEED' | 'CHAT' | 'CHALLENGES' | 'SETTINGS' = 'OVERVIEW';
  @ViewChild('teamTabs') private teamTabs?:ElementRef<HTMLElement>;
  private revealSelectedTeamTab(tab:SportsTeamDetailComponent['activeTab']):void {
    const rail=this.teamTabs?.nativeElement;
    const button=rail?.querySelector<HTMLElement>('[data-team-tab="'+tab+'"]');
    if(!rail||!button)return;
    const railRect=rail.getBoundingClientRect(),buttonRect=button.getBoundingClientRect();
    // A direct dashboard shortcut must not leave its selected tab hidden offscreen.
    if(buttonRect.left>=railRect.left&&buttonRect.right<=railRect.right)return;
    const next=rail.scrollLeft+buttonRect.left-railRect.left-16;
    const left=Math.max(0,next);
    if(typeof rail.scrollTo==='function')rail.scrollTo({left,behavior:'smooth'});
    else rail.scrollLeft=left;
  }
  private trophiesRequestedForTeam:number|null=null;
  get trophiesVerified():boolean{return this.trophiesRequestedForTeam===this.team?.id && !this.historyLoading && !this.honoursLoading && !this.historyError && !this.honoursError;}
  selectTab(tab:SportsTeamDetailComponent['activeTab']):void {
    if((tab==='SETTINGS'||tab==='CHALLENGES')&&(!this.isOwner||!this.rosterVerified))return;
    this.activeTab=tab;
    this.revealSelectedTeamTab(tab);
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
        this.honoursError=appTranslate('Não foi possível carregar os títulos dos campeonatos.');
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
        this.historyError=appTranslate('Não foi possível carregar o histórico de troféus.');
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
  trackPendingPlayer(_:number,invite:TeamPendingPlayerInvitation):number{return invite.profileId;}
  trackCandidate(_:number,candidate:SportsTeamPlayerCandidate):number{return candidate.profileId;}
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
  searchingCommunities=false;communitySearchComplete=false;
  private communitySearchVersion=0;
  trackTeamCommunity(_:number,item:TeamCommunityMembership):number{return item.id;}
  trackCommunityCandidate(_:number,item:PublicTeamCommunity):number{return item.id;}
  invalidateCommunitySearch():void{
    this.communitySearchVersion++;
    this.communityResults=[];this.communitySearchComplete=false;this.searchingCommunities=false;
  }
  isOwner=false;busy=false;featureSaving=false;deletingTeam=false;feedback='';
  kitPrimary='#16caba';kitSecondary='#f2fafc';kitPattern:TeamKitPattern='PLAIN';brandingSaving=false;
  kitGarment='jersey';
  kitAccent='#FFFFFF';
  kitSide:'front'|'back'='front';
  kitPlayerName='ATLETA';
  kitPlayerNumber='10';
  readonly kitKinds:ReadonlyArray<{id:TeamKitKind;label:string}>=[
    {id:'PRIMARY',label:'Principal'},
    {id:'ALTERNATE',label:'Alternativo'},
    {id:'TRAINING',label:'Treino'}
  ];
  activeKitKind:TeamKitKind='PRIMARY';
  kitVariants:TeamKitVariant[]=[];
  private primaryKitDraft:KitDesign|null=null;

  private currentKitDraft():KitDesign {
    return {
      primary:this.kitPrimary,secondary:this.kitSecondary,pattern:this.kitPattern,
      garment:this.kitGarment,accent:this.kitAccent,
      playerName:this.kitPlayerName,playerNumber:this.kitPlayerNumber
    };
  }
  private showKitDraft(design:KitDesign):void {
    this.kitPrimary=design.primary;this.kitSecondary=design.secondary;
    this.kitPattern=design.pattern;this.kitGarment=design.garment;
    this.kitAccent=design.accent;this.kitPlayerName=design.playerName;
    this.kitPlayerNumber=design.playerNumber;
  }
  private stashKitDraft():void {
    const design=this.currentKitDraft();
    if(this.activeKitKind==='PRIMARY') {
      this.primaryKitDraft=design;
      return;
    }
    const variant:TeamKitVariant={type:this.activeKitKind,...design};
    this.kitVariants=[
      ...this.kitVariants.filter(v=>v.type!==this.activeKitKind),variant
    ];
  }
  switchKit(type:TeamKitKind):void {
    if(this.brandingSaving||this.activeKitKind===type)return;
    this.stashKitDraft();
    this.activeKitKind=type;
    const design=type==='PRIMARY'?this.primaryKitDraft:this.kitVariants.find(v=>v.type===type);
    const base=this.primaryKitDraft||this.currentKitDraft();
    this.showKitDraft(design||{
      ...base,
      primary:type==='ALTERNATE'?base.secondary:base.primary,
      secondary:type==='ALTERNATE'?base.primary:base.secondary,
      playerName:'',playerNumber:''
    });
  }
  removeCurrentVariant():void {
    if(this.activeKitKind==='PRIMARY'||this.brandingSaving)return;
    const type=this.activeKitKind;
    this.kitVariants=this.kitVariants.filter(variant=>variant.type!==type);
    this.activeKitKind='PRIMARY';
    if(this.primaryKitDraft)this.showKitDraft(this.primaryKitDraft);
    this.feedback=appTranslate('Conjunto retirado do desenho. Guarda os equipamentos para confirmar.');
  }
  private loadKitCollection(team:SportsTeam):void {
    this.primaryKitDraft={
      primary:team.kitPrimary||'#16caba',secondary:team.kitSecondary||'#f2fafc',
      pattern:team.kitPattern||'PLAIN',
      garment:team.kitGarment||this.recommendedGarment(team.sport),
      accent:team.kitAccent||'#FFFFFF',
      playerName:team.kitPlayerName||'',playerNumber:team.kitPlayerNumber||''
    };
    this.kitVariants=(team.kitVariants||[]).filter(v=>
      v.type==='ALTERNATE'||v.type==='TRAINING').map(v=>({...v}));
    this.activeKitKind='PRIMARY';
    this.showKitDraft(this.primaryKitDraft);
  }
  recommendedGarment(sport:string|null|undefined):string {
    const value=(sport||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if(/basquet|basket|atlet|corrida|running|triat|netball/.test(value))return 'singlet';
    if(/cicl|cycling|btt|mountain bike|pista sprint/.test(value))return 'cycling';
    if(/golf|golfe/.test(value))return 'polo';
    if(/jiu|judo|luta|wrestling|mma|muay|kickbox|boxe|combat|karate/.test(value))return 'rashguard';
    return 'jersey';
  }
  garmentLabel(type:string):string{return ({jersey:appTranslate('de camisola'),singlet:appTranslate('de singlet'),vest:appTranslate('de colete'),polo:appTranslate('de polo'),cycling:appTranslate('de jersey de ciclismo'),rashguard:appTranslate('de rashguard')} as Record<string,string>)[type]||appTranslate('de equipamento');}
  get kitGarmentPath():string {
    switch(this.kitGarment){
      case 'singlet':return 'M114 32 Q135 57 160 58 Q185 57 206 32 L247 58 L231 111 L223 292 Q160 311 97 292 L89 111 L73 58 Z';
      case 'vest':return 'M118 32 Q136 57 160 57 Q184 57 202 32 L239 56 L222 125 L222 294 Q160 311 98 294 L98 125 L81 56 Z';
      case 'polo':return 'M112 30 77 42 24 93 57 146 91 126 91 290 Q160 312 229 290 L229 126 263 146 296 93 243 42 208 30 Q194 57 160 57 Q126 57 112 30Z';
      case 'cycling':return 'M112 30 76 42 27 91 57 143 91 124 90 282 Q160 298 230 282 L229 124 263 143 293 91 244 42 208 30 Q194 57 160 57 Q126 57 112 30Z';
      case 'rashguard':return 'M110 30 76 42 25 97 57 150 91 126 91 296 Q160 308 229 296 L229 126 263 150 295 97 244 42 210 30 Q194 57 160 57 Q126 57 110 30Z';
      default:return 'M112 30 77 42 24 93 57 146 91 126 91 290 Q160 312 229 290 L229 126 263 146 296 93 243 42 208 30 Q194 57 160 57 Q126 57 112 30Z';
    }
  }
  readonly kitPatterns:ReadonlyArray<{id:TeamKitPattern;label:string}>=[
    {id:'PLAIN',label:'Lisa'},{id:'STRIPES',label:'Riscas verticais'},{id:'DIAGONAL',label:'Faixa diagonal'},
    {id:'HOOPS',label:'Riscas horizontais'},{id:'HALVES',label:'Metades'},{id:'CHEVRON',label:'V frontal'}
  ];
  readonly kitStripePositions:ReadonlyArray<number>=[-30,14,58,102,146,190,234,278];
  readonly kitHoopPositions:ReadonlyArray<number>=[40,110,180,250];
  kitLabel(pattern:TeamKitPattern):string{return appTranslate(this.kitPatterns.find(p=>p.id===pattern)?.label||'Lisa');}
  private readonly maxTeamLogoBytes=5*1024*1024;
  saveTeamKit():void {
    if(!this.team||!this.isOwner||this.brandingSaving)return;
    this.stashKitDraft();
    const variants=this.kitVariants.map(v=>({...v,
      playerName:v.playerName.trim(),playerNumber:v.playerNumber.trim()}));
    const primary=this.primaryKitDraft!;
    const all=[primary,...variants];
    if(all.some(v=>v.playerName.length>14 ||
      (v.playerName && !/^[\p{L}0-9 .'-]+$/u.test(v.playerName)))){
      this.feedback=appTranslate('Nome inválido: usa até 14 letras, números, espaços, pontos, hífenes ou apóstrofos.');
      return;
    }
    if(all.some(v=>v.playerNumber && !/^[0-9]{1,2}$/.test(v.playerNumber))){
      this.feedback=appTranslate('Número inválido: indica um ou dois algarismos.');
      return;
    }
    const teamId=this.team.id;
    this.brandingSaving=true;this.feedback='';
    this.api.setKit(teamId,primary.primary,primary.secondary,primary.pattern,{
      garment:primary.garment,accent:primary.accent,
      playerName:primary.playerName.trim(),playerNumber:primary.playerNumber.trim(),
      variants
    }).pipe(timeout(15000)).subscribe({
      next:updated=>{
        if(this.team?.id!==teamId)return;
        const selected=this.activeKitKind;
        this.team=updated;this.brandingSaving=false;this.api.rememberTeam(updated);
        this.loadKitCollection(updated);
        this.switchKit(selected);
        this.feedback=appTranslate('Equipamentos principal, alternativo e de treino guardados.');this.render();
      },
      error:()=>{
        if(this.team?.id!==teamId)return;
        this.brandingSaving=false;
        this.feedback=appTranslate('Não foi possível confirmar os equipamentos. Consulta a equipa antes de repetir.');this.render();
      }
    });
  }
  saveGeneratedCrest(result:{file:File;design:string}):void {
    const {file,design}=result;
    if(!this.team||!this.isOwner||!this.rosterVerified||this.brandingSaving)return;
    if(file.type!== 'image/png'||file.size<1||file.size>this.maxTeamLogoBytes){
      this.feedback=appTranslate('O emblema gerado não é válido.');return;
    }
    const teamId=this.team.id;
    this.brandingSaving=true;this.feedback='';
    this.api.uploadLogo(teamId,file,design).pipe(timeout(30000)).subscribe({
      next:updated=>{
        if(this.team?.id!==teamId)return;
        this.team=updated;this.logoBroken=false;this.api.rememberTeam(updated);
        this.brandingSaving=false;this.feedback=appTranslate('Emblema Jynlo criado e guardado.');this.render();
      },
      error:()=>{
        if(this.team?.id!==teamId)return;
        this.brandingSaving=false;
        this.feedback=appTranslate('Não foi possível confirmar o emblema. Consulta a equipa antes de repetir.');this.render();
      }
    });
  }
  uploadTeamLogo(event:Event):void {
    const input=event.target as HTMLInputElement;
    const file=input.files?.[0];
    input.value='';
    if(!file||!this.team||!this.isOwner||this.brandingSaving)return;
    if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||
       file.size<1||file.size>this.maxTeamLogoBytes){
      this.feedback=appTranslate('Escolhe uma imagem PNG, JPG, WebP ou GIF até 5 MB.');return;
    }
    this.brandingSaving=true;this.feedback='';
    this.api.uploadLogo(this.team.id,file).pipe(timeout(30000)).subscribe({
      next:updated=>{this.team=updated;this.logoBroken=false;this.api.rememberTeam(updated);this.brandingSaving=false;
        this.feedback=appTranslate('Logótipo atualizado.');this.render();},
      error:()=>{this.brandingSaving=false;this.feedback=appTranslate('Não foi possível confirmar o logótipo. Consulta a equipa antes de repetir.');this.render();}
    });
  }
  removeTeamLogo():void {
    if(!this.team||!this.isOwner||this.brandingSaving||!this.team.logoUrl)return;
    void this.appDialog.confirm(appTranslate('Remover o logótipo da equipa?'),{danger:true}).then(ok=>{
    if(!ok||!this.team)return;
    this.brandingSaving=true;this.feedback='';
    this.api.removeLogo(this.team.id).pipe(timeout(15000)).subscribe({
      next:updated=>{this.team=updated;this.api.rememberTeam(updated);this.brandingSaving=false;
        this.feedback=appTranslate('Logótipo removido.');this.render();},
      error:()=>{this.brandingSaving=false;this.feedback=appTranslate('Não foi possível confirmar a remoção. Consulta a equipa antes de repetir.');this.render();}
    });
    });
  }

  deleteTeam():void {
    if(!this.team||!this.isOwner||this.deletingTeam||this.busy||
       this.brandingSaving||this.featureSaving||typeof window==='undefined')return;
    const current=this.team;
    void this.appDialog.confirm(appTranslate('Eliminar definitivamente a equipa "{{name}}"?',{name:current.name})+'\n\n'
      +appTranslate('Esta ação não pode ser anulada. Se houver jogadores, convites, mensagens, competições ou histórico, o servidor não permitirá a eliminação.'),{danger:true}).then(ok=>{
    if(!ok||!this.team)return;
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
          ? appTranslate('Não é possível eliminar esta equipa porque tem jogadores, convites, publicações, mensagens ou ligações históricas. Estes dados ficam protegidos.')
          : appTranslate('Não foi possível confirmar a eliminação. Consulta a equipa antes de tentares novamente.');
        this.render();
      }
    });
    });
  }

  toggleFeature(field:'chatEnabled'|'feedEnabled'|'membersCanPost'):void {
    if(!this.isOwner||!this.team||this.featureSaving)return;
    const previous=this.team;
    this.featureSaving=true;this.feedback='';
    this.api.setFeatures(previous.id,field==='chatEnabled'
      ? {chatEnabled:!previous.chatEnabled} : field==='feedEnabled' ? {feedEnabled:!previous.feedEnabled}
      : {membersCanPost:previous.membersCanPost===false}).subscribe({
      next:updated=>{this.team=updated;this.featureSaving=false;},
      error:()=>{this.feedback=appTranslate('Não foi possível confirmar a configuração. Atualiza antes de repetir.');this.featureSaving=false;}
    });
  }
  get activeCommunities(){return this.communities.filter(item=>item.status==='ACTIVE');}
  get invitations(){return this.communities.filter(item=>item.status==='PENDING_TEAM');}
  hasCommunity(id:number):boolean{return this.communities.some(item=>item.communityId===id&&item.status!=='DECLINED');}
  searchCommunities():void{
    const query=this.communityQuery.trim();
    if(!this.isOwner||!this.communitiesVerified||this.busy||this.searchingCommunities||query.length<2)return;
    const version=++this.communitySearchVersion;
    const teamId=this.team?.id;
    this.searchingCommunities=true;this.communitySearchComplete=false;this.communityResults=[];this.feedback='';
    this.communityMemberships.discover(query).pipe(timeout(15000)).subscribe({
      next:items=>{
        if(version!==this.communitySearchVersion||this.team?.id!==teamId||!this.isOwner)return;
        this.communityResults=items;this.communitySearchComplete=true;
        this.searchingCommunities=false;this.render();
      },
      error:()=>{
        if(version!==this.communitySearchVersion||this.team?.id!==teamId)return;
        this.feedback=appTranslate('Não foi possível pesquisar comunidades.');
        this.searchingCommunities=false;this.render();
      }
    });
  }
  requestCommunity(communityId:number):void{
    if(!this.team||!this.isOwner||!this.communitiesVerified||this.busy||this.hasCommunity(communityId))return;
    this.busy=true;this.feedback='';
    this.communityMemberships.request(this.team.id,communityId).subscribe({
      next:()=>{this.busy=false;this.feedback=appTranslate('Pedido enviado aos responsáveis da comunidade.');this.loadCommunities();},
      error:()=>{this.busy=false;this.communitiesVerified=false;this.feedback=appTranslate('Não foi possível confirmar o pedido. Atualiza as comunidades antes de repetir.');}
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
      error:()=>{this.busy=false;this.communitiesVerified=false;this.feedback=appTranslate('Não foi possível confirmar a resposta. Atualiza a lista antes de repetir.');}
    });
  }
  leaveCommunity(item:TeamCommunityMembership):void{
    if(!this.team||!this.isOwner||!this.communitiesVerified||this.busy)return;
    void this.appDialog.confirm(appTranslate('Retirar a equipa de {{name}}?',{name:item.communityName}),{danger:true}).then(ok=>{
    if(!ok||!this.team)return;
    this.busy=true;this.feedback='';
    this.communityMemberships.remove(item.id).subscribe({
      next:()=>{
        this.communities=this.communities.filter(row=>row.id!==item.id);
        this.busy=false;this.feedback=appTranslate('Equipa removida da comunidade.');
        this.loadCommunities();
      },
      error:()=>{
        this.busy=false;this.communitiesVerified=false;
        this.feedback=appTranslate('Não foi possível confirmar a saída. Atualiza as comunidades antes de repetir.');
      }
    });
    });
  }
  loadCommunities():void{
    if(!this.team)return;
    this.communityMemberships.teamCommunities(this.team.id).pipe(timeout(15000)).subscribe({
      next:rows=>{this.communities=rows;this.communitiesVerified=true;this.render();},
      error:()=>{this.communitiesVerified=false;this.feedback=appTranslate('Não foi possível confirmar as comunidades da equipa.');this.render();}
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
        this.searchingPlayers=false;this.feedback=appTranslate('Não foi possível pesquisar jogadores.');
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
        this.feedback=appTranslate('Não foi possível confirmar os convites pendentes.');
        this.render();
      }
    }).add(()=>{if(version===this.pendingRequest)this.pendingLoading=false;});
  }
  cancelPendingInvitation(invite:TeamPendingPlayerInvitation):void {
    if(!this.team||!this.isOwner||!this.invitationsVerified||this.busy||
      !this.pendingPlayers.some(p=>p.profileId===invite.profileId))return;
    void this.appDialog.confirm(appTranslate('Cancelar convite para @{{user}}?',{user:invite.username}),{danger:true}).then(ok=>{
    if(!ok||!this.team)return;
    const teamId=this.team.id;
    this.busy=true;this.feedback='';
    this.api.remove(teamId,invite.profileId).subscribe({
      next:()=>{this.busy=false;this.feedback='Convite cancelado.';this.loadPendingInvitations();},
      error:()=>{this.busy=false;this.invitationsVerified=false;this.pendingPlayers=[];this.feedback=appTranslate('Não foi possível confirmar o cancelamento. Verifica os convites antes de repetir.');}
    });
    });
  }
  invitePlayer(player:SportsTeamPlayerCandidate):void{
    if(!this.team||!this.isOwner||!this.rosterVerified||!this.invitationsVerified||this.busy||
      !this.availablePlayers.some(candidate=>candidate.profileId===player.profileId))return;
    const teamId=this.team.id;
    this.busy=true;this.feedback='';
    this.api.invite(teamId,player.profileId).subscribe({
      next:()=>{this.busy=false;this.playerCandidates=this.playerCandidates.filter(item=>item.profileId!==player.profileId);this.feedback=appTranslate('Convite enviado. O jogador entra no plantel quando aceitar.');this.loadPendingInvitations();},
      error:()=>{this.busy=false;this.invitationsVerified=false;this.invalidatePlayerSearch();this.feedback=appTranslate('Não foi possível confirmar o convite. Verifica os convites antes de repetir.');}
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
        if(!this.isOwner && (this.activeTab==='SETTINGS'||this.activeTab==='CHALLENGES'))
          this.activeTab='OVERVIEW';
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
    void this.appDialog.confirm(appTranslate('Sair desta equipa? Deixarás de ter acesso ao chat e às publicações privadas.'),{danger:true}).then(ok=>{
    if(!ok||!this.team)return;
    const teamId=this.team.id;
    this.busy=true;this.feedback='';
    this.api.remove(teamId,player.profileId).subscribe({
      next:()=>{
        // Remove private panels immediately; the next roster read is authoritative.
        this.isMember=false;
        this.members=this.members.filter(member=>member.profileId!==player.profileId);
        this.busy=false;
        this.feedback=appTranslate('Saíste da equipa. O acesso ao chat e às publicações foi retirado.');
        this.refreshRoster();
      },
      error:()=>{
        // A timeout may hide a committed removal: do not retry automatically.
        this.isMember=false;this.rosterVerified=false;this.busy=false;
        this.feedback=appTranslate('Não foi possível confirmar a saída. Verifica o plantel antes de tentares novamente.');
      }
    });
    });
  }
  removePlayer(player:SportsTeamMember):void{
    if(!this.team||!this.isOwner||!this.rosterVerified||this.busy||player.role==='OWNER')return;
    void this.appDialog.confirm(appTranslate('Remover @{{user}} do plantel?',{user:player.username}),{danger:true}).then(ok=>{
    if(!ok||!this.team)return;
    this.busy=true;this.feedback='';
    this.api.remove(this.team.id,player.profileId).subscribe({
      next:()=>{this.members=this.members.filter(m=>m.profileId!==player.profileId);this.busy=false;this.feedback=appTranslate('Jogador removido do plantel.');this.refreshRoster();},
      error:()=>{this.rosterVerified=false;this.isMember=false;this.busy=false;this.feedback=appTranslate('Não foi possível confirmar a remoção. Recarrega o plantel antes de repetir.');}
    });
    });
  }
  ngOnInit(): void {
    this.auth.isLoggedIn();
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isSafeInteger(id) || id <= 0) {this.error = appTranslate('Equipa inválida.'); return;}
    // Chat alerts open the team straight on its chat.
    const requestedTab = this.route.snapshot.queryParamMap?.get('tab') ?? null;
    if (requestedTab === 'chat') this.activeTab = 'CHAT';
    else if (requestedTab === 'feed') this.activeTab = 'FEED';
    // Paint the public team identity instantly when opened from a team card.
    // Private content and management remain disabled until the server verifies membership.
    this.team=this.api.rememberedTeam(id);
    this.api.detail(id).pipe(timeout(15000)).subscribe({
      next: team => {
        this.team = team;
        this.logoBroken=false;
        this.loadKitCollection(team);
        this.render();
        this.loadCommunities();
        // Trophy/history requests are unnecessary on the initial squad screen.
        // Load them once, when the user actually opens the trophies tab.
        if(this.activeTab==='TROPHIES')this.loadTrophies();
        this.loadTeamFollowers();
        this.refreshRoster();
      },
      error: () => {this.error = appTranslate('Não foi possível confirmar os dados da equipa. Tenta abrir novamente.');this.render();}
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
