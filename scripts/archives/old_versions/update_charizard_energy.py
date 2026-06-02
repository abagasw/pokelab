import sqlite3
import os

DB_PATH = 'backend-go/pokemon_tcg.db'

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    deck_id = "2026-mega-charizard-x"
    decklist_id = f"list-{deck_id}"
    
    # Add Grass Energy to the decklist
    # First find the ID for Basic Grass Energy
    cursor.execute("SELECT id FROM cards WHERE name_id = 'Energi Dasar [Daun]' LIMIT 1")
    grass_energy_id = cursor.fetchone()[0]
    
    if grass_energy_id:
        # Check if already exists to avoid duplication
        cursor.execute("SELECT id FROM deck_cards WHERE deck_id = ? AND card_id = ?", (decklist_id, grass_energy_id))
        if not cursor.fetchone():
            cursor.execute("INSERT INTO deck_cards (deck_id, card_id, count, is_pokemon) VALUES (?, ?, ?, ?)", (decklist_id, grass_energy_id, 3, 0))
            print("Added 3x Grass Energy to Mega Charizard deck.")
    
    conn.commit()
    conn.close()

if __name__ == "__main__":
    main()
