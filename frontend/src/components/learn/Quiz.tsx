"use client";

import { CheckCircle2, ListChecks, RotateCcw, XCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import type { Lesson } from "@/lib/learn/lessons";
import { gradeQuiz, type QuizResult } from "@/lib/learn/progress";
import { cn } from "@/lib/cn";

interface QuizProps {
  lesson: Lesson;
  completed: boolean;
  onPassed: () => void;
}

/** Multiple-choice quiz. Feedback and an explanation appear after checking. */
export function Quiz({ lesson, completed, onPassed }: QuizProps) {
  const [answers, setAnswers] = useState<Array<number | null>>(() => lesson.quiz.map(() => null));
  const [result, setResult] = useState<QuizResult | null>(null);

  const allAnswered = answers.every((a) => a !== null);

  const check = () => {
    const graded = gradeQuiz(lesson, answers);
    setResult(graded);
    if (graded.passed) onPassed();
  };

  const retry = () => {
    // Keep correct answers, clear the wrong ones.
    setAnswers((prev) => prev.map((a, i) => (result?.correct[i] ? a : null)));
    setResult(null);
  };

  return (
    <section className="rounded-xl border border-border bg-surface/90" aria-labelledby={`quiz-${lesson.id}`}>
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 id={`quiz-${lesson.id}`} className="flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="size-4 text-accent" aria-hidden /> Sınav
        </h3>
        {completed && (
          <span className="flex items-center gap-1 text-xs font-medium text-valid">
            <CheckCircle2 className="size-4" aria-hidden /> Ders tamamlandı
          </span>
        )}
      </header>

      <div className="space-y-5 p-4">
        {lesson.quiz.map((q, qi) => {
          const checked = result !== null;
          const isRight = result?.correct[qi] ?? false;
          return (
            <fieldset key={qi} className="space-y-2">
              <legend className="text-sm font-medium">
                {qi + 1}. {q.question}
              </legend>
              <div className="grid gap-1.5">
                {q.options.map((option, oi) => {
                  const id = `${lesson.id}-q${qi}-o${oi}`;
                  const chosen = answers[qi] === oi;
                  return (
                    <label
                      key={oi}
                      htmlFor={id}
                      className={cn(
                        "flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                        checked && oi === q.answer && "border-valid/50 bg-valid/8",
                        checked && chosen && oi !== q.answer && "border-invalid/50 bg-invalid/8",
                        !checked && chosen && "border-accent/60 bg-accent/8",
                        !checked && !chosen && "border-border hover:border-border-strong",
                      )}
                    >
                      <input
                        id={id}
                        type="radio"
                        name={`${lesson.id}-q${qi}`}
                        className="mt-0.5 accent-[var(--color-accent)]"
                        checked={chosen}
                        disabled={checked}
                        onChange={() => setAnswers((prev) => prev.map((a, i) => (i === qi ? oi : a)))}
                      />
                      <span>{option}</span>
                    </label>
                  );
                })}
              </div>
              {checked && (
                <p
                  role="status"
                  className={cn("flex items-start gap-1.5 text-xs leading-relaxed", isRight ? "text-valid" : "text-invalid")}
                >
                  {isRight ? <CheckCircle2 className="mt-px size-3.5 shrink-0" aria-hidden /> : <XCircle className="mt-px size-3.5 shrink-0" aria-hidden />}
                  <span>
                    <strong>{isRight ? "Doğru cevap. " : "Tam olarak değil. "}</strong>
                    <span className="text-fg/85">{q.explanation}</span>
                  </span>
                </p>
              )}
            </fieldset>
          );
        })}

        <div className="flex flex-wrap items-center gap-3">
          {result === null ? (
            <Button variant="primary" disabled={!allAnswered} onClick={check}>
              Cevapları kontrol et
            </Button>
          ) : result.passed ? (
            <p className="text-sm font-medium text-valid">
              {result.score}/{result.total}: Harika, bu ders tamamlandı.
            </p>
          ) : (
            <>
              <p className="text-sm text-mining">
                {result.score}/{result.total} doğru. Açıklamaları okuyun ve kalanları yeniden deneyin.
              </p>
              <Button size="sm" icon={RotateCcw} onClick={retry}>
                Tekrar dene
              </Button>
            </>
          )}
          {!allAnswered && result === null && <span className="text-xs text-subtle">Kontrol etmek için tüm soruları cevaplayın.</span>}
        </div>
      </div>
    </section>
  );
}
