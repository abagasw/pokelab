#!/usr/bin/env python3
"""
Cardtell Simple Scraper - Fetch URL directly from HTML
Tanpa klik, cuma parse HTML untuk cari link
"""

import json
import asyncio
import sys
import re
from datetime import datetime
from playwright.async_api import async_playwright


async def scrape_batch(start_idx: int, count: int):
    """Scrape batch dengan parse HTML saja"""
    
    print(f"\n{'='*70}")
    print(f"🚀 CARDTELL SIMPLE SCRAPER - {start_idx} to {start_idx + count - 1}")
    print(f"{'='*70}")
    
    with open('cardtell_parsed.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    products = data.get('products', [])
    batch = products[start_idx:start_idx + count]
    
    print(f"Total produk: {len(products)}")
    print(f"Batch ini: {len(batch)} produk")
    print(f"{'='*70}\n")
    
    results = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        
        for i, product in enumerate(batch, start_idx + 1):
            try:
                product_url = product.get('url', '')
                product_name = product.get('name', '')
                
                print(f"[{i}/{len(products)}] {product_name[:45]}...", end=' ', flush=True)
                
                page = await context.new_page()
                
                # Navigate dan tunggu sebentar
                await page.goto(product_url, wait_until='networkidle', timeout=30000)
                await page.wait_for_timeout(2000)
                
                external_link = None
                platform = None
                
                # METHOD: Parse HTML content
                html_content = await page.content()
                
                # Pattern untuk cari URL marketplace
                patterns = [
                    # Tokopedia
                    r'href="(https://www\.tokopedia\.com/[^"]+)"',
                    r'href="(https://tokopedia\.com/[^"]+)"',
                    r'data-url="(https://www\.tokopedia\.com/[^"]+)"',
                    r'url["\']?\s*[:=]\s*["\'](https://www\.tokopedia\.com/[^"\']+)',
                    
                    # Facebook
                    r'href="(https://www\.facebook\.com/[^"]+)"',
                    r'href="(https://fb\.me/[^"]+)"',
                    
                    # WhatsApp
                    r'href="(https://wa\.me/[^"]+)"',
                    r'href="(https://api\.whatsapp\.com/[^"]+)"',
                    
                    # Shopee
                    r'href="(https://shopee\.co\.id/[^"]+)"',
                ]
                
                for pattern in patterns:
                    matches = re.findall(pattern, html_content)
                    if matches:
                        external_link = matches[0]
                        platform = identify_platform(external_link)
                        break
                
                # Kalau tidak ketemu, coba cari semua link dengan kata kunci
                if not external_link:
                    all_links = await page.query_selector_all('a')
                    for link in all_links:
                        href = await link.get_attribute('href')
                        if href:
                            href_lower = href.lower()
                            if any(x in href_lower for x in ['tokopedia', 'shopee', 'facebook', 'wa.me', 'whatsapp']):
                                external_link = href
                                platform = identify_platform(href)
                                break
                
                await page.close()
                
                if external_link:
                    print(f"✅ {platform}")
                else:
                    print(f"❌ No link")
                    platform = 'none'
                
                results.append({
                    'id': product.get('id'),
                    'name': product_name,
                    'cardtell_url': product_url,
                    'external_link': external_link,
                    'platform': platform,
                    'set': product.get('set'),
                    'set_code': product.get('set_code'),
                    'card_number': product.get('card_number'),
                    'prices': product.get('prices', [])
                })
                
                await asyncio.sleep(1)
                
            except Exception as e:
                print(f"❌ Error: {str(e)[:40]}")
                results.append({
                    'id': product.get('id'),
                    'name': product.get('name', ''),
                    'cardtell_url': product.get('url', ''),
                    'external_link': None,
                    'platform': 'error',
                    'set': product.get('set'),
                    'set_code': product.get('set_code'),
                    'card_number': product.get('card_number'),
                    'prices': product.get('prices', [])
                })
        
        await context.close()
        await browser.close()
    
    # Simpan hasil
    batch_num = start_idx // count + 1
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f'cardtell_batch_{batch_num}_{timestamp}.json'
    
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump({
            'batch': batch_num,
            'start_index': start_idx,
            'count': len(results),
            'results': results,
            'scraped_at': datetime.now().isoformat()
        }, f, indent=2, ensure_ascii=False)
    
    success_count = len([r for r in results if r.get('external_link') and r.get('platform') != 'none'])
    
    print(f"\n{'='*70}")
    print(f"✅ Batch {batch_num} selesai!")
    print(f"📁 Saved: {filename}")
    print(f"📊 Success: {success_count}/{len(results)}")
    print(f"{'='*70}")
    
    return results


def identify_platform(url):
    if not url:
        return 'none'
    url_lower = url.lower()
    if 'tokopedia.com' in url_lower:
        return 'Tokopedia'
    elif 'shopee' in url_lower:
        return 'Shopee'
    elif 'facebook.com' in url_lower or 'fb.me' in url_lower:
        return 'Facebook'
    elif 'wa.me' in url_lower or 'whatsapp' in url_lower:
        return 'WhatsApp'
    elif 'instagram.com' in url_lower:
        return 'Instagram'
    return 'Unknown'


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 cardtell_simple_scraper.py <start_idx> <count>")
        print("Example: python3 cardtell_simple_scraper.py 0 50")
        sys.exit(1)
    
    start_idx = int(sys.argv[1])
    count = int(sys.argv[2])
    
    asyncio.run(scrape_batch(start_idx, count))
