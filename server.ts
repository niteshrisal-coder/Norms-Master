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

      -- Project-specific rate overrides
      CREATE TABLE IF NOT EXISTS project_rate_overrides (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        norm_id INTEGER NOT NULL REFERENCES norms(id) ON DELETE CASCADE,
        resource_name TEXT NOT NULL,
        override_rate REAL,
        override_quantity REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, norm_id, resource_name)
      );

      -- Transportation settings per project
      CREATE TABLE IF NOT EXISTS project_transport_settings (
        project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        transport_mode TEXT DEFAULT 'TRUCK',
        metalled_distance REAL DEFAULT 0,
        gravelled_distance REAL DEFAULT 0,
        porter_distance REAL DEFAULT 0,
        
        -- Porter coefficients (per kg per kosh)
        porter_easy REAL DEFAULT 2.5,
        porter_difficult REAL DEFAULT 3.6,
        porter_vdifficult REAL DEFAULT 6.1,
        porter_high_volume REAL DEFAULT 4.9,
        
        -- Tractor road coefficients (per kg per km)
        tractor_metalled REAL DEFAULT 0.074,
        tractor_gravelled REAL DEFAULT 0.075,
        
        -- Truck road coefficients (per kg per kosh)
        truck_metalled_easy REAL DEFAULT 0.02,
        truck_metalled_difficult REAL DEFAULT 0.02,
        truck_metalled_vdifficult REAL DEFAULT 0.022,
        truck_metalled_high_volume REAL DEFAULT 0.022,
        truck_gravelled_easy REAL DEFAULT 0.049,
        truck_gravelled_difficult REAL DEFAULT 0.063,
        truck_gravelled_vdifficult REAL DEFAULT 0.063,
        truck_gravelled_high_volume REAL DEFAULT 0.025,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Material transportation data per project
      CREATE TABLE IF NOT EXISTS project_material_transport (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        material_name TEXT NOT NULL,
        unit_weight REAL NOT NULL DEFAULT 0,
        load_category TEXT NOT NULL DEFAULT 'EASY',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, material_name)
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

  // GET ALL NORMS
  app.get("/api/norms", async (req, res) => {
    try {
      const { rows: norms } = await pool.query("SELECT * FROM norms ORDER BY id DESC");
      const result = await Promise.all(norms.map(async (norm: any) => {
        const { rows: resources } = await pool.query("SELECT * FROM norm_resources WHERE norm_id = $1", [norm.id]);
        return { ...norm, resources };
      }));
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // CREATE NORM
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
            `INSERT INTO rates (resource_type, name, unit, rate) 
             VALUES ($1, $2, $3, 0) 
             ON CONFLICT (name) 
             DO UPDATE SET resource_type = EXCLUDED.resource_type, unit = EXCLUDED.unit`,
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

  // UPDATE NORM
  app.put("/api/norms/:id", async (req, res) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { type, description, unit, basis_quantity, ref_ss, resources } = req.body;
      await client.query('BEGIN');

      await client.query(
        "UPDATE norms SET type = $1, description = $2, unit = $3, basis_quantity = $4, ref_ss = $5 WHERE id = $6",
        [type, description, unit, basis_quantity, ref_ss, id]
      );

      await client.query("DELETE FROM norm_resources WHERE norm_id = $1", [id]);
      
      for (const resource of resources) {
        const rType = resource.resource_type || resource.type;
        await client.query(
          "INSERT INTO norm_resources (norm_id, resource_type, name, unit, quantity, is_percentage, percentage_base) VALUES ($1, $2, $3, $4, $5, $6, $7)",
          [id, rType, resource.name, resource.unit || '-', resource.quantity, resource.is_percentage ? 1 : 0, resource.percentage_base || null]
        );

        if (!resource.is_percentage) {
          await client.query(
            `INSERT INTO rates (resource_type, name, unit, rate) 
             VALUES ($1, $2, $3, 0) 
             ON CONFLICT (name) 
             DO UPDATE SET resource_type = EXCLUDED.resource_type, unit = EXCLUDED.unit`,
            [rType, resource.name, resource.unit || '-']
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

  // DELETE NORM
  app.delete("/api/norms/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query("DELETE FROM norms WHERE id = $1", [id]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // RATES
  app.get("/api/rates", async (req, res) => {
    try {
      const { rows } = await pool.query("SELECT * FROM rates ORDER BY name ASC");
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

  // PROJECTS
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

  // BOQ ITEMS
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

  // UPDATE BOQ ITEM
  app.put("/api/boq-items/:id", async (req, res) => {
    const { quantity, norm_id } = req.body;
    try {
      await pool.query(
        "UPDATE boq_items SET quantity = $1, norm_id = COALESCE($2, norm_id) WHERE id = $3",
        [quantity, norm_id, req.params.id]
      );
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE BOQ ITEM
  app.delete("/api/boq-items/:id", async (req, res) => {
    try {
      await pool.query("DELETE FROM boq_items WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ========== PROJECT-SPECIFIC RATE OVERRIDES ==========

  // Get all overrides for a project
  app.get("/api/projects/:projectId/overrides", async (req, res) => {
    try {
      const { rows } = await pool.query(
        "SELECT * FROM project_rate_overrides WHERE project_id = $1",
        [req.params.projectId]
      );
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Save or update an override
  app.post("/api/projects/:projectId/overrides", async (req, res) => {
    const { norm_id, resource_name, override_rate, override_quantity } = req.body;
    try {
      await pool.query(
        `INSERT INTO project_rate_overrides (project_id, norm_id, resource_name, override_rate, override_quantity)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (project_id, norm_id, resource_name) 
         DO UPDATE SET override_rate = EXCLUDED.override_rate, override_quantity = EXCLUDED.override_quantity`,
        [req.params.projectId, norm_id, resource_name, override_rate, override_quantity]
      );
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Delete an override
  app.delete("/api/projects/:projectId/overrides", async (req, res) => {
    const { norm_id, resource_name } = req.body;
    try {
      await pool.query(
        "DELETE FROM project_rate_overrides WHERE project_id = $1 AND norm_id = $2 AND resource_name = $3",
        [req.params.projectId, norm_id, resource_name]
      );
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ========== TRANSPORTATION API ROUTES ==========

  // Get transportation settings for a project
  app.get("/api/projects/:projectId/transport/settings", async (req, res) => {
    try {
      const { rows } = await pool.query(
        "SELECT * FROM project_transport_settings WHERE project_id = $1",
        [req.params.projectId]
      );
      
      if (rows.length === 0) {
        // Create default settings if none exist
        const result = await pool.query(
          `INSERT INTO project_transport_settings (project_id) 
           VALUES ($1) RETURNING *`,
          [req.params.projectId]
        );
        res.json(result.rows[0]);
      } else {
        res.json(rows[0]);
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Save transportation settings
  app.post("/api/projects/:projectId/transport/settings", async (req, res) => {
    const {
      transport_mode,
      metalled_distance,
      gravelled_distance,
      porter_distance,
      porter_easy,
      porter_difficult,
      porter_vdifficult,
      porter_high_volume,
      tractor_metalled,
      tractor_gravelled,
      truck_metalled_easy,
      truck_metalled_difficult,
      truck_metalled_vdifficult,
      truck_metalled_high_volume,
      truck_gravelled_easy,
      truck_gravelled_difficult,
      truck_gravelled_vdifficult,
      truck_gravelled_high_volume
    } = req.body;

    try {
      await pool.query(
        `INSERT INTO project_transport_settings (
          project_id, transport_mode, metalled_distance, gravelled_distance, porter_distance,
          porter_easy, porter_difficult, porter_vdifficult, porter_high_volume,
          tractor_metalled, tractor_gravelled,
          truck_metalled_easy, truck_metalled_difficult, truck_metalled_vdifficult, truck_metalled_high_volume,
          truck_gravelled_easy, truck_gravelled_difficult, truck_gravelled_vdifficult, truck_gravelled_high_volume
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (project_id) DO UPDATE SET
          transport_mode = EXCLUDED.transport_mode,
          metalled_distance = EXCLUDED.metalled_distance,
          gravelled_distance = EXCLUDED.gravelled_distance,
          porter_distance = EXCLUDED.porter_distance,
          porter_easy = EXCLUDED.porter_easy,
          porter_difficult = EXCLUDED.porter_difficult,
          porter_vdifficult = EXCLUDED.porter_vdifficult,
          porter_high_volume = EXCLUDED.porter_high_volume,
          tractor_metalled = EXCLUDED.tractor_metalled,
          tractor_gravelled = EXCLUDED.tractor_gravelled,
          truck_metalled_easy = EXCLUDED.truck_metalled_easy,
          truck_metalled_difficult = EXCLUDED.truck_metalled_difficult,
          truck_metalled_vdifficult = EXCLUDED.truck_metalled_vdifficult,
          truck_metalled_high_volume = EXCLUDED.truck_metalled_high_volume,
          truck_gravelled_easy = EXCLUDED.truck_gravelled_easy,
          truck_gravelled_difficult = EXCLUDED.truck_gravelled_difficult,
          truck_gravelled_vdifficult = EXCLUDED.truck_gravelled_vdifficult,
          truck_gravelled_high_volume = EXCLUDED.truck_gravelled_high_volume,
          updated_at = CURRENT_TIMESTAMP`,
        [
          req.params.projectId, transport_mode, metalled_distance, gravelled_distance, porter_distance,
          porter_easy, porter_difficult, porter_vdifficult, porter_high_volume,
          tractor_metalled, tractor_gravelled,
          truck_metalled_easy, truck_metalled_difficult, truck_metalled_vdifficult, truck_metalled_high_volume,
          truck_gravelled_easy, truck_gravelled_difficult, truck_gravelled_vdifficult, truck_gravelled_high_volume
        ]
      );
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get all material transport data for a project
  app.get("/api/projects/:projectId/transport/materials", async (req, res) => {
    try {
      const { rows } = await pool.query(
        "SELECT * FROM project_material_transport WHERE project_id = $1 ORDER BY material_name",
        [req.params.projectId]
      );
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Save material transport data (unit weight and category)
  app.post("/api/projects/:projectId/transport/materials", async (req, res) => {
    const { material_name, unit_weight, load_category } = req.body;
    try {
      await pool.query(
        `INSERT INTO project_material_transport (project_id, material_name, unit_weight, load_category)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (project_id, material_name) 
         DO UPDATE SET 
           unit_weight = EXCLUDED.unit_weight,
           load_category = EXCLUDED.load_category,
           updated_at = CURRENT_TIMESTAMP`,
        [req.params.projectId, material_name, unit_weight, load_category]
      );
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Batch save multiple material transport entries
  app.post("/api/projects/:projectId/transport/materials/batch", async (req, res) => {
    const { materials } = req.body; // Array of { material_name, unit_weight, load_category }
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const material of materials) {
        await client.query(
          `INSERT INTO project_material_transport (project_id, material_name, unit_weight, load_category)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (project_id, material_name) 
           DO UPDATE SET 
             unit_weight = EXCLUDED.unit_weight,
             load_category = EXCLUDED.load_category,
             updated_at = CURRENT_TIMESTAMP`,
          [req.params.projectId, material.material_name, material.unit_weight, material.load_category]
        );
      }
      
      await client.query('COMMIT');
      res.json({ success: true, count: materials.length });
    } catch (e: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: e.message });
    } finally {
      client.release();
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