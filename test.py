import sqlite3
from datetime import datetime, timedelta

conn = sqlite3.connect('monitor.db')
cursor = conn.cursor()

# Set expiry to tomorrow
tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
cursor.execute("UPDATE vps SET valid_until = ? WHERE id = ?", (tomorrow, 13))
conn.commit()
conn.close()