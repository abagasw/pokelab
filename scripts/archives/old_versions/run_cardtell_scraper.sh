#!/bin/bash
#
# Cardtell Detail Scraper - Runner Script
# Menjalankan semua batch secara otomatis
#
# Usage: ./run_cardtell_scraper.sh [start_batch] [end_batch]
# Example: ./run_cardtell_scraper.sh 1 14

# Default values
START_BATCH=${1:-1}
END_BATCH=${2:-14}
BATCH_SIZE=50

echo "═══════════════════════════════════════════════════════════════════"
echo "🚀 CARDTELL DETAIL SCRAPER - AUTO RUNNER"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "📊 Configuration:"
echo "   Start Batch: $START_BATCH"
echo "   End Batch: $END_BATCH"
echo "   Batch Size: $BATCH_SIZE"
echo "   Total Products: $(( (END_BATCH - START_BATCH + 1) * BATCH_SIZE ))"
echo ""

# Check if Python script exists
if [ ! -f "cardtell_detail_scraper_standalone.py" ]; then
    echo "❌ Error: cardtell_detail_scraper_standalone.py not found!"
    exit 1
fi

# Check if dependencies are installed
echo "📦 Checking dependencies..."
python3 -c "import playwright" 2>/dev/null || {
    echo "❌ playwright not installed. Installing..."
    pip3 install playwright beautifulsoup4
    playwright install chromium
}

python3 -c "import bs4" 2>/dev/null || {
    echo "❌ beautifulsoup4 not installed. Installing..."
    pip3 install beautifulsoup4
}

echo "✅ Dependencies OK"
echo ""

# Create output directory
mkdir -p cardtell_detail_results

# Run batches
for ((i=START_BATCH; i<=END_BATCH; i++)); do
    echo "═══════════════════════════════════════════════════════════════════"
    echo "📦 BATCH $i / $END_BATCH"
    echo "═══════════════════════════════════════════════════════════════════"
    
    python3 cardtell_detail_scraper_standalone.py $i $BATCH_SIZE
    
    # Move results to directory
    mv cardtell_detail_batch_*.json cardtell_detail_results/ 2>/dev/null
    mv cardtell_detail_batch_*.csv cardtell_detail_results/ 2>/dev/null
    
    echo ""
    echo "⏳ Waiting 5 seconds before next batch..."
    sleep 5
    
    echo ""
done

echo "═══════════════════════════════════════════════════════════════════"
echo "✅ ALL BATCHES COMPLETED!"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "📁 Results saved in: cardtell_detail_results/"
echo ""
echo "📊 To merge all results:"
echo "   python3 merge_cardtell_results.py"
