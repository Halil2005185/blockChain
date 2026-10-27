/**
 * Decides how a block should be displayed, combining the block's own
 * `hash_valid` flag with the chain-wide validation report.
 */

import type { BlockOut, ValidationReportOut } from "@/lib/api/types";

export type BlockStatus = "genesis" | "valid" | "invalid" | "untrusted" | "mining";

export function blockStatus(block: BlockOut, report: ValidationReportOut): BlockStatus {
  if (report.invalid_indices.includes(block.index)) return "invalid";
  // Passes its own checks, but sits on top of a broken block.
  if (report.untrusted_indices.includes(block.index)) return "untrusted";
  return block.is_genesis ? "genesis" : "valid";
}

export const STATUS_LABEL: Record<BlockStatus, string> = {
  genesis: "Genesis",
  valid: "Geçerli",
  invalid: "Geçersiz",
  untrusted: "Güvenilmez",
  mining: "Kazılıyor",
};

/** Plain-language explanations for each validation issue code from the backend. */
export const ISSUE_EXPLANATION: Record<string, string> = {
  hash_mismatch: "Blok kazıldıktan sonra verisi değişti, bu yüzden saklanan hash artık doğru değil.",
  broken_link: "previous_hash değeri artık önceki bloğun hash’iyle eşleşmiyor.",
  insufficient_work: "Hash, bu bloğun zorluğu için yeterli sayıda sıfırla başlamıyor.",
  bad_index: "Blok numarası sıra dışı.",
  bad_timestamp: "Blok, kendinden önceki bloktan daha eski olduğunu iddia ediyor.",
  multiple_rewards: "Her blokta yalnızca bir madencilik ödülüne izin verilir.",
  misplaced_reward: "Madencilik ödülü ilk işlem olmalıdır.",
  invalid_transaction: "Bloktaki bir işlem kuralları ihlal ediyor.",
  empty_chain: "Zincir hiç blok içermiyor.",
  bad_reward: "Madenci kendine izin verilen ödülden fazlasını ödedi.",
  // Network simulation (decisions about blocks received from peers)
  stale_block: "Geçerli bir blok, ancak bu düğümde aynı yükseklikte başka bir blok var; ilk gördüğünü korur.",
  unknown_parent: "Kendi başına geçerli, ancak bu düğümde olmayan bir blok üzerine kurulu, bu yüzden gönderenin zincirini ister.",
  difficulty_too_low: "Bu ağın gerektirdiğinden daha düşük zorlukla kazıldı.",
};
