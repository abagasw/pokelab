#!/usr/bin/env python3
"""
Cardtell Scrapling Scraper - Use Scrapling Fetcher
"""

import json
import asyncio
import sys
from datetime import datetime
from scrapling.fetchers import Fetcher


async def scrape_batch(start_idx: int, count: int):
    """Scrape dengan Scrapling"""
    
    print(f"\n{'='*70}")
    print(f"🚀 CARDTELL SCRAPLING SCRAPER - {start_idx} to {start_idx + count - 1}")
    print(f"{'='*70}")
    
    with open('cardtell_parsed.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    products = data.get('products', [])
    batch = products[start_idx:start_idx + count]
    
    print(f"Total produk: {len(products)}")
    print(f"Batch ini: {len(batch)} produk")
    print(f"{'='*70}\n")
    
    results = []
    fetcher = Fetcher(auto_match=True)
    
    for i, product in enumerate(batch, start_idx + 1):
        try:
            product_url = product.get('url', '')
            product_name = product.get('name', '')
            
            print(f"[{i}/{len(products)}] {product_name[:45]}...", end=' ', flush=True)
            
            external_link = None
            platform = None
            
            # Fetch halaman dengan Scrapling
            try:
                page = fetcher.get(product_url, stealth=True)
                await asyncio.sleep(2)
                
                # Cari semua link
                links = page.find_all('a')
                for link in links:
                    href = link.attrs.get('href', '')
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
                
                # Kalau tidak ketemu, coba klik
                if not external_link:
                    try:
                        # Cari tombol Beli Sekarang
                        buy_btn = page.find('button', text_contains='Beli') or \
                                 page.find('a', text_contains='Beli') or \
                                 page.find('span', text_contains='Beli')
                        
                        if buy_btn:
                            # Cek href di parent atau element
                            parent = buy_btn.parent
                            if parent and parent.attrs.get('href'):
                                external_link = parent.attrs['href']
                                platform = identify_platform(external_link)
                            else:
                                # Coba ekstrak dari onclick atau data attributes
                                onclick = buy_btn.attrs.get('onclick', '')
                                if onclick:
                                    import re
                                    match = re.search(r'https?://[^\s"\'<>]+', onclick)
                                    if match:
                                        external_link = match.group(0)
                                        platform = identify_platform(external_link)
                    except:
                        pass
                        
            except Exception as e:
                pass
            
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
            
            await asyncio.sleep(2)
            
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
    return 'Unknown'


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 cardtell_scrapling_scraper.py <start_idx> <count>")
        sys.exit(1)
    
    start_idx = int(sys.argv[1])
    count = int(sys.argv[2])
    
    asyncio.run(scrape_batch(start_idx, count))
