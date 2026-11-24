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
    'Tie Player': re.compile(r'tie ?player|tietennis', re.I),
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
    clubs = []
    for tel in soup.select('a[href^="tel:"]'):
        card = tel
        heading = None
        for _ in range(8):
            card = card.parent
            if card is None:
                break
            heading = card.find(['h2', 'h3', 'h4'])
            if heading:
                break
        if card is None or heading is None:
            continue
        name = re.sub(r'\s+', ' ', heading.get_text(' ', strip=True))
        name = re.sub(r'\s*\d(\.\d)?\s*\(based on.*$', '', name).strip()
        website = ''
        for a in card.find_all('a', href=True):
            h = a['href']
            if h.startswith('http') and 'padeldir.com' not in h and 'google.' not in h and 'goo.gl' not in h:
                website = clean_url(h)
                break
        text = card.get_text(' ', strip=True)
        address = ''
        m = POSTAL.search(text)
        if m:
            start = max(0, text.rfind('  ', 0, m.start()))
            address = text[max(0, m.start() - 70):m.end() + 40].strip()
        nearby = 'nearby' in text.lower()[:200]
        clubs.append({
            'nome': name, 'cidade_padeldir': label, 'telefone': tel['href'][4:].strip(),
            'site': website, 'morada': address, 'perto_de_outra_cidade': 'sim' if nearby else '',
        })
    return clubs


def inspect_site(club):
    site = club['site']
    club.update({'email': '', 'plataforma': '', 'notas_site': ''})
    if not site:
        return club
    host = urlparse(site).netloc.lower()
    for name, rx in PLATFORMS.items():
        if rx.search(host):
            club['plataforma'] = name
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
    with ThreadPoolExecutor(max_workers=6) as pool:
        clubs = list(pool.map(inspect_site, clubs))
    fields = ['nome', 'cidade_padeldir', 'morada', 'telefone', 'site', 'email', 'plataforma', 'notas_site', 'perto_de_outra_cidade']
    with open('prospects.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for c in clubs:
            w.writerow({k: c.get(k, '') for k in fields})
    print('QA-COM-EMAIL', sum(1 for c in clubs if c['email']))
    print('QA-COM-PLATAFORMA', sum(1 for c in clubs if c['plataforma']))
    print('QA-SEM-PLATAFORMA', sum(1 for c in clubs if not c['plataforma']))


if __name__ == '__main__':
    main()
