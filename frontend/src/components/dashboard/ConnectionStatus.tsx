"use client";

import { RefreshCw, ServerOff, WifiOff } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { API_BASE_URL } from "@/lib/config";

interface RetryProps {
  onRetry: () => Promise<unknown>;
}

function useRetry(onRetry: RetryProps["onRetry"]) {
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    setBusy(true);
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  };
  return { busy, retry };
}

/** Full-page state when the backend has never been reachable this session. */
export function BackendOffline({ onRetry }: RetryProps) {
  const { busy, retry } = useRetry(onRetry);
  return (
    <div className="mx-auto mt-10 max-w-xl rounded-xl border border-invalid/30 bg-surface p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-lg border border-invalid/30 bg-invalid/10">
          <ServerOff className="size-5 text-invalid" aria-hidden />
        </div>
        <div>
          <h2 className="font-semibold">Sunucuya ulaşılamadı</h2>
          <p className="font-mono text-xs text-muted">{API_BASE_URL}</p>
        </div>
      </div>
      <p className="mt-5 text-sm text-muted">
        FastAPI sunucusunu ayrı bir PowerShell penceresinde başlatın. Bu sayfa birkaç saniyede bir otomatik olarak yeniden dener.
      </p>
      <pre dir="ltr" className="mt-3 overflow-x-auto rounded-lg border border-border bg-bg p-3 font-mono text-xs leading-relaxed text-fg">
        {`cd backend
.\\.venv\\Scripts\\Activate.ps1
uvicorn app.main:app --reload`}
      </pre>
      <p className="mt-3 text-xs text-subtle">
        Farklı bir adres mi kullanıyorsunuz? <code className="font-mono text-muted">NEXT_PUBLIC_API_URL</code> değerini{" "}
        <code className="font-mono text-muted">frontend/.env.local</code> dosyasında ayarlayın ve yeniden başlatın: <code className="font-mono text-muted">npm run dev</code>.
      </p>
      <Button className="mt-5" icon={RefreshCw} loading={busy} onClick={retry}>
        Şimdi yeniden dene
      </Button>
    </div>
  );
}

/** Slim banner when the connection drops after data was already loaded. */
export function OfflineBanner({ onRetry }: RetryProps) {
  const { busy, retry } = useRetry(onRetry);
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-invalid/30 bg-invalid/10 px-4 py-2.5"
    >
      <div className="flex items-center gap-2.5 text-sm text-invalid">
        <WifiOff className="size-4 shrink-0" aria-hidden />
        <span>Sunucu bağlantısı kesildi. Bilinen son veriler gösteriliyor; yeniden denenirken kontroller devre dışı.</span>
      </div>
      <Button size="sm" variant="danger" icon={RefreshCw} loading={busy} onClick={retry}>
        Yeniden dene
      </Button>
    </div>
  );
}

/** Placeholder layout shown during the very first load. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-label="Blokzincir yükleniyor">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[74px] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Skeleton className="h-56 rounded-xl xl:col-span-8" />
        <Skeleton className="h-56 rounded-xl xl:col-span-4" />
        <Skeleton className="h-72 rounded-xl xl:col-span-8" />
        <Skeleton className="h-72 rounded-xl xl:col-span-4" />
      </div>
    </div>
  );
}
