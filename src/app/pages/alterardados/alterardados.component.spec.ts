import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DeviceSession } from '../../services/my-profile.service';

import { AlterardadosComponent } from './alterardados.component';
import { MyProfileService } from '../../services/my-profile.service';
import { AuthenticationService } from '../../services/authethication.service';
import { TEST_IMPORTS, TEST_PROVIDERS } from '../../testing/test-providers';

describe('AlterardadosComponent', () => {
  let component: AlterardadosComponent;
  let fixture: ComponentFixture<AlterardadosComponent>;
  let service: jasmine.SpyObj<MyProfileService>;

  const profile = {
    userId: 'u1',
    username: 'miguel',
    fullName: 'Miguel Ferreira',
    nickname: 'Miguel',
    dateOfBirth: '1995-06-14',
    address: null,
    country: 'Portugal',
    location: 'Lisboa',
    postalCode: null,
    indicativePhone: '351',
    phone: '912345678',
    gender: null,
    email: 'miguel@example.com',
    favoriteSports: 'Padel',
    bio: null,
    skillLevel: null,
    availability: null,
    mfa: true,
    profilePicUrl: null,
    joinDateDisplay: null,
    lastLoginDateDisplay: null
  };

  beforeEach(async () => {
    service = jasmine.createSpyObj<MyProfileService>('MyProfileService', ['get', 'update', 'disableMfa', 'deleteAccount', 'getDeviceSessions', 'revokeDeviceSession', 'revokeOtherDeviceSessions']);
    service.get.and.returnValue(of({ ...profile }));
    service.update.and.returnValue(of({ ...profile, location: 'Sintra' }));
    service.disableMfa.and.returnValue(of({ ...profile, mfa: false }));
    service.deleteAccount.and.returnValue(of(void 0));
    service.getDeviceSessions.and.returnValue(of([]));
    service.revokeOtherDeviceSessions.and.returnValue(of(void 0));
    service.revokeDeviceSession.and.returnValue(of(void 0));

    await TestBed.configureTestingModule({
      declarations: [AlterardadosComponent],
      imports: TEST_IMPORTS,
      // Email change and blocked people are their own components with their own specs.
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [
        ...TEST_PROVIDERS,
        { provide: MyProfileService, useValue: service }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AlterardadosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('keeps photo upload controls visually disabled while the photo is saving', () => {
    component.photoEditing = true;
    component.photoSaving = true;
    fixture.detectChanges();

    const picker: HTMLLabelElement = fixture.nativeElement.querySelector('.photo-edit-actions .upload-action');
    const input: HTMLInputElement = picker.querySelector('input[type="file"]')!;
    const save: HTMLButtonElement = fixture.nativeElement.querySelector('.photo-edit-actions .photo-save-action');
    const cancel: HTMLButtonElement = fixture.nativeElement.querySelector('.photo-edit-actions .photo-cancel-action');

    expect(picker.classList.contains('jynlo-action')).toBeTrue();
    expect(picker.classList.contains('disabled')).toBeTrue();
    expect(input.disabled).toBeTrue();
    expect(save.disabled).toBeTrue();
    expect(cancel.disabled).toBeTrue();

    component.photoSaving = false;
    fixture.detectChanges();

    expect(picker.classList.contains('disabled')).toBeFalse();
    expect(input.disabled).toBeFalse();
  });

  it('lists signed-in devices without displaying bearer secrets', () => {
    const device: DeviceSession = {
      id: 'first-family',
      device: 'Windows · Edge',
      createdAt: '2026-10-24T18:00:00Z',
      expiresAt: '2026-10-31T18:00:00Z',
      current: true
    };
    service.getDeviceSessions.and.returnValue(of([device]));
    component.loadDeviceSessions();
    fixture.detectChanges();

    expect(service.getDeviceSessions).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.device-session__name').textContent)
      .toContain('Windows · Edge');
    expect(fixture.nativeElement.querySelector('.device-sessions').textContent)
      .not.toContain('refresh-token');
  });

  it('requires explicit confirmation before revoking another device', () => {
    const second: DeviceSession = {
      id: 'another-family', device: 'Android · Chrome',
      createdAt: null, expiresAt: '2026-10-31T18:00:00Z', current: false
    };
    service.getDeviceSessions.and.returnValue(of([second]));
    component.loadDeviceSessions();
    fixture.detectChanges();
    const end = fixture.nativeElement.querySelector('.device-session button') as HTMLButtonElement;
    end.click();
    fixture.detectChanges();

    expect(component.pendingRevokeId).toBe(second.id);
    expect(service.revokeDeviceSession).not.toHaveBeenCalled();
    component.revokeDevice(second);
    expect(service.revokeDeviceSession).toHaveBeenCalledWith(second.id);
    expect(component.deviceSessions.length).toBe(0);
  });

  it('requires confirmation and keeps this device signed in when ending all others', () => {
    const current: DeviceSession = {
      id: 'current-family', device: 'Windows · Edge',
      createdAt: null, expiresAt: '2026-10-31T18:00:00Z', current: true
    };
    const other: DeviceSession = {
      id: 'other-family', device: 'Android · Chrome',
      createdAt: null, expiresAt: '2026-10-31T18:00:00Z', current: false
    };
    service.getDeviceSessions.and.returnValue(of([current, other]));
    component.loadDeviceSessions();
    fixture.detectChanges();

    expect(component.hasOtherDeviceSessions).toBeTrue();
    expect(fixture.nativeElement.querySelector('.device-sessions__bulk button')).not.toBeNull();
    component.confirmRevokeOtherDevices();
    expect(service.revokeOtherDeviceSessions).not.toHaveBeenCalled();

    component.revokeOtherDevices();
    expect(service.revokeOtherDeviceSessions).toHaveBeenCalledTimes(1);
    expect(component.deviceSessions).toEqual([current]);
    expect(component.hasOtherDeviceSessions).toBeFalse();
    expect(component.pendingRevokeOtherDevices).toBeFalse();
  });

  it('never presents bulk revocation without a recognized current session', () => {
    service.getDeviceSessions.and.returnValue(of([{
      id: 'unbound', device: 'Unknown', createdAt: null,
      expiresAt: '2026-10-31T18:00:00Z', current: false
    }]));
    component.loadDeviceSessions();
    fixture.detectChanges();
    expect(component.hasOtherDeviceSessions).toBeFalse();
    expect(fixture.nativeElement.querySelector('.device-sessions__bulk')).toBeNull();
    component.revokeOtherDevices();
    expect(service.revokeOtherDeviceSessions).not.toHaveBeenCalled();
  });

  it('uses the searchable country picker and keeps profile changes in the same form', async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    const selector=root.querySelector('app-jynlo-select[name="country"]');
    expect(selector).not.toBeNull();
    expect(selector?.querySelector('.jynlo-select__value')?.textContent).toContain('Portugal');
    selector!.querySelector<HTMLButtonElement>('.jynlo-select__trigger')!.click();
    fixture.detectChanges();
    const input=selector!.querySelector<HTMLInputElement>('.jynlo-select__search')!;
    input.value='angola';
    input.dispatchEvent(new Event('input',{bubbles:true}));
    fixture.detectChanges();
    const choices=selector!.querySelectorAll<HTMLButtonElement>('.jynlo-select__option');
    expect(choices.length).toBe(1);
    choices[0].click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.profile?.country).toBe('Angola');
    component.save();
    expect(service.update).toHaveBeenCalledWith(jasmine.objectContaining({country:'Angola'}));
  });

  it('should create and load the authenticated profile', () => {
    expect(component).toBeTruthy();
    expect(service.get).toHaveBeenCalled();
    expect(component.profile?.username).toBe('miguel');
  });

  it('should update the fields from the current account form and preserve legacy data', () => {
    if (!component.profile) {
      fail('Profile should be loaded');
      return;
    }

    component.profile.nickname = 'Migas';
    component.save();

    expect(service.update).toHaveBeenCalledWith(
      jasmine.objectContaining({
        nickname: 'Migas',
        email: 'miguel@example.com',
        dateOfBirth: '1995-06-14',
        country: 'Portugal',
        location: 'Lisboa',
        fullName: 'Miguel Ferreira',
        mfa: true
      })
    );
    expect(component.toastMessage).toContain('sucesso');
  });

  it('allows editing the optional locality and sends it to the profile API', () => {
    const locationInput = fixture.nativeElement.querySelector('input[name="location"]') as HTMLInputElement;
    expect(locationInput).not.toBeNull();
    expect(locationInput.value).toBe('Lisboa');
    expect(locationInput.required).toBeFalse();
    expect(locationInput.maxLength).toBe(120);
    expect(locationInput.autocomplete).toBe('address-level2');

    locationInput.value = '  Sintra  ';
    locationInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    component.save();

    expect(service.update).toHaveBeenCalledWith(
      jasmine.objectContaining({ location: 'Sintra' })
    );
  });

  it('allows removing the locality without sending a blank string', () => {
    const locationInput = fixture.nativeElement.querySelector('input[name="location"]') as HTMLInputElement;
    locationInput.value = '   ';
    locationInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    component.save();

    expect(service.update).toHaveBeenCalledWith(
      jasmine.objectContaining({ location: null })
    );
  });

  it('disables locality editing while profile changes are being saved', async () => {
    component.saving = true;
    fixture.detectChanges();
    // NgModel applies its disabled state asynchronously.
    await fixture.whenStable();
    fixture.detectChanges();

    const locationInput = fixture.nativeElement.querySelector('input[name="location"]') as HTMLInputElement;
    expect(locationInput.disabled).toBeTrue();
  });

  it('should treat the phone as optional and clear its calling code when empty', () => {
    if (!component.profile) {
      fail('Profile should be loaded');
      return;
    }

    component.profile.phone = '';
    component.profile.indicativePhone = '351';
    component.save();

    expect(service.update).toHaveBeenCalledWith(
      jasmine.objectContaining({
        phone: null,
        indicativePhone: null
      })
    );
  });

  it('should normalize the phone exactly like registration', () => {
    if (!component.profile) {
      fail('Profile should be loaded');
      return;
    }

    component.profile.phone = '912 345 678';
    component.profile.indicativePhone = '351';
    component.save();

    expect(service.update).toHaveBeenCalledWith(
      jasmine.objectContaining({
        phone: '912345678',
        indicativePhone: '351'
      })
    );
  });

  it('should require verification before disabling active MFA', () => {
    if (!component.profile) {
      fail('Profile should be loaded');
      return;
    }

    expect(component.profile.mfa).toBeTrue();
    component.mfaDisableCode = '123456';
    const checkbox = { checked: false };

    component.onMfaToggle({ target: checkbox } as unknown as Event);

    expect(checkbox.checked).toBeTrue();
    expect(component.mfaDisablePending).toBeTrue();
    expect(component.mfaDisableCode).toBe('');
    expect(component.profile.mfa).toBeTrue();
    expect(service.disableMfa).not.toHaveBeenCalled();
    expect(component.toastMessage).toBe('');
  });

  it('should calculate sports profile completion', () => {
    expect(component.profileCompletion.percentage).toBeGreaterThan(0);
    expect(component.profileCompletion.missing.length).toBeGreaterThan(0);
  });

  it('adds a selected sport by clicking a suggestion and visibly acknowledges the change', () => {
    component.sportQuery = 'Fute';
    component.updateSportSuggestions();
    fixture.detectChanges();
    const list = fixture.nativeElement.querySelector('.sport-suggestions') as HTMLElement;
    const choice = Array.from(list.querySelectorAll('button')).find(
      item => item.textContent?.includes('Futebol')) as HTMLButtonElement;
    expect(choice).toBeTruthy();
    choice.click();
    fixture.detectChanges();
    expect(component.selectedSports).toContain('Futebol');
    expect(component.profile?.favoriteSports).toContain('Futebol');
    expect(fixture.nativeElement.querySelector('.sport-chips')?.textContent).toContain('Futebol');
    expect(fixture.nativeElement.querySelector('.sport-selection-feedback')?.textContent)
      .toContain('Guarda o perfil');
    expect(fixture.nativeElement.querySelector('.sport-selection-count')?.textContent)
      .toContain('2 desportos');
  });

  it('keeps selected sports in the update payload and removes a sport when requested', () => {
    component.addSport('Futebol');
    component.save();
    expect(service.update).toHaveBeenCalledWith(jasmine.objectContaining({
      favoriteSports: jasmine.stringMatching(/Futebol/)
    }));
    component.removeSport('Futebol');
    fixture.detectChanges();
    expect(component.selectedSports).not.toContain('Futebol');
    expect(fixture.nativeElement.querySelector('.sport-selection-feedback')?.textContent)
      .toContain('removido');
  });

  it('should expose an icon for sports', () => {
    expect(component.iconForSport('Futebol')).toBe('⚽');
    expect(component.iconForSport('Padel')).toBe('🎾');
  });

  it('should require an email before saving', () => {
    if (!component.profile) {
      fail('Profile should be loaded');
      return;
    }

    component.profile.email = '   ';
    component.save();

    expect(service.update).not.toHaveBeenCalled();
    expect(component.errorMessage).toBe('Existem campos que precisam da tua atenção.');
    expect(component.fieldErrors.email).toBe('Indica o teu email.');
  });

  it('should not delete the account when the confirmation username is wrong', () => {
    component.openAccountDeletion();
    component.accountDeletionConfirmation = 'another-user';

    component.deleteAccount();

    expect(service.deleteAccount).not.toHaveBeenCalled();
    expect(component.errorMessage).toContain('utilizador');
  });

  it('should delete the authenticated account and clear the local session', () => {
    const authenticationService = TestBed.inject(AuthenticationService);
    const logoutSpy = spyOn(authenticationService, 'logOut').and.callThrough();

    component.openAccountDeletion();
    component.accountDeletionConfirmation = 'miguel';
    component.deleteAccount();

    expect(service.deleteAccount).toHaveBeenCalled();
    expect(logoutSpy).toHaveBeenCalled();
  });

  it('uses premium gender and skill selectors without changing the persisted values on initial render', async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    const gender=root.querySelector<HTMLElement>('app-jynlo-select[name="gender"]')!;
    const skill=root.querySelector<HTMLElement>('app-jynlo-select[name="skillLevel"]')!;
    expect(gender).not.toBeNull();
    expect(skill).not.toBeNull();
    expect(component.profile?.gender).toBeNull();
    expect(component.profile?.skillLevel).toBeNull();

    gender.querySelector<HTMLButtonElement>('.jynlo-select__trigger')!.click();
    fixture.detectChanges();
    const male=Array.from(gender.querySelectorAll<HTMLButtonElement>('.jynlo-select__option'))
      .find(item=>item.textContent?.includes('Masculino'));
    expect(male).toBeDefined();
    male!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.profile?.gender).toBe('masculino');

    skill.querySelector<HTMLButtonElement>('.jynlo-select__trigger')!.click();
    fixture.detectChanges();
    const advanced=Array.from(skill.querySelectorAll<HTMLButtonElement>('.jynlo-select__option'))
      .find(item=>item.textContent?.includes('Avançado'));
    expect(advanced).toBeDefined();
    advanced!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.profile?.skillLevel).toBe('ADVANCED');
    component.save();
    expect(service.update).toHaveBeenCalledWith(jasmine.objectContaining({
      country:'Portugal', gender:'masculino', skillLevel:'ADVANCED'
    }));
  });
});
