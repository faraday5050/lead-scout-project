import sqlite3
import json
from datetime import datetime

DB_PATH = 'leads.db'

def view_leads(limit=20):
    """View recent leads"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT id, prediction, priority, confidence, 
               json_extract(client_data, '$.job') as job,
               json_extract(client_data, '$.age') as age,
               timestamp
        FROM leads 
        ORDER BY timestamp DESC 
        LIMIT ?
    ''', (limit,))
    
    leads = cursor.fetchall()
    print(f"\n📊 Recent Leads ({len(leads)}):")
    print("-" * 80)
    for lead in leads:
        print(f"ID: {lead[0]} | {lead[1]} | {lead[2]} | Conf: {lead[3]}% | {lead[4]} | Age: {lead[5]} | {lead[6]}")
    
    conn.close()

def get_stats():
    """Get database statistics"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM leads")
    total = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM leads WHERE prediction = 'Yes'")
    yes = cursor.fetchone()[0]
    
    cursor.execute("SELECT AVG(confidence) FROM leads")
    avg_conf = cursor.fetchone()[0] or 0
    
    print(f"\n📊 Database Stats:")
    print(f"  Total Leads: {total}")
    print(f"  High Potential: {yes} ({yes/total*100:.1f}% if total > 0 else 0)")
    print(f"  Avg Confidence: {avg_conf:.1f}%")
    
    conn.close()

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        if sys.argv[1] == 'view':
            limit = int(sys.argv[2]) if len(sys.argv) > 2 else 20
            view_leads(limit)
        elif sys.argv[1] == 'stats':
            get_stats()
        elif sys.argv[1] == 'clear':
            confirm = input("⚠️ Delete ALL leads? Type 'yes' to confirm: ")
            if confirm.lower() == 'yes':
                conn = sqlite3.connect(DB_PATH)
                conn.execute("DELETE FROM leads")
                conn.execute("DELETE FROM sqlite_sequence WHERE name='leads'")
                conn.commit()
                conn.close()
                print("✅ All leads cleared")
    else:
        view_leads()
        get_stats()