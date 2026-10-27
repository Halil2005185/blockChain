"use client";

import { CheckCircle2, Circle, FlaskConical, GraduationCap, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { LabContext } from "@/components/learn/labKit";
import { LessonPage } from "@/components/learn/LessonPage";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useLearnProgress } from "@/hooks/useLearnProgress";
import { GUIDED_EXPERIMENTS, LESSONS, lessonById } from "@/lib/learn/lessons";
import { isCompleted, nextLessonId } from "@/lib/learn/progress";
import { cn } from "@/lib/cn";

/** Reads "#learn/<lesson-id>" so a lesson can be linked or reloaded. */
const lessonFromHash = () => {
  const match = /^#learn\/([\w-]+)$/.exec(typeof window === "undefined" ? "" : window.location.hash);
  return match && lessonById(match[1]!) ? match[1]! : null;
};

export function LearnView({ ctx }: { ctx: LabContext }) {
  const { progress, loaded, complete, reset } = useLearnProgress();
  const [lessonId, setLessonId] = useState<string>(LESSONS[0]!.id);
  const [armed, setArmed] = useState(false);
  const done = progress.completed.length;

  // Once stored progress is known: open the linked lesson, or the first one
  // not completed yet. Only once, so finishing a quiz doesn't jump away.
  const started = useRef(false);
  useEffect(() => {
    if (!loaded || started.current) return;
    started.current = true;
    setLessonId(lessonFromHash() ?? nextLessonId(LESSONS, progress));
  }, [loaded, progress]);

  // Follow later URL changes too (a lesson link, back/forward, an edited URL).
  useEffect(() => {
    const onHash = () => {
      const linked = lessonFromHash();
      if (linked) setLessonId(linked);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const open = useCallback((id: string) => {
    setLessonId(id);
    history.replaceState(null, "", `#learn/${id}`);
  }, []);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  const lesson = lessonById(lessonId) ?? LESSONS[0]!;
  const percent = Math.round((done / LESSONS.length) * 100);

  const lessonList = (
    <ol className="space-y-1">
      {LESSONS.map((l, i) => {
        const finished = isCompleted(progress, l.id);
        const current = l.id === lesson.id;
        return (
          <li key={l.id}>
            <button
              type="button"
              onClick={() => open(l.id)}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-start text-sm transition-colors",
                current ? "bg-accent/12 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              {finished ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-valid" aria-label="Tamamlandı" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-subtle" aria-label="Tamamlanmadı" />
              )}
              <span><span className="font-mono text-xs text-subtle">{i + 1}.</span> {l.title}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto scrollbar-thin" aria-label="Dersler">
        <section className="rounded-xl border border-border bg-surface/90 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <GraduationCap className="size-4 text-accent" aria-hidden /> Blokzincir Akademisi
          </h2>
          <p className="mt-1 text-xs text-muted">Tamamlanan: {done} / {LESSONS.length} ders</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Akademideki ilerleme">
            <div className="h-full rounded-full bg-valid transition-[width]" style={{ width: `${percent}%` }} />
          </div>

          {/* Full list on large screens, collapsible on small ones. */}
          <div className="mt-3 hidden lg:block">{lessonList}</div>
          <details className="mt-3 lg:hidden">
            <summary className="cursor-pointer text-sm text-accent">Tüm dersler</summary>
            <div className="mt-2">{lessonList}</div>
          </details>

          {done > 0 && (
            <Button size="sm" variant={armed ? "danger" : "ghost"} icon={RotateCcw} className="mt-3" onClick={() => {
              if (!armed) return setArmed(true);
              setArmed(false);
              reset();
            }}>
              {armed ? "İlerlemeyi silmek için tekrar tıklayın" : "İlerlememi sıfırla"}
            </Button>
          )}
        </section>

        <section className="rounded-xl border border-border bg-surface/90 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FlaskConical className="size-4 text-accent" aria-hidden /> Rehberli deneyler
          </h2>
          <ul className="mt-2 space-y-1">
            {GUIDED_EXPERIMENTS.map((g) => (
              <li key={g.title}>
                <button type="button" onClick={() => open(g.lessonId)} className="w-full rounded-lg px-2.5 py-1.5 text-start text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg">
                  {g.title}{" "}
                  {g.changes !== "nothing" && <Badge tone="mining" className="ms-1">Değişen: {g.changes === "chain" ? "Zincir" : "Ağ"}</Badge>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <LessonPage key={lesson.id} lesson={lesson} completed={isCompleted(progress, lesson.id)} ctx={ctx} onComplete={() => complete(lesson.id)} onNavigate={open} />
    </div>
  );
}
