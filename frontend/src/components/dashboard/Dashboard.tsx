"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ActivityLog } from "@/components/dashboard/ActivityLog";
import { BlockDetails } from "@/components/dashboard/BlockDetails";
import { BlockList } from "@/components/dashboard/BlockList";
import { ChainOverview } from "@/components/dashboard/ChainOverview";
import { BackendOffline, DashboardSkeleton, OfflineBanner } from "@/components/dashboard/ConnectionStatus";
import { Header } from "@/components/dashboard/Header";
import { MiningControls } from "@/components/dashboard/MiningControls";
import { TransactionPanel } from "@/components/dashboard/TransactionPanel";
import { ValidationPanel } from "@/components/dashboard/ValidationPanel";
import { tabPanelId, useDashboardView, ViewTabs } from "@/components/dashboard/ViewTabs";
import { LearnView } from "@/components/learn/LearnView";
import { NetworkView } from "@/components/network/NetworkView";
import { ChainScene } from "@/components/scene/ChainScene";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useBlockchain } from "@/hooks/useBlockchain";
import { useMining } from "@/hooks/useMining";
import { useNetwork } from "@/hooks/useNetwork";
import { useRealtime } from "@/hooks/useRealtime";
import type { ServerEvent } from "@/lib/realtime/connection";

/**
 * Top-level client component: owns the hooks and passes data + callbacks
 * down to presentational panels. No panel talks to the API directly.
 *
 * Data flow: REST loads state; the WebSocket says *when* something changed
 * (and streams mining progress). Each event goes to both hooks below.
 */
export function Dashboard() {
  const activity = useActivityLog();

  // The socket is created first so the hooks below know whether it's live.
  // Its callbacks reach those hooks through a ref (they're defined after it).
  const routes = useRef({ onEvent: (_event: ServerEvent) => {}, onResync: () => {} });
  const realtime = useRealtime({
    onEvent: (event) => routes.current.onEvent(event),
    onResync: () => routes.current.onResync(),
  });

  const bc = useBlockchain(activity.log, { live: realtime.live });
  const online = bc.connection === "online";

  // REST found the server again while the socket is waiting out its backoff:
  // reconnect the socket right away instead of up to 15 s later.
  const { live, retryNow } = realtime;
  useEffect(() => {
    if (online && !live) retryNow();
  }, [online, live, retryNow]);

  const scheduleRefresh = bc.scheduleRefresh;
  const onJobFinished = useCallback(() => scheduleRefresh(), [scheduleRefresh]);
  const mining = useMining({ log: activity.log, onJobFinished, enabled: online, live: realtime.live });

  // Phase 6: the multi-node simulation, shown in its own tab.
  const [view, setView] = useDashboardView();
  // Lessons use the network too, so it stays loaded on the Learn tab.
  const network = useNetwork({ log: activity.log, live: realtime.live, active: view !== "chain" && online });

  useEffect(() => {
    routes.current = {
      onEvent: (event) => {
        bc.handleEvent(event);
        mining.handleEvent(event);
        network.handleEvent(event); // ignores non-network events
      },
      // After (re)connecting or missing events: reload everything over REST.
      onResync: () => {
        void bc.refresh();
        void mining.resync();
        if (view !== "chain") void network.refresh();
      },
    };
  });

  // `null` means "follow the newest block" (auto-selects freshly mined blocks).
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const blocks = bc.chain?.chain ?? [];
  const selectedIndex =
    pinnedIndex !== null && pinnedIndex < blocks.length ? pinnedIndex : blocks.length ? blocks.length - 1 : null;
  const selectBlock = (index: number) => setPinnedIndex(index === blocks.length - 1 ? null : index);
  const selectedBlock = selectedIndex === null ? null : (blocks[selectedIndex] ?? null);

  const bcReset = bc.resetChain;
  const resetChain = useCallback(async () => {
    setPinnedIndex(null);
    return bcReset();
  }, [bcReset]);

  return (
    <div className="min-h-screen">
      <Header
        connection={bc.connection}
        live={realtime.live}
        height={bc.chain?.height ?? null}
        onReset={resetChain}
        resetDisabled={!online || mining.isRunning}
      />

      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-5 sm:px-6">
        {bc.connection === "offline" && bc.chain && <OfflineBanner onRetry={bc.refresh} />}

        {bc.connection === "offline" && !bc.chain && view === "learn" && <OfflineBanner onRetry={bc.refresh} />}

        {/* Lessons stay readable without the backend; the other tabs need it. */}
        {!bc.chain && view !== "learn" ? (
          bc.connection === "offline" ? <BackendOffline onRetry={bc.refresh} /> : <DashboardSkeleton />
        ) : (
          <>
            <ViewTabs view={view} onChange={setView} nodeCount={network.status?.nodes.length ?? null} />
            <div role="tabpanel" id={tabPanelId(view)} aria-labelledby={`tab-${view}`} className="space-y-4">
            {view === "network" ? (
              <NetworkView network={network} live={realtime.live} online={online} activity={activity} />
            ) : view === "learn" ? (
              <LearnView ctx={{ bc, mining, network, online, live: realtime.live, openTab: setView }} />
            ) : !bc.chain ? null : (
          <>
            <ChainOverview chain={bc.chain} />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-12">
              <ChainScene
                className="lg:col-span-2 xl:col-span-8"
                blocks={blocks}
                validation={bc.chain.validation}
                selectedIndex={selectedIndex}
                onSelect={selectBlock}
                miningJob={mining.job}
              />
              <MiningControls
                className="lg:col-span-2 xl:col-span-4 xl:row-span-2"
                difficulty={bc.chain.difficulty}
                pendingCount={bc.chain.pending_transactions.length}
                mining={mining}
                disabled={!online}
                onDifficultyChange={bc.setDifficulty}
              />
              <BlockList
                className="lg:col-span-2 xl:col-span-8"
                blocks={blocks}
                validation={bc.chain.validation}
                selectedIndex={selectedIndex}
                onSelect={selectBlock}
              />

              <BlockDetails
                className="xl:col-span-4"
                block={selectedBlock}
                validation={bc.chain.validation}
                disabled={!online}
                onTamper={bc.tamperBlock}
                onRemine={bc.remineBlock}
              />
              <TransactionPanel
                className="xl:col-span-4"
                pending={bc.chain.pending_transactions}
                disabled={!online}
                onSubmit={bc.createTransaction}
              />
              <div className="flex flex-col gap-4 lg:col-span-2 xl:col-span-4">
                <ValidationPanel
                  report={bc.chain.validation}
                  disabled={!online}
                  onValidate={bc.validate}
                  onSelectBlock={selectBlock}
                />
                <ActivityLog entries={activity.entries} onClear={activity.clear} />
              </div>
            </div>
          </>
            )}
            </div>
          </>
        )}
      </main>

      <footer className="mx-auto max-w-[1600px] px-4 pb-6 text-[11px] text-subtle sm:px-6">
        Basitleştirilmiş eğitim modeli. Bir kripto para değildir; hesaplar ve tutarlar hayalidir.
      </footer>
    </div>
  );
}
