import { FriendsGoingComponent } from '../../shared/friends-going/friends-going.component';
import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { DiscoverComponent } from './discover.component';
import { SessionDiscoveryMapComponent } from './session-discovery-map.component';
import { SportNamePipe } from '../../i18n/sport-name.pipe';

// Load this screen only when its route is opened, not on the public home page.
@NgModule({
  declarations: [DiscoverComponent, SessionDiscoveryMapComponent],
  imports: [SportNamePipe, FriendsGoingComponent, 
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    RouterModule.forChild([{ path: '', component: DiscoverComponent }])
  ]
})
export class DiscoverModule {}
