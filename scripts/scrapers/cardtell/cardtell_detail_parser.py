#!/usr/bin/env python3
"""
Parse detail dari HTML Cardtell yang sudah ada
Cari URL Beli Sekarang dari atribut data atau href
"""

import json
import re
from bs4 import BeautifulSoup
from datetime import datetime

def parse_cardtell_detail_html(filename):
    """Parse detail HTML untuk cari URL Beli Sekarang"""
    
    with open(filename, 'r', encoding='utf-8') as f:
        html = f.read()
    
    print("="*70)
    print("🔍 PARSING DETAIL HTML CARDTELL")
    print("="*70)
    print(f"File size: {len(html):,} characters")
    print()
    
    soup = BeautifulSoup(html, 'html.parser')
    
    # Cari semua link/button Beli Sekarang
    print("Mencari tombol 'Beli Sekarang'...")
    
    # Pattern 1: Cari teks "Beli Sekarang"
    buy_now_elements = []
    
    # Cari semua element yang mengandung teks "Beli Sekarang"
    for element in soup.find_all(text=re.compile(r'Beli Sekarang')):
        parent = element.parent
        buy_now_elements.append({
            'text': element.strip(),
            'tag': parent.name,
            'href': parent.get('href', '') if parent.name == 'a' else '',
            'onclick': parent.get('onclick', ''),
            'data_url': parent.get('data-url', '') or parent.get('data-href', ''),
            'parent_html': str(parent)[:200]
        })
    
    print(f"Ditemukan {len(buy_now_elements)} element 'Beli Sekarang'")
    print()
    
    # Tampilkan beberapa contoh
    if buy_now_elements:
        print("Sample elements:")
        for i, elem in enumerate(buy_now_elements[:5], 1):
            print(f"\n{i}. Tag: {elem['tag']}")
            print(f"   Text: {elem['text']}")
            print(f"   Href: {elem['href'][:80] if elem['href'] else 'N/A'}")
            print(f"   OnClick: {elem['onclick'][:80] if elem['onclick'] else 'N/A'}")
            print(f"   Data URL: {elem['data_url'][:80] if elem['data_url'] else 'N/A'}")
    
    # Cari pattern URL dalam onclick atau data attribute
    print("\n" + "="*70)
    print("🔍 MENCARI URL DALAM ATRIBUT")
    print("="*70)
    
    # Cari semua link dengan href yang mengandung /buy, /checkout, /payment
    buy_links = soup.find_all('a', href=re.compile(r'(/buy|/checkout|/payment|/order)'))
    print(f"\nLink dengan /buy|/checkout|/payment|/order: {len(buy_links)}")
    
    for link in buy_links[:5]:
        print(f"  - {link.get('href', '')}")
    
    # Cari semua button/link dengan onclick yang mengandung window.location atau window.open
    onclick_elements = soup.find_all(onclick=True)
    print(f"\nElement dengan onclick: {len(onclick_elements)}")
    
    navigation_urls = []
    for elem in onclick_elements:
        onclick = elem.get('onclick', '')
        # Cari URL dalam onclick
        url_match = re.search(r"(?:window\.location|window\.open)\(['\"]([^'\"]+)['\"]", onclick)
        if url_match:
            navigation_urls.append({
                'url': url_match.group(1),
                'text': elem.get_text(strip=True)[:50],
                'onclick': onclick[:100]
            })
    
    print(f"URL navigasi ditemukan: {len(navigation_urls)}")
    for url_info in navigation_urls[:10]:
        print(f"  - {url_info['url'][:80]}")
        print(f"    Text: {url_info['text']}")
    
    # Cari data-url atau data-href attribute
    print("\n" + "="*70)
    print("🔍 MENCARI DATA-* ATRIBUT")
    print("="*70)
    
    data_url_elements = soup.find_all(attrs={"data-url": True})
    print(f"Element dengan data-url: {len(data_url_elements)}")
    
    for elem in data_url_elements[:10]:
        print(f"  - {elem.get('data-url', '')[:80]}")
        print(f"    Text: {elem.get_text(strip=True)[:50]}")
    
    # Cari form action (untuk POST ke checkout)
    forms = soup.find_all('form', action=True)
    print(f"\nForm dengan action: {len(forms)}")
    
    for form in forms[:5]:
        print(f"  - Action: {form.get('action', '')}")
    
    return {
        'buy_now_elements': len(buy_now_elements),
        'navigation_urls': navigation_urls,
        'data_url_elements': len(data_url_elements)
    }


def extract_buy_now_urls_from_json():
    """Ekstrak URL Beli Sekarang dari cardtell.json jika ada"""
    
    print("\n" + "="*70)
    print("🔍 MENCARI URL BELI SEKARANG DARI HTML")
    print("="*70)
    
    with open('/home/alitbagas/Documents/Projects/pokemon/cardtell.json', 'r', encoding='utf-8') as f:
        html = f.read()
    
    # Cari pattern URL yang mengandung Beli Sekarang atau Buy Now
    # Format umum: button dengan data-url atau link dengan href
    
    # Pattern 1: data-url dalam button/link
    data_url_pattern = r'<[^>]*data-url=["\']([^"\']+)["\'][^>]*>([^<]*(?:Beli Sekarang|Buy Now)[^<]*)</[^>]+>'
    matches = re.findall(data_url_pattern, html, re.IGNORECASE)
    
    print(f"Pattern data-url + Beli Sekarang: {len(matches)} matches")
    for url, text in matches[:10]:
        print(f"  URL: {url}")
        print(f"  Text: {text.strip()}")
    
    # Pattern 2: href dalam tag a yang mengandung Beli Sekarang
    href_pattern = r'<a[^>]*href=["\']([^"\']+)["\'][^>]*>([^<]*(?:Beli Sekarang|Buy Now)[^<]*)</a>'
    href_matches = re.findall(href_pattern, html, re.IGNORECASE)
    
    print(f"\nPattern href + Beli Sekarang: {len(href_matches)} matches")
    for url, text in href_matches[:10]:
        print(f"  URL: {url}")
        print(f"  Text: {text.strip()}")
    
    # Pattern 3: Cari semua URL yang mengandung /checkout, /buy, /order
    checkout_urls = re.findall(r'https?://[^\s"\'<>]+(?:/checkout|/buy|/order)[^\s"\'<>]*', html)
    checkout_urls = list(set(checkout_urls))  # Remove duplicates
    
    print(f"\nURL dengan /checkout|/buy|/order: {len(checkout_urls)}")
    for url in checkout_urls[:20]:
        print(f"  {url}")
    
    return {
        'data_url_matches': matches,
        'href_matches': href_matches,
        'checkout_urls': checkout_urls
    }


if __name__ == "__main__":
    # Parse HTML detail
    result = parse_cardtell_detail_html('/home/alitbagas/Documents/Projects/pokemon/cardtell.json')
    
    # Extract URL Beli Sekarang
    urls = extract_buy_now_urls_from_json()
    
    # Simpan hasil
    output = {
        'parsed_at': datetime.now().isoformat(),
        'buy_now_elements': result['buy_now_elements'],
        'navigation_urls_found': len(result['navigation_urls']),
        'checkout_urls_found': len(urls['checkout_urls']),
        'checkout_urls': urls['checkout_urls'][:50]  # Save first 50
    }
    
    with open('cardtell_buy_now_urls.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"\n💾 Saved: cardtell_buy_now_urls.json")
