import sqlite3
import os

DB_PATH = 'backend-go/pokemon_tcg.db'

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    decklist_id = "list-2026-mega-charizard-x"
    
    # 1. Update Fire Energy to 8
    cursor.execute("SELECT id FROM cards WHERE name_id = 'Energi Dasar [Api]' LIMIT 1")
    fire_res = cursor.fetchone()
    if fire_res:
        cursor.execute("UPDATE deck_cards SET count = 8 WHERE deck_id = ? AND card_id = ?", (decklist_id, fire_res[0]))
    
    # 2. Add/Update Grass Energy to 4
    cursor.execute("SELECT id FROM cards WHERE name_id = 'Energi Dasar [Daun]' LIMIT 1")
    grass_res = cursor.fetchone()
    if grass_res:
        grass_id = grass_res[0]
        cursor.execute("SELECT id FROM deck_cards WHERE deck_id = ? AND card_id = ?", (decklist_id, grass_id))
        if cursor.fetchone():
            cursor.execute("UPDATE deck_cards SET count = 4 WHERE deck_id = ? AND card_id = ?", (decklist_id, grass_id))
        else:
            cursor.execute("INSERT INTO deck_cards (deck_id, card_id, count, is_pokemon) VALUES (?, ?, ?, 0)", (decklist_id, grass_id, 4))
            
    print("Updated Deck 3: 8x Fire Energy, 4x Grass Energy (for Ogerpon Search).")
    conn.commit()
    conn.close()

if __name__ == "__main__":
    main()
