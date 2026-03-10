import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

/**
 * Find the metadata YAML file path for a given database file.
 * Convention: data/demo.db → data/demo-metadata.yaml
 */
export function findMetadataPath(dbFilePath: string): string | null {
  const dir = path.dirname(dbFilePath);
  const ext = path.extname(dbFilePath);
  const base = path.basename(dbFilePath, ext);
  const metadataPath = path.join(dir, `${base}-metadata.yaml`);
  try {
    fs.accessSync(metadataPath, fs.constants.R_OK);
    return metadataPath;
  } catch {
    return null;
  }
}

/**
 * Parse a YAML document object into a prompt-friendly markdown string.
 */
function formatSemanticDoc(doc: any): string | null {
  if (!doc) return null;

  const sections: string[] = [];

  // Database overview
  if (doc.database) {
    sections.push(`### Database Overview\n${doc.database.description || doc.database.name || ''}`);
  }

  // Key business metrics
  if (doc.key_metrics && Array.isArray(doc.key_metrics)) {
    const metrics = doc.key_metrics.map((m: any) =>
      `- **${m.name}**: ${m.description}\n  Formula: \`${m.formula}\``
    ).join('\n');
    sections.push(`### Key Business Metrics\n${metrics}`);
  }

  // Table descriptions with column annotations
  if (doc.tables) {
    const tableEntries: string[] = [];
    for (const [tableName, meta] of Object.entries(doc.tables) as [string, any][]) {
      const lines: string[] = [];
      lines.push(`**${tableName}**: ${meta.description || ''}`);
      if (meta.business_context) {
        lines.push(`  Context: ${meta.business_context}`);
      }
      if (meta.columns) {
        for (const [colName, colMeta] of Object.entries(meta.columns) as [string, any][]) {
          if (typeof colMeta === 'string') {
            lines.push(`  - \`${colName}\`: ${colMeta}`);
          } else if (colMeta && typeof colMeta === 'object') {
            const desc = colMeta.description || '';
            let detail = desc;
            if (colMeta.values) {
              if (Array.isArray(colMeta.values)) {
                detail += ` — values: ${colMeta.values.join(', ')}`;
              } else {
                const mapped = Object.entries(colMeta.values)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(', ');
                detail += ` — values: ${mapped}`;
              }
            }
            if (colMeta.ordering) {
              detail += ` (ordering: ${colMeta.ordering})`;
            }
            if (colMeta.business_rule) {
              detail += ` [Rule: ${colMeta.business_rule}]`;
            }
            lines.push(`  - \`${colName}\`: ${detail}`);
          }
        }
      }
      tableEntries.push(lines.join('\n'));
    }
    sections.push(`### Table Descriptions\n${tableEntries.join('\n\n')}`);
  }

  // Example queries
  if (doc.example_queries && Array.isArray(doc.example_queries)) {
    const examples = doc.example_queries.map((q: any) => {
      let entry = `- **${q.question}**\n  \`\`\`sql\n  ${q.sql.trim()}\n  \`\`\``;
      if (q.notes) entry += `\n  _${q.notes}_`;
      return entry;
    }).join('\n');
    sections.push(`### Example Queries\n${examples}`);
  }

  return sections.length > 0 ? sections.join('\n\n') : null;
}

/**
 * Load a semantic YAML metadata file and format it as a prompt-friendly markdown string.
 * Returns null if the file is missing or parsing fails.
 */
export function loadSemanticContext(filePath: string): string | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const doc = yaml.load(raw) as any;
    return formatSemanticDoc(doc);
  } catch {
    return null;
  }
}

/**
 * Parse YAML content from a string (e.g. from db_connections.semantic_context).
 * Used for MSSQL connections where YAML is stored in the database.
 */
export function loadSemanticContextFromString(yamlContent: string): string | null {
  try {
    const doc = yaml.load(yamlContent) as any;
    return formatSemanticDoc(doc);
  } catch {
    return null;
  }
}
