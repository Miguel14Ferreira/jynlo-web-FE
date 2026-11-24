import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { FriendsComponent } from './friends.component';
import { CommunityService } from '../../services/community.service';
import { TEST_IMPORTS, TEST_PROVIDERS } from '../../testing/test-providers';

describe('FriendsComponent', () => {
  let component: FriendsComponent;
  let fixture: ComponentFixture<FriendsComponent>;
  let service: jasmine.SpyObj<CommunityService>;

  const friend = () => ({
    username: 'ana',
    fullName: 'Ana Silva',
    nickname: null,
    location: 'Lisboa',
    favoriteSports: 'Padel',
    profilePicUrl: null,
    chatBlocked: false,
    blockedByMe: false
  });

  beforeEach(async () => {
    service = jasmine.createSpyObj<CommunityService>(
      'CommunityService',
      ['friends', 'blockFriend', 'unblockFriend', 'removeFriend']
    );
    service.friends.and.returnValue(of([friend()]));
    service.blockFriend.and.returnValue(of({}));
    service.unblockFriend.and.returnValue(of({}));
    service.removeFriend.and.returnValue(of({}));

    await TestBed.configureTestingModule({
      declarations: [FriendsComponent],
      imports: TEST_IMPORTS,
      providers: [
        ...TEST_PROVIDERS,
        { provide: CommunityService, useValue: service }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(FriendsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load friends', () => {
    expect(component).toBeTruthy();
    expect(service.friends).toHaveBeenCalled();
    expect(component.friends.length).toBe(1);
  });

  it('uses the shared primary action when the friends list is empty', () => {
    service.friends.and.returnValue(of([]));
    component.load();
    fixture.detectChanges();

    const findPlayers: HTMLAnchorElement = fixture.nativeElement.querySelector(
      '.state-card a[href="/menu/profiles"]'
    );
    expect(findPlayers).toBeTruthy();
    expect(findPlayers.classList.contains('jynlo-action')).toBeTrue();
    expect(findPlayers.classList.contains('jynlo-action--primary')).toBeTrue();
  });

  it('should filter friends locally', () => {
    component.filter = 'lisboa';
    expect(component.filteredFriends.length).toBe(1);
  });

  it('keeps all friend-card actions on the same pill style and tracks expanded state', () => {
    const root: HTMLElement = fixture.nativeElement;
    const profile = root.querySelector('.friend-actions a[href*="/menu/profiles"]') as HTMLAnchorElement;
    const chat = root.querySelector('.friend-actions a[href*="/menu/messages?kind=direct"]') as HTMLAnchorElement;
    expect(chat.getAttribute('href')).toContain('id=ana');
    const more = root.querySelector('.friend-more__trigger') as HTMLButtonElement;

    expect(profile.classList.contains('jynlo-action')).toBeTrue();
    expect(chat.classList.contains('jynlo-action')).toBeTrue();
    expect(more.classList.contains('jynlo-action')).toBeTrue();
    expect(more.classList.contains('jynlo-action--neutral')).toBeTrue();
    expect(more.getAttribute('aria-expanded')).toBe('false');

    more.click();
    fixture.detectChanges();

    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector('.friend-more__menu')).toBeTruthy();
  });

  it('should toggle the compact more-actions menu', () => {
    const target = component.friends[0];

    component.toggleActions(target);
    expect(component.openActionsUsername).toBe('ana');

    component.toggleActions(target);
    expect(component.openActionsUsername).toBeNull();
  });

  it('should block a friend chat', () => {
    const target = component.friends[0];
    component.toggleBlock(target);

    expect(service.blockFriend).toHaveBeenCalledWith('ana');
    expect(target.chatBlocked).toBeTrue();
    expect(target.blockedByMe).toBeTrue();
  });

  it('should unblock a chat blocked by the current user', () => {
    const target = component.friends[0];
    target.chatBlocked = true;
    target.blockedByMe = true;

    component.toggleBlock(target);

    expect(service.unblockFriend).toHaveBeenCalledWith('ana');
    expect(target.chatBlocked).toBeFalse();
    expect(target.blockedByMe).toBeFalse();
  });

  it('should not unblock a chat blocked by the other user', () => {
    const target = component.friends[0];
    target.chatBlocked = true;
    target.blockedByMe = false;

    component.toggleBlock(target);

    expect(service.unblockFriend).not.toHaveBeenCalled();
    expect(service.blockFriend).not.toHaveBeenCalled();
    expect(component.actionError).toContain('outro utilizador');
    expect(target.chatBlocked).toBeTrue();
  });

  it('should remove a friend after confirmation', () => {
    const target = component.friends[0];

    component.requestRemove(target);
    component.confirmRemove(target);

    expect(service.removeFriend).toHaveBeenCalledWith('ana');
    expect(component.friends.length).toBe(0);
  });
});
