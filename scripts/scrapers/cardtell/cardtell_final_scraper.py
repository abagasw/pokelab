#!/usr/bin/env python3
"""
Cardtell Final Scraper - Batch Processing
Scrape 679 produk dengan Playwright
"""

import json
import asyncio
import sys
from datetime import datetime
from playwright.async_api import async_playwright


async def scrape_batch(start_idx: int, count: int):
    """Scrape batch produk"""
    
    print(f"\n{'='*70}")
    print(f"🚀 CARDTELL BATCH SCRAPER - {start_idx} to {start_idx + count - 1}")
    print(f"{'='*70}")
    
    # Load data
    with open('cardtell_parsed.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    products = data.get('products', [])
    batch = products[start_idx:start_idx + count]
    
    print(f"Total produk: {len(products)}")
    print(f"Batch ini: {len(batch)} produk (index {start_idx}-{start_idx + len(batch) - 1})")
    print(f"{'='*70}\n")
    
    results = []
    errors = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,  # Silent mode
            args=['--disable-blink-features=AutomationControlled']
        )
        
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        )
        
        page = await context.new_page()
        
        for i, product in enumerate(batch, start_idx + 1):
            try:
                product_url = product.get('url', '')
                product_name = product.get('name', '')
                
                print(f"[{i}/{len(products)}] {product_name[:50]}...", end=' ')
                
                # Buka halaman
                await page.goto(product_url, wait_until='networkidle', timeout=60000)
                await page.wait_for_timeout(3000)  # Tunggu 3 detik
                
                external_link = None
                platform = None
                
                # METHOD 1: Cari link langsung di DOM
                links = await page.query_selector_all('a')
                for link in links:
                    try:
                        href = await link.get_attribute('href')
                        if href:
                            href_lower = href.lower()
                            if 'tokopedia.com' in href_lower:
                                external_link = href
                                platform = 'Tokopedia'
                                break
                            elif 'shopee' in href_lower:
                                external_link = href
                                platform = 'Shopee'
                                break
                            elif 'facebook.com' in href_lower or 'fb.me' in href_lower:
                                external_link = href
                                platform = 'Facebook'
                                break
                            elif 'wa.me' in href_lower or 'whatsapp' in href_lower:
                                external_link = href
                                platform = 'WhatsApp'
                                break
                    except:
                        continue
                
                # METHOD 2: Klik tombol dan capture redirect
                if not external_link:
                    button_selectors = ['text=Beli Sekarang', 'text=Beli', 'text=Hubungi Penjual']
                    
                    for selector in button_selectors:
                        try:
                            element = await page.query_selector(selector)
                            if element:
                                await element.click()
                                await page.wait_for_timeout(3000)
                                
                                # Cek current URL
                                current_url = page.url
                                if 'cardtell.id' not in current_url and current_url != product_url:
                                    external_link = current_url
                                    platform = identify_platform(external_link)
                                    # Kembali ke halaman produk
                                    await page.goto(product_url)
                                    break
                        except:
                            continue
                
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
                
                await asyncio.sleep(2)  # Delay antar request
                
            except Exception as e:
                print(f"❌ Error: {str(e)[:50]}")
                errors.append({'index': i, 'name': product.get('name'), 'error': str(e)})
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
            'errors': errors,
            'scraped_at': datetime.now().isoformat()
        }, f, indent=2, ensure_ascii=False)
    
    print(f"\n{'='*70}")
    print(f"✅ Batch {batch_num} selesai!")
    print(f"📁 Saved: {filename}")
    print(f"📊 Sukses: {len([r for r in results if r.get('external_link')])}/{len(results)}")
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
        print("Usage: python3 cardtell_final_scraper.py <start_idx> <count>")
        print("Example: python3 cardtell_final_scraper.py 0 50")
        sys.exit(1)
    
    start_idx = int(sys.argv[1])
    count = int(sys.argv[2])
    
    asyncio.run(scrape_batch(start_idx, count))
