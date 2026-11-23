import { CommonModule } from '@angular/common';
import { SessionCourtBookingComponent } from './session-court-booking.component';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { TranslatePipe } from '../../i18n/translate.pipe';
import { SessionDetailsComponent } from './session-details.component';
import { ChatReactionsComponent } from '../../shared/chat-reactions/chat-reactions.component';
import { SessionPaymentsPanelComponent } from './session-payments-panel.component';
import { PreviousUnpaidWarningComponent } from './previous-unpaid-warning.component';
import { SportNamePipe } from '../../i18n/sport-name.pipe';

const routes: Routes = [
  { path: '', component: SessionDetailsComponent }
];

@NgModule({
  declarations: [SessionDetailsComponent],
  imports: [SportNamePipe, CommonModule, FormsModule, ReactiveFormsModule, RouterModule.forChild(routes), TranslatePipe, ChatReactionsComponent, SessionPaymentsPanelComponent, PreviousUnpaidWarningComponent, SessionCourtBookingComponent]
})
export class SessionDetailsModule {}
