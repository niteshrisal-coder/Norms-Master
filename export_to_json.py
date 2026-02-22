import sqlite3
import json

print("🔄 Exporting SQLite data...")
conn = sqlite3.connect('norms_decoded.db')
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

tables = ['norms', 'norm_resources', 'rates', 'projects', 'boq_items']
data = {}

for table in tables:
    cursor.execute(f"SELECT * FROM {table}")
    rows = cursor.fetchall()
    data[table] = [dict(row) for row in rows]
    print(f"✅ Exported {len(rows)} rows from {table}")

with open('norms_data.json', 'w') as f:
    json.dump(data, f, indent=2, default=str)

conn.close()
print("🎉 Export complete! norms_data.json created")