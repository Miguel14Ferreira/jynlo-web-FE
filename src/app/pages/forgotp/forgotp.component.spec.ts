import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ForgotpComponent } from './forgotp.component';
import { AuthenticationService } from '../../services/authethication.service';
import { TEST_IMPORTS, TEST_PROVIDERS } from '../../testing/test-providers';

describe('ForgotpComponent', () => {
  let component: ForgotpComponent;
  let fixture: ComponentFixture<ForgotpComponent>;
  let auth: jasmine.SpyObj<AuthenticationService>;

  beforeEach(async () => {
    auth = jasmine.createSpyObj<AuthenticationService>('AuthenticationService', ['initiatePasswordReset']);
    auth.initiatePasswordReset.and.returnValue(of({ message: 'Email enviado' } as any));

    await TestBed.configureTestingModule({
      imports: [...TEST_IMPORTS, ForgotpComponent],
      providers: [
        ...TEST_PROVIDERS,
        { provide: AuthenticationService, useValue: auth }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ForgotpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should initiate password reset by email', () => {
    component.email = 'miguel@example.com';

    component.sendResetEmail();

    expect(auth.initiatePasswordReset).toHaveBeenCalledWith('miguel@example.com');
    expect(component.successMessage).toBe('Foi enviado um email com instruções para redefinir a palavra-passe.');
  });

  it('uses POST for the native password-reset request form', () => {
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    expect(form.getAttribute('method')).toBe('post');
    expect(form.querySelector('input[name="email"]')).not.toBeNull();
  });

});
