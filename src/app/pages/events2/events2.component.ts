import { HttpErrorResponse } from '@angular/common/http';
import { appTranslate as t } from '../../i18n/i18n.service';
import { ChangeDetectionStrategy, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime, finalize, retry, Subject, timeout } from 'rxjs';

import { CreateSessionRequest } from '../model/create-session-request';
import { CommunityGroup, CommunityCompetitionOverview } from '../model/community-group';
import { SessionService } from '../../services/session.service';
import { SessionPresetService } from '../../services/session-preset.service';
import { SessionPreset, SessionPresetSettings } from '../model/session-preset';
import { CommunityGroupsService } from '../../services/community-groups.service';
import { VenuePhoto, VenueService } from '../../services/venue.service';
import { Venue, VenueOwnershipType } from '../model/venue';
import { SPORTS_CATALOG } from '../../shared/sports-catalog';
import { suggestedMinimumPlayers } from '../../shared/session-minimum-players';
import { JynloSelectOption } from '../../shared/jynlo-select/jynlo-select.component';
import { MAINLAND_PORTUGAL_DISTRICTS, SEARCH_ALL_DISTRICTS } from '../../shared/portugal-districts';

@Component({
  selector: 'app-events2',
  templateUrl: './events2.component.html',
  styleUrls: ['./events2.component.css', './events2-create-flow.css', '../../../styles/jynlo-activities-neon-glass.css', './events2-neon-polish.css', './events2-v3-finish.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class Events2Component implements OnInit, OnDestroy {
  sport = '';
  playFormat: 'INDIVIDUAL' | 'PAIRS' = 'INDIVIDUAL';
  gameDate = '';
  city = '';
  address = '';
  meetingPointInstructions = '';
  airsoftGameType: '' | 'SKIRMISH' | 'MILSIM' | 'CAPTURE_THE_FLAG' = '';

  get meetingPointInputMaxLength(): number {
    return 240;
  }

  get sessionMeetingInstructions(): string | null {
    return this.meetingPointInstructions.trim() || null;
  }

  /** Optional safety checklist, independent from the public Airsoft game type. */
  applyAirsoftInstructionsTemplate(): void {
    if (this.sport !== 'Airsoft' || this.meetingPointInstructions.trim()) return;
    this.meetingPointInstructions = t('createSession.airsoftTemplate').slice(0, 240);
  }

  maxParticipants = 4;
  /** When enabled, the full capacity becomes the required minimum. */
  capacityIsMinimum = false;
  selectedMinimumPlayers: number | null = null;
  get minimumPlayers(): number {
    if (this.capacityIsMinimum) return Number(this.maxParticipants);
    return this.selectedMinimumPlayers === null
      ? suggestedMinimumPlayers(this.sport, Number(this.maxParticipants))
      : Number(this.selectedMinimumPlayers);
  }
  // The organiser already has one reserved Jynlo place.
  confirmedPlayers: number | null = 1;
  creationMode: 'START' | 'COMPLETE' = 'START';
  communities: CommunityGroup[] = [];
  shareCommunityIds: number[] = [];
  communitiesLoading = false;
  communitiesLoadError = false;
  directCommunity: CommunityGroup | null = null;
  private autoCommunitySport = '';
  private autoCommunityVenueId: number | null = null;
  private autoCommunityPoint: { source: 'maps' | 'gps'; latitude: number;
    longitude: number; city: string; address: string } | null = null;
  private communityPrefillRevision = 0;

  /** Apply defaults only when consistent across EVERY chosen community.
   * Manual sports, venues and locations always take priority. */
  private reconcileCommunityDefaults(): void {
    const revision = ++this.communityPrefillRevision;
    const groups = this.seasonCommunities;
    const sports = groups.map(group => group.sports?.length ? group.sports
      : (group.sport ? [group.sport] : []));
    const sport = groups.length && sports.every(list => list.length === 1)
        && sports.every(list => list[0] === sports[0][0])
      ? sports[0][0] : '';
    if (!this.sport.trim() || this.sport === this.autoCommunitySport) {
      if (this.sport !== sport) {
        this.sport = sport;
        this.confirmSportSelection();
      }
      this.autoCommunitySport = sport;
    }
    // Automatically suggested Maps/GPS points are also replaceable.
    // Never replace a manually changed coordinate, location method or address.
    const savedPoint = this.autoCommunityPoint;
    const autoStillIntact = !!savedPoint
      && this.locationMethod === savedPoint.source
      && this.locationSource === (savedPoint.source === 'maps' ? 'map' : 'gps')
      && this.latitude === savedPoint.latitude
      && this.longitude === savedPoint.longitude
      && this.city === savedPoint.city && this.address === savedPoint.address;
    if (autoStillIntact) {
      this.clearLocation();
      this.city = '';
      this.address = '';
      this.locationMethod = 'venue';
    }
    this.autoCommunityPoint = null;
    const points = groups.map(group =>
      group.habitualLocationSource && group.habitualLatitude != null && group.habitualLongitude != null
        ? group : null);
    const agreedPoint = points.length && points[0] !== null
      && points.every(group => group !== null
        && group.habitualLocationSource === points[0]?.habitualLocationSource
        && group.habitualLatitude === points[0]?.habitualLatitude
        && group.habitualLongitude === points[0]?.habitualLongitude)
      ? points[0] : null;
    if (agreedPoint && this.sportSelected && this.locationMethod === 'venue'
        && this.selectedVenueId === null && !this.hasCoordinates
        && !this.city.trim() && !this.address.trim()) {
      const source = agreedPoint.habitualLocationSource === 'GPS' ? 'gps' : 'maps';
      const latitude = agreedPoint.habitualLatitude!;
      const longitude = agreedPoint.habitualLongitude!;
      if (Number.isFinite(latitude) && Number.isFinite(longitude)
          && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
        this.locationMethod = source;
        this.locationSource = source === 'gps' ? 'gps' : 'map';
        this.latitude = latitude;
        this.longitude = longitude;
        this.locationCaptured = true;
        this.city = agreedPoint.habitualCity ?? '';
        this.address = agreedPoint.habitualAddress ?? '';
        this.autoCommunityPoint = {source, latitude, longitude,
          city: this.city, address: this.address};
      }
    }
    const venueIds = groups.map(group => group.defaultVenueId ?? null);
    const venueId = groups.length && venueIds[0] !== null
        && venueIds.every(id => id === venueIds[0])
      ? venueIds[0] : null;
    const isAutoVenue = this.selectedVenueId !== null
      && this.selectedVenueId === this.autoCommunityVenueId;
    if (isAutoVenue && this.selectedVenueId !== venueId) this.selectVenue(null);
    if (!venueId || !this.sportSelected || this.locationMethod !== 'venue'
        || (this.selectedVenueId !== null && !isAutoVenue)
        || (this.selectedVenueId === null && (this.city.trim() || this.address.trim()))) {
      this.autoCommunityVenueId = null;
      return;
    }
    if (this.selectedVenueId === venueId) return;
    // A manual search or sport change made while the community's habitual
    // venue loads must take precedence over the pending suggestion.
    const suggestedSport = this.sport;
    const initialVenueSearch = this.venueSearch;
    if (initialVenueSearch.trim()) return;
    this.venueService.get(venueId).pipe(timeout(10_000)).subscribe({
      next: venue => {
        if (revision !== this.communityPrefillRevision
            || this.locationMethod !== 'venue'
            || this.sport !== suggestedSport
            || this.venueSearch !== initialVenueSearch
            || this.selectedVenueId !== null
            || this.city.trim() || this.address.trim()) return;
        const allowedSports = (venue.sports || '').split(/[;,]/)
          .map(item => item.trim().toLocaleLowerCase('pt')).filter(Boolean);
        if (allowedSports.length
            && !allowedSports.includes(this.sport.trim().toLocaleLowerCase('pt'))) return;
        if (!this.newlyCreatedVenues.some(item => item.id === venue.id)) {
          this.newlyCreatedVenues = [...this.newlyCreatedVenues, venue];
        }
        if (!this.venues.some(item => item.id === venue.id)) this.venues = [...this.venues, venue];
        this.venueDistrict = this.districts.find(d => d === venue.district)
          || this.allDistrictsOption;
        this.venueSearch = venue.name + ' · ' + venue.city;
        this.selectVenue(venue.id);
        this.autoCommunityVenueId = venue.id;
      },
      error: () => { /* A missing habitual venue must never block the organiser. */ }
    });
  }
  seasonGame = false;
  seasonGameCommunityId: number | null = null;
  confirmActivateRankings = false;
  seasonOverview: CommunityCompetitionOverview | null = null;
  seasonOverviewLoading = false;
  seasonOverviewError = false;
  private seasonInfoRevision = 0;

  get seasonCommunities(): CommunityGroup[] {
    return this.communityId !== null
      ? this.directCommunity ? [this.directCommunity] : []
      : this.communities.filter(g => this.shareCommunityIds.includes(g.id));
  }

  /** A shared session with two or more communities never affects any standings. */
  get canMarkSeasonGame(): boolean {
    return this.seasonCommunities.length === 1;
  }

  get selectedSeasonCommunity(): CommunityGroup | undefined {
    return this.canMarkSeasonGame ? this.seasonCommunities[0] : undefined;
  }

  get seasonRankingsInactive(): boolean {
    return this.seasonOverview?.settings.rankingsEnabled === false
      || (this.seasonOverview === null && this.selectedSeasonCommunity?.rankingsEnabled === false);
  }

  toggleSeasonGame(checked: boolean): void {
    if (this.loading || (checked && !this.canMarkSeasonGame)) return;
    this.seasonGame = checked;
    this.confirmActivateRankings = false;
    if (checked) {
      this.loadOnlyCommunitySeason();
    } else {
      this.seasonGameCommunityId = null;
      this.seasonOverview = null;
      this.seasonOverviewLoading = false;
      ++this.seasonInfoRevision;
    }
  }

  private loadOnlyCommunitySeason(): void {
    const id = this.seasonCommunities[0]?.id;
    this.seasonGameCommunityId = this.canMarkSeasonGame && id != null ? id : null;
    this.confirmActivateRankings = false;
    this.seasonOverview = null;
    const revision = ++this.seasonInfoRevision;
    this.seasonOverviewError = false;
    if (this.seasonGameCommunityId === null) return;
    this.seasonOverviewLoading = true;
    this.communityService.competition(this.seasonGameCommunityId).pipe(timeout(10_000)).subscribe({
      next: overview => {
        if (revision !== this.seasonInfoRevision) return;
        this.seasonOverview = overview;
        this.seasonOverviewLoading = false;
      },
      error: () => {
        if (revision !== this.seasonInfoRevision) return;
        this.seasonOverviewError = true;
        this.seasonOverviewLoading = false;
      }
    });
  }

  selectCreationMode(mode: 'START' | 'COMPLETE'): void {
    if (this.loading) return;
    this.creationMode = mode;
    if (mode === 'COMPLETE') this.privateGame = false;
    if (this.confirmedPlayers === null) this.confirmedPlayers = 1;
  }

  canCreateForCommunity(group: CommunityGroup): boolean {
    return group.membersCanCreateSessions !== false
      || group.myRole === 'ADMIN' || group.myRole === 'OWNER';
  }

  get communityCreationBlocked(): boolean {
    return !!this.directCommunity && !this.canCreateForCommunity(this.directCommunity);
  }

  toggleCommunityShare(id: number, checked: boolean): void {
    if (this.loading || this.communityId !== null
        || !this.communities.some(group => group.id === id
            && group.myRole && this.canCreateForCommunity(group))) return;
    if (checked && !this.shareCommunityIds.includes(id)) {
      if (this.shareCommunityIds.length >= 5) return;
      this.shareCommunityIds = [...this.shareCommunityIds, id];
      this.privateGame = false;
      this.password = '';
    } else if (!checked) {
      this.shareCommunityIds = this.shareCommunityIds.filter(groupId => groupId !== id);
      if (this.shareCommunityIds.length === 0) {
        // Community-only recurrence and call-up settings should not silently
        // return when the organiser selects a community again.
        this.recurrence = 'NONE';
        this.recurrenceOccurrences = 4;
        this.setWeeklySessionsPerWeek(1);
        this.registrationOpeningMode = 'IMMEDIATE';
        this.registrationOpensAt = '';
      }
    }
    this.reconcileCommunityDefaults();
    // Changing from one group to zero/two+ must clear the old season destination.
    // Going from two groups back to one stays opt-in; never auto-enable scoring.
    if (this.seasonGame && (!this.canMarkSeasonGame
        || this.seasonGameCommunityId !== this.seasonCommunities[0]?.id)) {
      this.toggleSeasonGame(false);
    }
  }

  /** A direct community session and a multi-community session share one creation flow. */
  get communitySessionSelected(): boolean {
    return this.communityId !== null || this.shareCommunityIds.length > 0;
  }

  privateGame = false;
  password = '';

  hasPrice = false;
  priceAmount: number | null = null;

  photo?: File;
  photoPreview = '';
  minDate = '';

  latitude: number | null = null;
  longitude: number | null = null;
  locating = false;
  locationCaptured = false;
  locationError = '';
  locationSource: 'gps' | 'map' | null = null;
  locationMethod: 'venue' | 'maps' | 'gps' = 'venue';
  gpsAccuracyMeters: number | null = null;
  gpsAddressLoading = false;
  gpsAddressNotice = '';
  private gpsAutoCity = '';
  private gpsAutoAddress = '';
  private gpsRequestId = 0;

  get gpsAccuracyIsLow(): boolean {
    return this.gpsAccuracyMeters !== null && this.gpsAccuracyMeters > 100;
  }

  get hasCoordinates(): boolean {
    return this.locationCaptured
      && this.latitude !== null && this.longitude !== null
      && Number.isFinite(this.latitude) && Number.isFinite(this.longitude)
      && Math.abs(this.latitude) <= 90 && Math.abs(this.longitude) <= 180;
  }

  loading = false;
  errorMessage = '';

  // Presets belong to the account and never include passwords, dates or photos.
  presets: SessionPreset[] = [];
  selectedPresetId: number | null = null;
  presetName = '';
  presetsLoading = false;
  presetEditorOpen = false;

  togglePresetEditor(): void {
    if (this.loading || this.presetSaving || this.presetDeleting) return;
    this.presetEditorOpen = !this.presetEditorOpen;
    this.presetError = '';
    this.presetMessage = '';
    if (this.presetEditorOpen) this.presetName = '';
  }

  closePresetEditor(): void {
    if (this.presetSaving) return;
    this.presetEditorOpen = false;
    this.presetError = '';
  }
  presetSaving = false;
  presetDeleting = false;
  presetConfirmDelete = false;
  presetMessage = '';
  presetError = '';
  private presetApplyRevision = 0;

  loadPresets(): void {
    this.presetsLoading = true;
    this.presetService.mine().pipe(
      timeout(10_000),
      finalize(() => this.presetsLoading = false)
    ).subscribe({
      next: presets => { this.presets = presets; this.presetError = ''; },
      error: () => { this.presetError = t('createSession.presets.loadError'); }
    });
  }

  private currentPresetSettings(): SessionPresetSettings {
    // Browser GPS position may become stale; save the method, not historical coordinates.
    const saveMapPoint = this.selectedVenueId === null
      && this.locationMethod === 'maps' && this.hasCoordinates;
    return {
      sport: this.sport.trim(),
      airsoftGameType: this.sport === 'Airsoft' && this.airsoftGameType ? this.airsoftGameType : null,
      playFormat: this.playFormat,
      city: this.city.trim(),
      address: this.address.trim(),
      maxParticipants: Number(this.maxParticipants),
      creationMode: this.creationMode,
      confirmedPlayers: Number(this.confirmedPlayers ?? 1),
      hasPrice: this.hasPrice,
      priceAmount: this.hasPrice ? Number(this.priceAmount ?? 0) : 0,
      privateGame: !this.findPlayersMode && this.privateGame,
      communityShareIds: this.communityId === null ? [...this.shareCommunityIds] : [],
      communityId: this.communityId,
      seasonGame: this.seasonGame && this.canMarkSeasonGame,
      selectedVenueId: this.selectedVenueId,
      locationMethod: this.locationMethod,
      latitude: saveMapPoint ? this.latitude : null,
      longitude: saveMapPoint ? this.longitude : null,
      venueMapLink: saveMapPoint ? this.venueMapLink.trim() : '',
      recurrence: this.recurrence,
      recurrenceOccurrences: Number(this.recurrenceOccurrences),
      weeklySessionsPerWeek: Number(this.weeklySessionsPerWeek),
      registrationOpeningMode: this.registrationOpeningMode
    };
  }

  savePreset(update = false): void {
    if (this.presetSaving || this.loading || this.presetsLoading) return;
    const name = this.presetName.trim();
    if (!name || name.length > 70) {
      this.presetError = t('createSession.presets.nameRequired');
      return;
    }
    if (!this.sportSelected) {
      this.presetError = t('createSession.presets.sportRequired');
      return;
    }
    const settings = this.currentPresetSettings();
    if (!Number.isInteger(settings.maxParticipants) || settings.maxParticipants < 2
        || settings.maxParticipants > 100 || settings.confirmedPlayers < 1
        || settings.confirmedPlayers > settings.maxParticipants) {
      this.presetError = t('feedback.create.playersRange');
      return;
    }
    if (update && this.selectedPresetId === null) return;
    if (!update && this.presets.length >= 20) {
      this.presetError = t('createSession.presets.limit');
      return;
    }
    const action = update
      ? this.presetService.update(this.selectedPresetId!, name, settings)
      : this.presetService.create(name, settings);
    this.presetSaving = true;
    this.presetError = '';
    this.presetMessage = '';
    action.pipe(
      timeout(10_000),
      finalize(() => this.presetSaving = false)
    ).subscribe({
      next: saved => {
        this.presets = [saved, ...this.presets.filter(item => item.id !== saved.id)];
        this.selectedPresetId = saved.id;
        this.presetName = saved.name;
        this.presetConfirmDelete = false;
        this.presetEditorOpen = false;
        this.presetMessage = t(update ? 'createSession.presets.updated' : 'createSession.presets.saved');
      },
      error: () => { this.presetError = t('createSession.presets.saveError'); }
    });
  }

  applyPresetById(id: number | null): void {
    this.selectedPresetId = id;
    this.presetConfirmDelete = false;
    this.presetError = '';
    this.presetMessage = '';
    if (id === null || this.loading) return;
    const preset = this.presets.find(item => item.id === id);
    if (!preset) return;
    const s = preset.settings;
    const revision = ++this.presetApplyRevision;
    this.presetName = preset.name;
    // Stop pending community recommendations overwriting a deliberately chosen preset.
    ++this.communityPrefillRevision;
    this.autoCommunitySport = '';
    this.autoCommunityPoint = null;
    this.autoCommunityVenueId = null;
    this.sport = s.sport;
    this.confirmSportSelection();
    if (!this.sportSelected) {
      this.presetError = t('createSession.presets.sportUnavailable');
      return;
    }
    this.playFormat = s.playFormat === 'PAIRS' && this.canChoosePlayFormat ? 'PAIRS' : 'INDIVIDUAL';
    this.creationMode = s.creationMode === 'COMPLETE' ? 'COMPLETE' : 'START';
    this.maxParticipants = s.maxParticipants;
    // Legacy presets do not store attendance thresholds; do not leak the prior selection.
    this.capacityIsMinimum = false;
    this.selectedMinimumPlayers = null;
    this.confirmedPlayers = Math.max(1, Math.min(s.confirmedPlayers || 1, this.maxParticipants));
    this.hasPrice = !!s.hasPrice;
    this.priceAmount = this.hasPrice ? s.priceAmount : null;
    this.privateGame = this.creationMode === 'START' && !!s.privateGame;
    this.password = ''; // Never restore a password, even for a private preset.
    if (this.communityId === null) {
      const allowed = new Set(this.communities
        .filter(g => !!g.myRole && this.canCreateForCommunity(g)).map(g => g.id));
      const savedIds = (s.communityShareIds || []).length
        ? s.communityShareIds : (s.communityId ? [s.communityId] : []);
      this.shareCommunityIds = savedIds.filter(groupId => allowed.has(groupId)).slice(0, 5);
      if (this.shareCommunityIds.length && this.privateGame) this.privateGame = false;
      if (savedIds.length !== this.shareCommunityIds.length) {
        this.presetMessage = t('createSession.presets.communityWarning');
      }
    } else if (s.communityId !== this.communityId) {
      this.presetMessage = t('createSession.presets.communityWarning');
    }
    this.toggleSeasonGame(false);
    if (s.seasonGame && this.canMarkSeasonGame) this.toggleSeasonGame(true);
    // A preset may refer to groups the organiser has since left. Do not
    // retain hidden group-only settings that could reappear on later selection.
    this.recurrence = this.communitySessionSelected ? (s.recurrence || 'NONE') : 'NONE';
    this.recurrenceOccurrences = this.communitySessionSelected
      ? (s.recurrenceOccurrences || 4) : 4;
    this.setWeeklySessionsPerWeek(this.communitySessionSelected
      ? (s.weeklySessionsPerWeek || 1) : 1);
    // A weekly template retains its recurrence pattern, not any previous dates.
    this.gameDate = '';
    this.additionalWeeklyGameDates = Array.from({length: this.weeklySessionsPerWeek - 1}, () => '');
    this.registrationOpeningMode = this.communitySessionSelected
      ? (s.registrationOpeningMode || 'IMMEDIATE') : 'IMMEDIATE';
    this.registrationOpensAt = '';
    this.clearPhoto();
    this.city = s.city || '';
    this.address = s.address || '';
    this.locationMethod = s.locationMethod || 'venue';
    this.venueMapLink = '';
    this.clearLocation();
    if (s.locationMethod === 'maps' && Number.isFinite(s.latitude)
        && Number.isFinite(s.longitude) && s.latitude !== null && s.longitude !== null) {
      this.locationMethod = 'maps';
      this.locationSource = 'map';
      this.latitude = s.latitude;
      this.longitude = s.longitude;
      this.locationCaptured = true;
      this.venueMapLink = s.venueMapLink || '';
      this.selectedVenueMapUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
        'https://www.google.com/maps?q=' + s.latitude + ',' + s.longitude + '&z=16&output=embed'
      );
    }
    if (s.selectedVenueId && this.locationMethod === 'venue') {
      // The venue GET can finish after the organiser changes sport, location
      // method or selects another venue. Only the original choice may apply.
      const requestedSport = this.sport;
      const requestedVenueId = this.selectedVenueId;
      const requestedVenueSearch = this.venueSearch;
      const isCurrentVenueChoice = () =>
        revision === this.presetApplyRevision && this.selectedPresetId === id
        && this.sport === requestedSport && this.locationMethod === 'venue'
        && this.selectedVenueId === requestedVenueId
        && this.venueSearch === requestedVenueSearch;
      // Load the *current* venue record. Do not reuse stale details from a saved profile.
      this.venueService.get(s.selectedVenueId).pipe(timeout(10_000)).subscribe({
        next: venue => {
          if (!isCurrentVenueChoice()) return;
          const sports = (venue.sports || '').split(/[;,]/).map(item => item.trim().toLocaleLowerCase('pt'));
          if (sports.some(Boolean) && !sports.includes(this.sport.trim().toLocaleLowerCase('pt'))) {
            this.presetError = t('createSession.venueSportMismatch');
            return;
          }
          this.newlyCreatedVenues = [...this.newlyCreatedVenues.filter(v => v.id !== venue.id), venue];
          this.venues = [...this.venues.filter(v => v.id !== venue.id), venue];
          this.venueDistrict = this.districts.find(d => d === venue.district) || this.allDistrictsOption;
          this.venueSearch = venue.name + ' · ' + venue.city;
          this.selectVenue(venue.id);
        },
        error: () => {
          if (isCurrentVenueChoice()) {
            this.presetError = t('createSession.presets.venueUnavailable');
          }
        }
      });
    }
    this.presetMessage = this.presetMessage || t('createSession.presets.applied');
  }

  deletePreset(): void {
    if (this.selectedPresetId === null || this.presetSaving || this.presetDeleting) return;
    if (!this.presetConfirmDelete) {
      this.presetConfirmDelete = true;
      return;
    }
    const id = this.selectedPresetId;
    this.presetDeleting = true;
    this.presetError = '';
    this.presetService.remove(id).pipe(
      timeout(10_000), finalize(() => this.presetDeleting = false)
    ).subscribe({
      next: () => {
        ++this.presetApplyRevision;
        this.presets = this.presets.filter(item => item.id !== id);
        this.selectedPresetId = null;
        this.presetName = '';
        this.presetConfirmDelete = false;
        this.presetMessage = t('createSession.presets.deleted');
      },
      error: () => { this.presetError = t('createSession.presets.deleteError'); }
    });
  }

  communityId: number | null = null;
  communityName = '';
  communitySports: string[] = [];
  communitySportLoaded = false;

  /** Community sports are suggestions, not a restriction: organizers may pick any sport. */
  chooseCommunitySport(sport: string): void {
    if (this.loading || !this.communitySports.includes(sport) || this.sport === sport) return;
    this.clearAirsoftDefaultsOnSportChange(sport);
    this.sport = sport;
    this.confirmSportSelection();
  }
  recurrence: 'NONE' | 'WEEKLY' | 'BIWEEKLY' = 'NONE';
  recurrenceOccurrences = 4;
  readonly weeklySessionCountOptions = [1, 2, 3, 4, 5, 6, 7];
  weeklySessionsPerWeek = 1;
  additionalWeeklyGameDates: string[] = [];

  setWeeklySessionsPerWeek(next: number): void {
    const count = Number(next);
    if (!Number.isInteger(count) || count < 1 || count > 7) return;
    this.weeklySessionsPerWeek = count;
    const dates = [...this.additionalWeeklyGameDates];
    while (dates.length < count - 1) dates.push('');
    this.additionalWeeklyGameDates = dates.slice(0, count - 1);
  }

  get plannedSessions(): number {
    return Number(this.recurrenceOccurrences)
      * (this.recurrence === 'WEEKLY' ? this.weeklySessionsPerWeek : 1);
  }

  get maxRecurrenceCycles(): number {
    return this.recurrence === 'WEEKLY'
      ? Math.floor(52 / this.weeklySessionsPerWeek) : 52;
  }

  registrationOpeningMode: 'IMMEDIATE' | 'SCHEDULED' | 'MANUAL' = 'IMMEDIATE';
  registrationOpensAt = '';

  /** Bind our existing form select without changing API enum, number or nullable boolean values. */
  get presetChoices(): JynloSelectOption[] {
    return [
      {value: '', label: t('createSession.presets.noSelection')},
      ...this.presets.map(preset => ({value: String(preset.id), label: preset.name}))
    ];
  }

  get selectedPresetChoice(): string {
    return this.selectedPresetId === null ? '' : String(this.selectedPresetId);
  }

  selectPresetChoice(value: string): void {
    this.applyPresetById(value === '' ? null : Number(value));
  }

  get playFormatChoices(): JynloSelectOption[] {
    return [
      {value: 'INDIVIDUAL', label: t('createSession.playFormatIndividual')},
      {value: 'PAIRS', label: t('createSession.playFormatPairs')}
    ];
  }

  get recurrenceChoices(): JynloSelectOption[] {
    return [
      {value: 'NONE', label: t('createSession.recurrenceNone')},
      {value: 'WEEKLY', label: t('createSession.recurrenceWeekly')},
      {value: 'BIWEEKLY', label: t('createSession.recurrenceBiweekly')}
    ];
  }

  get weeklyCountChoices(): JynloSelectOption[] {
    return this.weeklySessionCountOptions.map(count => ({
      value: String(count), label: t('createSession.weeklySessionOption', {count})
    }));
  }

  get openingModeChoices(): JynloSelectOption[] {
    return [
      {value: 'IMMEDIATE', label: t('createSession.callupImmediate')},
      {value: 'SCHEDULED', label: t('createSession.callupScheduled')},
      {value: 'MANUAL', label: t('createSession.callupManual')}
    ];
  }

  get districtChoices(): JynloSelectOption[] {
    return [
      {value: '', label: t('venue.districtPlaceholder')},
      ...this.districts.map(district => ({value: district, label: district})),
      {value: this.allDistrictsOption, label: t('venue.searchAllDistricts')}
    ];
  }

  get ownershipChoices(): JynloSelectOption[] {
    return [
      {value: '', label: t('venue.ownership.none')},
      {value: 'PUBLIC', label: t('venue.ownership.public')},
      {value: 'PRIVATE', label: t('venue.ownership.private')}
    ];
  }

  get amenityChoices(): JynloSelectOption[] {
    return [
      {value: '', label: t('venue.boolean.none')},
      {value: 'true', label: t('venue.boolean.yes')},
      {value: 'false', label: t('venue.boolean.no')}
    ];
  }

  amenityChoice(value: boolean | null): string {
    return value === null ? '' : String(value);
  }

  parseAmenityChoice(value: string): boolean | null {
    return value === '' ? null : value === 'true';
  }

  readonly sportsCatalog = SPORTS_CATALOG;
  readonly sportChoices: JynloSelectOption[] = SPORTS_CATALOG.map(sport => ({
    value: sport, label: sport
  }));

  /** Server IDs are the only permitted selection values; names are not unique. */
  get venueSearchChoices(): JynloSelectOption[] {
    return this.venueOptions.map(venue => ({
      value: String(venue.id),
      label: venue.name + ' · ' + venue.city,
      description: [
        venue.address || (venue.latitude != null && venue.longitude != null
          ? t('venue.gpsOnlyAddress') : ''),
        venue.district && venue.district !== venue.city ? venue.district : '',
        venue.informationSource === 'OPENSTREETMAP'
          ? t('venue.detail.sourceOpenStreetMap') : ''
      ].filter(Boolean).join(' · ')
    }));
  }

  private clearAirsoftDefaultsOnSportChange(nextSport: string): void {
    if (this.sport !== 'Airsoft' || nextSport === 'Airsoft') return;
    const template = t('createSession.airsoftTemplate');
    const templateWithoutPrefix = template.replace(/^Airsoft:\s*/i, '');
    if ([template, templateWithoutPrefix].includes(this.meetingPointInstructions.trim())) {
      this.meetingPointInstructions = '';
    }
    this.airsoftGameType = '';
  }

  onSportChoice(value: string): void {
    if (this.sport === value) return;
    ++this.communityPrefillRevision;
    this.clearAirsoftDefaultsOnSportChange(value);
    this.sport = value;
    this.confirmSportSelection();
  }

  onVenueSelected(value: string): void {
    ++this.communityPrefillRevision;
    if (!value) {
      this.selectVenue(null);
      return;
    }
    this.chooseVenueFromResults(Number(value));
  }

  // Only sports explicitly supported for both singles and doubles offer this selector.
  private readonly doublesSports = new Set([
    'Padel', 'Ténis', 'Ténis de praia', 'Ténis de mesa', 'Badminton', 'Pickleball'
  ]);

  get canChoosePlayFormat(): boolean {
    return this.doublesSports.has(this.sport.trim());
  }

  get selectedPlayFormat(): 'INDIVIDUAL' | 'PAIRS' | undefined {
    return this.canChoosePlayFormat ? this.playFormat : undefined;
  }

  readonly districts = MAINLAND_PORTUGAL_DISTRICTS;
  readonly allDistrictsOption = SEARCH_ALL_DISTRICTS;
  venueDistrict = '';
  venues: Venue[] = [];
  private newlyCreatedVenues: Venue[] = [];
  venueSearch = '';
  selectedVenueId: number | null = null;
  venuesLoading = false;
  venuesLoadError = false;
  venuesHasMore = false;
  venuePage = 0;
  private venueLookupVersion = 0;
  private readonly venueSearchChanged = new Subject<void>();
  private readonly venueSearchSubscription = this.venueSearchChanged
    .pipe(debounceTime(300))
    .subscribe(() => {
      if (this.sportSelected) this.loadVenues();
    });
  venueSaving = false;
  venueSuggestionSubmitted = false;
  showVenueCreator = false;
  venueName = '';
  venueType = '';
  venueOwnershipType: VenueOwnershipType | null = null;
  venueSurfaceType = '';
  venueIndoor = false;
  venueChangingRooms = false;
  venueToilets: boolean | null = null;
  venueLockers: boolean | null = null;
  venueAccessible: boolean | null = null;
  venueFirstAid: boolean | null = null;
  venueAed: boolean | null = null;
  venueCafe: boolean | null = null;
  venueServices = '';
  venueTransport = '';
  venueOpeningHours = '';
  venuePriceInfo = '';
  venueParking = false;
  venueLighting = false;
  selectedVenuePhoto: VenuePhoto | null = null;
  venuePhotoLoading = false;
  private venuePhotoRequestId = 0;
  selectedVenueMapUrl: SafeResourceUrl | null = null;
  venueMapLink = '';
  venueMapLinkLoading = false;
  private venueMapRequestId = 0;
  venueMapLinkError = '';
  venueMapCandidateResolvedUrl = '';

  constructor(
    private sessionService: SessionService,
    private presetService: SessionPresetService,
    private communityService: CommunityGroupsService,
    private venueService: VenueService,
    private sanitizer: DomSanitizer,
    private route: ActivatedRoute,
    private router: Router,
    private ngZone: NgZone
  ) {}

  get findPlayersMode(): boolean {
    return this.creationMode === 'COMPLETE';
  }

  get availablePlaces(): number {
    const maximum = Number(this.maxParticipants);
    const confirmed = Number(this.confirmedPlayers);
    if (!Number.isInteger(maximum) || !Number.isInteger(confirmed)
        || maximum < 2 || maximum > 100 || confirmed < 1 || confirmed > maximum) {
      return 0;
    }
    return maximum - confirmed;
  }

  ngOnInit(): void {
    this.minDate = this.toLocalDateTimeValue(new Date());
    this.loadPresets();

    const params = this.route.snapshot.queryParamMap;
    const communityId = Number(params.get('community'));
    if (!Number.isFinite(communityId) || communityId <= 0) {
      const requestedSport = (params.get('sport') || '').trim();
      this.sport = this.sportsCatalog.find(
        option => option.toLocaleLowerCase('pt') === requestedSport.toLocaleLowerCase('pt')
      ) || '';
      this.city = (params.get('city') || '').trim().slice(0, 120);

      // Prefill only the existing Find Players mode. Never trust external
      // navigation parameters as a submitted count without validation.
      if (params.get('intent') === 'findPlayers') {
        const confirmedRaw = params.get('confirmed');
        const missingRaw = params.get('missing');
        if (confirmedRaw !== null && missingRaw !== null
            && /^[1-9]\d{0,2}$/.test(confirmedRaw)
            && /^[1-9]\d{0,2}$/.test(missingRaw)) {
          const confirmed = Number(confirmedRaw);
          const missing = Number(missingRaw);
          if (confirmed + missing <= 100) {
            this.confirmedPlayers = confirmed;
            this.maxParticipants = confirmed + missing;
          }
        }
      }
    }

    if (this.sportSelected) this.loadVenues();

    this.creationMode = params.get('intent') === 'findPlayers' ? 'COMPLETE' : 'START';

    if (!(Number.isFinite(communityId) && communityId > 0)) {
      this.communitiesLoading = true;
      this.communityService.mine().pipe(
        timeout(10_000),
        finalize(() => this.communitiesLoading = false)
      ).subscribe({
        next: values => {
          this.communities = values.filter(group => !!group.myRole);
          this.communitiesLoadError = false;
        },
        error: () => { this.communitiesLoadError = true; }
      });
    }

    if (Number.isFinite(communityId) && communityId > 0) {
      this.communityId = communityId;
      this.communityService.get(communityId)
        .pipe(
          timeout(10_000),
          retry({ count: 1 })
        )
        .subscribe({
        next: community => {
          this.communityName = community.name;
          this.directCommunity = community;
          const list = community.sports?.length ? community.sports
            : (community.sport ? [community.sport] : []);
          // Older communities expose just `sport`; multi-sport ones must not
          // silently pick the first modality on behalf of the organiser.
          this.communitySports = [...new Set(list.filter(value => this.sportsCatalog.includes(value)))];
          this.communitySportLoaded = true;
          this.reconcileCommunityDefaults();
        },
        error: () => {
          this.errorMessage = t('feedback.communities.openError');
          this.communityName = '';
          this.communitySports = [];
          this.communitySportLoaded = false;
        }
      });
    }
  }

  ngOnDestroy(): void {
    ++this.venueLookupVersion;
    this.venueSearchSubscription.unsubscribe();
    this.venueSearchChanged.complete();
  }

  createSession(): void {
    if (this.loading || this.venueSaving || this.venueMapLinkLoading || this.gpsAddressLoading) {
      return;
    }

    const validationError = this.validate();
    if (validationError) {
      this.errorMessage = validationError;
      return;
    }

    const request: CreateSessionRequest = {
      sport: this.sport.trim(),
      airsoftGameType: this.sport === 'Airsoft' ? (this.airsoftGameType || null) : null,
      ...(this.selectedPlayFormat ? { playFormat: this.selectedPlayFormat } : {}),
      gameDate: new Date(this.gameDate).toISOString(),
      city: this.city.trim(),
      address: this.address.trim() || (this.hasCoordinates
        ? t('createSession.mapPointAddress', {
            latitude: this.latitude!.toFixed(6),
            longitude: this.longitude!.toFixed(6)
          })
        : ''),
      meetingPointInstructions: this.sessionMeetingInstructions,
      maxParticipants: Number(this.maxParticipants),
      minParticipants: this.minimumPlayers,
      ...(this.findPlayersMode
        ? { externalConfirmedParticipants: Number(this.confirmedPlayers) - 1 }
        : {}),
      communityShareIds: this.communityId === null ? [...this.shareCommunityIds] : [],
      seasonCompetitionCommunityId: this.seasonGame && this.canMarkSeasonGame
        ? this.seasonCommunities[0].id : null,
      confirmActivateRankings: this.seasonGame && this.canMarkSeasonGame
        && this.confirmActivateRankings,
      priceAmount: this.hasPrice ? Number(this.priceAmount ?? 0) : 0,
      privateGame: this.findPlayersMode ? false : this.privateGame,
      password: this.findPlayersMode ? null : (this.privateGame ? this.password.trim() : null),
      latitude: this.hasCoordinates ? this.latitude : null,
      longitude: this.hasCoordinates ? this.longitude : null,
      communityId: this.communityId,
      venueId: this.selectedVenueId,
      recurrence: this.communitySessionSelected ? this.recurrence : 'NONE',
      recurrenceOccurrences: this.communitySessionSelected && this.recurrence !== 'NONE'
        ? Number(this.recurrenceOccurrences)
        : null,
      additionalWeeklyGameDates: this.communitySessionSelected && this.recurrence === 'WEEKLY'
        ? this.additionalWeeklyGameDates.map(value => new Date(value).toISOString()) : [],
      recurrenceTimeZone: this.communitySessionSelected && this.recurrence !== 'NONE'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : null,
      registrationOpeningMode: this.communitySessionSelected ? this.registrationOpeningMode : 'IMMEDIATE',
      registrationOpensAt: this.communitySessionSelected && this.registrationOpeningMode === 'SCHEDULED'
        ? new Date(this.registrationOpensAt).toISOString()
        : null
    };

    this.loading = true;
    this.errorMessage = '';

    this.sessionService.create(request, this.photo)
      .pipe(
        timeout(10_000),
        finalize(() => this.loading = false)
      )
      .subscribe({
        // Every creator sees an appropriate share dialog on first entry.
        // Community/private links stay authenticated; public preview is never invented.
        next: session => this.router.navigate(
          ['/menu/events', session.id],
          { queryParams: { created: 1 } }
        ),
        error: error => {
          this.errorMessage = this.errorFrom(
            error,
            t('feedback.create.error')
          );
        }
      });
  }

  /** Query by district on the server; never download the national catalog. */
  loadVenues(page = 0): void {
    if (!this.venueDistrict || (this.venueDistrict === SEARCH_ALL_DISTRICTS
        && this.venueSearch.trim().split(' · ')[0].trim().length < 3)) {
      ++this.venueLookupVersion;
      this.venuesLoading = false;
      this.venuesHasMore = false;
      this.venuesLoadError = false;
      this.venuePage = 0;
      this.venues = [...this.newlyCreatedVenues];
      return;
    }
    if (page > 0 && (this.venuesLoading || !this.venuesHasMore || page !== this.venuePage + 1)) return;
    const typed = this.venueSearch.trim();
    const separator = typed.lastIndexOf(' · ');
    const name = separator < 0 ? typed : typed.slice(0, separator).trim();
    const city = separator < 0 ? this.city.trim() : typed.slice(separator + 3).trim();
    const version = ++this.venueLookupVersion;
    this.venuesLoading = true;
    this.venuesLoadError = false;

    this.venueService.suggest(name, city, this.sportSelected ? this.sport.trim() : '', page,
        this.venueDistrict === SEARCH_ALL_DISTRICTS ? undefined : this.venueDistrict)
      .pipe(
        timeout(10_000),
        retry({ count: 1 }),
        finalize(() => {
          if (version === this.venueLookupVersion) this.venuesLoading = false;
        })
      )
      .subscribe({
        next: result => {
          if (version !== this.venueLookupVersion) return;
          const merged = new Map<number, Venue>();
          for (const venue of [...(page > 0 ? this.venues : []), ...result.venues, ...this.newlyCreatedVenues]) {
            merged.set(venue.id, venue);
          }
          this.venues = [...merged.values()].sort((a, b) =>
            a.name.localeCompare(b.name, 'pt') || a.city.localeCompare(b.city, 'pt') || a.id - b.id
          );
          this.venuePage = result.page;
          this.venuesHasMore = result.hasMore;
        },
        error: () => {
          if (version !== this.venueLookupVersion) return;
          if (page === 0) this.venues = [...this.newlyCreatedVenues];
          this.venuesHasMore = false;
          this.venuesLoadError = true;
        }
      });
  }

  loadMoreVenues(): void {
    if (this.venuesHasMore) this.loadVenues(this.venuePage + 1);
  }

  private queueVenueLookup(): void {
    // Reject in-flight responses immediately, not after the debounce delay.
    ++this.venueLookupVersion;
    this.venuesLoading = false;
    this.venuesLoadError = false;
    this.venuesHasMore = false;
    this.venuePage = 0;
    // Previously fetched rows belong to an older query/district/sport;
    // never leave them clickable while the new lookup is debounced.
    this.venues = [...this.newlyCreatedVenues];
    this.venueSearchChanged.next();
  }

  onDistrictChanged(value: string): void {
    const chosen = this.districts.find(district => district === value)
      ?? (value === SEARCH_ALL_DISTRICTS ? SEARCH_ALL_DISTRICTS : '');
    if (chosen === this.venueDistrict) return;
    const previous = this.venueDistrict;
    this.selectVenue(null);
    this.venueDistrict = chosen;
    this.venueSearch = '';
    this.newlyCreatedVenues = [];
    this.venues = [];
    if (previous && previous !== chosen) this.city = '';
    ++this.venueLookupVersion;
    this.venuesLoading = false;
    this.venuesHasMore = false;
    this.venuesLoadError = false;
    this.venuePage = 0;
    if (this.sportSelected && chosen !== SEARCH_ALL_DISTRICTS && chosen) this.loadVenues();
  }

  onCityChanged(value: string): void {
    this.city = value;
    if (this.sportSelected && this.venueDistrict && this.selectedVenueId === null) this.queueVenueLookup();
  }

  get sportSelected(): boolean {
    return this.sportsCatalog.some(
      option => option.toLocaleLowerCase('pt') === this.sport.trim().toLocaleLowerCase('pt')
    );
  }

  get venueOptions(): Venue[] {
    return this.matchingVenues();
  }

  private matchingVenues(): Venue[] {
    const city = this.normalizeVenueSearch(this.city.trim());
    const sport = this.sport.trim().toLocaleLowerCase('pt');
    const search = this.normalizeVenueSearch(this.venueSearch.trim());

    const filtered = this.venues.filter(venue => {
      const cityMatches = !city
        || this.normalizeVenueSearch(venue.city).includes(city);

      const venueSports = (venue.sports || '').toLocaleLowerCase('pt');
      const sportMatches = !sport
        || !venueSports
        || venueSports.split(/[;,]/).some(venueSport => venueSport.trim() === sport);

      const acronym = venue.name
        .split(/\s+/)
        .filter(part => part.length > 2)
        .map(part => part[0])
        .join('')
        .toLocaleLowerCase('pt');

      const searchable = [
        venue.name,
        venue.city,
        venue.name + ' · ' + venue.city,
        venue.address,
        venue.venueType || '',
        acronym
      ].join(' ');
      const searchMatches = !search
        || this.normalizeVenueSearch(searchable).includes(search);

      return cityMatches && sportMatches && searchMatches;
    });

    return filtered;
  }

  confirmSportSelection(): void {
    const selected = this.sportsCatalog.find(
      option => option.toLocaleLowerCase('pt') === this.sport.trim().toLocaleLowerCase('pt')
    );

    if (!selected) {
      const template = t('createSession.airsoftTemplate');
      const templateWithoutPrefix = template.replace(/^Airsoft:\s*/i, '');
      if ([template, templateWithoutPrefix].includes(this.meetingPointInstructions.trim())) {
        this.meetingPointInstructions = '';
      }
      this.airsoftGameType = '';
      this.sport = '';
      this.venueSearch = '';
      this.selectVenue(null);
      ++this.venueLookupVersion;
      this.venues = [...this.newlyCreatedVenues];
      this.venuesHasMore = false;
      return;
    }

    this.sport = selected;
    this.playFormat = 'INDIVIDUAL';
    this.venueSearch = '';
    this.selectVenue(null);
    this.loadVenues();
  }

  private normalizeVenueSearch(value: string): string {
    return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt');
  }

  onVenueSearchChanged(value: string): void {
    if (this.venueSearch === value) {
      return;
    }
    ++this.communityPrefillRevision;

    this.venueSearch = value;
    if (this.selectedVenueId !== null) {
      // Stop filtering suggestions by the city inherited from the old venue.
      this.selectVenue(null);
    }
    if (this.sportSelected && this.venueDistrict) this.queueVenueLookup();
  }

  /** Visible results select the actual server ID, never a potentially duplicate name. */
  chooseVenueFromResults(venueId: number): void {
    if (this.venuesLoading || !this.sportSelected || !this.venueDistrict) return;
    const venue = this.venueOptions.find(item => item.id === venueId);
    if (!venue) return;

    ++this.venueLookupVersion; // Ignore a slower response from the previous query.
    this.venuesLoading = false;
    this.venueSearch = venue.name + ' · ' + venue.city;
    this.selectVenue(venue.id);
  }

  confirmVenueSelection(): void {
    const normalized = this.normalizeVenueSearch(this.venueSearch.trim());
    // Check every compatible venue, not just the first 40 autocomplete suggestions.
    // A repeated name must never silently select an arbitrary venue.
    const matches = this.sportSelected
      ? this.matchingVenues().filter(
          venue =>
            this.normalizeVenueSearch(venue.name) === normalized
            || this.normalizeVenueSearch(venue.name + ' · ' + venue.city) === normalized
        )
      : [];

    // A name-only result may have duplicates on later server pages.
    if (matches.length !== 1 || (this.venuesHasMore
        && this.normalizeVenueSearch(matches[0].name) === normalized)) {
      this.selectVenue(null);
      return;
    }

    const match = matches[0];
    this.venueSearch = match.name + ' · ' + match.city;
    this.selectVenue(match.id);
  }

  selectVenue(value: number | string | null): void {
    this.invalidateVenueMapLinkRequest();
    // Changing venues also cancels an unfinished browser GPS request.
    this.gpsRequestId++;
    this.locating = false;
    // Invalidate outstanding photo requests before changing the selected venue.
    this.venuePhotoRequestId++;
    const previousVenue = this.venues.find(venue => venue.id === this.selectedVenueId);
    const venueId = value === null || value === ''
      ? null
      : Number(value);

    this.selectedVenueId = venueId !== null && Number.isFinite(venueId)
      ? venueId
      : null;
    if (this.selectedVenueId !== null) this.locationMethod = 'venue';

    if (this.selectedVenueId === null) {
      this.selectedVenuePhoto = null;
      this.venuePhotoLoading = false;
      this.selectedVenueMapUrl = null;

      if (previousVenue) {
        // Do not silently reuse a deselected venue's location for another sport.
        if (this.city === previousVenue.city) {
          this.city = '';
        }
        if (this.address === previousVenue.address) {
          this.address = '';
        }
        this.clearLocation();
      }
      return;
    }

    const venue = this.venues.find(item => item.id === this.selectedVenueId);
    if (!venue) {
      this.selectedVenuePhoto = null;
      this.selectedVenueMapUrl = null;
      return;
    }

    this.locationSource = null;
    this.gpsAccuracyMeters = null;
    this.venueMapCandidateResolvedUrl = '';
    this.venueMapLink = '';
    this.loadVenuePhoto(venue.id);
    this.selectedVenueMapUrl = venue.latitude !== null && venue.longitude !== null
      ? this.sanitizer.bypassSecurityTrustResourceUrl(
          'https://www.google.com/maps?q='
          + venue.latitude + ',' + venue.longitude
          + '&z=16&output=embed'
        )
      : null;

    this.city = venue.city;
    this.address = venue.address;

    if (!this.sport.trim() && venue.sports) {
      this.sport = venue.sports.split(/[;,]/)[0]?.trim() || '';
    }

    if (venue.latitude !== null && venue.longitude !== null) {
      this.latitude = venue.latitude;
      this.longitude = venue.longitude;
      this.locationCaptured = true;
    } else {
      this.clearLocation();
    }
  }

  private loadVenuePhoto(venueId: number): void {
    const requestId = this.venuePhotoRequestId;
    const isCurrentVenue = () =>
      requestId === this.venuePhotoRequestId && this.selectedVenueId === venueId;

    this.selectedVenuePhoto = null;
    this.venuePhotoLoading = true;

    this.venueService.listPhotos(venueId)
      .pipe(
        timeout(10_000),
        finalize(() => {
          if (isCurrentVenue()) {
            this.venuePhotoLoading = false;
          }
        })
      )
      .subscribe({
        next: photos => {
          if (isCurrentVenue()) {
            this.selectedVenuePhoto = photos[0] ?? null;
          }
        },
        error: () => {
          if (isCurrentVenue()) {
            this.selectedVenuePhoto = null;
          }
        }
      });
  }

  chooseLocationMethod(method: 'venue' | 'maps' | 'gps'): void {
    if (this.loading || this.venueSaving || method === this.locationMethod) return;
    ++this.communityPrefillRevision;

    if (method === 'venue') {
      this.invalidateVenueMapLinkRequest();
      this.gpsRequestId++;
      this.clearLocation();
      this.venueMapLink = '';
      this.venueMapCandidateResolvedUrl = '';
      this.locationMethod = 'venue';
      return;
    }

    this.useMapLinkVenue();
    this.venueMapLink = '';
    this.venueMapLinkError = '';
    this.locationMethod = method;
  }

  useMapLinkVenue(): void {
    ++this.communityPrefillRevision;
    this.locationMethod = 'maps';
    this.invalidateVenueMapLinkRequest();
    this.venuePhotoRequestId++;
    this.selectedVenueId = null;
    this.venueSearch = '';
    this.selectedVenuePhoto = null;
    this.venuePhotoLoading = false;
    this.selectedVenueMapUrl = null;
    this.city = '';
    this.address = '';
    this.clearLocation();
  }

  onVenueMapLinkChanged(url: string): void {
    if (this.venueMapLink === url) {
      return;
    }

    // Editing a Maps link switches sources; never keep coordinates from GPS.
    if (this.locationMethod !== 'maps' && this.locationSource === 'gps') {
      this.clearLocation();
    }
    this.venueMapLink = url;
    this.locationMethod = 'maps';
    this.venueMapLinkError = '';
    this.invalidateVenueMapLinkRequest();
    // Choosing a Maps link invalidates any pending browser GPS callback.
    this.gpsRequestId++;
    this.locating = false;

    // A previously confirmed link must not leave its old map coordinates behind.
    if (this.locationSource === 'map') {
      this.clearLocation();
    }
  }

  resolveVenueMapLink(): void {
    const url = this.venueMapLink.trim();
    if (!url || this.venueMapLinkLoading) {
      return;
    }

    // Programmatic and direct resolutions must select the Maps source too.
    // Never display coordinates from a prior GPS choice during this request.
    if (this.locationMethod === 'gps') this.clearLocation();
    this.locationMethod = 'maps';

    // Revalidating a link invalidates the previous Maps point, even if the
    // field was changed programmatically rather than through the template.
    if (this.locationSource === 'map') {
      this.clearLocation();
    }

    this.gpsRequestId++;
    this.locating = false;
    const requestId = ++this.venueMapRequestId;
    const isCurrentRequest = () =>
      requestId === this.venueMapRequestId
      && this.selectedVenueId === null
      && this.venueMapLink.trim() === url;
    this.venueMapLinkLoading = true;
    this.venueMapLinkError = '';
    this.venueMapCandidateResolvedUrl = '';

    this.venueService.resolveMapLink(url)
      .pipe(
        timeout(12_000),
        finalize(() => {
          if (requestId === this.venueMapRequestId) {
            this.venueMapLinkLoading = false;
          }
        })
      )
      .subscribe({
        next: candidate => {
          // A removed or superseded Maps lookup must never restore old coordinates.
          if (!isCurrentRequest()) {
            return;
          }
          this.clearAutoGpsFields();
          this.latitude = candidate.latitude;
          this.longitude = candidate.longitude;
          this.locationCaptured = true;
          this.locationSource = 'map';
          this.gpsAccuracyMeters = null;
          this.locationError = '';
          this.venueMapCandidateResolvedUrl = candidate.resolvedUrl;
          this.selectedVenueMapUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
            'https://www.google.com/maps?q='
            + candidate.latitude + ',' + candidate.longitude
            + '&z=16&output=embed'
          );
          this.lookupGpsAddress(candidate.latitude, candidate.longitude, undefined, 'map');
        },
        error: () => {
          if (isCurrentRequest()) {
            this.venueMapLinkError = t('venue.mapLink.error');
            this.venueMapCandidateResolvedUrl = '';
          }
        }
      });
  }

  private invalidateVenueMapLinkRequest(): void {
    this.venueMapRequestId++;
    this.venueMapLinkLoading = false;
  }

  clearVenueMapLinkCandidate(): void {
    this.venueMapCandidateResolvedUrl = '';
    this.selectedVenueMapUrl = null;
    this.venueMapLinkError = '';
    this.clearLocation();
  }

  toggleVenueCreator(): void {
    this.showVenueCreator = !this.showVenueCreator;
    this.errorMessage = '';
  }

  saveVenue(): void {
    if (this.venueSaving) {
      return;
    }

    if (!this.sportSelected) {
      this.errorMessage = t('venue.create.sportsRequired');
      return;
    }

    if (!this.venueDistrict || this.venueDistrict === SEARCH_ALL_DISTRICTS) {
      this.errorMessage = t('venue.districtRequiredToSave');
      return;
    }
    if (!this.venueName.trim() || !this.city.trim() || !this.address.trim()) {
      this.errorMessage = t('feedback.venue.required');
      return;
    }

    this.venueSaving = true;
    this.venueSuggestionSubmitted = false;
    this.errorMessage = '';

    this.venueService.submitSuggestion({
      name: this.venueName.trim(),
      city: this.city.trim(),
      district: this.venueDistrict,
      address: this.address.trim(),
      sports: this.sport.trim(),
      venueType: this.venueType.trim() || null,
      ownershipType: this.venueOwnershipType,
      surfaceType: this.venueSurfaceType.trim() || null,
      indoor: this.venueIndoor,
      changingRooms: this.venueChangingRooms,
      toilets: this.venueToilets,
      lockers: this.venueLockers,
      accessible: this.venueAccessible,
      firstAid: this.venueFirstAid,
      aed: this.venueAed,
      cafe: this.venueCafe,
      services: this.venueServices.trim() || null,
      transport: this.venueTransport.trim() || null,
      openingHours: this.venueOpeningHours.trim() || null,
      priceInfo: this.venuePriceInfo.trim() || null,
      parking: this.venueParking,
      lighting: this.venueLighting,
      latitude: this.locationCaptured ? this.latitude : null,
      longitude: this.locationCaptured ? this.longitude : null
    })
      .pipe(
        timeout(10_000),
        finalize(() => this.venueSaving = false)
      )
      .subscribe({
        next: suggestion => {
          // Pending suggestions are NOT public venue ids. Never select or
          // attach them to a session before an administrator approves them.
          if (suggestion.status !== 'PENDING') {
            this.errorMessage = t('feedback.venue.createError');
            return;
          }
          this.venueSuggestionSubmitted = true;
          this.selectedVenueId = null;
          this.showVenueCreator = false;
          this.venueName = '';
          this.errorMessage = '';
        },
        error: error => {
          this.errorMessage = this.errorFrom(
            error,
            t('feedback.venue.createError')
          );
        }
      });
  }

  selectedVenue(): Venue | undefined {
    return this.venues.find(venue => venue.id === this.selectedVenueId);
  }

  captureCurrentLocation(): void {
    if (this.locating || this.loading || this.selectedVenueId !== null) {
      return;
    }

    this.locationError = '';
    if (!navigator.geolocation) {
      this.locationError = t('feedback.location.unsupported');
      return;
    }

    this.invalidateVenueMapLinkRequest();
    const requestId = ++this.gpsRequestId;
    this.locating = true;
    navigator.geolocation.getCurrentPosition(
      position => this.ngZone.run(() => {
        if (requestId !== this.gpsRequestId) {
          return;
        }
        this.applyCurrentPosition(
          position.coords.latitude, position.coords.longitude, position.coords.accuracy);
      }),
      () => this.ngZone.run(() => {
        if (requestId !== this.gpsRequestId) {
          return;
        }
        this.locating = false;
        this.locationError = t('feedback.location.error');
      }),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  }

  applyCurrentPosition(latitude: number, longitude: number, accuracyMeters?: number): void {
    // A location chosen directly supersedes an older browser request too.
    this.gpsRequestId++;
    if (this.selectedVenueId !== null || !Number.isFinite(latitude)
        || !Number.isFinite(longitude) || Math.abs(latitude) > 90
        || Math.abs(longitude) > 180) {
      this.locating = false;
      this.locationError = t('feedback.location.error');
      return;
    }

    this.invalidateVenueMapLinkRequest();
    this.clearAutoGpsFields();
    this.locationMethod = 'gps';
    this.latitude = latitude;
    this.longitude = longitude;
    this.locationCaptured = true;
    this.locationSource = 'gps';
    this.gpsAccuracyMeters = accuracyMeters !== undefined
      && Number.isFinite(accuracyMeters) && accuracyMeters >= 0
        ? Math.max(1, Math.round(accuracyMeters))
        : null;
    this.locating = false;
    this.locationError = '';
    this.venueMapLink = '';
    this.venueMapLinkError = '';
    this.venueMapCandidateResolvedUrl = '';
    this.selectedVenueMapUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      'https://www.google.com/maps?q=' + latitude + ',' + longitude + '&z=17&output=embed'
    );
    this.lookupGpsAddress(latitude, longitude, accuracyMeters, 'gps');
  }

  /**
   * Reverse-lookup is best-effort, never changes the actual GPS pin.
   * A stale reply may not overwrite another venue, another GPS point,
   * or text that the user edited while the lookup was pending.
   */
  private lookupGpsAddress(
    latitude: number, longitude: number, accuracyMeters: number | undefined,
    source: 'gps' | 'map'
  ): void {
    const requestId = this.gpsRequestId;
    const startingCity = this.city;
    const startingAddress = this.address;
    this.gpsAddressLoading = true;
    this.gpsAddressNotice = '';
    this.venueService.reverseLocation(latitude, longitude, accuracyMeters).pipe(
      timeout(20000),
      finalize(() => {
        if (this.gpsRequestId === requestId) this.gpsAddressLoading = false;
      })
    ).subscribe({
      next: value => {
        if (this.gpsRequestId !== requestId || this.locationSource !== source
            || this.latitude !== latitude || this.longitude !== longitude) return;
        const city = value.city?.trim().slice(0,120) || '';
        const address = value.address?.trim().slice(0,250) || '';
        if (city && this.city === startingCity) {
          this.onCityChanged(city);
          this.gpsAutoCity = city;
        }
        if (address && this.address === startingAddress) {
          this.address = address;
          this.gpsAutoAddress = address;
        }
        this.gpsAddressNotice = address
          ? t('createSession.gpsAddressSuggested')
          : city ? t('createSession.gpsAddressCityOnly')
            : t('createSession.gpsAddressUnknown');
      },
      error: () => {
        if (requestId === this.gpsRequestId) {
          this.gpsAddressNotice = t('createSession.gpsAddressUnknown');
        }
      }
    });
  }

  private clearAutoGpsFields(): void {
    if (this.gpsAutoCity && this.city === this.gpsAutoCity) this.onCityChanged('');
    if (this.gpsAutoAddress && this.address === this.gpsAutoAddress) this.address = '';
    this.gpsAutoCity = '';
    this.gpsAutoAddress = '';
  }

  clearLocation(): void {
    this.invalidateVenueMapLinkRequest();
    this.gpsRequestId++;
    this.clearAutoGpsFields();
    this.gpsAddressLoading = false;
    this.gpsAddressNotice = '';
    this.locating = false;
    this.locationCaptured = false;
    this.latitude = null;
    this.longitude = null;
    this.locationSource = null;
    this.gpsAccuracyMeters = null;
    this.locationError = '';
    if (this.selectedVenueId === null) {
      this.selectedVenueMapUrl = null;
      this.venueMapCandidateResolvedUrl = '';
      this.venueMapLinkError = '';
    }
  }

  onPhotoChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      this.photo = undefined;
      this.photoPreview = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.errorMessage = t('feedback.image.choose');
      input.value = '';
      return;
    }

    this.photo = file;
    this.errorMessage = '';

    const reader = new FileReader();
    reader.onload = () => {
      this.photoPreview = typeof reader.result === 'string' ? reader.result : '';
    };
    reader.readAsDataURL(file);
  }

  clearPhoto(): void {
    this.photo = undefined;
    this.photoPreview = '';
  }

  private validate(): string | null {
    if (this.communityCreationBlocked) {
      return t('communities.sessionPolicy.blocked');
    }
    // Saved drafts or outdated membership data must never attach a session
    // to a community that no longer belongs to this organiser.
    if (this.communityId === null && this.shareCommunityIds.length > 0
        && (this.communitiesLoading || this.communitiesLoadError
            || this.shareCommunityIds.some(id =>
                !this.communities.some(group => group.id === id && !!group.myRole)))) {
      return t('createSession.presets.communityWarning');
    }
    if (this.shareCommunityIds.some(id =>
        this.communities.some(group => group.id === id && !this.canCreateForCommunity(group)))) {
      return t('communities.sessionPolicy.shareBlocked');
    }
    if ((this.sessionMeetingInstructions?.length ?? 0) > 240
        || /[\u0000-\u001F\u007F]/.test(this.sessionMeetingInstructions ?? '')) {
      return t('createSession.meetingPointInvalid');
    }
    if (!this.sportSelected) {
      return 'Seleciona um desporto da lista.';
    }
    if (this.gpsAddressLoading) {
      return t('createSession.gpsAddressLoading');
    }
    if (this.locationMethod === 'maps' && !(this.hasCoordinates && this.locationSource === 'map')) {
      return 'Resolve primeiro a ligação do Google Maps para confirmar o ponto do recinto.';
    }
    if (this.locationMethod === 'gps' && !(this.hasCoordinates && this.locationSource === 'gps')) {
      return 'Autoriza e confirma primeiro a tua localização atual.';
    }

    if (this.selectedVenueId !== null) {
      const venue = this.venues.find(item => item.id === this.selectedVenueId);
      if (!venue) {
        return t('createSession.venueNoLongerAvailable');
      }

      // Match the server's semicolon-separated sport check before submitting.
      const venueSports = venue.sports?.trim() || '';
      if (venueSports && !venueSports.split(';').some(
        venueSport => venueSport.trim().toLocaleLowerCase('pt')
          === this.sport.trim().toLocaleLowerCase('pt')
      )) {
        return t('createSession.venueSportMismatch');
      }
    }

    if (!this.gameDate || !this.city.trim()
        || (!this.address.trim() && !this.hasCoordinates)) {
      return 'Preenche a data e a localidade. Sem localização no mapa, indica também a morada.';
    }

    const city = this.city.trim();
    if (!/^[\p{L}\p{M}][\p{L}\p{M}\d .,'’()/-]{1,119}$/u.test(city)) {
      return t('feedback.create.invalidCity');
    }

    const gameInstant = new Date(this.gameDate);
    if (Number.isNaN(gameInstant.getTime()) || gameInstant.getTime() <= Date.now()) {
      return t('feedback.create.futureDate');
    }

    const players = Number(this.maxParticipants);
    if (!Number.isInteger(players) || players < 2 || players > 100) {
      return t('feedback.create.playersRange');
    }
    if (!Number.isInteger(this.minimumPlayers) || this.minimumPlayers < 2
        || this.minimumPlayers > players) {
      return t('createSession.minimumPlayersInvalid');
    }

    if (this.seasonGame) {
      if (!this.canMarkSeasonGame
          || this.seasonGameCommunityId !== this.seasonCommunities[0]?.id) {
        return t('createSession.seasonGameSelectCommunity');
      }
      if (this.seasonOverviewLoading || this.seasonOverviewError || !this.seasonOverview) {
        return t('createSession.seasonGameDataUnavailable');
      }
      if (this.seasonRankingsInactive && !this.confirmActivateRankings) {
        return t('createSession.seasonGameConfirmActivation');
      }
    }

    if (this.shareCommunityIds.length && this.privateGame) {
      return t('createSession.communitySharePublicOnly');
    }
    if (this.shareCommunityIds.length > 5
        || this.shareCommunityIds.some(id => !this.communities.some(c => c.id === id && !!c.myRole))) {
      return t('createSession.communityShareInvalid');
    }
    if (this.findPlayersMode) {
      const confirmed = Number(this.confirmedPlayers);
      if (this.confirmedPlayers === null || !Number.isInteger(confirmed)
          || confirmed < 1 || confirmed > players) {
        return t('createSession.confirmedPlayersError');
      }
    }

    if (this.communitySessionSelected && this.recurrence === 'WEEKLY') {
      const count = Number(this.weeklySessionsPerWeek);
      if (!Number.isInteger(count) || count < 1 || count > 7
          || this.additionalWeeklyGameDates.length !== count - 1) {
        return t('feedback.create.weeklySlotsRange');
      }
      const start = Date.parse(this.gameDate);
      const upper = new Date(this.gameDate);
      upper.setDate(upper.getDate() + 7);
      const seen = new Set<number>([start]);
      for (const input of this.additionalWeeklyGameDates) {
        const slot = Date.parse(input);
        if (!input || !Number.isFinite(slot) || !Number.isFinite(start)
            || slot <= Date.now() || slot <= start || slot >= upper.getTime()
            || seen.has(slot)) {
          return t('feedback.create.weeklySlotDateInvalid');
        }
        seen.add(slot);
      }
    }

    if (this.communitySessionSelected && this.registrationOpeningMode === 'SCHEDULED') {
      const opening = Date.parse(this.registrationOpensAt);
      const kickoff = Date.parse(this.gameDate);
      if (!this.registrationOpensAt || !Number.isFinite(opening)
          || !Number.isFinite(kickoff) || opening <= Date.now() || opening >= kickoff) {
        return t('feedback.create.registrationOpensAtInvalid');
      }
    }

    if (this.communitySessionSelected && this.recurrence !== 'NONE') {
      const occurrences = Number(this.recurrenceOccurrences);
      if (!Number.isInteger(occurrences) || occurrences < 2
          || occurrences > 52) {
        return t('feedback.create.recurrenceOccurrencesRange');
      }
      if (occurrences > this.maxRecurrenceCycles || this.plannedSessions > 52) {
        return t('feedback.create.recurrenceTotalRange');
      }
    }

    if (!this.findPlayersMode && this.privateGame && !this.password.trim()) {
      return t('feedback.create.privatePassword');
    }

    if (this.hasPrice) {
      const price = Number(this.priceAmount);
      if (!Number.isFinite(price) || price < 0) {
        return t('feedback.create.negativePrice');
      }
    }

    return null;
  }

  private errorFrom(error: HttpErrorResponse, fallback: string): string {
    const apiMessage = error.error?.message;
    return typeof apiMessage === 'string' && apiMessage.trim()
      ? apiMessage
      : fallback;
  }

  private toLocalDateTimeValue(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return [
      date.getFullYear(),
      '-',
      pad(date.getMonth() + 1),
      '-',
      pad(date.getDate()),
      'T',
      pad(date.getHours()),
      ':',
      pad(date.getMinutes())
    ].join('');
  }
}
