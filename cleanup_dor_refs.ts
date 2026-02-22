import { Database } from "better-sqlite3";

const db = new Database("norms.db");

const cleanup = db.transaction(() => {
  const dorNorms = db.prepare("SELECT id, ref_ss, description FROM norms WHERE type = 'DOR'").all();
  
  for (const norm of dorNorms) {
    let newRef = norm.ref_ss;
    // If it's a comma separated list, take the first part which is usually the specific clause, 
    // or if it's like "20.1,2000", maybe we want "2000" as the section?
    // Actually, DOR norms are usually referred to by Section (100, 200, etc.)
    // Let's try to extract the main section number.
    
    if (norm.ref_ss.includes(',')) {
      const parts = norm.ref_ss.split(',');
      // If one of the parts is a 3 or 4 digit number, it's likely the section.
      const section = parts.find(p => /^\d{3,4}$/.test(p.trim()));
      if (section) {
        newRef = section.trim();
      } else {
        newRef = parts[0].trim();
      }
    }
    
    db.prepare("UPDATE norms SET ref_ss = ? WHERE id = ?").run(newRef, norm.id);
  }
});

cleanup();
console.log("DOR norms ref_ss cleaned up.");
