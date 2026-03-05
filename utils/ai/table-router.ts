import { generateText, LanguageModel } from 'ai';
import { SchemaTable, schemaToPromptText } from '@/utils/mssql/connection';
import { CatalogEntry } from '@/utils/ai/catalog-builder';

export interface RouteTablesResult {
  didRoute: boolean;
  tableNames?: string[];
  selectedDDL?: string;
}

interface RouteTablesInput {
  model: LanguageModel;
  question: string;
  catalogText: string;
  schema: SchemaTable[];
  catalog: CatalogEntry[];
  dialect: 'tsql' | 'sqlite';
  conversationContext?: string;
}

/**
 * Fast LLM pre-filter: identifies 3-5 relevant tables from the catalog,
 * loads their full DDL, and returns it so the agent can skip discovery steps.
 * Returns { didRoute: false } on any failure — caller falls back to catalog-only mode.
 */
export async function routeTables({
  model,
  question,
  catalogText,
  schema,
  catalog,
  dialect,
  conversationContext,
}: RouteTablesInput): Promise<RouteTablesResult> {
  try {
    let userPrompt = `Question: ${question}`;
    if (conversationContext) {
      userPrompt += `\n\nConversation context:\n${conversationContext}`;
    }

    const result = await generateText({
      model,
      system: `You are a database table router. Given a table catalog and a user question, identify the 3-5 tables most likely needed to answer the question.

Return ONLY a JSON array of table names. Use the exact names from the catalog (e.g. ["Customers", "Orders", "OrderDetails"]).

Rules:
- Include tables needed for JOINs even if not directly mentioned in the question
- Prefer fewer tables when possible — only include what's necessary
- If the question is ambiguous, include the most likely candidates
- Do NOT include explanations, just the JSON array`,
      prompt: `${catalogText}\n\n${userPrompt}`,
      abortSignal: AbortSignal.timeout(10_000),
    });

    const tableNames = parseTableRouterResponse(result.text, catalog);
    if (!tableNames || tableNames.length === 0) {
      return { didRoute: false };
    }

    // Filter schema to selected tables and build DDL
    const nameSet = new Set(tableNames.map((n) => n.toLowerCase()));
    const selectedTables = schema.filter(
      (t) => nameSet.has(t.name.toLowerCase()) || nameSet.has(`${t.schema}.${t.name}`.toLowerCase())
    );

    if (selectedTables.length === 0) {
      return { didRoute: false };
    }

    // Build DDL with description comments prepended
    let ddl = schemaToPromptText(selectedTables, dialect);
    const descLines: string[] = [];
    for (const table of selectedTables) {
      const entry = catalog.find(
        (c) => c.name.toLowerCase() === table.name.toLowerCase() && c.schema.toLowerCase() === table.schema.toLowerCase()
      );
      if (entry?.description) {
        descLines.push(`-- ${entry.qualifiedName}: ${entry.description}`);
      }
    }
    if (descLines.length > 0) {
      ddl = descLines.join('\n') + '\n\n' + ddl;
    }

    return {
      didRoute: true,
      tableNames: selectedTables.map((t) => `${t.schema}.${t.name}`),
      selectedDDL: ddl,
    };
  } catch {
    return { didRoute: false };
  }
}

/**
 * Parse the LLM response into validated table names.
 * Handles markdown fences, schema-qualified names, and validates against catalog.
 */
function parseTableRouterResponse(
  text: string,
  catalog: CatalogEntry[]
): string[] | null {
  let cleaned = text.trim();
  // Strip markdown code fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract a JSON array from the text
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  // Build a lookup of all valid table names (both bare and schema-qualified)
  const validNames = new Map<string, string>();
  for (const entry of catalog) {
    validNames.set(entry.name.toLowerCase(), entry.name);
    validNames.set(`${entry.schema}.${entry.name}`.toLowerCase(), entry.name);
    // Handle bracket-qualified names like [dbo].[Customers]
    validNames.set(`[${entry.schema}].[${entry.name}]`.toLowerCase(), entry.name);
  }

  const matched: string[] = [];
  for (const item of parsed) {
    if (typeof item !== 'string') continue;
    const lower = item.toLowerCase();
    // Strip brackets for lookup
    const stripped = lower.replace(/\[|\]/g, '');
    const found = validNames.get(lower) || validNames.get(stripped);
    if (found && !matched.includes(found)) {
      matched.push(found);
    }
  }

  return matched.length > 0 ? matched : null;
}
