import { JynloDateInputDirective } from '../../shared/date-input.directive';
import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { MySessionsComponent } from './my-sessions.component';
import { SportNamePipe } from '../../i18n/sport-name.pipe';

// Keep this feature out of the public application's initial JavaScript bundle.
@NgModule({
  declarations: [MySessionsComponent],
  imports: [JynloDateInputDirective, SportNamePipe, 
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    RouterModule.forChild([{ path: '', component: MySessionsComponent }])
  ]
})
export class MySessionsModule {}
