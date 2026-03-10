import { SchemaTable } from '../mssql/connection';

export interface TableMetadataRow {
  id: string;
  connection_id: string;
  user_id: string;
  table_schema: string;
  table_name: string;
  auto_description: string | null;
  user_description: string | null;
  tags: string[];
  category: string | null;
  relationship_summary: string | null;
  estimated_row_count: number | null;
  auto_cataloged_at: string | null;
}

export interface CatalogEntry {
  schema: string;
  name: string;
  qualifiedName: string;
  description: string | null;
  tags: string[];
  category: string | null;
  primaryKeys: string[];
  foreignKeyTargets: string[];
  estimatedRowCount: number | null;
}

/**
 * Merge schema tables with metadata rows into catalog entries.
 */
export function buildCatalog(
  schema: SchemaTable[],
  metadataRows: TableMetadataRow[]
): CatalogEntry[] {
  const metaMap = new Map<string, TableMetadataRow>();
  for (const row of metadataRows) {
    const key = `${row.table_schema.toLowerCase()}.${row.table_name.toLowerCase()}`;
    metaMap.set(key, row);
  }

  return schema.map((table) => {
    const key = `${table.schema.toLowerCase()}.${table.name.toLowerCase()}`;
    const meta = metaMap.get(key);

    const primaryKeys = table.columns
      .filter((c) => c.isPrimaryKey)
      .map((c) => c.name);

    const foreignKeyTargets = (table.foreignKeys || []).map((fk) => fk.toTable);

    // user_description takes priority over auto_description
    const description = meta?.user_description || meta?.auto_description || null;

    return {
      schema: table.schema,
      name: table.name,
      qualifiedName: `[${table.schema}].[${table.name}]`,
      description,
      tags: meta?.tags || [],
      category: meta?.category || null,
      primaryKeys,
      foreignKeyTargets: [...new Set(foreignKeyTargets)],
      estimatedRowCount: meta?.estimated_row_count ?? null,
    };
  });
}

/**
 * Build a compact text catalog for the system prompt.
 * ~80 tokens per table, so 500 tables ≈ 15-20K tokens.
 */
export function buildCatalogText(
  schema: SchemaTable[],
  metadataRows: TableMetadataRow[]
): string {
  const catalog = buildCatalog(schema, metadataRows);

  const lines = catalog.map((entry) => {
    const parts: string[] = [entry.qualifiedName];

    if (entry.description) {
      parts.push(`| ${entry.description}`);
    }

    if (entry.primaryKeys.length > 0) {
      parts.push(`| PK: ${entry.primaryKeys.join(', ')}`);
    }

    if (entry.foreignKeyTargets.length > 0) {
      parts.push(`| -> ${entry.foreignKeyTargets.join(', ')}`);
    }

    if (entry.estimatedRowCount !== null) {
      parts.push(`| ~${formatRowCount(entry.estimatedRowCount)} rows`);
    }

    return parts.join(' ');
  });

  return `## Table Catalog (${catalog.length} tables)\n${lines.join('\n')}`;
}

/**
 * Search catalog entries by keyword against names and descriptions.
 */
export function searchCatalog(
  catalog: CatalogEntry[],
  keyword: string
): CatalogEntry[] {
  const lower = keyword.toLowerCase();
  return catalog.filter((entry) => {
    if (entry.name.toLowerCase().includes(lower)) return true;
    if (entry.schema.toLowerCase().includes(lower)) return true;
    if (entry.description?.toLowerCase().includes(lower)) return true;
    if (entry.category?.toLowerCase().includes(lower)) return true;
    if (entry.tags.some((t) => t.toLowerCase().includes(lower))) return true;
    return false;
  });
}

/**
 * Build SQL-comment-style description text for injection into full-DDL prompts (small databases).
 * Returns empty string if no descriptions exist.
 */
export function buildDescriptionComments(metadataRows: TableMetadataRow[]): string {
  const lines: string[] = [];
  for (const row of metadataRows) {
    const desc = row.user_description || row.auto_description;
    if (!desc) continue;
    lines.push(`-- [${row.table_schema}].[${row.table_name}]: ${desc}`);
  }
  if (lines.length === 0) return '';
  return `## Table Descriptions\n${lines.join('\n')}`;
}

/**
 * Enrich schema text with column-level profile stats as inline comments.
 * Makes LLM prompts data-aware without additional queries.
 */
export function enrichSchemaWithProfiles(
  schemaText: string,
  profileMap: Record<string, Record<string, any>>,
): string {
  if (Object.keys(profileMap).length === 0) return schemaText;

  const lines = schemaText.split('\n');
  const enrichedLines: string[] = [];

  let currentTable: string | null = null;

  for (const line of lines) {
    // Detect table header lines: "CREATE TABLE [schema].[table]" or "CREATE TABLE "table""
    const tableMatch = line.match(/CREATE TABLE\s+(?:\[?\w+\]?\.)?\[?"?(\w+)"?\]?\s*/i)
      || line.match(/^-- Table: (\w+)/i)
      || line.match(/^(\w+)\s*\(/);

    if (tableMatch) {
      currentTable = tableMatch[1];
    }

    // If we're inside a table and the line defines a column, append profile stats
    if (currentTable && profileMap[currentTable]) {
      const colMatch = line.match(/^\s+\[?"?(\w+)"?\]?\s+([\w()]+)/);
      if (colMatch) {
        const colName = colMatch[1];
        const profile = profileMap[currentTable][colName];
        if (profile) {
          const stats: string[] = [];

          if (profile.min != null && profile.max != null && profile.avg != null) {
            stats.push(`min: ${profile.min}, max: ${profile.max}, avg: ${profile.avg}`);
          }
          if (profile.null_rate != null && profile.null_rate > 0) {
            stats.push(`nulls: ${Math.round(profile.null_rate * 100)}%`);
          }
          if (profile.sample_values && profile.sample_values.length > 0) {
            stats.push(`${profile.distinct_count} values: ${profile.sample_values.join(', ')}`);
          } else if (profile.distinct_count != null && !profile.sample_values) {
            stats.push(`${profile.distinct_count} distinct`);
          }
          if (profile.date_range) {
            stats.push(`range: ${profile.date_range.min} to ${profile.date_range.max}`);
          }

          if (stats.length > 0) {
            enrichedLines.push(`${line}  -- ${stats.join(', ')}`);
            continue;
          }
        }
      }
    }

    enrichedLines.push(line);
  }

  return enrichedLines.join('\n');
}

function formatRowCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}
