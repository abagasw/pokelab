#!/usr/bin/env python3
"""Test TCGplayer - check actual content"""

import asyncio
from playwright.async_api import async_playwright


async def debug():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        url = "https://www.tcgplayer.com/search/all/product?q=Pikachu+ex&ProductTypeName=Cards"
        print(f"Opening: {url}")
        
        await page.goto(url, wait_until='domcontentloaded', timeout=30000)
        await asyncio.sleep(5)
        
        content = await page.content()
        
        # Check for specific strings
        checks = [
            ("access denied", "Access Denied"),
            ("captcha", "CAPTCHA"),
            ("blocked", "Blocked"),
            ("robot", "Robot Check"),
            ("cloudflare", "Cloudflare"),
            ("product", "Product"),
            ("search", "Search"),
            ("pikachu", "Pikachu"),
        ]
        
        content_lower = content.lower()
        print("\nContent checks:")
        for keyword, label in checks:
            found = keyword in content_lower
            print(f"  {label}: {'✅' if found else '❌'}")
        
        # Print first 2000 chars
        print(f"\nContent preview:\n{content[:2000]}...")
        
        await browser.close()


if __name__ == "__main__":
    asyncio.run(debug())
