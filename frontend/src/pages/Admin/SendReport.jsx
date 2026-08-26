import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  MapPin,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  AlignLeft,
  AlignJustify,
  Link as LinkIcon,
  Image as ImageIcon,
  UploadCloud,
  Info,
  Save,
  Send,
  FileText,
  Check,
} from "lucide-react";

const STEPS = [
  {
    title: "Draft",
    desc: "You are creating this notice.",
  },
  {
    title: "Sent to barangay",
    desc: "Notice has been sent to the barangay for acknowledgment.",
  },
  {
    title: "Acknowledged by barangay",
    desc: "Waiting for acknowledgment from the barangay.",
  },
  {
    title: "Inspection authorized",
    desc: "CENRO will review and authorize the inspection.",
  },
  {
    title: "Environmental assessment",
    desc: "Aquabot (Troid) inspection may be conducted.",
  },
  {
    title: "Completed",
    desc: "Inspection and assessment completed.",
  },
];

const MAX_MESSAGE_LENGTH = 1000;

const DEFAULT_MESSAGE = `Good day.

The Community Environment and Natural Resources Office (CENRO) is informing your barangay that our office may conduct an environmental inspection using the Aquabot (Troid) in the reported area.

This inspection aims to assess the waste severity and environmental condition before determining the necessary actions.

Please acknowledge this notice and coordinate with our office if there are concerns.`;

function StepIndicator({ index, active, complete }) {
  return (
    <div
      className={[
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
        complete
          ? "bg-blue-600 text-white"
          : active
          ? "bg-blue-600 text-white"
          : "bg-gray-100 text-gray-400 border border-gray-300",
      ].join(" ")}
    >
      {complete ? <Check className="h-3.5 w-3.5" /> : index + 1}
    </div>
  );
}

function StatusStepper({ currentStep }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold text-gray-900">Notice status</h2>
      <ol>
        {STEPS.map((step, i) => {
          const active = i === currentStep;
          const complete = i < currentStep;
          const isLast = i === STEPS.length - 1;
          return (
            <li key={step.title} className="relative flex gap-3 pb-6 last:pb-0">
              {!isLast && (
                <span
                  className={[
                    "absolute left-3 top-6 h-full w-px -translate-x-1/2",
                    complete ? "bg-blue-600" : "bg-gray-200",
                  ].join(" ")}
                  aria-hidden="true"
                />
              )}
              <StepIndicator index={i} active={active} complete={complete} />
              <div>
                <p
                  className={[
                    "text-sm font-medium",
                    active ? "text-blue-600" : complete ? "text-gray-900" : "text-gray-400",
                  ].join(" ")}
                >
                  {step.title}
                </p>
                <p className="mt-0.5 text-xs leading-snug text-gray-400">{step.desc}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function Select({ children, ...props }) {
  return (
    <div className="relative">
      <select
        {...props}
        className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2.5 pr-9 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
    </div>
  );
}

function ToolbarButton({ children, label }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
    >
      {children}
    </button>
  );
}

function UploadDropzone({ label, required, hint, files, onFiles, multiple }) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    onFiles(Array.from(e.dataTransfer.files || []));
  };

  return (
    <Field label={label} required={required}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={[
          "flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition",
          dragOver ? "border-blue-400 bg-blue-50" : "border-gray-300 bg-gray-50/60",
        ].join(" ")}
      >
        <UploadCloud className="mb-2 h-6 w-6 text-gray-400" />
        <p className="text-sm text-gray-500">
          Drag and drop file{multiple ? "s" : ""} here
        </p>
        <p className="mb-3 text-xs text-gray-400">or</p>
        <label className="cursor-pointer rounded-lg border border-blue-600 px-4 py-1.5 text-sm font-medium text-blue-600 transition hover:bg-blue-50">
          Choose {multiple ? "files" : "file"}
          <input
            type="file"
            multiple={multiple}
            className="hidden"
            onChange={(e) => onFiles(Array.from(e.target.files || []))}
          />
        </label>
      </div>
      <p className="mt-1.5 text-xs text-gray-400">{hint}</p>
      {files && files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-md bg-gray-50 px-2.5 py-1.5 text-xs text-gray-600"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="truncate">{f.name}</span>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}

export default function EnvironmentalInspectionNotice() {
  const navigate = useNavigate();
  const [barangay, setBarangay] = useState("Barangay San Isidro");
  const [concern, setConcern] = useState("Waste Severity Assessment");
  const [subject, setSubject] = useState("Notice of Possible Environmental Inspection");
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [officialFiles, setOfficialFiles] = useState([]);
  const [supportingFiles, setSupportingFiles] = useState([]);
  const [currentStep] = useState(1); // 0-indexed: "Sent to barangay"

  const charCount = message.length;

  const handleSaveDraft = () => {
    console.log("Save draft", { barangay, concern, subject, message, officialFiles, supportingFiles });
  };

  const handleSendNotice = () => {
    console.log("Send notice", { barangay, concern, subject, message, officialFiles, supportingFiles });
  };

  return (
    <div className="bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-6xl">
        {/* Back link */}
        <button
          type="button"
          onClick={() => navigate("/admin/requests")}
          className="mb-4 flex items-center gap-1.5 text-sm font-medium text-blue-600 transition hover:text-blue-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to requests
        </button>

        {/* Header */}
        <h1 className="text-2xl font-semibold text-gray-900">Environmental Inspection Notice</h1>
        <p className="mt-1 text-sm text-gray-500">
          Notify a barangay about a possible environmental assessment using Aquabot (Troid).
        </p>

        {/* Content grid */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          {/* Left: form */}
          <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Barangay" required>
                <Select value={barangay} onChange={(e) => setBarangay(e.target.value)}>
                  <option>Barangay San Isidro</option>
                  <option>Barangay Poro</option>
                  <option>Barangay Catbangen</option>
                  <option>Barangay Biday</option>
                </Select>
              </Field>

              <Field label="Concern category" required>
                <Select value={concern} onChange={(e) => setConcern(e.target.value)}>
                  <option>Waste Severity Assessment</option>
                  <option>Water Quality Concern</option>
                  <option>Illegal Dumping Report</option>
                  <option>Routine Monitoring</option>
                </Select>
              </Field>
            </div>

            <Field label="Area / location" required>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div className="text-sm">
                    <p className="text-gray-800">Sitio Kalinaw Riverbank, Barangay San Isidro</p>
                    <p className="text-gray-400">San Fernando City, Province of La Union</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="flex shrink-0 items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Select on map
                </button>
              </div>
            </Field>

            <Field label="Subject" required>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </Field>

            <Field label="Notice message" required>
              <div className="overflow-hidden rounded-lg border border-gray-300">
                <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
                  <select className="mr-1 rounded border border-transparent bg-transparent px-1.5 py-1 text-xs text-gray-600 outline-none hover:border-gray-200">
                    <option>Paragraph</option>
                    <option>Heading</option>
                  </select>
                  <span className="mx-1 h-4 w-px bg-gray-200" />
                  <ToolbarButton label="Bold"><Bold className="h-3.5 w-3.5" /></ToolbarButton>
                  <ToolbarButton label="Italic"><Italic className="h-3.5 w-3.5" /></ToolbarButton>
                  <ToolbarButton label="Underline"><Underline className="h-3.5 w-3.5" /></ToolbarButton>
                  <span className="mx-1 h-4 w-px bg-gray-200" />
                  <ToolbarButton label="Bullet list"><List className="h-3.5 w-3.5" /></ToolbarButton>
                  <ToolbarButton label="Numbered list"><ListOrdered className="h-3.5 w-3.5" /></ToolbarButton>
                  <span className="mx-1 h-4 w-px bg-gray-200" />
                  <ToolbarButton label="Align left"><AlignLeft className="h-3.5 w-3.5" /></ToolbarButton>
                  <ToolbarButton label="Align justify"><AlignJustify className="h-3.5 w-3.5" /></ToolbarButton>
                  <span className="mx-1 h-4 w-px bg-gray-200" />
                  <ToolbarButton label="Insert link"><LinkIcon className="h-3.5 w-3.5" /></ToolbarButton>
                  <ToolbarButton label="Insert image"><ImageIcon className="h-3.5 w-3.5" /></ToolbarButton>
                </div>
                <textarea
                  value={message}
                  maxLength={MAX_MESSAGE_LENGTH}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={9}
                  className="w-full resize-none px-3 py-3 text-sm leading-relaxed text-gray-700 outline-none"
                />
                <div className="border-t border-gray-100 px-3 py-1.5 text-right text-xs text-gray-400">
                  {charCount} / {MAX_MESSAGE_LENGTH} characters
                </div>
              </div>
            </Field>

            <UploadDropzone
              label="Upload official notice"
              required
              hint="Accepted formats: PDF, DOC, DOCX (Max. 10MB)"
              files={officialFiles}
              onFiles={setOfficialFiles}
              multiple={false}
            />

            <UploadDropzone
              label="Optional supporting documents"
              hint="Accepted formats: PDF, DOC, DOCX (Max. 10MB)"
              files={supportingFiles}
              onFiles={setSupportingFiles}
              multiple
            />
          </div>

          {/* Right: sidebar */}
          <div className="space-y-6">
            <StatusStepper currentStep={currentStep} />

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-gray-900">Notice information</h2>
              <div className="flex gap-2.5 rounded-lg bg-blue-50 p-3.5 text-sm leading-relaxed text-blue-900">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                <div className="space-y-2">
                  <p>
                    This notice <span className="font-semibold">does not</span> schedule a deployment.
                  </p>
                  <p>
                    It only informs the barangay that CENRO may perform an environmental inspection using Aquabot (Troid).
                  </p>
                  <p>Deployment will only proceed after barangay acknowledgment and internal approval.</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-gray-900">Supported files</h2>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { ext: "PDF", color: "bg-red-500" },
                  { ext: "DOC", color: "bg-blue-500" },
                  { ext: "DOCX", color: "bg-blue-600" },
                ].map((f) => (
                  <div
                    key={f.ext}
                    className="flex flex-col items-center gap-1.5 rounded-lg border border-gray-100 py-3 text-center"
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded text-[10px] font-bold text-white ${f.color}`}
                    >
                      {f.ext}
                    </span>
                    <span className="text-xs text-gray-400">Max. 10MB</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleSaveDraft}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <Save className="h-4 w-4" />
            Save draft
          </button>
          <button
            type="button"
            onClick={handleSendNotice}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            <Send className="h-4 w-4" />
            Send notice
          </button>
        </div>
      </div>
    </div>
  );
}
