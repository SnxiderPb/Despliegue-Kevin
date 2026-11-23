const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateProgress } = require("../ChecklistProgress.Js");

const tasks = [
  { id: "git" },
  { id: "vercel" },
  { id: "domain" }
];

test("calculates completed tasks and rounded percentage", () => {
  assert.deepEqual(calculateProgress(tasks, { git: true, vercel: true }), {
    completedCount: 2,
    percentage: 67
  });
});

test("returns zero progress when no tasks are completed", () => {
  assert.deepEqual(calculateProgress(tasks, {}), {
    completedCount: 0,
    percentage: 0
  });
});

test("returns zero progress for an empty task list", () => {
  assert.deepEqual(calculateProgress([], { git: true }), {
    completedCount: 0,
    percentage: 0
  });
});
