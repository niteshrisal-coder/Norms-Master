import express from "express";
import { createServer as createViteServer } from "vite";
import pg from "pg";
const { Pool } = pg;
import path from "path";
import { fileURLToPath } from 'url';
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Database Connection ---
const connectionString = process.env.DATABASE_URL || "postgresql://neondb_owner:npg_t7UyrINVHvE2@ep-bitter-thunder-aiqnigb2-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function startServer() {
  console.log("🚀 Starting Production Server with Neon PostgreSQL...");
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  const PORT = 3000;

  // Initialize Tables
  try {
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
    console.log("✅ Database tables verified/created.");
  } catch (err) {
    console.error("❌ Database init error:", err);
  }

  // --- API Routes ---

  app.get("/api/health", async (req, res) => {
    try {
      const result = await pool.query("SELECT COUNT(*) FROM norms");
      res.json({ status: "ok", database: "postgresql", normCount: result.rows[0].count });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  app.get("/api/norms", async (req, res) => {
    try {
      const { rows: norms } = await pool.query("SELECT * FROM norms");
      const result = await Promise.all(norms.map(async (norm: any) => {
        const { rows: resources } = await pool.query("SELECT * FROM norm_resources WHERE norm_id = $1", [norm.id]);
        return { ...norm, resources };
      }));
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/norms", async (req, res) => {
    const client = await pool.connect();
    try {
      const { type, description, unit, basis_quantity, ref_ss, resources } = req.body;
      await client.query('BEGIN');
      
      const normRes = await client.query(
        "INSERT INTO norms (type, description, unit, basis_quantity, ref_ss) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [type, description, unit, basis_quantity || 1.0, ref_ss]
      );
      const normId = normRes.rows[0].id;

      for (const resource of resources) {
        const rType = resource.resource_type || resource.type;
        await client.query(
          "INSERT INTO norm_resources (norm_id, resource_type, name, unit, quantity, is_percentage, percentage_base) VALUES ($1, $2, $3, $4, $5, $6, $7)",
          [normId, rType, resource.name, resource.unit || '-', resource.quantity, resource.is_percentage ? 1 : 0, resource.percentage_base || null]
        );

        if (!resource.is_percentage) {
          await client.query(
            "INSERT INTO rates (resource_type, name, unit, rate) VALUES ($1, $2, $3, 0) ON CONFLICT (name) DO UPDATE SET resource_type = $1, unit = $3",
            [rType, resource.name, resource.unit || '-']
          );
        }
      }

      await client.query('COMMIT');
      res.json({ id: normId, success: true });
    } catch (e: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: e.message });
    } finally {
      client.release();
    }
  });

  app.get("/api/rates", async (req, res) => {
    try {
      const { rows } = await pool.query("SELECT * FROM rates");
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
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

  app.get("/api/projects", async (req, res) => {
    try {
      const { rows } = await pool.query("SELECT * FROM projects ORDER BY created_at DESC");
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const { rows: projects } = await pool.query("SELECT * FROM projects WHERE id = $1", [req.params.id]);
      if (projects.length === 0) return res.status(404).json({ error: "Project not found" });
      
      const { rows: items } = await pool.query(`
        SELECT b.*, n.description, n.unit, n.basis_quantity, n.ref_ss 
        FROM boq_items b 
        JOIN norms n ON b.norm_id = n.id 
        WHERE b.project_id = $1
      `, [req.params.id]);
      
      const itemsWithResources = await Promise.all(items.map(async (item: any) => {
        const { rows: resources } = await pool.query("SELECT * FROM norm_resources WHERE norm_id = $1", [item.norm_id]);
        return { ...item, resources };
      }));

      res.json({ ...projects[0], items: itemsWithResources });
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

  // --- Vite / Static Handling ---
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
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res, next) => {
      if (req.originalUrl.startsWith('/api')) return next();
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("❌ Failed to start server:", err);
  process.exit(1);
});