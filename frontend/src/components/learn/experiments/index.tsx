"use client";

/**
 * Maps every ExperimentId in lessons.ts to its component. The Record type
 * makes TypeScript fail if a lesson names an experiment that doesn't exist.
 */

import type { ReactElement } from "react";

import { ChainPeek, ForgeryLab, GenesisExplorer, TxHashLab } from "@/components/learn/experiments/chainLabs";
import { HashPlayground, MerkleLab, MiningLab, NonceStepper } from "@/components/learn/experiments/hashLabs";
import { InvalidBlockLab, NodeOfflineLab, PartitionLab } from "@/components/learn/experiments/networkLabs";
import { PosDemo } from "@/components/learn/experiments/PosDemo";
import { SignatureLab } from "@/components/learn/experiments/SignatureLab";
import { TamperLab } from "@/components/learn/experiments/TamperLab";
import type { LabContext } from "@/components/learn/labKit";
import type { ExperimentId } from "@/lib/learn/lessons";

export const EXPERIMENTS: Record<ExperimentId, (props: { ctx: LabContext }) => ReactElement> = {
  "chain-peek": ChainPeek,
  "tx-hash": () => <TxHashLab />,
  "hash-playground": () => <HashPlayground />,
  "genesis-explorer": GenesisExplorer,
  "nonce-stepper": () => <NonceStepper />,
  "mining-lab": () => <MiningLab />,
  "tamper-lab": TamperLab,
  "merkle-lab": MerkleLab,
  "signature-lab": () => <SignatureLab />,
  "node-offline-lab": NodeOfflineLab,
  "invalid-block-lab": InvalidBlockLab,
  "partition-lab": PartitionLab,
  "pos-demo": () => <PosDemo />,
  "forgery-lab": ForgeryLab,
};
