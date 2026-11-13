import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { PerfisComponent } from './perfis.component';
import { ProfilePostViewerComponent } from './profile-post-viewer.component';
import { ProfileStoryViewerComponent } from './profile-story-viewer.component';
import { VenueSportsBadgesComponent } from '../../shared/venue-sports-badges/venue-sports-badges.component';

// Load this screen only when its route is opened, not on the public home page.
@NgModule({
  declarations: [PerfisComponent],
  imports: [
    CommonModule,
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
