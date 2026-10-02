import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { FileUp, X } from "lucide-react";
import { ApiError } from "../api/client";
import { evidenceApi } from "../api/endpoints";
import type { Evidence } from "../api/types";
import { formatBytes } from "../lib/format";
import { Alert } from "./ui/Alert";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { Field } from "./ui/Field";

interface Props {
  open: boolean;
  onClose: () => void;
  onUploaded: (e: Evidence) => void;
  knownTypes: string[];
  maxBytes: number | null;
}

export function UploadDialog({ open, onClose, onUploaded, knownTypes, maxBytes }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const busy = progress !== null;

  const reset = () => { setFile(null); setTitle(""); setType(""); setDescription(""); setErrors({}); setFormError(null); setProgress(null); };
  const close = () => { if (busy) return; reset(); onClose(); };

  const pick = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setErrors((e) => ({ ...e, file: "" }));
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const found: Record<string, string> = {};
    if (!file) found.file = "Choose a file to upload.";
    else if (file.size === 0) found.file = "This file is empty.";
    else if (maxBytes && file.size > maxBytes) found.file = `File is larger than the server limit of ${formatBytes(maxBytes)}.`;
    if (!title.trim()) found.title = "Enter a title.";
    else if (title.length > 255) found.title = "Title must be 255 characters or fewer.";
    if (!type.trim()) found.type = "Enter an evidence type.";
    else if (type.length > 100) found.type = "Type must be 100 characters or fewer.";
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length || !file) return;

    const form = new FormData();
    form.set("title", title.trim());
    form.set("evidence_type", type.trim());
    if (description.trim()) form.set("description", description.trim());
    form.set("file", file);
    setProgress(0);
    try {
      const r = await evidenceApi.upload(form, setProgress);
      reset();
      onUploaded(r.evidence);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Upload failed.");
      setProgress(null);
    }
  }

  return (
    <Dialog open={open} onClose={close} title="Upload evidence"
      footer={<>
        <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
        <Button variant="primary" type="submit" form="upload-form" loading={busy}>{busy ? `Uploading ${Math.round((progress ?? 0) * 100)}%` : "Upload and hash"}</Button>
      </>}>
      <form id="upload-form" className="dialog-body" onSubmit={submit} noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}

        {file ? (
          <div className="file-chip">
            <FileUp size={18} aria-hidden />
            <div className="grow"><div className="name">{file.name}</div><div className="cell-sub">{formatBytes(file.size)}</div></div>
            <Button variant="ghost" size="icon" onClick={() => setFile(null)} disabled={busy} aria-label="Remove file"><X size={16} /></Button>
          </div>
        ) : (
          <div>
            <button type="button" className={`dropzone${drag ? " drag" : ""}`} onClick={() => input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
              aria-describedby={errors.file ? "file-err" : undefined}>
              <FileUp size={22} aria-hidden />
              <span><strong>Drop a file here</strong> or click to browse</span>
              {maxBytes && <span className="cell-sub">Up to {formatBytes(maxBytes)}</span>}
            </button>
            {errors.file && <p id="file-err" className="field-error" style={{ marginTop: 6 }}>{errors.file}</p>}
          </div>
        )}
        {file && errors.file && <p className="field-error">{errors.file}</p>}
        <input ref={input} type="file" hidden onChange={(e) => pick(e.target.files?.[0])} />

        <Field label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} disabled={busy} />
        <Field label="Evidence type" list="evidence-types" placeholder="e.g. disk_image, mobile, document" value={type}
          onChange={(e) => setType(e.target.value)} error={errors.type} disabled={busy} />
        <datalist id="evidence-types">{knownTypes.map((t) => <option key={t} value={t} />)}</datalist>
        <div className="field">
          <label htmlFor="up-desc">Description <span className="opt">(optional)</span></label>
          <textarea id="up-desc" className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} />
        </div>
        {busy && <div className="progress" role="progressbar" aria-valuenow={Math.round((progress ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${(progress ?? 0) * 100}%` }} /></div>}
      </form>
    </Dialog>
  );
}