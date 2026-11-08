import { useState } from "react";
import { FileText, UploadCloud, X } from "lucide-react";
import { formatFileSize } from "../constants/requests";

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx"];
const MAX_LETTER_BYTES = 5 * 1024 * 1024; // Same limit as the server (LetterUploadSerializer).

// Value is { name, size, data } (data is a base64 data URL), or null when empty.
export default function LetterDropzone({ value, onChange }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const addFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    if (files.length > 1) {
      setError("Please attach one file only.");
      return;
    }
    const [file] = files;
    const name = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      setError("Only PDF or Word files (.pdf, .doc, .docx) can be attached.");
      return;
    }
    if (file.size === 0) {
      setError("That file is empty.");
      return;
    }
    if (file.size > MAX_LETTER_BYTES) {
      setError("The file is too large. The limit is 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setError("");
      onChange({ name: file.name, size: file.size, data: reader.result });
    };
    reader.onerror = () => setError("That file couldn't be read. Please try again.");
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
  };

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <FileText size={18} className="shrink-0 text-blue-600" />
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium text-slate-800">{value.name}</p>
            <p className="text-xs text-slate-400">{formatFileSize(value.size)}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
          aria-label="Remove letter"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-7 text-center transition-colors focus-within:ring-2 focus-within:ring-blue-500/30 ${
          dragging ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"
        }`}
      >
        <UploadCloud size={24} className={dragging ? "text-blue-500" : "text-slate-400"} />
        <span className="text-sm font-medium text-slate-600">
          Drag and drop your letter here, or <span className="text-blue-600">browse</span>
        </span>
        <span className="text-xs text-slate-400">PDF or Word, up to 5 MB</span>
        <input
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
          className="sr-only"
        />
      </label>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
