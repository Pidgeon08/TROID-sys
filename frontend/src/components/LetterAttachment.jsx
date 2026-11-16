import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import api from "../services/api";
import DocumentPreview from "./DocumentPreview";
import { base64ToBlob, letterKind } from "../utils/letters";

// Shows a request's uploaded letter. Older requests have a typed letter instead,
// which the page passes as children.
export default function LetterAttachment({ request, children }) {
  const letter = request.letter;
  const hasFile = Boolean(letter?.contentType);
  const kind = letterKind(letter?.fileName, letter?.contentType);
  const requestId = request.id;
  const [file, setFile] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!hasFile) return undefined;
    let cancelled = false;
    let objectUrl = null;
    api.requestLetter(requestId)
      .then((res) => {
        if (cancelled) return;
        const blob = base64ToBlob(res.data, kind);
        objectUrl = URL.createObjectURL(blob);
        setFile({ blob, url: objectUrl });
      })
      .catch((err) => {
        console.error("Failed to load letter:", err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [hasFile, requestId, kind]);

  if (!hasFile) {
    return request.notes ? children : <p className="py-6 text-center text-sm text-slate-400">No letter attached.</p>;
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <FileText size={18} className="shrink-0 text-blue-600" />
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium leading-tight text-slate-800">{letter.fileName}</p>
            <p className="text-xs text-slate-400">{kind === "pdf" ? "PDF" : "Word"} &bull; {letter.size}</p>
          </div>
        </div>
        {file && (
          <a
            href={file.url}
            download={letter.fileName}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <Download size={13} />
            Download
          </a>
        )}
      </div>

      {failed ? (
        <p className="py-6 text-center text-sm text-red-600">The letter couldn't be loaded. Please refresh and try again.</p>
      ) : !file ? (
        <p className="py-6 text-center text-sm text-slate-400">Loading letter...</p>
      ) : (
        <DocumentPreview blob={file.blob} kind={kind} title={letter.fileName} />
      )}
    </>
  );
}
