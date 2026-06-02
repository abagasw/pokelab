import sqlite3
import json
import os

DB_PATH = 'backend-go/pokemon_tcg.db'

decks = [
    {
        "id": "2026-dragapult-noctowl",
        "name": "Dragapult ex (Noctowl Engine)",
        "archetype": "Dragapult ex",
        "description": "Meta King — Rank 1 Indonesia Premier Ball League. Regulasi Standar 2026 (H, I, J).",
        "format": "Standard",
        "cards": [
            ("Dragapult ex", "MA3", 3),
            ("Drakloak", "MA3", 3),
            ("Dreepy", "MA3", 4),
            ("Noctowl", "MA3", 2),
            ("Hoothoot", "MA3", 4),
            ("Munkidori", "MA3", 2),
            ("Fezandipiti ex", "MA3", 1),
            ("Poffin Bersahabat", "MA3", 4),
            ("Bola Ultra", "MAAL", 4),
            ("Permen Langka", "MAAL", 3),
            ("Tandu Malam", "MA3", 2),
            ("Tukar Pokémon", "MAAL", 2),
            ("Scramble Switch", "SV8s", 1),
            ("Balon", "MA3", 2),
            ("Tool Scrapper", "MA3", 1),
            ("Obat Rahasia Naga", "MA3", 1),
            ("Ketetapan Hati Lillie", "MAAL", 4),
            ("Perintah Bos", "MA4", 2),
            ("Judge", "MAAL", 2),
            ("Hilda", "MA3", 2),
            ("Energi Dasar [Api]", "", 6),
            ("Energi Dasar [Psikis]", "", 3),
            ("Energi Dasar [Kegelapan]", "", 2)
        ]
    },
    {
        "id": "2026-armarouge-fire",
        "name": "Armarouge ex Fire",
        "archetype": "Armarouge ex",
        "description": "Deck Meta Pengganti dari Sisa Kartu — 0 Rupiah Upgrade. Regulasi Standar 2026 (H, I, J).",
        "format": "Standard",
        "cards": [
            ("Charcadet", "MA3", 4),
            ("Armarouge ex", "SVI", 2),
            ("Armarouge", "SV8s", 2),
            ("Ceruledge ex", "MA3", 2),
            ("Entei", "MA3", 2),
            ("Fezandipiti ex", "MA3", 2),
            ("Castform Wujud Matahari", "SV8s", 1),
            ("Bola Ultra", "MAAL", 4),
            ("Pemulihan Energi", "SV11s", 3),
            ("Heat Burner", "MA2", 2),
            ("Pengalih Energi", "MA2", 2),
            ("Pokémon Catcher", "MAAL", 2),
            ("Energi Recycle", "MA3", 2),
            ("Poké Pad", "MA4", 2),
            ("Scramble Switch", "SV8s", 1),
            ("Tool Scrapper", "MA3", 1),
            ("Bimbingan Penjelajah", "SV8a", 4),
            ("Perintah Bos", "MA4", 2),
            ("Judge", "MAAL", 2),
            ("Lilac", "MA4", 3),
            ("Urbain", "MAAL", 2),
            ("Teman-teman Paldea", "SV8a", 2),
            ("Energi Dasar [Api]", "", 11)
        ]
    },
    {
        "id": "2026-zoroark-n-ex",
        "name": "Zoroark N ex (2026)",
        "archetype": "Zoroark N ex",
        "description": "Tier A+ — Zoroark N ex post-purchase build. Regulasi Standar 2026 (H, I, J).",
        "format": "Standard",
        "cards": [
            ("Zorua N", "MA3", 4),
            ("Zoroark N ex", "MA3", 3),
            ("Zekrom N", "MA3", 2),
            ("Darumaka N", "MA3", 1),
            ("Darmanitan N", "MA3", 1),
            ("Reshiram N", "MA3", 1),
            ("Fezandipiti ex", "MA3", 2),
            ("Pecharunt ex", "MA3", 1),
            ("Munkidori", "MA3", 1),
            ("Budew", "MA3", 1),
            ("Poffin Bersahabat", "MA3", 4),
            ("Tandu Malam", "MA3", 3),
            ("Bola Ultra", "MAAL", 2),
            ("Tukar Pokémon", "MAAL", 2),
            ("Moci Rantai", "SV8a", 2),
            ("Istana N", "MA3", 2),
            ("Menara Pemantau Tim Roket", "MA3", 1),
            ("Pokémon Catcher", "MAAL", 2),
            ("Energi Recycle", "MA3", 2),
            ("Poké Pad", "MA4", 2),
            ("PP Up N", "MA3", 2),
            ("Ketetapan Hati Lillie", "MAAL", 2),
            ("Perintah Bos", "MA4", 2),
            ("Urbain", "MAAL", 2),
            ("Teman-teman Paldea", "SV8a", 3),
            ("Semangat Tarung Iris", "MAAL", 2),
            ("Energi Dasar [Kegelapan]", "", 8)
        ]
    }
]

def find_card(cursor, name, expansion_code):
    # Try exact match with expansion
    if expansion_code:
        cursor.execute("SELECT id FROM cards WHERE (name_id = ? OR name_en = ?) AND expansion_code = ?", (name, name, expansion_code))
        res = cursor.fetchone()
        if res:
            return res[0]
    
    # Try match without expansion
    cursor.execute("SELECT id FROM cards WHERE name_id = ? OR name_en = ? ORDER BY (expansion_code IS NOT NULL) DESC LIMIT 1", (name, name))
    res = cursor.fetchone()
    if res:
        return res[0]
    
    # Try fuzzy match
    cursor.execute("SELECT id FROM cards WHERE name_id LIKE ? OR name_en LIKE ? ORDER BY (expansion_code IS NOT NULL) DESC LIMIT 1", ('%'+name+'%', '%'+name+'%'))
    res = cursor.fetchone()
    if res:
        return res[0]
    
    return None

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    for deck in decks:
        print(f"Importing deck: {deck['name']}")
        
        # Insert deck
        cursor.execute("""
            INSERT INTO decks (id, name, archetype, description, format, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                archetype = excluded.archetype,
                description = excluded.description,
                updated_at = CURRENT_TIMESTAMP
        """, (deck['id'], deck['name'], deck['archetype'], deck['description'], deck['format']))
        
        # Insert decklist
        decklist_id = f"list-{deck['id']}"
        cursor.execute("""
            INSERT INTO decklists (id, deck_id, name, player_name, created_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                player_name = excluded.player_name
        """, (decklist_id, deck['id'], f"Default List - {deck['name']}", "System"))

        # Clear existing cards for this decklist
        cursor.execute("DELETE FROM deck_cards WHERE deck_id = ?", (decklist_id,))
        
        # Insert cards
        total_count = 0
        for card_name, exp, count in deck['cards']:
            card_id = find_card(cursor, card_name, exp)
            if card_id:
                is_pokemon = False
                cursor.execute("SELECT category FROM cards WHERE id = ?", (card_id,))
                cat = cursor.fetchone()
                if cat and cat[0] == 'Pokemon':
                    is_pokemon = True
                
                cursor.execute("""
                    INSERT INTO deck_cards (deck_id, card_id, count, is_pokemon)
                    VALUES (?, ?, ?, ?)
                """, (decklist_id, card_id, count, is_pokemon))
                total_count += count
            else:
                print(f"  Warning: Could not find card '{card_name}' ({exp})")
        
        print(f"  Total cards imported: {total_count}")
        
    conn.commit()
    conn.close()
    print("Import finished.")

if __name__ == "__main__":
    main()
