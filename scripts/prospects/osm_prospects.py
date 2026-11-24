"""Sports venues in mainland Portugal with a public contact, from OpenStreetMap.

Queries the public Overpass API once for sports centres, pitches and clubs whose sport
is one people rent by the hour, keeps those with a phone, website or email, then visits
each website once (shared helpers from padel_prospects) for an email and the booking
platform it already uses. Prints QA-ROW lines; one row per venue.
"""
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor

import requests

sys.path.insert(0, __file__.rsplit('/', 1)[0])
import padel_prospects as pp  # noqa: E402

SPORTS = ('soccer|futsal|padel|tennis|squash|badminton|pickleball|basketball|volleyball|handball|'
          'table_tennis|multi|fitness|climbing|beachvolleyball|field_hockey|roller_hockey|bowling|swimming')
QUERY = f"""
[out:json][timeout:300];
area["ISO3166-1"="PT"][admin_level=2]->.pt;
(
  nwr(area.pt)["leisure"~"^(sports_centre|pitch|sports_hall|fitness_centre|stadium)$"]["sport"~"{SPORTS}"];
  nwr(area.pt)["club"="sport"]["sport"~"{SPORTS}"];
);
out center tags;
"""
NAMES = {
    'soccer': 'Futebol', 'futsal': 'Futsal', 'padel': 'Padel', 'tennis': 'Ténis', 'squash': 'Squash',
    'badminton': 'Badminton', 'pickleball': 'Pickleball', 'basketball': 'Basquetebol', 'volleyball': 'Voleibol',
    'handball': 'Andebol', 'table_tennis': 'Ténis de mesa', 'multi': 'Multidesportos', 'fitness': 'Fitness',
    'climbing': 'Escalada', 'beachvolleyball': 'Voleibol de praia', 'field_hockey': 'Hóquei em campo',
    'roller_hockey': 'Hóquei em patins', 'bowling': 'Bowling', 'swimming': 'Natação',
}
PUBLIC = re.compile(r'munic|c[aâ]mara|junta de freguesia|escola|agrupamento|universidade|instituto|estado|inatel', re.I)


def tag(t, *keys):
    for k in keys:
        if t.get(k):
            return t[k].strip()
    return ''


def main():
    r = requests.post('https://overpass-api.de/api/interpreter', data={'data': QUERY},
                      headers={'User-Agent': pp.UA}, timeout=400)
    r.raise_for_status()
    elements = r.json().get('elements', [])
    print('QA-OSM-ELEMENTOS', len(elements))
    venues, seen = [], set()
    for e in elements:
        t = e.get('tags', {})
        lat = e.get('lat') or (e.get('center') or {}).get('lat')
        lon = e.get('lon') or (e.get('center') or {}).get('lon')
        if lat is None or lon is None or lat < 36.8 or lon < -9.6:
            continue  # islands (Madeira, Açores) and bad geometry
        name = tag(t, 'name', 'operator')
        phone = tag(t, 'phone', 'contact:phone', 'contact:mobile')
        site = tag(t, 'website', 'contact:website', 'url')
        email = tag(t, 'email', 'contact:email')
        if not name or not (phone or site or email):
            continue
        key = pp.fold(name) + '|' + re.sub(r'\D', '', phone)[-9:]
        if key in seen:
            continue
        seen.add(key)
        sports = ', '.join(sorted({NAMES.get(s.strip(), s.strip()) for s in t.get('sport', '').split(';') if s.strip()}))
        owner = 'público' if PUBLIC.search(name + ' ' + t.get('operator', '') + ' ' + t.get('operator:type', '')) \
            or t.get('operator:type') in ('government', 'public', 'municipal') else ''
        if t.get('access') == 'private' and not owner:
            owner = 'privado (acesso restrito)'
        if site and not site.startswith('http'):
            site = 'https://' + site
        venues.append({
            'nome': name, 'modalidades': sports, 'tipo': t.get('leisure') or 'clube',
            'cidade': tag(t, 'addr:city', 'addr:place', 'is_in:municipality'),
            'morada': ' '.join(x for x in (tag(t, 'addr:street'), tag(t, 'addr:housenumber'), tag(t, 'addr:postcode')) if x),
            'telefone': phone, 'site': site, 'email_osm': email, 'gestao': owner,
            'lat': '%.5f' % lat, 'lon': '%.5f' % lon,
        })
    print('QA-COM-CONTACTO', len(venues))

    def enrich(v):
        club = {'site': v['site'], 'detalhe': ''}
        pp.inspect_site(club)
        emails = [x for x in [v['email_osm']] + club.get('email', '').split('; ') if x]
        v['email'] = '; '.join(dict.fromkeys(e.lower() for e in emails))
        v['plataforma'] = club.get('plataforma', '')
        v['notas_site'] = club.get('notas_site', '')
        return v

    with ThreadPoolExecutor(max_workers=6) as pool:
        venues = list(pool.map(enrich, venues))
    fields = ['nome', 'modalidades', 'tipo', 'cidade', 'morada', 'telefone', 'site', 'email', 'plataforma', 'notas_site', 'gestao', 'lat', 'lon']
    for v in venues:
        print('QA-ROW|' + '|'.join(str(v.get(k, '') or '').replace('|', '/').replace('\n', ' ') for k in fields))
    print('QA-COM-EMAIL', sum(1 for v in venues if v['email']))
    print('QA-COM-PLATAFORMA', sum(1 for v in venues if v['plataforma']))


if __name__ == '__main__':
    main()
