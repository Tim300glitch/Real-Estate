"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MapPinned } from "lucide-react";
import { Button, Field } from "@/components/ui";

const DEMO = [
  { email: "owner@demo.wholesale", role: "Owner — full access" },
  { email: "acq@demo.wholesale", role: "Acquisitions" },
  { email: "dispo@demo.wholesale", role: "Dispositions" },
  { email: "va@demo.wholesale", role: "Assistant / VA" },
  { email: "viewer@demo.wholesale", role: "Read-only" },
];

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("owner@demo.wholesale");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Sign-in failed");
    const next = params.get("next");
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_440px] bg-bg">
      <div className="hidden lg:flex flex-col justify-between p-10 border-r border-border bg-panel-2">
        <div className="flex items-center gap-2 text-[15px] font-semibold"><MapPinned size={18} className="text-accent" /> Parcel <span className="text-muted font-normal">Wholesale OS</span></div>
        <div className="max-w-lg">
          <h1 className="text-[28px] font-semibold tracking-tight leading-tight">Find it on the map. Prove the ARV. Make the offer. Assign it.</h1>
          <ul className="mt-6 space-y-2 text-[13.5px] text-fg-2">
            <li>• Is this owner worth contacting? — transparent motivation scoring</li>
            <li>• What is it worth after repair? — comp engine with visible math</li>
            <li>• What can I offer? — configurable MAO, offer range and fee</li>
            <li>• Can I assign it profitably? — buyer matching and deal rooms</li>
          </ul>
        </div>
        <p className="text-[11.5px] text-muted">Demo build: property data is synthetic and clearly labeled. Connect licensed providers in Settings → Data Sources.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div>
            <h2 className="text-[18px] font-semibold">Sign in</h2>
            <p className="text-[12.5px] text-muted">Use a demo account (password <span className="font-mono">demo1234</span>).</p>
          </div>
          <Field label="Email"><input className="input h-9" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Password"><input className="input h-9" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {error && <div className="rounded-md bg-bad-soft text-bad text-[12.5px] px-3 py-2">{error}</div>}
          <Button type="submit" variant="primary" size="md" className="w-full h-9" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
          <div className="rounded-lg border border-border bg-panel p-2">
            <div className="text-[11px] uppercase tracking-wide text-muted px-1 pb-1">Demo accounts (role-based permissions)</div>
            {DEMO.map((d) => (
              <button key={d.email} type="button" onClick={() => { setEmail(d.email); setPassword("demo1234"); }}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-[12.5px] hover:bg-hover">
                <span className="font-mono text-[12px]">{d.email}</span><span className="text-muted">{d.role}</span>
              </button>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
