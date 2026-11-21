import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { TranslatePipe } from '../../i18n/translate.pipe';
import { SessionDetailsComponent } from './session-details.component';
import { ChatReactionsComponent } from '../../shared/chat-reactions/chat-reactions.component';
import { SessionPaymentsPanelComponent } from './session-payments-panel.component';

const routes: Routes = [
  { path: '', component: SessionDetailsComponent }
];

@NgModule({
  declarations: [SessionDetailsComponent],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule.forChild(routes), TranslatePipe, ChatReactionsComponent, SessionPaymentsPanelComponent]
})
export class SessionDetailsModule {}
