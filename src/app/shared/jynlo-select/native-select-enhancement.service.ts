import { appTranslate } from '../../i18n/i18n.service';
import { Injectable, NgZone, OnDestroy } from '@angular/core';

/**
 * Progressive enhancement for native single selects across routed and standalone
 * pages. The original <select> stays in the form (including ngModel, ngValue,
 * disabled, required and its change events); only its browser popup is replaced.
 *
 * Existing app-jynlo-select components are left alone. Multiple/listbox selects
 * and .jynlo-select-native-exempt explicitly keep their native behaviour.
 */
@Injectable({ providedIn: 'root' })
export class NativeSelectEnhancementService implements OnDestroy {
  private started = false;
  private active: HTMLSelectElement | null = null;
  private menu: HTMLDivElement | null = null;
  private choices: HTMLDivElement | null = null;
  private search: HTMLInputElement | null = null;
  private observer: MutationObserver | null = null;
  private pointerActivated: HTMLSelectElement | null = null;
  private readonly selector = 'select:not([multiple]):not([size]):not(.jynlo-select-native-exempt)';

  constructor(private readonly zone: NgZone) {}

  start(): void {
    if (this.started || typeof document === 'undefined') return;
    this.started = true;
    this.zone.runOutsideAngular(() => {
      document.addEventListener('pointerdown', this.onPointerDown, true);
      document.addEventListener('click', this.onClick, true);
      document.addEventListener('keydown', this.onKeyDown, true);
      document.addEventListener('scroll', this.onScroll, true);
      window.addEventListener('resize', this.onScroll);
      window.visualViewport?.addEventListener('resize', this.onScroll);
    });
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    document.removeEventListener('pointerdown', this.onPointerDown, true);
    document.removeEventListener('click', this.onClick, true);
    document.removeEventListener('keydown', this.onKeyDown, true);
    document.removeEventListener('scroll', this.onScroll, true);
    window.removeEventListener('resize', this.onScroll);
    window.visualViewport?.removeEventListener('resize', this.onScroll);
    this.close();
  }

  ngOnDestroy(): void { this.stop(); }

  private eligible(target: EventTarget | null): HTMLSelectElement | null {
    if (!(target instanceof HTMLSelectElement)) return null;
    if (!target.matches(this.selector) || target.disabled || !target.closest('app-root')) return null;
    if (target.getClientRects().length === 0) return null;
    return target;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    const select = this.eligible(event.target);
    if (select) {
      // Prevent the native popup, which CSS cannot theme on all browsers.
      event.preventDefault();
      this.pointerActivated = select;
      select.focus({ preventScroll: true });
      this.toggle(select);
      return;
    }
    if (this.menu && event.target instanceof Node && !this.menu.contains(event.target)) {
      this.close();
    }
  };

  private readonly onClick = (event: MouseEvent): void => {
    const select = this.eligible(event.target);
    if (!select) return;
    event.preventDefault();
    if (this.pointerActivated !== select) {
      // Label activation and accessibility-generated clicks have no pointerdown
      // on the select itself, but should still open the custom list.
      select.focus({ preventScroll: true });
      this.toggle(select);
    }
    this.pointerActivated = null;
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.menu) {
      event.preventDefault();
      this.close(true);
      return;
    }

    const select = this.eligible(event.target);
    if (select && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      if (!this.menu || this.active !== select) {
        this.open(select);
      } else if (event.key === 'Enter' || event.key === ' ') {
        this.close();
        return;
      }
      this.focusOption(event.key === 'ArrowUp' ? -1 : 1, true);
      return;
    }

    if (!this.menu || !(event.target instanceof Node) || !this.menu.contains(event.target)) return;
    if (event.key === 'Tab') {
      this.close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.focusOption(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      this.focusOption(event.key === 'Home' ? 1 : -1, true);
    } else if (event.key === 'Enter' && event.target === this.search) {
      event.preventDefault(); // do not accidentally submit an enclosing form
      this.choices?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.click();
    }
  };

  private readonly onScroll = (): void => {
    if (this.active && !this.active.isConnected) {
      this.close();
      return;
    }
    this.place();
  };

  private toggle(select: HTMLSelectElement): void {
    if (this.active === select && this.menu) this.close();
    else this.open(select);
  }

  private open(select: HTMLSelectElement): void {
    this.close();
    if (!select.options.length) return;
    this.active = select;
    select.classList.add('jynlo-native-select--open');
    const popover = document.createElement('div');
    popover.className = 'jynlo-native-select__popover';
    popover.id = 'jynlo-native-select-options';
    popover.setAttribute('role', 'listbox');
    popover.setAttribute('aria-label', this.selectLabel(select));
    popover.addEventListener('pointerdown', e => e.stopPropagation());
    this.menu = popover;

    if (select.options.length > 10) {
      const input = document.createElement('input');
      input.className = 'jynlo-native-select__search';
      input.type = 'search';
      input.autocomplete = 'off';
      input.setAttribute('aria-label', this.isEnglish() ? 'Search options' : appTranslate('Pesquisar opções'));
      input.placeholder = this.isEnglish() ? 'Search options…' : appTranslate('Pesquisar opções…');
      input.addEventListener('input', () => {
        this.renderOptions(input.value);
        this.place();
      });
      popover.appendChild(input);
      this.search = input;
    }

    const choices = document.createElement('div');
    choices.className = 'jynlo-native-select__options';
    popover.appendChild(choices);
    this.choices = choices;
    document.body.appendChild(popover);
    this.renderOptions('');
    this.place();

    // Options can arrive asynchronously or change with language/form state.
    this.observer = new MutationObserver(() => {
      if (!select.isConnected || select.disabled) { this.close(); return; }
      this.renderOptions(this.search?.value || '');
      this.place();
    });
    this.observer.observe(select, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ['disabled', 'label', 'selected', 'value', 'hidden']
    });
  }

  private selectLabel(select: HTMLSelectElement): string {
    const explicit = select.getAttribute('aria-label');
    if (explicit) return explicit;
    const label = select.labels?.[0]?.textContent?.trim();
    return label || select.name || (this.isEnglish() ? 'Choose an option' : appTranslate('Escolher opção'));
  }

  private isEnglish(): boolean {
    return document.documentElement.lang.toLowerCase().startsWith('en');
  }

  private renderOptions(search: string): void {
    const select = this.active;
    const container = this.choices;
    if (!select || !container) return;
    container.replaceChildren();
    const normalized = (text: string) => text.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
    const needle = normalized(search);
    let visible = 0;
    let currentGroup: HTMLOptGroupElement | null = null;
    const options = Array.from(select.options);
    for (let index = 0; index < options.length; index++) {
      const option = options[index];
      if (option.hidden || (needle && !normalized(option.label).includes(needle))) continue;
      const group = option.parentElement instanceof HTMLOptGroupElement
        ? option.parentElement : null;
      if (group !== currentGroup && group?.label) {
        const heading = document.createElement('div');
        heading.className = 'jynlo-native-select__group';
        heading.textContent = group.label;
        container.appendChild(heading);
      }
      currentGroup = group;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'jynlo-native-select__option';
      button.textContent = option.label;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(option.selected));
      if (option.selected) {
        button.classList.add('jynlo-native-select__option--selected');
        const mark = document.createElement('span');
        mark.className = 'jynlo-native-select__check';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = '✓';
        button.appendChild(mark);
      }
      button.disabled = option.disabled || Boolean(group?.disabled);
      button.addEventListener('click', () => this.pick(index));
      container.appendChild(button);
      visible++;
    }
    if (!visible) {
      const empty = document.createElement('div');
      empty.className = 'jynlo-native-select__empty';
      empty.setAttribute('role', 'status');
      empty.textContent = this.isEnglish() ? 'No options found' : appTranslate('Sem opções encontradas');
      container.appendChild(empty);
    }
  }

  private pick(index: number): void {
    const select = this.active;
    if (!select || select.disabled) { this.close(); return; }
    const option = select.options[index];
    if (!option || option.disabled || (option.parentElement instanceof HTMLOptGroupElement
      && option.parentElement.disabled)) return;
    const changed = select.selectedIndex !== index;
    select.selectedIndex = index; // works with native value, ngValue and numeric Angular forms
    this.close();
    if (changed) {
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    select.focus({ preventScroll: true });
  }

  private focusOption(direction: number, first = false): void {
    const buttons = Array.from(this.choices?.querySelectorAll<HTMLButtonElement>(
      '.jynlo-native-select__option:not(:disabled)') || []);
    if (!buttons.length) { this.search?.focus(); return; }
    const index = buttons.findIndex(button => button === document.activeElement);
    const next = first
      ? (direction > 0 ? 0 : buttons.length - 1)
      : (index + direction + buttons.length) % buttons.length;
    buttons[next].focus({ preventScroll: true });
    buttons[next].scrollIntoView({ block: 'nearest' });
  }

  private place(): void {
    const menu = this.menu, select = this.active;
    if (!menu || !select) return;
    const rect = select.getBoundingClientRect();
    if (!rect.width || rect.bottom < 0 || rect.top > window.innerHeight) {
      this.close();
      return;
    }
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const margin = 8, gap = 6;
    const below = Math.max(0, viewportHeight - rect.bottom - gap - margin);
    const above = Math.max(0, rect.top - gap - margin);
    const openAbove = below < Math.min(menu.scrollHeight, 210) && above > below;
    const maxHeight = Math.max(72, Math.min(370, openAbove ? above : below));
    const width = Math.min(Math.max(rect.width, 190), viewportWidth - 2 * margin);
    menu.style.width = width + 'px';
    menu.style.maxHeight = maxHeight + 'px';
    menu.style.left = Math.max(margin, Math.min(rect.left, viewportWidth - margin - width)) + 'px';
    menu.style.top = (openAbove
      ? Math.max(margin, rect.top - gap - Math.min(menu.scrollHeight, maxHeight))
      : rect.bottom + gap) + 'px';
  }

  private close(restoreFocus = false): void {
    const select = this.active;
    this.observer?.disconnect();
    this.observer = null;
    this.menu?.remove();
    this.menu = null;
    this.choices = null;
    this.search = null;
    this.active = null;
    select?.classList.remove('jynlo-native-select--open');
    if (restoreFocus) select?.focus({ preventScroll: true });
  }
}
