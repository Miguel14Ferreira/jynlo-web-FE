import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { takeRegistrationDestination } from '../../shared/registration-return-url';
import { of } from 'rxjs';

import { CreateaccountComponent } from './createaccount.component';
import { AuthenticationService } from '../../services/authethication.service';
import { TEST_IMPORTS, TEST_PROVIDERS } from '../../testing/test-providers';

describe('CreateaccountComponent', () => {
  let component: CreateaccountComponent;
  let fixture: ComponentFixture<CreateaccountComponent>;
  let auth: jasmine.SpyObj<AuthenticationService>;
  let queryParamMap: ReturnType<typeof convertToParamMap>;

  beforeEach(async () => {
    queryParamMap = convertToParamMap({});
    auth = jasmine.createSpyObj<AuthenticationService>('AuthenticationService', ['register', 'resendRegistrationConfirmation']);
    auth.register.and.returnValue(of({ message: 'Conta criada' } as any));
    auth.resendRegistrationConfirmation.and.returnValue(of({ message: 'Email reenviado' } as any));

    await TestBed.configureTestingModule({
      imports: [...TEST_IMPORTS, CreateaccountComponent],
      providers: [
        ...TEST_PROVIDERS,
        { provide: AuthenticationService, useValue: auth },
        { provide: ActivatedRoute, useValue: { snapshot: { get queryParamMap() { return queryParamMap; } } } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CreateaccountComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => localStorage.removeItem('jynlo-registration-destination'));

  function fillValidForm(): void {
    component.username = 'miguel';
    component.password = 'password-123';
    component.confirmPassword = 'password-123';
    component.nickname = 'Miguel';
    component.dateOfBirth = '1990-01-01';
    component.country = 'Portugal';
    component.gender = 'masculino';
    component.email = 'miguel@example.com';
    component.acceptedLegalTerms = true;
  }

  it('allows submitting to show missing required fields', () => {
    const form = fixture.nativeElement.querySelector('form.register-card') as HTMLFormElement;
    const submit = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(form.getAttribute('method')).toBe('post');
    expect(submit.disabled).toBeFalse();
    submit.click();
    fixture.detectChanges();
    expect(auth.register).not.toHaveBeenCalled();
    expect(component.errorMessage).toBeTruthy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('explains the shared session invitation during account creation', () => {
    queryParamMap =
      convertToParamMap({ returnUrl: '/menu/events/42' });
    fixture.detectChanges();

    expect(component.hasSharedSessionInvitation).toBeTrue();
    const message = fixture.nativeElement.querySelector('.invitation-context') as HTMLElement;
    expect(message).not.toBeNull();
    expect(message.textContent).toContain('jogo partilhado');
    expect(message.textContent).toContain('confirmares o email');
  });

  it('does not show a shared session invitation without a valid session link', () => {
    for (const returnUrl of [null, '/menu/feed', '/menu/events/not-a-number', 'https://example.com']) {
      queryParamMap =
        convertToParamMap(returnUrl === null ? {} : { returnUrl });
      fixture.detectChanges();

      expect(component.hasSharedSessionInvitation).toBeFalse();
      expect(fixture.nativeElement.querySelector('.invitation-context')).toBeNull();
    }
  });

  it('should register using only the public registration contract', () => {
    fillValidForm();

    component.register();

    expect(auth.register).toHaveBeenCalledWith(
      jasmine.objectContaining({
        username: 'miguel',
        email: 'miguel@example.com',
        indicativePhone: null,
        phone: null,
        acceptedLegalTerms: true
      }),
      undefined
    );
    expect(component.successMessage).toContain('Conta criada');
  });

  it('should send a shared session ID in the registration request', () => {
    queryParamMap = convertToParamMap({ returnUrl: '/menu/events/42' });
    fillValidForm();

    component.register();

    expect(auth.register).toHaveBeenCalledWith(
      jasmine.objectContaining({ returnSessionId: 42 }),
      undefined
    );
  });

  it('should keep the shared session destination after creating an account', () => {
    queryParamMap = convertToParamMap({ returnUrl: '/menu/events/42' });
    fillValidForm();

    component.register();

    expect(takeRegistrationDestination()).toBe('/menu/events/42');
  });

  it('keeps an invited community when a user registers with a WhatsApp link', () => {
    queryParamMap = convertToParamMap({ returnUrl: '/menu/communities/42' });
    fillValidForm();

    component.register();

    expect(takeRegistrationDestination()).toBe('/menu/communities/42');
    expect(auth.register).toHaveBeenCalledWith(
      jasmine.objectContaining({ returnSessionId: null, returnCommunityId: 42 }),
      undefined
    );
  });

  it('shows the community invitation context while registering', () => {
    queryParamMap = convertToParamMap({ returnUrl: '/menu/communities/42' });
    fixture.detectChanges();
    expect(component.hasSharedCommunityInvitation).toBeTrue();
    const message = fixture.nativeElement.querySelector('.invitation-context') as HTMLElement;
    expect(message.textContent).toContain('convite para uma comunidade');
  });

  it('resends community confirmation emails with the invitation ID', () => {
    queryParamMap = convertToParamMap({ returnUrl: '/menu/communities/42' });
    component.username = 'miguel';
    spyOn<any>(component, 'startResendCooldown');
    component.resendConfirmation();
    expect(auth.resendRegistrationConfirmation).toHaveBeenCalledWith('miguel', null, 42);
  });

  it('should discard external destinations after creating an account', () => {
    queryParamMap = convertToParamMap({ returnUrl: 'https://example.com' });
    fillValidForm();

    component.register();

    expect(takeRegistrationDestination()).toBeNull();
    expect(auth.register).toHaveBeenCalledWith(
      jasmine.objectContaining({ returnSessionId: null }),
      undefined
    );
  });

  it('keeps the shared session when resending the registration confirmation email', () => {
    queryParamMap =
      convertToParamMap({ returnUrl: '/menu/events/42' });
    component.username = 'miguel';
    spyOn<any>(component, 'startResendCooldown');

    component.resendConfirmation();

    expect(auth.resendRegistrationConfirmation).toHaveBeenCalledWith('miguel', 42);
  });

  it('does not attach a session when resending a normal registration', () => {
    component.username = 'miguel';
    spyOn<any>(component, 'startResendCooldown');

    component.resendConfirmation();

    expect(auth.resendRegistrationConfirmation).toHaveBeenCalledWith('miguel', null);
  });

  it('should reject registration without legal acceptance', () => {
    fillValidForm();
    component.acceptedLegalTerms = false;

    component.register();

    expect(auth.register).not.toHaveBeenCalled();
    expect(component.errorMessage).toContain('Termos de Utilização');
  });

  it('should reject mismatching passwords', () => {
    fillValidForm();
    component.confirmPassword = 'different-password';

    component.register();

    expect(auth.register).not.toHaveBeenCalled();
    expect(component.errorMessage).toContain('não coincidem');
  });
});
