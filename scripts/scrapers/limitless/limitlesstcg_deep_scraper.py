#!/usr/bin/env python3
"""
LimitlessTCG Deep Scraper (2026 Meta)
Scrape comprehensive tournament data and deck archetypes.
"""

import requests
from bs4 import BeautifulSoup
import json
import re
from datetime import datetime
import time

class LimitlessTCGDeepScraper:
    BASE_URL = "https://limitlesstcg.com"
    HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }

    def get_soup(self, url):
        try:
            resp = requests.get(url, headers=self.HEADERS, timeout=30)
            resp.raise_for_status()
            return BeautifulSoup(resp.text, 'html.parser')
        except Exception as e:
            print(f"Error fetching {url}: {e}")
            return None

    def scrape_tournaments(self, limit=30):
        print(f"📋 Scraping latest {limit} tournaments...")
        url = f"{self.BASE_URL}/tournaments"
        soup = self.get_soup(url)
        if not soup: return []

        tourney_list = []
        rows = soup.find_all('tr')
        for row in rows:
            cols = row.find_all('td')
            if not cols: continue
            
            t_date = cols[0].text.strip()
            link = row.find('a', href=re.compile(r'/tournaments/\d+'))
            if link:
                t_id = link.get('href').split('/')[-1]
                t_name = link.text.strip()
                t_players = cols[2].text.strip() if len(cols) > 2 else ""

                if t_id not in [t['id'] for t in tourney_list]:
                    tourney_list.append({
                        'id': t_id,
                        'name': t_name,
                        'date': t_date,
                        'players': t_players,
                        'url': self.BASE_URL + link.get('href')
                    })
                
                if len(tourney_list) >= limit:
                    break
        
        print(f"Found {len(tourney_list)} tournaments")
        return tourney_list

    def scrape_standings(self, tourney_id, limit=32):
        print(f"  Scraping standings for tournament {tourney_id}...")
        url = f"{self.BASE_URL}/tournaments/{tourney_id}"
        soup = self.get_soup(url)
        if not soup: return []

        # Labs redirect
        labs_link = soup.find('a', href=re.compile(r'labs\.limitlesstcg\.com/.*standings'))
        if not labs_link:
            labs_link = soup.find('a', href=re.compile(r'labs\.limitlesstcg\.com'))
        if labs_link:
            labs_url = labs_link.get('href')
            if 'standings' not in labs_url: labs_url = labs_url.rstrip('/') + '/standings'
            return self.scrape_labs_standings(labs_url, limit)

        # Standard main site parsing
        standings = []
        table = soup.find('table', class_='standings') or soup.find('table')
        if not table: return []

        rows = table.find_all('tr')[1:]
        for row in rows[:limit]:
            cols = row.find_all('td')
            if len(cols) < 2: continue
            rank = row.get('data-rank') or cols[0].text.strip()
            player = row.get('data-name') or cols[1].text.strip()
            deck_name = row.get('data-deck') or ""
            list_url = ""
            for col in cols[2:]:
                list_link = col.find('a', href=re.compile(r'/decks/list/'))
                if list_link:
                    list_url = self.BASE_URL + list_link.get('href')
                    break
                if not deck_name:
                    deck_link = col.find('a', href=re.compile(r'/decks/'))
                    if deck_link: deck_name = deck_link.text.strip()

            standings.append({
                'rank': rank, 'player': player, 'deck_name': deck_name or "Unknown", 'list_url': list_url
            })
        return standings

    def scrape_labs_standings(self, labs_url, limit=32):
        soup = self.get_soup(labs_url)
        if not soup: return []
        standings = []
        rows = soup.find_all('tr')[1:]
        for row in rows[:limit]:
            cols = row.find_all('td')
            if len(cols) < 2: continue
            rank = cols[0].text.strip()
            player = cols[1].text.strip()
            deck_name = ""
            list_url = ""
            for col in cols[2:]:
                archetype_link = col.find('a', href=re.compile(r'/decks/'))
                if archetype_link and '/list' not in archetype_link.get('href', '') and not deck_name:
                    imgs = archetype_link.find_all('img')
                    deck_name = " ".join([img.get('alt', '').capitalize() for img in imgs]) if imgs else archetype_link.text.strip()
                list_link = col.find('a', href=re.compile(r'/decklist|/list/|/decks/list/'))
                if list_link:
                    href = list_link.get('href')
                    domain = re.match(r'(https?://[^/]+)', labs_url).group(1) if re.match(r'(https?://[^/]+)', labs_url) else self.BASE_URL
                    list_url = href if href.startswith('http') else domain + href
            standings.append({'rank': rank, 'player': player, 'deck_name': deck_name or "Unknown", 'list_url': list_url})
        return standings

    def scrape_decklist(self, list_url):
        if not list_url: return None
        soup = self.get_soup(list_url)
        if not soup: return None
        
        # Try Labs JSON first
        scripts = soup.find_all('script', type="application/json")
        for script in scripts:
            if 'data-sveltekit-fetched' in script.attrs and script.string and 'pokemon' in script.string:
                try:
                    data = json.loads(script.string)
                    body_data = json.loads(data.get('body', '{}'))
                    msg = body_data.get('message', {})
                    if 'pokemon' in msg:
                        dl = {'pokemon': [], 'trainer': [], 'energy': []}
                        for c in ['pokemon', 'trainer', 'energy']:
                            for item in msg.get(c, []):
                                dl[c].append({'count': item.get('count', 0), 'name': item.get('name', ''), 'set': item.get('set', ''), 'number': item.get('number', '')})
                        return dl
                except: pass

        # Fallback text parse
        dl = {'pokemon': [], 'trainer': [], 'energy': []}
        container = soup.find('div', class_='decklist') or soup.find('body')
        lines = [l.strip() for l in container.get_text('\n').split('\n') if l.strip()]
        cur = None
        for i, line in enumerate(lines):
            if 'Pokémon' in line: cur = 'pokemon'
            elif 'Trainer' in line: cur = 'trainer'
            elif 'Energy' in line: cur = 'energy'
            elif cur and re.match(r'^\d+$', line) and i+1 < len(lines):
                dl[cur].append({'count': int(line), 'name': lines[i+1]})
        return dl

    def scrape_decks_catalog(self, max_pages=5):
        print(f"📋 Scraping deck catalog...")
        all_decks = []
        for p in range(1, max_pages + 1):
            soup = self.get_soup(f"{self.BASE_URL}/decks?page={p}")
            if not soup: break
            found = 0
            for link in soup.find_all('a', href=re.compile(r'/decks/\d+')):
                if link.get('href') not in [d['url'] for d in all_decks]:
                    all_decks.append({'name': link.text.strip(), 'url': self.BASE_URL + link.get('href')})
                    found += 1
            if not found: break
        return all_decks

    def run(self, n_t=25, n_s=32):
        print("🚀 STARTING DEEP SCRAPE...")
        results = {'tournaments': [], 'meta_decks': []}
        
        # Tournaments
        tourneys = self.scrape_tournaments(limit=n_t)
        for t in tourneys:
            print(f"  > {t['name']}")
            t['standings'] = self.scrape_standings(t['id'], limit=n_s)
            for s in t['standings']:
                if s['list_url']:
                    s['decklist'] = self.scrape_decklist(s['list_url'])
                    time.sleep(0.2)
            results['tournaments'].append(t)
            
        # Meta Decks
        results['meta_decks'] = self.scrape_decks_catalog()
        for d in results['meta_decks']:
            print(f"  > Meta Deck: {d['name']}")
            d_soup = self.get_soup(d['url'])
            if d_soup:
                list_link = d_soup.find('a', href=re.compile(r'/decks/list/'))
                if list_link:
                    d['sample_list'] = self.scrape_decklist(self.BASE_URL + list_link.get('href'))
            time.sleep(0.2)
            
        fname = f"limitlesstcg_deep_2026_{datetime.now().strftime('%H%M%S')}.json"
        with open(fname, 'w') as f: json.dump(results, f, indent=2)
        print(f"✅ DONE: {fname}")
        return fname

if __name__ == "__main__":
    scraper = LimitlessTCGDeepScraper()
    scraper.run()
