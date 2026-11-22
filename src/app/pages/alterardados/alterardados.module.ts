import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { JynloSelectComponent } from '../../shared/jynlo-select/jynlo-select.component';
import { AlterardadosComponent } from './alterardados.component';
import { SportNamePipe } from '../../i18n/sport-name.pipe';

// Load this screen only when its route is opened, not on the public home page.
@NgModule({
  declarations: [AlterardadosComponent],
  imports: [SportNamePipe, 
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    JynloSelectComponent,
    RouterModule.forChild([{ path: '', component: AlterardadosComponent }])
  ]
})
export class AlterardadosModule {}
