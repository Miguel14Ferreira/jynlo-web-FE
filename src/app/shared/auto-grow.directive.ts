import { Directive, DoCheck, ElementRef, Input } from '@angular/core';

/**
 * Chat text boxes start as one line with no scrollbar, grow as the person
 * writes, and only show a scrollbar once they reach the maximum height.
 */
@Directive({ selector: 'textarea[appAutoGrow]', standalone: true })
export class AutoGrowDirective implements DoCheck {
  @Input() appAutoGrowMax = 124;
  private last: string | null = null;

  constructor(private readonly host: ElementRef<HTMLTextAreaElement>) {}

  ngDoCheck(): void {
    const area = this.host.nativeElement;
    if (area.value === this.last) return;
    this.last = area.value;
    area.style.resize = 'none';
    area.style.height = 'auto';
    const max = this.appAutoGrowMax;
    const wanted = area.scrollHeight + (area.offsetHeight - area.clientHeight);
    area.style.height = Math.min(wanted, max) + 'px';
    area.style.overflowY = wanted > max ? 'auto' : 'hidden';
  }
}
