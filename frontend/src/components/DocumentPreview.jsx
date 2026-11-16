import { useEffect, useRef, useState } from "react";

// Word files are drawn by docx-preview, loaded only when one is opened.
const DOCX_OPTIONS = {
  className: "docx",
  inWrapper: true,
  ignoreWidth: true,
  ignoreHeight: true,
  breakPages: true,
  renderComments: false,
  renderChanges: false,
  // Embedded HTML would be shown in an unsandboxed frame, able to run scripts on this page.
  renderAltChunks: false,
};

const SAFE_LINK = /^(https?:|mailto:|#)/i;

// A letter is whatever the requester uploaded, so nothing in it may run or navigate
// anywhere unexpected.
function makeSafe(container) {
  container.querySelectorAll("script, iframe, object, embed").forEach((el) => el.remove());
  container.querySelectorAll("a").forEach((link) => {
    const href = (link.getAttribute("href") || "").trim();
    if (!SAFE_LINK.test(href)) {
      link.removeAttribute("href");
    } else if (!href.startsWith("#")) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  });
}

function PdfPreview({ blob, title, className }) {
  const frameRef = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(blob);
    frameRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  return <iframe ref={frameRef} title={title} className={`w-full rounded-lg border border-slate-100 ${className}`} />;
}

function DocxPreview({ blob, className }) {
  const containerRef = useRef(null);
  const [rendered, setRendered] = useState(null);
  const [failed, setFailed] = useState(null);

  useEffect(() => {
    let cancelled = false;
    // Drawn off-page, then swapped in, so a superseded render can't mix into this one.
    const page = document.createElement("div");
    import("docx-preview")
      .then(({ renderAsync }) => renderAsync(blob, page, undefined, DOCX_OPTIONS))
      .then(() => {
        if (cancelled) return;
        makeSafe(page);
        containerRef.current.replaceChildren(page);
        setRendered(blob);
      })
      .catch((err) => {
        console.error("Failed to preview Word file:", err);
        if (!cancelled) setFailed(blob);
      });
    return () => { cancelled = true; };
  }, [blob]);

  const loading = rendered !== blob && failed !== blob;
  return (
    <div className={`relative overflow-auto rounded-lg border border-slate-100 bg-slate-100 ${className}`}>
      <div ref={containerRef} className={failed === blob ? "hidden" : ""} />
      {loading && <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">Loading preview...</p>}
      {failed === blob && (
        <p className="py-6 px-4 text-center text-sm text-slate-500">This Word file couldn't be previewed. Download it to read it.</p>
      )}
    </div>
  );
}

/**
 * Shows a letter of request in the page: PDFs in the browser's viewer, .docx files drawn
 * as pages. Older .doc files can't be read by the browser, so they can only be downloaded.
 */
export default function DocumentPreview({ blob, kind, title = "Letter of request", className = "h-[560px]" }) {
  if (!blob) return null;
  if (kind === "pdf") return <PdfPreview blob={blob} title={title} className={className} />;
  if (kind === "docx") return <DocxPreview blob={blob} className={className} />;
  return (
    <p className="py-6 text-center text-sm text-slate-500">
      Older Word files (.doc) can't be previewed here. Download the file to read it, or save it as .docx or PDF.
    </p>
  );
}
