import { PollComposerComponent } from './poll-composer.component';

describe('PollComposerComponent', () => {
  it('emits the encoded poll only when the question and two different options are filled', () => {
    const component = new PollComposerComponent();
    const sent: string[] = [];
    component.send.subscribe(text => sent.push(text));
    component.question = 'Que dia?';
    component.setOption(0, 'Sábado');
    component.submit();
    expect(component.invalid).toBeTrue();
    component.setOption(1, 'Domingo');
    component.submit();
    expect(sent).toEqual(['[JYNLO:POLL:1]Que dia?\nSábado\nDomingo']);
    expect(component.question).toBe('');
  });
});
