"use client";

import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import type { ValidationReportOut } from "@/lib/api/types";
import { ISSUE_EXPLANATION } from "@/lib/blockStatus";
import { cn } from "@/lib/cn";
import { ltr } from "@/lib/format";

interface ValidationPanelProps {
  report: ValidationReportOut;
  disabled: boolean;
  onValidate: () => Promise<unknown>;
  onSelectBlock: (index: number) => void;
  className?: string;
}

export function ValidationPanel({ report, disabled, onValidate, onSelectBlock, className }: ValidationPanelProps) {
  const [running, setRunning] = useState(false);

  const validate = async () => {
    setRunning(true);
    try {
      await onValidate();
    } catch {
      /* logged by the hook */
    } finally {
      setRunning(false);
    }
  };

  const valid = report.is_valid;
  const Icon = valid ? ShieldCheck : ShieldAlert;

  return (
    <Panel
      title="Doğrulama"
      icon={ShieldQuestion}
      subtitle="Her hash’i, bağlantıyı ve iş kanıtını yeniden kontrol eder"
      className={className}
      actions={
        <Button size="sm" onClick={validate} loading={running} disabled={disabled}>
          Şimdi doğrula
        </Button>
      }
      bodyClassName="space-y-4"
    >
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border p-3",
          valid ? "border-valid/30 bg-valid/7" : "border-invalid/40 bg-invalid/8",
        )}
        role="status"
      >
        <Icon className={cn("size-8 shrink-0", valid ? "text-valid" : "text-invalid")} aria-hidden />
        <div className="min-w-0">
          <p className={cn("font-semibold", valid ? "text-valid" : "text-invalid")}>
            {valid ? "Zincir geçerli" : "Zincir geçersiz"}
          </p>
          <p className="text-xs text-muted">
            {valid
              ? `Kontrol edildi: ${report.chain_length} blok; her hash içeriğiyle eşleşiyor ve önceki bloğa bağlanıyor.`
              : `Sorun şu blokta başlıyor: ${ltr(`#${report.first_invalid_index}`)}. Sonrasındaki hiçbir şeye güvenilemez.`}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <Count label="Kontrol edildi" value={report.chain_length} />
        <Count label="Geçersiz" value={report.invalid_indices.length} tone={report.invalid_indices.length ? "text-invalid" : undefined} />
        <Count label="Güvenilmez" value={report.untrusted_indices.length} tone={report.untrusted_indices.length ? "text-untrusted" : undefined} />
      </dl>

      {report.issues.length > 0 && (
        <ul className="scrollbar-thin max-h-56 space-y-2 overflow-y-auto">
          {report.issues.map((issue, i) => (
            <li key={`${issue.index}-${issue.code}-${i}`}>
              <button
                type="button"
                onClick={() => onSelectBlock(issue.index)}
                className="w-full rounded-lg border border-border bg-bg/40 px-3 py-2 text-start text-xs transition-colors hover:border-invalid/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-invalid">{issue.code}</span>
                  <span className="text-muted">Blok <bdi>#{issue.index}</bdi></span>
                </div>
                <p className="mt-1 text-fg/85">{ISSUE_EXPLANATION[issue.code] ?? issue.message}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {valid && (
        <p className="text-[11px] text-subtle">
          Deneyin: bir blok seçin, &quot;Kurcalama simülasyonu&quot; bölümünde verisini değiştirin ve bu paneli izleyin.
        </p>
      )}
    </Panel>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg/40 py-2">
      <dd className={cn("font-mono text-lg font-semibold tabular-nums", tone)}>{value}</dd>
      <dt className="text-[11px] text-subtle">{label}</dt>
    </div>
  );
}
