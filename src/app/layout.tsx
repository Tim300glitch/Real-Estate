import type { Metadata, Viewport } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Parcel — Wholesale OS", template: "%s · Parcel" },
  description: "Map-first operating system for real-estate wholesaling: find, analyze, acquire and assign off-market deals.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, themeColor: "#0b0d12" };

const themeScript = `try{var t=JSON.parse(localStorage.getItem('wholesale-os-ui')||'{}').state;if(!t||t.theme!=='light')document.documentElement.classList.add('dark')}catch(e){document.documentElement.classList.add('dark')}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
