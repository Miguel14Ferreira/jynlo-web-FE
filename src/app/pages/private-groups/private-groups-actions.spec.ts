import { of } from 'rxjs';
import { PrivateGroupsComponent } from './private-groups.component';
import { PrivateGroupMessage, PrivateGroupService } from '../../services/private-group.service';

describe('Private group message actions', () => {
  let component: PrivateGroupsComponent;
  let api: jasmine.SpyObj<PrivateGroupService>;
  const msg = (over: Partial<PrivateGroupMessage> = {}): PrivateGroupMessage => ({
    id: 1, groupId: 5, sender: 'ana', text: 'Olá', createdAt: new Date(Date.now() - 60_000).toISOString(), ...over
  });

  beforeEach(() => {
    component = Object.create(PrivateGroupsComponent.prototype) as PrivateGroupsComponent;
    api = jasmine.createSpyObj<PrivateGroupService>('PrivateGroupService', ['edit', 'deleteMessage', 'send', 'upload']);
    (component as unknown as { api: unknown }).api = api;
    (component as unknown as { me: string }).me = 'ana';
    component.selected = { id: 5, title: 'G', creatorUsername: 'rui', createdAt: '', members: [] };
    component.messages = [msg(), msg({ id: 2, sender: 'rui', replyToId: 1 }), msg({ id: 3, replyToId: 99 })];
    component.busy = false;
  });

  it('allows editing only own text messages within 15 minutes', () => {
    expect(component.canEdit(msg())).toBeTrue();
    expect(component.canEdit(msg({ createdAt: new Date(Date.now() - 20 * 60_000).toISOString() }))).toBeFalse();
    expect(component.canEdit(msg({ sender: 'rui' }))).toBeFalse();
    expect(component.canEdit(msg({ attachments: [{ index: 0, filename: 'a.pdf', mimeType: 'application/pdf', size: 1 }] }))).toBeFalse();
    expect(component.canEdit(msg({ deleted: true }))).toBeFalse();
  });

  it('lets the sender, and not other members, delete (the creator can delete any)', () => {
    expect(component.canDelete(msg())).toBeTrue();
    expect(component.canDelete(msg({ sender: 'joao' }))).toBeFalse();
  });

  it('quotes the original message of a reply', () => {
    expect(component.quote(component.messages[1])).toEqual({ sender: 'ana', text: 'Olá' });
    expect(component.quote(component.messages[0])).toBeNull();
    expect(component.quote(component.messages[2])?.sender).toBe('');
  });

  it('recognises only Google Maps location links', () => {
    expect(component.locationUrl('Estou aqui https://www.google.com/maps?q=38.72000,-9.14000')).toBe('https://www.google.com/maps?q=38.72000,-9.14000');
    expect(component.locationUrl('https://evil.example/maps?q=1,2')).toBeNull();
  });

  it('sends replies with the target id and saves edits from the server copy', () => {
    api.send.and.returnValue(of(msg({ id: 9, replyToId: 1 })));
    component.draft = 'Sim';
    component.replyTarget = component.messages[0];
    component.send();
    expect(api.send).toHaveBeenCalledWith(5, 'Sim', 1);
    expect(component.replyTarget).toBeNull();

    api.edit.and.returnValue(of(msg({ text: 'Olá!', editedAt: new Date().toISOString() })));
    component.startEdit(component.messages[0]);
    component.editText = 'Olá!';
    component.saveEdit();
    expect(component.messages[0].text).toBe('Olá!');
    expect(component.editing).toBeNull();
  });
});
