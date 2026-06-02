#!/usr/bin/env python3
"""
Cardtell Scraper using Scrapling Fetcher
"""

import json
import re
from datetime import datetime
from scrapling import Fetcher

fetcher = Fetcher()

print("="*70)
print("🇮🇩 CARDTELL.ID - FETCHER SCRAPER")
print("="*70)

print("\n📥 Fetching homepage...")

try:
    page = fetcher.get('https://cardtell.id/', timeout=30)
    print(f"Status: {page.status}")
    
    # Find all product links
    links = page.css('a[href*="/products/"]')
    print(f"Found {len(links)} links")
    
    unique_urls = []
    seen = set()
    
    for link in links:
        href = link.attrib.get('href', '')
        if href and href not in seen:
            seen.add(href)
            text = link.text.strip() if link.text else ''
            unique_urls.append({'url': href, 'text': text})
    
    print(f"Unique products: {len(unique_urls)}\n")
    
    # Scrape each product
    products = []
    
    for i, prod in enumerate(unique_urls[:20], 1):
        try:
            full_url = f"https://cardtell.id{prod['url']}" if prod['url'].startswith('/') else prod['url']
            print(f"[{i}/{len(unique_urls)}] {full_url[:50]}...")
            
            prod_page = fetcher.get(full_url, timeout=20)
            
            # Get title
            title_elem = prod_page.css('title')
            title = title_elem[0].text if title_elem else ''
            title = title.replace(' — CARDTELL', '')
            
            # Get h1
            h1_elem = prod_page.css('h1')
            h1 = h1_elem[0].text if h1_elem else ''
            
            # Get all text
            text = prod_page.get_all_text()
            
            # Find prices
            prices = re.findall(r'Rp[\s\d.,]+', text)
            unique_prices = list(dict.fromkeys(prices))[:3]
            
            # Find set
            set_match = re.search(r'(Evolusi Mega|Ledakan Peniada|Kobaran Biru|Impian EX)[^\n]{0,30}', text)
            set_name = set_match.group(0) if set_match else ''
            
            # Find card number
            number_match = re.search(r'(\d{1,3})[/\\/](\d{1,3})', text)
            card_number = number_match.group(0) if number_match else ''
            
            product_data = {
                "title": h1 or title,
                "set_name": set_name,
                "card_number": card_number,
                "prices": unique_prices,
                "url": full_url
            }
            
            products.append(product_data)
            
            if unique_prices:
                print(f"   ✅ {product_data['title'][:40]} - {unique_prices[0]}")
            else:
                print(f"   📄 {product_data['title'][:40]}")
            
        except Exception as e:
            print(f"   ❌ Error: {e}")
    
    # Save results
    import os
    os.makedirs("cardtell_output", exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    json_file = f"cardtell_output/cardtell_fetcher_{timestamp}.json"
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump({
            "source": "Cardtell.id",
            "scraped_at": datetime.now().isoformat(),
            "total": len(products),
            "products": products
        }, f, indent=2, ensure_ascii=False)
    
    print(f"\n💾 Saved: {json_file}")
    print(f"Total products: {len(products)}")
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
