import { appTranslate } from '../../i18n/i18n.service';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, forwardRef, HostListener, Input, OnDestroy, Output, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface JynloSelectOption {
  value: string;
  label: string;
  /** Secondary description for richer server-search choices. */
  description?: string;
}

/**
 * Reusable searchable premium select. Implements the Angular forms contract so
 * registration and profile fields retain their exact persisted string values.
 * Never translates labels into values or changes required/disabled semantics.
 */
@Component({
  selector: 'app-jynlo-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './jynlo-select.component.html',
  styleUrls: ['./jynlo-select.component.css'],
  providers: [{provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => JynloSelectComponent), multi: true}]
})
export class JynloSelectComponent implements ControlValueAccessor, OnDestroy {
  @Input() options: readonly JynloSelectOption[] = [];
  @Input() placeholder = 'Selecionar';
  @Input() ariaLabel = '';
  @Input() searchable = false;
  /** Remote mode emits typed text instead of filtering locally cached results. */
  @Input() remoteSearch = false;
  @Input() remoteQuery = '';
  @Output() remoteQueryChange = new EventEmitter<string>();
  @Input() loading = false;
  @Input() loadingLabel = 'A pesquisar…';
  @Input() emptyLabel = appTranslate('Sem resultados');
  @Input() invalid = false;
  @Input() required = false;
  // Angular NgModel handles the [disabled] form state; [blocked] makes the
  // UI unavailable immediately without competing for the same input.
  private disabledByForms = false;
  // Explicitly separate the presentation state from NgModel's [disabled]
  // directive input, which may win the shared binding on a custom element.
  private _blocked = false;
  @Input() set blocked(value: boolean) {
    this._blocked = value;
    // [blocked] can change before Angular Forms invokes setDisabledState.
    if (this.disabled) this.close();
  }
  get blocked(): boolean { return this._blocked; }
  get disabled(): boolean { return this.blocked || this.disabledByForms; }
  @Input() accent: 'teal' | 'violet' = 'teal';
  @Output() picked = new EventEmitter<string>();

  @ViewChild('root') root?: ElementRef<HTMLElement>;
  @ViewChild('trigger') trigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('filterInput') filterInput?: ElementRef<HTMLInputElement>;
  @ViewChildren('optionButton') optionButtons?: QueryList<ElementRef<HTMLButtonElement>>;

  private static nextId = 0;
  readonly listId = 'jynlo-select-list-' + (++JynloSelectComponent.nextId);
  value = '';
  open = false;
  query = '';
  /** Viewport-coordinates: the menu must escape overflow-clipped form cards. */
  popoverLeft = 0;
  popoverTop = 0;
  popoverBottom = 0;
  popoverWidth = 240;
  popoverMaxHeight = 350;
  openAbove = false;

  constructor(private readonly cdr: ChangeDetectorRef) {}

  private change: (value: string) => void = () => {};
  private touched: () => void = () => {};
  private readonly repositionOnScroll = (): void => this.repositionPopover();

  ngOnDestroy(): void {
    document.removeEventListener('scroll', this.repositionOnScroll, true);
  }

  /** Place a fixed-position menu against the trigger, including in clipped cards. */
  repositionPopover(): void {
    if (!this.open || !this.trigger) return;
    const rect = this.trigger.nativeElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const margin = 8;
    const below = Math.max(0, viewportHeight - rect.bottom - margin - 6);
    const above = Math.max(0, rect.top - margin - 6);
    const wanted = Math.min(360, this.options.length * 43 + (this.searchable ? 66 : 10));
    this.openAbove = below < Math.min(wanted, 240) && above > below;
    const available = this.openAbove ? above : below;
    this.popoverMaxHeight = Math.max(0, available);
    this.popoverWidth = Math.min(rect.width, viewportWidth - 2 * margin);
    this.popoverLeft = Math.max(margin, Math.min(rect.left, viewportWidth - margin - this.popoverWidth));
    this.popoverTop = rect.bottom + 6;
    this.popoverBottom = viewportHeight - rect.top + 6;
    this.cdr.markForCheck();
  }

  @HostListener('window:resize')
  resized(): void { this.repositionPopover(); }

  @HostListener('focusout')
  focusLeft(): void {
    // A tab out must finish the interaction, but moving to search/options is internal.
    setTimeout(() => {
      if (this.open && !this.root?.nativeElement.contains(document.activeElement)) {
        this.close();
        this.touched();
      }
    }, 0);
  }

  writeValue(value: unknown): void {
    this.value = typeof value === 'string' ? value : (value == null ? '' : String(value));
    // Angular Forms invokes CVA callbacks outside input change detection.
    this.cdr.markForCheck();
  }
  registerOnChange(fn: (value: string) => void): void { this.change = fn; }
  registerOnTouched(fn: () => void): void { this.touched = fn; }
  setDisabledState(disabled: boolean): void {
    this.disabledByForms = disabled;
    if (this.disabled) this.close();
    this.cdr.markForCheck();
  }

  get selected(): JynloSelectOption | undefined {
    return this.options.find(option => option.value === this.value);
  }
  get displayValue(): string {
    return this.selected?.label || (this.remoteSearch ? this.remoteQuery : this.value) || this.placeholder;
  }

  get isPlaceholder(): boolean {
    return !this.selected && !(this.remoteSearch && this.remoteQuery) && !this.value;
  }


  get visibleOptions(): readonly JynloSelectOption[] {
    const normalized = (value: string) => value.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
    const filter = normalized(this.query.trim());
    if (this.remoteSearch) return this.options;
    return filter
      ? this.options.filter(option => normalized(option.label).includes(filter))
      : this.options;
  }

  toggle(): void {
    if (this.disabled) return;
    if (this.open) { this.close(); return; }
    this.open = true;
    this.query = this.remoteSearch ? this.remoteQuery : '';
    this.repositionPopover();
    document.addEventListener('scroll', this.repositionOnScroll, true);
    if (this.searchable) {
      setTimeout(() => {
        if (!this.open) return;
        this.filterInput?.nativeElement.focus();
        this.repositionPopover(); // mobile virtual keyboard can shrink the viewport
      }, 0);
    }
  }

  onSearchChanged(value: string): void {
    this.query = value;
    if (this.remoteSearch) this.remoteQueryChange.emit(value);
  }

  choose(value: string): void {
    if (this.disabled || this.loading) return;
    this.value = value;
    this.change(value);
    this.picked.emit(value);
    this.touched();
    this.close();
    this.trigger?.nativeElement.focus();
  }

  close(): void {
    this.open = false;
    this.query = '';
    document.removeEventListener('scroll', this.repositionOnScroll, true);
  }

  @HostListener('document:click', ['$event'])
  outsideClick(event: MouseEvent): void {
    if (this.open && !this.root?.nativeElement.contains(event.target as Node)) {
      this.close();
      this.touched();
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  escape(event: Event): void {
    if (!this.open) return;
    event.preventDefault();
    this.close();
    this.touched();
    this.trigger?.nativeElement.focus();
  }

  triggerKey(event: KeyboardEvent): void {
    if (this.disabled || !['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    if (!this.open) this.toggle();
    if (!this.searchable) {
      setTimeout(() => {
        const buttons = this.optionButtons?.toArray() || [];
        (event.key === 'ArrowUp' ? buttons[buttons.length - 1] : buttons[0])?.nativeElement.focus();
      }, 0);
    }
  }

  searchKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault(); // never submit the enclosing registration/profile form
      const first = this.visibleOptions[0];
      if (first) this.choose(first.value);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = this.optionButtons?.toArray() || [];
    (event.key === 'ArrowUp' ? buttons[buttons.length - 1] : buttons[0])?.nativeElement.focus();
  }

  optionKey(event: KeyboardEvent, index: number): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = this.optionButtons?.toArray() || [];
    if (!buttons.length) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].nativeElement.focus();
  }
}
