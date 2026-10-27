/**
 * Lesson progress and quiz grading. Pure functions (unit-tested in Node);
 * the React hook in hooks/useLearnProgress.ts adds browser storage.
 */

import type { Lesson } from "./lessons.ts";

export interface LearnProgress {
  version: 1;
  /** Lesson ids whose quiz was passed. */
  completed: string[];
}

export interface QuizResult {
  correct: boolean[];
  score: number;
  total: number;
  passed: boolean;
}

export const STORAGE_KEY = "bce.learn.progress.v1";

export function emptyProgress(): LearnProgress {
  return { version: 1, completed: [] };
}

/** A lesson is passed when every question is answered correctly. */
export function gradeQuiz(lesson: Lesson, answers: Array<number | null>): QuizResult {
  const correct = lesson.quiz.map((q, i) => answers[i] === q.answer);
  const score = correct.filter(Boolean).length;
  return { correct, score, total: lesson.quiz.length, passed: score === lesson.quiz.length };
}

export function markCompleted(progress: LearnProgress, lessonId: string): LearnProgress {
  if (progress.completed.includes(lessonId)) return progress;
  return { ...progress, completed: [...progress.completed, lessonId] };
}

export function isCompleted(progress: LearnProgress, lessonId: string): boolean {
  return progress.completed.includes(lessonId);
}

/** Read stored progress defensively: anything unexpected becomes empty progress. */
export function parseProgress(raw: string | null, knownIds: readonly string[]): LearnProgress {
  if (!raw) return emptyProgress();
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return emptyProgress();
    const completed = (value as { completed?: unknown }).completed;
    if (!Array.isArray(completed)) return emptyProgress();
    const known = new Set(knownIds);
    const ids = completed.filter((id): id is string => typeof id === "string" && known.has(id));
    return { version: 1, completed: [...new Set(ids)] };
  } catch {
    return emptyProgress();
  }
}

/** The first lesson not completed yet (or the first lesson if all are done). */
export function nextLessonId(lessons: readonly Lesson[], progress: LearnProgress): string {
  return (lessons.find((l) => !progress.completed.includes(l.id)) ?? lessons[0]!).id;
}
