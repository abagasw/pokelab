#!/usr/bin/env python3
"""
LimitlessTCG Tournaments & Decklists Scraper
Scrape tournaments and decklists pages
"""

import json
import asyncio
import re
from datetime import datetime
from playwright.async_api import async_playwright


class LimitlessTCGTournamentsScraper:
    BASE_URL = "https://limitlesstcg.com"
    
    def __init__(self):
        self.tournaments = []
        self.decklists = []
    
    # ==================== DECKLISTS PAGE ====================
    
    async def scrape_decklists_page(self, page) -> list:
        """Scrape /decks/lists page"""
        
        print("\n📋 Scraping Decklists Page...")
        url = f"{self.BASE_URL}/decks/lists"
        
        try:
            await page.goto(url, wait_until='networkidle', timeout=60000)
            await asyncio.sleep(3)
            
            # Find all decklist entries
            decklist_data = []
            
            # Get all rows/items
            items = await page.query_selector_all('a[href*="/decks/list/"]')
            
            for item in items:
                try:
                    href = await item.get_attribute('href')
                    text = await item.text_content()
                    
                    if href and '/decks/list/' in href:
                        list_id = href.split('/')[-1]
                        
                        # Try to get parent row for more info
                        parent = await item.evaluate('el => el.closest("tr, div, li")')
                        
                        decklist_data.append({
                            'list_id': list_id,
                            'url': self.BASE_URL + href if not href.startswith('http') else href,
                            'description': text.strip() if text else '',
                        })
                except:
                    continue
            
            # Remove duplicates
            seen = set()
            unique = []
            for d in decklist_data:
                if d['list_id'] not in seen:
                    seen.add(d['list_id'])
                    unique.append(d)
            
            print(f"  Found {len(unique)} decklists")
            return unique
            
        except Exception as e:
            print(f"  Error: {e}")
            return []
    
    # ==================== TOURNAMENTS PAGE ====================
    
    async def scrape_tournaments_list(self, page) -> list:
        """Scrape /tournaments page"""
        
        print("\n📋 Scraping Tournaments List...")
        url = f"{self.BASE_URL}/tournaments"
        
        try:
            await page.goto(url, wait_until='networkidle', timeout=60000)
            await asyncio.sleep(3)
            
            tournaments = []
            
            # Find tournament links
            links = await page.query_selector_all('a[href*="/tournaments/"]')
            
            for link in links:
                try:
                    href = await link.get_attribute('href')
                    text = await link.text_content()
                    
                    if href and '/tournaments/' in href:
                        tourney_id = href.split('/')[-1]
                        if tourney_id and tourney_id.isdigit():
                            tournaments.append({
                                'tournament_id': tourney_id,
                                'name': text.strip() if text else '',
                                'url': self.BASE_URL + href if not href.startswith('http') else href
                            })
                except:
                    continue
            
            # Remove duplicates
            seen = set()
            unique = []
            for t in tournaments:
                if t['tournament_id'] not in seen:
                    seen.add(t['tournament_id'])
                    unique.append(t)
            
            print(f"  Found {len(unique)} tournaments")
            return unique
            
        except Exception as e:
            print(f"  Error: {e}")
            return []
    
    async def scrape_tournament_detail(self, page, tournament_id: str) -> dict:
        """Scrape tournament detail with standings"""
        
        url = f"{self.BASE_URL}/tournaments/{tournament_id}"
        print(f"  Fetching: {url}")
        
        try:
            await page.goto(url, wait_until='networkidle', timeout=60000)
            await asyncio.sleep(3)
            
            # Get tournament info
            title = await page.title()
            
            # Get date, players, format from page
            info = await self._extract_tournament_info(page)
            
            # Get standings
            standings = await self._extract_standings(page)
            
            return {
                'tournament_id': tournament_id,
                'title': title.replace(' – Limitless', ''),
                'date': info.get('date'),
                'players': info.get('players'),
                'format': info.get('format'),
                'standings': standings
            }
            
        except Exception as e:
            print(f"    Error: {e}")
            return None
    
    async def _extract_tournament_info(self, page) -> dict:
        """Extract tournament metadata"""
        
        info = {}
        
        try:
            body = await page.query_selector('body')
            text = await body.text_content()
            
            # Extract date (pattern: 21st March 2026)
            date_match = re.search(r'(\d{1,2}(?:st|nd|rd|th)\s+[A-Za-z]+\s+\d{4})', text)
            if date_match:
                info['date'] = date_match.group(1)
            
            # Extract player count
            players_match = re.search(r'(\d{1,4})\s*Players', text)
            if players_match:
                info['players'] = int(players_match.group(1))
            
            # Extract format
            if 'Scarlet & Violet' in text:
                info['format'] = 'Standard (Scarlet & Violet)'
            elif 'Sword & Shield' in text:
                info['format'] = 'Standard (Sword & Shield)'
            
        except:
            pass
        
        return info
    
    async def _extract_standings(self, page) -> list:
        """Extract tournament standings"""
        
        standings = []
        
        try:
            rows = await page.query_selector_all('table tbody tr')
            
            for row in rows:
                try:
                    cells = await row.query_selector_all('td')
                    if len(cells) >= 5:
                        rank = await cells[0].inner_text()
                        
                        # Player
                        player_cell = cells[1]
                        player_link = await player_cell.query_selector('a')
                        player_name = await player_link.inner_text() if player_link else await player_cell.inner_text()
                        
                        # Country (from img alt)
                        country_cell = cells[2]
                        country_img = await country_cell.query_selector('img')
                        country = await country_img.get_attribute('alt') if country_img else ''
                        
                        # Deck (from tooltip)
                        deck_cell = cells[3]
                        deck_span = await deck_cell.query_selector('span[data-tooltip]')
                        deck_name = await deck_span.get_attribute('data-tooltip') if deck_span else ''
                        
                        deck_link = await deck_cell.query_selector('a')
                        deck_url = await deck_link.get_attribute('href') if deck_link else ''
                        
                        # List link
                        list_cell = cells[4]
                        list_link = await list_cell.query_selector('a')
                        list_url = await list_link.get_attribute('href') if list_link else ''
                        
                        standings.append({
                            'rank': rank.strip(),
                            'player': player_name.strip(),
                            'country': country.strip(),
                            'deck_name': deck_name.strip(),
                            'deck_url': deck_url,
                            'list_url': list_url
                        })
                except:
                    continue
                    
        except:
            pass
        
        return standings
    
    # ==================== DECKLIST DETAIL ====================
    
    async def scrape_decklist_detail(self, page, list_id: str) -> dict:
        """Scrape single decklist"""
        
        url = f"{self.BASE_URL}/decks/list/{list_id}"
        
        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)
            await asyncio.sleep(2)
            
            body = await page.query_selector('body')
            text = await body.text_content()
            lines = [l.strip() for l in text.split('\n') if l.strip()]
            
            return self._parse_decklist(lines)
            
        except:
            return None
    
    def _parse_decklist(self, lines: list) -> dict:
        """Parse decklist from text lines"""
        
        decklist = {'pokemon': [], 'trainer': [], 'energy': [], 'total_cards': 0}
        current_category = None
        i = 0
        
        while i < len(lines):
            line = lines[i]
            
            if re.match(r'^Pok[ée]mon\s*\(\d+\)', line, re.IGNORECASE):
                current_category = 'pokemon'
                i += 1
                continue
            elif re.match(r'^Trainer\s*\(\d+\)', line, re.IGNORECASE):
                current_category = 'trainer'
                i += 1
                continue
            elif re.match(r'^Energy\s*\(\d+\)', line, re.IGNORECASE):
                current_category = 'energy'
                i += 1
                continue
            
            if current_category and i + 2 < len(lines):
                count_match = re.match(r'^(\d+)$', line)
                if count_match:
                    count = int(count_match.group(1))
                    name = lines[i + 1]
                    price_line = lines[i + 2]
                    
                    if not re.match(r'^\$|\d+\.\d+', name) and len(name) > 1:
                        price_match = re.search(r'\$([\d\.]+)', price_line)
                        price = float(price_match.group(1)) if price_match else None
                        
                        decklist[current_category].append({
                            'count': count,
                            'name': name,
                            'price_usd': price
                        })
                        i += 3
                        continue
            
            i += 1
        
        decklist['total_cards'] = (
            sum(c['count'] for c in decklist['pokemon']) +
            sum(c['count'] for c in decklist['trainer']) +
            sum(c['count'] for c in decklist['energy'])
        )
        
        return decklist
    
    # ==================== MAIN RUN ====================
    
    async def run(self, max_tournaments: int = 5, max_decklists: int = 10):
        """Run full scrape"""
        
        print("="*70)
        print("🚀 LIMITLESSTCG TOURNAMENTS & DECKLISTS SCRAPER")
        print("="*70)
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()
            
            # 1. Scrape Decklists page
            decklists = await self.scrape_decklists_page(page)
            self.decklists = decklists[:max_decklists]
            
            # Scrape detail for each decklist
            print(f"\n📋 Scraping {len(self.decklists)} decklist details...")
            for i, dl in enumerate(self.decklists, 1):
                print(f"  [{i}/{len(self.decklists)}] List {dl['list_id']}")
                detail = await self.scrape_decklist_detail(page, dl['list_id'])
                if detail:
                    dl['cards'] = detail
                    print(f"    ✅ {detail['total_cards']} cards")
                else:
                    print(f"    ❌ Failed")
                await asyncio.sleep(1.5)
            
            # 2. Scrape Tournaments
            tournaments = await self.scrape_tournaments_list(page)
            
            print(f"\n📋 Scraping {min(max_tournaments, len(tournaments))} tournament details...")
            for i, tourney in enumerate(tournaments[:max_tournaments], 1):
                print(f"\n[{i}/{min(max_tournaments, len(tournaments))}] {tourney['name']}")
                detail = await self.scrape_tournament_detail(page, tourney['tournament_id'])
                if detail:
                    self.tournaments.append(detail)
                    print(f"  ✅ {len(detail['standings'])} standings")
                else:
                    print(f"  ❌ Failed")
                await asyncio.sleep(2)
            
            await browser.close()
        
        self._save_results()
    
    def _save_results(self):
        """Save all results"""
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Save decklists
        dl_file = f'limitlesstcg_decklists_page_{timestamp}.json'
        with open(dl_file, 'w', encoding='utf-8') as f:
            json.dump({
                'count': len(self.decklists),
                'decklists': self.decklists
            }, f, indent=2, ensure_ascii=False)
        
        print(f"\n✅ Decklists saved: {dl_file}")
        
        # Save tournaments
        tourney_file = f'limitlesstcg_tournaments_{timestamp}.json'
        with open(tourney_file, 'w', encoding='utf-8') as f:
            json.dump({
                'count': len(self.tournaments),
                'total_standings': sum(len(t['standings']) for t in self.tournaments),
                'tournaments': self.tournaments
            }, f, indent=2, ensure_ascii=False)
        
        print(f"✅ Tournaments saved: {tourney_file}")
        
        # Summary
        print(f"\n{'='*70}")
        print(f"📊 SUMMARY")
        print(f"{'='*70}")
        print(f"Decklists: {len(self.decklists)}")
        print(f"Tournaments: {len(self.tournaments)}")
        print(f"Total Standings: {sum(len(t['standings']) for t in self.tournaments)}")
        print(f"{'='*70}")


if __name__ == "__main__":
    import sys
    
    max_tournaments = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    max_decklists = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    
    scraper = LimitlessTCGTournamentsScraper()
    asyncio.run(scraper.run(max_tournaments, max_decklists))
