import { ProfileMessageActionComponent } from '../../shared/message-requests/profile-message-action.component';
import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ProtectedMediaDirective } from '../../shared/protected-media.directive';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { PerfisComponent } from './perfis.component';
import { ProfilePostViewerComponent } from './profile-post-viewer.component';
import { ProfileStoryViewerComponent } from './profile-story-viewer.component';
import { VenueSportsBadgesComponent } from '../../shared/venue-sports-badges/venue-sports-badges.component';
import { SportNamePipe } from '../../i18n/sport-name.pipe';

// Load this screen only when its route is opened, not on the public home page.
@NgModule({
  declarations: [PerfisComponent],
  imports: [SportNamePipe, ProfileMessageActionComponent, 
    CommonModule,
    ProtectedMediaDirective,
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    VenueSportsBadgesComponent,
    ProfilePostViewerComponent,
    ProfileStoryViewerComponent,
    RouterModule.forChild([{ path: '', component: PerfisComponent }])
  ]
})
export class PerfisModule {}
