import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from 'url';
import fs from "fs";
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PostgreSQL connection
const { Pool } = pg;
let pool;

try {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable not set!");
    process.exit(1);
  }
  
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false // Required for Render PostgreSQL
    }
  });
  
  console.log("✅ Connected to PostgreSQL database");
} catch (error) {
  console.error("❌ Failed to connect to PostgreSQL:", error);
  process.exit(1);
}

// Initialize Database Tables
async function initializeDatabase() {
  try {
    // Create tables if they don't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS norms (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        unit TEXT NOT NULL,
        basis_quantity REAL DEFAULT 1.0,
        ref_ss TEXT
      );

      CREATE TABLE IF NOT EXISTS norm_resources (
        id SERIAL PRIMARY KEY,
        norm_id INTEGER NOT NULL REFERENCES norms(id) ON DELETE CASCADE,
        resource_type TEXT NOT NULL,
        name TEXT NOT NULL,
        unit TEXT,
        quantity REAL NOT NULL,
        is_percentage INTEGER DEFAULT 0,
        percentage_base TEXT
      );

      CREATE TABLE IF NOT EXISTS rates (
        id SERIAL PRIMARY KEY,
        resource_type TEXT NOT NULL,
        name TEXT NOT NULL UNIQUE,
        unit TEXT NOT NULL,
        rate REAL NOT NULL,
        apply_vat INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        mode TEXT DEFAULT 'CONTRACTOR',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS boq_items (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        norm_id INTEGER NOT NULL REFERENCES norms(id),
        quantity REAL NOT NULL
      );
    `);
    
    // Run migrations safely
    try {
      await pool.query(`ALTER TABLE norm_resources ADD COLUMN IF NOT EXISTS unit TEXT`);
      await pool.query(`ALTER TABLE norms ADD COLUMN IF NOT EXISTS basis_quantity REAL DEFAULT 1.0`);
      await pool.query(`ALTER TABLE rates ADD COLUMN IF NOT EXISTS apply_vat INTEGER DEFAULT 0`);
      await pool.query(`ALTER TABLE norm_resources ADD COLUMN IF NOT EXISTS is_percentage INTEGER DEFAULT 0`);
      await pool.query(`ALTER TABLE norm_resources ADD COLUMN IF NOT EXISTS percentage_base TEXT`);
      await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'CONTRACTOR'`);
    } catch (e) {
      // Ignore migration errors
    }
    
    // Check if we have any data
    const result = await pool.query("SELECT COUNT(*) FROM norms");
    console.log(`✅ Database initialized with ${result.rows[0].count} norms`);
  } catch (error) {
    console.error("❌ Failed to initialize database:", error);
    process.exit(1);
  }
}

async function startServer() {
  await initializeDatabase();
  
  console.log("Starting server...");
  const app = express();
  app.use(express.json());
  
  const PORT = process.env.PORT || 3000;

  // Health Check
  app.get("/api/health", async (req, res) => {
    try {
      const tables = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
      );
      const normsCount = await pool.query("SELECT COUNT(*) as count FROM norms");
      res.json({ 
        status: "ok", 
        tables: tables.rows.map(r => ({ name: r.table_name })),
        normsCount: parseInt(normsCount.rows[0].count)
      });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // Norms
  app.get("/api/norms", async (req, res) => {
    try {
      const norms = await pool.query("SELECT * FROM norms ORDER BY id");
      const result = [];
      
      for (const norm of norms.rows) {
        const resources = await pool.query(
          "SELECT * FROM norm_resources WHERE norm_id = $1 ORDER BY id",
          [norm.id]
        );
        result.push({ ...norm, resources: resources.rows });
      }
      
      res.json(result);
    } catch (e: any) {
      console.error("Error in GET /api/norms:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/norms", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const { type, description, unit, basis_quantity, ref_ss, resources } = req.body;
      
      const normResult = await client.query(
        "INSERT INTO norms (type, description, unit, basis_quantity, ref_ss) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [type, description, unit, basis_quantity || 1.0, ref_ss]
      );
      const normId = normResult.rows[0].id;
      
      for (const resource of resources) {
        await client.query(
          `INSERT INTO norm_resources 
           (norm_id, resource_type, name, unit, quantity, is_percentage, percentage_base) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            normId, 
            resource.resource_type, 
            resource.name, 
            resource.unit, 
            resource.quantity, 
            resource.is_percentage ? 1 : 0, 
            resource.percentage_base || null
          ]
        );
        
        // Sync to rates
        const existingRate = await client.query(
          "SELECT * FROM rates WHERE name = $1",
          [resource.name]
        );
        
        if (existingRate.rows.length === 0) {
          await client.query(
            "INSERT INTO rates (resource_type, name, unit, rate) VALUES ($1, $2, $3, $4)",
            [resource.resource_type, resource.name, resource.unit || '-', 0]
          );
        } else {
          await client.query(
            "UPDATE rates SET resource_type = $1, unit = $2 WHERE name = $3",
            [resource.resource_type, resource.unit || existingRate.rows[0].unit, resource.name]
          );
        }
      }
      
      await client.query('COMMIT');
      res.json({ id: normId });
    } catch (e: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: e.message });
    } finally {
      client.release();
    }
  });

  app.put("/api/norms/:id", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const { id } = req.params;
      const { type, description, unit, basis_quantity, ref_ss, resources } = req.body;
      
      await client.query(
        "UPDATE norms SET type = $1, description = $2, unit = $3, basis_quantity = $4, ref_ss = $5 WHERE id = $6",
        [type, description, unit, basis_quantity || 1.0, ref_ss, id]
      );
      
      await client.query("DELETE FROM norm_resources WHERE norm_id = $1", [id]);
      
      for (const resource of resources) {
        await client.query(
          `INSERT INTO norm_resources 
           (norm_id, resource_type, name, unit, quantity, is_percentage, percentage_base) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            id, 
            resource.resource_type, 
            resource.name, 
            resource.unit, 
            resource.quantity, 
            resource.is_percentage ? 1 : 0, 
            resource.percentage_base || null
          ]
        );
        
        const existingRate = await client.query(
          "SELECT * FROM rates WHERE name = $1",
          [resource.name]
        );
        
        if (existingRate.rows.length === 0) {
          await client.query(
            "INSERT INTO rates (resource_type, name, unit, rate) VALUES ($1, $2, $3, $4)",
            [resource.resource_type, resource.name, resource.unit || '-', 0]
          );
        } else {
          await client.query(
            "UPDATE rates SET resource_type = $1, unit = $2 WHERE name = $3",
            [resource.resource_type, resource.unit || existingRate.rows[0].unit, resource.name]
          );
        }
      }
      
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (e: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: e.message });
    } finally {
      client.release();
    }
  });

  app.delete("/api/norms/:id", async (req, res) => {
    try {
      await pool.query("DELETE FROM norms WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Rates
  app.get("/api/rates", async (req, res) => {
    try {
      const result = await pool.query("SELECT * FROM rates ORDER BY name");
      res.json(result.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/rates", async (req, res) => {
    const { resource_type, name, unit, rate, apply_vat } = req.body;
    try {
      const result = await pool.query(
        "INSERT INTO rates (resource_type, name, unit, rate, apply_vat) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [resource_type, name, unit, rate, apply_vat ? 1 : 0]
      );
      res.json({ id: result.rows[0].id });
    } catch (e) {
      res.status(400).json({ error: "Resource name already exists" });
    }
  });

  app.put("/api/rates/:id", async (req, res) => {
    const { resource_type, name, unit, rate, apply_vat } = req.body;
    try {
      await pool.query(
        "UPDATE rates SET resource_type = $1, name = $2, unit = $3, rate = $4, apply_vat = $5 WHERE id = $6",
        [resource_type, name, unit, rate, apply_vat ? 1 : 0, req.params.id]
      );
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/rates/:id", async (req, res) => {
    try {
      await pool.query("DELETE FROM rates WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Projects
  app.get("/api/projects", async (req, res) => {
    try {
      const result = await pool.query("SELECT * FROM projects ORDER BY created_at DESC");
      res.json(result.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await pool.query("SELECT * FROM projects WHERE id = $1", [req.params.id]);
      if (project.rows.length === 0) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      const items = await pool.query(`
        SELECT b.*, n.description, n.unit, n.basis_quantity, n.ref_ss 
        FROM boq_items b 
        JOIN norms n ON b.norm_id = n.id 
        WHERE b.project_id = $1
      `, [req.params.id]);
      
      const itemsWithResources = [];
      for (const item of items.rows) {
        const resources = await pool.query(
          "SELECT * FROM norm_resources WHERE norm_id = $1",
          [item.norm_id]
        );
        itemsWithResources.push({ ...item, resources: resources.rows });
      }
      
      res.json({ ...project.rows[0], items: itemsWithResources });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/projects", async (req, res) => {
    const { name, description, mode } = req.body;
    try {
      const result = await pool.query(
        "INSERT INTO projects (name, description, mode) VALUES ($1, $2, $3) RETURNING id",
        [name, description, mode || 'CONTRACTOR']
      );
      res.json({ id: result.rows[0].id });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/projects/:id/items", async (req, res) => {
    const { norm_id, quantity } = req.body;
    try {
      const result = await pool.query(
        "INSERT INTO boq_items (project_id, norm_id, quantity) VALUES ($1, $2, $3) RETURNING id",
        [req.params.id, norm_id, quantity]
      );
      res.json({ id: result.rows[0].id });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/boq-items/:id", async (req, res) => {
    try {
      await pool.query("DELETE FROM boq_items WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api')) return next();
      try {
        let template = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(__dirname, "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res, next) => {
        if (req.originalUrl.startsWith('/api')) return next();
        const indexPath = path.join(distPath, "index.html");
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(404).send("Frontend build not found");
        }
      });
    } else {
      console.log("⚠️ dist folder not found, API only mode");
      app.get("*", (req, res, next) => {
        if (req.originalUrl.startsWith('/api')) return next();
        res.status(404).json({ error: "Frontend not built" });
      });
    }
  }

  app.use("/api/*", (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.originalUrl}` });
  });

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error("❌ Failed to start server:", err);
  process.exit(1);
});