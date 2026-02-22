import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';

async function exportData() {
  console.log("🔄 Exporting SQLite data to JSON...");
  
  const db = await open({
    filename: 'norms.db',
    driver: sqlite3.Database
  });
  
  const norms = await db.all("SELECT * FROM norms");
  const resources = await db.all("SELECT * FROM norm_resources");
  const rates = await db.all("SELECT * FROM rates");
  const projects = await db.all("SELECT * FROM projects");
  const boqItems = await db.all("SELECT * FROM boq_items");
  
  const data = { norms, resources, rates, projects, boqItems };
  fs.writeFileSync('export.json', JSON.stringify(data, null, 2));
  
  console.log(`✅ Exported: ${norms.length} norms, ${resources.length} resources, ${rates.length} rates`);
  await db.close();
}

exportData();