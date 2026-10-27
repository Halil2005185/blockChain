"use client";

/** Conceptual Proof of Work vs Proof of Stake comparison (browser-only model). */

import { Dices } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { Callout, LabCard } from "@/components/learn/labKit";
import { Button } from "@/components/ui/Button";
import { seededRandom, simulatePoS, simulatePoW, type Participant, type RoundSummary } from "@/lib/learn/pos";
import { formatInt } from "@/lib/format";

const ROUNDS = 200;
const DIFFICULTY = 3;

export function PosDemo() {
  const [miners, setMiners] = useState<Participant[]>([
    { name: "Madenci 1", weight: 50 },
    { name: "Madenci 2", weight: 30 },
    { name: "Madenci 3", weight: 15 },
    { name: "Madenci 4", weight: 5 },
  ]);
  const [validators, setValidators] = useState<Participant[]>([
    { name: "Doğrulayıcı 1", weight: 10 },
    { name: "Doğrulayıcı 2", weight: 20 },
    { name: "Doğrulayıcı 3", weight: 30 },
    { name: "Doğrulayıcı 4", weight: 40 },
  ]);
  const [seed, setSeed] = useState(1);

  const result = useMemo(() => {
    const valid = (list: Participant[]) => list.some((p) => p.weight > 0);
    if (!valid(miners) || !valid(validators)) return null;
    const random = seededRandom(seed);
    return { pow: simulatePoW(miners, ROUNDS, random, DIFFICULTY), pos: simulatePoS(validators, ROUNDS, random) };
  }, [miners, validators, seed]);

  return (
    <LabCard title="İş kanıtı ve hisse kanıtı (kavramsal model)" scope="sandbox">
      <Callout tone="warn">
        Tarayıcınızda çalışan bir eğitim modeli. Bu projenin sunucusu yalnızca iş kanıtı kullanır. Gerçek bir hisse kanıtı ayrıca güvenli rastgelelik, doğrulayıcı onayları, kesinlik (finality) ve cezalandırma (slashing) gerektirir; bunların hiçbiri burada simüle edilmez.
      </Callout>
      <div className="grid gap-4 md:grid-cols-2">
        <Side title="İş kanıtı" weightLabel="Hash gücü" people={miners} onChange={setMiners} summary={result?.pow} />
        <Side title="Hisse kanıtı" weightLabel="Hisse" people={validators} onChange={setValidators} summary={result?.pos} />
      </div>
      <Button icon={Dices} onClick={() => setSeed((s) => s + 1)}>
        {ROUNDS} tur daha çalıştır
      </Button>
      {result ? (
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <Callout>
            <strong>İş kanıtında harcanan iş:</strong> ~{formatInt(result.pow.work)} hash denemesi ({ROUNDS} blok × ~{formatInt(16 ** DIFFICULTY)} , zorluk {DIFFICULTY}). Her turun kazananı geçerli bir hash’i ilk bulan olduğundan şans hash gücünü izler.
          </Callout>
          <Callout>
            <strong>Hisse kanıtında harcanan iş:</strong> 0 hash denemesi. Önerici hisseye göre seçilir; madencilik yoktur. Güvenlik, doğrulayıcıların hisselerini riske atmasından gelir.
          </Callout>
        </div>
      ) : (
        <p className="text-xs text-invalid">Her taraftan en az bir katılımcıya 0’dan büyük bir ağırlık verin.</p>
      )}
    </LabCard>
  );
}

function Side({ title, weightLabel, people, onChange, summary }: {
  title: string;
  weightLabel: string;
  people: Participant[];
  onChange: (next: Participant[]) => void;
  summary?: RoundSummary;
}) {
  const total = people.reduce((s, p) => s + p.weight, 0) || 1;
  // useId: Arabic titles can't be turned into ids by stripping non-word characters.
  const base = useId();
  return (
    <div className="rounded-lg border border-border bg-bg/40 p-3">
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      <ul className="space-y-2.5">
        {people.map((p, i) => {
          const wins = summary?.wins[p.name] ?? 0;
          const share = summary ? wins / summary.rounds : 0;
          const id = `${base}-${i}`;
          return (
            <li key={p.name} className="text-xs">
              <div className="mb-1 flex items-center justify-between gap-2">
                <label htmlFor={id} className="text-muted">
                  {p.name}: {weightLabel} {p.weight} ({Math.round((p.weight / total) * 100)}%)
                </label>
                <span><span className="font-mono">{wins}</span> blok</span>
              </div>
              <input
                id={id}
                type="range"
                min={0}
                max={100}
                value={p.weight}
                onChange={(e) => onChange(people.map((q, j) => (j === i ? { ...q, weight: Number(e.target.value) } : q)))}
                className="w-full accent-[var(--color-accent)]"
              />
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div className="h-full rounded-full bg-accent" style={{ width: `${share * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
