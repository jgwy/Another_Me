"""SKILL.md ``.zip`` pack parsing (refactor-2 §5).

Borrows ``lxm``'s ``saveAndExtractSkillZip`` approach (``git show
origin/lxm:scripts/serve-local-mirror.mjs``): unzip the pack, require a
``SKILL.md``, and derive a capability body from it. Here we do it in-memory with
the standard library only (the backend ships no PyYAML / unzip binary):

* :func:`parse_skill_pack` reads the archive with :mod:`zipfile`, locates the
  ``SKILL.md`` (case-insensitive, shallowest path wins; **422** via
  :class:`SkillPackError` if absent), splits its YAML frontmatter from the body,
  and records every packaged file in a ``resources`` manifest.
* Frontmatter is parsed by :func:`_parse_frontmatter` — a tiny, dependency-free
  parser that handles the shapes a SKILL.md actually uses (``key: value``, block
  lists, flow lists ``[a, b]``, quotes, ``true/false/null``). It is intentionally
  *not* a full YAML implementation.

The result maps onto the Skill columns: ``manifest`` (parsed frontmatter),
``skill_md`` (raw body, frontmatter stripped), ``prompt_body`` (derived from the
body), ``resources`` (``[{path, kind, ref, size}]``), plus a derived
``name`` / ``description`` / ``tags``.
"""

from __future__ import annotations

import io
import posixpath
import zipfile
from dataclasses import dataclass, field
from typing import Any

# --- Safety limits (guard against zip bombs / runaway packs) ----------------- #
_MAX_FILES = 2000
_MAX_TOTAL_UNCOMPRESSED = 64 * 1024 * 1024  # 64 MiB across all members
_MAX_SKILL_MD_BYTES = 1 * 1024 * 1024  # only read the first 1 MiB of SKILL.md

# Extension → coarse resource ``kind`` for the resources manifest.
_KIND_BY_EXT = {
    ".md": "doc",
    ".markdown": "doc",
    ".txt": "text",
    ".rst": "doc",
    ".json": "config",
    ".yaml": "config",
    ".yml": "config",
    ".toml": "config",
    ".ini": "config",
    ".py": "script",
    ".js": "script",
    ".ts": "script",
    ".tsx": "script",
    ".jsx": "script",
    ".sh": "script",
    ".rb": "script",
    ".go": "script",
    ".png": "asset",
    ".jpg": "asset",
    ".jpeg": "asset",
    ".gif": "asset",
    ".webp": "asset",
    ".svg": "asset",
    ".csv": "data",
    ".tsv": "data",
    ".parquet": "data",
}


class SkillPackError(ValueError):
    """Raised when a ``.zip`` is not a valid SKILL.md pack (caller maps to 422)."""


@dataclass
class ParsedSkillPack:
    """The library-Skill fields derived from a SKILL.md ``.zip`` pack."""

    name: str
    description: str
    prompt_body: str
    skill_md: str
    manifest: dict[str, Any]
    resources: list[dict[str, Any]] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)


def _kind_for(path: str) -> str:
    ext = posixpath.splitext(path)[1].lower()
    return _KIND_BY_EXT.get(ext, "file")


def _coerce_scalar(value: str) -> Any:
    """Coerce a frontmatter scalar: strip quotes, map ``true/false/null``.

    Numbers are intentionally left as strings so values like a ``version:
    1.0.0`` round-trip verbatim into the manifest.
    """
    v = value.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in {'"', "'"}:
        return v[1:-1]
    low = v.lower()
    if low in {"true", "yes"}:
        return True
    if low in {"false", "no"}:
        return False
    if low in {"null", "none", "~", ""}:
        return None
    return v


def _split_flow(inner: str) -> list[str]:
    """Split a flow-list body ``a, "b, c", d`` on top-level commas."""
    items: list[str] = []
    buf: list[str] = []
    quote: str | None = None
    for ch in inner:
        if quote:
            buf.append(ch)
            if ch == quote:
                quote = None
        elif ch in {'"', "'"}:
            quote = ch
            buf.append(ch)
        elif ch == ",":
            items.append("".join(buf))
            buf = []
        else:
            buf.append(ch)
    if buf:
        items.append("".join(buf))
    return [i for i in (s.strip() for s in items) if i != ""]


def _parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    """Split a ``---`` YAML frontmatter block from the body.

    Returns ``(manifest, body)``. When no frontmatter is present the manifest is
    empty and the body is the whole text.
    """
    # Tolerate a leading BOM / blank lines before the opening fence.
    stripped = text.lstrip("\ufeff")
    if not stripped.startswith("---"):
        return {}, text

    lines = stripped.splitlines()
    # The opening fence is line 0 (``---`` possibly with trailing spaces).
    if lines[0].strip() != "---":
        return {}, text

    close_idx = None
    for idx in range(1, len(lines)):
        if lines[idx].strip() in {"---", "..."}:
            close_idx = idx
            break
    if close_idx is None:
        # Unterminated frontmatter — treat the whole thing as body.
        return {}, text

    block = lines[1:close_idx]
    body = "\n".join(lines[close_idx + 1 :])
    # Drop a single leading blank line that usually follows the closing fence.
    if body.startswith("\n"):
        body = body[1:]

    data: dict[str, Any] = {}
    current_key: str | None = None
    for raw in block:
        line = raw.rstrip()
        stripped_line = line.strip()
        if not stripped_line or stripped_line.startswith("#"):
            continue

        if stripped_line[0] == "-":
            # A block-list item for the most recent key.
            if current_key is not None:
                item = stripped_line[1:].strip()
                if not isinstance(data.get(current_key), list):
                    data[current_key] = []
                if item != "":
                    data[current_key].append(_coerce_scalar(item))
            continue

        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        current_key = key
        if value == "":
            # Pending: may become a block list, or stay a bare key.
            data[key] = None
        elif value.startswith("[") and value.endswith("]"):
            inner = value[1:-1].strip()
            data[key] = [_coerce_scalar(x) for x in _split_flow(inner)] if inner else []
        else:
            data[key] = _coerce_scalar(value)

    # Normalize bare keys (no value, no list) to empty strings.
    for key, val in list(data.items()):
        if val is None:
            data[key] = ""
    return data, body


def _as_tag_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str) and value.strip():
        return [t.strip() for t in value.split(",") if t.strip()]
    return []


def _find_skill_md(names: list[str]) -> str | None:
    """Return the archive member that is a ``SKILL.md`` (shallowest path wins)."""
    candidates = [
        n for n in names if not n.endswith("/") and posixpath.basename(n).lower() == "skill.md"
    ]
    if not candidates:
        return None
    # Prefer the shallowest (root) SKILL.md, then the shortest name.
    candidates.sort(key=lambda n: (n.count("/"), len(n)))
    return candidates[0]


def parse_skill_pack(data: bytes, *, fallback_name: str = "Imported Skill") -> ParsedSkillPack:
    """Parse a SKILL.md ``.zip`` pack from ``data`` into Skill fields.

    Raises :class:`SkillPackError` (→ 422) when the bytes are not a valid zip, the
    archive is empty / oversized, or it contains no ``SKILL.md``.
    """
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise SkillPackError("uploaded file is not a valid .zip archive") from exc

    with zf:
        infos = [i for i in zf.infolist() if not i.is_dir()]
        if not infos:
            raise SkillPackError("the .zip archive is empty")
        if len(infos) > _MAX_FILES:
            raise SkillPackError(f"the .zip has too many files (>{_MAX_FILES})")
        total = sum(max(0, i.file_size) for i in infos)
        if total > _MAX_TOTAL_UNCOMPRESSED:
            raise SkillPackError("the .zip is too large when uncompressed")

        names = [i.filename for i in infos]
        skill_md_name = _find_skill_md(names)
        if skill_md_name is None:
            raise SkillPackError("no SKILL.md found in the .zip archive")

        with zf.open(skill_md_name) as fh:
            raw_md = fh.read(_MAX_SKILL_MD_BYTES)
        skill_md_text = raw_md.decode("utf-8", "replace")

        # Resources manifest mirrors the documented [{path, kind, ref, size}] shape.
        # ``root`` is the SKILL.md's directory; we record paths relative to it so a
        # nested pack (skill/SKILL.md + skill/scripts/..) lists clean relative refs.
        root = posixpath.dirname(skill_md_name)
        resources: list[dict[str, Any]] = []
        for info in sorted(infos, key=lambda i: i.filename):
            path = info.filename
            rel = posixpath.relpath(path, root) if root else path
            resources.append(
                {
                    "path": rel,
                    "kind": _kind_for(path),
                    "ref": path,
                    "size": int(info.file_size),
                }
            )

    manifest, body = _parse_frontmatter(skill_md_text)

    name = str(manifest.get("name") or "").strip() or (fallback_name or "Imported Skill").strip()
    description = str(manifest.get("description") or "").strip()
    tags = _as_tag_list(manifest.get("tags") or manifest.get("keywords"))

    # prompt_body is the canonical capability text, derived from the SKILL.md body
    # (frontmatter stripped). Fall back to the manifest description if the body is
    # empty so an attached agent still gets usable capability text.
    prompt_body = body.strip() or description

    # Keep the manifest a faithful copy of the parsed frontmatter, but guarantee
    # the documented keys exist for the preview UI.
    manifest = dict(manifest)
    manifest.setdefault("name", name)
    if description:
        manifest.setdefault("description", description)

    return ParsedSkillPack(
        name=name,
        description=description,
        prompt_body=prompt_body,
        skill_md=skill_md_text,
        manifest=manifest,
        resources=resources,
        tags=tags,
    )
