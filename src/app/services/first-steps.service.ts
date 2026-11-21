import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export interface FirstSteps { favoriteSports: string[]; location: string | null; needed: boolean; }

export const FIRST_STEPS_MAX_SPORTS = 10;
export const FIRST_STEPS_POPULAR = ['Futebol', 'Padel', 'Ténis', 'Corrida', 'Basquetebol', 'Voleibol', 'Futsal', 'Ciclismo', 'Ginásio', 'Natação', 'Caminhada', 'Andebol'];
const fold = (s: unknown) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** Popular sports first (only those in the catalog); the filter searches the whole catalog. */
export function firstStepsChoices(catalog: readonly string[], filter: string, selected: readonly string[]): string[] {
  const all = Array.from(new Set(catalog));
  const popular = FIRST_STEPS_POPULAR.filter(s => all.includes(s));
  const rest = all.filter(s => !popular.includes(s)).sort((a, b) => a.localeCompare(b, 'pt'));
  const q = fold(filter);
  const ordered = q ? [...popular, ...rest].filter(s => fold(s).includes(q)) : popular;
  return [...selected.filter(s => !ordered.includes(s)), ...ordered];
}

/** Sports and city chosen right after signing up. "Agora não" is remembered in this browser. */
@Injectable({ providedIn: 'root' })
export class FirstStepsService {
  private readonly url = environment.apiUrl.replace(/\/$/, '') + '/api/profile/me/first-steps';
  constructor(private http: HttpClient) {}

  get(): Observable<FirstSteps> { return this.http.get<FirstSteps>(this.url); }
  save(favoriteSports: string[], location: string): Observable<FirstSteps> {
    return this.http.put<FirstSteps>(this.url, { favoriteSports, location });
  }
  catalog(): Observable<string[]> {
    return this.http.get<string[]>(environment.apiUrl.replace(/\/$/, '') + '/api/profile/sports-catalog');
  }

  private key(username: string): string { return 'jynlo.firstSteps.skipped.' + username.toLowerCase(); }
  skipped(username: string | null): boolean {
    if (!username) return true;
    try { return localStorage.getItem(this.key(username)) !== null; } catch { return false; }
  }
  skip(username: string | null): void {
    if (!username) return;
    try { localStorage.setItem(this.key(username), String(Date.now())); } catch { /* private mode */ }
  }
}
