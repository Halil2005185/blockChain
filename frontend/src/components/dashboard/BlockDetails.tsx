"use client";

import { FlaskConical, Hammer, MousePointerClick, PencilLine, ScanSearch } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { HashText } from "@/components/ui/HashText";
import { Panel } from "@/components/ui/Panel";
import { errorMessage } from "@/lib/api/client";
import type { BlockOut, TamperRequest, ValidationReportOut } from "@/lib/api/types";
import { blockStatus, ISSUE_EXPLANATION, STATUS_LABEL } from "@/lib/blockStatus";
import { formatAmount, formatDateTime, formatInt, ltr } from "@/lib/format";

interface BlockDetailsProps {
  block: BlockOut | null;
  validation: ValidationReportOut;
  disabled: boolean;
  onTamper: (index: number, changes: TamperRequest) => Promise<unknown>;
  onRemine: (index: number) => Promise<unknown>;
  className?: string;
}

export function BlockDetails({ block, validation, disabled, onTamper, onRemine, className }: BlockDetailsProps) {
  if (!block) {
    return (
      <Panel title="Blok ayrıntıları" icon={ScanSearch} className={className}>
        <EmptyState icon={MousePointerClick} title="Hiçbir blok seçilmedi">
          İncelemek için zincirde veya tabloda bir bloğa tıklayın.
        </EmptyState>
      </Panel>
    );
  }

  const status = blockStatus(block, validation);
  const issues = validation.issues.filter((i) => i.index === block.index);

  return (
    <Panel
      title={`Blok ${ltr(`#${block.index}`)}`}
      icon={ScanSearch}
      subtitle={block.is_genesis ? "İlk blok, her düğüme önceden yazılmıştır" : `Kazılma zamanı: ${formatDateTime(block.timestamp)}`}
      actions={
        <Badge tone={status as BadgeTone} dot>
          {STATUS_LABEL[status]}
        </Badge>
      }
      className={className}
      bodyClassName="scrollbar-thin max-h-[640px] overflow-y-auto space-y-4"
    >
      {issues.length > 0 && (
        <ul className="space-y-2">
          {issues.map((issue, i) => (
            <li key={`${issue.code}-${i}`} className="rounded-lg border border-invalid/30 bg-invalid/10 px-3 py-2 text-xs">
              <p className="font-mono font-semibold text-invalid">{issue.code}</p>
              <p className="mt-0.5 text-fg/90">{ISSUE_EXPLANATION[issue.code] ?? issue.message}</p>
            </li>
          ))}
        </ul>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
        <Detail label="Dizin">{block.index}</Detail>
        <Detail label="Nonce">{formatInt(block.nonce)}</Detail>
        <Detail label="Zorluk">
          {block.difficulty} <span className="text-muted">(başlangıç: <span dir="ltr" className="text-valid">{"0".repeat(block.difficulty)}</span>)</span>
        </Detail>
        <Detail label="Zaman damgası">
          <span title={`Unix ${block.timestamp}`}>{formatDateTime(block.timestamp)}</span>
        </Detail>
        <Detail label="Hash" wide>
          <HashText hash={block.hash} full copyable />
        </Detail>
        <Detail
          label="Önceki hash"
          wide
          note={block.is_genesis ? "Önceki blok yok, bu yüzden geleneksel olarak 64 sıfır kullanılır." : `Şu bloğun hash’ine eşit olmalıdır: ${ltr(`#${block.index - 1}`)}.`}
        >
          <HashText hash={block.previous_hash} full copyable highlightZeros={!block.is_genesis} />
        </Detail>
        <Detail label="Merkle kökü" wide note="Tüm işlemleri özetleyen tek bir hash.">
          <HashText hash={block.merkle_root} full copyable highlightZeros={false} />
        </Detail>
        {block.data && (
          <Detail label="Veri" wide>
            <span className="wrap-break-word text-fg/90">{block.data}</span>
          </Detail>
        )}
      </dl>

      <section>
        <h3 className="mb-2 text-[11px] font-medium tracking-wider text-subtle uppercase">
          İşlemler ({block.transactions.length})
        </h3>
        {block.transactions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-xs text-subtle">
            {block.is_genesis ? "Buradaki genesis bloğu işlem içermez." : "İşlem yok."}
          </p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-lg border border-border">
            {block.transactions.map((tx, i) => (
              <li key={tx.tx_id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-mono">
                    <span className="text-subtle">{i}.</span> {tx.sender} <span className="text-subtle">→</span> {tx.receiver}
                  </p>
                  <HashText hash={tx.tx_id} head={8} tail={4} highlightZeros={false} className="text-subtle" />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-mono">{formatAmount(tx.amount)}</span>
                  {tx.sender === "NETWORK" && <Badge tone="genesis">Ödül</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* key resets the form when another block is selected */}
      <TamperBox key={block.index} block={block} disabled={disabled} onTamper={onTamper} onRemine={onRemine} />
    </Panel>
  );
}

function Detail({ label, children, wide, note }: { label: string; children: ReactNode; wide?: boolean; note?: string }) {
  return (
    <div className={wide ? "col-span-2 min-w-0" : "min-w-0"}>
      <dt className="mb-1 text-[11px] font-medium tracking-wider text-subtle uppercase">{label}</dt>
      <dd className="font-mono">{children}</dd>
      {note && <p className="mt-1 text-[11px] text-subtle">{note}</p>}
    </div>
  );
}

/** Tampering simulation: edit the block without re-mining, then re-mine it. */
function TamperBox({
  block,
  disabled,
  onTamper,
  onRemine,
}: {
  block: BlockOut;
  disabled: boolean;
  onTamper: BlockDetailsProps["onTamper"];
  onRemine: BlockDetailsProps["onRemine"];
}) {
  const [data, setData] = useState(block.data);
  const [busy, setBusy] = useState<"tamper" | "remine" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (kind: "tamper" | "remine", action: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-lg border border-mining/25 bg-mining/4 p-3">
      <div className="mb-2 flex items-center gap-2">
        <FlaskConical className="size-4 text-mining" aria-hidden />
        <h3 className="text-xs font-semibold">Kurcalama simülasyonu</h3>
      </div>
      <p className="mb-3 text-[11px] text-muted">
        Bu bloğun verisini <em>yeniden kazmadan</em> değiştirin ve doğrulamanın başarısız olduğunu izleyin; sonra yeniden kazıp hatanın bir sonraki bloğa kaydığını görün.
      </p>
      <Field
        label="Blok verisi"
        id={`tamper-data-${block.index}`}
        value={data}
        maxLength={1000}
        onChange={(e) => setData(e.target.value)}
        disabled={disabled || busy !== null}
        placeholder="Örnek: yeniden yazılmış tarih"
        error={error}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="warning"
          icon={PencilLine}
          loading={busy === "tamper"}
          disabled={disabled || busy !== null || data === block.data}
          onClick={() => act("tamper", () => onTamper(block.index, { data }))}
        >
          Veriyi değiştir
        </Button>
        <Button
          size="sm"
          icon={Hammer}
          loading={busy === "remine"}
          disabled={disabled || busy !== null}
          onClick={() => act("remine", () => onRemine(block.index))}
          title="İş kanıtını yeniden yap ve önceki bloğa yeniden bağla"
        >
          Bloğu yeniden kaz
        </Button>
      </div>
    </section>
  );
}
