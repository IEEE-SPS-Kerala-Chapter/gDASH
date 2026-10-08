/**
 * Ambassador sheet import: a CSV with Name and College columns, one
 * ambassador per row. Row order sets the IDs — the first ambassador is
 * AMGIG-00, the next AMGIG-01, and so on (see
 * supabase/migrations/20261009000000_ambassador_sheet_import.sql).
 */

export const AMBASSADOR_SHEET_TEMPLATE = "Name,College\n";
export const MAX_SHEET_ROWS = 1000;

// Exact header names only, so a first data row like "Anu, FISAT College"
// isn't mistaken for a header.
const NAME_HEADERS = ["name", "full name", "ambassador name", "name of ambassador", "name of the ambassador"];
const COLLEGE_HEADERS = ["college", "college name", "name of college", "name of the college", "institution"];

export type SheetRow = {
  /** Line in the file, for error messages. */
  line: number;
  name: string;
  college: string;
  error: string | null;
};

export type ParsedSheet = { rows: SheetRow[]; error: string | null };

/** RFC 4180-style CSV: quoted fields, "" escapes, commas and newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Reads the sheet. A header row naming the "Name" and "College" columns is
 * used when present (any order, extra columns ignored); without one, the
 * first column is the name and the second the college. Blank rows are
 * skipped and don't use up an ID.
 */
export function parseAmbassadorSheet(text: string): ParsedSheet {
  const table = parseCsv(text.replace(/^﻿/, ""));
  if (table.length === 0) return { rows: [], error: "The file is empty." };

  const header = table[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));
  const nameCol = header.findIndex((h) => NAME_HEADERS.includes(h));
  const collegeCol = header.findIndex((h) => COLLEGE_HEADERS.includes(h));
  const hasHeader = nameCol !== -1 || collegeCol !== -1;
  if (hasHeader && nameCol === -1) {
    return { rows: [], error: "The sheet needs a “Name” column." };
  }
  const nameAt = hasHeader ? nameCol : 0;
  const collegeAt = hasHeader ? collegeCol : 1;

  const rows: SheetRow[] = [];
  table.forEach((cells, i) => {
    if (hasHeader && i === 0) return;
    if (cells.every((c) => c.trim() === "")) return;
    const name = (cells[nameAt] ?? "").trim().replace(/\s+/g, " ");
    const college = collegeAt === -1 ? "" : (cells[collegeAt] ?? "").trim().replace(/\s+/g, " ");
    let error: string | null = null;
    if (!name) error = "Name is missing.";
    else if (name.length > 80) error = "Name is longer than 80 characters.";
    else if (college && (college.length < 2 || college.length > 120)) error = "College must be 2 to 120 characters.";
    rows.push({ line: i + 1, name, college, error });
  });

  if (rows.length === 0) return { rows, error: "The sheet has no ambassadors in it." };
  if (rows.length > MAX_SHEET_ROWS) {
    return { rows, error: `The sheet has ${rows.length} ambassadors; the most IDs available is ${MAX_SHEET_ROWS}.` };
  }
  return { rows, error: null };
}
