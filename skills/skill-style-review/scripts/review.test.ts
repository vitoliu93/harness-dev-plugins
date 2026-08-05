import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  chunkDocuments,
  discoverMarkdown,
  discoverSkillDirs,
  normalizeIssues,
  redactSecrets,
} from "./review";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "skill-style-review-"));
  roots.push(root);
  return root;
}

function write(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("document discovery", () => {
  test("includes runtime Markdown and skips eval fixtures", () => {
    const root = tempRoot();
    write(join(root, "SKILL.md"), "---\nname: demo\n---\n");
    write(join(root, "notes.md"), "root note");
    write(join(root, "references", "rule.md"), "runtime rule");
    write(join(root, "scripts", "prompt.md"), "runtime prompt");
    write(join(root, "evals", "case.md"), "fixture");

    expect(discoverMarkdown(root).map((file) => file.relativePath)).toEqual([
      "SKILL.md",
      "notes.md",
      "references/rule.md",
      "scripts/prompt.md",
    ]);
  });

  test("finds skills recursively and skips archives", () => {
    const root = tempRoot();
    write(join(root, "alpha", "SKILL.md"), "---\nname: alpha\n---\n");
    write(join(root, "nested", "beta", "SKILL.md"), "---\nname: beta\n---\n");
    write(join(root, "_archive", "old", "SKILL.md"), "---\nname: old\n---\n");

    expect(discoverSkillDirs(root).map((path) => path.slice(root.length + 1))).toEqual([
      "alpha",
      "nested/beta",
    ]);
  });
});

describe("payload preparation", () => {
  test("numbers lines, chunks content, and redacts credentials", () => {
    const files = [
      {
        absolutePath: "/tmp/demo/SKILL.md",
        relativePath: "SKILL.md",
        content: "first\napi_key=abcdefghijklmnop\nthird",
      },
    ];
    const chunks = chunkDocuments(files, 1_000);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("FILE SKILL.md");
    expect(chunks[0]).toContain("1|first");
    expect(chunks[0]).toContain("2|api_key=[REDACTED_CREDENTIAL]");
    expect(chunks[0]).not.toContain("abcdefghijklmnop");
  });

  test("redacts bearer and sk-shaped credentials", () => {
    expect(redactSecrets("Bearer abcdefghijklmnop sk-abcdefghijklmnop")).toBe(
      "Bearer [REDACTED_CREDENTIAL] [REDACTED_CREDENTIAL]",
    );
  });
});

describe("response validation", () => {
  const files = [
    {
      absolutePath: "/tmp/demo/SKILL.md",
      relativePath: "SKILL.md",
      content: "current rule\nWe paid dearly for this rule.",
    },
  ];

  test("normalizes repository-prefixed files", () => {
    const issues = normalizeIssues(
      {
        issues: [
          {
            file: "skills/demo/SKILL.md",
            line: 2,
            category: "tuition-narrative",
            evidence: "We paid dearly for this rule.",
            reason: "Uses pain as justification.",
            rewrite: "Apply the rule when the condition holds.",
          },
        ],
      },
      files,
      files[0].content,
    );

    expect(issues[0].file).toBe("SKILL.md");
  });

  test("rejects hallucinated evidence", () => {
    expect(() =>
      normalizeIssues(
        {
          issues: [
            {
              file: "SKILL.md",
              line: 1,
              category: "marketing-language",
              evidence: "not in source",
              reason: "unsupported",
              rewrite: "replace it",
            },
          ],
        },
        files,
        files[0].content,
      ),
    ).toThrow("evidence is not present");
  });

  test("drops gate-loss without a deleted diff line", () => {
    const issues = normalizeIssues(
      {
        issues: [
          {
            file: "SKILL.md",
            line: 1,
            category: "gate-loss",
            evidence: "current rule",
            reason: "Claims the gate was removed.",
            rewrite: "Restore the gate.",
          },
        ],
      },
      files,
      files[0].content,
    );

    expect(issues).toEqual([]);
  });

  test("keeps gate-loss grounded in a deleted diff line", () => {
    const deleted = "Fail the commit when verification fails.";
    const issues = normalizeIssues(
      {
        issues: [
          {
            file: "SKILL.md",
            line: 0,
            category: "gate-loss",
            evidence: deleted,
            reason: "Deletes the verification gate.",
            rewrite: "Restore the verification gate.",
          },
        ],
      },
      files,
      `${files[0].content}\n${deleted}`,
      `-${deleted}`,
    );

    expect(issues).toHaveLength(1);
    expect(issues[0].line).toBe(0);
  });
});
