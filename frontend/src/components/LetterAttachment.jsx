import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import api from "../services/api";

function toObjectUrl({ data, content_type: type }) {
  const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type }));
}

// Shows a request's uploaded letter. Older requests have a typed letter instead,
// which the page passes as children.
export default function LetterAttachment({ request, children }) {
  const letter = request.letter;
  const hasFile = Boolean(letter?.contentType);
  const isPdf = letter?.contentType === "application/pdf";
  const requestId = request.id;
  const [fileUrl, setFileUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!hasFile) return undefined;
    let cancelled = false;
    let objectUrl = null;
    api.requestLetter(requestId)
      .then((res) => {
        if (cancelled) return;
        objectUrl = toObjectUrl(res);
        setFileUrl(objectUrl);
      })
      .catch((err) => {
        console.error("Failed to load letter:", err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [hasFile, requestId]);

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
            <p className="text-xs text-slate-400">{isPdf ? "PDF" : "Word"} &bull; {letter.size}</p>
          </div>
        </div>
        {fileUrl && (
          <a
            href={fileUrl}
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
      ) : !fileUrl ? (
        <p className="py-6 text-center text-sm text-slate-400">Loading letter...</p>
      ) : isPdf ? (
        <iframe src={fileUrl} title={letter.fileName} className="h-[560px] w-full rounded-lg border border-slate-100" />
      ) : (
        <p className="py-6 text-center text-sm text-slate-500">Word files can't be previewed here. Download the file to read it.</p>
      )}
    </>
  );
}
