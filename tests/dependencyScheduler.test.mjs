import test from "node:test";
import assert from "node:assert/strict";
import { findDependencyCycles, getReadyTasks } from "../dist/core/dependencyScheduler.js";

const task = (id, dependsOn = [], status = "pending") => ({
  id, title: id, description: "scheduler fixture", kind: "coding",
  requirementIds: [], dependsOn, status
});

test("ready-task selection excludes running/completed tasks and unresolved dependencies", () => {
  const tasks = [
    task("root"),
    task("child", ["root"]),
    task("running", [], "ready"),
    task("blocked", ["unknown"])
  ];
  const ready = getReadyTasks(tasks, new Set(), new Set(["running"]));
  assert.deepEqual(ready.map(item => item.id), ["root"]);
  const afterRoot = getReadyTasks(tasks, new Set(["root"]), new Set(["running"]));
  assert.deepEqual(afterRoot.map(item => item.id), ["root", "child"]);
});

test("dependency cycle detection identifies self-cycles and multi-node cycles", () => {
  assert.deepEqual(findDependencyCycles([task("self", ["self"])]), [["self", "self"]]);
  const cycles = findDependencyCycles([task("a", ["b"]), task("b", ["a"]), task("independent")]);
  assert.deepEqual(cycles, [["a", "b", "a"]]);
});

test("cycle detection ignores dependencies whose task IDs are absent", () => {
  assert.deepEqual(findDependencyCycles([task("a", ["missing"])]), []);
});
