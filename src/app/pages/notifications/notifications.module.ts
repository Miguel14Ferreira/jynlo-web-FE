import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { NotificationsComponent } from './notifications.component';
import { NearbyAlertsPanelComponent } from './nearby-alerts-panel.component';

// Keep this feature out of the public application's initial JavaScript bundle.
@NgModule({
  declarations: [NotificationsComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    NearbyAlertsPanelComponent,
    RouterModule.forChild([{ path: '', component: NotificationsComponent }])
  ]
})
export class NotificationsModule {}
