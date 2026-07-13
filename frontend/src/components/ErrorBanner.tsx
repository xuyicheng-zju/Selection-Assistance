import { BackendError } from "../lib/types";

export function ErrorBanner({ error }: { error: BackendError | string | null }) {
  if (!error) return null;
  const message = typeof error === "string" ? error : error.message;
  const code = typeof error === "string" ? "" : error.code;
  return (
    <div className="error-banner" role="alert">
      <span className="error-icon">!</span>
      <div>
        <strong>请求未完成{code ? ` · ${code}` : ""}</strong>
        <p>{message}</p>
      </div>
    </div>
  );
}
