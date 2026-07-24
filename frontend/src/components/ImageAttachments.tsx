import { useEffect, useMemo, useRef, useState } from "react";

export const MAX_IMAGE_COUNT = 8;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export function imageFilesFromClipboard(data: DataTransfer): File[] {
  return Array.from(data.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

export function mergeImageFiles(current: File[], incoming: File[]): File[] {
  const valid = incoming.filter(
    (file) => file.type.startsWith("image/") && file.size <= MAX_IMAGE_BYTES
  );
  const seen = new Set(
    current.map((file) => `${file.name}:${file.size}:${file.lastModified}`)
  );
  const merged = [...current];
  for (const file of valid) {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (!seen.has(key) && merged.length < MAX_IMAGE_COUNT) {
      merged.push(file);
      seen.add(key);
    }
  }
  return merged;
}

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  compact?: boolean;
}

export function ImageAttachments({ files, onChange, compact = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files]
  );

  useEffect(
    () => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)),
    [previews]
  );

  const add = (incoming: File[]) => {
    const oversized = incoming.find((file) => file.size > MAX_IMAGE_BYTES);
    if (oversized) {
      setNotice(`${oversized.name} 超过 12 MB`);
    } else if (files.length + incoming.length > MAX_IMAGE_COUNT) {
      setNotice(`最多添加 ${MAX_IMAGE_COUNT} 张图片`);
    } else {
      setNotice("");
    }
    onChange(mergeImageFiles(files, incoming));
  };

  const pasteFromClipboard = async () => {
    try {
      const payload = await window.doubaoAPI?.readClipboardImage();
      if (!payload) {
        setNotice("剪贴板中没有图片");
        return;
      }
      const blob = await (await fetch(payload.dataUrl)).blob();
      add([
        new File([blob], `clipboard-${Date.now()}.png`, {
          type: payload.mimeType,
          lastModified: Date.now(),
        }),
      ]);
    } catch (err) {
      setNotice(`读取剪贴板失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div
      className={`rounded-xl border border-dashed transition-colors ${
        dragging
          ? "border-indigo-400 bg-indigo-50"
          : compact
          ? "border-slate-200 bg-slate-50/70"
          : "border-slate-200 bg-white/65"
      } ${compact ? "p-2" : "p-2.5"}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        add(Array.from(event.dataTransfer.files));
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          add(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-medium text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600"
        >
          <ImageIcon />
          {compact ? "图片" : "选择图片"}
        </button>
        <button
          type="button"
          onClick={pasteFromClipboard}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-medium text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600"
        >
          <ClipboardIcon />
          {compact ? "粘贴" : "从剪贴板"}
        </button>
        <span className="ml-auto text-[9px] text-slate-400">
          {files.length > 0 ? `${files.length}/${MAX_IMAGE_COUNT}` : "支持拖拽 · Ctrl+V"}
        </span>
      </div>

      {previews.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5">
          {previews.map(({ file, url }, index) => (
            <div
              key={`${file.name}-${file.lastModified}-${index}`}
              className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
              title={`${file.name} · ${Math.ceil(file.size / 1024)} KB`}
            >
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onChange(files.filter((_, item) => item !== index))}
                className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-slate-900/75 text-[10px] text-white opacity-0 transition group-hover:opacity-100"
                aria-label={`移除 ${file.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {notice && <div className="mt-1.5 text-[9px] text-rose-500">{notice}</div>}
    </div>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" aria-hidden="true">
      <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2" />
      <circle cx="5.4" cy="5.4" r="1.1" />
      <path d="m3.5 11 2.6-2.7 2.1 2 1.5-1.5 2.8 2.7" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" aria-hidden="true">
      <path d="M5.5 3.5h-1A1.5 1.5 0 0 0 3 5v7a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 13 12V5a1.5 1.5 0 0 0-1.5-1.5h-1" />
      <rect x="5.5" y="2" width="5" height="3" rx="1" />
    </svg>
  );
}
