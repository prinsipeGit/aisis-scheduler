#!/usr/bin/env node
/**
 * Publish repo data/ to Supabase.  SUPABASE_SERVICE_ROLE_KEY must be set in the
 * environment — never passed as an argument, never stored, never logged.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { programToRow, catalogToRow, ratingsToRows, orphanKeys } from "./push-transforms.mjs";

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
const programIds = [];
for (const file of programFiles) {
  const row = programToRow(await readJson(path.join(curriculaDir, file)));
  programIds.push(row.id);
  const { error } = await db.from("programs").upsert(row);
  if (error) die(`programs ← ${file}`, error);
}
console.log(`programs: upserted ${programFiles.length}`);
{
  const { data, error } = await db.from("programs").select("id");
  if (error) die("programs select", error);
  const orphans = orphanKeys(data.map((r) => r.id), programIds);
  if (orphans.length > 0) {
    const { error } = await db.from("programs").delete().in("id", orphans);
    if (error) die("programs delete", error);
  }
  console.log(`programs: removed ${orphans.length} orphan(s)`);
}

const catalogsDir = path.join(ROOT, "data", "catalogs");
const catalogFiles = (await readdir(catalogsDir)).filter((f) => /^catalog-.*\.json$/.test(f));
const catalogTerms = [];
for (const file of catalogFiles) {
  const row = catalogToRow(await readJson(path.join(catalogsDir, file)));
  catalogTerms.push(row.term);
  const { error } = await db.from("catalogs").upsert(row);
  if (error) die(`catalogs ← ${file}`, error);
}
console.log(`catalogs: upserted ${catalogFiles.length}`);
{
  const { data, error } = await db.from("catalogs").select("term");
  if (error) die("catalogs select", error);
  const orphans = orphanKeys(data.map((r) => r.term), catalogTerms);
  if (orphans.length > 0) {
    const { error } = await db.from("catalogs").delete().in("term", orphans);
    if (error) die("catalogs delete", error);
  }
  console.log(`catalogs: removed ${orphans.length} orphan(s)`);
}

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
