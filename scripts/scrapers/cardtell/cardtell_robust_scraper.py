#!/usr/bin/env python3
"""
Cardtell Robust Scraper - Skip yang error/redirect problem
"""

import json
import asyncio
import sys
from datetime import datetime
from playwright.async_api import async_playwright


async def scrape_batch(start_idx: int, count: int):
    """Scrape batch dengan robust error handling"""
    
    print(f"\n{'='*70}")
    print(f"🚀 CARDTELL ROBUST SCRAPER - {start_idx} to {start_idx + count - 1}")
    print(f"{'='*70}")
    
    with open('cardtell_parsed.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    products = data.get('products', [])
    batch = products[start_idx:start_idx + count]
    
    print(f"Total produk: {len(products)}")
    print(f"Batch ini: {len(batch)} produk")
    print(f"{'='*70}\n")
    
    results = []
    skipped = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=['--disable-blink-features=AutomationControlled']
        )
        
        for i, product in enumerate(batch, start_idx + 1):
            try:
                product_url = product.get('url', '')
                product_name = product.get('name', '')
                
                print(f"[{i}/{len(products)}] {product_name[:45]}...", end=' ', flush=True)
                
                context = await browser.new_context()
                page = await context.new_page()
                
                external_link = None
                platform = 'none'
                
                # Buka halaman dengan timeout lebih pendek
                try:
                    await page.goto(product_url, wait_until='domcontentloaded', timeout=30000)
                    await asyncio.sleep(2)
                except Exception as e:
                    print(f"⏭️  Skip (load timeout)")
                    skipped.append({'index': i, 'name': product_name, 'reason': 'load_timeout'})
                    await context.close()
                    results.append(create_result(product, None, 'skipped'))
                    continue
                
                # METHOD 1: Cari link di HTML
                try:
                    links = await page.query_selector_all('a')
                    for link in links:
                        href = await link.get_attribute('href')
                        if href:
                            href_lower = href.lower()
                            if any(x in href_lower for x in ['tokopedia.com', 'shopee', 'facebook.com', 'wa.me', 'whatsapp']):
                                external_link = href
                                platform = identify_platform(href)
                                break
                except:
                    pass
                
                # METHOD 2: Klik tombol dengan timeout pendek
                if not external_link:
                    try:
                        # Klik dengan JS
                        clicked = await page.evaluate('''() => {
                            const buttons = Array.from(document.querySelectorAll('button, a, span'));
                            for (const btn of buttons) {
                                if (btn.textContent.includes('Beli Sekarang') || 
                                    btn.textContent.includes('Beli')) {
                                    btn.click();
                                    return true;
                                }
                            }
                            return false;
                        }''')
                        
                        if clicked:
                            # Tunggu max 5 detik untuk redirect
                            await asyncio.sleep(3)
                            
                            # Cek URL
                            current_url = page.url
                            
                            # Kalau error atau masih di cardtell, skip
                            if current_url.startswith('chrome-error'):
                                print(f"⏭️  Skip (chrome error)")
                                skipped.append({'index': i, 'name': product_name, 'reason': 'chrome_error'})
                                await context.close()
                                results.append(create_result(product, None, 'skipped'))
                                continue
                            
                            if 'cardtell.id' not in current_url:
                                external_link = current_url
                                platform = identify_platform(current_url)
                    except Exception as e:
                        pass
                
                await context.close()
                
                if external_link:
                    print(f"✅ {platform}")
                else:
                    print(f"❌ No link")
                
                results.append(create_result(product, external_link, platform))
                await asyncio.sleep(1)
                
            except Exception as e:
                print(f"⏭️  Skip (error: {str(e)[:30]})")
                skipped.append({'index': i, 'name': product.get('name'), 'reason': str(e)[:50]})
                results.append(create_result(product, None, 'error'))
        
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
            'success': len([r for r in results if r.get('external_link')]),
            'skipped': len(skipped),
            'results': results,
            'skipped_items': skipped,
            'scraped_at': datetime.now().isoformat()
        }, f, indent=2, ensure_ascii=False)
    
    success_count = len([r for r in results if r.get('external_link') and r.get('platform') not in ['none', 'skipped', 'error']])
    
    print(f"\n{'='*70}")
    print(f"✅ Batch {batch_num} selesai!")
    print(f"📁 Saved: {filename}")
    print(f"📊 Success: {success_count}/{len(results)} | Skipped: {len(skipped)}")
    print(f"{'='*70}")
    
    return results


def create_result(product, external_link, platform):
    """Create result dict"""
    return {
        'id': product.get('id'),
        'name': product.get('name', ''),
        'cardtell_url': product.get('url', ''),
        'external_link': external_link,
        'platform': platform,
        'set': product.get('set'),
        'set_code': product.get('set_code'),
        'card_number': product.get('card_number'),
        'prices': product.get('prices', [])
    }


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
        print("Usage: python3 cardtell_robust_scraper.py <start_idx> <count>")
        print("Example: python3 cardtell_robust_scraper.py 0 50")
        sys.exit(1)
    
    start_idx = int(sys.argv[1])
    count = int(sys.argv[2])
    
    asyncio.run(scrape_batch(start_idx, count))
