import { DEFAULT_NAV_TABS, NAV_SLOTS, readNavTabs, resolveNavTabs, setNavSlot, writeNavTabs } from './nav-tabs';

describe('nav tabs', () => {
  it('starts with the default sections', () => {
    expect(resolveNavTabs(null, false)).toEqual(DEFAULT_NAV_TABS);
  });

  it('keeps valid saved choices, drops unknown or repeated ones and fills the gaps', () => {
    const ids = resolveNavTabs(['teams', 'teams', 'nope', 'my-venues'], false);
    expect(ids.length).toBe(NAV_SLOTS);
    expect(ids[0]).toBe('teams');
    expect(ids).not.toContain('my-venues');
    expect(new Set(ids).size).toBe(NAV_SLOTS);
  });

  it('lets venue managers put their venues in the bar', () => {
    expect(resolveNavTabs(['my-venues'], true)[0]).toBe('my-venues');
  });

  it('swaps when a section already in the bar is picked for another slot', () => {
    expect(setNavSlot(['discover', 'messages', 'activities', 'communities'], 0, 'communities'))
      .toEqual(['communities', 'messages', 'activities', 'discover']);
  });

  it('saves per account', () => {
    writeNavTabs('Ana', ['teams']);
    expect(readNavTabs('ana')).toEqual(['teams']);
    writeNavTabs('ana', null);
    expect(readNavTabs('ana')).toBeNull();
  });
});
