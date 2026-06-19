import { BackendError } from "../lib/types";

export function ErrorBanner({ error }: { error: BackendError | string | null }) {
  if (!error) return null;
  const message = typeof error === "string" ? error : error.message;
  const code = typeof error === "string" ? "" : error.code;
  return (
    <div className="m-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm animate-fade-in">
      <div className="font-medium">出错了{code ? ` · ${code}` : ""}</div>
      <div className="text-red-600 text-xs mt-0.5 break-all">{message}</div>
    </div>
  );
}
