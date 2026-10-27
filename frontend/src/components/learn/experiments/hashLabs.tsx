"use client";

/** Hashing and mining experiments: all sandboxed, nothing is stored. */

import { ChevronLeft, ChevronRight, Hammer, Search, Shuffle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { HashDiff } from "@/components/learn/experiments/chainLabs";
import { Callout, LabCard, Mono, type LabContext } from "@/components/learn/labKit";
import { Button } from "@/components/ui/Button";
import { HashText } from "@/components/ui/HashText";
import { api } from "@/lib/api/blockchain";
import { errorMessage } from "@/lib/api/client";
import type { BlockOut, MerkleResponse, MinePreviewResponse } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatDuration, formatInt } from "@/lib/format";

// ---------------------------------------------------------- hash playground
export function HashPlayground() {
  const [a, setA] = useState("hello");
  const [b, setB] = useState("hellp");
  const [hashes, setHashes] = useState<[string, string] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      Promise.all([api.sha256(a), api.sha256(b)]).then(
        ([x, y]) => {
          setHashes([x.hash, y.hash]);
          setError(null);
        },
        (err) => setError(errorMessage(err)),
      );
    }, 200);
    return () => clearTimeout(t);
  }, [a, b]);

  const input = (value: string, set: (v: string) => void, label: string) => (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <textarea dir="auto" value={value} onChange={(e) => set(e.target.value)} rows={2} maxLength={10_000} className="rounded-lg border border-border-strong bg-bg/60 px-3 py-2 font-mono text-sm text-fg" />
    </label>
  );

  return (
    <LabCard title="SHA-256 playground" scope="sandbox">
      <div className="grid gap-3 sm:grid-cols-2">
        {input(a, setA, "Girdi A")}
        {input(b, setB, "Girdi B")}
      </div>
      {hashes && (
        <div className="space-y-3">
          <HashDiff label="Girdi A’nın SHA-256’sı" value={hashes[0]} />
          <HashDiff label="Girdi B’nin SHA-256’sı (turuncu = A’dan farklı)" value={hashes[1]} baseline={hashes[0]} />
        </div>
      )}
      <Callout>
        Sunucu bunu Python’da <Mono>hashlib.sha256</Mono> ile hash’ledi: blokları hash’leyen fonksiyonun aynısı. Bir hash’i girdisine geri çeviremezsiniz; bu şifreleme değildir.
      </Callout>
      {error && <p className="text-xs text-invalid">{error}</p>}
    </LabCard>
  );
}

// ------------------------------------------------------------ nonce stepper
interface Try {
  nonce: number;
  hash: string;
  ok: boolean;
}

export function NonceStepper() {
  const [difficulty, setDifficulty] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [tries, setTries] = useState<Try[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => {
    alive.current = false;
  }, []);

  const hashAt = async (n: number): Promise<Try> => {
    const r = await api.blockHash({ index: 1, timestamp: 0, data: "my first mined block", difficulty, nonce: n });
    return { nonce: n, hash: r.hash, ok: r.meets_target };
  };

  const show = async (n: number) => {
    try {
      const t = await hashAt(n);
      setNonce(n);
      setTries((prev) => [t, ...prev].slice(0, 8));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  useEffect(() => {
    setTries([]);
    void show(0);
  }, [difficulty]);

  const search = async () => {
    setSearching(true);
    try {
      for (let n = nonce + 1; n <= nonce + 50 && alive.current; n++) {
        const t = await hashAt(n);
        setNonce(n);
        setTries((prev) => [t, ...prev].slice(0, 8));
        if (t.ok) break;
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSearching(false);
    }
  };

  const latest = tries[0];
  return (
    <LabCard title="Elle nonce ara" scope="sandbox">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Zorluk</span>
        {[1, 2, 3].map((d) => (
          <Button key={d} size="sm" variant={d === difficulty ? "primary" : "secondary"} onClick={() => setDifficulty(d)} disabled={searching} aria-pressed={d === difficulty}>
            {d}
          </Button>
        ))}
        <span className="text-xs text-subtle">
          Hedef: şununla başlamalı: <Mono className="text-valid">{"0".repeat(difficulty)}</Mono> (~{formatInt(16 ** difficulty)} ortalama deneme)
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon={ChevronLeft} disabled={searching || nonce === 0} onClick={() => show(nonce - 1)} aria-label="Önceki nonce" />
        <span className="min-w-28 text-center font-mono text-sm">Nonce = {formatInt(nonce)}</span>
        <Button size="sm" icon={ChevronRight} disabled={searching} onClick={() => show(nonce + 1)}>
          Sonraki nonce
        </Button>
        <Button size="sm" icon={Shuffle} disabled={searching} onClick={() => show(Math.floor(Math.random() * 100_000))}>
          Rastgele
        </Button>
        <Button size="sm" variant="primary" icon={Search} loading={searching} onClick={search}>
          50 nonce dene
        </Button>
      </div>
      {latest && (
        <Callout tone={latest.ok ? "good" : "info"}>
          <HashText hash={latest.hash} full highlightZeros={latest.ok} />{" "}
          <strong>{latest.ok ? `Hedef karşılandı. Nonce ${formatInt(latest.nonce)} geçerli bir iş kanıtıdır.` : "Hedef karşılanmadı. Başka bir nonce deneyin."}</strong>
        </Callout>
      )}
      <ol className="space-y-1 text-xs" aria-label="Son denemeler">
        {tries.map((t) => (
          <li key={t.nonce} className={cn("flex gap-3 font-mono", t.ok ? "text-valid" : "text-muted")}>
            <span className="w-16 text-end">{t.nonce}</span>
            <span className="truncate">{t.hash}</span>
            <span>{t.ok ? "✓" : "✗"}</span>
          </li>
        ))}
      </ol>
      {error && <p className="text-xs text-invalid">{error}</p>}
    </LabCard>
  );
}

// --------------------------------------------------------------- mining lab
export function MiningLab() {
  const [difficulty, setDifficulty] = useState(2);
  const [runs, setRuns] = useState<MinePreviewResponse[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = async () => {
    setBusy(true);
    setError(null);
    try {
      const run = await api.minePreview("lesson block", difficulty);
      setRuns((prev) => [run, ...prev].slice(0, 10));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const latest = runs[0];
  return (
    <LabCard title="Madencilik laboratuvarı (yalıtılmış)" scope="sandbox">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Zorluk</span>
        {[1, 2, 3, 4, 5].map((d) => (
          <Button key={d} size="sm" variant={d === difficulty ? "primary" : "secondary"} onClick={() => setDifficulty(d)} disabled={busy} aria-pressed={d === difficulty}>
            {d}
          </Button>
        ))}
        <Button variant="primary" icon={Hammer} loading={busy} onClick={mine}>
          Deneme bloğu kaz
        </Button>
      </div>
      {difficulty >= 5 && <p className="text-xs text-mining">Zorluk 5 ortalama yaklaşık bir milyon deneme gerektirir; birkaç saniye sürebilir.</p>}

      {latest && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium tracking-wider text-subtle uppercase">Son aramadaki ilk denemeler</p>
          <ol className="space-y-0.5 text-xs">
            {latest.first_attempts.map((a) => (
              <li key={a.nonce} className={cn("flex gap-3 font-mono", a.meets_target ? "text-valid" : "text-muted")}>
                <span className="w-10 text-end">{a.nonce}</span>
                <span className="truncate">{a.hash}</span>
                <span>{a.meets_target ? "✓" : "✗"}</span>
              </li>
            ))}
            <li className="ps-12 text-subtle">…</li>
          </ol>
          {latest.found && latest.hash ? (
            <Callout tone="good">
              Nonce <Mono>{formatInt(latest.nonce ?? 0)}</Mono> çalışıyor: <HashText hash={latest.hash} full />
            </Callout>
          ) : (
            <Callout tone="warn">Arama {formatInt(latest.attempts)} denemeden sonra durdu. Bu çok kötü bir şans; tekrar deneyin.</Callout>
          )}
        </div>
      )}

      {runs.length > 0 && (
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full text-start text-xs">
            <caption className="mb-1 text-start text-[11px] font-medium tracking-wider text-subtle uppercase">Denemeleriniz</caption>
            <thead className="text-subtle">
              <tr>
                <th scope="col" className="py-1 pe-3 font-medium">Zorluk</th>
                <th scope="col" className="py-1 pe-3 text-end font-medium">Denemeler</th>
                <th scope="col" className="py-1 pe-3 text-end font-medium">Beklenen</th>
                <th scope="col" className="py-1 pe-3 text-end font-medium">Zaman</th>
                <th scope="col" className="py-1 text-end font-medium">Hız</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {runs.map((r, i) => (
                <tr key={i} className="border-t border-border/60">
                  <td className="py-1 pe-3">{r.difficulty}</td>
                  <td className="py-1 pe-3 text-end">{formatInt(r.attempts)}</td>
                  <td className="py-1 pe-3 text-end text-muted">~{formatInt(r.expected_attempts)}</td>
                  <td className="py-1 pe-3 text-end">{r.found ? formatDuration(r.duration_seconds) : "—"}</td>
                  <td className="py-1 text-end text-muted">{r.found ? `${formatInt(r.hashes_per_second)} hash/sn` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Callout>Aynı veri ve zorluk her zaman aynı nonce’u verir: madencilik deterministik bir aramadır ve şans yalnızca «ilk geçerli nonce’un nerede olduğu» anlamına gelir.</Callout>
      {error && <p className="text-xs text-invalid">{error}</p>}
    </LabCard>
  );
}

// --------------------------------------------------------------- merkle lab
const toPreview = (block: BlockOut, amounts?: string[]) =>
  block.transactions.map((tx, i) => ({
    sender: tx.sender,
    receiver: tx.receiver,
    amount: amounts ? Number(amounts[i]) : tx.amount,
    timestamp: tx.timestamp,
  }));

export function MerkleLab({ ctx }: { ctx: LabContext }) {
  const blocks = (ctx.bc.chain?.chain ?? []).filter((b) => b.transactions.length > 0);
  const [index, setIndex] = useState<number | null>(null);
  const block = blocks.find((b) => b.index === index) ?? blocks[blocks.length - 1];
  const [original, setOriginal] = useState<MerkleResponse | null>(null);
  const [edited, setEdited] = useState<MerkleResponse | null>(null);
  const [amounts, setAmounts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const blockKey = block ? `${block.index}:${block.hash}` : "";

  useEffect(() => {
    if (!block) return;
    setEdited(null);
    setAmounts(block.transactions.map((t) => String(t.amount)));
    api.merkle(toPreview(block)).then(setOriginal, (err) => setError(errorMessage(err)));
  }, [blockKey]);

  if (!block) {
    return (
      <LabCard title="Merkle ağacı kur" scope="sandbox">
        <Callout>Henüz işlem içeren bir blok yok. «Tek zincir» sekmesinde bir işlem ekleyip bir blok kazın, sonra buraya dönün.</Callout>
        <Button size="sm" onClick={() => ctx.openTab("chain")}>«Tek zincir» sekmesini aç</Button>
      </LabCard>
    );
  }

  const rebuild = () => {
    if (amounts.some((a) => !(Number(a) > 0))) return setError("Tutarlar 0’dan büyük olmalı");
    setError(null);
    api.merkle(toPreview(block, amounts)).then(setEdited, (err) => setError(errorMessage(err)));
  };

  const shown = edited ?? original;
  return (
    <LabCard title="Merkle ağacı kur" scope="sandbox">
      <label className="flex flex-wrap items-center gap-2 text-xs text-muted">
        Blok
        <select value={block.index} onChange={(e) => setIndex(Number(e.target.value))} className="h-8 rounded-md border border-border-strong bg-bg/60 px-2 font-mono text-fg">
          {blocks.map((b) => (
            <option key={b.index} value={b.index}>
              <bdi>#{b.index}</bdi> ({b.transactions.length} işlem)
            </option>
          ))}
        </select>
      </label>

      {original && (
        <Callout tone={original.root === block.merkle_root ? "good" : "bad"}>
          Hesaplanan kök, saklanan kökle {original.root === block.merkle_root ? "aynı" : "farklı"} — blok <bdi>#{block.index}</bdi>:{" "}
          <Mono>{block.merkle_root.slice(0, 16)}…</Mono>
        </Callout>
      )}

      {shown && (
        <div className="scrollbar-thin space-y-2 overflow-x-auto" aria-label="Merkle ağacı, kök en üstte">
          {[...shown.levels].reverse().map((level, depth) => {
            const levelIndex = shown.levels.length - 1 - depth;
            const before = original?.levels[levelIndex];
            const name = depth === 0 ? "Kök" : levelIndex === 0 ? "Yapraklar (işlem kimlikleri)" : `Seviye ${levelIndex}`;
            return (
              <div key={levelIndex} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-end text-[11px] text-subtle">{name}</span>
                <div className="flex flex-wrap gap-1.5">
                  {level.map((h, i) => {
                    const changed = edited !== null && before?.[i] !== h;
                    return (
                      <span key={i} title={h} dir="ltr" className={cn("rounded-md border px-2 py-1 font-mono text-[11px]", changed ? "border-mining/60 bg-mining/10 text-mining" : "border-border bg-bg/40 text-fg/80")}>
                        {h.slice(0, 8)}…
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[11px] font-medium tracking-wider text-subtle uppercase">İşlemlerin bir kopyasını düzenle</p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {block.transactions.map((tx, i) => (
            <label key={tx.tx_id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-1.5 text-xs">
              <span className="truncate font-mono">
                {i}. {tx.sender} → {tx.receiver}
              </span>
              <input
                type="number"
                min={0}
                step="any"
                value={amounts[i] ?? ""}
                aria-label={`İşlem tutarı ${i}`}
                onChange={(e) => setAmounts((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))}
                className="h-7 w-24 rounded-md border border-border-strong bg-bg/60 px-2 text-end font-mono"
              />
            </label>
          ))}
        </div>
        <Button size="sm" variant="primary" onClick={rebuild}>
          Ağacı yeniden kur
        </Button>
        {edited && <p className="text-xs text-muted">Turuncu = değişti. Yalnızca düzenlenen yapraktan köke uzanan yol değişir.</p>}
      </div>
      {error && <p className="text-xs text-invalid">{error}</p>}
    </LabCard>
  );
}
