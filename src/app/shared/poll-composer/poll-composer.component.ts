import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { encodePoll, POLL_MAX_OPTION, POLL_MAX_OPTIONS, POLL_MAX_QUESTION } from '../../pages/messages-center/poll-message';

/** Small poll editor for group chats outside the messages centre (private groups, team chat). */
@Component({
  selector: 'app-poll-composer',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  template: `
    <section class="poll-composer" role="dialog" [attr.aria-label]="'chat.poll.createTitle' | t">
      <strong>📊 {{ 'chat.poll.createTitle' | t }}</strong>
      <input type="text" [(ngModel)]="question" [maxlength]="maxQuestion" name="pollQuestion"
        [placeholder]="'chat.poll.questionPlaceholder' | t" [attr.aria-label]="'chat.poll.question' | t" (ngModelChange)="invalid = false">
      @for (option of options; track $index; let i = $index) {
        <div class="poll-option">
          <input type="text" [ngModel]="option" (ngModelChange)="setOption(i, $event)" [maxlength]="maxOption" [name]="'pollOption' + i"
            [placeholder]="'chat.poll.option' | t:{n: i + 1}" [attr.aria-label]="'chat.poll.option' | t:{n: i + 1}">
          @if (options.length > 2) {
            <button type="button" (click)="remove(i)" [attr.aria-label]="'chat.poll.removeOption' | t">✕</button>
          }
        </div>
      }
      @if (options.length < maxOptions) {
        <button type="button" class="poll-add" (click)="options = [...options, '']">{{ 'chat.poll.addOption' | t }}</button>
      }
      @if (invalid) { <p role="alert" class="poll-error">{{ 'chat.poll.invalid' | t }}</p> }
      <div class="poll-actions">
        <button type="button" class="poll-send" (click)="submit()">{{ 'chat.poll.send' | t }}</button>
        <button type="button" (click)="closed.emit()">{{ 'chat.poll.close' | t }}</button>
      </div>
    </section>`,
  styles: [`
    .poll-composer{display:grid;gap:8px;padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.18);margin:8px 0}
    .poll-composer input{min-height:40px;padding:0 10px;border-radius:10px;border:1px solid rgba(255,255,255,.24);background:transparent;color:inherit}
    .poll-option{display:flex;gap:6px}.poll-option input{flex:1}
    .poll-composer button{min-height:36px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.24);background:transparent;color:inherit;cursor:pointer}
    .poll-send{background:var(--jynlo-mint,#7AE5C5)!important;color:#051824!important;border-color:transparent!important;font-weight:800}
    .poll-actions{display:flex;gap:8px}.poll-error{margin:0;color:#F2A19B}`]
})
export class PollComposerComponent {
  @Output() readonly send = new EventEmitter<string>();
  @Output() readonly closed = new EventEmitter<void>();
  readonly maxQuestion = POLL_MAX_QUESTION;
  readonly maxOption = POLL_MAX_OPTION;
  readonly maxOptions = POLL_MAX_OPTIONS;
  question = '';
  options = ['', ''];
  invalid = false;

  setOption(index: number, value: string): void {
    this.options = this.options.map((option, i) => i === index ? value : option);
    this.invalid = false;
  }
  remove(index: number): void {
    this.options = this.options.filter((_, i) => i !== index);
  }
  submit(): void {
    const text = encodePoll(this.question, this.options);
    if (!text) { this.invalid = true; return; }
    this.send.emit(text);
    this.question = ''; this.options = ['', ''];
  }
}
