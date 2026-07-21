#!/usr/bin/env node
/**
 * Publish repo data/ to Supabase.  SUPABASE_SERVICE_ROLE_KEY must be set in the
 * environment — never passed as an argument, never stored, never logged.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { programToRow, catalogToRow, ratingsToRows } from "./push-transforms.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = JSON.parse(await readFile(path.join(ROOT, "supabase", "project.json"), "utf8"));
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY in the environment (Supabase dashboard → Project Settings → API).");
  process.exit(1);
}
const db = createClient(process.env.SUPABASE_URL ?? project.url, serviceKey, { auth: { persistSession: false } });
const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));
const die = (label, error) => { console.error(`${label}: ${error.message}`); process.exit(1); };

const curriculaDir = path.join(ROOT, "data", "curricula");
const programFiles = (await readdir(curriculaDir)).filter((f) => f.endsWith(".json") && f !== "index.json");
for (const file of programFiles) {
  const { error } = await db.from("programs").upsert(programToRow(await readJson(path.join(curriculaDir, file))));
  if (error) die(`programs ← ${file}`, error);
}
console.log(`programs: upserted ${programFiles.length}`);

const catalogsDir = path.join(ROOT, "data", "catalogs");
const catalogFiles = (await readdir(catalogsDir)).filter((f) => /^catalog-.*\.json$/.test(f));
for (const file of catalogFiles) {
  const { error } = await db.from("catalogs").upsert(catalogToRow(await readJson(path.join(catalogsDir, file))));
  if (error) die(`catalogs ← ${file}`, error);
}
console.log(`catalogs: upserted ${catalogFiles.length}`);

const rows = ratingsToRows(await readJson(path.join(ROOT, "data", "prof-ratings.json")));
{
  const { error } = await db.from("community_ratings").delete().gte("id", 0);
  if (error) die("community_ratings delete", error);
}
if (rows.length > 0) {
  const { error } = await db.from("community_ratings").insert(rows);
  if (error) die("community_ratings insert", error);
}
console.log(`community_ratings: replaced with ${rows.length} row(s)`);
