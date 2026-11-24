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

export async function readClipboardImageFile(): Promise<File | null> {
  const payload = await window.doubaoAPI?.readClipboardImage();
  if (!payload) return null;
  const blob = await (await fetch(payload.dataUrl)).blob();
  return new File([blob], `clipboard-${Date.now()}.png`, {
    type: payload.mimeType,
    lastModified: Date.now(),
  });
}

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
  compact?: boolean;
  /** 紧凑模式下若无已选图片/拖拽/提示，可隐藏按钮行（由外部工具栏提供触发器） */
  hideEmptyToolbar?: boolean;
}

export function ImageAttachments({
  files,
  onChange,
  compact = false,
  hideEmptyToolbar = false,
}: Props) {
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
      const file = await readClipboardImageFile();
      if (!file) {
        setNotice("剪贴板中没有图片");
        return;
      }
      add([file]);
    } catch (err) {
      setNotice(`读取剪贴板失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const hiddenOnly =
    compact && hideEmptyToolbar && previews.length === 0 && !dragging && !notice;

  if (hiddenOnly) {
    return null;
  }

  return (
    <div
      className={`attachment-box ${compact ? "is-compact" : ""} ${
        dragging ? "is-dragging" : ""
      }`}
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

      {(!compact || !hideEmptyToolbar) && (
        <div className="attachment-toolbar">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="attachment-trigger"
          >
            <ImageIcon />
            {compact ? "图片" : "选择图片"}
          </button>
          <button
            type="button"
            onClick={pasteFromClipboard}
            className="attachment-trigger"
          >
            <ClipboardIcon />
            {compact ? "粘贴" : "从剪贴板"}
          </button>
          <span className="attachment-hint">
            {files.length > 0 ? `${files.length}/${MAX_IMAGE_COUNT} 张` : "支持拖拽或粘贴图片"}
          </span>
        </div>
      )}

      {previews.length > 0 && (
        <div className={`attachment-previews ${!compact || !hideEmptyToolbar ? "has-toolbar" : ""}`}>
          {previews.map(({ file, url }, index) => (
            <div
              key={`${file.name}-${file.lastModified}-${index}`}
              className="attachment-thumb group"
              title={`${file.name} · ${Math.ceil(file.size / 1024)} KB`}
            >
              <img src={url} alt="" />
              <button
                type="button"
                onClick={() => onChange(files.filter((_, item) => item !== index))}
                className="attachment-remove"
                aria-label={`移除 ${file.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {notice && <div className="attachment-notice">{notice}</div>}
    </div>
  );
}

export function ImageIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2.4" />
      <circle cx="5.5" cy="5.5" r="1.05" />
      <path d="m3.5 11.2 2.6-2.7 2.1 2 1.5-1.5 2.8 2.7" />
    </svg>
  );
}

export function ClipboardIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5.5 3.5h-1A1.5 1.5 0 0 0 3 5v7.2a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 13 12.2V5a1.5 1.5 0 0 0-1.5-1.5h-1" />
      <rect x="5.5" y="2" width="5" height="2.8" rx="1" />
    </svg>
  );
}
