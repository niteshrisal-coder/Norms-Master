import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from 'url';
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("norms.db");

// --- Interfaces for TypeScript Safety ---
interface CountResult {
  count: number;
}

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS norms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, 
    description TEXT NOT NULL,
    unit TEXT NOT NULL,
    basis_quantity REAL DEFAULT 1.0,
    ref_ss TEXT
  );

  CREATE TABLE IF NOT EXISTS norm_resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    norm_id INTEGER NOT NULL,
    resource_type TEXT NOT NULL, 
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
    mode TEXT DEFAULT 'CONTRACTOR',
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
  app.use(express.json({ limit: '10mb' })); 
  const PORT = 3000;

  // --- Migrations ---
  const runMigration = (sql: string) => {
    try { db.prepare(sql).run(); } catch (e) { /* Column already exists */ }
  };

  runMigration("ALTER TABLE norm_resources ADD COLUMN unit TEXT");
  runMigration("ALTER TABLE norms ADD COLUMN basis_quantity REAL DEFAULT 1.0");
  runMigration("ALTER TABLE rates ADD COLUMN apply_vat INTEGER DEFAULT 0");
  runMigration("ALTER TABLE norm_resources ADD COLUMN is_percentage INTEGER DEFAULT 0");
  runMigration("ALTER TABLE norm_resources ADD COLUMN percentage_base TEXT");
  runMigration("ALTER TABLE projects ADD COLUMN mode TEXT DEFAULT 'CONTRACTOR'");

  // --- API Routes ---

  // Health Check
  app.get("/api/health", (req, res) => {
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      // FIXED: Type assertion using CountResult interface
      const normCount = db.prepare("SELECT COUNT(*) as count FROM norms").get() as CountResult;
      
      res.json({ 
        status: "ok", 
        tables,
        normCount: normCount ? normCount.count : 0
      });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // Norms
  app.get("/api/norms", (req, res) => {
    try {
      const norms = db.prepare("SELECT * FROM norms").all();
      const result = norms.map((norm: any) => {
        const resources = db.prepare("SELECT * FROM norm_resources WHERE norm_id = ?").all(norm.id);
        return { ...norm, resources };
      });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/norms", (req, res) => {
    try {
      const { type, description, unit, basis_quantity, ref_ss, resources } = req.body;
      
      if (!type || !description || !unit || !Array.isArray(resources)) {
        return res.status(400).json({ error: "Invalid data provided" });
      }
      
      const insertNorm = db.prepare("INSERT INTO norms (type, description, unit, basis_quantity, ref_ss) VALUES (?, ?, ?, ?, ?)");
      const insertResource = db.prepare("INSERT INTO norm_resources (norm_id, resource_type, name, unit, quantity, is_percentage, percentage_base) VALUES (?, ?, ?, ?, ?, ?, ?)");
      const checkRate = db.prepare("SELECT * FROM rates WHERE name = ?");
      const insertRate = db.prepare("INSERT INTO rates (resource_type, name, unit, rate) VALUES (?, ?, ?, ?)");
      const updateRateMeta = db.prepare("UPDATE rates SET resource_type = ?, unit = ? WHERE name = ?");
      
      const transaction = db.transaction(() => {
        const info = insertNorm.run(type, description, unit, basis_quantity || 1.0, ref_ss);
        const normId = info.lastInsertRowid;
        
        for (const resource of resources) {
          const resourceType = resource.resource_type || resource.type;
          insertResource.run(
            normId, 
            resourceType, 
            resource.name, 
            resource.unit || '-', 
            resource.quantity, 
            resource.is_percentage ? 1 : 0, 
            resource.percentage_base || null
          );
          
          if (!resource.is_percentage) {
            const existingRate = checkRate.get(resource.name);
            if (!existingRate) {
              insertRate.run(resourceType, resource.name, resource.unit || '-', 0);
            } else {
              updateRateMeta.run(resourceType, resource.unit || (existingRate as any).unit, resource.name);
            }
          }
        }
        return normId;
      });
      
      const normId = transaction();
      res.json({ id: normId, success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/norms/:id", (req, res) => {
    const { id } = req.params;
    const { type, description, unit, basis_quantity, ref_ss, resources } = req.body;
    try {
      const transaction = db.transaction(() => {
        db.prepare("UPDATE norms SET type = ?, description = ?, unit = ?, basis_quantity = ?, ref_ss = ? WHERE id = ?")
          .run(type, description, unit, basis_quantity || 1.0, ref_ss, id);
        db.prepare("DELETE FROM norm_resources WHERE norm_id = ?").run(id);
        
        for (const resource of resources) {
          const resourceType = resource.resource_type || resource.type;
          db.prepare("INSERT INTO norm_resources (norm_id, resource_type, name, unit, quantity, is_percentage, percentage_base) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .run(id, resourceType, resource.name, resource.unit, resource.quantity, resource.is_percentage ? 1 : 0, resource.percentage_base || null);
        }
      });
      transaction();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/norms/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM norms WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Rates
  app.get("/api/rates", (req, res) => {
    try {
      res.json(db.prepare("SELECT * FROM rates").all());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/rates", (req, res) => {
    const { resource_type, name, unit, rate, apply_vat } = req.body;
    try {
      const info = db.prepare("INSERT INTO rates (resource_type, name, unit, rate, apply_vat) VALUES (?, ?, ?, ?, ?)")
        .run(resource_type, name, unit, rate, apply_vat ? 1 : 0);
      res.json({ id: info.lastInsertRowid });
    } catch (e) {
      res.status(400).json({ error: "Resource name already exists" });
    }
  });

  app.put("/api/rates/:id", (req, res) => {
    const { resource_type, name, unit, rate, apply_vat } = req.body;
    try {
      db.prepare("UPDATE rates SET resource_type = ?, name = ?, unit = ?, rate = ?, apply_vat = ? WHERE id = ?")
        .run(resource_type, name, unit, rate, apply_vat ? 1 : 0, req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/rates/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM rates WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Projects
  app.get("/api/projects", (req, res) => {
    try {
      res.json(db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/projects/:id", (req, res) => {
    try {
      const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
      if (!project) return res.status(404).json({ error: "Project not found" });
      
      const items = db.prepare(`
        SELECT b.*, n.description, n.unit, n.basis_quantity, n.ref_ss 
        FROM boq_items b 
        JOIN norms n ON b.norm_id = n.id 
        WHERE b.project_id = ?
      `).all(req.params.id);
      
const itemsWithResources = items.map((item: any) => { // Force 'any' here
  const resources = db.prepare("SELECT * FROM norm_resources WHERE norm_id = ?").all(item.norm_id);
  return { ...item, resources };
});
res.json({ ...(project as any), items: itemsWithResources });    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/projects", (req, res) => {
    const { name, description, mode } = req.body;
    try {
      const info = db.prepare("INSERT INTO projects (name, description, mode) VALUES (?, ?, ?)")
        .run(name, description, mode || 'CONTRACTOR');
      res.json({ id: info.lastInsertRowid });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Vite/Static File Handling
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