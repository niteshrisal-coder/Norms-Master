import Database from "better-sqlite3";
const db = new Database("norms.db");
const norms = db.prepare("SELECT id, type, ref_ss, description FROM norms ORDER BY type, ref_ss").all();
console.log(JSON.stringify(norms, null, 2));
