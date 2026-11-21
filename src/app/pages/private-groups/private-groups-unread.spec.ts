import { of } from 'rxjs';
import { PrivateGroupsComponent } from './private-groups.component';
import { PrivateGroup, PrivateGroupMessage } from '../../services/private-group.service';
import { InboxApiService } from '../../services/inbox-api.service';

describe('Private group unread counts', () => {
  const group = (id: number): PrivateGroup => ({ id, title: 'G' + id, creatorUsername: 'ana', members: [], createdAt: '', photoUrl: null } as unknown as PrivateGroup);
  let component: PrivateGroupsComponent;
  let inboxApi: jasmine.SpyObj<InboxApiService>;

  beforeEach(() => {
    component = Object.create(PrivateGroupsComponent.prototype) as PrivateGroupsComponent;
    inboxApi = jasmine.createSpyObj<InboxApiService>('InboxApiService', ['privateGroupSummaries', 'markPrivateGroupRead']);
    inboxApi.markPrivateGroupRead.and.returnValue(of({}));
    (component as unknown as { inboxApi: unknown }).inboxApi = inboxApi;
    component.unread = new Map();
    component.selected = null;
    component.groups = [group(5), group(6)];
  });

  it('shows server unread counts only for listed groups, and none for the open group', () => {
    const summary = (id: string, unreadCount: number) => ({ kind: 'private' as const, id, unreadCount,
      latestMessageId: null, latestText: null, latestSender: null, latestAt: null });
    inboxApi.privateGroupSummaries.and.returnValue(of([summary('5', 3), summary('6', 0), summary('99', 7)]));
    (component as unknown as { refreshUnread(): void }).refreshUnread();
    expect(inboxApi.privateGroupSummaries).toHaveBeenCalledWith([5, 6]);
    expect(component.unreadFor(group(5))).toBe(3);
    expect(component.unreadFor(group(6))).toBe(0);
    expect(component.unread.has(99)).toBeFalse();
    component.selected = group(5);
    expect(component.unreadFor(group(5))).toBe(0);
  });

  it('marks the newest message on screen as read on the server', () => {
    component.unread.set(5, 2);
    const messages = [{ id: 10 }, { id: 12 }, { id: 11 }] as PrivateGroupMessage[];
    (component as unknown as { markSeen(id: number, m: PrivateGroupMessage[]): void }).markSeen(5, messages);
    expect(inboxApi.markPrivateGroupRead).toHaveBeenCalledWith(5, 12);
    expect(component.unread.has(5)).toBeFalse();
  });
});
