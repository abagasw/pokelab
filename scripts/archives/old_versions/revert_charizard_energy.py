import sqlite3
import os

DB_PATH = 'backend-go/pokemon_tcg.db'

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    decklist_id = "list-2026-mega-charizard-x"
    
    # Remove Grass Energy
    cursor.execute("SELECT id FROM cards WHERE name_id = 'Energi Dasar [Daun]' LIMIT 1")
    grass_id = cursor.fetchone()
    if grass_id:
        cursor.execute("DELETE FROM deck_cards WHERE deck_id = ? AND card_id = ?", (decklist_id, grass_id[0]))
    
    # Update Fire Energy count to 10
    cursor.execute("SELECT id FROM cards WHERE name_id = 'Energi Dasar [Api]' LIMIT 1")
    fire_id = cursor.fetchone()
    if fire_id:
        cursor.execute("UPDATE deck_cards SET count = 10 WHERE deck_id = ? AND card_id = ?", (decklist_id, fire_id[0]))
        print("Reverted to 10x Fire Energy for Mega Charizard deck.")
    
    conn.commit()
    conn.close()

if __name__ == "__main__":
    main()
