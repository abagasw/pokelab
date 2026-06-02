#!/bin/bash

# Run all batches with GUI scraper (headless=False)
# WARNING: This will open browser windows!

if [ -z "$DISPLAY" ]; then
    echo "⚠️  WARNING: No DISPLAY environment variable set!"
    echo "This script requires a GUI environment."
    echo ""
    echo "If you're on a server, either:"
    echo "  1. Run this on your local computer with a display"
    echo "  2. Install and use xvfb-run (virtual display)"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "=========================================="
echo "🚀 RUNNING ALL BATCHES (GUI Mode)"
echo "=========================================="
echo ""

# Run 14 batches
for i in $(seq 0 50 650); do
    batch_num=$((i / 50 + 1))
    remaining=$((679 - i))
    
    if [ $remaining -lt 50 ]; then
        count=$remaining
    else
        count=50
    fi
    
    echo ""
    echo "=========================================="
    echo "📦 BATCH $batch_num (index $i, count $count)"
    echo "=========================================="
    
    python3 cardtell_gui_scraper.py $i $count
    
    echo "⏳ Waiting 3 seconds before next batch..."
    sleep 3
done

echo ""
echo "=========================================="
echo "🎉 ALL BATCHES COMPLETED!"
echo "=========================================="

# Merge results
echo ""
echo "📊 Merging results..."
python3 merge_gui_results.py
