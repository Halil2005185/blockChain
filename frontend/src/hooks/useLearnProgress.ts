"use client";

import { useCallback, useEffect, useState } from "react";

import { LESSONS } from "@/lib/learn/lessons";
import { emptyProgress, markCompleted, parseProgress, STORAGE_KEY, type LearnProgress } from "@/lib/learn/progress";

const IDS = LESSONS.map((l) => l.id);

/**
 * Lesson progress for this browser. Saved in localStorage as a convenience:
 * storage can be unavailable (private mode, blocked site data), so every
 * access is wrapped and the Academy works without it.
 */
export function useLearnProgress() {
  const [progress, setProgress] = useState<LearnProgress>(emptyProgress);
  // False until stored progress has been read (it can't be read during SSR).
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      setProgress(parseProgress(window.localStorage.getItem(STORAGE_KEY), IDS));
    } catch {
      /* storage blocked: start empty */
    }
    setLoaded(true);
  }, []);

  const save = useCallback((next: LearnProgress) => {
    setProgress(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* not saved; still works for this visit */
    }
  }, []);

  const complete = useCallback((lessonId: string) => setProgress((prev) => {
    const next = markCompleted(prev, lessonId);
    if (next !== prev) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }
    return next;
  }), []);

  const reset = useCallback(() => save(emptyProgress()), [save]);

  return { progress, loaded, complete, reset };
}
