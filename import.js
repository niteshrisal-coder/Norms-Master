import sqlite3 from 'better-sqlite3';
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

async function importData() {
  console.log("🔄 Starting import from SQLite to PostgreSQL...");
  
  // Connect to SQLite
  const sqlite = sqlite3('norms.db');
  console.log("✅ Connected to SQLite");
  
  // Connect to PostgreSQL
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  console.log("✅ Connected to PostgreSQL");
  
  try {
    // Clear existing PostgreSQL data
    await pool.query("DELETE FROM norm_resources");
    await pool.query("DELETE FROM norms");
    await pool.query("DELETE FROM rates");
    await pool.query("DELETE FROM boq_items");
    await pool.query("DELETE FROM projects");
    console.log("✅ Cleared existing PostgreSQL data");
    
    // Import norms and resources
    const norms = sqlite.prepare("SELECT * FROM norms").all();
    console.log(`📊 Found ${norms.length} norms in SQLite`);
    
    for (const norm of norms) {
      // Insert norm
      const normResult = await pool.query(
        `INSERT INTO norms (id, type, description, unit, basis_quantity, ref_ss) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         ON CONFLICT (id) DO UPDATE SET
         type = EXCLUDED.type,
         description = EXCLUDED.description,
         unit = EXCLUDED.unit,
         basis_quantity = EXCLUDED.basis_quantity,
         ref_ss = EXCLUDED.ref_ss
         RETURNING id`,
        [norm.id, norm.type, norm.description, norm.unit, norm.basis_quantity, norm.ref_ss]
      );
      
      // Get resources for this norm
      const resources = sqlite.prepare("SELECT * FROM norm_resources WHERE norm_id = ?").all(norm.id);
      
      for (const res of resources) {
        await pool.query(
          `INSERT INTO norm_resources 
           (id, norm_id, resource_type, name, unit, quantity, is_percentage, percentage_base) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING`,
          [res.id, norm.id, res.resource_type, res.name, res.unit, res.quantity, 
           res.is_percentage || 0, res.percentage_base]
        );
      }
    }
    
    // Import rates
    const rates = sqlite.prepare("SELECT * FROM rates").all();
    console.log(`📊 Found ${rates.length} rates in SQLite`);
    
    for (const rate of rates) {
      await pool.query(
        `INSERT INTO rates (id, resource_type, name, unit, rate, apply_vat) 
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [rate.id, rate.resource_type, rate.name, rate.unit, rate.rate, rate.apply_vat || 0]
      );
    }
    
    // Import projects
    const projects = sqlite.prepare("SELECT * FROM projects").all();
    console.log(`📊 Found ${projects.length} projects in SQLite`);
    
    for (const project of projects) {
      await pool.query(
        `INSERT INTO projects (id, name, description, mode, created_at) 
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [project.id, project.name, project.description, project.mode || 'CONTRACTOR', project.created_at]
      );
    }
    
    // Import BOQ items
    const items = sqlite.prepare("SELECT * FROM boq_items").all();
    console.log(`📊 Found ${items.length} BOQ items in SQLite`);
    
    for (const item of items) {
      await pool.query(
        `INSERT INTO boq_items (id, project_id, norm_id, quantity) 
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [item.id, item.project_id, item.norm_id, item.quantity]
      );
    }
    
    // Verify import
    const count = await pool.query("SELECT COUNT(*) FROM norms");
    console.log(`✅ Import complete! PostgreSQL now has ${count.rows[0].count} norms`);
    
  } catch (error) {
    console.error("❌ Import failed:", error);
  } finally {
    await pool.end();
    sqlite.close();
  }
}

importData();