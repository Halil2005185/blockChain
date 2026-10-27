import { Clock, Gauge, Layers, ShieldAlert, ShieldCheck, Trophy } from "lucide-react";

import { StatCard } from "@/components/ui/StatCard";
import type { ChainOut } from "@/lib/api/types";
import { formatAmount, formatInt, ltr } from "@/lib/format";

interface ChainOverviewProps {
  chain: ChainOut;
}

export function ChainOverview({ chain }: ChainOverviewProps) {
  const confirmedTxs = chain.chain.reduce((sum, b) => sum + b.transactions.length, 0);
  const { validation } = chain;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatCard
        label="Zincir yüksekliği"
        icon={Layers}
        value={chain.height}
        hint={`${chain.chain.length} blok (genesis dahil)`}
      />
      <StatCard
        label="Zorluk"
        icon={Gauge}
        value={chain.difficulty}
        hint={
          <>
            Sonraki hash şununla başlar: <span dir="ltr" className="font-mono text-valid">{"0".repeat(chain.difficulty)}</span>
          </>
        }
      />
      <StatCard
        label="Bekleyen işlemler"
        icon={Clock}
        value={chain.pending_transactions.length}
        tone={chain.pending_transactions.length > 0 ? "text-mining" : "text-fg"}
        hint="Sonraki bloğu bekliyor"
      />
      <StatCard
        label="Onaylanmış işlemler"
        icon={Trophy}
        value={formatInt(confirmedTxs)}
        hint={`Ödül ${formatAmount(chain.mining_reward)} / blok`}
      />
      <StatCard
        label="Zincir durumu"
        icon={validation.is_valid ? ShieldCheck : ShieldAlert}
        value={validation.is_valid ? "Geçerli" : "Geçersiz"}
        tone={validation.is_valid ? "text-valid" : "text-invalid"}
        hint={
          validation.is_valid
            ? "Tüm hash’ler ve bağlantılar doğrulandı"
            : `${validation.issues.length} sorun · ilk blok ${ltr(`#${validation.first_invalid_index}`)}`
        }
      />
    </div>
  );
}
