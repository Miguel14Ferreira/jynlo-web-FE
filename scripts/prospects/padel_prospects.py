"""Builds a list of padel/tennis clubs in mainland Portugal for venue outreach.

Reads the public padeldir.com city pages (robots.txt allows /en/), then visits each
club's own website once to find a contact email and whether it already uses a
booking platform. Writes prospects.csv. Polite: one request at a time per host,
short timeouts, a clear user agent.
"""
import csv
import re
import sys
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlparse, urlunparse, parse_qsl, urlencode

import requests
from bs4 import BeautifulSoup

UA = 'JynloVenueResearch/1.0 (+https://jynlosports.com; contacto para parcerias com recintos)'
BASE = 'https://padeldir.com/en/portugal/'
ISLANDS = {'camara-de-lobos', 'canico', 'funchal', 'ponta-delgada', 'santa-cruz'}
PLATFORMS = {
    'Playtomic': re.compile(r'playtomic', re.I),
    'Aircourts': re.compile(r'aircourts', re.I),
    'Tie Player': re.compile(r'tie ?player|tietennis|tiepadel', re.I),
    'Matchi': re.compile(r'matchi\.se', re.I),
    'Padel Manager': re.compile(r'padelmanager|padel manager', re.I),
    'Doinsport': re.compile(r'doinsport', re.I),
    'Gesport/Sportsplus': re.compile(r'gesport|sportsplus|ticktennis', re.I),
}
EMAIL = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}')
BAD_EMAIL = re.compile(r'\.(png|jpe?g|gif|webp|svg)$|example\.|sentry|wixpress|domain\.com|@2x|godaddy|wordpress', re.I)
POSTAL = re.compile(r'\b\d{4}-\d{3}\b')

session = requests.Session()
session.headers['User-Agent'] = UA


def get(url, timeout=15):
    try:
        r = session.get(url, timeout=timeout, allow_redirects=True)
        if r.status_code == 200 and 'text/html' in r.headers.get('content-type', 'text/html'):
            return r.text, r.url
    except requests.RequestException:
        pass
    return None, url


def clean_url(href):
    p = urlparse(href)
    q = [(k, v) for k, v in parse_qsl(p.query) if not k.lower().startswith('utm_')]
    return urlunparse(p._replace(query=urlencode(q), fragment=''))


def fold(s):
    return unicodedata.normalize('NFD', s or '').encode('ascii', 'ignore').decode().lower().strip()


def city_links():
    html, _ = get(BASE)
    soup = BeautifulSoup(html or '', 'html.parser')
    out = []
    for a in soup.find_all('a', href=True):
        m = re.match(r'^(?:https://padeldir\.com)?/en/portugal/([a-z0-9-]+)/?$', a['href'])
        if m and m.group(1) not in ISLANDS and m.group(1) not in [c for c, _ in out]:
            out.append((m.group(1), a.get_text(strip=True)))
    return out


def parse_city(slug, label):
    html, _ = get(BASE + slug + '/')
    if not html:
        print('QA-ERRO cidade', slug, file=sys.stderr)
        return []
    soup = BeautifulSoup(html, 'html.parser')
    main = soup.find('main') or soup
    # Walk the page in order: every h3 opens a club; the phone, website and address
    # that follow belong to it until the next h3.
    clubs, current = [], None
    for el in main.find_all(['h3', 'a', 'p']):
        if el.name == 'h3':
            current = {'nome': re.sub(r'\s+', ' ', el.get_text(' ', strip=True)), 'cidade_padeldir': label,
                       'telefone': '', 'site': '', 'morada': '', 'perto_de_outra_cidade': '', 'plataforma_detalhe': ''}
            clubs.append(current)
            continue
        if current is None:
            continue
        if el.name == 'p' and el.get('title') and not current['morada']:
            current['morada'] = el['title']
        elif el.name == 'a':
            h = el.get('href', '')
            if h.startswith('tel:') and not current['telefone']:
                current['telefone'] = h[4:].strip()
            elif 'utm_source=padeldir' in h and not current['site'] and not current['plataforma_detalhe']:
                url = clean_url(h)
                platform = next((n for n, rx in PLATFORMS.items() if rx.search(url)), '')
                if platform:
                    current['plataforma_detalhe'] = platform
                else:
                    current['site'] = url
            elif re.match(r'^/en/portugal/([a-z0-9-]+)/#', h) and not h.startswith('/en/portugal/' + slug + '/'):
                current['perto_de_outra_cidade'] = 'sim'
    return [c for c in clubs if c['telefone'] or c['site']]


SOCIAL = re.compile(r'facebook\.com/sharer|twitter\.com/intent|wa\.me|linkedin\.com/share|x\.com/intent|amazon\.|awin|tradedoubler', re.I)


DBG = [0]


def read_detail(club):
    if not club.get('detalhe') or club.get('site'):
        return
    html, _ = get(club['detalhe'])
    time.sleep(0.4)
    if not html:
        return
    soup = BeautifulSoup(html, 'html.parser')
    main = soup.find('main') or soup
    text = main.get_text(' ', strip=True)
    cut = text.find('Nearby')
    own = text[:cut] if cut > 0 else text[:4000]
    h1 = soup.find('h1')
    if DBG and len(DBG) < 4:
        DBG.append(1)
        print('QA-DBG', club['detalhe'], '|', h1.get_text(' ', strip=True) if h1 else None, '|',
              [a['href'][:80] for a in soup.find_all('a', href=True) if 'utm_source' in a['href']][:3])
    if not (h1 and fold(club['nome'])[:12] in fold(h1.get_text(' ', strip=True))):
        return  # not this club's own page (a city listing)
    if True:
        for a in main.find_all('a', href=True):
            if 'utm_source=padeldir' in a['href']:
                host = clean_url(a['href'])
                platform = next((n for n, rx in PLATFORMS.items() if rx.search(host)), '')
                if platform:
                    club['plataforma_detalhe'] = platform
                elif not club.get('site'):
                    club['site'] = host
                break
    m = None if club.get('site') else re.search(r'Website:\s*((?:https?://)?[\w.-]+\.[a-z]{2,}(?:/[^\s]*)?)', own, re.I)
    if m:
        host = m.group(1)
        platform = next((n for n, rx in PLATFORMS.items() if rx.search(host)), '')
        if platform:
            club['plataforma_detalhe'] = platform
        else:
            club['site'] = host if host.startswith('http') else 'https://' + host
    if re.search(r'Online booking not available', own):
        club['sem_reserva_online'] = 'sim'
    for a in main.find_all('a', href=True):
        h = a['href']
        if not h.startswith('http') or 'padeldir.com' in h or 'google.' in h or SOCIAL.search(h):
            continue
        for name, rx in PLATFORMS.items():
            if rx.search(h) and not club.get('plataforma_detalhe'):
                club['plataforma_detalhe'] = name
        label = a.get_text(' ', strip=True)
        context = (a.parent.get_text(' ', strip=True) if a.parent else '')[:120]
        looks_like_site = re.fullmatch(r'[\w.-]+\.[a-z]{2,}(/\S*)?', label or '') or context.lower().startswith('website')
        if looks_like_site and not club.get('site') and not any(rx.search(h) for rx in PLATFORMS.values()):
            club['site'] = clean_url(h)


def inspect_site(club):
    site = club['site']
    club.update({'email': '', 'plataforma': club.get('plataforma_detalhe', ''), 'notas_site': ''})
    if not site:
        return club
    host = urlparse(site).netloc.lower()
    for name, rx in PLATFORMS.items():
        if rx.search(host):
            club['plataforma'] = name
            club['site'] = ''
            return club
    if any(h in host for h in ('facebook.com', 'instagram.com')):
        club['notas_site'] = 'só redes sociais'
        return club
    pages = [site]
    html, final = get(site)
    if not html:
        club['notas_site'] = 'site não abre'
        return club
    soup = BeautifulSoup(html, 'html.parser')
    for a in soup.find_all('a', href=True):
        label = fold(a.get_text(' ', strip=True) + ' ' + a['href'])
        if re.search(r'contact|contato|contacto', label) and len(pages) < 3:
            u = urljoin(final, a['href'])
            if urlparse(u).netloc == urlparse(final).netloc and u not in pages:
                pages.append(u)
    found_platforms, emails = set(), []
    for i, page in enumerate(pages):
        body = html if i == 0 else get(page)[0]
        if not body:
            continue
        for name, rx in PLATFORMS.items():
            if rx.search(body):
                found_platforms.add(name)
        bs = BeautifulSoup(body, 'html.parser')
        for a in bs.select('a[href^="mailto:"]'):
            emails.append(a['href'][7:].split('?')[0])
        emails += EMAIL.findall(bs.get_text(' '))
        time.sleep(0.5)
    seen = []
    for e in emails:
        e = e.strip().strip('.').lower()
        if e and not BAD_EMAIL.search(e) and e not in seen:
            seen.append(e)
    club['email'] = '; '.join(seen[:3])
    if club.get('plataforma_detalhe'):
        found_platforms.add(club['plataforma_detalhe'])
    club['plataforma'] = ', '.join(sorted(found_platforms))
    if not found_platforms and re.search(r'reserv|book', html, re.I):
        club['notas_site'] = 'fala em reservas (ver se é sistema próprio)'
    return club


def main():
    cities = city_links()
    print('QA-CIDADES', len(cities))
    clubs, keys = [], set()
    for slug, label in cities:
        for c in parse_city(slug, label):
            key = fold(c['nome']) + '|' + re.sub(r'\D', '', c['telefone'])[-9:]
            if key in keys:
                continue
            keys.add(key)
            clubs.append(c)
        time.sleep(1)
    print('QA-CLUBES', len(clubs))
    with ThreadPoolExecutor(max_workers=4) as pool:
        clubs = list(pool.map(inspect_site, clubs))
    fields = ['nome', 'cidade_padeldir', 'morada', 'telefone', 'site', 'email', 'plataforma', 'notas_site', 'perto_de_outra_cidade', 'sem_reserva_online']
    with open('prospects.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for c in clubs:
            w.writerow({k: c.get(k, '') for k in fields})
    for c in clubs:
        print('QA-ROW|' + '|'.join((c.get(k, '') or '').replace('|', '/') for k in fields))
    print('QA-COM-EMAIL', sum(1 for c in clubs if c['email']))
    print('QA-COM-PLATAFORMA', sum(1 for c in clubs if c['plataforma']))
    print('QA-SEM-PLATAFORMA', sum(1 for c in clubs if not c['plataforma']))


if __name__ == '__main__':
    main()
