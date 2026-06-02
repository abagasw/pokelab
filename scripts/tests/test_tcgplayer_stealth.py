#!/usr/bin/env python3
"""Test TCGplayer with stealth"""

import asyncio
from playwright.async_api import async_playwright


async def debug():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-dev-shm-usage',
                '--no-sandbox',
            ]
        )
        
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale='en-US',
            timezone_id='America/New_York'
        )
        
        # Inject stealth script
        await context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3]
            });
            window.chrome = { runtime: {} };
        """)
        
        page = await context.new_page()
        
        # Test search
        url = "https://www.tcgplayer.com/search/all/product?q=Pikachu+ex&ProductTypeName=Cards"
        print(f"Opening: {url}")
        
        await page.goto(url, wait_until='networkidle', timeout=60000)
        await asyncio.sleep(5)
        
        print(f"Current URL: {page.url}")
        
        # Check content
        content = await page.content()
        print(f"Content length: {len(content)}")
        
        # Check for product links
        links = await page.query_selector_all('a')
        print(f"\nTotal links: {len(links)}")
        
        # Look for any product cards
        product_cards = await page.query_selector_all('[data-testid*="product"]')
        print(f"Product cards: {len(product_cards)}")
        
        # Look for images (product images)
        images = await page.query_selector_all('img')
        print(f"Images: {len(images)}")
        for img in images[:5]:
            src = await img.get_attribute('src')
            alt = await img.get_attribute('alt')
            print(f"  - {alt[:40] if alt else 'N/A'}: {src[:60] if src else 'N/A'}...")
        
        # Look for any text containing prices
        body_text = await page.evaluate('() => document.body.innerText')
        print(f"\nBody text preview: {body_text[:500]}...")
        
        await browser.close()


if __name__ == "__main__":
    asyncio.run(debug())
