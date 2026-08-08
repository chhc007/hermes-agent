import { authedFetch } from "@/lib/api";

/**
 * Multi-file chat attachments.
 *
 * The /chat composer collects several dropped/picked files, uploads them in
 * one multipart request to the gateway's upload directory, then embeds the
 * returned absolute paths in the next prompt as `@file:<path>` references.
 * The embedded TUI expands those refs (text files inlined, binary files
 * surfaced as a tool-readable block) — same pipeline the desktop app uses.
 */

export interface ChatFileUploadResult {
  /** Absolute path under ~/workspace/uploads the gateway wrote. */
  path: string;
  /** Byte size of the uploaded file. */
  bytes: number;
  /** Basename written on the server (timestamp-prefixed). */
  name: string;
  mime_type: string;
}

/** Per-file cap kept in sync with _CHAT_FILE_UPLOAD_MAX_BYTES in web_server.py. */
const MAX_FILE_BYTES = 100 * 1024 * 1024;

/** Upload many files in one multipart request; returns server paths. */
export async function uploadChatFiles(
  files: File[],
): Promise<ChatFileUploadResult[]> {
  if (!files.length) return [];

  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      const mb = Math.round(MAX_FILE_BYTES / (1024 * 1024));
      throw new Error(`文件过大（上限 ${mb} MB）：${f.name}`);
    }
  }

  const form = new FormData();
  for (const f of files) form.append("files", f, f.name);

  const res = await authedFetch("/api/chat/files-upload", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    ok: boolean;
    files?: ChatFileUploadResult[];
  };
  if (!data?.files?.length) {
    throw new Error("file upload did not return paths");
  }
  return data.files;
}

/**
 * Quote a path for use inside `@file:` / `@image:` references so the backend
 * REFERENCE_PATTERN reads it back whole (mirrors format_reference_value in
 * agent/context_references.py and formatRefValue in the desktop).
 */
export function formatRefValue(path: string): string {
  if (/[\s"'`]/.test(path)) return `\`${path}\``;
  return path;
}

/** All files in a DataTransfer (clipboard or drop), deduped by identity. */
export function filesFromTransfer(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files: File[] = [];
  const seen = new Set<string>();

  const push = (file: File | null) => {
    if (!file) return;
    const key = `${file.name}\0${file.type}\0${file.size}\0${file.lastModified}`;
    if (seen.has(key)) return;
    seen.add(key);
    files.push(file);
  };

  if (data.items?.length) {
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (item.kind === "file") push(item.getAsFile());
    }
  }
  if (data.files?.length) {
    for (let i = 0; i < data.files.length; i++) push(data.files[i]);
  }
  return files;
}

/** True when a drag payload carries any file (for dragover preventDefault). */
export function transferHasFiles(data: DataTransfer | null): boolean {
  if (!data) return false;
  if (data.items?.length) {
    for (let i = 0; i < data.items.length; i++) {
      if (data.items[i].kind === "file") return true;
    }
    return false;
  }
  return !!(data.files?.length);
}

/** Human-friendly size label, e.g. 1.2 MB / 340 KB / 512 B. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
