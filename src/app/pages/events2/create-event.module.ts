import { SportNamePipe } from '../../i18n/sport-name.pipe';
import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { TranslatePipe } from '../../i18n/translate.pipe';
import { Events2Component } from './events2.component';
import { LocationMethodSelectorComponent } from '../../shared/location-method-selector/location-method-selector.component';
import { JynloSelectComponent } from '../../shared/jynlo-select/jynlo-select.component';

const routes: Routes = [
  { path: '', component: Events2Component }
];

@NgModule({
  declarations: [Events2Component],
  imports: [SportNamePipe, CommonModule, FormsModule, RouterModule.forChild(routes), TranslatePipe, LocationMethodSelectorComponent, JynloSelectComponent]
})
export class CreateEventModule {}
