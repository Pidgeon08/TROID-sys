// A request's letter of request is a PDF or Word file (see LetterUploadSerializer).

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** "pdf", "docx", "doc", or "" for anything else. Browsers don't always report Word types, so the extension decides first. */
export function letterKind(fileName, contentType) {
  const name = (fileName || "").toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".doc")) return "doc";
  if (contentType === "application/pdf") return "pdf";
  if (contentType === DOCX_TYPE) return "docx";
  if (contentType === "application/msword") return "doc";
  return "";
}

const TYPES = { pdf: "application/pdf", docx: DOCX_TYPE, doc: "application/msword" };

/** A Blob from base64 file data (a data URL is fine too). */
export function base64ToBlob(data, kind) {
  const encoded = data.startsWith("data:") ? data.slice(data.indexOf(",") + 1) : data;
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: TYPES[kind] || "application/octet-stream" });
}
