#!/usr/bin/env python3
"""
Cardtell Click Scraper
Buka setiap produk, klik "Beli Sekarang", dan ambil URL hasil
"""

import json
import asyncio
from datetime import datetime
from playwright.async_api import async_playwright


async def scrape_cardtell_clicks(max_products: int = 50):
    """
    Buka setiap produk Cardtell, klik Beli Sekarang, ambil URL
    """
    print("="*70)
    print("🖱️  CARDTELL CLICK SCRAPER")
    print("="*70)
    
    # Load data yang sudah di-parse
    with open('cardtell_parsed.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    products = data.get('products', [])
    print(f"Total produk di file: {len(products)}")
    print(f"Will process: {min(max_products, len(products))} products")
    print()
    
    results = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            locale='id-ID'
        )
        page = await context.new_page()
        
        for i, product in enumerate(products[:max_products], 1):
            try:
                product_url = product.get('url', '')
                product_name = product.get('name', '')
                
                print(f"\n[{i}/{min(max_products, len(products))}] {product_name[:40]}")
                print(f"   URL: {product_url[:60]}...")
                
                # Buka halaman produk
                await page.goto(product_url, wait_until='domcontentloaded', timeout=30000)
                await page.wait_for_timeout(3000)
                
                # Cari tombol "Beli Sekarang"
                buy_button_selectors = [
                    'button:has-text("Beli Sekarang")',
                    'a:has-text("Beli Sekarang")',
                    '[class*="buy"]:has-text("Beli")',
                    'button:has-text("Buy Now")',
                    'text=Beli Sekarang',
                ]
                
                button_found = False
                clicked_url = None
                
                for selector in buy_button_selectors:
                    try:
                        # Cek apakah tombol ada
                        button = await page.query_selector(selector)
                        if button:
                            print(f"   ✅ Found button: {selector}")
                            
                            # Tunggu navigasi baru
                            async with page.expect_navigation(timeout=10000) as navigation:
                                await button.click()
                            
                            # Ambil URL baru setelah klik
                            await navigation
                            clicked_url = page.url
                            print(f"   🌐 Navigated to: {clicked_url[:80]}...")
                            button_found = True
                            break
                            
                    except Exception as e:
                        print(f"   ⚠️  Selector {selector} failed: {e}")
                        continue
                
                if not button_found:
                    # Coba cari dengan JavaScript
                    try:
                        print("   🔍 Trying JavaScript click...")
                        
                        # Cari semua button/link yang mengandung "Beli"
                        result = await page.evaluate('''() => {
                            const elements = document.querySelectorAll('button, a');
                            for (let el of elements) {
                                if (el.textContent.includes('Beli Sekarang') || 
                                    el.textContent.includes('Beli')) {
                                    return {
                                        found: true,
                                        text: el.textContent.trim(),
                                        tag: el.tagName
                                    };
                                }
                            }
                            return { found: false };
                        }''')
                        
                        if result.get('found'):
                            print(f"   ✅ Found via JS: {result.get('text')}")
                            
                            # Coba klik dengan JS
                            clicked_url = await page.evaluate('''() => {
                                const elements = document.querySelectorAll('button, a');
                                for (let el of elements) {
                                    if (el.textContent.includes('Beli Sekarang')) {
                                        el.click();
                                        return window.location.href;
                                    }
                                }
                                return null;
                            }''')
                            
                            await page.wait_for_timeout(2000)
                            clicked_url = page.url
                            
                        else:
                            print("   ❌ No Beli Sekarang button found")
                            clicked_url = None
                            
                    except Exception as e:
                        print(f"   ❌ JS click failed: {e}")
                        clicked_url = None
                
                # Simpan hasil
                result_data = {
                    "name": product_name,
                    "original_url": product_url,
                    "buy_now_url": clicked_url,
                    "prices": product.get('prices', []),
                    "set_info": product.get('set_info', ''),
                    "seller": product.get('seller', ''),
                }
                
                results.append(result_data)
                
                if clicked_url:
                    print(f"   ✅ Success: {clicked_url[:60]}...")
                else:
                    print(f"   ⚠️  No redirect URL captured")
                
            except Exception as e:
                print(f"   ❌ Error: {e}")
                results.append({
                    "name": product.get('name', ''),
                    "original_url": product_url,
                    "buy_now_url": None,
                    "error": str(e)
                })
        
        await context.close()
        await browser.close()
    
    # Simpan hasil
    print("\n" + "="*70)
    print("💾 SAVING RESULTS")
    print("="*70)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # JSON
    output = {
        "source": "Cardtell.id - Click Scraping",
        "scraped_at": datetime.now().isoformat(),
        "total_processed": len(results),
        "results": results
    }
    
    json_file = f"cardtell_click_results_{timestamp}.json"
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"✅ JSON: {json_file}")
    
    # CSV
    import csv
    csv_file = f"cardtell_click_results_{timestamp}.csv"
    
    with open(csv_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['Name', 'Set Info', 'Prices', 'Original URL', 'Buy Now URL', 'Seller'])
        
        for r in results:
            writer.writerow([
                r.get('name', ''),
                r.get('set_info', ''),
                ', '.join(r.get('prices', [])),
                r.get('original_url', ''),
                r.get('buy_now_url', ''),
                r.get('seller', '')
            ])
    
    print(f"📄 CSV: {csv_file}")
    
    # Statistics
    success_count = sum(1 for r in results if r.get('buy_now_url'))
    print(f"\n📊 Statistics:")
    print(f"   Total: {len(results)}")
    print(f"   Success: {success_count}")
    print(f"   Failed: {len(results) - success_count}")


if __name__ == "__main__":
    asyncio.run(scrape_cardtell_clicks(max_products=30))
