interface ExportMessage {
  role: string;
  parts?: Array<{ type: string; text?: string }>;
}

function extractText(msg: ExportMessage): string {
  return msg.parts?.map(p => (p.type === 'text' ? p.text : '')).join('') || '';
}

function roleLabel(role: string): string {
  return role === 'user' ? 'You' : 'Assistant';
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportChatAsText(messages: ExportMessage[], title: string) {
  const header = `Chat: ${title}\nExported: ${new Date().toLocaleString()}\n${'='.repeat(50)}\n\n`;
  const body = messages
    .map(m => `[${roleLabel(m.role)}]\n${extractText(m)}`)
    .join('\n\n---\n\n');

  const blob = new Blob([header + body], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, `${title.replace(/[^a-zA-Z0-9]/g, '_')}.txt`);
}

export async function exportChatAsPdf(messages: ExportMessage[], title: string) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const addPageIfNeeded = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, margin, y);
  y += 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120);
  doc.text(`Exported ${new Date().toLocaleString()}`, margin, y);
  y += 10;
  doc.setTextColor(0);

  // Separator
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  for (const msg of messages) {
    const label = roleLabel(msg.role);
    const text = extractText(msg);

    // Role label
    addPageIfNeeded(12);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(msg.role === 'user' ? 79 : 100, msg.role === 'user' ? 70 : 100, msg.role === 'user' ? 229 : 100);
    doc.text(label, margin, y);
    y += 5;

    // Message text
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30);
    const lines = doc.splitTextToSize(text, maxWidth);
    for (const line of lines) {
      addPageIfNeeded(5);
      doc.text(line, margin, y);
      y += 5;
    }
    y += 6;
  }

  doc.save(`${title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
}
