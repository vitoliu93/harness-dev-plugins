#!/usr/bin/env python3
"""Deterministic style checks for runtime skill surfaces."""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


SKIP_PARTS = {
    ".git",
    "__pycache__",
    "_archive",
    "archive",
    "dist",
    "evals",
    "node_modules",
    "reports",
    "skill_atlas",
    "tests",
    "venv",
    ".venv",
}
RUNTIME_DOC_DIRS = {"references", "assets", "templates", "scripts", "agents"}
SKILL_SURFACE_DIRS = RUNTIME_DOC_DIRS | {"evals"}
PATH_SCAN_SUFFIXES = {".md", ".json", ".py", ".sh", ".ts", ".js", ".mjs", ".yaml", ".yml"}
SELF_EXCLUDED_FILES = {"skill_style.py"}
ALLOW_PATTERN = re.compile(
    r"style-lint:\s*allow\s+([a-z0-9_,-]+)\s+--\s+\S+",
    re.IGNORECASE,
)

WHEN_LINE = re.compile(
    r"^(?:Use when\b|Use before\b|Use after\b|Use for\b|Invoke when\b|"
    r"When .+ use\b|当.+时使用[。.]?$|在.+时使用[。.]?$|需要.+时使用[。.]?$|适用于.+)",
    re.IGNORECASE,
)
BAD_FIRST_LINE = re.compile(
    r"^(?:This skill\b|本\s*skill\b|这个\s*skill\b|Use when\b|Invoke when\b|当.+时使用)"
)

LITERAL_PATTERNS = (
    (
        "internal-ticket",
        re.compile(r"(?<![A-Z0-9])(?:IJ|IK)[A-Z0-9]{4,}(?![A-Z0-9])"),
        "Use a fictional placeholder unless runtime requires this exact external id.",
    ),
)

LOCAL_PATH_PATTERNS = (
    (
        re.compile(r"/Users/[A-Za-z0-9._-]+(?=/|\s|#|$)"),
        "Replace the user-specific absolute path with a skill/plugin root or configurable variable.",
    ),
    (
        re.compile(r"/home/[A-Za-z0-9._-]+(?=/|\s|#|$)"),
        "Replace the user-specific absolute path with a skill/plugin root or configurable variable.",
    ),
    (
        re.compile(r"~/(?:codebase|Documents|Downloads|Desktop|tmp)(?:/|\b)"),
        "Use a named environment variable; a home-directory workspace is not portable.",
    ),
    (
        re.compile(r"<[A-Za-z0-9_-]+-base>/"),
        "Use a named repository-root variable or a remote repository reference.",
    ),
    (
        re.compile(r"\$\{?CLAUDE_SKILL_DIR\}?/\.\./"),
        "Do not assume a sibling skill path; resolve it from the plugin root or a named variable.",
    ),
)
FIXED_RUNTIME_ID_PATTERNS = (
    (
        re.compile(
            r"(?:workspace[_ -]?id|WORKSPACE_ID).{0,100}"
            r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b",
            re.IGNORECASE,
        ),
        "Resolve workspace ids at runtime or accept them through a named environment variable.",
    ),
)


@dataclass(frozen=True)
class StyleIssue:
    skill: str
    skill_path: str
    file: str
    line: int
    code: str
    message: str
    excerpt: str


def _safe_rel(root: Path, path: Path) -> str:
    try:
        return str(path.resolve().relative_to(root.resolve()))
    except ValueError:
        return str(path.resolve())


def _allowed_codes(line: str) -> set[str]:
    match = ALLOW_PATTERN.search(line)
    if not match:
        return set()
    return {code.strip() for code in match.group(1).split(",") if code.strip()}


def _frontmatter_description(path: Path) -> tuple[list[str], int, str]:
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    if not lines or lines[0].strip() != "---":
        return [], 1, "missing"
    try:
        end = lines[1:].index("---") + 1
    except ValueError:
        return [], 1, "missing"
    for index, line in enumerate(lines[1:end], start=1):
        if not line.startswith("description:"):
            continue
        value = line.split(":", 1)[1].strip()
        if value not in {">-", ">", "|-", "|"}:
            return ([value] if value else []), index + 1, "inline"
        content: list[str] = []
        cursor = index + 1
        while cursor < end and (lines[cursor][:1] in {" ", "\t"} or not lines[cursor].strip()):
            if lines[cursor].strip():
                content.append(lines[cursor].strip())
            cursor += 1
        return content, index + 1, value
    return [], 1, "missing"


def _skill_name(skill_dir: Path) -> str:
    lines = (skill_dir / "SKILL.md").read_text(encoding="utf-8", errors="replace").splitlines()
    for line in lines[:40]:
        if line.startswith("name:"):
            return line.split(":", 1)[1].strip().strip("\"'")
    return skill_dir.name


def find_skill_dirs(workspace_root: Path) -> list[Path]:
    result = []
    for path in sorted(workspace_root.rglob("SKILL.md")):
        rel = path.relative_to(workspace_root)
        if any(part in SKIP_PARTS for part in rel.parts):
            continue
        result.append(path.parent)
    return result


def find_orphan_skill_dirs(workspace_root: Path) -> list[Path]:
    result = set()
    orphan_skip_parts = SKIP_PARTS - {"evals"}
    for path in sorted(workspace_root.rglob("*")):
        if not path.is_file() or path.name == "SKILL.md":
            continue
        rel = path.relative_to(workspace_root)
        if any(part in orphan_skip_parts for part in rel.parts):
            continue
        candidate = path.parent
        for index, part in enumerate(rel.parts[:-1]):
            if part in SKILL_SURFACE_DIRS:
                candidate = workspace_root.joinpath(*rel.parts[:index])
                break
        if candidate == workspace_root or (candidate / "SKILL.md").exists():
            continue
        if path.suffix in PATH_SCAN_SUFFIXES or any(
            part in SKILL_SURFACE_DIRS for part in rel.parts
        ):
            result.add(candidate)
    return sorted(result)


def _runtime_doc_files(skill_dir: Path) -> Iterable[Path]:
    for path in sorted(skill_dir.glob("*.md")):
        yield path
    for dirname in RUNTIME_DOC_DIRS:
        root = skill_dir / dirname
        if not root.exists():
            continue
        for path in sorted(root.rglob("*.md")):
            if not any(part in SKIP_PARTS for part in path.relative_to(skill_dir).parts):
                yield path


def _runtime_path_files(skill_dir: Path) -> Iterable[Path]:
    for path in sorted(skill_dir.rglob("*")):
        if not path.is_file() or path.suffix not in PATH_SCAN_SUFFIXES:
            continue
        rel = path.relative_to(skill_dir)
        if any(part in SKIP_PARTS for part in rel.parts):
            continue
        if path.name in SELF_EXCLUDED_FILES or path.name.startswith("test_"):
            continue
        yield path


def _issue(
    workspace_root: Path,
    skill_dir: Path,
    skill: str,
    path: Path,
    line: int,
    code: str,
    message: str,
    excerpt: str,
) -> StyleIssue:
    return StyleIssue(
        skill=skill,
        skill_path=_safe_rel(workspace_root, skill_dir),
        file=_safe_rel(workspace_root, path),
        line=line,
        code=code,
        message=message,
        excerpt=excerpt.strip()[:240],
    )


def _description_issues(workspace_root: Path, skill_dir: Path, skill: str) -> list[StyleIssue]:
    path = skill_dir / "SKILL.md"
    content, line, style = _frontmatter_description(path)
    issues = []
    if style != ">-":
        issues.append(
            _issue(
                workspace_root,
                skill_dir,
                skill,
                path,
                line,
                "description-block",
                "Use a folded `description: >-` block.",
                f"description style: {style}",
            )
        )
    if len(content) != 2:
        issues.append(
            _issue(
                workspace_root,
                skill_dir,
                skill,
                path,
                line,
                "description-two-lines",
                "Write exactly two content lines: what it does, then when to use it.",
                " | ".join(content),
            )
        )
        return issues
    if BAD_FIRST_LINE.search(content[0]):
        issues.append(
            _issue(
                workspace_root,
                skill_dir,
                skill,
                path,
                line + 1,
                "description-action",
                "Start line 1 with the action; do not introduce or route the skill.",
                content[0],
            )
        )
    if not WHEN_LINE.search(content[1]):
        issues.append(
            _issue(
                workspace_root,
                skill_dir,
                skill,
                path,
                line + 2,
                "description-when",
                "Start line 2 with an invocation phrase such as `Use when`, `Use before`, or `当…时使用`.",
                content[1],
            )
        )
    return issues


def _doc_issues(workspace_root: Path, skill_dir: Path, skill: str) -> list[StyleIssue]:
    issues = []
    seen = set()
    for path in _runtime_doc_files(skill_dir):
        if path in seen:
            continue
        seen.add(path)
        in_code = False
        in_frontmatter = False
        line_limit = 240 if path.name == "SKILL.md" else 360
        for line_no, line in enumerate(
            path.read_text(encoding="utf-8", errors="replace").splitlines(), start=1
        ):
            stripped = line.strip()
            if path.name == "SKILL.md" and line_no == 1 and stripped == "---":
                in_frontmatter = True
                continue
            if in_frontmatter:
                if stripped == "---":
                    in_frontmatter = False
                continue
            if stripped.startswith("```"):
                in_code = not in_code
                continue
            if in_code:
                continue
            allowed = _allowed_codes(line)
            for code, pattern, message in LITERAL_PATTERNS:
                if code not in allowed and pattern.search(line):
                    issues.append(
                        _issue(
                            workspace_root,
                            skill_dir,
                            skill,
                            path,
                            line_no,
                            code,
                            message,
                            line,
                        )
                    )
            if (
                len(stripped) > line_limit
                and "prose-wall" not in allowed
                and not stripped.startswith(("#", "|", "<!--"))
                and not re.match(r"^\[[^\]]+\]:", stripped)
            ):
                issues.append(
                    _issue(
                        workspace_root,
                        skill_dir,
                        skill,
                        path,
                        line_no,
                        "prose-wall",
                        f"Split this runtime prose line below {line_limit} characters.",
                        line,
                    )
                )
    return issues


def _is_comment_or_metadata(path: Path, stripped: str) -> bool:
    if path.suffix in {".json", ".yaml", ".yml"}:
        return True
    if path.suffix in {".py", ".sh"}:
        return stripped.startswith("#")
    if path.suffix in {".js", ".mjs", ".ts"}:
        return stripped.startswith(("//", "/*", "*"))
    return False


def _path_issues(workspace_root: Path, skill_dir: Path, skill: str) -> list[StyleIssue]:
    issues = []
    for path in _runtime_path_files(skill_dir):
        for line_no, line in enumerate(
            path.read_text(encoding="utf-8", errors="replace").splitlines(), start=1
        ):
            stripped = line.strip()
            allowed = _allowed_codes(line)
            if _is_comment_or_metadata(path, stripped):
                for code, pattern, message in LITERAL_PATTERNS:
                    if code not in allowed and pattern.search(line):
                        issues.append(
                            _issue(
                                workspace_root,
                                skill_dir,
                                skill,
                                path,
                                line_no,
                                code,
                                message,
                                line,
                            )
                        )
            for pattern, message in LOCAL_PATH_PATTERNS:
                if (
                    "local-path" not in allowed
                    and pattern.search(line)
                ):
                    issues.append(
                        _issue(
                            workspace_root,
                            skill_dir,
                            skill,
                            path,
                            line_no,
                            "local-path",
                            message,
                            line,
                        )
                    )
            for pattern, message in FIXED_RUNTIME_ID_PATTERNS:
                if (
                    "fixed-runtime-id" not in allowed
                    and pattern.search(line)
                ):
                    issues.append(
                        _issue(
                            workspace_root,
                            skill_dir,
                            skill,
                            path,
                            line_no,
                            "fixed-runtime-id",
                            message,
                            line,
                        )
                    )
    return issues


def audit_skill(workspace_root: Path, skill_dir: Path) -> list[StyleIssue]:
    skill = _skill_name(skill_dir)
    return (
        _description_issues(workspace_root, skill_dir, skill)
        + _doc_issues(workspace_root, skill_dir, skill)
        + _path_issues(workspace_root, skill_dir, skill)
    )


def audit_workspace(
    workspace_root: Path, skill_dirs: Iterable[Path] | None = None
) -> list[StyleIssue]:
    workspace_root = workspace_root.resolve()
    dirs = list(skill_dirs) if skill_dirs is not None else find_skill_dirs(workspace_root)
    issues = []
    for skill_dir in dirs:
        issues.extend(audit_skill(workspace_root, skill_dir.resolve()))
    for orphan in find_orphan_skill_dirs(workspace_root):
        issues.append(
            _issue(
                workspace_root,
                orphan,
                orphan.name,
                orphan,
                1,
                "missing-skill",
                "Add SKILL.md before shipping references, scripts, assets, or templates.",
                str(orphan),
            )
        )
    return sorted(issues, key=lambda item: (item.skill_path, item.file, item.line, item.code))


def main() -> None:
    parser = argparse.ArgumentParser(description="Lint runtime Skill & Doc Style contracts.")
    parser.add_argument("--workspace-root", default=".")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--fail-on-issues", action="store_true")
    args = parser.parse_args()

    root = Path(args.workspace_root).resolve()
    issues = audit_workspace(root)
    payload = {
        "ok": not issues,
        "workspace_root": str(root),
        "skill_count": len(find_skill_dirs(root)),
        "issue_count": len(issues),
        "issues": [asdict(item) for item in issues],
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    elif issues:
        for item in issues:
            print(f"{item.file}:{item.line}: {item.code}: {item.message}")
        print(f"{len(issues)} style issue(s)")
    else:
        print(f"style clean: {payload['skill_count']} skill(s)")
    if args.fail_on_issues and issues:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
