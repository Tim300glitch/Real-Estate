"use client";
import { ExternalLink, Eye } from "lucide-react";
import { useState } from "react";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;

/**
 * Street View via the Google Maps Embed API (official, ToS-compliant iframe).
 * Requires NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY (embed keys are designed to be public; restrict by referrer).
 * Without a key we link out using the documented Maps URLs scheme instead of scraping imagery.
 */
export function StreetView({ lat, lng, height = 180 }: { lat: number; lng: number; height?: number }) {
  const [show, setShow] = useState(false);
  const external = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
  if (!KEY) {
    return (
      <div className="rounded-md border border-dashed border-border bg-panel-2 flex flex-col items-center justify-center gap-1 text-center px-3" style={{ height }}>
        <Eye size={16} className="text-muted" />
        <div className="text-[12px] text-fg-2">No licensed photo connected</div>
        <div className="text-[11px] text-muted">Add a Google Maps Embed key to view Street View inline.</div>
        <a href={external} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[12px] text-accent">Open Street View <ExternalLink size={11} /></a>
      </div>
    );
  }
  if (!show) {
    return (
      <button onClick={() => setShow(true)} className="w-full rounded-md border border-border bg-panel-2 flex items-center justify-center gap-2 text-[12.5px] text-fg-2 hover:bg-hover" style={{ height }}>
        <Eye size={15} /> Load Street View
      </button>
    );
  }
  return (
    <iframe title="Street View" className="w-full rounded-md border border-border" style={{ height }} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
      src={`https://www.google.com/maps/embed/v1/streetview?key=${KEY}&location=${lat},${lng}&fov=80`} allowFullScreen />
  );
}
