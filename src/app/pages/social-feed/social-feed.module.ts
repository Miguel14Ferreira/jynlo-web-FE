import { HomeShortcutsComponent } from '../../shared/home-shortcuts/home-shortcuts.component';
import { FirstStepsPromptComponent } from '../first-steps/first-steps-prompt.component';
import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ProtectedMediaDirective } from '../../shared/protected-media.directive';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { SocialFeedComponent } from './social-feed.component';
import { SocialStoriesComponent } from './social-stories.component';
import { MovableTextComponent } from './movable-text.component';
import { PersonalLiveRoomComponent } from './personal-live-room.component';
import { VenueSportsBadgesComponent } from '../../shared/venue-sports-badges/venue-sports-badges.component';
import { SportNamePipe } from '../../i18n/sport-name.pipe';

// Load this screen only when its route is opened, not on the public home page.
@NgModule({
  declarations: [SocialFeedComponent],
  imports: [HomeShortcutsComponent, SportNamePipe, 
    CommonModule,
    ProtectedMediaDirective,
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    VenueSportsBadgesComponent,
    SocialStoriesComponent,
    FirstStepsPromptComponent,
    MovableTextComponent,
    PersonalLiveRoomComponent,
    RouterModule.forChild([{ path: '', component: SocialFeedComponent }])
  ]
})
export class SocialFeedModule {}
