#!/usr/bin/env python3
"""
Cardtell Scraper - Intercept API calls
"""

import json
import asyncio
from datetime import datetime
from playwright.async_api import async_playwright


async def scrape_cardtell_api():
    print("="*70)
    print("🇮🇩 CARDTELL.ID - API INTERCEPT SCRAPER")
    print("="*70)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            locale='id-ID'
        )
        
        # Store API responses
        api_data = []
        
        async def handle_route(route, request):
            url = request.url
            
            # Intercept API calls
            if 'api' in url or 'card' in url or 'product' in url:
                try:
                    response = await route.fetch()
                    body = await response.text()
                    
                    try:
                        data = json.loads(body)
                        api_data.append({
                            'url': url,
                            'data': data
                        })
                        print(f"🌐 API: {url[:80]}")
                    except:
                        pass
                except:
                    pass
            
            await route.continue_()
        
        page = await context.new_page()
        await page.route("**/*", handle_route)
        
        products = []
        
        try:
            # Load homepage
            print("\n📥 Loading homepage...")
            await page.goto('https://cardtell.id/', wait_until='networkidle')
            await page.wait_for_timeout(5000)
            
            # Get product links
            links = await page.query_selector_all('a[href*="/products/"]')
            unique_urls = []
            seen = set()
            
            for link in links:
                href = await link.get_attribute('href')
                if href and href not in seen:
                    seen.add(href)
                    unique_urls.append(href)
            
            print(f"   Found {len(unique_urls)} products")
            
            # Scrape each product
            for i, url in enumerate(unique_urls[:15], 1):
                try:
                    full_url = f"https://cardtell.id{url}" if url.startswith('/') else url
                    print(f"\n[{i}/{len(unique_urls)}] {full_url[:50]}...")
                    
                    # Clear previous API data
                    api_data.clear()
                    
                    await page.goto(full_url, wait_until='networkidle')
                    await page.wait_for_timeout(4000)
                    
                    # Get page info
                    title = await page.title()
                    title = title.replace(' — CARDTELL', '')
                    
                    # Try to get data from page
                    data = await page.evaluate('''() => {
                        // Try to find data in window object
                        const data = window.__DATA__ || window.__INITIAL_STATE__ || {};
                        
                        // Get all text
                        const text = document.body.innerText;
                        
                        return {
                            has_data: Object.keys(data).length > 0,
                            data_keys: Object.keys(data),
                            text_sample: text.substring(0, 500)
                        };
                    }''')
                    
                    # Try to extract prices from elements
                    price_elems = await page.query_selector_all('text=/Rp[\\d.,]+/')
                    prices = []
                    for elem in price_elems[:3]:
                        text = await elem.text_content()
                        if text and 'Rp' in text:
                            prices.append(text.strip())
                    
                    product_info = {
                        'title': title,
                        'url': full_url,
                        'prices': prices,
                        'api_calls': len(api_data)
                    }
                    
                    products.append(product_info)
                    
                    if prices:
                        print(f"   ✅ {title[:50]}")
                        print(f"   💰 {', '.join(prices[:2])}")
                    else:
                        print(f"   📄 {title[:50]}")
                    
                except Exception as e:
                    print(f"   ❌ Error: {e}")
            
        except Exception as e:
            print(f"\n❌ Fatal error: {e}")
        
        await context.close()
        await browser.close()
    
    # Save results
    import os
    os.makedirs("cardtell_output", exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    json_file = f"cardtell_output/cardtell_api_{timestamp}.json"
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump({
            "source": "Cardtell.id",
            "scraped_at": datetime.now().isoformat(),
            "total": len(products),
            "products": products
        }, f, indent=2, ensure_ascii=False)
    
    print(f"\n💾 Saved: {json_file}")
    print(f"Total products: {len(products)}")


if __name__ == "__main__":
    asyncio.run(scrape_cardtell_api())
