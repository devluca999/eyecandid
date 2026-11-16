"use client";
/** Read the clip's real dimensions and duration in the browser (no upload needed). */
export function probeVideo(file: File): Promise<{ w: number; h: number; durationMs: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const url = URL.createObjectURL(file);
    v.onloadedmetadata = () => {
      resolve({ w: v.videoWidth, h: v.videoHeight, durationMs: Math.round(v.duration * 1000) });
      URL.revokeObjectURL(url);
    };
    v.onerror = () => reject(new Error("that file doesn't look like a video"));
    v.src = url;
  });
}

/**
 * Upload with real progress and retries (network blips restart the request, up to 3 tries).
 * TODO(resumable): Convex upload URLs take one request; true resume needs chunked storage behind MediaStore.
 */
export async function uploadFile(getUrl: () => Promise<string>, file: File, onProgress: (p: number) => void): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const url = await getUrl();
      return await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", url);
        xhr.setRequestHeader("content-type", file.type || "video/mp4");
        xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
        xhr.onload = () => (xhr.status < 300 ? resolve(JSON.parse(xhr.responseText).storageId) : reject(new Error(`upload ${xhr.status}`)));
        xhr.onerror = () => reject(new Error("network"));
        xhr.send(file);
      });
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
    }
  }
  throw lastErr;
}
