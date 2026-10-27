/**
 * Arabic wording for the network simulation. The backend sends ids and
 * English names ("Node A", "group-1"); the interface shows them in Arabic.
 */

import type { InvalidBlockKind, NetworkStatusOut, NodeDetailOut, NodeSummaryOut } from "@/lib/api/types";

/** "Node A" → "العقدة A" (custom names are kept as typed). */
export function arabicNodeName(name: string): string {
  return name.replace(/^Node\s+/, "Düğüm ");
}

export function groupLabel(group: string): string {
  if (group === "main") return "Ana grup";
  const n = group.split("-")[1];
  return n ? `Grup ${n}` : group;
}

const localize = <T extends NodeSummaryOut>(node: T): T => ({ ...node, name: arabicNodeName(node.name) });
export const localizeStatus = (s: NetworkStatusOut): NetworkStatusOut => ({ ...s, nodes: s.nodes.map(localize) });
export const localizeNode = (d: NodeDetailOut): NodeDetailOut => localize(d);

export const INVALID_KIND_LABEL: Record<InvalidBlockKind, string> = {
  tampered: "Kazıldıktan sonra kurcalanmış",
  no_work: "İş kanıtı yok",
  inflated_reward: "Şişirilmiş ödül",
  unknown_parent: "Bilinmeyen üst blok",
};

export const EXPECTED_REJECTION: Record<InvalidBlockKind, string> = {
  tampered: "hash_mismatch: veri kazımdan sonra değiştirildi, bu yüzden hash artık eşleşmiyor",
  no_work: "insufficient_work: hash gerekli sıfırlarla başlamıyor",
  inflated_reward: "bad_reward: madenci kendine izin verilen ödülden fazlasını ödedi",
  unknown_parent: "unknown_parent: kimsenin sahip olmadığı bir blok üzerine kurulu; gönderen geçmişini kanıtlayamaz",
};

export const OUTCOME_LABEL: Record<string, string> = {
  accepted: "Kabul edildi",
  rejected: "Reddedildi",
  duplicate: "Yinelenen",
  orphan: "Yetim",
  stale: "Eskimiş",
};

export const SYNC_REASON_LABEL: Record<string, string> = {
  more_work: "Daha fazla toplam iş",
  not_more_work: "Daha fazla işe sahip değil",
  invalid_chain: "Geçersiz zincir",
  different_genesis: "Farklı genesis bloğu",
  low_difficulty: "Düşük zorluk",
};

export const STALE_REASON = "Aynı yükseklikte başka bir blok önce geldi, bu yüzden bu blok yok sayıldı";

/** The consensus rules and limitations (the backend sends English versions). */
export const CONSENSUS_RULES = [
  "Her düğüm aldığı her bloğu aynı kurallarla doğrular: doğru hash, yeterli iş kanıtı, üst bloğa doğru bağlantı, geçerli işlemler ve sınırı aşmayan bir ödül.",
  "Düğümün zincirini uzatan geçerli bir blok hemen eklenir.",
  "Üst bloğu bilinmeyen geçerli bir blok, düğümün gönderenin tüm zincirini istemesine neden olur.",
  "Bir düğüm yalnızca tamamen geçerli, aynı genesis bloğuyla başlayan ve daha fazla toplam iş kanıtına (16^zorluk toplamı) sahip başka bir zincire geçer. Eşitlik durumunda ilk gördüğü zinciri korur.",
  "Bir düğüm başka bir zincire geçtiğinde, atılan blokların işlemleri bekleyen işlem havuzuna geri döner.",
];

export const LIMITATIONS = [
  "Tek bir süreçte çalışan eğitim amaçlı bir simülasyon; gerçek bir dağıtık sistem değildir.",
  "Mesajlar dürüstçe iletilir; imza, düğüm kimliği veya şifreleme yoktur.",
  "Her düğüm diğer tüm düğümlere doğrudan bağlanır (tam ağ); mesajlar aktarılmaz.",
  "Zorluk kendiliğinden ayarlanmaz; teşvik veya ücret yoktur.",
  "Bu simülasyon Bizans hata toleranslı değildir ve üretime uygun bir uzlaşma değildir.",
];
