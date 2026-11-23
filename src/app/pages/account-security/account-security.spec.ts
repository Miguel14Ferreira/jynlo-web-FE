import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AccountEmailChangeComponent } from './account-email-change.component';
import { AccountBlockedPeopleComponent } from './account-blocked-people.component';

describe('Account security', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AccountEmailChangeComponent, AccountBlockedPeopleComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('asks for the change with the current password and never clears the email locally', () => {
    const c = TestBed.createComponent(AccountEmailChangeComponent).componentInstance;
    c.currentEmail = 'old@example.com';
    c.newEmail = ' new@example.com ';
    c.currentPassword = 'segredo';
    c.submit();
    const req = http.expectOne(r => r.url.endsWith('/api/profile/me/email-change'));
    expect(req.request.body).toEqual({ newEmail: 'new@example.com', currentPassword: 'segredo' });
    req.flush({});
    expect(c.message).toContain('new@example.com');
    expect(c.currentPassword).toBe('');
    expect(c.currentEmail).toBe('old@example.com');
  });

  it('lists blocked people and removes one after unblocking', () => {
    const f = TestBed.createComponent(AccountBlockedPeopleComponent);
    f.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/blocks/users') && r.method === 'GET')
      .flush([{ username: 'ana', fullName: 'Ana' }, { username: 'rui' }]);
    f.componentInstance.unblock({ username: 'ana' });
    http.expectOne(r => r.url.endsWith('/api/blocks/users/ana') && r.method === 'DELETE').flush({ blocked: false });
    expect(f.componentInstance.people.map(p => p.username)).toEqual(['rui']);
  });
});

describe('Account security rendering', () => {
  it('shows the blocked list once it arrives (not stuck on loading)', () => {
    TestBed.configureTestingModule({
      imports: [AccountBlockedPeopleComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    });
    const http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(AccountBlockedPeopleComponent);
    f.detectChanges();
    http.expectOne(r => r.url.endsWith('/api/blocks/users')).flush([]);
    f.detectChanges();
    expect(f.nativeElement.textContent).not.toContain('common.loading');
    expect(f.nativeElement.textContent).toMatch(/bloqueaste|blocked/i);
  });
});
