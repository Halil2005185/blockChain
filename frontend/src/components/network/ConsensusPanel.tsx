import { AlertTriangle, Scale } from "lucide-react";

import { Panel } from "@/components/ui/Panel";
import { CONSENSUS_RULES, LIMITATIONS } from "@/lib/networkText";

/**
 * The rules the simulated nodes follow, and what this simulation is NOT.
 * (The backend also returns these in English via GET /api/network; the
 * interface shows the Arabic versions from lib/networkText.ts.)
 */
export function ConsensusPanel({ className }: { className?: string }) {
  return (
    <Panel title="Düğümler nasıl uzlaşır" icon={Scale} subtitle="İş kanıtıyla basitleştirilmiş uzlaşma" className={className} bodyClassName="space-y-4 text-xs">
      <div className="rounded-lg border border-border bg-bg/40 p-3 leading-relaxed text-muted">
        <p>
          <strong className="text-fg">İş kanıtı</strong> her bloğun oluşturulmasını maliyetli kılar (çok sayıda hash denemesi).
          <strong className="text-fg"> Uzlaşma</strong> bağımsız düğümlerin aynı geçmişi seçme yoludur: burada her düğüm
          en çok toplam işe sahip geçerli zinciri izler.
        </p>
      </div>
      <ol className="list-decimal space-y-1.5 ps-4 text-fg/85">
        {CONSENSUS_RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ol>
      <div className="rounded-lg border border-mining/30 bg-mining/6 p-3">
        <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-mining">
          <AlertTriangle className="size-3.5" aria-hidden /> Bu simülasyonun sınırları
        </p>
        <ul className="list-disc space-y-1 ps-4 text-muted">
          {LIMITATIONS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
