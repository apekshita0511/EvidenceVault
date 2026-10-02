// Single place that knows the API base URL, the Authorization header and error handling.
const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
const TOKEN_KEY = "ev.session";

// sessionStorage: survives a reload but not closing the tab. It is readable by any script
// on this origin, so the app avoids third-party scripts (see README security notes).
export const tokenStore = {
  get(): string | null {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(token: string) {
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* storage unavailable */ }
  },
  clear() {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
  },
};

export class ApiError extends Error {
  readonly status: number;
  readonly data: unknown;
  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

let onSessionExpired: (() => void) | null = null;
export const setSessionExpiredHandler = (fn: (() => void) | null) => { onSessionExpired = fn; };

const fallbackMessage = (status: number) =>
  status === 0 ? "Cannot reach the server. Check that the backend is running."
  : status === 400 ? "The request was not valid."
  : status === 401 ? "Your session has expired. Please sign in again."
  : status === 403 ? "You do not have permission to do that."
  : status === 404 ? "Not found."
  : status === 413 ? "The file exceeds the server's size limit."
  : status === 429 ? "Too many attempts. Please wait and try again."
  : "Something went wrong on the server.";

function toError(status: number, data: unknown): ApiError {
  const message = (data as { message?: string } | null)?.message || fallbackMessage(status);
  if (status === 401 && tokenStore.get()) {
    tokenStore.clear();
    onSessionExpired?.();
  }
  return new ApiError(status, message, data);
}

interface RequestOptions {
  json?: unknown;
  signal?: AbortSignal;
  /** Treat non-2xx as data instead of throwing (used for verify, where 409 carries a result). */
  allowStatuses?: number[];
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.authorization = `Bearer ${token}`;
  let body: string | undefined;
  if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.json);
  }

  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers, body, signal: opts.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, fallbackMessage(0));
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok && !opts.allowStatuses?.includes(res.status)) throw toError(res.status, data);
  return data as T;
}

// XMLHttpRequest instead of fetch because fetch cannot report upload progress.
export function uploadWithProgress<T>(path: string, form: FormData, onProgress: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", BASE + path);
    const token = tokenStore.get();
    if (token) xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onerror = () => reject(new ApiError(0, fallbackMessage(0)));
    xhr.onload = () => {
      let data: unknown = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON body */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(toError(xhr.status, data));
    };
    xhr.send(form);
  });
}

export async function downloadFile(path: string, fileName: string): Promise<void> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(BASE + path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError(0, fallbackMessage(0));
  }
  if (!res.ok) throw toError(res.status, await res.json().catch(() => null));
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}