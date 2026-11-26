import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, Input } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of, Subject, throwError } from 'rxjs';

import { PublicSessionPreviewComponent } from './public-session-preview.component';
import { PublicSessionChatComponent } from './public-session-chat.component';
import { AuthenticationService } from '../../services/authethication.service';
import { I18nService } from '../../i18n/i18n.service';
import { compactSessionShareMessage } from '../../shared/session-share-message';
import { DirectChatRealtimeService } from '../../services/direct-chat-realtime.service';

@Component({selector:'app-public-session-chat',standalone:true,template:''})
class SessionChatStubComponent {
  @Input() sessionId = 0;
  @Input() authenticated = false;
  @Input() guestConfirmed = false;
  @Input() guestReceipt: string | null = null;
  @Input() returnUrl: string | null = null;
  @Input() startsAt: string | null = null;
}

describe('PublicSessionPreviewComponent', () => {
  let fixture: ComponentFixture<PublicSessionPreviewComponent>;
  let http: jasmine.SpyObj<HttpClient>;
  let authenticationService: jasmine.SpyObj<AuthenticationService>;
  let routeParamMap: ReturnType<typeof convertToParamMap>;
  let routeQueryParamMap: ReturnType<typeof convertToParamMap>;

  beforeEach(async () => {
    routeParamMap = convertToParamMap({ id: '42' });
    routeQueryParamMap = convertToParamMap({});
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['get', 'post']);
    authenticationService = jasmine.createSpyObj<AuthenticationService>(
      'AuthenticationService', ['isLoggedIn', 'hasSessionCandidate', 'login', 'saveToken', 'googleConfig', 'googleLogin', 'facebookConfig', 'confirmMfaChallenge', 'resendMfaChallenge']
    );
    authenticationService.isLoggedIn.and.returnValue(false);
    authenticationService.hasSessionCandidate.and.returnValue(false);
    authenticationService.googleConfig.and.returnValue(of({clientId:''}));
    authenticationService.facebookConfig.and.returnValue(of({appId:''}));
    TestBed.overrideComponent(PublicSessionPreviewComponent, {
      remove: { imports: [PublicSessionChatComponent] },
      add: { imports: [SessionChatStubComponent] }
    });
    await TestBed.configureTestingModule({
      imports: [PublicSessionPreviewComponent, RouterTestingModule],
      providers: [
        { provide: HttpClient, useValue: http },
        { provide: DirectChatRealtimeService, useValue: {
          sessionMessages$: new Subject(), connect: jasmine.createSpy('connect')
        } }, 
        { provide: AuthenticationService, useValue: authenticationService },
        { provide: ActivatedRoute, useValue: {
          snapshot: { get paramMap() { return routeParamMap; },
                      get queryParamMap() { return routeQueryParamMap; } }
        } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PublicSessionPreviewComponent);
  });

  afterEach(() => {
    TestBed.inject(I18nService).setLanguage('pt');
    localStorage.removeItem('d24-language');
    localStorage.removeItem('jynlo-guest-receipt:42');
    Object.keys(sessionStorage).filter(key => key.startsWith('jynlo-invite-rsvp:'))
      .forEach(key => sessionStorage.removeItem(key));
    Object.keys(localStorage).filter(key => key.startsWith('jynlo-guest-receipt:42:'))
      .forEach(key => localStorage.removeItem(key));
  });

  function render(overrides: Record<string, unknown> = {}): HTMLElement {
    http.get.and.returnValue(of({
      id: 42,
      sport: 'Padel',
      city: 'Lisboa',
      gameDate: new Date(Date.now() + 3600_000).toISOString(),
      maxParticipants: 4,
      priceAmount: 0,
      status: 'OPEN',
      gamePhoto: null,
      ...overrides
    }) as any);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function shareText(locale: 'pt-PT' | 'en-GB'): string {
    const game = fixture.componentInstance.session!;
    return compactSessionShareMessage({
      sport: game.sport, city: game.city, gameDate: game.gameDate,
      remainingPlaces: fixture.componentInstance.remainingPlaces
    }, locale);
  }

  it('confirms an anonymous player instantly, reserves a place and offers account creation', () => {
    const secret='G'.repeat(43);
    routeQueryParamMap=convertToParamMap({guest:secret});
    http.post.and.callFake(((url:string) => {
      if(url.endsWith('/guest-roster')) return of({sessionId:42,communityId:5,players:[{id:7,name:'Amigo Histórico'}]});
      if(url.endsWith('/guest-preview')) return of({id:42,sport:'Futebol',city:'Parede',
        address:'Rua Machado dos Santos, 112',venueName:'Clube Nacional de Ginástica',
        gameDate:new Date(Date.now()+3600_000).toISOString(),status:'OPEN',
        priceAmount:4.50,maxParticipants:10,participantCount:1,gamePhoto:null});
      if(url.endsWith('/guest-requests')) return of({receipt:'R'.repeat(43),status:'APPROVED'});
      return of({});
    }) as any);
    const page=fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    fixture.componentInstance.startInvitation();
    fixture.componentInstance.chooseInvitationIdentity(false);
    fixture.detectChanges();
    const location=page.querySelector('.public-location-link') as HTMLAnchorElement;
    expect(page.querySelector('#guest-player-select')).toBeNull();
    expect(page.querySelector('label[for="guest-new-name"]')?.textContent?.trim())
      .toBe('O teu nome');
    expect(location.textContent).toContain('Clube Nacional de Ginástica');
    expect(location.textContent).not.toContain('Rua Machado dos Santos');
    expect(location.textContent).toContain('Parede');
    expect(location.textContent).toContain('Pesquisar morada no mapa');
    expect(decodeURIComponent(location.href)).toContain('Rua Machado dos Santos');
    expect(location.title).toContain('Rua Machado dos Santos');
    fixture.componentInstance.setGuestNewName('Amigo Histórico');
    fixture.componentInstance.chooseGuest();
    fixture.detectChanges();
    expect(page.querySelector('.guest-rsvp-hint')?.textContent).toContain('vaga fica reservada');
    fixture.componentInstance.sendGuestRequest();
    fixture.detectChanges();
    expect(fixture.componentInstance.guestStep).toBe('approved');
    expect(page.querySelector('.guest-rsvp-upgrade')).not.toBeNull();
    expect(page.textContent).toContain('Presença confirmada');
    expect(page.textContent).toContain('Criar conta Jynlo');
    localStorage.removeItem('jynlo-guest-receipt:42:'+secret.slice(0,18));
  });

  it('explains why an already confirmed historical guest cannot reserve a second place', () => {
    const secret='Z'.repeat(43);
    routeQueryParamMap=convertToParamMap({guest:secret});
    http.post.and.callFake(((url:string) => {
      if(url.endsWith('/guest-roster')) return of({sessionId:42,communityId:5,players:[{id:7,name:'Fresco'}]});
      if(url.endsWith('/guest-confirmed-players')) return of([
        {key:'account:1',name:'TMF14',hasAccount:true},
        {key:'guest:40',name:'Fresco',hasAccount:false}
      ]);
      if(url.endsWith('/guest-preview')) return of({id:42,sport:'Futebol',city:'Parede',
        gameDate:new Date(Date.now()+3600_000).toISOString(),status:'OPEN',
        priceAmount:0,maxParticipants:10,participantCount:2,gamePhoto:null});
      if(url.endsWith('/guest-requests')) return throwError(() => new HttpErrorResponse({status:409}));
      return of({});
    }) as any);
    fixture.detectChanges();
    const component=fixture.componentInstance;
    component.selectGuestPlayer(7);
    component.chooseGuest();
    component.sendGuestRequest();
    fixture.detectChanges();
    expect(component.guestStep).toBe('confirm');
    expect(component.guestReceipt).toBe('');
    expect((fixture.nativeElement as HTMLElement).querySelector('.guest-rsvp-error')?.textContent)
      .toContain('já tem presença confirmada');
  });

  it('changes Barata to a different historical player without reserving a second place', () => {
    const secret='Q'.repeat(43), receipt='R'.repeat(43);
    routeQueryParamMap=convertToParamMap({guest:secret});
    localStorage.setItem('jynlo-guest-receipt:42:'+secret.slice(0,18),receipt);
    let shownName='Barata';
    http.post.and.callFake(((url:string) => {
      if(url.endsWith('/guest-roster'))
        return of({sessionId:42,communityId:5,players:[{id:17,name:'Zé Manel'}]});
      if(url.endsWith('/guest-preview')) return of({id:42,sport:'Futebol',city:'Parede',
        gameDate:new Date(Date.now()+3600_000).toISOString(),status:'FULL',
        priceAmount:0,maxParticipants:10,participantCount:10,gamePhoto:null});
      if(url.endsWith('/guest-confirmed-players')) return of([
        {key:'guest:33',name:shownName,hasAccount:false}
      ]);
      if(url.endsWith('/guest-requests/status')) return of({status:'APPROVED',playerName:shownName});
      if(url.endsWith('/guest-requests/change-player')){
        shownName='Zé Manel';
        return of({status:'APPROVED',receipt,playerName:shownName});
      }
      return of({});
    }) as any);
    fixture.detectChanges();
    const component=fixture.componentInstance;
    expect(component.guestStep).toBe('approved');
    expect((fixture.nativeElement as HTMLElement).querySelector('.guest-rsvp-upgrade')).not.toBeNull();
    component.startChangingGuestIdentity();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('#guest-change-player-select')).toBeNull();
    expect((fixture.nativeElement as HTMLElement)
      .querySelector('label[for="guest-change-new-name"]')?.textContent?.trim())
      .toBe('O teu nome');
    expect((fixture.nativeElement as HTMLElement).querySelector('.guest-rsvp-upgrade')).toBeNull();
    component.setGuestNewName('Zé Manel');
    component.changeGuestIdentity();
    fixture.detectChanges();
    expect(component.guestEditingIdentity).toBeFalse();
    expect((fixture.nativeElement as HTMLElement).querySelector('.guest-rsvp-upgrade')).not.toBeNull();
    expect(component.guestConfirmedName).toBe('Zé Manel');
    expect(component.guestReceipt).toBe(receipt);
    expect(localStorage.getItem('jynlo-guest-receipt:42:'+secret.slice(0,18))).toBe(receipt);
    const calls=(http.post as jasmine.Spy).calls.allArgs().map(args=>String(args[0]));
    expect(calls.filter(x=>x.endsWith('/guest-requests/change-player')).length).toBe(1);
    expect(calls.filter(x=>x.endsWith('/guest-requests')&&!x.endsWith('/guest-requests/change-player')).length).toBe(0);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Zé Manel');
  });

  it('does not remove the guest booking merely by opening or closing the edit form', () => {
    const secret='V'.repeat(43),receipt='W'.repeat(43);
    routeQueryParamMap=convertToParamMap({guest:secret});
    localStorage.setItem('jynlo-guest-receipt:42:'+secret.slice(0,18),receipt);
    http.post.and.callFake(((url:string) => {
      if(url.endsWith('/guest-roster')) return of({sessionId:42,communityId:5,players:[]});
      if(url.endsWith('/guest-preview')) return of({id:42,sport:'Futebol',city:'Parede',
        gameDate:new Date(Date.now()+3600_000).toISOString(),status:'FULL',
        priceAmount:0,maxParticipants:10,participantCount:10,gamePhoto:null});
      if(url.endsWith('/guest-requests/status')) return of({status:'APPROVED',playerName:'Barata'});
      if(url.endsWith('/guest-confirmed-players')) return of([]);
      return throwError(()=>new Error('Unexpected request '+url));
    }) as any);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.guest-rsvp-upgrade')).not.toBeNull();
    fixture.componentInstance.startChangingGuestIdentity();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.guest-rsvp-upgrade')).toBeNull();
    fixture.componentInstance.setGuestNewName('Outro');
    fixture.componentInstance.cancelChangingGuestIdentity();
    fixture.detectChanges();
    // Backing out of an unsaved edit keeps the original approved booking.
    expect((fixture.nativeElement as HTMLElement).querySelector('.guest-rsvp-upgrade')).not.toBeNull();
    expect(fixture.componentInstance.guestStep).toBe('approved');
    expect(fixture.componentInstance.guestReceipt).toBe(receipt);
    expect((http.post as jasmine.Spy).calls.allArgs().filter(
      args=>String(args[0]).endsWith('/guest-requests/change-player')).length).toBe(0);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Barata');
  });

  it('keeps the confirmed receipt and offers correction rather than another registration on WhatsApp links', () => {
    const secret='T'.repeat(43), receipt='U'.repeat(43);
    routeQueryParamMap=convertToParamMap({guest:secret});
    const key='jynlo-guest-receipt:42:'+secret.slice(0,18);
    localStorage.setItem(key,receipt);
    http.post.and.callFake(((url:string) => {
      if(url.endsWith('/guest-roster')) return of({sessionId:42,communityId:5,players:[{id:17,name:'Fresco'}]});
      if(url.endsWith('/guest-preview')) return of({id:42,sport:'Futebol',city:'Parede',
        gameDate:new Date(Date.now()+3600_000).toISOString(),status:'FULL',
        priceAmount:0,maxParticipants:10,participantCount:10,gamePhoto:null});
      if(url.endsWith('/guest-confirmed-players')) return of([]);
      if(url.endsWith('/guest-requests/status')) return of({status:'APPROVED',playerName:'Barata'});
      return of({});
    }) as any);
    fixture.detectChanges();
    const component=fixture.componentInstance;
    const page=fixture.nativeElement as HTMLElement;
    expect(component.guestStep).toBe('approved');
    expect(page.textContent).not.toContain('Este não sou eu — registar outro jogador');
    expect(page.textContent).toContain('Enganei-me — alterar jogador');
    const correction=page.querySelector('.guest-change-player-button') as HTMLButtonElement;
    expect(correction).not.toBeNull();
    correction.click();
    fixture.detectChanges();
    expect(component.guestEditingIdentity).toBeTrue();
    expect(component.guestStep).toBe('approved');
    expect(component.guestReceipt).toBe(receipt);
    expect(localStorage.getItem(key)).toBe(receipt);
    expect(page.querySelector('#guest-change-player-select')).toBeNull();
    expect(page.querySelector('#guest-change-new-name')).not.toBeNull();
    const calls=(http.post as jasmine.Spy).calls.allArgs().map(args=>String(args[0]));
    expect(calls.some(x=>x.endsWith('/guest-requests'))).toBeFalse();
  });

  it('requires a separate confirmation before cancelling and only sends the private receipt', () => {
    const secret='Y'.repeat(43), receipt='X'.repeat(43);
    routeQueryParamMap=convertToParamMap({guest:secret});
    localStorage.setItem('jynlo-guest-receipt:42:'+secret.slice(0,18),receipt);
    let participants=10;
    http.post.and.callFake(((url:string,body:any) => {
      if(url.endsWith('/guest-roster')) return of({sessionId:42,communityId:5,players:[]});
      if(url.endsWith('/guest-preview')) return of({id:42,sport:'Futebol',city:'Parede',
        gameDate:new Date(Date.now()+3600_000).toISOString(),status:participants===10?'FULL':'OPEN',
        priceAmount:0,maxParticipants:10,participantCount:participants,gamePhoto:null});
      if(url.endsWith('/guest-confirmed-players')) return of([]);
      if(url.endsWith('/guest-requests/status')) return of({status:participants===10?'APPROVED':'CANCELLED',playerName:'Barata'});
      if(url.endsWith('/guest-requests/cancel-self')) {
        expect(body).toEqual({receipt});
        participants=9;return of({status:'CANCELLED',playerName:'Barata'});
      }
      return of({});
    }) as any);
    fixture.detectChanges();
    const component=fixture.componentInstance;
    expect((fixture.nativeElement as HTMLElement).querySelector('.guest-rsvp-upgrade')).not.toBeNull();
    component.guestConfirmCancellation=true;
    fixture.detectChanges();
    expect(component.guestStep).toBe('approved');
    expect((fixture.nativeElement as HTMLElement).querySelector('.guest-rsvp-upgrade')).toBeNull();
    expect((http.post as jasmine.Spy).calls.allArgs().some(
      args=>String(args[0]).endsWith('/guest-requests/cancel-self'))).toBeFalse();
    component.cancelOwnGuestReservation();
    fixture.detectChanges();
    expect(component.guestStep).toBe('cancelled');
    expect(component.guestCancelledBySelf).toBeTrue();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Cancelaste a tua presença');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('O organizador cancelou');
    expect((fixture.nativeElement as HTMLElement).querySelector('.guest-rsvp-upgrade')).toBeNull();
    expect(component.session?.participantCount).toBe(9);
    expect(component.guestSavedBookings).toEqual([]);
    fixture.destroy();
    fixture=TestBed.createComponent(PublicSessionPreviewComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.guestStep).toBe('cancelled');
    expect(fixture.componentInstance.guestCancelledBySelf).toBeTrue();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Cancelaste a tua presença');
  });

  it('lets a cancelled historical guest confirm again in one click without duplicating a place', () => {
    const secret='A'.repeat(43),oldReceipt='B'.repeat(43),newReceipt='C'.repeat(43);
    const key='jynlo-guest-receipt:42:'+secret.slice(0,18);
    localStorage.setItem(key,oldReceipt);
    routeQueryParamMap=convertToParamMap({guest:secret});
    let participants=9;
    let rejoinCalls=0;
    http.post.and.callFake(((url:string,body:any) => {
      if(url.endsWith('/guest-roster')) return of({
        sessionId:42,communityId:5,players:[{id:18,name:'Mestre'},{id:19,name:'Outro'}]
      });
      if(url.endsWith('/guest-preview')) return of({id:42,sport:'Futebol',city:'Parede',
        gameDate:new Date(Date.now()+3600_000).toISOString(),
        status:participants===10?'FULL':'OPEN',maxParticipants:10,
        participantCount:participants,priceAmount:0,gamePhoto:null});
      if(url.endsWith('/guest-confirmed-players')) return of([]);
      if(url.endsWith('/guest-requests/status')) return of({
        status:participants===10?'APPROVED':'CANCELLED',playerName:'Mestre'
      });
      if(url.endsWith('/guest-requests')){
        rejoinCalls++;
        expect(body).toEqual({linkToken:secret,playerId:18,newName:null,note:''});
        participants=10;
        return of({status:'APPROVED',receipt:newReceipt,playerName:'Mestre'});
      }
      return of({});
    }) as any);
    fixture.detectChanges();
    const page=fixture.nativeElement as HTMLElement;
    const component=fixture.componentInstance;
    expect(component.guestStep).toBe('cancelled');
    const button=page.querySelector('.guest-rejoin-button') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.textContent).toContain('voltar a marcar presença');
    button.click();
    fixture.detectChanges();
    expect(rejoinCalls).toBe(1);
    expect(component.guestStep).toBe('approved');
    expect(component.guestReceipt).toBe(newReceipt);
    expect(localStorage.getItem(key)).toBe(newReceipt);
    expect(component.session?.participantCount).toBe(10);
    expect(component.guestConfirmedName).toBe('Mestre');
    expect(page.querySelector('.guest-rejoin-button')).toBeNull();
    expect(page.querySelector('.guest-rsvp-upgrade')).not.toBeNull();
    expect((http.post as jasmine.Spy).calls.allArgs().filter(
      args=>String(args[0]).endsWith('/guest-requests')).length).toBe(1);
  });

  it('does not restore a cancelled guest if their released place was taken', () => {
    const secret='D'.repeat(43),receipt='E'.repeat(43);
    const key='jynlo-guest-receipt:42:'+secret.slice(0,18);
    localStorage.setItem(key,receipt);
    routeQueryParamMap=convertToParamMap({guest:secret});
    http.post.and.callFake(((url:string) => {
      if(url.endsWith('/guest-roster')) return of({
        sessionId:42,communityId:5,players:[]
      });
      if(url.endsWith('/guest-preview')) return of({id:42,sport:'Futebol',city:'Parede',
        gameDate:new Date(Date.now()+3600_000).toISOString(),
        status:'FULL',maxParticipants:10,participantCount:10,priceAmount:0,gamePhoto:null});
      if(url.endsWith('/guest-confirmed-players')) return of([]);
      if(url.endsWith('/guest-requests/status')) return of({
        status:'CANCELLED',playerName:'Barata'
      });
      if(url.endsWith('/guest-requests'))
        return throwError(()=>new HttpErrorResponse({status:409}));
      return of({});
    }) as any);
    fixture.detectChanges();
    const component=fixture.componentInstance;
    const page=fixture.nativeElement as HTMLElement;
    expect(component.guestStep).toBe('cancelled');
    (page.querySelector('.guest-rejoin-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.guestStep).toBe('cancelled');
    expect(component.guestReceipt).toBe(receipt);
    expect(localStorage.getItem(key)).toBe(receipt);
    expect(page.querySelector('.guest-rsvp-error')?.textContent)
      .toContain('Não foi possível recuperar a presença');
    expect(page.querySelector('.guest-rsvp-upgrade')).toBeNull();
    expect(component.session?.participantCount).toBe(10);
  });

  it('does not show a second-registration button for an approved guest even when the session is full', () => {
    const secret='H'.repeat(43),receipt='R'.repeat(43);
    routeQueryParamMap=convertToParamMap({guest:secret});
    const key='jynlo-guest-receipt:42:'+secret.slice(0,18);
    localStorage.setItem(key,receipt);
    http.post.and.callFake(((url:string) => {
      if(url.endsWith('/guest-roster')) return of({sessionId:42,communityId:5,players:[{id:7,name:'Convidado'}]});
      if(url.endsWith('/guest-preview')) return of({id:42,sport:'Futebol',city:'Parede',
        gameDate:new Date(Date.now()+3600_000).toISOString(),status:'FULL',
        priceAmount:0,maxParticipants:10,participantCount:10,gamePhoto:null});
      if(url.endsWith('/guest-requests/status')) return of({status:'APPROVED',playerName:'Barata'});
      return of({});
    }) as any);
    fixture.detectChanges();
    const page=fixture.nativeElement as HTMLElement;
    const component=fixture.componentInstance;
    expect(component.guestStep).toBe('approved');
    expect(page.textContent).toContain('Presença confirmada');
    expect(page.querySelector('.guest-change-player-button')).not.toBeNull();
    expect(page.textContent).not.toContain('Este não sou eu — registar outro jogador');
    expect(component.guestReceipt).toBe(receipt);
    expect(localStorage.getItem(key)).toBe(receipt);
    expect((http.post as jasmine.Spy).calls.allArgs().some(
      args=>String(args[0]).endsWith('/guest-requests'))).toBeFalse();
  });

  it('removes an unknown saved receipt so an anonymous visitor can choose again', () => {
    const secret='I'.repeat(43);
    const key='jynlo-guest-receipt:42:'+secret.slice(0,18);
    routeQueryParamMap=convertToParamMap({guest:secret});
    localStorage.setItem(key,'S'.repeat(43));
    http.post.and.callFake(((url:string) => {
      if(url.endsWith('/guest-roster')) return of({sessionId:42,communityId:5,players:[{id:7,name:'Jogador disponível'}]});
      if(url.endsWith('/guest-preview')) return of({id:42,sport:'Futsal',city:'Lisboa',
        gameDate:new Date(Date.now()+3600_000).toISOString(),status:'OPEN',
        maxParticipants:8,participantCount:2,priceAmount:0,gamePhoto:null});
      if(url.endsWith('/guest-requests/status'))
        return throwError(()=>new HttpErrorResponse({status:404,statusText:'Not Found'}));
      return throwError(()=>new Error('Unexpected route '+url));
    }) as any);
    fixture.detectChanges();
    expect(fixture.componentInstance.guestStep).toBe('choose');
    expect(fixture.componentInstance.guestReceipt).toBe('');
    expect(localStorage.getItem(key)).toBeNull();
    expect(fixture.componentInstance.guestPlayers.map(p=>p.name)).toEqual(['Jogador disponível']);
    expect((fixture.nativeElement as HTMLElement).querySelector('#guest-player-select')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.invitation-first-confirm')).not.toBeNull();
  });

  it('allows a signed-in player to participate when a previous shared guest receipt is invalid', () => {
    const secret='J'.repeat(43);
    const key='jynlo-guest-receipt:42:'+secret.slice(0,18);
    authenticationService.isLoggedIn.and.returnValue(true);
    routeQueryParamMap=convertToParamMap({guest:secret});
    localStorage.setItem(key,'S'.repeat(43));
    http.post.and.callFake(((url:string) => {
      if(url.endsWith('/guest-preview')) return of({id:42,sport:'Futsal',city:'Lisboa',
        gameDate:new Date(Date.now()+3600_000).toISOString(),status:'OPEN',
        maxParticipants:8,participantCount:2,priceAmount:0,gamePhoto:null});
      if(url.endsWith('/guest-requests/status'))
        return throwError(()=>new HttpErrorResponse({status:404,statusText:'Not Found'}));
      return throwError(()=>new Error('Unexpected route '+url));
    }) as any);
    fixture.detectChanges();
    const page=fixture.nativeElement as HTMLElement;
    expect(localStorage.getItem(key)).toBeNull();
    expect(fixture.componentInstance.guestReceipt).toBe('');
    expect(page.querySelector('.guest-rsvp')).toBeNull();
    expect(page.querySelector('.join-panel .member-rsvp')).not.toBeNull();
    expect(page.querySelector('.header-login')).toBeNull();
    expect(fixture.componentInstance.guestPlayers).toEqual([]);
  });

  it('keeps the reservation and offers status retry on temporary API failure', () => {
    const secret='K'.repeat(43);
    const key='jynlo-guest-receipt:42:'+secret.slice(0,18);
    routeQueryParamMap=convertToParamMap({guest:secret});
    localStorage.setItem(key,'S'.repeat(43));
    let unavailable=true;
    http.post.and.callFake(((url:string) => {
      if(url.endsWith('/guest-roster')) return of({sessionId:42,communityId:5,players:[]});
      if(url.endsWith('/guest-preview')) return of({id:42,sport:'Futsal',city:'Lisboa',
        gameDate:new Date(Date.now()+3600_000).toISOString(),status:'OPEN',
        maxParticipants:8,participantCount:2,priceAmount:0,gamePhoto:null});
      if(url.endsWith('/guest-requests/status')) return unavailable
        ? throwError(()=>new HttpErrorResponse({status:503,statusText:'Unavailable'}))
        : of({status:'APPROVED'});
      return throwError(()=>new Error('Unexpected route '+url));
    }) as any);
    fixture.detectChanges();
    expect(fixture.componentInstance.guestStep).toBe('pending');
    expect(localStorage.getItem(key)).toBe('S'.repeat(43));
    expect((fixture.nativeElement as HTMLElement).querySelector('.guest-rsvp-primary')).not.toBeNull();
    unavailable=false;
    fixture.componentInstance.checkGuestStatus();
    fixture.detectChanges();
    expect(fixture.componentInstance.guestStep).toBe('approved');
    expect(localStorage.getItem(key)).toBe('S'.repeat(43));
  });

  it('localizes the session photo description without changing its source', () => {
    const i18n = TestBed.inject(I18nService);
    i18n.setLanguage('en');
    const page = render({ gamePhoto: '/uploads/padel.jpg' });
    const photo = page.querySelector('.session-photo') as HTMLImageElement;

    expect(photo).not.toBeNull();
    expect(photo.getAttribute('alt')).toBe('Session photo: Padel');
    expect(photo.getAttribute('src')).toContain('/uploads/padel.jpg');

    i18n.setLanguage('pt');
    fixture.detectChanges();
    expect(photo.getAttribute('alt')).toBe('Fotografia da sessão: Padel');
  });

  it('uses a translated photo description when the sport is not specified', () => {
    const i18n = TestBed.inject(I18nService);
    i18n.setLanguage('en');
    const page = render({ gamePhoto: '/uploads/fixture.jpg', sport: null });
    const photo = page.querySelector('.session-photo') as HTMLImageElement;

    expect(photo.getAttribute('alt')).toBe('Session photo: Sports session');

    i18n.setLanguage('pt');
    fixture.detectChanges();
    expect(photo.getAttribute('alt')).toBe('Fotografia da sessão: Sessão desportiva');
  });

  it('renders malformed or missing dates without crashing or promising participation', () => {
    const page = render({ gameDate: 'invalid-api-date', status: 'OPEN' });
    const facts = page.querySelectorAll('.session-facts .fact strong');
    expect(fixture.componentInstance.displayGameDate).toBeNull();
    expect(facts[1].textContent?.trim()).toBe('Por indicar');
    expect(facts[2].textContent?.trim()).toBe('Por indicar');
    expect(fixture.componentInstance.canRequestParticipation).toBeFalse();
    expect(page.querySelector('.join-panel .primary-action')).toBeNull();
    expect(page.querySelector('.share-session-action')).toBeNull();

    fixture.componentInstance.session!.gameDate = null;
    fixture.detectChanges();
    expect(facts[1].textContent?.trim()).toBe('Por indicar');
    expect(facts[2].textContent?.trim()).toBe('Por indicar');
  });

  it('shows localized unknown date and time while keeping the session identifiable', () => {
    const i18n = TestBed.inject(I18nService);
    i18n.setLanguage('en');
    const page = render({ gameDate: 'bad-date', status: 'FULL' });
    const facts = page.querySelectorAll('.session-facts .fact strong');
    expect(page.querySelector('main.session-layout h1')?.textContent).toContain('Padel');
    expect(facts[1].textContent?.trim()).toBe('Not specified');
    expect(facts[2].textContent?.trim()).toBe('Not specified');
    expect(fixture.componentInstance.canRequestParticipation).toBeFalse();
    expect(page.querySelector('.join-panel .primary-action')).toBeNull();
  });

  it('directs a signed-in player to the participation section', () => {
    authenticationService.isLoggedIn.and.returnValue(true);
    const page = render();
    const joinAction = page.querySelector('.join-panel .primary-action') as HTMLAnchorElement;

    expect(joinAction).not.toBeNull();
    expect(new URL(joinAction.href).pathname).toBe('/menu/events/42');
    expect(new URL(joinAction.href).searchParams.get('join')).toBe('1');
  });

  it('does not add join focus to closed session details', () => {
    authenticationService.isLoggedIn.and.returnValue(true);
    const page = render({ status: 'CANCELLED' });
    const detailsAction = page.querySelector('.join-panel .primary-action') as HTMLAnchorElement;

    expect(detailsAction).not.toBeNull();
    expect(new URL(detailsAction.href).searchParams.has('join')).toBeFalse();
  });

  it('lets a guest share a verified public session without signing in', () => {
    const page = render();
    const share = page.querySelector('.share-session-action') as HTMLButtonElement;

    expect(share).not.toBeNull();
    expect(share.textContent?.trim()).toBe('Partilhar sessão');
    expect(fixture.componentInstance.publicShareUrl())
      .toBe('https://jynlosports.com/sessions/42');
  });

  it('shares a short game-first WhatsApp message, with no promotional sentence', () => {
    const i18n = TestBed.inject(I18nService);
    const page = render({ participantCount: 2 });
    const link = page.querySelector('.whatsapp-share-action') as HTMLAnchorElement;
    const publicUrl = 'https://jynlosports.com/sessions/42';
    expect(link).not.toBeNull();
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    const text = new URL(link.href).searchParams.get('text')!;
    expect(text).toBe(shareText('pt-PT') + '\n' + publicUrl);
    expect(text).toContain('Padel');
    expect(text).toContain('Local: Lisboa');
    expect(text).toContain('Vagas: 2 disponíveis');
    expect(text).not.toContain('Junta-te a nós na Jynlo');

    i18n.setLanguage('en');
    fixture.detectChanges();
    expect(new URL(link.href).searchParams.get('text'))
      .toBe(shareText('en-GB') + '\n' + publicUrl);
    expect(link.href).not.toContain('menu/events');
  });

  it('keeps the invite useful without sport, city or public count', () => {
    const i18n = TestBed.inject(I18nService);
    render({ sport: null, city: null, participantCount: null });
    const sharedText = () => new URL(fixture.componentInstance.whatsappShareUrl()!)
      .searchParams.get('text')!;
    expect(sharedText()).toContain('Jogo desportivo');
    expect(sharedText()).not.toContain('Vagas:');
    i18n.setLanguage('en');
    expect(sharedText()).toContain('Sports game');
    expect(sharedText()).not.toContain('Jynlo!');
  });

  it('opens only the publicly known municipality in Maps', () => {
    const page = render({ city: 'Cascais' });
    const link = page.querySelector('.public-location-link') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(new URL(link.href).searchParams.get('query')).toBe('Cascais, Portugal');

    fixture.componentInstance.session!.city = null;
    fixture.detectChanges();
    expect(page.querySelector('.public-location-link')).toBeNull();
  });

  it('does not offer WhatsApp sharing for sessions closed to participation', () => {
    const page = render({ status: 'CANCELLED' });

    expect(fixture.componentInstance.whatsappShareUrl()).toBeNull();
    expect(page.querySelector('.whatsapp-share-action')).toBeNull();

    fixture.componentInstance.session = null;
    fixture.detectChanges();
    expect(fixture.componentInstance.whatsappShareUrl()).toBeNull();
    expect(page.querySelector('.whatsapp-share-action')).toBeNull();
  });

  it('keeps native sharing consistent with the short WhatsApp invite in both languages', async () => {
    const i18n = TestBed.inject(I18nService);
    const nativeShare = jasmine.createSpy('share').and.returnValue(Promise.resolve());
    const prior = Object.getOwnPropertyDescriptor(navigator, 'share');
    Object.defineProperty(navigator, 'share', { configurable: true, value: nativeShare });
    try {
      render({ participantCount: 2 });
      const component = fixture.componentInstance;
      const publicUrl = 'https://jynlosports.com/sessions/42';
      await component.shareSession();
      expect(nativeShare).toHaveBeenCalledWith(jasmine.objectContaining({
        text: shareText('pt-PT'), url: publicUrl
      }));
      i18n.setLanguage('en');
      nativeShare.calls.reset();
      await component.shareSession();
      expect(nativeShare).toHaveBeenCalledWith(jasmine.objectContaining({
        text: shareText('en-GB'), url: publicUrl
      }));
    } finally {
      if (prior) Object.defineProperty(navigator, 'share', prior);
      else Reflect.deleteProperty(navigator, 'share');
    }
  });

  it('copies the public link when native sharing is unavailable', async () => {
    const page = render();
    if (typeof navigator.share === 'function') {
      spyOn(navigator, 'share').and.returnValue(Promise.reject(new Error('Unavailable')));
    }
    const copy = spyOn<any>(fixture.componentInstance, 'copyShareUrl')
      .and.returnValue(Promise.resolve());

    (page.querySelector('.share-session-action') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(copy).toHaveBeenCalledWith('https://jynlosports.com/sessions/42');
    expect(page.querySelector('.share-feedback')?.textContent?.trim()).toBe('Ligação copiada');
    expect(page.querySelector('.manual-share-link')).toBeNull();
  });

  it('offers a selectable link if both native sharing and clipboard copying fail', async () => {
    const i18n = TestBed.inject(I18nService);
    i18n.setLanguage('en');
    const page = render();
    if (typeof navigator.share === 'function') {
      spyOn(navigator, 'share').and.returnValue(Promise.reject(new Error('Unavailable')));
    }
    spyOn<any>(fixture.componentInstance, 'copyShareUrl')
      .and.returnValue(Promise.reject(new Error('Clipboard blocked')));

    (page.querySelector('.share-session-action') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    const input = page.querySelector('#public-preview-share-url') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.readOnly).toBeTrue();
    expect(input.value).toBe('https://jynlosports.com/sessions/42');
    expect(page.querySelector('.share-feedback')?.textContent).toContain('Select the link');
    const select = spyOn(input, 'select').and.callThrough();
    (page.querySelector('.manual-share-link button') as HTMLButtonElement).click();
    expect(select).toHaveBeenCalled();
  });

  it('never offers resharing for closed or invalid public sessions', () => {
    const page = render({ status: 'CANCELLED' });
    expect(fixture.componentInstance.publicShareUrl()).toBeNull();
    expect(page.querySelector('.share-session-action')).toBeNull();

    fixture.componentInstance.session = null;
    fixture.detectChanges();
    expect(fixture.componentInstance.publicShareUrl()).toBeNull();
    expect(page.querySelector('.share-session-action')).toBeNull();
  });

  it('translates the public session introduction and privacy notice into English', () => {
    TestBed.inject(I18nService).setLanguage('en');
    const page = render();

    expect(page.querySelector('.brand')?.getAttribute('aria-label')).toBe('Jynlo — home');
    expect(page.querySelector('.eyebrow')?.textContent?.trim()).toBe('Public session · Jynlo');
    expect(page.querySelector('.session-main h1')?.textContent?.trim()).toBe('Padel');
    expect(page.querySelector('.intro')?.textContent?.trim())
      .toBe('Discover this activity and join others who love playing sports.');
    expect(page.querySelector('.privacy-note')?.textContent?.trim())
      .toBe('This preview only shows public session information. Participation details are available after signing in to Jynlo.');
  });

  it('translates the missing sport title and public introduction when language changes', () => {
    const i18n = TestBed.inject(I18nService);
    i18n.setLanguage('en');
    const page = render({ sport: null });

    expect(page.querySelector('.session-main h1')?.textContent?.trim()).toBe('Sports session');

    i18n.setLanguage('pt');
    fixture.detectChanges();

    expect(page.querySelector('.session-main h1')?.textContent?.trim()).toBe('Sessão desportiva');
    expect(page.querySelector('.eyebrow')?.textContent?.trim()).toBe('Sessão pública · Jynlo');
    expect(page.querySelector('.intro')?.textContent?.trim())
      .toBe('Descobre esta atividade e junta-te a quem quer praticar desporto.');
    expect(page.querySelector('.privacy-note')?.textContent?.trim())
      .toContain('informações públicas da sessão');
  });

  it('translates public session facts into English without changing session data', () => {
    const i18n = TestBed.inject(I18nService);
    i18n.setLanguage('en');
    const page = render();

    const facts = Array.from(page.querySelectorAll('.session-facts .fact'));
    const labels = facts.map(fact => fact.querySelector('.fact-label')?.textContent?.trim());
    const values = facts.map(fact => fact.querySelector('strong')?.textContent?.trim());

    expect(labels).toEqual(['Location', 'Date', 'Time', 'Price', 'Maximum capacity']);
    expect(values[0]).toBe('Lisboa');
    expect(values[3]).toBe('Free');
    expect(values[4]).toBe('4 participants');
    expect(fixture.componentInstance.session?.priceAmount).toBe(0);

    i18n.setLanguage('pt');
    fixture.detectChanges();
    expect(facts[3].querySelector('strong')?.textContent?.trim()).toBe('Gratuito');
  });

  it('displays publicly available places in Portuguese and English', () => {
    const i18n = TestBed.inject(I18nService);
    const page = render({ maxParticipants: 10, participantCount: 8 });
    const fact = page.querySelector('.fact-availability') as HTMLElement;
    expect(fact).not.toBeNull();
    expect(fact.querySelector('.fact-label')?.textContent?.trim()).toBe('Vagas disponíveis');
    expect(fact.querySelector('strong')?.textContent?.trim()).toBe('2 vagas disponíveis');
    expect(fixture.componentInstance.remainingPlaces).toBe(2);

    i18n.setLanguage('en');
    fixture.detectChanges();
    expect(fact.querySelector('.fact-label')?.textContent?.trim()).toBe('Available places');
    expect(fact.querySelector('strong')?.textContent?.trim()).toBe('2 places available');
  });

  it('distinguishes last place and full capacity without showing participant identities', () => {
    const page = render({ maxParticipants: 10, participantCount: 9 });
    const label = () => page.querySelector('.fact-availability strong')?.textContent?.trim();
    expect(label()).toBe('Última vaga disponível');

    fixture.componentInstance.session!.participantCount = 10;
    fixture.detectChanges();
    expect(label()).toBe('Sem vagas disponíveis');

    fixture.componentInstance.session!.participantCount = 12;
    fixture.detectChanges();
    expect(label()).toBe('Sem vagas disponíveis');
    expect(page.querySelector('.session-facts')?.textContent).not.toContain('username');
  });

  it('hides availability for missing or invalid counts and closed games', () => {
    const page = render({ maxParticipants: 10, participantCount: null });
    const visible = () => page.querySelector('.fact-availability');
    expect(visible()).toBeNull();

    fixture.componentInstance.session!.participantCount = -1;
    fixture.detectChanges();
    expect(visible()).toBeNull();
    fixture.componentInstance.session!.participantCount = 2.5;
    fixture.detectChanges();
    expect(visible()).toBeNull();

    fixture.componentInstance.session!.participantCount = 8;
    fixture.componentInstance.session!.status = 'FULL';
    fixture.detectChanges();
    expect(visible()).toBeNull();
    fixture.componentInstance.session!.status = 'CANCELLED';
    fixture.detectChanges();
    expect(visible()).toBeNull();
    fixture.componentInstance.session!.status = 'OPEN';
    fixture.componentInstance.session!.gameDate = '2020-10-01T18:00:00Z';
    fixture.detectChanges();
    expect(visible()).toBeNull();
  });

  it('translates missing session details and omits unknown capacity', () => {
    const i18n = TestBed.inject(I18nService);
    i18n.setLanguage('en');
    const page = render({
      city: null, gameDate: null, priceAmount: null, maxParticipants: null
    });
    const facts = Array.from(page.querySelectorAll('.session-facts .fact'));
    const values = () => facts.map(fact => fact.querySelector('strong')?.textContent?.trim());

    expect(facts.length).toBe(4);
    expect(values()).toEqual(['Not specified', 'Not specified', 'Not specified', 'Not specified']);

    i18n.setLanguage('pt');
    fixture.detectChanges();
    expect(values()).toEqual(['Por indicar', 'Por indicar', 'Por indicar', 'Por indicar']);
  });

  it('translates guest entry actions to English while preserving the session return URL', () => {
    TestBed.inject(I18nService).setLanguage('en');
    const page = render();

    expect(page.querySelector('.header-login')?.textContent?.trim()).toBe('Sign in');
    expect(page.querySelector('.join-panel .primary-action')?.textContent?.trim()).toBe('Create account');
    expect(page.querySelector('.join-panel .secondary-action')?.textContent?.trim())
      .toBe('I already have an account');
    const createAccount = page.querySelector('.join-panel .primary-action') as HTMLAnchorElement;
    expect(createAccount.getAttribute('href')).toContain('returnUrl=');
    expect(createAccount.getAttribute('href')).toContain('42');
  });

  it('translates available, full and closed session actions for authenticated players', () => {
    TestBed.inject(I18nService).setLanguage('en');
    authenticationService.isLoggedIn.and.returnValue(true);
    const page = render();

    const primary = () => page.querySelector('.join-panel .primary-action') as HTMLAnchorElement;
    expect(page.querySelector('.header-login')?.textContent?.trim()).toBe('Open in Jynlo');
    expect(primary().textContent?.trim()).toBe('View session and join');

    fixture.componentInstance.session!.status = 'FULL';
    fixture.detectChanges();
    expect(primary().textContent?.trim()).toBe('View session and waitlist');

    fixture.componentInstance.session!.status = 'CANCELLED';
    fixture.detectChanges();
    expect(primary().textContent?.trim()).toBe('View details');
    expect(primary().getAttribute('href')).toBe('/menu/events/42');
  });

  it('translates open, full, cancelled and completed session statuses to English', () => {
    TestBed.inject(I18nService).setLanguage('en');
    const page = render();
    const label = () => page.querySelector('.join-panel .status')?.textContent?.trim();

    expect(label()).toBe('Registration open');

    fixture.componentInstance.session!.status = 'FULL';
    fixture.detectChanges();
    expect(label()).toBe('Session full');

    fixture.componentInstance.session!.status = 'CANCELLED';
    fixture.detectChanges();
    expect(label()).toBe('Session cancelled');

    fixture.componentInstance.session!.status = 'COMPLETED';
    fixture.detectChanges();
    expect(label()).toBe('Session completed');
  });

  it('translates closed and unknown statuses without changing participation rules', () => {
    const i18n = TestBed.inject(I18nService);
    i18n.setLanguage('en');
    const page = render({ gameDate: new Date(Date.now() - 3600_000).toISOString() });
    const label = () => page.querySelector('.join-panel .status')?.textContent?.trim();

    expect(label()).toBe('Registration closed');
    expect(fixture.componentInstance.canRequestParticipation).toBeFalse();

    fixture.componentInstance.session!.status = null;
    fixture.detectChanges();
    expect(label()).toBe('Sports session');

    i18n.setLanguage('pt');
    fixture.detectChanges();
    expect(label()).toBe('Sessão desportiva');
  });

  it('explains how to join an open session in English for guests and players', () => {
    TestBed.inject(I18nService).setLanguage('en');
    const page = render();
    const heading = () => page.querySelector('.join-panel h2')?.textContent?.trim();
    const description = () => page.querySelector('.join-panel p')?.textContent?.trim();

    expect(heading()).toBe('Your next game starts here.');
    expect(description()).toBe('Create a free account to see all the details and join this session.');

    authenticationService.isLoggedIn.and.returnValue(true);
    fixture.componentInstance.isAuthenticated = true;
    fixture.detectChanges();

    expect(heading()).toBe('Your next game starts here.');
    expect(description()).toBe('Open the session details to join.');
    expect(page.querySelector('.join-panel .primary-action')?.getAttribute('href'))
      .toBe('/menu/events/42?join=1');
  });

  it('translates waitlist and closed-session explanations without changing signup options', () => {
    const i18n = TestBed.inject(I18nService);
    i18n.setLanguage('en');
    authenticationService.isLoggedIn.and.returnValue(true);
    const page = render({ status: 'FULL' });
    const heading = () => page.querySelector('.join-panel h2')?.textContent?.trim();
    const description = () => page.querySelector('.join-panel p')?.textContent?.trim();

    expect(heading()).toBe('You can still join the waitlist.');
    expect(description()).toContain('join the waitlist');
    expect(page.querySelector('.join-panel .primary-action')?.getAttribute('href'))
      .toBe('/menu/events/42?join=1');

    fixture.componentInstance.session!.status = 'CANCELLED';
    fixture.detectChanges();
    expect(heading()).toBe('This session is no longer accepting registrations.');
    expect(description()).toContain('cannot join this game');
    expect(page.querySelector('.join-panel .primary-action')?.textContent?.trim())
      .toBe('View details');

    i18n.setLanguage('pt');
    fixture.detectChanges();
    expect(heading()).toBe('Esta sessão já não aceita inscrições.');
  });

  it('shows a translated invalid-link error without calling the preview API', () => {
    TestBed.inject(I18nService).setLanguage('en');
    routeParamMap = convertToParamMap({ id: '1e2' });
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelector('.error-state h1')?.textContent?.trim()).toBe('Session unavailable');
    expect(page.querySelector('.error-state p')?.textContent?.trim()).toBe('This session link is invalid.');
    expect(page.querySelector('.retry-action')).toBeNull();
    expect(page.querySelector('.error-state a')?.textContent?.trim()).toBe('Back to home');
    expect(http.get).not.toHaveBeenCalled();
  });

  it('translates temporary preview failures and the retry action', () => {
    TestBed.inject(I18nService).setLanguage('en');
    http.get.and.returnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelector('.error-state p')?.textContent?.trim())
      .toBe('Could not load the session. Check your connection and try again.');
    const retry = page.querySelector('.retry-action') as HTMLButtonElement;
    expect(retry.textContent?.trim()).toBe('Try again');

    http.get.and.returnValue(of({
      id: 42, sport: 'Padel', city: 'Lisboa',
      gameDate: new Date(Date.now() + 3600_000).toISOString(),
      maxParticipants: 4, priceAmount: 0, status: 'OPEN', gamePhoto: null
    }) as any);
    retry.click();
    fixture.detectChanges();

    expect(http.get).toHaveBeenCalledTimes(2);
    expect(page.textContent).toContain('Padel');
    expect(page.querySelector('.retry-action')).toBeNull();
  });

  it('translates permanent preview failures without offering a retry', () => {
    TestBed.inject(I18nService).setLanguage('en');
    http.get.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelector('.error-state p')?.textContent?.trim())
      .toBe('This session is not available for public viewing.');
    expect(page.querySelector('.retry-action')).toBeNull();
  });

  it('rejects malformed session IDs without requesting a different session', () => {
    const invalidIds = ['1e2', '42.0', '+42', '00042', '-1', '0', 'abc', '9007199254740992'];

    for (const id of invalidIds) {
      routeParamMap = convertToParamMap({ id });
      const invalidFixture = TestBed.createComponent(PublicSessionPreviewComponent);
      invalidFixture.detectChanges();

      const page = invalidFixture.nativeElement as HTMLElement;
      expect(page.textContent).withContext(id).toContain('Esta ligação de sessão não é válida');
      expect(http.get).withContext(id).not.toHaveBeenCalled();
      expect(invalidFixture.componentInstance.returnUrl).withContext(id).toBeNull();
      invalidFixture.destroy();
    }
  });

  it('rejects preview data from a different session without showing join links', () => {
    authenticationService.isLoggedIn.and.returnValue(true);
    const page = render({ id: 99 });

    expect(http.get).toHaveBeenCalledWith(jasmine.stringMatching(/\/api\/sessions\/42\/public-preview$/));
    expect(fixture.componentInstance.session).toBeNull();
    expect(fixture.componentInstance.returnUrl).toBe('/menu/events/42');
    expect(page.querySelector('.join-panel')).toBeNull();
    expect(page.querySelector('.error-state p')?.textContent)
      .toContain('Esta sessão não está disponível para consulta pública');
    expect(page.querySelector('.retry-action')).toBeNull();
  });

  it('rejects a public preview without a session ID', () => {
    const page = render({ id: null });

    expect(fixture.componentInstance.session).toBeNull();
    expect(page.querySelector('.join-panel .primary-action')).toBeNull();
    expect(page.querySelector('.error-state')).not.toBeNull();
    expect(fixture.componentInstance.canRetry).toBeFalse();
  });

  it('uses the validated shared-session destination for all entry links', () => {
    const page = render();
    const destination = fixture.componentInstance.returnUrl;
    expect(destination).toBe('/menu/events/42');

    const create = page.querySelector('.join-panel .primary-action') as HTMLAnchorElement;
    const existing = page.querySelector('.join-panel .secondary-action') as HTMLAnchorElement;
    expect(create.getAttribute('href')).toContain(encodeURIComponent(destination + '?join=1'));
    expect(existing.getAttribute('href')).toContain(encodeURIComponent(destination + '?join=1'));
    expect(fixture.componentInstance.participationReturnUrl).toBe('/menu/events/42?join=1');

    authenticationService.isLoggedIn.and.returnValue(true);
    fixture.componentInstance.isAuthenticated = true;
    fixture.detectChanges();
    expect(page.querySelector('.join-panel .primary-action')?.getAttribute('href'))
      .toBe(destination + '?join=1');

    fixture.componentInstance.session!.status = 'CANCELLED';
    fixture.detectChanges();
    expect(page.querySelector('.join-panel .primary-action')?.getAttribute('href'))
      .toBe(destination);
  });

  it('keeps the join/waitlist focus for guest entry but not for closed sessions', () => {
    const page = render({ status: 'FULL' });
    const registration = page.querySelector('.join-panel .primary-action') as HTMLAnchorElement;
    const existing = page.querySelector('.join-panel .secondary-action') as HTMLAnchorElement;
    const header = page.querySelector('.header-login') as HTMLAnchorElement;
    for (const link of [registration, existing, header]) {
      expect(new URL(link.href).searchParams.get('returnUrl'))
        .toBe('/menu/events/42?join=1');
    }

    fixture.componentInstance.session!.status = 'CANCELLED';
    fixture.detectChanges();
    expect(fixture.componentInstance.participationReturnUrl).toBe('/menu/events/42');
    const closedLogin = page.querySelector('.join-panel .secondary-action') as HTMLAnchorElement;
    expect(new URL(closedLogin.href).searchParams.get('returnUrl'))
      .toBe('/menu/events/42');
  });

  it('keeps a canonical positive session ID when loading its public preview', () => {
    const page = render();

    expect(http.get).toHaveBeenCalledWith(jasmine.stringMatching(/\/api\/sessions\/42\/public-preview$/));
    expect(fixture.componentInstance.returnUrl).toBe('/menu/events/42');
    expect(page.querySelector('.join-panel .primary-action')).not.toBeNull();
  });

  it('allows retry after a temporary HTTP 408 timeout', () => {
    http.get.and.returnValue(throwError(() => new HttpErrorResponse({ status: 408 })));
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;

    expect(fixture.componentInstance.canRetry).toBeTrue();
    expect(page.querySelector('.error-state p')?.textContent)
      .toContain('Verifica a ligação e tenta novamente');
    expect(page.querySelector('.retry-action')).not.toBeNull();
  });

  it('allows retry after HTTP 429 rate limiting without marking the session unavailable', () => {
    http.get.and.returnValue(throwError(() => new HttpErrorResponse({ status: 429 })));
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;

    expect(fixture.componentInstance.canRetry).toBeTrue();
    expect(fixture.componentInstance.errorMessageKey).toBe('publicSession.loadError');
    const retry = page.querySelector('.retry-action') as HTMLButtonElement;
    expect(retry).not.toBeNull();

    http.get.and.returnValue(of({
      id: 42,
      sport: 'Padel',
      city: 'Lisboa',
      gameDate: new Date(Date.now() + 3600_000).toISOString(),
      maxParticipants: 4,
      priceAmount: 0,
      status: 'OPEN',
      gamePhoto: null
    }) as any);
    retry.click();
    fixture.detectChanges();

    expect(http.get).toHaveBeenCalledTimes(2);
    expect(page.textContent).toContain('Padel');
    expect(page.querySelector('.retry-action')).toBeNull();
  });


  it('spaces temporary-error actions as separate accessible controls', () => {
    http.get.and.returnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    const panel = page.querySelector<HTMLElement>('.error-state');
    const actions = panel?.querySelector<HTMLElement>('.error-actions');
    const retry = actions?.querySelector<HTMLButtonElement>('button.retry-action');
    const home = actions?.querySelector<HTMLAnchorElement>('a.error-home-action');

    expect(panel?.getAttribute('role')).toBe('alert');
    expect(actions?.children.length).toBe(2);
    expect(retry?.type).toBe('button');
    expect(home?.getAttribute('href')).toBe('/home');
    expect(getComputedStyle(actions!).display).toBe('flex');
    expect(parseFloat(getComputedStyle(actions!).gap)).toBeGreaterThanOrEqual(10);
    expect(getComputedStyle(retry!).marginTop).toBe('0px');
    expect(getComputedStyle(retry!).marginBottom).toBe('0px');
    expect(parseFloat(getComputedStyle(home!).minHeight)).toBeGreaterThanOrEqual(44);
    expect(parseFloat(getComputedStyle(retry!).minHeight)).toBeGreaterThanOrEqual(44);
    expect(panel?.querySelector('.error-description')?.textContent)
      .toContain('Não foi possível carregar a sessão');
  });

  it('keeps the return-home action properly spaced when retry is not allowed', () => {
    http.get.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    const actions = page.querySelector<HTMLElement>('.error-state .error-actions');
    expect(actions?.children.length).toBe(1);
    expect(actions?.querySelector('.retry-action')).toBeNull();
    expect(actions?.querySelector('a.error-home-action')?.getAttribute('href')).toBe('/home');
    expect(parseFloat(getComputedStyle(actions!).marginTop)).toBeGreaterThanOrEqual(8);
  });

  it('shows a retry action when the preview API is temporarily unavailable', () => {
    http.get.and.returnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;

    expect(page.textContent).toContain('Verifica a ligação e tenta novamente');
    expect(page.querySelector('.retry-action')).not.toBeNull();
    expect(page.querySelector('.error-state a')).not.toBeNull();
  });

  it('can reload the public preview after a temporary failure', () => {
    http.get.and.returnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    fixture.detectChanges();

    http.get.and.returnValue(of({
      id: 42,
      sport: 'Padel',
      city: 'Lisboa',
      gameDate: new Date(Date.now() + 3600_000).toISOString(),
      maxParticipants: 4,
      priceAmount: 0,
      status: 'OPEN',
      gamePhoto: null
    }) as any);

    const button = (fixture.nativeElement as HTMLElement).querySelector('.retry-action') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();

    expect(http.get).toHaveBeenCalledTimes(2);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Padel');
    expect((fixture.nativeElement as HTMLElement).querySelector('.retry-action')).toBeNull();
  });

  it('does not offer retries for sessions that are not publicly available', () => {
    http.get.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;

    expect(page.textContent).toContain('Esta sessão não está disponível para consulta pública');
    expect(page.querySelector('.retry-action')).toBeNull();
    expect(page.querySelector('.error-state a')).not.toBeNull();
  });

  it('opens the protected session for a returning player whose access token can be refreshed', () => {
    authenticationService.hasSessionCandidate.and.returnValue(true);
    const page = render();

    expect(authenticationService.hasSessionCandidate).toHaveBeenCalled();
    expect(page.querySelector('.join-panel .primary-action')?.getAttribute('href'))
      .toBe('/menu/events/42?join=1');
    expect(page.textContent).not.toContain('Criar conta');
    expect(page.textContent).not.toContain('Já tenho conta');
  });

  it('keeps account creation for a visitor with no recoverable session', () => {
    const page = render();
    const action = page.querySelector('.join-panel .primary-action') as HTMLAnchorElement;

    expect(authenticationService.hasSessionCandidate).toHaveBeenCalled();
    expect(action.getAttribute('href')).toContain('/login/registerNewUser');
    expect(action.getAttribute('href')).toContain('returnUrl=');
    expect(page.textContent).toContain('Criar conta');
  });

  it('lets an authenticated player open an available shared session directly', () => {
    authenticationService.isLoggedIn.and.returnValue(true);
    const page = render();

    const action = page.querySelector('.join-panel .primary-action') as HTMLAnchorElement;
    expect(action).not.toBeNull();
    expect(action.getAttribute('href')).toBe('/menu/events/42?join=1');
    expect(page.textContent).toContain('Ver sessão e inscrever-me');
    expect(page.textContent).not.toContain('Criar conta');
    expect(page.textContent).not.toContain('Já tenho conta');
  });

  it('lets an authenticated player open the waiting list for a full session', () => {
    authenticationService.isLoggedIn.and.returnValue(true);
    const page = render({ status: 'FULL' });

    const action = page.querySelector('.join-panel .primary-action') as HTMLAnchorElement;
    expect(action.getAttribute('href')).toBe('/menu/events/42?join=1');
    expect(page.textContent).toContain('Ver sessão e lista de espera');
  });

  it('keeps closed shared session details accessible without a login prompt', () => {
    authenticationService.isLoggedIn.and.returnValue(true);
    const page = render({ status: 'CANCELLED' });

    const action = page.querySelector('.join-panel .primary-action') as HTMLAnchorElement;
    expect(action.getAttribute('href')).toBe('/menu/events/42');
    expect(page.textContent).toContain('Ver detalhes');
    expect(page.textContent).not.toContain('Já tenho conta');
  });

  it('offers account creation for a future open session', () => {
    const page = render();
    expect(page.querySelector('.join-panel .primary-action')).not.toBeNull();
    expect(page.querySelector('.join-panel .status.closed')).toBeNull();
    expect(page.textContent).toContain('Inscrições abertas');
  });

  it('offers the waitlist rather than marking a future full session as closed', () => {
    const page = render({ status: 'FULL' });
    expect(page.querySelector('.join-panel .primary-action')).not.toBeNull();
    expect(page.querySelector('.join-panel .status.closed')).toBeNull();
    expect(page.textContent).toContain('lista de espera');
  });

  it('does not invite registration for a cancelled session', () => {
    const page = render({ status: 'CANCELLED' });
    expect(page.querySelector('.join-panel .primary-action')).toBeNull();
    expect(page.querySelector('.join-panel .status.closed')).not.toBeNull();
    expect(page.textContent).toContain('Esta sessão já não aceita inscrições');
    expect(page.querySelector('.join-panel .secondary-action')).not.toBeNull();
  });

  it('does not invite registration for a completed session', () => {
    const page = render({ status: 'COMPLETED' });
    expect(page.querySelector('.join-panel .primary-action')).toBeNull();
    expect(page.textContent).toContain('Sessão concluída');
  });

  it('closes registrations when an open session has already started', () => {
    const page = render({ gameDate: new Date(Date.now() - 3600_000).toISOString() });
    expect(page.querySelector('.join-panel .primary-action')).toBeNull();
    expect(page.textContent).toContain('Inscrições encerradas');
  });

  describe('no-login guest invitations', () => {
    const token='A'.repeat(43);
    const receipt='B'.repeat(43);
    function renderGuest() {
      routeQueryParamMap=convertToParamMap({guest:token});
      (http.post as jasmine.Spy).and.callFake((url:string,body:any) => {
        if(url.endsWith('/guest-preview')) {
          expect(body.token).toBe(token);
          return of({id:42,sport:'Futebol',city:'Lisboa',
            gameDate:new Date(Date.now()+3600_000).toISOString(),
            maxParticipants:4,participantCount:2,priceAmount:0,status:'OPEN',gamePhoto:null});
        }
        if(url.endsWith('/guest-confirmed-players')) {
          expect(body.token).toBe(token);
          return of([]);
        }
        if(url.endsWith('/guest-roster')) {
          expect(body.token).toBe(token);
          return of({sessionId:42,communityId:7,players:[
            {id:21,name:'Afonso Salvador'},{id:22,name:'João Marques'}]});
        }
        if(url.endsWith('/guest-requests')) {
          return of({receipt,status:'PENDING'});
        }
        if(url.endsWith('/guest-requests/status')) {
          return of({receipt,status:'APPROVED'});
        }
        return throwError(()=>new Error('Unexpected route '+url));
      });
      const page = render({sport:'Futebol'});
      fixture.componentInstance.startInvitation();
      fixture.componentInstance.chooseInvitationIdentity(false);
      fixture.detectChanges();
      return page;
    }

    it('starts with one confirmation button and does not auto-register on link opening', () => {
      routeQueryParamMap=convertToParamMap({guest:token});
      (http.post as jasmine.Spy).and.callFake((url:string) => {
        if (url.endsWith('/guest-preview')) return of({id:42,sport:'Futsal',city:'Lisboa',
          gameDate:new Date(Date.now()+3600_000).toISOString(),
          maxParticipants:10,participantCount:2,priceAmount:0,status:'OPEN',gamePhoto:null});
        if (url.endsWith('/guest-roster')) return of({sessionId:42,communityId:7,players:[]});
        if (url.endsWith('/guest-confirmed-players')) return of([]);
        return throwError(()=>new Error('Unexpected '+url));
      });
      const page=render();
      expect(page.querySelector('.invitation-first-confirm')).not.toBeNull();
      expect(page.querySelector('#guest-new-name')).toBeNull();
      expect(page.textContent).not.toContain('Já tens conta Jynlo?');
      expect((http.post as jasmine.Spy).calls.allArgs().some(
        call=>String(call[0]).endsWith('/guest-join-account')
          || String(call[0]).endsWith('/guest-requests'))).toBeFalse();
      (page.querySelector('.invitation-first-confirm') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(page.textContent).toContain('Já tens conta Jynlo?');
      expect(page.querySelector('.invitation-have-account')).not.toBeNull();
      expect(page.querySelector('.invitation-no-account')).not.toBeNull();
    });

    it('confirms a new anonymous name in one server call without an intermediate confirmation page', () => {
      routeQueryParamMap=convertToParamMap({guest:token});
      (http.post as jasmine.Spy).and.callFake((url:string, body:any) => {
        if (url.endsWith('/guest-preview')) return of({id:42,sport:'Futsal',city:'Lisboa',
          gameDate:new Date(Date.now()+3600_000).toISOString(),
          maxParticipants:10,participantCount:2,priceAmount:0,status:'OPEN',gamePhoto:null});
        if (url.endsWith('/guest-roster')) return of({sessionId:42,communityId:7,players:[]});
        if (url.endsWith('/guest-confirmed-players')) return of([]);
        if (url.endsWith('/guest-requests')) {
          expect(body).toEqual(jasmine.objectContaining({linkToken:token,newName:'Joana Silva',playerId:null}));
          return of({receipt,status:'APPROVED',playerName:'Joana Silva'});
        }
        return throwError(()=>new Error('Unexpected '+url));
      });
      const page=render();
      (page.querySelector('.invitation-first-confirm') as HTMLButtonElement).click();
      fixture.detectChanges();
      (page.querySelector('.invitation-no-account') as HTMLButtonElement).click();
      fixture.detectChanges();
      fixture.componentInstance.setGuestNewName('Joana Silva');
      fixture.detectChanges();
      (page.querySelector('#guest-participate .guest-rsvp-primary') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fixture.componentInstance.guestStep).toBe('approved');
      expect(page.textContent).toContain('Joana Silva');
      expect(page.querySelector('.guest-rsvp-upgrade')).not.toBeNull();
      expect((http.post as jasmine.Spy).calls.allArgs().filter(c=>
        String(c[0]).endsWith('/guest-requests')).length).toBe(1);
    });


    it('signs in inline, confirms the real account once and opens its session details', () => {
      routeQueryParamMap=convertToParamMap({guest:token});
      (http.post as jasmine.Spy).and.callFake((url:string)=>{
        if (url.endsWith('/guest-preview')) return of({id:42,sport:'Futsal',city:'Lisboa',
          gameDate:new Date(Date.now()+3600_000).toISOString(),
          maxParticipants:10,participantCount:2,priceAmount:0,status:'OPEN',gamePhoto:null});
        if (url.endsWith('/guest-roster')) return of({sessionId:42,communityId:7,players:[]});
        if (url.endsWith('/guest-confirmed-players')) return of([]);
        if (url.endsWith('/guest-member-presence')) return of({status:'NONE',canCancel:false});
        if (url.endsWith('/guest-join-account')) return of({state:'PARTICIPANT',waitlistPosition:null});
        return throwError(()=>new Error('Unexpected '+url));
      });
      authenticationService.login.and.returnValue(of({token:'test-token',mfaRequired:false} as any));
      const navigation=spyOn(TestBed.inject(Router),'navigateByUrl').and.resolveTo(true);
      const page=render();
      expect((http.post as jasmine.Spy).calls.allArgs().some(c=>
        String(c[0]).endsWith('/guest-join-account'))).toBeFalse();
      (page.querySelector('.invitation-first-confirm') as HTMLButtonElement).click();
      fixture.detectChanges();
      (page.querySelector('.invitation-have-account') as HTMLButtonElement).click();
      fixture.detectChanges();
      const component=fixture.componentInstance;
      component.invitationLoginUsername='jynloteste';
      component.invitationLoginPassword='pass';
      component.loginInsideInvitation();
      expect(authenticationService.login).toHaveBeenCalledOnceWith('jynloteste','pass');
      expect(authenticationService.saveToken).toHaveBeenCalledOnceWith('test-token');
      expect((http.post as jasmine.Spy).calls.allArgs().filter(c=>
        String(c[0]).endsWith('/guest-join-account')).length).toBe(1);
      expect(navigation).toHaveBeenCalledWith('/menu/events/42');
      expect(sessionStorage.getItem('jynlo-invite-rsvp:42:'+token.slice(0,18))).toBeNull();
    });

    it('handles password MFA inline, then confirms the registered account once', () => {
      routeQueryParamMap=convertToParamMap({guest:token});
      (http.post as jasmine.Spy).and.callFake((url:string)=>{
        if (url.endsWith('/guest-preview')) return of({id:42,sport:'Futsal',city:'Lisboa',
          gameDate:new Date(Date.now()+3600_000).toISOString(),maxParticipants:10,
          participantCount:2,priceAmount:0,status:'OPEN',gamePhoto:null});
        if (url.endsWith('/guest-roster')) return of({sessionId:42,communityId:7,players:[]});
        if (url.endsWith('/guest-confirmed-players')) return of([]);
        if (url.endsWith('/guest-member-presence')) return of({status:'NONE',canCancel:false});
        if (url.endsWith('/guest-join-account')) return of({state:'PARTICIPANT',waitlistPosition:null});
        return throwError(()=>new Error('Unexpected '+url));
      });
      authenticationService.login.and.returnValue(of({
        mfaRequired:true,challengeId:'challenge-123',challengeExpiresAt:'2099-10-29T15:00:00Z'
      } as any));
      authenticationService.confirmMfaChallenge.and.returnValue(of({
        token:'verified-token',mfaRequired:false
      } as any));
      const navigate=spyOn(TestBed.inject(Router),'navigate').and.resolveTo(true);
      const navigateByUrl=spyOn(TestBed.inject(Router),'navigateByUrl').and.resolveTo(true);
      const page=render();
      (page.querySelector('.invitation-first-confirm') as HTMLButtonElement).click();
      fixture.detectChanges();
      (page.querySelector('.invitation-have-account') as HTMLButtonElement).click();
      fixture.detectChanges();
      const c=fixture.componentInstance;
      c.invitationLoginUsername='jynloteste';
      c.invitationLoginPassword='pass';
      c.loginInsideInvitation();
      fixture.detectChanges();
      expect(c.invitationStage).toBe('mfa');
      expect(page.querySelector('#invite-mfa-code')).not.toBeNull();
      expect(navigate).not.toHaveBeenCalled();
      expect((http.post as jasmine.Spy).calls.allArgs().some(args=>
        String(args[0]).endsWith('/guest-join-account'))).toBeFalse();
      c.invitationMfaCode='123456';
      c.confirmInvitationMfa();
      expect(authenticationService.confirmMfaChallenge).toHaveBeenCalledOnceWith('challenge-123','123456');
      expect(authenticationService.saveToken).toHaveBeenCalledOnceWith('verified-token');
      expect((http.post as jasmine.Spy).calls.allArgs().filter(args=>
        String(args[0]).endsWith('/guest-join-account'))).toHaveSize(1);
      expect(navigateByUrl).toHaveBeenCalledWith('/menu/events/42');
      expect(sessionStorage.getItem('jynlo-invite-rsvp:42:'+token.slice(0,18))).toBeNull();
      expect(sessionStorage.getItem('mfa-challenge-id')).toBeNull();
    });

    it('rejects malformed MFA codes and refreshes an expired challenge without navigating', () => {
      routeQueryParamMap=convertToParamMap({guest:token});
      (http.post as jasmine.Spy).and.callFake((url:string)=>{
        if (url.endsWith('/guest-preview')) return of({id:42,sport:'Futsal',city:'Lisboa',
          gameDate:new Date(Date.now()+3600_000).toISOString(),status:'OPEN',
          maxParticipants:10,participantCount:2,priceAmount:0,gamePhoto:null});
        if (url.endsWith('/guest-roster')) return of({sessionId:42,communityId:7,players:[]});
        if (url.endsWith('/guest-confirmed-players')) return of([]);
        return throwError(()=>new Error('unexpected '+url));
      });
      authenticationService.login.and.returnValue(of({
        mfaRequired:true,challengeId:'challenge-old',challengeExpiresAt:'2020-01-01T00:00:00Z'
      } as any));
      authenticationService.resendMfaChallenge.and.returnValue(of({
        challengeId:'challenge-new',challengeExpiresAt:'2099-01-01T00:00:00Z'
      } as any));
      const navigate=spyOn(TestBed.inject(Router),'navigate').and.resolveTo(true);
      render();
      const c=fixture.componentInstance;
      c.startInvitation();
      c.chooseInvitationIdentity(true);
      c.invitationLoginUsername='user';
      c.invitationLoginPassword='pass';
      c.loginInsideInvitation();
      expect(c.invitationMfaExpired).toBeTrue();
      c.invitationMfaCode='123456';
      c.confirmInvitationMfa();
      expect(authenticationService.confirmMfaChallenge).not.toHaveBeenCalled();
      c.resendInvitationMfa();
      expect(authenticationService.resendMfaChallenge).toHaveBeenCalledOnceWith('challenge-old');
      expect(c.invitationMfaChallengeId).toBe('challenge-new');
      expect(c.invitationMfaExpired).toBeFalse();
      c.invitationMfaCode='wrong';
      c.confirmInvitationMfa();
      expect(c.invitationMfaError).toBe('inviteCenter.mfaCodeInvalid');
      expect(authenticationService.confirmMfaChallenge).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      c.cancelInvitationMfa();
      expect(c.invitationStage).toBe('login');
      expect(c.invitationMfaChallengeId).toBe('');
      expect(sessionStorage.getItem('jynlo-invite-rsvp:42:'+token.slice(0,18))).toBeNull();
    });

    it('embeds the Google button and confirms an existing Google account in this invite', () => {
      routeQueryParamMap=convertToParamMap({guest:token});
      const google = {
        initialize: jasmine.createSpy('initialize'),
        renderButton: jasmine.createSpy('renderButton')
      };
      const previous=(window as any).google;
      (window as any).google={accounts:{id:google}};
      try {
        authenticationService.googleConfig.and.returnValue(of({clientId:'configured-client'}));
        authenticationService.googleLogin.and.returnValue(of({
          token:'google-token',onboardingRequired:false,mfaRequired:false
        } as any));
        (http.post as jasmine.Spy).and.callFake((url:string)=>{
          if (url.endsWith('/guest-preview')) return of({id:42,sport:'Futsal',city:'Lisboa',
            gameDate:new Date(Date.now()+3600_000).toISOString(),status:'OPEN',
            maxParticipants:10,participantCount:2,priceAmount:0,gamePhoto:null});
          if (url.endsWith('/guest-roster')) return of({sessionId:42,communityId:7,players:[]});
          if (url.endsWith('/guest-confirmed-players')) return of([]);
          if (url.endsWith('/guest-member-presence')) return of({status:'NONE',canCancel:false});
          if (url.endsWith('/guest-join-account')) return of({state:'PARTICIPANT',waitlistPosition:null});
          return throwError(()=>new Error('Unexpected '+url));
        });
        const navigateByUrl=spyOn(TestBed.inject(Router),'navigateByUrl').and.resolveTo(true);
        const page=render();
        (page.querySelector('.invitation-first-confirm') as HTMLButtonElement).click();
        fixture.detectChanges();
        (page.querySelector('.invitation-have-account') as HTMLButtonElement).click();
        fixture.detectChanges();
        (fixture.componentInstance as any).initializeInvitationGoogle();
        expect(google.initialize).toHaveBeenCalledTimes(1);
        expect(google.renderButton).toHaveBeenCalledTimes(1);
        const callback=google.initialize.calls.mostRecent().args[0].callback;
        callback({credential:'google-credential'});
        expect(authenticationService.googleLogin).toHaveBeenCalledOnceWith('google-credential');
        expect(authenticationService.saveToken).toHaveBeenCalledOnceWith('google-token');
        expect(navigateByUrl).toHaveBeenCalledWith('/menu/events/42');
        expect((http.post as jasmine.Spy).calls.allArgs().filter(args=>
          String(args[0]).endsWith('/guest-join-account'))).toHaveSize(1);
      } finally {
        (window as any).google=previous;
      }
    });

    it('does not register on login failure and does not persist a hidden auto-join', () => {
      routeQueryParamMap=convertToParamMap({guest:token});
      (http.post as jasmine.Spy).and.callFake((url:string)=>{
        if (url.endsWith('/guest-preview')) return of({id:42,sport:'Futsal',city:'Lisboa',
          gameDate:new Date(Date.now()+3600_000).toISOString(),
          maxParticipants:10,participantCount:2,priceAmount:0,status:'OPEN',gamePhoto:null});
        if (url.endsWith('/guest-roster')) return of({sessionId:42,communityId:7,players:[]});
        if (url.endsWith('/guest-confirmed-players')) return of([]);
        return throwError(()=>new Error('Unexpected '+url));
      });
      authenticationService.login.and.returnValue(throwError(()=>new Error('invalid credentials')));
      const page=render();
      (page.querySelector('.invitation-first-confirm') as HTMLButtonElement).click();
      fixture.detectChanges();
      (page.querySelector('.invitation-have-account') as HTMLButtonElement).click();
      fixture.detectChanges();
      const c=fixture.componentInstance;
      c.invitationLoginUsername='ana';
      c.invitationLoginPassword='incorrect';
      c.loginInsideInvitation();
      fixture.detectChanges();
      expect(c.isAuthenticated).toBeFalse();
      expect(c.invitationLoginError).toBe('inviteCenter.inlineLoginError');
      expect(sessionStorage.getItem('jynlo-invite-rsvp:42:'+token.slice(0,18))).toBeNull();
    });

    it('loads the name list only when holding a valid organizer-issued invite token', () => {
      const page=renderGuest();
      expect(page.querySelector('.guest-rsvp')).toBeTruthy();
      expect(fixture.componentInstance.guestPlayers.length).toBe(2);
      expect(fixture.componentInstance.guestCommunityId).toBe(7);
      expect(http.post).toHaveBeenCalledTimes(3);
      expect(page.querySelector('.guest-rsvp-primary:disabled')).toBeTruthy();
    });
    it('lets guests go back and correct their chosen player before submitting', () => {
      renderGuest();
      const component=fixture.componentInstance;
      component.setGuestNewName('Afonso Salvador');
      component.chooseGuest();
      fixture.detectChanges();
      expect(component.guestStep).toBe('confirm');
      expect(component.guestPlayerName).toBe('Afonso Salvador');
      const back=fixture.nativeElement.querySelector('.guest-rsvp-back') as HTMLButtonElement;
      back.click();
      fixture.detectChanges();
      expect(component.guestStep).toBe('choose');
      component.setGuestNewName('João Marques');
      component.chooseGuest();
      component.sendGuestRequest();
      fixture.detectChanges();
      const calls=(http.post as jasmine.Spy).calls.allArgs();
      const requestCall=calls.find(args=>String(args[0]).endsWith('/guest-requests'))!;
      expect(requestCall[1].playerId).toBeNull();
      expect(requestCall[1].newName).toBe('João Marques');
      expect(component.guestStep).toBe('pending');
      expect(localStorage.getItem('jynlo-guest-receipt:42:'+token.slice(0,18))).toBe(receipt);
    });
    it('offers optional registration only after organizer approval, not after sending', () => {
      const page=renderGuest();
      const component=fixture.componentInstance;
      component.setGuestNewName('Convidado novo');
      component.chooseGuest();
      component.sendGuestRequest();
      fixture.detectChanges();
      expect(page.querySelector('.guest-rsvp-upgrade')).toBeNull();
      component.checkGuestStatus();
      fixture.detectChanges();
      expect(component.guestStep).toBe('approved');
      expect(page.querySelector('.guest-rsvp-upgrade a[routerlink]')).toBeTruthy();
      expect((http.post as jasmine.Spy).calls.allArgs().find(args=>String(args[0]).endsWith('/guest-requests'))![1].playerId).toBeNull();
    });
    it('uses the Jynlo account instead of claiming a historical name when already logged in', () => {
      authenticationService.isLoggedIn.and.returnValue(true);
      routeQueryParamMap=convertToParamMap({guest:token});
      (http.post as jasmine.Spy).and.returnValue(of({id:42,sport:'Futebol',city:'Lisboa',
        gameDate:new Date(Date.now()+3600_000).toISOString(),
        maxParticipants:4,participantCount:2,priceAmount:0,status:'OPEN',gamePhoto:null}));
      const page=render({sport:'Futebol'});
      expect(fixture.componentInstance.isAuthenticated).toBeTrue();
      expect(fixture.componentInstance.guestPlayers).toEqual([]);
      expect(http.post).toHaveBeenCalledTimes(3);
      expect((http.post as jasmine.Spy).calls.allArgs().some(
        args => String(args[0]).endsWith('/guest-member-presence'))).toBeTrue();
      expect(page.querySelector('.guest-rsvp')).toBeNull();
      expect(page.querySelector('.header-login')).toBeNull();
      const join=page.querySelector('.join-panel .member-rsvp') as HTMLElement;
      expect(join).not.toBeNull();
      expect(fixture.componentInstance.participationReturnUrl)
        .toBe('/sessions/42?guest=' + token);
    });

    it('confirms with authenticated signed registration and stays on the invitation', () => {
      authenticationService.isLoggedIn.and.returnValue(true);
      routeQueryParamMap=convertToParamMap({guest:token});
      (http.post as jasmine.Spy).and.callFake((url:string)=>{
        if(url.endsWith('/guest-preview')) return of({id:42,sport:'Futebol',city:'Lisboa',
          gameDate:new Date(Date.now()+3600_000).toISOString(),
          maxParticipants:4,participantCount:2,priceAmount:0,status:'OPEN',gamePhoto:null});
        if(url.endsWith('/guest-confirmed-players')) return of([]);
        if(url.endsWith('/guest-join-account')) return of({state:'PARTICIPANT',waitlistPosition:null});
        if(url.endsWith('/guest-member-presence')) return of({status:'NONE',canCancel:false});
        throw new Error('Unexpected '+url);
      });
      const page=render();
      const navigation=spyOn(TestBed.inject(Router),'navigate').and.resolveTo(true);
      const button=page.querySelector('.join-panel .member-rsvp .guest-rsvp-primary') as HTMLButtonElement;
      expect(button).not.toBeNull();
      expect(navigation).not.toHaveBeenCalled();
      button.click();
      expect((http.post as jasmine.Spy).calls.allArgs().some(
        args=>String(args[0]).endsWith('/guest-join-account') && args[1].token===token)).toBeTrue();
      expect(navigation).not.toHaveBeenCalled();
      expect(fixture.componentInstance.memberPresence).toBe('PARTICIPANT');
      fixture.detectChanges();
      expect(page.textContent).toContain('A tua presença está confirmada!');
    });

    it('does not redirect into a forbidden community screen if registration fails', () => {
      authenticationService.isLoggedIn.and.returnValue(true);
      routeQueryParamMap=convertToParamMap({guest:token});
      (http.post as jasmine.Spy).and.callFake((url:string) =>
        url.endsWith('/guest-preview')
          ? of({id:42,sport:'Futebol',city:'Lisboa',
              gameDate:new Date(Date.now()+3600_000).toISOString(),
              maxParticipants:4,participantCount:2,priceAmount:0,status:'OPEN',gamePhoto:null})
          : url.endsWith('/guest-confirmed-players') ? of([])
          : url.endsWith('/guest-member-presence') ? of({status:'NONE',canCancel:false})
          : throwError(()=>new HttpErrorResponse({status:403})));
      const page=render();
      const navigation=spyOn(TestBed.inject(Router),'navigate').and.resolveTo(true);
      (page.querySelector('.join-panel .member-rsvp .guest-rsvp-primary') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(navigation).not.toHaveBeenCalled();
      expect(page.querySelector('[role="alert"]')?.textContent)
        .toContain('Não foi possível confirmar a presença');
    });

    it('keeps the guest token across sign-in even without a private approval receipt', () => {
      routeQueryParamMap=convertToParamMap({guest:token});
      renderGuest();
      expect(fixture.componentInstance.participationReturnUrl)
        .toBe('/sessions/42?guest='+token);
    });

    it('keeps an approved receipt available for explicit linking after optional signup', () => {
      authenticationService.isLoggedIn.and.returnValue(true);
      localStorage.setItem('jynlo-guest-receipt:42',receipt);
      routeQueryParamMap=convertToParamMap({guest:token});
      (http.post as jasmine.Spy).and.callFake((url:string) =>
        url.endsWith('/guest-preview')
          ? of({id:42,sport:'Futebol',city:'Lisboa',
              gameDate:new Date(Date.now()+3600_000).toISOString(),
              maxParticipants:4,participantCount:2,priceAmount:0,status:'OPEN',gamePhoto:null})
          : of({receipt,status:'APPROVED'}));
      const page=render({sport:'Futebol'});
      expect(fixture.componentInstance.guestStep).toBe('approved');
      expect(page.querySelector('.guest-rsvp')).toBeTruthy();
      expect(page.querySelector('.guest-rsvp-upgrade button')).toBeTruthy();
      expect((http.post as jasmine.Spy).calls.allArgs().some(
        args=>String(args[0]).endsWith('/guest-member-presence'))).toBeTrue();
      expect((http.post as jasmine.Spy).calls.allArgs().some(
        args=>String(args[0]).endsWith('/guest-requests/status'))).toBeTrue();
    });

    it('shows a cancelled approved reservation without asking the guest to register', () => {
      const page=renderGuest();
      const component=fixture.componentInstance;
      component.guestReceipt=receipt;
      (http.post as jasmine.Spy).and.returnValue(of({receipt,status:'CANCELLED'}));
      component.checkGuestStatus();
      fixture.detectChanges();
      expect(component.guestStep).toBe('cancelled');
      expect(page.textContent).toContain('Presença cancelada');
      expect(page.textContent).toContain('Já não tens uma vaga reservada neste jogo');
      expect(page.textContent).toContain('Se cancelaste por engano');
      expect(page.textContent).not.toContain('O organizador cancelou');
      expect(page.textContent).not.toContain('Cancelaste a tua presença');
      expect(component.guestCancelledBySelf).toBeFalse();
      expect(page.querySelector('.guest-rsvp-upgrade')).toBeNull();
    });

    it('shows ten confirmed identities only to a signed invite and distinguishes accounts', () => {
      routeQueryParamMap=convertToParamMap({guest:token});
      (http.post as jasmine.Spy).and.callFake((url:string) => {
        if(url.endsWith('/guest-preview')) return of({id:42,sport:'Futebol',city:'Lisboa',
          gameDate:new Date(Date.now()+3600_000).toISOString(),
          maxParticipants:10,participantCount:10,priceAmount:0,status:'FULL',gamePhoto:null});
        if(url.endsWith('/guest-roster')) return of({sessionId:42,communityId:7,players:[]});
        if(url.endsWith('/guest-confirmed-players')) return of([
          ...Array.from({length:5}, (_,i)=>({key:'account:'+i,name:'jynlo'+i,hasAccount:true})),
          ...Array.from({length:5}, (_,i)=>({key:'guest:'+i,name:'Convidado '+i,hasAccount:false}))
        ]);
        return of({});
      });
      const page=render();
      const panel=page.querySelector('.guest-confirmed-roster') as HTMLElement;
      expect(panel).not.toBeNull();
      expect(panel.querySelectorAll('.guest-confirmed-player').length).toBe(10);
      expect(panel.querySelectorAll('.guest-confirmed-player--account').length).toBe(5);
      expect(panel.textContent).toContain('Convidado 4');
      expect(panel.textContent).toContain('@jynlo4');
      expect(panel.textContent).toContain('COM CONTA');
      expect(panel.textContent).toContain('SEM CONTA');
      expect(page.querySelectorAll('.guest-rsvp').length).toBe(1);
    });

    it('reveals and refreshes private meeting instructions only after a confirmed guest receipt', () => {
      const page=renderGuest();
      const component=fixture.componentInstance;
      expect(page.querySelector('.guest-private-meeting-point')).toBeNull();
      component.guestReceipt=receipt;
      (http.post as jasmine.Spy).and.returnValue(of({
        receipt,status:'APPROVED',playerName:'Jogador A',
        meetingPointInstructions:'Portão 2 junto ao café'
      }));
      component.checkGuestStatus();
      fixture.detectChanges();
      expect(page.querySelector('.guest-private-meeting-point')?.textContent)
        .toContain('Portão 2 junto ao café');
      expect(page.querySelector('.guest-meeting-refresh')).toBeNull();
      (http.post as jasmine.Spy).and.returnValue(of({
        receipt,status:'APPROVED',meetingPointInstructions:'Entrada norte'
      }));
      component.checkGuestStatus();
      fixture.detectChanges();
      expect(page.querySelector('.guest-private-meeting-point')?.textContent).toContain('Entrada norte');
      expect(page.textContent).not.toContain('Portão 2 junto ao café');
      (http.post as jasmine.Spy).and.returnValue(of({
        receipt,status:'APPROVED',meetingPointInstructions:null
      }));
      component.checkGuestStatus();
      fixture.detectChanges();
      expect(page.querySelector('.guest-private-meeting-point')).toBeNull();
    });

    it('hides guest arrival notes if the verified receipt is revoked or invalid', () => {
      const page=renderGuest();
      const component=fixture.componentInstance;
      component.guestReceipt=receipt;
      (http.post as jasmine.Spy).and.returnValue(of({
        receipt,status:'APPROVED',meetingPointInstructions:'Portão privado'
      }));
      component.checkGuestStatus();
      fixture.detectChanges();
      expect(page.querySelector('.guest-private-meeting-point')).not.toBeNull();
      (http.post as jasmine.Spy).and.returnValue(of({
        receipt,status:'CANCELLED',meetingPointInstructions:'must not render'
      }));
      component.checkGuestStatus();
      fixture.detectChanges();
      expect(page.querySelector('.guest-private-meeting-point')).toBeNull();
      (http.post as jasmine.Spy).and.returnValue(of({
        receipt,status:'APPROVED',meetingPointInstructions:'New instructions'
      }));
      component.checkGuestStatus();
      (http.post as jasmine.Spy).and.returnValue(
        throwError(()=>new HttpErrorResponse({status:404})));
      component.checkGuestStatus();
      fixture.detectChanges();
      expect(component.guestReceipt).toBe('');
      expect(component.guestMeetingPoint).toBe('');
      expect(page.querySelector('.guest-private-meeting-point')).toBeNull();
    });

    it('recovers the confirmed historical name after reopening an invitation', () => {
      const secret='N'.repeat(43),receipt='R'.repeat(43);
      const key='jynlo-guest-receipt:42:'+secret.slice(0,18);
      localStorage.setItem(key,receipt);
      routeQueryParamMap=convertToParamMap({guest:secret});
      (http.post as jasmine.Spy).and.callFake((url:string) => {
        if(url.endsWith('/guest-preview')) return of({id:42,sport:'Futebol',city:'Parede',
          gameDate:new Date(Date.now()+3600_000).toISOString(),
          maxParticipants:10,participantCount:2,priceAmount:0,status:'OPEN',gamePhoto:null});
        if(url.endsWith('/guest-roster')) return of({sessionId:42,communityId:7,players:[]});
        if(url.endsWith('/guest-confirmed-players')) return of([{key:'guest:40',name:'Fresco',hasAccount:false}]);
        if(url.endsWith('/guest-requests/status')) return of({status:'APPROVED',playerName:'Fresco'});
        return of({});
      });
      const page=render();
      expect(fixture.componentInstance.guestStep).toBe('approved');
      expect(page.querySelector('.guest-rsvp-confirmed-identity')?.textContent).toContain('Fresco');
      expect(page.querySelector('.guest-confirmed-roster')?.textContent).toContain('Fresco');
      expect(localStorage.getItem(key)).toBe(receipt);
    });

    it('never treats an invalid guest link as a public roster permission', () => {
      routeQueryParamMap=convertToParamMap({guest:'bad'});
      const page=render({sport:'Futebol'});
      expect(page.querySelector('.guest-rsvp')).toBeNull();
      expect(http.post).not.toHaveBeenCalled();
    });
  });

  it('links a verified invitation to the exact Google Maps pin, never the city text', () => {
    const token='P'.repeat(43);
    routeQueryParamMap=convertToParamMap({guest:token});
    (http.post as jasmine.Spy).and.callFake((url:string) => {
      if (url.endsWith('/guest-preview')) return of({
        id:42,sport:'Futsal',city:'Campo Grande',
        address:'Campo Grande',venueName:'Campo Grande',
        latitude:38.7488967,longitude:-9.1526148,
        gameDate:new Date(Date.now()+3600_000).toISOString(),
        maxParticipants:10,participantCount:1,priceAmount:0,status:'OPEN',gamePhoto:null
      });
      if (url.endsWith('/guest-roster')) return of({sessionId:42,communityId:null,players:[]});
      if (url.endsWith('/guest-confirmed-players')) return of([]);
      return of({});
    });
    const page=render({city:'Outra localidade',latitude:40,longitude:-8});
    const link=page.querySelector('.public-location-link') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(new URL(link.href).searchParams.get('query')).toBe('38.7488967,-9.1526148');
    expect(link.textContent).toContain('Abrir pin exato');
    expect(link.href).not.toContain('Campo%20Grande');
  });

  it('a public preview never exposes signed coordinates and still searches only the city', () => {
    const page=render({city:'Cascais',latitude:38.7488967,longitude:-9.1526148});
    const link=page.querySelector('.public-location-link') as HTMLAnchorElement;
    expect(new URL(link.href).searchParams.get('query')).toBe('Cascais, Portugal');
    expect(link.href).not.toContain('38.7488967');
  });

  it('promotes attendance first, without duplicate login actions or a historical dropdown', () => {
    const token='L'.repeat(43);
    routeQueryParamMap=convertToParamMap({guest:token});
    (http.post as jasmine.Spy).and.callFake((url:string) => {
      if (url.endsWith('/guest-preview')) return of({
        id:42,sport:'Futsal',city:'Lisboa',
        gameDate:new Date(Date.now()+3600_000).toISOString(),
        maxParticipants:10,participantCount:1,priceAmount:0,status:'OPEN',gamePhoto:null
      });
      if (url.endsWith('/guest-roster')) return of({sessionId:42,communityId:null,players:[]});
      if (url.endsWith('/guest-confirmed-players')) return of([]);
      return of({});
    });
    const page=render();
    expect(page.querySelector('.invite-account-banner')).toBeNull();
    expect(page.querySelector('.header-login')).toBeNull();
    expect(page.querySelector('.join-panel .secondary-action:not(.whatsapp-share-action):not([href^="jynlo://"])')).toBeNull();
    expect(page.querySelector('#guest-player-select')).toBeNull();
    expect(page.querySelector('.invitation-first-confirm')).not.toBeNull();
    expect(page.querySelector('#guest-new-name')).toBeNull();
    expect(page.querySelector('.guest-rsvp-upgrade')).toBeNull();
    expect(http.post).toHaveBeenCalledTimes(3);
  });

  it('shows the real registered presence and cancels only after explicit confirmation', () => {
    authenticationService.isLoggedIn.and.returnValue(true);
    routeQueryParamMap=convertToParamMap({guest:'M'.repeat(43)});
    const posts=(http.post as jasmine.Spy);
    let registered=true;
    posts.and.callFake((url:string)=>{
      if (url.endsWith('/guest-preview')) return of({
        id:42,sport:'Futsal',city:'Lisboa',gameDate:new Date(Date.now()+3600_000).toISOString(),
        maxParticipants:10,participantCount:2,priceAmount:0,status:'OPEN',gamePhoto:null
      });
      if (url.endsWith('/guest-confirmed-players')) return of([]);
      if (url.endsWith('/guest-member-presence')) return of({
        status:registered?'PARTICIPANT':'NONE',canCancel:registered});
      if (url.endsWith('/leave')) {registered=false;return of(null);}
      return throwError(()=>new Error('unexpected '+url));
    });
    const page=render();
    expect(page.querySelector('.header-login')).toBeNull();
    expect(page.textContent).toContain('A tua presença está confirmada!');
    expect(page.querySelector('.member-rsvp .guest-cancel-link')).not.toBeNull();
    expect(posts.calls.allArgs().some(args=>String(args[0]).endsWith('/leave'))).toBeFalse();
    (page.querySelector('.member-rsvp .guest-cancel-link') as HTMLButtonElement).click();
    fixture.detectChanges();
    (page.querySelector('.member-rsvp .guest-cancel-danger') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(posts.calls.allArgs().filter(args=>String(args[0]).endsWith('/leave')).length).toBe(1);
    expect(fixture.componentInstance.memberPresence).toBe('NONE');
    expect(page.textContent).toContain('Cancelaste a tua presença');
    expect(page.querySelector('.member-rsvp .guest-rsvp-primary')).not.toBeNull();
  });

  it('does not allow registered self-registration on an unauthorised or failed status check', () => {
    authenticationService.isLoggedIn.and.returnValue(true);
    routeQueryParamMap=convertToParamMap({guest:'Q'.repeat(43)});
    (http.post as jasmine.Spy).and.callFake((url:string)=>{
      if (url.endsWith('/guest-preview')) return of({
        id:42,sport:'Futsal',city:'Lisboa',gameDate:new Date(Date.now()+3600_000).toISOString(),
        maxParticipants:10,participantCount:2,priceAmount:0,status:'OPEN',gamePhoto:null
      });
      if (url.endsWith('/guest-confirmed-players')) return of([]);
      if (url.endsWith('/guest-member-presence'))
        return throwError(()=>new HttpErrorResponse({status:403}));
      return throwError(()=>new Error('unexpected '+url));
    });
    const page=render();
    expect(page.querySelector('.member-rsvp [role="alert"]')).not.toBeNull();
    expect(page.querySelector('.member-rsvp .guest-rsvp-primary')).toBeNull();
    expect((http.post as jasmine.Spy).calls.allArgs().some(
      args=>String(args[0]).endsWith('/guest-join-account'))).toBeFalse();
  });

  it('keeps the signed invitation free of a redundant open-app header', () => {
    const token='J'.repeat(43);
    routeQueryParamMap=convertToParamMap({guest:token});
    authenticationService.isLoggedIn.and.returnValue(true);
    (http.post as jasmine.Spy).and.callFake((url:string) => {
      if (url.endsWith('/guest-preview')) return of({id:42,sport:'Futsal',city:'Lisboa',
        gameDate:new Date(Date.now()+3600000).toISOString(),status:'OPEN',maxParticipants:10,
        participantCount:2,priceAmount:0,gamePhoto:null});
      if (url.endsWith('/guest-member-presence')) return of({status:'PARTICIPANT',canCancel:true});
      if (url.endsWith('/guest-confirmed-players')) return of([]);
      return of({});
    });
    const page=render();
    expect(page.querySelector('.header-login')).toBeNull();
    expect(page.querySelector('.member-presence-status')?.textContent).toContain('Presença confirmada');
    expect(page.querySelector('.member-cancel-action')?.textContent).toContain('Cancelar');
    expect(page.querySelector('#guest-player-select')).toBeNull();
  });

});
