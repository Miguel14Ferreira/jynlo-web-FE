/**
 * The navigation bar each person arranges. Feed, Criar, search, notifications and the account
 * menu always stay; the slots in between show the sections the person picked, in their order.
 * On a computer all 4 slots show; on a phone the bottom bar has room for the first 2.
 */
export interface NavTab { id: string; label: string; short?: string; route: string; icon: NavTabIcon; managerOnly?: boolean; bookingsOnly?: boolean; }
export type NavTabIcon = 'discover' | 'messages' | 'calendar' | 'list' | 'communities' | 'teams' | 'trophy' | 'pin' | 'ticket' | 'venue';

export const NAV_TAB_CATALOG: NavTab[] = [
  { id: 'discover', label: 'nav.discover', route: '/menu/discover', icon: 'discover' },
  { id: 'messages', label: 'nav.messages', route: '/menu/messages', icon: 'messages' },
  { id: 'activities', label: 'nav.activities', route: '/menu/events', icon: 'calendar' },
  { id: 'my-games', label: 'Os meus jogos', short: 'Jogos', route: '/menu/my-sessions', icon: 'list' },
  { id: 'communities', label: 'nav.communities', route: '/menu/communities', icon: 'communities' },
  { id: 'teams', label: 'Equipas', route: '/menu/teams', icon: 'teams' },
  { id: 'tournaments', label: 'Torneios', route: '/menu/teams/competitions', icon: 'trophy' },
  { id: 'venues', label: 'Recintos', route: '/menu/venues', icon: 'pin' },
  { id: 'my-bookings', label: 'As minhas reservas', short: 'Reservas', route: '/menu/venue-bookings', icon: 'ticket', bookingsOnly: true },
  { id: 'my-venues', label: 'Os meus recintos', short: 'Painel', route: '/menu/venue-bookings', icon: 'venue', managerOnly: true },
];
export const NAV_SLOTS = 4;
export const PHONE_SLOTS = 2;
export const DEFAULT_NAV_TABS = ['discover', 'messages', 'activities', 'communities'];
/** Someone who runs a venue starts with the venue panel first (they can still change the bar). */
export const MANAGER_DEFAULT_NAV_TABS = ['my-venues', 'discover', 'messages', 'activities'];
const STORAGE_PREFIX = 'jynlo-nav-tabs:';

export function navTab(id: string): NavTab | undefined {
  return NAV_TAB_CATALOG.find(tab => tab.id === id);
}

/** "As minhas reservas" only appears once some venue takes bookings on Jynlo. */
export function availableNavTabs(manager: boolean, bookingsOpen = false): NavTab[] {
  return NAV_TAB_CATALOG.filter(tab => (!tab.managerOnly || manager) && (!tab.bookingsOnly || bookingsOpen));
}

/** Exactly NAV_SLOTS ids, no repeats: the saved choice where valid, gaps filled from the defaults. */
export function resolveNavTabs(saved: unknown, manager: boolean, bookingsOpen = false): string[] {
  const allowed = new Set(availableNavTabs(manager, bookingsOpen).map(tab => tab.id));
  const picked: string[] = [];
  const take = (id: unknown) => {
    if (typeof id === 'string' && allowed.has(id) && !picked.includes(id) && picked.length < NAV_SLOTS) picked.push(id);
  };
  if (Array.isArray(saved)) saved.forEach(take);
  (manager ? MANAGER_DEFAULT_NAV_TABS : DEFAULT_NAV_TABS).forEach(take);
  availableNavTabs(manager, bookingsOpen).forEach(tab => take(tab.id));
  return picked;
}

/** Puts `id` in `slot`; if it was already in another slot the two swap. */
export function setNavSlot(ids: string[], slot: number, id: string): string[] {
  const next = ids.slice();
  if (slot < 0 || slot >= next.length) return next;
  const from = next.indexOf(id);
  if (from >= 0) next[from] = next[slot];
  next[slot] = id;
  return next;
}

function storageKey(username: string | null | undefined): string | null {
  const user = username?.trim().toLowerCase();
  return user ? STORAGE_PREFIX + user : null;
}

export function readNavTabs(username: string | null | undefined): unknown {
  const key = storageKey(username);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeNavTabs(username: string | null | undefined, ids: string[] | null): void {
  const key = storageKey(username);
  if (!key) return;
  try {
    if (ids) localStorage.setItem(key, JSON.stringify(ids));
    else localStorage.removeItem(key);
  } catch {
    // Private browsing: the choice lasts for this visit.
  }
}
