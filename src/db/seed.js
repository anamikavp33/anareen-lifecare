/**
 * Seeds the database with departments, doctors and demo accounts.
 * Run with:  npm run seed          (only seeds an empty database)
 *            npm run seed -- --reset   (wipes everything first)
 */
const bcrypt = require("bcryptjs");

const DEPARTMENTS = [
  { name: "General Medicine", slug: "general-medicine", icon: "🩺", description: "Primary care, fever, diabetes and lifestyle conditions." },
  { name: "Pediatrics", slug: "pediatrics", icon: "👶", description: "Care for newborns, children and adolescents." },
  { name: "Gynaecology", slug: "gynaecology", icon: "🤰", description: "Women's health, pregnancy and maternity care." },
  { name: "Cardiology", slug: "cardiology", icon: "❤️", description: "Heart health, ECG and cardiac consultations." },
  { name: "Orthopedics", slug: "orthopedics", icon: "🦴", description: "Bones, joints, fractures and sports injuries." },
  { name: "ENT", slug: "ent", icon: "👂", description: "Ear, nose and throat conditions." },
  { name: "Dermatology", slug: "dermatology", icon: "🧴", description: "Skin, hair and nail care." },
  { name: "Neurology", slug: "neurology", icon: "🧠", description: "Brain, spine and nervous system disorders." },
];

// Fictional demo doctors.
const DOCTORS = [
  ["general-medicine", "Dr. Arun Menon", "MBBS, MD (General Medicine)", "101", 8, "arun"],
  ["general-medicine", "Dr. Fathima Rahman", "MBBS, DNB (Family Medicine)", "102", 10, "fathima"],
  ["pediatrics", "Dr. Meera Nair", "MBBS, DCH, MD (Pediatrics)", "201", 12, "meera"],
  ["pediatrics", "Dr. Joseph Thomas", "MBBS, MD (Pediatrics)", "202", 10, "joseph"],
  ["gynaecology", "Dr. Lakshmi Varma", "MBBS, MS (OBG)", "203", 15, "lakshmi"],
  ["cardiology", "Dr. Rajesh Pillai", "MD, DM (Cardiology)", "301", 15, "rajesh"],
  ["orthopedics", "Dr. Sanjay Kurian", "MBBS, MS (Ortho)", "302", 12, "sanjay"],
  ["ent", "Dr. Anjali Das", "MBBS, MS (ENT)", "105", 8, "anjali"],
  ["dermatology", "Dr. Nisha George", "MBBS, MD (DVL)", "106", 10, "nisha"],
  ["neurology", "Dr. Vivek Krishnan", "MD, DM (Neurology)", "303", 20, "vivek"],
];

const DEMO_PASSWORDS = { admin: "Admin@123", reception: "Reception@123", doctor: "Doctor@123" };

function seedDatabase(db, { reset = false, rounds = 10 } = {}) {
  if (reset) {
    db.exec("DELETE FROM audit_log; DELETE FROM token_events; DELETE FROM users; DELETE FROM doctors; DELETE FROM departments;");
    db.exec("DELETE FROM sqlite_sequence;");
  }
  const count = db.prepare("SELECT COUNT(*) AS n FROM departments").get().n;
  if (count > 0) return { seeded: false };

  const hash = (p) => bcrypt.hashSync(p, rounds);
  const insertDept = db.prepare("INSERT INTO departments (name, slug, icon, description) VALUES (@name, @slug, @icon, @description)");
  const insertDoc = db.prepare(
    "INSERT INTO doctors (department_id, name, designation, room, avg_consult_min, status) VALUES (?, ?, ?, ?, ?, 'unavailable')"
  );
  const insertUser = db.prepare("INSERT INTO users (username, password_hash, role, doctor_id) VALUES (?, ?, ?, ?)");

  const tx = db.transaction(() => {
    const deptIds = {};
    for (const d of DEPARTMENTS) deptIds[d.slug] = insertDept.run(d).lastInsertRowid;

    insertUser.run("admin", hash(DEMO_PASSWORDS.admin), "admin", null);
    insertUser.run("reception", hash(DEMO_PASSWORDS.reception), "reception", null);

    const doctorHash = hash(DEMO_PASSWORDS.doctor);
    for (const [slug, name, designation, room, avg, login] of DOCTORS) {
      const id = insertDoc.run(deptIds[slug], name, designation, room, avg).lastInsertRowid;
      insertUser.run(`dr.${login}`, doctorHash, "doctor", id);
    }
  });
  tx();
  return { seeded: true };
}

module.exports = { seedDatabase, DEMO_PASSWORDS };

if (require.main === module) {
  const config = require("../config");
  const { openDatabase } = require("./index");
  const db = openDatabase(config.dbPath);
  const result = seedDatabase(db, { reset: process.argv.includes("--reset") });
  if (result.seeded) {
    console.log("Database seeded.");
    console.log("  admin      / " + DEMO_PASSWORDS.admin);
    console.log("  reception  / " + DEMO_PASSWORDS.reception);
    console.log("  dr.arun, dr.meera, ... / " + DEMO_PASSWORDS.doctor);
    console.log("Change these passwords before any real use.");
  } else {
    console.log("Database already has data. Use `npm run seed -- --reset` to start over.");
  }
  db.close();
}
