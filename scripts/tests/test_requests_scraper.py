import requests
from bs4 import BeautifulSoup
import json
from datetime import datetime
import re

BASE_URL = "https://limitlesstcg.com"

def get_decks(page_num=1):
    url = f"{BASE_URL}/decks?page={page_num}"
    print(f"Fetching {url}...")
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        decks = []
        
        # Look for links that look like /decks/123 or /decks/standard/123
        for link in soup.find_all('a', href=re.compile(r'/decks/')):
            href = link.get('href')
            name = link.text.strip()
            
            if href and '/decks/' in href and name:
                deck_id = href.split('/')[-1]
                if deck_id and deck_id != 'lists':
                    deck_url = BASE_URL + href if not href.startswith('http') else href
                    if deck_url not in [d['url'] for d in decks]:
                        decks.append({
                            'name': name,
                            'url': deck_url,
                            'deck_id': deck_id
                        })
        
        print(f"Found {len(decks)} decks")
        return decks
    except Exception as e:
        print(f"Error: {e}")
        return []

if __name__ == "__main__":
    all_decks = []
    for p in range(1, 3): # Just 2 pages for test
        decks = get_decks(p)
        if not decks:
            break
        all_decks.extend(decks)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f'limitlesstcg_decks_simple_{timestamp}.json'
    with open(filename, 'w') as f:
        json.dump(all_decks, f, indent=2)
    print(f"Saved to {filename}")
