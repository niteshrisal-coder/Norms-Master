import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from 'url';
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("norms.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS norms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- 'DOR' or 'DUDBC'
    description TEXT NOT NULL,
    unit TEXT NOT NULL,
    basis_quantity REAL DEFAULT 1.0,
    ref_ss TEXT
  );

  CREATE TABLE IF NOT EXISTS norm_resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    norm_id INTEGER NOT NULL,
    resource_type TEXT NOT NULL, -- 'Labour', 'Material', 'Equipment'
    name TEXT NOT NULL,
    unit TEXT,
    quantity REAL NOT NULL,
    is_percentage INTEGER DEFAULT 0,
    percentage_base TEXT,
    FOREIGN KEY (norm_id) REFERENCES norms(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_type TEXT NOT NULL,
    name TEXT NOT NULL UNIQUE,
    unit TEXT NOT NULL,
    rate REAL NOT NULL,
    apply_vat INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    mode TEXT DEFAULT 'CONTRACTOR', -- 'CONTRACTOR' or 'USERS'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS boq_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    norm_id INTEGER NOT NULL,
    quantity REAL NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (norm_id) REFERENCES norms(id)
  );
`);

async function startServer() {
  console.log("Starting server...");
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // Migration: Add unit column to norm_resources if it doesn't exist
  try {
    db.prepare("ALTER TABLE norm_resources ADD COLUMN unit TEXT").run();
  } catch (e) {}

  // Migration: Add basis_quantity column to norms if it doesn't exist
  try {
    db.prepare("ALTER TABLE norms ADD COLUMN basis_quantity REAL DEFAULT 1.0").run();
  } catch (e) {}

  // Migration: Add apply_vat column to rates if it doesn't exist
  try {
    db.prepare("ALTER TABLE rates ADD COLUMN apply_vat INTEGER DEFAULT 0").run();
  } catch (e) {}

  // Migration: Add is_percentage column to norm_resources if it doesn't exist
  try {
    db.prepare("ALTER TABLE norm_resources ADD COLUMN is_percentage INTEGER DEFAULT 0").run();
  } catch (e) {}

  // Migration: Add percentage_base column to norm_resources if it doesn't exist
  try {
    db.prepare("ALTER TABLE norm_resources ADD COLUMN percentage_base TEXT").run();
  } catch (e) {}

  // Migration: Add mode column to projects if it doesn't exist
  try {
    db.prepare("ALTER TABLE projects ADD COLUMN mode TEXT DEFAULT 'CONTRACTOR'").run();
  } catch (e) {}

  // --- API Routes ---

  // Health Check
  app.get("/api/health", (req, res) => {
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      res.json({ status: "ok", tables });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // Norms
  app.get("/api/norms", (req, res) => {
    console.log("GET /api/norms hit");
    try {
      const norms = db.prepare("SELECT * FROM norms").all();
      const result = norms.map((norm: any) => {
        const resources = db.prepare("SELECT * FROM norm_resources WHERE norm_id = ?").all(norm.id);
        return { ...norm, resources };
      });
      res.json(result);
    } catch (e: any) {
      console.error("Error in GET /api/norms:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/norms", (req, res) => {
    const { type, description, unit, basis_quantity, ref_ss, resources } = req.body;
    const insertNorm = db.prepare("INSERT INTO norms (type, description, unit, basis_quantity, ref_ss) VALUES (?, ?, ?, ?, ?)");
    const info = insertNorm.run(type, description, unit, basis_quantity || 1.0, ref_ss);
    const normId = info.lastInsertRowid;

    const insertResource = db.prepare("INSERT INTO norm_resources (norm_id, resource_type, name, unit, quantity, is_percentage, percentage_base) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const checkRate = db.prepare("SELECT * FROM rates WHERE name = ?");
    const insertRate = db.prepare("INSERT INTO rates (resource_type, name, unit, rate) VALUES (?, ?, ?, ?)");
    const updateRateMeta = db.prepare("UPDATE rates SET resource_type = ?, unit = ? WHERE name = ?");

    for (const resource of resources) {
      insertResource.run(normId, resource.resource_type, resource.name, resource.unit, resource.quantity, resource.is_percentage ? 1 : 0, resource.percentage_base || null);
      
      // Automatic Sync to Rates
      const existingRate = checkRate.get(resource.name);
      if (!existingRate) {
        insertRate.run(resource.resource_type, resource.name, resource.unit || '-', 0);
      } else {
        // Update unit and type from norms (Norms are source of truth for metadata)
        updateRateMeta.run(resource.resource_type, resource.unit || existingRate.unit, resource.name);
      }
    }
    res.json({ id: normId });
  });

  app.put("/api/norms/:id", (req, res) => {
    const { id } = req.params;
    const { type, description, unit, basis_quantity, ref_ss, resources } = req.body;
    db.prepare("UPDATE norms SET type = ?, description = ?, unit = ?, basis_quantity = ?, ref_ss = ? WHERE id = ?").run(type, description, unit, basis_quantity || 1.0, ref_ss, id);
    db.prepare("DELETE FROM norm_resources WHERE norm_id = ?").run(id);
    
    const insertResource = db.prepare("INSERT INTO norm_resources (norm_id, resource_type, name, unit, quantity, is_percentage, percentage_base) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const checkRate = db.prepare("SELECT * FROM rates WHERE name = ?");
    const insertRate = db.prepare("INSERT INTO rates (resource_type, name, unit, rate) VALUES (?, ?, ?, ?)");
    const updateRateMeta = db.prepare("UPDATE rates SET resource_type = ?, unit = ? WHERE name = ?");

    for (const resource of resources) {
      insertResource.run(id, resource.resource_type, resource.name, resource.unit, resource.quantity, resource.is_percentage ? 1 : 0, resource.percentage_base || null);
      
      // Automatic Sync to Rates
      const existingRate = checkRate.get(resource.name);
      if (!existingRate) {
        insertRate.run(resource.resource_type, resource.name, resource.unit || '-', 0);
      } else {
        // Update unit and type from norms (Norms are source of truth for metadata)
        updateRateMeta.run(resource.resource_type, resource.unit || existingRate.unit, resource.name);
      }
    }
    res.json({ success: true });
  });

  app.delete("/api/norms/:id", (req, res) => {
    db.prepare("DELETE FROM norms WHERE id = ?").run(req.params.id);
    db.prepare("DELETE FROM norm_resources WHERE norm_id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Rates
  app.get("/api/rates", (req, res) => {
    console.log("GET /api/rates hit");
    try {
      res.json(db.prepare("SELECT * FROM rates").all());
    } catch (e: any) {
      console.error("Error in GET /api/rates:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/rates", (req, res) => {
    const { resource_type, name, unit, rate, apply_vat } = req.body;
    try {
      const info = db.prepare("INSERT INTO rates (resource_type, name, unit, rate, apply_vat) VALUES (?, ?, ?, ?, ?)").run(resource_type, name, unit, rate, apply_vat ? 1 : 0);
      res.json({ id: info.lastInsertRowid });
    } catch (e) {
      res.status(400).json({ error: "Resource name already exists" });
    }
  });

  app.put("/api/rates/:id", (req, res) => {
    const { resource_type, name, unit, rate, apply_vat } = req.body;
    db.prepare("UPDATE rates SET resource_type = ?, name = ?, unit = ?, rate = ?, apply_vat = ? WHERE id = ?").run(resource_type, name, unit, rate, apply_vat ? 1 : 0, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/rates/:id", (req, res) => {
    db.prepare("DELETE FROM rates WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Projects
  app.get("/api/projects", (req, res) => {
    console.log("GET /api/projects hit");
    try {
      res.json(db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all());
    } catch (e: any) {
      console.error("Error in GET /api/projects:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/projects/:id", (req, res) => {
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const items = db.prepare(`
      SELECT b.*, n.description, n.unit, n.basis_quantity, n.ref_ss 
      FROM boq_items b 
      JOIN norms n ON b.norm_id = n.id 
      WHERE b.project_id = ?
    `).all(req.params.id);
    
    // Add resources for each item
    const itemsWithResources = items.map((item: any) => {
      const resources = db.prepare("SELECT * FROM norm_resources WHERE norm_id = ?").all(item.norm_id);
      return { ...item, resources };
    });

    res.json({ ...project, items: itemsWithResources });
  });

  app.post("/api/projects", (req, res) => {
    const { name, description, mode } = req.body;
    const info = db.prepare("INSERT INTO projects (name, description, mode) VALUES (?, ?, ?)").run(name, description, mode || 'CONTRACTOR');
    res.json({ id: info.lastInsertRowid });
  });

  app.post("/api/projects/:id/items", (req, res) => {
    const { norm_id, quantity } = req.body;
    const info = db.prepare("INSERT INTO boq_items (project_id, norm_id, quantity) VALUES (?, ?, ?)").run(req.params.id, norm_id, quantity);
    res.json({ id: info.lastInsertRowid });
  });

  app.delete("/api/boq-items/:id", (req, res) => {
    db.prepare("DELETE FROM boq_items WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith('/api')) {
        return next();
      }
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
      if (req.originalUrl.startsWith('/api')) {
        return next();
      }
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  // 404 for API
  app.use("/api/*", (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.originalUrl}` });
  });

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:\${PORT}`);
  });
}

startServer();
