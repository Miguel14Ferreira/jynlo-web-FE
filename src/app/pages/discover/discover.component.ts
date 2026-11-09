import { ChangeDetectionStrategy, Component, OnInit, Optional } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { Observable, catchError, finalize, forkJoin, map, of, retry, timeout } from 'rxjs';

import { AuthenticationService } from '../../services/authethication.service';
import { CommunityService } from '../../services/community.service';
import { SessionService } from '../../services/session.service';
import { VenueService } from '../../services/venue.service';
import { SPORTS_CATALOG } from '../../shared/sports-catalog';
import { venueEnvironmentTranslationKey } from '../../shared/venue-environment';
import { venueHasPortugueseCoordinates, venueOsmEmbedUrl } from '../../shared/venue-public-contact';
import { CommunityProfile } from '../model/community-profile';
import { environment } from 'src/environment/environment';
import { SessionSummary } from '../model/session-summary';
import { Venue } from '../model/venue';

type ExploreCategory = 'all' | 'venues' | 'sessions' | 'people' | 'communities';

@Component({
  selector: 'app-discover',
  templateUrl: './discover.component.html',
  styleUrls: ['./discover.component.css', './discover-neon-glass.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class DiscoverComponent implements OnInit {
  activeTab: ExploreCategory = 'all';
  sessionView: 'map' | 'list' = 'list';
  setSessionView(view: 'map' | 'list'): void {
    this.sessionView = view;
    // The map needs the full-width focused panel, even from the overview tab.
    if (view === 'map') this.activeTab = 'sessions';
  }
  readonly quickSports = ['Padel', 'Futebol', 'Ténis'];
  selectedMapVenueId: number | null = null;
  private cachedVenueMapSource = '';
  private cachedTrustedVenueMap: SafeResourceUrl | null = null;

  get mapAvailableVenues(): Venue[] {
    return this.venues.filter(venue => venueHasPortugueseCoordinates(venue.latitude, venue.longitude)).slice(0, 8);
  }

  get focusedMapVenue(): Venue | null {
    const mapped = this.mapAvailableVenues;
    return mapped.find(venue => venue.id === this.selectedMapVenueId) || mapped[0] || null;
  }

  get focusedVenueMapUrl(): SafeResourceUrl | null {
    const venue = this.focusedMapVenue;
    if (!venue || !this.sanitizer) return null;
    const source = venueOsmEmbedUrl(venue.latitude!, venue.longitude!);
    if (!source) return null;
    if (source !== this.cachedVenueMapSource) {
      this.cachedVenueMapSource = source;
      this.cachedTrustedVenueMap = this.sanitizer.bypassSecurityTrustResourceUrl(source);
    }
    return this.cachedTrustedVenueMap;
  }

  selectMapVenue(id: number): void {
    if (this.mapAvailableVenues.some(venue => venue.id === id)) this.selectedMapVenueId = id;
  }


  setCategory(category: ExploreCategory): void {
    this.activeTab = category;
  }

  showSection(category: 'venues' | 'sessions' | 'people'): boolean {
    // Venues have their own dedicated tab (and map); do not duplicate them
    // in "For you", where sessions and players are the useful recommendations.
    if (category === 'venues') return this.activeTab === 'venues';
    if (this.activeTab === category) return true;
    if (this.activeTab !== 'all') return false;
    if (category === 'sessions') return !this.sessionsLoadError && this.sessions.length > 0;
    return !this.peopleLoadError && this.people.length > 0;
  }

  selectQuickSport(value: string): void {
    this.onSportChange(this.sport.trim() === value ? '' : value);
    this.search();
  }

  readonly sportsCatalog = SPORTS_CATALOG;
  readonly venueEnvironmentTranslationKey = venueEnvironmentTranslationKey;

  sport = '';
  location = '';
  playerName = '';
  appliedPlayerName = '';
  loadingPeople = false;
  playerSearchError = false;
  private sportEdited = false;
  private locationEdited = false;
  venues: Venue[] = [];
  venuesHasMore = false;
  topVenueResults: Venue[] = [];
  sessions: SessionSummary[] = [];
  topSessionResults: SessionSummary[] = [];
  people: CommunityProfile[] = [];
  topPeopleResults: CommunityProfile[] = [];

  locatingVenues = false;
  nearbyVenueError = '';
  nearbyVenueRadiusKm = 25;
  nearbyVenuePosition: { latitude: number; longitude: number } | null = null;
  private nearbyVenueRequestId = 0;

  locatingSessions = false;
  nearbySessionError = '';
  nearbyRadiusKm = 25;
  nearbyPosition: { latitude: number; longitude: number } | null = null;
  private nearbyRequestId = 0;

  loading = false;
  initialized = false;
  loadError = false;
  venuesLoadError = false;
  sessionsLoadError = false;
  peopleLoadError = false;
  private searchRequestId = 0;
  private peopleRequestId = 0;
  showAllVenues = false;
  showAllSessions = false;
  showAllPeople = false;

  constructor(
    private authenticationService: AuthenticationService,
    private venueService: VenueService,
    private sessionService: SessionService,
    private communityService: CommunityService,
    private route: ActivatedRoute,
    @Optional() private readonly sanitizer: DomSanitizer | null
  ) {}

  ngOnInit(): void {
    this.authenticationService.isLoggedIn();

    // Explicit return filters take precedence over suggestions from the public profile.
    const params = this.route.snapshot.queryParamMap;
    if (params.has('sport') || params.has('city') || params.has('player')) {
      this.sport = (params.get('sport') || '').trim();
      this.location = (params.get('city') || '').trim();
      this.playerName = (params.get('player') || '').trim();
      this.appliedPlayerName = this.playerName;
      this.sportEdited = true;
      this.locationEdited = true;
    }

    const username = this.authenticationService.loggedInPerfilname;

    if (!username) {
      this.search();
      return;
    }

    this.communityService.publicProfile(username)
      .pipe(
        timeout(10_000),
        retry({ count: 1 }),
        catchError(() => of(null))
      )
      .subscribe(profile => {
        if (profile) {
          if (!this.sportEdited) {
            const favorites = (profile.favoriteSports || '')
              .split(/[,;|]/)
              .map(value => this.normalizeFavoriteSport(value))
              .filter(Boolean);
            this.sport = favorites
              .map(favorite => this.sportsCatalog.find(sport =>
                this.normalizeFavoriteSport(sport) === favorite))
              .find((sport): sport is string => Boolean(sport)) || '';
          }

          if (!this.locationEdited) {
            this.location = profile.location?.trim() || '';
          }
        }

        this.search();
      });
  }

  private normalizeFavoriteSport(value: string): string {
    return value.trim().toLocaleLowerCase('pt').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  onSportChange(value: string): void {
    this.sport = value;
    this.sportEdited = true;
    this.playerName = '';
    this.appliedPlayerName = '';
  }

  onLocationChange(value: string): void {
    this.location = value;
    this.locationEdited = true;
    this.playerName = '';
    this.appliedPlayerName = '';
    this.disableNearbySessions();
    this.disableNearbyVenues();
  }

  enableNearbyVenues(): void {
    if (this.locatingVenues) {
      return;
    }
    this.nearbyVenueError = '';
    if (!navigator.geolocation) {
      this.nearbyVenueError = 'unsupported';
      return;
    }

    this.locatingVenues = true;
    const requestId = ++this.nearbyVenueRequestId;
    navigator.geolocation.getCurrentPosition(
      position => {
        if (requestId !== this.nearbyVenueRequestId) {
          return;
        }
        this.locatingVenues = false;
        const { latitude, longitude } = position.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
          || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
          this.nearbyVenueError = 'unavailable';
          return;
        }
        this.nearbyVenuePosition = { latitude, longitude };
        this.search();
      },
      () => {
        if (requestId !== this.nearbyVenueRequestId) {
          return;
        }
        this.locatingVenues = false;
        this.nearbyVenueError = 'unavailable';
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }

  changeNearbyVenueRadius(radiusKm: number): void {
    if (!this.nearbyVenuePosition || ![10, 25, 50].includes(radiusKm)) {
      return;
    }
    this.nearbyVenueRadiusKm = radiusKm;
    this.search();
  }

  disableNearbyVenues(): void {
    ++this.nearbyVenueRequestId;
    this.nearbyVenuePosition = null;
    this.locatingVenues = false;
    this.nearbyVenueError = '';
  }

  enableNearbySessions(): void {
    if (this.locatingSessions) {
      return;
    }
    this.nearbySessionError = '';
    if (!navigator.geolocation) {
      this.nearbySessionError = 'unsupported';
      return;
    }

    this.locatingSessions = true;
    const requestId = ++this.nearbyRequestId;
    navigator.geolocation.getCurrentPosition(
      position => {
        if (requestId !== this.nearbyRequestId) {
          return;
        }
        this.locatingSessions = false;
        const { latitude, longitude } = position.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
          || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
          this.nearbySessionError = 'unavailable';
          return;
        }
        this.nearbyPosition = { latitude, longitude };
        this.search();
      },
      () => {
        if (requestId !== this.nearbyRequestId) {
          return;
        }
        this.locatingSessions = false;
        this.nearbySessionError = 'unavailable';
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }

  changeNearbyRadius(radiusKm: number): void {
    if (!this.nearbyPosition || ![10, 25, 50].includes(radiusKm)) {
      return;
    }
    this.nearbyRadiusKm = radiusKm;
    this.search();
  }

  disableNearbySessions(): void {
    ++this.nearbyRequestId;
    this.nearbyPosition = null;
    this.locatingSessions = false;
    this.nearbySessionError = '';
  }

  search(): void {
    const requestId = ++this.searchRequestId;
    const peopleRequestId = ++this.peopleRequestId;
    this.loadingPeople = false;
    this.showAllVenues = false;
    this.showAllSessions = false;
    this.showAllPeople = false;

    const sport = this.sport.trim();
    const location = this.location.trim();

    this.loading = true;
    this.loadError = false;
    this.venuesLoadError = false;
    this.sessionsLoadError = false;
    this.peopleLoadError = false;
    this.venuesHasMore = false;

    forkJoin({
      venues: this.withRecovery(
        this.nearbyVenuePosition
          ? this.venueService.search(
              undefined, sport || undefined,
              this.nearbyVenuePosition.latitude, this.nearbyVenuePosition.longitude,
              this.nearbyVenueRadiusKm).pipe(map(venues => ({ venues, hasMore: false })))
          // The regular preview uses the bounded catalogue; never imply its page is the total.
          : this.venueService.suggest(undefined, location || undefined, sport || undefined, 0)
              .pipe(map(page => ({ venues: page.venues, hasMore: page.hasMore }))),
        { venues: [] as Venue[], hasMore: false }, 'venues', requestId
      ),
      sessions: this.withRecovery(
        this.sessionService.discover({
          sport: sport || undefined,
          city: this.nearbyPosition ? undefined : location || undefined,
          latitude: this.nearbyPosition?.latitude,
          longitude: this.nearbyPosition?.longitude,
          radiusKm: this.nearbyPosition ? this.nearbyRadiusKm : undefined,
          // Include FULL sessions so players can discover their waitlists.
          // The card only shows a join shortcut when participation is viable.
          availability: undefined,
          sort: this.nearbyPosition ? 'distance' : 'date'
        }),
        [] as SessionSummary[], 'sessions', requestId
      ),
      people: this.withRecovery(
        this.peopleRequest(sport, location),
        [] as CommunityProfile[], 'people', requestId
      )
    })
      .pipe(finalize(() => {
        if (requestId === this.searchRequestId) {
          this.loading = false;
          this.initialized = true;
        }
      }))
      .subscribe(({ venues, sessions, people }) => {
        if (requestId !== this.searchRequestId) return;
        // The API now ranks the entire paginated catalogue before slicing;
        // do not re-rank within page 0 or disturb GPS distance ordering.
        this.venues = venues.venues;
        this.venuesHasMore = venues.hasMore;
        this.topVenueResults = venues.venues.slice(0, 4);
        this.sessions = sessions;
        this.topSessionResults = sessions.slice(0, 4);
        if (peopleRequestId === this.peopleRequestId) {
          this.people = people;
          this.topPeopleResults = people.slice(0, 4);
        }
      });
  }


  /** Offer controlled, explicit filter relaxation only after a genuine empty search. */
  broadenVenueSearch(filter: 'sport' | 'city' | 'all'): void {
    if (filter === 'all') {
      this.clear();
      return;
    }
    if (filter === 'sport') this.onSportChange('');
    if (filter === 'city') this.onLocationChange('');
    this.search();
  }

  searchPlayers(): void {
    if (this.loading || this.loadingPeople) {
      return;
    }

    const requestId = ++this.peopleRequestId;
    this.loadingPeople = true;
    this.showAllPeople = false;
    this.playerSearchError = false;
    this.appliedPlayerName = this.playerName.trim();
    this.peopleRequest(this.sport.trim(), this.location.trim())
      .pipe(
        timeout(10_000),
        retry({ count: 1 }),
        catchError(() => {
          if (requestId === this.peopleRequestId) this.playerSearchError = true;
          return of([] as CommunityProfile[]);
        }),
        finalize(() => {
          if (requestId === this.peopleRequestId) this.loadingPeople = false;
        })
      )
      .subscribe(people => {
        if (requestId !== this.peopleRequestId) return;
        this.people = people;
        this.topPeopleResults = people.slice(0, 4);
      });
  }

  clearPlayerName(): void {
    this.playerName = '';
    this.searchPlayers();
  }

  clear(): void {
    this.playerName = '';
    this.appliedPlayerName = '';
    this.playerSearchError = false;
    this.disableNearbySessions();
    this.disableNearbyVenues();
    this.sport = '';
    this.location = '';
    this.sportEdited = true;
    this.locationEdited = true;
    this.search();
  }

  get topVenues(): Venue[] {
    return this.showAllVenues ? this.venues : this.topVenueResults;
  }

  toggleAllVenues(): void {
    this.showAllVenues = !this.showAllVenues;
  }

  get topSessions(): SessionSummary[] {
    return this.showAllSessions ? this.sessions : this.topSessionResults;
  }

  toggleAllSessions(): void {
    this.showAllSessions = !this.showAllSessions;
  }

  get topPeople(): CommunityProfile[] {
    return this.appliedPlayerName || this.showAllPeople ? this.people : this.topPeopleResults;
  }

  toggleAllPeople(): void {
    this.showAllPeople = !this.showAllPeople;
  }

  playerPhotoUrl(profile: CommunityProfile): string | null {
    const photo = profile.profilePicUrl;
    if (!photo) {
      return null;
    }
    if (/^(https?:|data:)/i.test(photo)) {
      return photo;
    }
    return environment.apiUrl + (photo.startsWith('/') ? photo : '/' + photo);
  }

  vacancies(session: SessionSummary): number {
    return Math.max(0, session.maxParticipants - session.participantCount);
  }

  sessionDisplayDate(session: SessionSummary): string | null {
    return Number.isFinite(Date.parse(session.gameDate)) ? session.gameDate : null;
  }

  sessionEntryAction(session: SessionSummary): 'join' | 'waitlist' | 'details' {
    const startsAt = Date.parse(session.gameDate);
    if (session.privateGame || session.audience === 'COMMUNITY_ONLY'
        || session.joinedByViewer || session.waitlistedByViewer
        || !Number.isFinite(startsAt) || startsAt <= Date.now()) {
      return 'details';
    }

    // FULL is authoritative even if the participant-count snapshot is delayed.
    if (session.status?.toUpperCase() === 'FULL') {
      return 'waitlist';
    }

    if (session.status?.toUpperCase() === 'OPEN'
        && Number.isSafeInteger(session.participantCount)
        && Number.isSafeInteger(session.maxParticipants)
        && session.participantCount >= 0 && session.maxParticipants > 0
        && this.vacancies(session) > 0) {
      return 'join';
    }

    // Never promise an available spot from unknown counts or closed sessions.
    return 'details';
  }

  private withRecovery<T>(
    request$: Observable<T>,
    fallback: T,
    area: 'venues' | 'sessions' | 'people',
    requestId: number
  ): Observable<T> {
    return request$.pipe(
      timeout(10_000),
      retry({ count: 1 }),
      catchError(() => {
        if (requestId !== this.searchRequestId) return of(fallback);
        if (area === 'venues') this.venuesLoadError = true;
        if (area === 'sessions') this.sessionsLoadError = true;
        if (area === 'people') this.peopleLoadError = true;
        this.loadError = this.venuesLoadError && this.sessionsLoadError && this.peopleLoadError;
        return of(fallback);
      })
    );
  }

  private peopleRequest(
    sport: string,
    location: string
  ): Observable<CommunityProfile[]> {
    const name = this.playerName.trim();
    // A name search must not inherit Discover's sport or locality filters.
    if (name) {
      return name.length < 2
        ? of([])
        : this.communityService.findProfiles({ name });
    }
    if (!sport && !location) {
      return of([]);
    }
    return this.communityService.findProfiles({
      sport: sport || undefined,
      location: location || undefined
    });
  }
}
