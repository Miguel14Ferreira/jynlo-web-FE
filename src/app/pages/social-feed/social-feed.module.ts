import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { SocialFeedComponent } from './social-feed.component';
import { SocialStoriesComponent } from './social-stories.component';
import { MovableTextComponent } from './movable-text.component';
import { PersonalLiveRoomComponent } from './personal-live-room.component';
import { VenueSportsBadgesComponent } from '../../shared/venue-sports-badges/venue-sports-badges.component';

// Load this screen only when its route is opened, not on the public home page.
@NgModule({
  declarations: [SocialFeedComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    VenueSportsBadgesComponent,
    SocialStoriesComponent,
    MovableTextComponent,
    PersonalLiveRoomComponent,
    RouterModule.forChild([{ path: '', component: SocialFeedComponent }])
  ]
})
export class SocialFeedModule {}
