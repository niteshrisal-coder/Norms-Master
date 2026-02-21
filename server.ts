import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from 'url';
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database initialization - ALWAYS DECODE BASE64 IF AVAILABLE
let db;
const DB_PATH = "norms.db";
const B64_PATH = "norms.db.b64";

// Log what files exist
console.log("📁 Files in directory:", fs.readdirSync('.').join(', '));

// ALWAYS decode base64 file if it exists (this ensures we have a fresh copy)
if (fs.existsSync(B64_PATH)) {
  console.log("🔓 Found base64 encoded database, decoding (this will overwrite any existing norms.db)...");
  try {
    const base64Data = fs.readFileSync(B64_PATH, 'utf8');
    const binaryData = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(DB_PATH, binaryData);
    console.log("✅ Database decoded successfully from base64");
  } catch (error) {
    console.error("❌ Failed to decode base64 database:", error.message);
  }
}

// Now try to open the database
if (fs.existsSync(DB_PATH)) {
  try {
    // Try to open existing database
    db = new Database(DB_PATH);
    // Test if database is valid
    db.prepare("SELECT 1").get();
    
    // Count norms to verify data
    const count = db.prepare("SELECT COUNT(*) as count FROM norms").get();
    console.log(`✅ Database opened successfully with ${count.count} norms`);
  } catch (error) {
    console.log("⚠️ Error opening database:", error.message);
    db = null;
    
    // Delete corrupted file
    try {
      fs.unlinkSync(DB_PATH);
      console.log("🗑️ Corrupted database file deleted");
    } catch (e) {}
  }
}

// If no valid database exists, try decoding one more time from base64
if (!db && fs.existsSync(B64_PATH)) {
  console.log("🔄 Retrying decode from base64...");
  try {
    const base64Data = fs.readFileSync(B64_PATH, 'utf8');
    const binaryData = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(DB_PATH, binaryData);
    console.log("✅ Database decoded on retry");
    
    // Try opening again
    db = new Database(DB_PATH);
    const count = db.prepare("SELECT COUNT(*) as count FROM norms").get();
    console.log(`✅ Now opened with ${count.count} norms`);
  } catch (error) {
    console.error("❌ Retry failed:", error.message);
  }
}

// If still no valid database, create fresh one (should not happen)
if (!db) {
  console.log("📦 Creating fresh database as last resort...");
  db = new Database(DB_PATH);
  console.log("✅ Fresh database created");
}

// Initialize Database Tables (only if fresh)
try {
  // Check if tables exist by looking for norms table
  const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='norms'").get();
  
  if (!tableCheck) {
    console.log("📊 Creating database tables...");
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
    console.log("✅ Database tables initialized");
  } else {
    console.log("✅ Database tables already exist");
  }
} catch (error) {
  console.error("❌ Failed to initialize tables:", error);
}

async function startServer() {
  console.log("Starting server...");
  const app = express();
  app.use(express.json());
  
  const PORT = process.env.PORT || 3000;

  // Run migrations safely
  try { db.prepare("ALTER TABLE norm_resources ADD COLUMN unit TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE norms ADD COLUMN basis_quantity REAL DEFAULT 1.0").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE rates ADD COLUMN apply_vat INTEGER DEFAULT 0").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE norm_resources ADD COLUMN is_percentage INTEGER DEFAULT 0").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE norm_resources ADD COLUMN percentage_base TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE projects ADD COLUMN mode TEXT DEFAULT 'CONTRACTOR'").run(); } catch (e) {}

  // Health Check
  app.get("/api/health", (req, res) => {
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      const normsCount = db.prepare("SELECT COUNT(*) as count FROM norms").get();
      res.json({ 
        status: "ok", 
        tables,
        normsCount: normsCount.count
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
      
      const existingRate = checkRate.get(resource.name);
      if (!existingRate) {
        insertRate.run(resource.resource_type, resource.name, resource.unit || '-', 0);
      } else {
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
      
      const existingRate = checkRate.get(resource.name);
      if (!existingRate) {
        insertRate.run(resource.resource_type, resource.name, resource.unit || '-', 0);
      } else {
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
    try {
      res.json(db.prepare("SELECT * FROM rates").all());
    } catch (e: any) {
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
    try {
      res.json(db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all());
    } catch (e: any) {
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
    console.log(`🚀 Server running on port ${PORT}`);
    const count = db.prepare("SELECT COUNT(*) as count FROM norms").get();
    console.log(`📊 Database has ${count.count} norms`);
  });
}

startServer().catch(err => {
  console.error("❌ Failed to start server:", err);
  process.exit(1);
});