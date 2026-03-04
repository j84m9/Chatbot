import jsPDF from 'jspdf';

interface ExportExchange {
  question: string;
  sql: string | null;
  explanation: string | null;
  results: {
    rows: Record<string, any>[];
    columns: string[];
    types: Record<string, string>;
    rowCount: number;
    executionTimeMs: number;
  } | null;
  insights?: string | null;
}

function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth) as string[];
}

export async function exportDataExplorerPdf(
  exchange: ExportExchange,
  chartImages?: string[] // base64 PNG strings from Plotly.toImage
): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;
  let y = margin;

  const checkPageBreak = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(exchange.question, margin, y);
  y += 10;

  // Metadata
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  const meta: string[] = [];
  if (exchange.results) {
    meta.push(`${exchange.results.rowCount.toLocaleString()} rows`);
    meta.push(`${exchange.results.executionTimeMs}ms`);
  }
  meta.push(new Date().toLocaleDateString());
  doc.text(meta.join('  |  '), margin, y);
  y += 6;

  // Explanation
  if (exchange.explanation) {
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(10);
    const lines = wrapText(doc, exchange.explanation, contentWidth);
    checkPageBreak(lines.length * 5);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 4;
  }

  // KPI Summary (text-based since we can't render React in PDF)
  if (exchange.results && exchange.results.rows.length === 1) {
    checkPageBreak(15);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text('Key Metrics', margin, y);
    y += 6;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const row = exchange.results.rows[0];
    const cols = exchange.results.columns;
    for (const col of cols) {
      const val = row[col];
      if (typeof val === 'number') {
        checkPageBreak(6);
        doc.text(`${col}: ${val.toLocaleString()}`, margin + 4, y);
        y += 5;
      }
    }
    y += 4;
  }

  // Chart images
  if (chartImages && chartImages.length > 0) {
    for (const img of chartImages) {
      checkPageBreak(70);
      try {
        doc.addImage(img, 'PNG', margin, y, contentWidth, 60);
        y += 65;
      } catch {
        // Skip invalid images
      }
    }
  }

  // Data table (first 50 rows)
  if (exchange.results && exchange.results.rows.length > 0) {
    checkPageBreak(20);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text('Data', margin, y);
    y += 6;

    const cols = exchange.results.columns;
    const rows = exchange.results.rows.slice(0, 50);
    const colWidth = Math.min(contentWidth / cols.length, 40);

    // Header
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60, 60, 60);
    checkPageBreak(8);
    cols.forEach((col, i) => {
      doc.text(col.substring(0, 15), margin + i * colWidth, y, { maxWidth: colWidth - 2 });
    });
    y += 4;

    // Draw header line
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, margin + cols.length * colWidth, y);
    y += 2;

    // Rows
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    for (const row of rows) {
      checkPageBreak(5);
      cols.forEach((col, i) => {
        const val = row[col] === null ? '' : String(row[col]).substring(0, 20);
        doc.text(val, margin + i * colWidth, y, { maxWidth: colWidth - 2 });
      });
      y += 4;
    }

    if (exchange.results.rows.length > 50) {
      y += 2;
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(`... and ${(exchange.results.rows.length - 50).toLocaleString()} more rows`, margin, y);
      y += 6;
    }
  }

  // SQL
  if (exchange.sql) {
    checkPageBreak(20);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text('SQL Query', margin, y);
    y += 6;

    doc.setFontSize(8);
    doc.setFont('courier', 'normal');
    doc.setTextColor(80, 80, 80);
    const sqlLines = wrapText(doc, exchange.sql, contentWidth);
    for (const line of sqlLines) {
      checkPageBreak(4);
      doc.text(line, margin, y);
      y += 4;
    }
    y += 4;
  }

  // Insights
  if (exchange.insights && exchange.insights !== 'Generating insights...') {
    checkPageBreak(20);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text('Insights', margin, y);
    y += 6;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    const insightLines = wrapText(doc, exchange.insights, contentWidth);
    for (const line of insightLines) {
      checkPageBreak(4);
      doc.text(line, margin, y);
      y += 4;
    }
  }

  // Save
  const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  doc.save(`query-report-${ts}.pdf`);
}
