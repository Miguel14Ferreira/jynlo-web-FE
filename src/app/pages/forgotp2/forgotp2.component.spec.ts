import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { Forgotp2Component } from './forgotp2.component';
import { AuthenticationService } from '../../services/authethication.service';
import { TEST_IMPORTS, TEST_PROVIDERS } from '../../testing/test-providers';

describe('Forgotp2Component', () => {
  let component: Forgotp2Component;
  let fixture: ComponentFixture<Forgotp2Component>;
  let auth: jasmine.SpyObj<AuthenticationService>;

  beforeEach(async () => {
    auth = jasmine.createSpyObj<AuthenticationService>('AuthenticationService', ['confirmPasswordReset']);
    auth.confirmPasswordReset.and.returnValue(of({ message: 'Atualizada' } as any));

    await TestBed.configureTestingModule({
      imports: [...TEST_IMPORTS, Forgotp2Component],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ token: 'reset-token' }) } }
        },
        { provide: AuthenticationService, useValue: auth }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Forgotp2Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should confirm password reset using only the token', () => {
    component.newPassword = 'new-password-123';
    component.confirmPassword = 'new-password-123';

    component.resetPassword();

    expect(auth.confirmPasswordReset).toHaveBeenCalledWith('reset-token', 'new-password-123');
    expect(component.successMessage).toBe('Palavra-passe alterada com sucesso.');
  });

  it('uses POST so password fields cannot be submitted in a GET URL', () => {
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    expect(form.getAttribute('method')).toBe('post');
    expect(form.querySelector('input[name="newPassword"]')).not.toBeNull();
    expect(form.querySelector('input[name="confirmPassword"]')).not.toBeNull();
  });

});
