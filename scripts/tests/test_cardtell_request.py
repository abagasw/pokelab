#!/usr/bin/env python3
"""Test direct request ke Cardtell"""

import requests
import re

url = "https://cardtell.id/products/2843?submission_id=6413&tab=auction#listings"

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

print(f"Fetching: {url}")
resp = requests.get(url, headers=headers, timeout=30)
print(f"Status: {resp.status_code}")
print(f"Content length: {len(resp.text)}")

# Cari pattern URL
tokopedia = re.findall(r'tokopedia\.com/[^"\'<>\s]+', resp.text)
shopee = re.findall(r'shopee\.co\.id/[^"\'<>\s]+', resp.text)
facebook = re.findall(r'facebook\.com/[^"\'<>\s]+', resp.text)

print(f"\nTokopedia URLs: {len(tokopedia)}")
for u in tokopedia[:5]:
    print(f"  - {u}")

print(f"\nShopee URLs: {len(shopee)}")
for u in shopee[:5]:
    print(f"  - {u}")

print(f"\nFacebook URLs: {len(facebook)}")
for u in facebook[:5]:
    print(f"  - {u}")
