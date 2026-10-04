// MapLibre v6 ships its web worker as a separate ES module. Serve it from /public.
import { copyFileSync, mkdirSync } from "node:fs";
const dest = "public/maplibre";
mkdirSync(dest, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(`node_modules/maplibre-gl/dist/${f}`, `${dest}/${f}`);
console.log("maplibre worker copied to", dest);
