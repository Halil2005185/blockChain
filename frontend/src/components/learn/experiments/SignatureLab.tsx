"use client";

/**
 * Digital signatures with the browser's Web Crypto API (ECDSA P-256 + SHA-256).
 * Real cryptography, used ONLY for this demonstration: the educational
 * blockchain itself does not sign or verify transactions.
 */

import { BadgeCheck, KeyRound, PenLine, ShieldX } from "lucide-react";
import { useState } from "react";

import { Callout, LabCard, Mono } from "@/components/learn/labKit";
import { Button } from "@/components/ui/Button";
import { errorMessage } from "@/lib/api/client";

const ALGO = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;

const toHex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
const bytes = (text: string) => new TextEncoder().encode(text);

async function publicKeyHex(key: CryptoKey): Promise<string> {
  return toHex(await crypto.subtle.exportKey("raw", key));
}

type Verdict = { valid: boolean; how: string } | null;

export function SignatureLab() {
  const supported = typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined";
  const [keys, setKeys] = useState<CryptoKeyPair | null>(null);
  const [otherKeys, setOtherKeys] = useState<CryptoKeyPair | null>(null);
  const [publicHex, setPublicHex] = useState<string | null>(null);
  const [message, setMessage] = useState("alice, bob’a 25 EDU öder");
  const [signedMessage, setSignedMessage] = useState<string | null>(null);
  const [signature, setSignature] = useState<ArrayBuffer | null>(null);
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [error, setError] = useState<string | null>(null);

  if (!supported) {
    return (
      <LabCard title="İmzala ve doğrula" scope="sandbox">
        <Callout tone="warn">Web Crypto API burada kullanılamıyor (https veya localhost gerekir). Yukarıdaki açıklama yine de geçerlidir.</Callout>
      </LabCard>
    );
  }

  const run = (fn: () => Promise<void>) => fn().catch((err) => setError(errorMessage(err)));

  const generate = () =>
    run(async () => {
      const pair = await crypto.subtle.generateKey(ALGO, false, ["sign", "verify"]);
      setKeys(pair);
      setPublicHex(await publicKeyHex(pair.publicKey));
      setSignature(null);
      setSignedMessage(null);
      setVerdict(null);
      setError(null);
    });

  const sign = () =>
    run(async () => {
      if (!keys) return;
      setSignature(await crypto.subtle.sign(SIGN, keys.privateKey, bytes(message)));
      setSignedMessage(message);
      setVerdict(null);
    });

  const verify = (withOther: boolean) =>
    run(async () => {
      if (!keys || !signature) return;
      let key = keys.publicKey;
      if (withOther) {
        const pair = otherKeys ?? (await crypto.subtle.generateKey(ALGO, false, ["sign", "verify"]));
        setOtherKeys(pair);
        key = pair.publicKey;
      }
      const valid = await crypto.subtle.verify(SIGN, key, signature, bytes(message));
      const how = withOther
        ? "başka birinin açık anahtarıyla"
        : message === signedMessage
          ? "imzalayanın açık anahtarıyla, mesaj değişmedi"
          : "imzalayanın açık anahtarıyla, ancak mesaj değişti";
      setVerdict({ valid, how });
    });

  return (
    <LabCard title="İmzala ve doğrula (Web Crypto, ECDSA P-256)" scope="sandbox">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={KeyRound} onClick={generate}>
          {keys ? "Yeni anahtar çifti" : "Anahtar çifti oluştur"}
        </Button>
        <Button size="sm" variant="primary" icon={PenLine} disabled={!keys} onClick={sign}>
          Özel anahtarla imzala
        </Button>
      </div>
      {publicHex && (
        <p className="text-xs text-muted">
          Açık anahtar (paylaşılabilir): <Mono className="text-fg/80">{publicHex.slice(0, 24)}…{publicHex.slice(-8)}</Mono>. Özel anahtar tarayıcıda kalır ve bu demoda dışa aktarılamaz.
        </p>
      )}
      <label className="flex flex-col gap-1 text-xs text-muted">
        Mesaj (imzaladıktan sonra düzenleyin)
        <textarea dir="auto" value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className="rounded-lg border border-border-strong bg-bg/60 px-3 py-2 font-mono text-sm text-fg" />
      </label>
      {signature && (
        <p className="text-xs text-muted">
          İmza: <Mono className="text-fg/80">{toHex(signature).slice(0, 32)}…</Mono> (imzalanan mesaj: «{signedMessage}»)
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={BadgeCheck} disabled={!signature} onClick={() => verify(false)}>
          Açık anahtarla doğrula
        </Button>
        <Button size="sm" icon={ShieldX} disabled={!signature} onClick={() => verify(true)}>
          Farklı bir açık anahtarla doğrula
        </Button>
      </div>
      {verdict && (
        <Callout tone={verdict.valid ? "good" : "bad"}>
          <strong>{verdict.valid ? "Geçerli imza" : "Geçersiz imza"}</strong> {verdict.how}.
        </Callout>
      )}
      <Callout tone="warn">
        Bu anahtarlar yalnızca bu sayfanın belleğinde bulunur ve yeniden yüklemede yok edilir. Blokzincirle bağlantılı değildir: bu projenin işlemleri imzalanmaz.
      </Callout>
      {error && <p className="text-xs text-invalid">{error}</p>}
    </LabCard>
  );
}
