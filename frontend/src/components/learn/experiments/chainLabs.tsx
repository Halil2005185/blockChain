"use client";

/** Experiments built on the Single chain (read-only or additive only). */

import { CheckCircle2, Hammer, Plus, RotateCcw, Send, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ChainStrip } from "@/components/dashboard/ChainStrip";
import { Callout, LabCard, Mono, type LabContext } from "@/components/learn/labKit";
import { Button } from "@/components/ui/Button";
import { HashText } from "@/components/ui/HashText";
import { api } from "@/lib/api/blockchain";
import { errorMessage } from "@/lib/api/client";
import type { PreviewTransaction, TransactionOut } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatAmount, formatDateTime } from "@/lib/format";

/** Highlights the characters of `value` that differ from `baseline`. */
export function HashDiff({ value, baseline, label }: { value: string; baseline?: string | null; label: string }) {
  const changed = baseline ? [...value].filter((ch, i) => ch !== baseline[i]).length : 0;
  return (
    <div className="min-w-0">
      <p className="mb-1 flex items-center justify-between text-[11px] font-medium tracking-wider text-subtle uppercase">
        <span>{label}</span>
        {baseline && (
          <span className={cn("normal-case", changed ? "text-mining" : "text-valid")}>
            {changed ? `Değişen: ${changed}/64 karakter` : "Orijinalle aynı"}
          </span>
        )}
      </p>
      <p dir="ltr" className="font-mono text-xs break-all">
        {[...value].map((ch, i) => (
          <span key={i} className={baseline && ch !== baseline[i] ? "text-mining" : "text-fg/80"}>
            {ch}
          </span>
        ))}
      </p>
    </div>
  );
}

// ------------------------------------------------------------- chain peek
export function ChainPeek({ ctx }: { ctx: LabContext }) {
  const [busy, setBusy] = useState<"tx" | "mine" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const chain = ctx.bc.chain;

  const run = async (kind: "tx" | "mine", fn: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (!chain) return <LabCard title="Zinciriniz" scope="adds"><p className="text-sm text-muted">Yükleniyor…</p></LabCard>;
  const last = chain.chain[chain.chain.length - 1]!;
  const prev = chain.chain[chain.chain.length - 2];

  return (
    <LabCard title="Zinciriniz" scope="adds">
      <ChainStrip blocks={chain.chain} validation={chain.validation} selectedIndex={selected ?? last.index} onSelect={setSelected} miningJob={ctx.mining.job} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={Plus} loading={busy === "tx"} disabled={!ctx.online || busy !== null} onClick={() => run("tx", () => ctx.bc.createTransaction({ sender: "alice", receiver: "bob", amount: Math.ceil(Math.random() * 50) }))}>
          Deneme işlemi ekle
        </Button>
        <Button size="sm" variant="primary" icon={Hammer} loading={busy === "mine"} disabled={!ctx.online || busy !== null || ctx.mining.isRunning} onClick={() => run("mine", () => api.mineAndWait("learner"))}>
          Bir bloğa kaz
        </Button>
        <span className="self-center text-xs text-muted">{chain.pending_transactions.length} bekliyor</span>
      </div>
      {prev ? (
        <Callout tone={last.previous_hash === prev.hash ? "good" : "bad"}>
          Blok <bdi>#{last.index}</bdi> şu previous_hash değerini saklar: <Mono>{last.previous_hash.slice(0, 16)}…</Mono>; blok <bdi>#{prev.index}</bdi> hash’i ise{" "}
          <Mono>{prev.hash.slice(0, 16)}…</Mono>: {last.previous_hash === prev.hash ? "eşleşiyor, yani iki blok bağlı." : "eşleşmiyor: bağlantı kopuk!"}
        </Callout>
      ) : (
        <Callout>Yalnızca genesis bloğu var. İlk bağlantıyı görmek için bir işlem ekleyip kazın.</Callout>
      )}
      {error && <p className="text-xs text-invalid">{error}</p>}
    </LabCard>
  );
}

// ------------------------------------------------- transaction → block hash
const BASE_TXS: PreviewTransaction[] = [
  { sender: "alice", receiver: "bob", amount: 25, timestamp: 1735689700 },
  { sender: "bob", receiver: "carol", amount: 5, timestamp: 1735689760 },
];

interface TxResult {
  txIds: string[];
  merkleRoot: string;
  blockHash: string;
}

async function hashBlockOf(txs: PreviewTransaction[]): Promise<TxResult> {
  const [tree, block] = await Promise.all([
    api.merkle(txs),
    api.blockHash({ index: 1, timestamp: 1735689800, data: "lesson block", difficulty: 1, nonce: 0, transactions: txs }),
  ]);
  return { txIds: tree.leaves, merkleRoot: tree.root, blockHash: block.hash };
}

export function TxHashLab() {
  const [amounts, setAmounts] = useState(BASE_TXS.map((t) => String(t.amount)));
  const [baseline, setBaseline] = useState<TxResult | null>(null);
  const [current, setCurrent] = useState<TxResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hashBlockOf(BASE_TXS).then(setBaseline, (err) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    const values = amounts.map(Number);
    if (values.some((v) => !(v > 0) || v > 1e9)) return setError("Tutarlar 0’dan büyük olmalı");
    setError(null);
    const t = setTimeout(() => {
      hashBlockOf(BASE_TXS.map((tx, i) => ({ ...tx, amount: values[i]! }))).then(setCurrent, (err) => setError(errorMessage(err)));
    }, 250);
    return () => clearTimeout(t);
  }, [amounts]);

  return (
    <LabCard title="Bir işlemi değiştirin ve hash’leri izleyin" scope="sandbox">
      <div className="grid gap-2 sm:grid-cols-2">
        {BASE_TXS.map((tx, i) => (
          <label key={i} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
            <span className="font-mono text-xs">
              {tx.sender} → {tx.receiver}
            </span>
            <span className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                step="any"
                value={amounts[i]}
                aria-label={`İşlem tutarı ${i + 1}`}
                onChange={(e) => setAmounts((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))}
                className="h-8 w-24 rounded-md border border-border-strong bg-bg/60 px-2 text-end font-mono text-sm"
              />
              <span className="text-xs text-subtle">EDU</span>
            </span>
          </label>
        ))}
      </div>
      {current && baseline ? (
        <div className="space-y-3">
          {current.txIds.map((id, i) => (
            <HashDiff key={i} label={`İşlem kimliği ${i + 1}`} value={id} baseline={baseline.txIds[i]} />
          ))}
          <HashDiff label="Merkle kökü" value={current.merkleRoot} baseline={baseline.merkleRoot} />
          <HashDiff label="Blok hash’i" value={current.blockHash} baseline={baseline.blockHash} />
        </div>
      ) : (
        !error && <p className="text-xs text-muted">Hash hesaplanıyor…</p>
      )}
      <Button size="sm" icon={RotateCcw} onClick={() => setAmounts(BASE_TXS.map((t) => String(t.amount)))}>
        Orijinal tutarları geri yükle
      </Button>
      {error && <p className="text-xs text-invalid">{error}</p>}
    </LabCard>
  );
}

// --------------------------------------------------------- genesis explorer
export function GenesisExplorer({ ctx }: { ctx: LabContext }) {
  const genesis = ctx.bc.chain?.chain[0];
  const next = ctx.bc.chain?.chain[1];
  const [recalc, setRecalc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!genesis) return <LabCard title="Genesis bloğunu incele" scope="sandbox"><p className="text-sm text-muted">Yükleniyor…</p></LabCard>;

  const recalculate = () =>
    api
      .blockHash({
        index: genesis.index,
        timestamp: genesis.timestamp,
        previous_hash: genesis.previous_hash,
        data: genesis.data,
        nonce: genesis.nonce,
        difficulty: genesis.difficulty,
        transactions: [],
      })
      .then((r) => setRecalc(r.hash), (err) => setError(errorMessage(err)));

  const rows: Array<[string, React.ReactNode]> = [
    ["index", "0"],
    ["timestamp", `${genesis.timestamp} (${formatDateTime(genesis.timestamp)}, kodda sabit)`],
    ["previous_hash", <HashText key="p" hash={genesis.previous_hash} full highlightZeros={false} />],
    ["data", genesis.data],
    ["transactions", "Yok"],
    ["difficulty / nonce", `${genesis.difficulty} / ${genesis.nonce}`],
    ["hash", <HashText key="h" hash={genesis.hash} full />],
  ];

  return (
    <LabCard title="Genesis bloğunu incele" scope="sandbox">
      <dl className="grid gap-2 text-xs sm:grid-cols-[10rem_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-mono text-subtle">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <Button size="sm" onClick={recalculate}>Hash’ini yeniden hesapla</Button>
      {recalc && (
        <Callout tone={recalc === genesis.hash ? "good" : "bad"}>
          Hesaplanan: <Mono>{recalc}</Mono>.{" "}
          {recalc === genesis.hash ? "Eşleşiyor: bu alanlara sahip herkes aynı genesis hash’ini elde eder." : "Farklı! Genesis bloğu değiştirilmiş."}
        </Callout>
      )}
      {next ? (
        <Callout tone={next.previous_hash === genesis.hash ? "good" : "bad"}>
          Blok <bdi>#1</bdi> içindeki previous_hash: <Mono>{next.previous_hash.slice(0, 20)}…</Mono>:{" "}
          {next.previous_hash === genesis.hash ? "tam olarak genesis bloğunun hash’i." : "genesis bloğunun hash’i değil (zincir kurcalanmış)."}
        </Callout>
      ) : (
        <Callout>«Tek zincir» sekmesinde bir blok kazın; böylece blok <bdi>#1</bdi>’in genesis bloğuna işaret ettiğini göreceksiniz.</Callout>
      )}
      {error && <p className="text-xs text-invalid">{error}</p>}
    </LabCard>
  );
}

// -------------------------------------------------------------- forgery lab
export function ForgeryLab({ ctx }: { ctx: LabContext }) {
  const [result, setResult] = useState<TransactionOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingIds = useMemo(() => new Set(ctx.bc.chain?.pending_transactions.map((t) => t.tx_id)), [ctx.bc.chain]);
  const sent = useRef(false);

  const forge = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await ctx.bc.createTransaction({ sender: "alice", receiver: "mallory", amount: 1000 }));
      sent.current = true;
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <LabCard title="Başkasının parasını harca" scope="adds">
      <p className="text-sm text-muted">alice değilsiniz ve bir anahtarınız yok. Yine de deneyin:</p>
      <Button variant="danger" icon={Send} loading={busy} disabled={!ctx.online} onClick={forge}>
        Gönder: {formatAmount(1000)} alice → mallory
      </Button>
      {result && (
        <div className="space-y-2">
          <Callout tone="bad">
            <span className="flex items-start gap-1.5">
              <CheckCircle2 className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>
                Bekleyen işlem havuzuna şu kimlikle kabul edildi: <Mono>{result.tx_id.slice(0, 16)}…</Mono>
                {pendingIds.has(result.tx_id) ? " (hâlâ bekliyor)" : ""}. Kimse alice’in onayını kontrol etmedi.
              </span>
            </span>
          </Callout>
          <ul className="space-y-1 text-xs text-fg/85">
            {[
              "Gerçek bir blokzincir, alice’in özel anahtarıyla bir imza isterdi. Burada bunların hiçbiri yok.",
              "Ayrıca alice’in en az 1,000 birime sahip olduğunu da kontrol ederdi. Burada bakiyeler zorunlu tutulmaz.",
              "Her iki kontrol de kodu küçük tutmak için bilerek yok. Bu yüzden bu proje asla gerçek değer tutmamalıdır.",
            ].map((line) => (
              <li key={line} className="flex items-start gap-1.5">
                <XCircle className="mt-px size-3.5 shrink-0 text-invalid" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="text-xs text-invalid">{error}</p>}
    </LabCard>
  );
}
