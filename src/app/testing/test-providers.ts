import { SportNamePipe } from '../i18n/sport-name.pipe';
import { Provider } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';

import { AuthenticationService } from '../services/authethication.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import { JynloSelectComponent } from '../shared/jynlo-select/jynlo-select.component';
import { FriendsGoingComponent } from '../shared/friends-going/friends-going.component';

const authenticationServiceMock = new Proxy(
  {
    loggedInPerfilname: 'miguel',
    isLoggedIn: () => true,
    logOut: () => undefined,
    logOut2: () => undefined,
    saveToken: () => undefined,
    getToken: () => 'test-token',
    getChat: () => of([])
  } as Record<string, unknown>,
  {
    get(target, property) {
      if (property in target) {
        return target[property as string];
      }
      return () => of({});
    }
  }
);

const activatedRouteMock = {
  params: of({}),
  queryParams: of({}),
  paramMap: of(convertToParamMap({})),
  queryParamMap: of(convertToParamMap({})),
  snapshot: {
    params: {},
    queryParams: {},
    paramMap: convertToParamMap({}),
    queryParamMap: convertToParamMap({})
  }
};

export const TEST_IMPORTS = [
  SportNamePipe,
  FormsModule,
  ReactiveFormsModule,
  RouterTestingModule,
  TranslatePipe,
  JynloSelectComponent,
  FriendsGoingComponent
];

export const TEST_PROVIDERS: Provider[] = [
  { provide: AuthenticationService, useValue: authenticationServiceMock },
  { provide: ActivatedRoute, useValue: activatedRouteMock }
];
