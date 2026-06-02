#!/usr/bin/env python3
"""
LimitlessTCG Deck Scraper menggunakan Scrapling
Scrape semua deck Pokemon TCG beserta detail kartunya
"""

import json
import re
import time
from datetime import datetime
from scrapling.fetchers import Fetcher
from scrapling.defaults import AsyncFetcher
import asyncio


class LimitlessTCGScraper:
    BASE_URL = "https://limitlesstcg.com"
    
    def __init__(self):
        self.fetcher = Fetcher(auto_match=True)
        self.decks = []
        
    def get_deck_list(self, page: int = 1) -> list:
        """Get list of decks dari halaman list"""
        
        url = f"{self.BASE_URL}/decks?page={page}"
        print(f"Fetching deck list page {page}...")
        
        try:
            page_data = self.fetcher.get(url, stealth=True)
            time.sleep(2)
            
            decks = []
            
            # Cari semua link deck
            # Pattern: /decks/{id} atau /decks/{format}/{id}
            deck_links = page_data.find_all('a', href=re.compile(r'/decks/[^/]+/\d+|/decks/\d+'))
            
            for link in deck_links:
                href = link.attrs.get('href', '')
                if href and '/decks/' in href:
                    # Extract deck info
                    deck_url = self.BASE_URL + href if not href.startswith('http') else href
                    
                    # Coba ambil metadata dari parent element
                    parent = link.parent
                    
                    # Extract deck name
                    deck_name = link.text.strip()
                    if not deck_name:
                        title_elem = link.find('h3') or link.find('h2') or link.find('.deck-title')
                        if title_elem:
                            deck_name = title_elem.text.strip()
                    
                    # Extract format, date, player dari parent
                    format_type = self._extract_format(parent) or self._extract_format(link)
                    date = self._extract_date(parent) or self._extract_date(link)
                    player = self._extract_player(parent) or self._extract_player(link)
                    tournament = self._extract_tournament(parent) or self._extract_tournament(link)
                    
                    if deck_name and href not in [d['url'] for d in decks]:
                        decks.append({
                            'name': deck_name,
                            'url': deck_url,
                            'format': format_type,
                            'date': date,
                            'player': player,
                            'tournament': tournament,
                        })
            
            print(f"  Found {len(decks)} decks on page {page}")
            return decks
            
        except Exception as e:
            print(f"  Error fetching page {page}: {e}")
            return []
    
    def _extract_format(self, element) -> str:
        """Extract format dari element"""
        if not element:
            return None
        try:
            text = element.text
            formats = ['Standard', 'Expanded', 'GLC', 'Retro']
            for fmt in formats:
                if fmt.lower() in text.lower():
                    return fmt
        except:
            pass
        return None
    
    def _extract_date(self, element) -> str:
        """Extract date dari element"""
        if not element:
            return None
        try:
            # Cari pattern date
            text = element.text
            # Pattern: 2024-01-15 atau 15/01/2024
            patterns = [
                r'(\d{4}-\d{2}-\d{2})',
                r'(\d{2}/\d{2}/\d{4})',
                r'(\w+ \d{1,2},? \d{4})',
            ]
            for pattern in patterns:
                match = re.search(pattern, text)
                if match:
                    return match.group(1)
        except:
            pass
        return None
    
    def _extract_player(self, element) -> str:
        """Extract player name dari element"""
        if not element:
            return None
        try:
            # Cari class atau text yang mengandung player
            player_elem = element.find('.player') or element.find('[class*="player"]')
            if player_elem:
                return player_elem.text.strip()
        except:
            pass
        return None
    
    def _extract_tournament(self, element) -> str:
        """Extract tournament name dari element"""
        if not element:
            return None
        try:
            tourney_elem = element.find('.tournament') or element.find('[class*="tournament"]')
            if tourney_elem:
                return tourney_elem.text.strip()
        except:
            pass
        return None
    
    def get_deck_detail(self, deck_url: str) -> dict:
        """Get detail deck (list kartu)"""
        
        print(f"  Fetching detail: {deck_url}")
        
        try:
            page = self.fetcher.get(deck_url, stealth=True)
            time.sleep(1.5)
            
            deck_detail = {
                'pokemon': [],
                'trainer': [],
                'energy': [],
                'total_cards': 0
            }
            
            # Cari section kartu
            # Pattern 1: Section dengan header "Pokémon", "Trainer", "Energy"
            sections = page.find_all('section') or page.find_all('div', class_=re.compile(r'deck|list|card'))
            
            for section in sections:
                section_text = section.text.lower()
                
                if 'pokémon' in section_text or 'pokemon' in section_text:
                    cards = self._extract_cards_from_section(section)
                    deck_detail['pokemon'] = cards
                    
                elif 'trainer' in section_text:
                    cards = self._extract_cards_from_section(section)
                    deck_detail['trainer'] = cards
                    
                elif 'energy' in section_text:
                    cards = self._extract_cards_from_section(section)
                    deck_detail['energy'] = cards
            
            # Pattern 2: Cari semua list item yang mengandung kartu
            if not any([deck_detail['pokemon'], deck_detail['trainer'], deck_detail['energy']]):
                all_cards = self._extract_all_cards(page)
                deck_detail = self._categorize_cards(all_cards)
            
            # Hitung total
            total = sum(len(deck_detail['pokemon']), len(deck_detail['trainer']), len(deck_detail['energy']))
            deck_detail['total_cards'] = total
            
            return deck_detail
            
        except Exception as e:
            print(f"    Error fetching detail: {e}")
            return {'pokemon': [], 'trainer': [], 'energy': [], 'total_cards': 0, 'error': str(e)}
    
    def _extract_cards_from_section(self, section) -> list:
        """Extract cards dari section element"""
        cards = []
        
        try:
            # Cari semua list item atau card item
            items = section.find_all('li') or section.find_all('div', class_=re.compile(r'card|item'))
            
            for item in items:
                text = item.text.strip()
                if text:
                    # Pattern: "4 Pikachu ex" atau "1 Boss's Orders"
                    match = re.match(r'(\d+)\s+(.+)', text)
                    if match:
                        count = int(match.group(1))
                        card_name = match.group(2).strip()
                        cards.append({
                            'name': card_name,
                            'count': count
                        })
        except:
            pass
        
        return cards
    
    def _extract_all_cards(self, page) -> list:
        """Extract semua kartu dari page tanpa kategori"""
        cards = []
        
        try:
            # Cari semua text yang match pattern kartu
            all_text = page.text
            lines = all_text.split('\n')
            
            for line in lines:
                line = line.strip()
                # Pattern: "4 Card Name" atau "1-4 Card Name"
                match = re.match(r'(\d+)\s+([A-Za-z][A-Za-z\s\-\']{2,50})', line)
                if match:
                    count = int(match.group(1))
                    card_name = match.group(2).strip()
                    if 1 <= count <= 4:  # Valid card count
                        cards.append({
                            'name': card_name,
                            'count': count
                        })
        except:
            pass
        
        return cards
    
    def _categorize_cards(self, cards: list) -> dict:
        """Kategorikan kartu ke Pokemon/Trainer/Energy"""
        result = {'pokemon': [], 'trainer': [], 'energy': []}
        
        energy_keywords = ['Grass Energy', 'Fire Energy', 'Water Energy', 'Lightning Energy',
                          'Psychic Energy', 'Fighting Energy', 'Darkness Energy', 'Metal Energy',
                          'Fairy Energy', 'Dragon Energy', 'Colorless Energy', 'Basic Energy']
        
        for card in cards:
            name = card['name'].lower()
            
            # Check energy
            if any(energy.lower() in name for energy in energy_keywords) or 'energy' in name:
                result['energy'].append(card)
            # Check trainer (heuristic)
            elif any(keyword in name for keyword in ['boss', 'professor', 'level ball', 'ultra ball', 
                                                      'switch', 'potion', 'candy', 'rod', 'vitality']):
                result['trainer'].append(card)
            else:
                # Default ke pokemon
                result['pokemon'].append(card)
        
        return result
    
    def scrape_all_decks(self, max_pages: int = None) -> list:
        """Scrape semua deck"""
        
        print("="*70)
        print("🚀 LIMITLESSTCG DECK SCRAPER")
        print("="*70)
        
        page = 1
        all_decks = []
        
        while True:
            if max_pages and page > max_pages:
                break
            
            decks = self.get_deck_list(page)
            
            if not decks:
                print(f"  No more decks found on page {page}")
                break
            
            all_decks.extend(decks)
            print(f"  Total decks so far: {len(all_decks)}")
            
            page += 1
            time.sleep(3)  # Rate limiting
        
        print(f"\n📊 Found {len(all_decks)} total decks")
        return all_decks
    
    def scrape_deck_details(self, decks: list, start_idx: int = 0, count: int = None):
        """Scrape detail untuk setiap deck"""
        
        if count:
            decks = decks[start_idx:start_idx + count]
        
        print(f"\n{'='*70}")
        print(f"📋 SCRAPING DECK DETAILS - {len(decks)} decks")
        print(f"{'='*70}\n")
        
        results = []
        
        for i, deck in enumerate(decks, start_idx + 1):
            print(f"[{i}/{start_idx + len(decks)}] {deck.get('name', 'Unknown')[:50]}...")
            
            detail = self.get_deck_detail(deck['url'])
            
            result = {
                **deck,
                'cards': detail
            }
            
            results.append(result)
            
            # Save progress every 10 decks
            if i % 10 == 0:
                self._save_progress(results, start_idx)
            
            time.sleep(2)  # Rate limiting
        
        return results
    
    def _save_progress(self, results: list, start_idx: int):
        """Save progress sementara"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f'limitlesstcg_progress_{start_idx}_{timestamp}.json'
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump({
                'count': len(results),
                'results': results,
                'saved_at': datetime.now().isoformat()
            }, f, indent=2, ensure_ascii=False)
        
        print(f"    💾 Progress saved: {len(results)} decks")
    
    def save_final_results(self, results: list):
        """Save final results"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f'limitlesstcg_decks_{timestamp}.json'
        
        # Hitung statistik
        total_pokemon = sum(len(d['cards'].get('pokemon', [])) for d in results)
        total_trainer = sum(len(d['cards'].get('trainer', [])) for d in results)
        total_energy = sum(len(d['cards'].get('energy', [])) for d in results)
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump({
                'total_decks': len(results),
                'statistics': {
                    'total_pokemon_cards': total_pokemon,
                    'total_trainer_cards': total_trainer,
                    'total_energy_cards': total_energy,
                },
                'decks': results,
                'scraped_at': datetime.now().isoformat()
            }, f, indent=2, ensure_ascii=False)
        
        print(f"\n{'='*70}")
        print(f"✅ FINAL RESULTS SAVED: {filename}")
        print(f"📊 Total Decks: {len(results)}")
        print(f"📊 Total Cards: Pokemon={total_pokemon}, Trainer={total_trainer}, Energy={total_energy}")
        print(f"{'='*70}")


def main():
    """Main function"""
    import sys
    
    scraper = LimitlessTCGScraper()
    
    # Parse args
    mode = sys.argv[1] if len(sys.argv) > 1 else 'list'
    
    if mode == 'list':
        # Scrape list deck saja
        max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else None
        decks = scraper.scrape_all_decks(max_pages)
        
        # Save list
        with open('limitlesstcg_deck_list.json', 'w', encoding='utf-8') as f:
            json.dump({
                'count': len(decks),
                'decks': decks
            }, f, indent=2, ensure_ascii=False)
        
        print(f"✅ Deck list saved: limitlesstcg_deck_list.json ({len(decks)} decks)")
    
    elif mode == 'detail':
        # Scrape detail dari existing list
        start_idx = int(sys.argv[2]) if len(sys.argv) > 2 else 0
        count = int(sys.argv[3]) if len(sys.argv) > 3 else 10
        
        # Load deck list
        with open('limitlesstcg_deck_list.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
            decks = data['decks']
        
        # Scrape detail
        results = scraper.scrape_deck_details(decks, start_idx, count)
        
        # Save
        scraper.save_final_results(results)
    
    elif mode == 'full':
        # Scrape list + detail
        max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else 5
        
        # 1. Scrape list
        decks = scraper.scrape_all_decks(max_pages)
        
        # Save list
        with open('limitlesstcg_deck_list.json', 'w', encoding='utf-8') as f:
            json.dump({
                'count': len(decks),
                'decks': decks
            }, f, indent=2, ensure_ascii=False)
        
        # 2. Scrape detail (batch pertama saja untuk demo)
        results = scraper.scrape_deck_details(decks, 0, min(20, len(decks)))
        
        # Save final
        scraper.save_final_results(results)


if __name__ == "__main__":
    main()
