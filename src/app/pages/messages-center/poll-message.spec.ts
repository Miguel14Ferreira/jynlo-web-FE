import { encodePoll, isPollText, readPoll } from './poll-message';

describe('poll-message', () => {
  it('round-trips question and options, dropping empty options', () => {
    const text = encodePoll(' Que dia jogamos? ', ['Sábado', '', ' Domingo ']);
    expect(text).toBe('[JYNLO:POLL:1]Que dia jogamos?\nSábado\nDomingo');
    expect(readPoll(text)).toEqual({ question: 'Que dia jogamos?', options: ['Sábado', 'Domingo'] });
    expect(isPollText(text)).toBeTrue();
  });

  it('rejects invalid polls', () => {
    expect(encodePoll('Q', ['Só uma'])).toBe('');
    expect(encodePoll('Q', ['Sim', 'sim'])).toBe('');
    expect(encodePoll('', ['A', 'B'])).toBe('');
    expect(encodePoll('Q', ['1', '2', '3', '4', '5', '6', '7'])).toBe('');
    expect(readPoll('[JYNLO:POLL:1]Q\nA\n\nB')).toBeNull();
    expect(readPoll('olá')).toBeNull();
  });
});

import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ChatPollService } from '../../services/chat-poll.service';
import { InboxPollCardComponent } from './inbox-poll-card.component';

describe('InboxPollCardComponent', () => {
  it('loads results once per message, even when the poll object is re-created', () => {
    const service = jasmine.createSpyObj<ChatPollService>('ChatPollService', ['results', 'vote']);
    service.results.and.returnValue(of([{ messageId: 52, counts: [2, 0], total: 2, mine: null }]));
    TestBed.configureTestingModule({ imports: [InboxPollCardComponent],
      providers: [{ provide: ChatPollService, useValue: service }] });
    const fixture = TestBed.createComponent(InboxPollCardComponent);
    const card = fixture.componentInstance;
    for (let i = 0; i < 3; i++) {
      fixture.componentRef.setInput('poll', { question: 'Dia?', options: ['Sábado', 'Domingo'] });
      fixture.componentRef.setInput('kind', 'community');
      fixture.componentRef.setInput('conversationId', '77');
      fixture.componentRef.setInput('messageId', 52);
      fixture.detectChanges();
    }
    expect(service.results).toHaveBeenCalledTimes(1);
    expect(card.count(0)).toBe(2);
    expect(card.percent(0)).toBe(100);
  });
});
