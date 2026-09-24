"""Shared helpers for Outcome Audit v3. No prediction files are loaded here."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
from pathlib import Path

from egv1_deck_hosts import norm_name
from train_experiments import load_json

WEB = Path(__file__).resolve().parents[3]
MS = WEB / "data" / "milestones" / "mechanical-space"
EGV = MS / "external-gameplay-validation-v1"
V1 = MS / "external-gameplay-outcome-audit-v1"
V2 = MS / "external-gameplay-outcome-audit-v2"
OUT = MS / "external-gameplay-outcome-audit-v3"
CACHE = WEB / ".data" / "egv1-outcome-audit-v3"
PRED_SHA = "2f02c78a421c4c5da53831af5e1c860c92d228019e9e25471391f604c562ad4a"

TESSERACT = r"C:\Program Files\Tesseract-OCR\tesseract.EXE"
FFMPEG = r"C:\Program Files\ImageMagick-7.1.1-Q16-HDRI\ffmpeg.EXE"
YTDLP = "yt-dlp"

WIN_VIS = re.compile(r"\b(?:winner|victory|1st place|first place)\b", re.I)
PLACE_VIS = re.compile(r"\b(1st|2nd|3rd|4th|first|second|third|fourth)\s+place\b", re.I)
ELIM_VIS = re.compile(r"\b(?:eliminated|knocked out)\b", re.I)
SCOOP_VIS = re.compile(r"\b(?:scoop(?:s|ed)?|concede(?:s|d)?)\b", re.I)
DRAW_VIS = re.compile(r"\b(?:the game (?:is|was|ended in) a draw|it's a draw|ended in a draw|game is a draw)\b", re.I)
REJECT_WIN = re.compile(r"\b(?:combat|stack|flip|fight|exchange|roll|initiative)\b", re.I)
TIME_RE = re.compile(r"(?:(\d+):)?(\d+):(\d+)[.,](\d+)\s+-->\s+")
SPEAK_WIN = re.compile(
    r"\b(?:wins the game|won the game|is the winner|winner is|takes the win|takes the game|wins it)\b",
    re.I,
)
SPEAK_NAME_WINS = re.compile(r"\b([A-Za-z][A-Za-z' -]{2,40})\s+wins\b", re.I)
SPEAK_LOSE = re.compile(
    r"\b(?:loses the game|lost the game|eliminated from the game|out of the game|scoops|scooped|conceded|concedes)\b",
    re.I,
)


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def aliases(names: list[str]) -> list[str]:
    out: list[str] = []
    for name in names:
        parts = [p.strip() for p in name.replace(" // ", "//").split("//")]
        for p in parts:
            if p:
                out.append(p)
            if "," in p:
                out.append(p.split(",")[0].strip())
                out.append(p.split(",", 1)[1].strip())
    seen = set()
    uniq = []
    for a in out:
        n = norm_name(a)
        if n and n not in seen and len(n) >= 4:
            seen.add(n)
            uniq.append(a)
    return uniq


def unique_match(text: str, seats: list[dict]) -> str | None:
    blob = norm_name(text)
    if not blob:
        return None
    hits = []
    for seat in seats:
        labels = list(seat.get("aliases") or [])
        if seat.get("onScreenName"):
            labels.append(seat["onScreenName"])
        for a in labels:
            n = norm_name(a)
            if n and len(n) >= 4 and n in blob:
                hits.append(seat["deckId"])
                break
    if len(set(hits)) == 1:
        return hits[0]
    return None


def build_blind_identities() -> list[dict]:
    combined = load_json(EGV / "combined-qualified-set-v1.json")
    yt = {g["externalGameId"]: g.get("youtubeVideoIdActual") for g in load_json(V1 / "game-outcomes-v1.json")["games"]}
    rows = []
    for g in combined["games"]:
        decks = []
        for d in g["deckSnapshots"]:
            decks.append(
                {
                    "deckId": f"{g['externalGameId']}-{d['seatKey']}",
                    "seatKey": d["seatKey"],
                    "commanderNames": d["commanderNames"],
                    "aliases": aliases(d["commanderNames"]),
                    "onScreenName": None,
                }
            )
        rows.append(
            {
                "externalGameId": g["externalGameId"],
                "channel": g["channel"],
                "youtubeVideoId": yt.get(g["externalGameId"]) or g["youtubeVideoId"],
                "decks": decks,
            }
        )
    return rows


def run(cmd: list[str], timeout: int = 180) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )


def video_duration(video_id: str) -> float | None:
    r = run([YTDLP, "--no-warnings", "--print", "duration", f"https://www.youtube.com/watch?v={video_id}"], timeout=90)
    try:
        return float((r.stdout or "").strip().splitlines()[-1])
    except (ValueError, IndexError):
        return None


def download_storyboard(video_id: str, dest: Path) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 20_000:
        return True
    template = dest.parent / (dest.stem + ".%(ext)s")
    r = run(
        [
            YTDLP,
            "--no-warnings",
            "--force-overwrites",
            "-f",
            "sb0",
            "-o",
            str(template),
            f"https://www.youtube.com/watch?v={video_id}",
        ],
        timeout=180,
    )
    if dest.exists() and dest.stat().st_size > 20_000:
        return True
    for a in dest.parent.glob(dest.stem + ".*"):
        if a.suffix.lower() in {".mhtml", ".jpg"} and a.stat().st_size > 20_000:
            if a != dest:
                a.replace(dest)
            return True
    print(f"    storyboard fail {video_id}: {(r.stderr or r.stdout)[-200:]}", flush=True)
    return False


def split_storyboard_sheets(mhtml: Path, out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    existing = sorted(out_dir.glob("sheet-*.jpg"))
    if existing:
        return existing
    blob = mhtml.read_bytes()
    n = 0
    start = 0
    while True:
        i = blob.find(b"\xff\xd8", start)
        if i < 0:
            break
        j = blob.find(b"\xff\xd9", i)
        if j < 0:
            break
        path = out_dir / f"sheet-{n:03d}.jpg"
        path.write_bytes(blob[i : j + 2])
        n += 1
        start = j + 2
    return sorted(out_dir.glob("sheet-*.jpg"))


def download_section(video_id: str, dest: Path, spec: str) -> bool:
    """Legacy clip download. Prefer download_storyboard; streams often 403."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 20_000:
        return True
    r = run(
        [
            YTDLP,
            "--no-warnings",
            "--extractor-args",
            "youtube:player_client=tv_embedded",
            "--force-overwrites",
            "-f",
            "18/160/w",
            "--download-sections",
            spec,
            "--merge-output-format",
            "mp4",
            "-o",
            str(dest.with_suffix("")),
            f"https://www.youtube.com/watch?v={video_id}",
        ],
        timeout=240,
    )
    if dest.exists() and dest.stat().st_size > 20_000:
        return True
    alts = list(dest.parent.glob(dest.stem + "*"))
    for a in alts:
        if a.suffix.lower() in {".mp4", ".mkv", ".webm"} and a.stat().st_size > 20_000:
            if a != dest:
                a.replace(dest)
            return True
    return r.returncode == 0 and dest.exists()


def extract_frames(clip: Path, out_dir: Path, fps: str) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    existing = sorted(out_dir.glob("f*.jpg"))
    if existing:
        return existing
    run(
        [
            FFMPEG,
            "-y",
            "-i",
            str(clip),
            "-vf",
            f"fps={fps},scale=960:-2",
            "-q:v",
            "5",
            str(out_dir / "f%03d.jpg"),
        ],
        timeout=120,
    )
    return sorted(out_dir.glob("f*.jpg"))


def ocr_image(path: Path) -> str:
    r = run([TESSERACT, str(path), "stdout", "--psm", "6"], timeout=60)
    return (r.stdout or "").strip()


def parse_vtt(vtt: str) -> list[tuple[float, str]]:
    cues = []
    blocks = re.split(r"\n\n+", vtt.replace("\r\n", "\n"))
    for block in blocks:
        m = TIME_RE.search(block)
        if not m:
            continue
        hh = int(m.group(1) or 0)
        mm = int(m.group(2))
        ss = int(m.group(3))
        t = hh * 3600 + mm * 60 + ss
        lines = []
        for line in block.splitlines():
            if "-->" in line or line.strip().isdigit() or line.startswith("WEBVTT"):
                continue
            clean = re.sub(r"<[^>]+>", "", line).strip()
            if clean:
                lines.append(clean)
        if lines:
            cues.append((float(t), " ".join(lines)))
    return cues


def fetch_captions(video_id: str, tmp: Path) -> str | None:
    dest = tmp / video_id
    run(
        [
            YTDLP,
            "--skip-download",
            "--no-warnings",
            "--write-sub",
            "--write-auto-sub",
            "--sub-langs",
            "en.*,en",
            "--sub-format",
            "vtt",
            "--convert-subs",
            "vtt",
            "-o",
            str(dest),
            f"https://www.youtube.com/watch?v={video_id}",
        ],
        timeout=180,
    )
    files = sorted(tmp.glob(f"{video_id}*.vtt"))
    if not files:
        return None
    return files[0].read_text(encoding="utf-8", errors="replace")


def write_json(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
