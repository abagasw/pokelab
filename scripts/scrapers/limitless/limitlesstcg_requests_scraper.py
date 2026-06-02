#!/usr/bin/env python3
"""
LimitlessTCG Requests-based Scraper
Scrape latest tournaments and decklists without Playwright
"""

import requests
from bs4 import BeautifulSoup
import json
import re
from datetime import datetime
import time

class LimitlessTCGRequestsScraper:
    BASE_URL = "https://limitlesstcg.com"
    HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }

    def __init__(self):
        self.tournaments = []

    def get_soup(self, url):
        try:
            resp = requests.get(url, headers=self.HEADERS, timeout=30)
            resp.raise_for_status()
            return BeautifulSoup(resp.text, 'html.parser')
        except Exception as e:
            print(f"Error fetching {url}: {e}")
            return None

    def scrape_tournaments(self, limit=5):
        print(f"📋 Scraping latest {limit} tournaments...")
        url = f"{self.BASE_URL}/tournaments"
        soup = self.get_soup(url)
        if not soup: return []

        tourney_list = []
        # Find tournament rows in the table
        rows = soup.find_all('tr')
        for row in rows:
            link = row.find('a', href=re.compile(r'/tournaments/\d+'))
            if link:
                t_id = link.get('href').split('/')[-1]
                t_name = link.text.strip()
                
                # Try to find date and players count in the same row
                cols = row.find_all('td')
                t_date = ""
                t_players = ""
                if len(cols) >= 3:
                    t_date = cols[0].text.strip()
                    t_players = cols[2].text.strip()

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

    def scrape_standings(self, tourney_id, limit_standings=8):
        print(f"  Scraping standings for tournament {tourney_id}...")
        url = f"{self.BASE_URL}/tournaments/{tourney_id}"
        soup = self.get_soup(url)
        if not soup: return []

        # Check if there's a link to Labs Standings
        # Look for the specific link in the nav or page body
        labs_link = soup.find('a', href=re.compile(r'labs\.limitlesstcg\.com/.*standings'))
        if not labs_link:
            # Try any labs link
            labs_link = soup.find('a', href=re.compile(r'labs\.limitlesstcg\.com'))
            
        if labs_link:
            labs_url = labs_link.get('href')
            if 'standings' not in labs_url:
                labs_url = labs_url.rstrip('/') + '/standings'
            print(f"    Redirecting to Labs: {labs_url}")
            return self.scrape_labs_standings(labs_url, limit_standings)

        standings = []
        # ... rest of existing logic for main site ...
        table = soup.find('table', class_='standings')
        if not table:
            tables = soup.find_all('table')
            for t in tables:
                if 'Rank' in t.text or 'Pos' in t.text:
                    table = t
                    break
            
        if not table:
            print("    ❌ Standings table not found")
            return []

        rows = table.find_all('tr')[1:] # Skip header
        for row in rows[:limit_standings]:
            cols = row.find_all('td')
            if len(cols) < 2: continue
            
            rank = row.get('data-rank') or cols[0].text.strip()
            player = row.get('data-name') or (cols[1].text.strip() if len(cols) > 1 else "")
            country = row.get('data-country') or ""
            deck_name = row.get('data-deck') or ""
            
            if not country and len(cols) > 2:
                flag_img = cols[2].find('img', class_='flag')
                if flag_img: country = flag_img.get('alt', '')

            list_url = ""
            for col in cols[3:]:
                list_link = col.find('a', href=re.compile(r'/decks/list/'))
                if list_link:
                    list_url = self.BASE_URL + list_link.get('href')
                    break
            
            if not deck_name and len(cols) > 3:
                deck_name = cols[3].text.strip()

            standings.append({
                'rank': rank, 'player': player, 'country': country,
                'deck_name': deck_name, 'list_url': list_url
            })
        
        print(f"    Found {len(standings)} standings")
        return standings

    def scrape_labs_standings(self, labs_url, limit=8):
        print(f"    Fetching Labs data from script tag: {labs_url}")
        soup = self.get_soup(labs_url)
        if not soup: return []
        
        standings = []
        
        # Labs sites often embed data in a script tag as JSON
        # Look for the script tag containing the standings data
        scripts = soup.find_all('script')
        data_json = None
        for script in scripts:
            if script.string and '"standings":' in script.string:
                try:
                    # Look for the JSON part starting with "standings": [
                    start_idx = script.string.find('"standings":')
                    if start_idx != -1:
                        # Find the matching closing bracket for the standings array
                        # We'll use a simple approach of finding the end of the script tag's relevant object
                        # This regex looks for the standings array and enough surrounding context to be valid JSON
                        match = re.search(r'\{"standings":\s*\[.*\]\}', script.string[start_idx-1:], re.DOTALL)
                        if not match:
                            # Try searching the whole script content
                            match = re.search(r'\{.*"standings":\s*\[.*\].*\}', script.string, re.DOTALL)
                        
                        if match:
                            json_str = match.group(0)
                            data_json = json.loads(json_str)
                            break
                except Exception as e:
                    print(f"      DEBUG: Script parsing error: {e}")
                    continue
        
        if data_json and 'standings' in data_json:
            labs_data = data_json['standings']
            for entry in labs_data:
                # Some entries might be placeholders or empty
                if not entry.get('name') and not entry.get('player_id'):
                    continue
                    
                player = entry.get('name', 'Unknown')
                rank = str(entry.get('placement', entry.get('rank', 'N/A')))
                deck_name = entry.get('deck_name', '')
                deck_id_str = entry.get('deck_id', '')
                
                # Check for decklist
                list_id = entry.get('list_id') or entry.get('decklist')
                list_url = ""
                # If list_id is an integer (even as string), construct the URL
                if list_id and str(list_id).isdigit() and int(list_id) > 1:
                    list_url = f"{self.BASE_URL}/decks/list/{list_id}"
                
                standings.append({
                    'rank': rank,
                    'player': player,
                    'country': entry.get('country', ''),
                    'deck_name': deck_name or deck_id_str or "Unknown Deck",
                    'list_url': list_url
                })
                
                if len(standings) >= limit:
                    break
        else:
            print("    ❌ Could not extract JSON data from Labs page, falling back to basic parsing")
            # Basic fallback if JSON extraction fails
            rows = soup.find_all('tr')[1:] 
            for row in rows[:limit]:
                cols = row.find_all('td')
                if len(cols) < 2: continue
                rank = cols[0].text.strip()
                player = cols[1].text.strip()
                deck_name = ""
                list_url = ""
                
                # In Labs HTML table:
                # Archetype and List Link are in specific columns
                for col in cols[2:]:
                    # Look for archetype link (usually /0065/decks/...)
                    # Check for links that have 'decks' in them but NOT 'list'
                    archetype_link = col.find('a', href=re.compile(r'/decks/'))
                    if archetype_link and '/list' not in archetype_link.get('href', '') and not deck_name:
                        # Labs often uses images for deck archetypes
                        imgs = archetype_link.find_all('img')
                        if imgs:
                            deck_name = " ".join([img.get('alt', '').capitalize() for img in imgs])
                        
                        if not deck_name:
                            deck_name = archetype_link.get('title') or archetype_link.text.strip()
                    
                    # Look for list link (usually /0065/player/XXXX/decklist)
                    list_link = col.find('a', href=re.compile(r'/decklist|/list/|/decks/list/'))
                    if list_link:
                        href = list_link.get('href')
                        # Handle both relative and absolute URLs
                        if href.startswith('http'):
                            list_url = href
                        elif href.startswith('/'):
                            # For Labs, it's often /{tourney_id}/player/{id}/decklist
                            # We need to construct the absolute URL using the Labs domain
                            # Extract base domain from labs_url
                            domain_match = re.match(r'(https?://[^/]+)', labs_url)
                            if domain_match:
                                list_url = domain_match.group(1) + href
                            else:
                                list_url = self.BASE_URL + href
                
                standings.append({
                    'rank': rank, 'player': player, 'country': "",
                    'deck_name': deck_name or "Unknown Deck", 'list_url': list_url
                })
            
        print(f"    Found {len(standings)} standings on Labs")
        return standings

    def scrape_decklist(self, list_url):
        if not list_url: return None
        print(f"    Scraping decklist: {list_url}...")
        soup = self.get_soup(list_url)
        if not soup: return None

        # Check if it's a Labs decklist (often has "labs" in URL or a specific structure)
        is_labs = "labs.limitlesstcg.com" in list_url
        if is_labs:
            # Look for script tag with decklist data
            # Labs uses data-sveltekit-fetched tags
            scripts = soup.find_all('script', type="application/json")
            for script in scripts:
                if 'data-sveltekit-fetched' in script.attrs and script.string and 'pokemon' in script.string:
                    try:
                        data = json.loads(script.string)
                        # The data is often double-JSON encoded in the 'body' field
                        body_content = data.get('body')
                        if body_content:
                            body_data = json.loads(body_content)
                            deck_data = body_data.get('message')
                            if deck_data and 'pokemon' in deck_data:
                                decklist = {'pokemon': [], 'trainer': [], 'energy': [], 'total_cards': 0}
                                for cat in ['pokemon', 'trainer', 'energy']:
                                    for item in deck_data.get(cat, []):
                                        decklist[cat].append({
                                            'count': item.get('count', 0),
                                            'name': item.get('name', ''),
                                            'set': item.get('set', ''),
                                            'number': item.get('number', '')
                                        })
                                decklist['total_cards'] = sum(c['count'] for cat in ['pokemon', 'trainer', 'energy'] for c in decklist[cat])
                                print(f"      ✅ Extracted {decklist['total_cards']} cards from Labs JSON")
                                return decklist
                    except Exception as e:
                        print(f"      DEBUG: Labs JSON decklist error: {e}")
                        continue

        # Fallback to text parsing (standard for main site)
        decklist = {'pokemon': [], 'trainer': [], 'energy': [], 'total_cards': 0}
        container = soup.find('div', class_='decklist') or soup.find('body')
        text = container.get_text('\n')
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        
        current_category = None
        i = 0
        while i < len(lines):
            line = lines[i]
            if re.match(r'^Pok[ée]mon\s*\(\d+\)', line, re.IGNORECASE):
                current_category = 'pokemon'
                i += 1; continue
            elif re.match(r'^Trainer\s*\(\d+\)', line, re.IGNORECASE):
                current_category = 'trainer'
                i += 1; continue
            elif re.match(r'^Energy\s*\(\d+\)', line, re.IGNORECASE):
                current_category = 'energy'
                i += 1; continue

            if current_category and i + 2 < len(lines):
                count_match = re.match(r'^(\d+)$', line)
                if count_match:
                    count = int(count_match.group(1))
                    name = lines[i + 1]
                    price_line = lines[i + 2]
                    if not re.match(r'^\$|\d+\.\d+', name) and len(name) > 1:
                        price_match = re.search(r'\$([\d\.]+)', price_line)
                        price = float(price_match.group(1)) if price_match else None
                        decklist[current_category].append({'count': count, 'name': name, 'price_usd': price})
                        i += 3; continue
            i += 1
        
        decklist['total_cards'] = sum(c['count'] for cat in ['pokemon', 'trainer', 'energy'] for c in decklist[cat])
        return decklist

    def scrape_decks_catalog(self, max_pages=3):
        print(f"📋 Scraping deck catalog (max {max_pages} pages)...")
        all_decks = []
        for page in range(1, max_pages + 1):
            url = f"{self.BASE_URL}/decks?page={page}"
            print(f"  Fetching page {page}...")
            soup = self.get_soup(url)
            if not soup: break
            
            decks_found = 0
            # Look for deck links
            for link in soup.find_all('a', href=re.compile(r'/decks/\d+')):
                href = link.get('href')
                name = link.text.strip()
                if href and name and href not in [d['url'] for d in all_decks]:
                    all_decks.append({
                        'name': name,
                        'url': self.BASE_URL + href,
                        'deck_id': href.split('/')[-1]
                    })
                    decks_found += 1
            
            print(f"    Found {decks_found} decks")
            if decks_found == 0: break
            time.sleep(1)
            
        return all_decks

    def run(self, num_tournaments=3, top_n=8, scrape_decks=True):
        print("="*70)
        print("🚀 LIMITLESSTCG REQUESTS SCRAPER")
        print("="*70)
        
        results = {
            'scraped_at': datetime.now().isoformat(),
            'tournaments': [],
            'decks_catalog': []
        }

        # 1. Scrape Tournaments
        tournaments = self.scrape_tournaments(limit=num_tournaments)
        for t in tournaments:
            t['standings'] = self.scrape_standings(t['id'], limit_standings=top_n)
            for s in t['standings']:
                if s['list_url']:
                    s['decklist'] = self.scrape_decklist(s['list_url'])
                    time.sleep(0.5)
            results['tournaments'].append(t)
            time.sleep(1)

        # 2. Scrape Decks Catalog
        if scrape_decks:
            results['decks_catalog'] = self.scrape_decks_catalog(max_pages=3)

        # Save results
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f'limitlesstcg_full_update_{timestamp}.json'
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        
        print(f"\n✅ SUCCESS: Full data updated and saved to {filename}")
        print(f"📊 Tournaments: {len(results['tournaments'])} | Decks: {len(results['decks_catalog'])}")
        return filename

if __name__ == "__main__":
    import sys
    n_t = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    n_s = int(sys.argv[2]) if len(sys.argv) > 2 else 8
    
    scraper = LimitlessTCGRequestsScraper()
    scraper.run(num_tournaments=n_t, top_n=n_s)
