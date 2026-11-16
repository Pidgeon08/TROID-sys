// Shows a generated report in a new tab instead of downloading it straight away. The tab has
// the report (the PDF in the browser's viewer, or each Excel sheet as a table) and a Download
// button; nothing is saved unless the user clicks it.

const STYLE = `
  :root { color-scheme: light; --brand: #1b4de4; --ink: #0f172a; --muted: #64748b; --line: #e2e8f0; --bg: #f1f5f9; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body { font-family: Inter, "Segoe UI", system-ui, sans-serif; background: var(--bg); color: var(--ink); display: flex; flex-direction: column; }
  header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;
    padding: 12px 20px; background: #fff; border-bottom: 1px solid var(--line); }
  .title { min-width: 0; }
  .title h1 { margin: 0; font-size: 16px; font-weight: 700; }
  .title p { margin: 2px 0 0; font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
  .actions { display: flex; gap: 8px; }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
    font-family: inherit; cursor: pointer; text-decoration: none; border: 1px solid var(--line); background: #fff; color: #334155; }
  .btn:hover { background: #f8fafc; }
  .btn.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
  .btn.primary:hover { background: #153eb8; }
  .note { padding: 8px 20px; font-size: 12px; color: var(--muted); background: #f8fafc; border-bottom: 1px solid var(--line); }
  iframe { flex: 1; width: 100%; border: 0; background: #525659; }
  nav { display: flex; gap: 4px; padding: 10px 20px 0; overflow-x: auto; background: #fff; border-bottom: 1px solid var(--line); }
  nav button { padding: 8px 14px; border: 0; border-bottom: 2px solid transparent; background: none; font-size: 13px; font-weight: 600;
    font-family: inherit; color: var(--muted); cursor: pointer; white-space: nowrap; }
  nav button[aria-selected="true"] { color: var(--brand); border-bottom-color: var(--brand); }
  main { flex: 1; overflow: auto; padding: 20px; }
  .sheet { background: #fff; border: 1px solid var(--line); border-radius: 12px; overflow: auto; }
  .sheet[hidden] { display: none; }
  table { border-collapse: collapse; font-size: 13px; min-width: 100%; }
  td { padding: 7px 12px; border-bottom: 1px solid #f1f5f9; white-space: nowrap; }
  tr:nth-child(1) td { font-size: 15px; font-weight: 700; color: var(--brand); border: 0; }
  tr:nth-child(2) td { font-style: italic; color: var(--muted); border: 0; }
  tr:nth-child(4) td { background: var(--brand); color: #fff; font-weight: 600; }
  tr:nth-child(n+6):nth-child(even) td { background: #f8fafc; }
`;

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatSize(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Opens the preview tab. Call it straight from the click handler, or the browser may block the
 * new tab. `sheets` ([{ name, html }], html from XLSX.utils.sheet_to_html, which escapes the
 * cells) is for an Excel file; a PDF is shown as it is. `onDownload` runs when the user
 * downloads it. Returns false when the tab could not be opened.
 */
export function openReportPreview({ title, subtitle, fileName, blob, sheets = null, onDownload }) {
  const win = window.open("", "_blank");
  if (!win) return false;

  const url = URL.createObjectURL(blob);
  const kind = sheets ? "Excel workbook" : "PDF";
  const body = sheets
    ? `<nav role="tablist">${sheets.map((s, i) => `<button type="button" role="tab" data-sheet="${i}" aria-selected="${i === 0}">${escapeHtml(s.name)}</button>`).join("")}</nav>
       <main>${sheets.map((s, i) => `<section class="sheet" data-sheet="${i}"${i === 0 ? "" : " hidden"}>${s.html}</section>`).join("")}</main>`
    : `<iframe src="${url}" title="${escapeHtml(title)}"></iframe>`;

  win.document.open();
  win.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(`Preview: ${title}`)}</title><style>${STYLE}</style></head><body>
    <header>
      <div class="title"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>
      <div class="actions">
        <button type="button" class="btn" id="close">Close</button>
        <a class="btn primary" id="download" href="${url}" download="${escapeHtml(fileName)}">Download ${escapeHtml(kind)}</a>
      </div>
    </header>
    <div class="note">Preview of ${escapeHtml(fileName)} (${formatSize(blob.size)}). Nothing has been saved yet; click Download to keep a copy.</div>
    ${body}
  </body></html>`);
  win.document.close();

  const doc = win.document;
  doc.getElementById("download").addEventListener("click", () => onDownload?.());
  doc.getElementById("close").addEventListener("click", () => win.close());
  doc.querySelectorAll("nav button").forEach((tab) => tab.addEventListener("click", () => {
    doc.querySelectorAll("nav button").forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
    doc.querySelectorAll(".sheet").forEach((s) => { s.hidden = s.dataset.sheet !== tab.dataset.sheet; });
  }));
  // The file stays available while the tab is open, and is let go once it closes.
  win.addEventListener("pagehide", () => URL.revokeObjectURL(url));
  return true;
}
