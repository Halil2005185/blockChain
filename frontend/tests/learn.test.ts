/**
 * Lesson content integrity, quiz grading, progress storage and the PoS model.
 * Run with:  npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GUIDED_EXPERIMENTS, LESSONS, lessonById } from "../src/lib/learn/lessons.ts";
import { seededRandom, simulatePoS, simulatePoW, weightedPick } from "../src/lib/learn/pos.ts";
import {
  emptyProgress,
  gradeQuiz,
  isCompleted,
  markCompleted,
  nextLessonId,
  parseProgress,
} from "../src/lib/learn/progress.ts";

describe("lesson content", () => {
  it("has the 14 lessons of the learning path, with unique ids", () => {
    assert.equal(LESSONS.length, 14);
    assert.equal(new Set(LESSONS.map((l) => l.id)).size, 14);
  });

  it("gives every lesson an explanation, experiment, walkthrough and quiz", () => {
    for (const lesson of LESSONS) {
      assert.ok(lesson.explanation.length >= 2, `${lesson.id}: explanation`);
      assert.ok(lesson.keyPoints.length >= 2, `${lesson.id}: key points`);
      assert.ok(lesson.steps.length >= 3, `${lesson.id}: steps`);
      assert.ok(lesson.quiz.length >= 2, `${lesson.id}: quiz`);
      for (const q of lesson.quiz) {
        assert.ok(q.options.length >= 2, `${lesson.id}: options`);
        assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, `${lesson.id}: answer index`);
        assert.ok(q.explanation.length > 20, `${lesson.id}: explanation text`);
        assert.equal(new Set(q.options).size, q.options.length, `${lesson.id}: duplicate options`);
      }
    }
  });

  it("uses each experiment once and links every guided experiment to a lesson", () => {
    assert.equal(new Set(LESSONS.map((l) => l.experiment)).size, LESSONS.length);
    assert.equal(GUIDED_EXPERIMENTS.length, 8);
    for (const g of GUIDED_EXPERIMENTS) assert.ok(lessonById(g.lessonId), g.lessonId);
  });

  it("states the key accuracy points explicitly", () => {
    const text = (id: string) => {
      const l = lessonById(id)!;
      return [...l.explanation, l.important ?? ""].join(" ");
    };
    assert.match(text("sha256"), /şifreleme değildir/); // a hash is not encryption
    assert.match(text("forks-and-reorgs"), /kümülatif iş/); // cumulative work
    assert.match(text("forks-and-reorgs"), /otomatik olarak en iyisi değildir|basitleştirme/); // longest chain is a simplification
    assert.match(text("pow-vs-pos"), /madencilik yapmaz|madencilik kullanmaz/); // PoS does not mine
    assert.match(text("digital-signatures"), /imza kullanmaz/); // no signatures here
    assert.match(text("propagation-and-consensus"), /Bizans hata toleranslı değildir/); // not BFT
    assert.match(text("propagation-and-consensus"), /geçerlilik/i); // validity vs consensus
    // Nothing claims Byzantine fault tolerance: "toleranslı" (tolerant) must always be followed by "değil" (is not).
    for (const l of LESSONS) assert.doesNotMatch(text(l.id), /Bizans hata toleranslı(?! değil)/);
  });
});

describe("quiz grading and progress", () => {
  const lesson = LESSONS[2]!; // sha256, 3 questions
  const right = lesson.quiz.map((q) => q.answer);

  it("passes only when every answer is correct", () => {
    assert.deepEqual(gradeQuiz(lesson, right), { correct: [true, true, true], score: 3, total: 3, passed: true });
    const oneWrong = [...right];
    oneWrong[1] = (right[1]! + 1) % lesson.quiz[1]!.options.length;
    const result = gradeQuiz(lesson, oneWrong);
    assert.equal(result.passed, false);
    assert.deepEqual(result.correct, [true, false, true]);
    assert.equal(gradeQuiz(lesson, [null, null, null]).score, 0);
  });

  it("records completion once and finds the next lesson", () => {
    let p = emptyProgress();
    assert.equal(nextLessonId(LESSONS, p), LESSONS[0]!.id);
    p = markCompleted(p, LESSONS[0]!.id);
    p = markCompleted(p, LESSONS[0]!.id);
    assert.deepEqual(p.completed, [LESSONS[0]!.id]);
    assert.ok(isCompleted(p, LESSONS[0]!.id));
    assert.equal(nextLessonId(LESSONS, p), LESSONS[1]!.id);
  });

  it("reads stored progress defensively", () => {
    const ids = LESSONS.map((l) => l.id);
    assert.deepEqual(parseProgress(null, ids), emptyProgress());
    assert.deepEqual(parseProgress("not json", ids), emptyProgress());
    assert.deepEqual(parseProgress("[1,2]", ids), emptyProgress());
    assert.deepEqual(parseProgress('{"completed":"sha256"}', ids), emptyProgress());
    const stored = JSON.stringify({ completed: ["sha256", "sha256", "unknown-lesson", 42] });
    assert.deepEqual(parseProgress(stored, ids), { version: 1, completed: ["sha256"] });
  });
});

describe("conceptual PoW vs PoS model", () => {
  it("is reproducible with a seed", () => {
    const people = [{ name: "a", weight: 1 }, { name: "b", weight: 3 }];
    assert.deepEqual(simulatePoS(people, 50, seededRandom(1)), simulatePoS(people, 50, seededRandom(1)));
  });

  it("wins roughly follow the weights", () => {
    const people = [{ name: "small", weight: 1 }, { name: "big", weight: 3 }];
    const { wins } = simulatePoS(people, 4000, seededRandom(42));
    const share = wins.big! / 4000;
    assert.ok(share > 0.7 && share < 0.8, `big won ${share}`);
  });

  it("counts hash work for PoW but none for PoS", () => {
    const people = [{ name: "a", weight: 1 }];
    assert.equal(simulatePoW(people, 10, seededRandom(3), 3).work, 10 * 4096);
    assert.equal(simulatePoS(people, 10, seededRandom(3)).work, 0);
  });

  it("never picks a zero-weight participant and rejects all-zero weights", () => {
    const people = [{ name: "none", weight: 0 }, { name: "all", weight: 5 }];
    const random = seededRandom(9);
    for (let i = 0; i < 200; i++) assert.equal(weightedPick(people, random), "all");
    assert.throws(() => weightedPick([{ name: "x", weight: 0 }], random));
  });
});
