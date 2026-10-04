"use client";
// Photos/voice blobs live in IndexedDB (localStorage is too small). In production
// these upload to Supabase Storage / S3 and the `photos` table keeps the key.
import { useEffect, useState } from "react";

const DB = "wholesale-os-media";
const STORE = "media";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putMedia(id: string, dataUrl: string) {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(dataUrl, id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function getMedia(id: string): Promise<string | null> {
  const db = await open();
  return new Promise((res) => {
    const req = db.transaction(STORE).objectStore(STORE).get(id);
    req.onsuccess = () => res((req.result as string) ?? null);
    req.onerror = () => res(null);
  });
}

/** Downscale an image file to ≤maxPx and JPEG-encode it */
export function resizeImage(file: File, maxPx = 1280, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxPx / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", quality));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export async function savePhotos(files: FileList | File[]): Promise<string[]> {
  const ids: string[] = [];
  for (const f of Array.from(files)) {
    if (!f.type.startsWith("image/")) continue;
    const id = `ph_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    await putMedia(id, await resizeImage(f));
    ids.push(id);
  }
  return ids;
}

export function useMedia(id: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (id) getMedia(id).then((u) => live && setUrl(u));
    return () => { live = false; };
  }, [id]);
  return url;
}

/** Voice-to-text via the browser Web Speech API where available. */
export function speechSupported() {
  return typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);
}

export function startDictation(onText: (t: string, final: boolean) => void, onEnd: () => void) {
  const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";
  rec.onresult = (e) => {
    let text = "";
    let final = false;
    for (let i = e.resultIndex; i < e.results.length; i++) { text += e.results[i][0].transcript; final = e.results[i].isFinal; }
    onText(text, final);
  };
  rec.onend = onEnd;
  rec.start();
  return rec;
}

interface SpeechRec {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: (e: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string }; length: number }[] & { length: number } }) => void;
  onend: () => void; start(): void; stop(): void;
}
