"use client";

import { ArrowLeftRight, Inbox, Send, Shuffle } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { errorMessage } from "@/lib/api/client";
import type { TransactionCreate, TransactionOut } from "@/lib/api/types";
import { LIMITS } from "@/lib/config";
import { formatAmount, formatTime } from "@/lib/format";

interface TransactionPanelProps {
  pending: TransactionOut[];
  disabled: boolean;
  onSubmit: (tx: TransactionCreate) => Promise<unknown>;
  className?: string;
}

type Errors = Partial<Record<"sender" | "receiver" | "amount" | "form", string>>;

const SAMPLE_ACCOUNTS = ["alice", "bob", "carol", "dave", "erin", "frank"];

/**
 * Same rules as the backend (Pydantic + core). Checking here gives instant
 * feedback; the backend still validates everything on its own.
 */
function validate(sender: string, receiver: string, amountText: string): Errors {
  const errors: Errors = {};
  if (!sender) errors.sender = "Gerekli";
  else if (sender.length > LIMITS.maxAccountName) errors.sender = `En fazla ${LIMITS.maxAccountName} karakter`;
  else if (sender === LIMITS.reservedSender) errors.sender = `Ad "${LIMITS.reservedSender}" madencilik ödülleri için ayrılmıştır`;

  if (!receiver) errors.receiver = "Gerekli";
  else if (receiver.length > LIMITS.maxAccountName) errors.receiver = `En fazla ${LIMITS.maxAccountName} karakter`;
  else if (receiver === sender) errors.receiver = "Gönderenden farklı olmalı";

  const amount = Number(amountText);
  if (!amountText) errors.amount = "Gerekli";
  else if (!Number.isFinite(amount)) errors.amount = "Sayı olmalı";
  else if (amount <= 0) errors.amount = "0’dan büyük olmalı";
  else if (amount > LIMITS.maxAmount) errors.amount = `En fazla ${LIMITS.maxAmount.toLocaleString("en-US")}`;
  return errors;
}

export function TransactionPanel({ pending, disabled, onSubmit, className }: TransactionPanelProps) {
  const [sender, setSender] = useState("alice");
  const [receiver, setReceiver] = useState("bob");
  const [amount, setAmount] = useState("25");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const s = sender.trim();
    const r = receiver.trim();
    const found = validate(s, r, amount.trim());
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit({ sender: s, receiver: r, amount: Number(amount) });
      setAmount(String(Math.ceil(Math.random() * 50)));
    } catch (err) {
      // Show the backend's message (e.g. 422 validation_error) under the form.
      setErrors({ form: errorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const fillExample = () => {
    const pick = () => SAMPLE_ACCOUNTS[Math.floor(Math.random() * SAMPLE_ACCOUNTS.length)]!;
    const s = pick();
    let r = pick();
    while (r === s) r = pick();
    setSender(s);
    setReceiver(r);
    setAmount(String(Math.ceil(Math.random() * 100)));
    setErrors({});
  };

  return (
    <Panel
      title="İşlemler"
      icon={ArrowLeftRight}
      subtitle="Hayali hesaplar ve birimler"
      className={className}
      bodyClassName="space-y-4"
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Gönderen" value={sender} onChange={(e) => setSender(e.target.value)} error={errors.sender} disabled={disabled} autoComplete="off" />
          <Field label="Alıcı" value={receiver} onChange={(e) => setReceiver(e.target.value)} error={errors.receiver} disabled={disabled} autoComplete="off" />
        </div>
        <Field
          label="Tutar (EDU)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={errors.amount}
          disabled={disabled}
        />
        {errors.form && (
          <p role="alert" className="rounded-lg border border-invalid/30 bg-invalid/10 px-3 py-2 text-xs text-invalid">
            {errors.form}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" icon={Send} loading={submitting} disabled={disabled} className="flex-1">
            Bekleyen işlemlere ekle
          </Button>
          <Button icon={Shuffle} onClick={fillExample} disabled={disabled} aria-label="Rastgele bir örnekle doldur" title="Rastgele örnek" />
        </div>
      </form>

      <section>
        <h3 className="mb-2 flex items-center justify-between text-[11px] font-medium tracking-wider text-subtle uppercase">
          <span>Bekleyen işlemler</span>
          <span className="font-mono normal-case">{pending.length}</span>
        </h3>
        {pending.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border">
            <EmptyState icon={Inbox} title="Bekleyen işlem yok">
              Yeni işlemler, bir madenci onları bir bloğa koyana kadar burada bekler.
            </EmptyState>
          </div>
        ) : (
          <ul className="scrollbar-thin max-h-48 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border">
            {pending.map((tx) => (
              <li key={tx.tx_id} className="animate-enter flex items-center justify-between gap-3 px-3 py-2 text-xs">
                <span className="truncate font-mono">
                  {tx.sender} <span className="text-subtle">→</span> {tx.receiver}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="font-mono">{formatAmount(tx.amount)}</span>
                  <span className="hidden font-mono text-subtle sm:inline">{formatTime(tx.timestamp)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Panel>
  );
}
