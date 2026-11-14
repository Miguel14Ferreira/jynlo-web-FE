import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { PersonalLiveRoomComponent } from './personal-live-room.component';
import { PersonalLiveChatMessage, PersonalLiveService } from '../../services/personal-live.service';

describe('PersonalLiveRoomComponent', () => {
  let fixture: ComponentFixture<PersonalLiveRoomComponent>;
  let component: PersonalLiveRoomComponent;
  let service: jasmine.SpyObj<PersonalLiveService>;
  beforeEach(async () => {
    service=jasmine.createSpyObj<PersonalLiveService>('PersonalLiveService',
      ['join','messages','controls','sendMessage','end']);
    service.messages.and.returnValue(of([]));
    service.controls.and.returnValue(of({
      chatEnabled:true,mutedByHost:false,guestUsername:null,isGuest:false,
      mutedUsernames:[],requestStatus:null,pendingRequests:[]
    }));
    await TestBed.configureTestingModule({
      imports:[PersonalLiveRoomComponent],
      providers:[{provide:PersonalLiveService,useValue:service}]
    }).compileComponents();
    fixture=TestBed.createComponent(PersonalLiveRoomComponent);
    component=fixture.componentInstance;
    component.event={id:42,title:'Direto de teste',username:'organizador',
      avatarUrl:null,status:'LIVE',startedAt:new Date().toISOString(),canManage:false};
    spyOn(component,'connect').and.stub();
    fixture.detectChanges();
    component.room={} as any;
    fixture.detectChanges();
  });
  afterEach(() => fixture.destroy());

  it('allows spectators to hide chat, grow the video, then restore chat', () => {
    const root=fixture.nativeElement as HTMLElement;
    const buttons=()=>Array.from(root.querySelectorAll<HTMLButtonElement>('.live-toolbar button'));
    const hide=buttons().find(button=>button.textContent?.includes('Esconder chat'))!;
    hide.click();fixture.detectChanges();
    expect(root.querySelector('.live-layout-no-chat')).toBeTruthy();
    expect(root.querySelector('#personal-live-chat')).toBeNull();
    const show=buttons().find(button=>button.textContent?.includes('Mostrar chat'))!;
    show.click();fixture.detectChanges();
    expect(root.querySelector('#personal-live-chat')).toBeTruthy();
    const theater=buttons().find(button=>button.textContent?.includes('Ocupar tela'))!;
    theater.click();fixture.detectChanges();
    expect(root.querySelector('.live-layout-theater')).toBeTruthy();
    expect(root.querySelector('#personal-live-chat')).toBeTruthy();
  });

  it('shows a sent message immediately while the HTTP response is pending', () => {
    const response=new Subject<PersonalLiveChatMessage>();
    service.sendMessage.and.returnValue(response);
    component.draft='Olá malta';
    component.sendMessage();fixture.detectChanges();
    expect(component.draft).toBe('');
    expect(component.messages.length).toBe(1);
    expect(component.messages[0].message).toBe('Olá malta');
    expect(component.messages[0].username).toBe('Tu');
    response.next({id:17,username:'espetador',message:'Olá malta',
      createdAt:new Date().toISOString()});
    response.complete();fixture.detectChanges();
    expect(component.messages.length).toBe(1);
    expect(component.messages[0].id).toBe(17);
    expect(component.messages[0].username).toBe('espetador');
  });
});
