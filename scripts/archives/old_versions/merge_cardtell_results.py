#!/usr/bin/env python3
"""
Merge hasil dari semua batch Cardtell Detail Scraper
"""

import json
import csv
import glob
from datetime import datetime

def merge_results():
    print("="*70)
    print("🔗 MERGING CARDTELL DETAIL RESULTS")
    print("="*70)
    print()
    
    # Find all result files
    json_files = glob.glob('cardtell_detail_results/cardtell_detail_batch_*.json')
    json_files += glob.glob('cardtell_detail_batch_*.json')
    
    print(f"📁 Found {len(json_files)} result files")
    
    if not json_files:
        print("❌ No result files found!")
        return
    
    all_results = []
    
    for file in sorted(json_files):
        print(f"   Loading: {file}")
        try:
            with open(file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                all_results.extend(data.get('results', []))
        except Exception as e:
            print(f"   ⚠️  Error loading {file}: {e}")
    
    print(f"\n📊 Total records: {len(all_results)}")
    
    # Remove duplicates by cardtell_url
    seen = set()
    unique_results = []
    for r in all_results:
        url = r.get('cardtell_url', '')
        if url and url not in seen:
            seen.add(url)
            unique_results.append(r)
    
    print(f"📊 Unique records: {len(unique_results)}")
    
    # Save merged JSON
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    output = {
        'source': 'Cardtell.id - Detail Page Scraper (Merged)',
        'merged_at': datetime.now().isoformat(),
        'total_batches': len(json_files),
        'total_records': len(unique_results),
        'results': unique_results
    }
    
    json_file = f'cardtell_detail_merged_{timestamp}.json'
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"\n💾 Merged JSON: {json_file}")
    
    # Save merged CSV
    csv_file = f'cardtell_detail_merged_{timestamp}.csv'
    with open(csv_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['Name', 'Set Info', 'Prices', 'Platform', 'External Link', 'Seller', 'Badge', 'Cardtell URL'])
        
        for r in unique_results:
            writer.writerow([
                r.get('name', ''),
                r.get('set_info', ''),
                ', '.join(r.get('prices', [])),
                r.get('platform', ''),
                r.get('external_link', ''),
                r.get('seller', ''),
                r.get('badge', ''),
                r.get('cardtell_url', '')
            ])
    
    print(f"📄 Merged CSV: {csv_file}")
    
    # Statistics
    platforms = {}
    for r in unique_results:
        platform = r.get('platform', 'Unknown')
        platforms[platform] = platforms.get(platform, 0) + 1
    
    print("\n" + "="*70)
    print("📊 PLATFORM BREAKDOWN")
    print("="*70)
    
    for platform, count in sorted(platforms.items(), key=lambda x: x[1], reverse=True):
        percentage = count / len(unique_results) * 100
        print(f"   {platform:20} : {count:4} ({percentage:5.1f}%)")
    
    print("\n" + "="*70)
    print("✅ MERGE COMPLETE!")
    print("="*70)


if __name__ == "__main__":
    merge_results()
