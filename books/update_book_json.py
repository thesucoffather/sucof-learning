import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent
BOOKS_DIR = ROOT / "books"
MAIN_BOOK_JSON = ROOT / "book.json"

TEXT_FILE = "story.txt"
TIMING_FILES = ("story.timeline.json", "story.json")
AUDIO_FILES = ("story.wav", "story.mp3", "story.m4a", "story.ogg", "story.aac")


def read_book_metadata(path):
    text = path.read_text(encoding="utf-8")
    text = re.sub(r",\s*([}\]])", r"\1", text)
    return json.loads(text)


def as_posix_path(path):
    return path.relative_to(ROOT).as_posix()


def find_existing_file(book_dir, filenames):
    for filename in filenames:
        path = book_dir / filename

        if path.exists():
            return path

    return None


def build_book_entry(book_dir):
    metadata_path = book_dir / "book.json"

    if not metadata_path.exists():
        return None

    metadata = read_book_metadata(metadata_path)
    book_id = book_dir.name
    text_path = book_dir / TEXT_FILE
    timing_path = find_existing_file(book_dir, TIMING_FILES)

    if not text_path.exists() or not timing_path:
        missing = []

        if not text_path.exists():
            missing.append(TEXT_FILE)

        if not timing_path:
            missing.append(" or ".join(TIMING_FILES))

        raise FileNotFoundError(f"{book_id} is missing: {', '.join(missing)}")

    entry = {
        "id": book_id,
        "title": metadata.get("title", book_id),
        "category": metadata.get("category", "Story"),
        "text": as_posix_path(text_path),
        "timing": as_posix_path(timing_path),
    }

    for audio_file in AUDIO_FILES:
        audio_path = book_dir / audio_file

        if audio_path.exists():
            entry["audio"] = as_posix_path(audio_path)
            break

    return entry


def main():
    if not BOOKS_DIR.exists():
        raise FileNotFoundError(f"Books folder not found: {BOOKS_DIR}")

    entries = []

    for book_dir in sorted(path for path in BOOKS_DIR.iterdir() if path.is_dir()):
        entry = build_book_entry(book_dir)

        if entry:
            entries.append(entry)

    MAIN_BOOK_JSON.write_text(
        json.dumps(entries, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(f"Updated {MAIN_BOOK_JSON.name} with {len(entries)} book(s).")


if __name__ == "__main__":
    main()
