"use client";

import { AlertTriangle, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Clock, Footprints } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { EXPERIMENTS } from "@/components/learn/experiments";
import type { LabContext } from "@/components/learn/labKit";
import { Quiz } from "@/components/learn/Quiz";
import { Button } from "@/components/ui/Button";
import { LESSONS, type Lesson } from "@/lib/learn/lessons";
import { cn } from "@/lib/cn";

interface LessonPageProps {
  lesson: Lesson;
  completed: boolean;
  ctx: LabContext;
  onComplete: () => void;
  onNavigate: (lessonId: string) => void;
}

export function LessonPage({ lesson, completed, ctx, onComplete, onNavigate }: LessonPageProps) {
  const number = LESSONS.findIndex((l) => l.id === lesson.id) + 1;
  const prev = LESSONS[number - 2];
  const next = LESSONS[number];
  const Experiment = EXPERIMENTS[lesson.experiment];
  const heading = useRef<HTMLHeadingElement>(null);
  const [ticked, setTicked] = useState<boolean[]>(() => lesson.steps.map(() => false));

  // Moving between lessons: put keyboard/screen-reader focus on the new title.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    heading.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [lesson.id]);

  return (
    <article className="min-w-0 space-y-4" aria-labelledby={`lesson-${lesson.id}`}>
      <header className="rounded-xl border border-border bg-surface/90 p-4 sm:p-5">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>Ders {number} / {LESSONS.length}</span>
          <span className="flex items-center gap-1"><Clock className="size-3.5" aria-hidden /> ~{lesson.minutes} dakika</span>
          {completed && (
            <span className="flex items-center gap-1 font-medium text-valid">
              <CheckCircle2 className="size-3.5" aria-hidden /> Tamamlandı
            </span>
          )}
        </p>
        <h2 id={`lesson-${lesson.id}`} ref={heading} tabIndex={-1} className="mt-1 scroll-mt-24 text-xl font-semibold tracking-tight outline-none sm:text-2xl">
          {lesson.title}
        </h2>
        <p className="mt-1 text-sm text-muted">{lesson.summary}</p>
      </header>

      <section className="rounded-xl border border-border bg-surface/90 p-4 sm:p-5" aria-label="Açıklama">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <BookOpen className="size-4 text-accent" aria-hidden /> Açıklama
        </h3>
        <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-fg/90">
          {lesson.explanation.map((p) => <p key={p}>{p}</p>)}
        </div>
        {lesson.important && (
          <div className="mt-4 flex max-w-3xl gap-2 rounded-lg border border-mining/30 bg-mining/6 px-3 py-2.5 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-mining" aria-hidden />
            <p><strong className="text-mining">Önemli: </strong>{lesson.important}</p>
          </div>
        )}
        <ul className="mt-4 grid max-w-3xl gap-1.5 text-sm sm:grid-cols-3">
          {lesson.keyPoints.map((k) => (
            <li key={k} className="rounded-lg border border-border bg-bg/40 px-3 py-2 text-xs text-fg/85">{k}</li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <Experiment ctx={ctx} />
        </div>
        <section className="rounded-xl border border-border bg-surface/90 p-4" aria-label="Adımlar">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Footprints className="size-4 text-accent" aria-hidden /> Adımlar
          </h3>
          <ol className="space-y-2">
            {lesson.steps.map((step, i) => (
              <li key={step}>
                <label className={cn("flex cursor-pointer gap-2.5 rounded-lg border px-3 py-2 text-sm", ticked[i] ? "border-valid/30 bg-valid/5 text-fg/70" : "border-border")}>
                  <input
                    type="checkbox"
                    checked={ticked[i] ?? false}
                    onChange={() => setTicked((prev) => prev.map((t, j) => (j === i ? !t : t)))}
                    className="mt-0.5 accent-[var(--color-valid)]"
                  />
                  <span><span className="font-mono text-subtle">{i + 1}.</span> {step}</span>
                </label>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11px] text-subtle">İlerledikçe adımları işaretleyin. Dersi tamamlamak için sınavı bitirin.</p>
        </section>
      </div>

      <Quiz key={lesson.id} lesson={lesson} completed={completed} onPassed={onComplete} />

      <nav className="flex flex-wrap justify-between gap-2" aria-label="Dersler arasında gezinme">
        {prev ? (
          <Button icon={ChevronRight} onClick={() => onNavigate(prev.id)}>{prev.title}</Button>
        ) : <span />}
        {next && (
          <Button variant={completed ? "primary" : "secondary"} onClick={() => onNavigate(next.id)}>
            {next.title} <ChevronLeft className="size-4" aria-hidden />
          </Button>
        )}
      </nav>
    </article>
  );
}
