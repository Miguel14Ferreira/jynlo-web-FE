import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { ConfirmTokenRegistrationComponent } from './confirm-token-registration.component';
import { AuthenticationService } from '../../services/authethication.service';
import { TEST_IMPORTS, TEST_PROVIDERS } from '../../testing/test-providers';

describe('ConfirmTokenRegistrationComponent', () => {
  let component: ConfirmTokenRegistrationComponent;
  let fixture: ComponentFixture<ConfirmTokenRegistrationComponent>;
  let auth: jasmine.SpyObj<AuthenticationService>;

  beforeEach(async () => {
    auth = jasmine.createSpyObj<AuthenticationService>(
      'AuthenticationService',
      ['confirmRegistration']
    );
    auth.confirmRegistration.and.returnValue(of({ message: 'Conta ativada' } as any));

    await TestBed.configureTestingModule({
      imports: [...TEST_IMPORTS, ConfirmTokenRegistrationComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ token: 'registration-token' })
            }
          }
        },
        { provide: AuthenticationService, useValue: auth }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmTokenRegistrationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should confirm the registration token on init', () => {
    expect(component).toBeTruthy();
    expect(auth.confirmRegistration).toHaveBeenCalledWith('registration-token');
    expect(component.successMessage).toContain('Conta ativada');
  });
});
