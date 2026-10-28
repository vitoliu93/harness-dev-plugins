import { expect, test } from "bun:test";
import { addTodo, closeTodo, openDb, openTodos, reopenTodo } from "./todo.ts";

test("same session filing twice stays one row, even after close (distill rerun)", () => {
  const db = openDb(":memory:");
  const t = { title: "上传失败没有重试", project: "/p", source: "distill" as const, session: "s1" };
  expect(addTodo(db, t)).not.toBeNull();
  expect(addTodo(db, t)).toBeNull();
  const id = (db.query("SELECT id FROM todos").get() as any).id;
  expect(closeTodo(db, id, "done", "user")).toBe(true);
  expect(addTodo(db, t)).toBeNull();
  expect((db.query("SELECT COUNT(*) n FROM todos").get() as any).n).toBe(1);
});

test("open twin from another session is skipped; a closed one can come back", () => {
  const db = openDb(":memory:");
  const a = addTodo(db, { title: "上传失败 没有重试。", project: "/p", source: "inline" })!;
  expect(addTodo(db, { title: "上传失败没有重试", project: "/p", source: "distill", session: "s2" })).toBeNull();
  expect(addTodo(db, { title: "上传失败没有重试", project: "/other", source: "inline" })).not.toBeNull();
  closeTodo(db, a, "done", "user");
  expect(addTodo(db, { title: "上传失败没有重试", project: "/p", source: "inline" })).not.toBeNull();
});

test("reopen undoes an automatic close", () => {
  const db = openDb(":memory:");
  const id = addTodo(db, { title: "x 坏了", project: "/p", source: "inline" })!;
  closeTodo(db, id, "done", "auto:s9");
  expect(openTodos(db, "/p")).toHaveLength(0);
  expect(reopenTodo(db, id)).toBe(true);
  expect(openTodos(db, "/p").map(t => t.id)).toEqual([id]);
});
