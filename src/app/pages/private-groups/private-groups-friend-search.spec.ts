import { PrivateGroupsComponent } from './private-groups.component';
import { FriendSummary } from '../model/friend-summary';

describe('Private group friend picker', () => {
  let component: PrivateGroupsComponent;

  const people: FriendSummary[] = [
    { username: 'miguel', fullName: 'Miguel Ferreira', nickname: 'Migas',
      profilePicUrl: null, chatBlocked: false, blockedByMe: false },
    { username: 'jmarques', fullName: 'João Marques', nickname: null,
      profilePicUrl: null, chatBlocked: false, blockedByMe: false },
    { username: 'monicagomes', fullName: 'Mónica Gomes', nickname: 'Monica',
      profilePicUrl: null, chatBlocked: false, blockedByMe: false }
  ];

  beforeEach(() => {
    component = Object.create(PrivateGroupsComponent.prototype) as PrivateGroupsComponent;
    component.friends = [...people];
    component.friendSearch = '';
    component.selectedNames = new Set();
    component.showCreate = false;
    component.showAdd = false;
    component.showRename = false;
    component.busy = false;
    component.groupError = '';
    component.title = '';
    component.selected = null;
  });

  it('searches by full name, nickname and username without matching case or accents', () => {
    component.openCreate();
    component.friendSearch = 'JOAO';
    expect(component.filteredInviteFriends.map(friend => friend.username)).toEqual(['jmarques']);

    component.friendSearch = 'MÍGAS';
    expect(component.filteredInviteFriends.map(friend => friend.username)).toEqual(['miguel']);

    component.friendSearch = '@monicagomes';
    expect(component.filteredInviteFriends.map(friend => friend.username)).toEqual(['monicagomes']);

    component.friendSearch = 'MONICAGOMES';
    expect(component.filteredInviteFriends.map(friend => friend.username)).toEqual(['monicagomes']);
  });

  it('keeps selected friends when searching for another name or clearing the filter', () => {
    component.openCreate('Miguel');
    expect(component.selectedNames.has('miguel')).toBeTrue();

    component.friendSearch = 'joão';
    expect(component.filteredInviteFriends.map(friend => friend.username)).toEqual(['jmarques']);
    component.toggle('JMarques');

    component.friendSearch = 'nenhum resultado';
    expect(component.filteredInviteFriends).toEqual([]);
    expect([...component.selectedNames].sort()).toEqual(['jmarques', 'miguel']);

    component.clearFriendSearch();
    expect(component.filteredInviteFriends).toEqual(people);
    expect(component.selectedNames.size).toBe(2);
  });

  it('does not suggest existing group members when adding new friends', () => {
    component.selected = {
      id: 5, creatorUsername: 'organizer',
      members: [{ username: 'miguel' }]
    } as any;
    (component as any).me = 'organizer';

    component.openAdd();
    expect(component.friendSearch).toBe('');
    expect(component.invitedFriends.map(friend => friend.username)).toEqual([
      'jmarques', 'monicagomes'
    ]);
    component.friendSearch = 'monica';
    expect(component.filteredInviteFriends.map(friend => friend.username)).toEqual(['monicagomes']);
  });

  it('clears stale search state when closing and starting another invitation', () => {
    component.openCreate();
    component.friendSearch = 'joao';
    component.closeInviteDialog();
    expect(component.showCreate).toBeFalse();
    expect(component.friendSearch).toBe('');

    component.openCreate();
    expect(component.friendSearch).toBe('');
    expect(component.filteredInviteFriends.length).toBe(3);
  });

  it('returns to the originating direct chat when group creation is cancelled', () => {
    const navigate = jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true));
    (component as any).router = { navigate };
    (component as any).createOpenedFromMessages = true;
    component.initialFriend = 'miguel';
    component.openCreate('miguel');
    component.closeInviteDialog();

    expect(component.showCreate).toBeFalse();
    expect(component.initialFriend).toBe('');
    expect(navigate).toHaveBeenCalledOnceWith(['/menu/messages'], {
      queryParams: { kind: 'direct', id: 'miguel' }
    });
  });

  it('only closes the picker if creation starts from the groups page', () => {
    const navigate = jasmine.createSpy('navigate');
    (component as any).router = { navigate };
    component.openCreate();
    component.closeInviteDialog();

    expect(component.showCreate).toBeFalse();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('only closes the add-member picker without navigating away', () => {
    const navigate = jasmine.createSpy('navigate');
    (component as any).router = { navigate };
    component.selected = {
      id: 5, creatorUsername: 'organizer',
      members: [{ username: 'organizer' }]
    } as any;
    (component as any).me = 'organizer';
    component.openAdd();
    component.closeInviteDialog();

    expect(component.showAdd).toBeFalse();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not dismiss a busy invite dialog while a save is in progress', () => {
    component.openCreate();
    component.friendSearch = 'miguel';
    component.busy = true;
    component.closeInviteDialog();
    expect(component.showCreate).toBeTrue();
    expect(component.friendSearch).toBe('miguel');
  });
});
