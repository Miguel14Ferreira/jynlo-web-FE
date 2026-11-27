export type VenueOwnershipType = 'PUBLIC' | 'PRIVATE';
export type VenueInformationSource = 'COMMUNITY' | 'OFFICIAL' | 'OPENSTREETMAP';
export type VenueEnvironmentType = 'INDOOR' | 'OUTDOOR' | 'BOTH';
/** Additive API field; absent while older backend versions are LIVE. */
export type VenueLocationStatus =
  | 'GPS_ONLY_ADDRESS_UNKNOWN'
  | 'ADDRESS_PROVIDED_UNVERIFIED'
  | 'LOCATION_UNKNOWN';

export interface Venue {
  id: number;
  name: string;
  city: string;
  district?: string | null;
  address: string;
  locationStatus?: VenueLocationStatus;
  sports: string | null;
  venueType: string | null;
  ownershipType: VenueOwnershipType | null;
  surfaceType: string | null;
  environmentType: VenueEnvironmentType | null;
  indoor: boolean;
  changingRooms: boolean;
  changingRoomTypes: string | null;
  toilets: boolean | null;
  lockers: boolean | null;
  showers: boolean | null;
  stands: boolean | null;
  drinkingFountain: boolean | null;
  accessible: boolean | null;
  firstAid: boolean | null;
  aed: boolean | null;
  medicalStation: boolean | null;
  lifeguard: boolean | null;
  staffOnSite: boolean | null;
  securitySurveillance: boolean | null;
  cafe: boolean | null;
  restaurant: boolean | null;
  vendingMachines: boolean | null;
  sportsShop: boolean | null;
  wifi: boolean | null;
  phoneCharging: boolean | null;
  nearbyRadiusMeters: number | null;
  nearbyPharmacy: boolean | null;
  nearbyAtm: boolean | null;
  services: string | null;
  transport: string | null;
  openingHours: string | null;
  priceInfo: string | null;
  website: string | null;
  contact: string | null;
  parking: boolean;
  freeParking: boolean | null;
  lighting: boolean;
  latitude: number | null;
  longitude: number | null;
  informationSource: VenueInformationSource;
  /** Attribution for imported open data (e.g. IPDJ – SNID, CC BY 4.0). */
  dataCredit?: string | null;
  createdByUsername: string | null;
  createdAt: string;
  /** Where people book (club page, Playtomic, municipal portal…). */
  bookingUrl?: string | null;
  /** Public space with free access: no booking needed. */
  freeAccess?: boolean | null;
  /** Snooker, darts, bars…: only shown to signed-in adults. */
  adultsOnly?: boolean;
}

export interface CreateVenueRequest {
  name: string;
  city: string;
  district?: string | null;
  address: string | null;
  sports: string | null;
  venueType?: string | null;
  ownershipType?: VenueOwnershipType | null;
  surfaceType: string | null;
  environmentType?: VenueEnvironmentType | null;
  indoor: boolean;
  changingRooms: boolean;
  changingRoomTypes?: string | null;
  toilets?: boolean | null;
  lockers?: boolean | null;
  showers?: boolean | null;
  stands?: boolean | null;
  drinkingFountain?: boolean | null;
  accessible?: boolean | null;
  firstAid?: boolean | null;
  aed?: boolean | null;
  medicalStation?: boolean | null;
  lifeguard?: boolean | null;
  staffOnSite?: boolean | null;
  securitySurveillance?: boolean | null;
  cafe?: boolean | null;
  restaurant?: boolean | null;
  vendingMachines?: boolean | null;
  sportsShop?: boolean | null;
  wifi?: boolean | null;
  phoneCharging?: boolean | null;
  nearbyRadiusMeters?: number | null;
  nearbyPharmacy?: boolean | null;
  nearbyAtm?: boolean | null;
  services?: string | null;
  transport?: string | null;
  openingHours?: string | null;
  priceInfo?: string | null;
  website?: string | null;
  contact?: string | null;
  parking: boolean;
  freeParking?: boolean | null;
  lighting: boolean;
  latitude: number | null;
  longitude: number | null;
}
