import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { TranslatePipe } from '../../i18n/translate.pipe';
import { CommunityCreateComponent } from '../community-create/community-create.component';
import { CommunityHabitualVenuePickerComponent } from './community-habitual-venue-picker.component';
import { CommunityInviteStepComponent } from '../community-create/community-invite-step.component';
import { CommunitiesComponent } from './communities.component';
import { CommunityDiscoveryPitchComponent } from './community-discovery-pitch.component';
import { CommunityPerformanceInsightsComponent } from './community-performance-insights.component';
import { CommunityTabsComponent } from './community-tabs.component';
import { CommunitySessionCardComponent } from './community-session-card.component';
import { CommunityOverviewStatsComponent } from './community-overview-stats.component';
import { CommunityLivePanelComponent } from './community-live-panel.component';
import { CommunityLeaderHighlightComponent } from './community-leader-highlight.component';
import { CommunityFeatureSettingsComponent } from './community-feature-settings.component';
import { CommunityDisciplinePanelComponent } from './community-discipline-panel.component';
import { CommunityTournamentSuspensionsComponent } from './community-tournament-suspensions.component';
import { CommunityTournamentEligibilityPanelComponent } from './community-tournament-eligibility-panel.component';
import { CommunityWhatsAppShareComponent } from './community-whatsapp-share.component';
import { CommunitySportManagementComponent } from './community-sport-management.component';
import { CommunityActiveSeasonCardComponent } from './community-active-season-card.component';
import { CommunitySeasonTrophiesComponent } from './community-season-trophies.component';
import { CommunityStatLeadersComponent } from './community-stat-leaders.component';
import { CommunitySpecializedStatsComponent } from './community-specialized-stats.component';
import { CommunityStatsTableComponent } from './community-stats-table.component';
import { CommunityRankingTableComponent } from './community-ranking-table.component';
import { CommunityPendingInvitesComponent } from './community-pending-invites.component';
import { CommunitySwitchComponent } from './community-switch.component';
import { CommunityCompetitionSettingsComponent } from './community-competition-settings.component';
import { CommunityRankingVisibilityComponent } from './community-ranking-visibility.component';
import { CommunitySeasonCreateFormComponent } from './community-season-create-form.component';
import { CommunitySeasonFilterComponent } from './community-season-filter.component';
import { CommunityPhotoCoverComponent } from './community-photo-cover.component';
import { ChatReactionsComponent } from '../../shared/chat-reactions/chat-reactions.component';
import { CommunityTournamentsComponent } from './community-tournaments.component';
import { KartingPodiumComponent } from './karting-podium.component';
import { KartingPalmaresComponent } from './karting-palmares.component';
import { KartingRaceTableComponent } from './karting-race-table.component';
import { CompetitionGuideComponent } from './competition-guide.component';
import { CompetitionFormatChooserComponent } from './competition-format-chooser.component';
import { TournamentClassificationNoteComponent } from './tournament-classification-note.component';
import { RaceStandingsCardComponent } from './race-standings-card.component';

const routes: Routes = [
  { path: '', component: CommunitiesComponent },
  { path: 'create', component: CommunityCreateComponent },
  { path: ':id/invite', component: CommunityInviteStepComponent },
  { path: ':id', component: CommunitiesComponent }
];

@NgModule({
  declarations: [
    CommunitiesComponent, CommunityCreateComponent, CommunityInviteStepComponent,
    CommunityTournamentsComponent
  ],
  imports: [CommonModule, FormsModule, RouterModule.forChild(routes), TranslatePipe, ChatReactionsComponent, KartingPodiumComponent, KartingPalmaresComponent, KartingRaceTableComponent,
    CompetitionGuideComponent, CompetitionFormatChooserComponent, CommunityLivePanelComponent, CommunityDiscoveryPitchComponent, CommunityPerformanceInsightsComponent, CommunityTabsComponent, CommunitySessionCardComponent, CommunityOverviewStatsComponent, CommunityLeaderHighlightComponent, CommunityFeatureSettingsComponent, CommunityDisciplinePanelComponent, CommunityTournamentSuspensionsComponent, CommunityTournamentEligibilityPanelComponent, CommunityWhatsAppShareComponent, CommunitySportManagementComponent, CommunityActiveSeasonCardComponent, CommunitySeasonTrophiesComponent, CommunityStatLeadersComponent, CommunitySpecializedStatsComponent, CommunityStatsTableComponent, CommunityRankingTableComponent, CommunityPendingInvitesComponent, CommunitySwitchComponent, CommunityCompetitionSettingsComponent, CommunityRankingVisibilityComponent, CommunitySeasonCreateFormComponent, CommunitySeasonFilterComponent, CommunityPhotoCoverComponent,
    TournamentClassificationNoteComponent, RaceStandingsCardComponent,
    CommunityHabitualVenuePickerComponent]
})
export class CommunitiesModule {}
