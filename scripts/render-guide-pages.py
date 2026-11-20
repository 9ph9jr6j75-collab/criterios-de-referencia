"""Generate the original PDF pages used by the in-app document viewer."""

import argparse
from concurrent.futures import ProcessPoolExecutor
import hashlib
import os
from pathlib import Path
import re
import shutil
from tempfile import NamedTemporaryFile

import pymupdf
from PIL import Image, __version__ as pillow_version


CACHE = Path(__file__).resolve().parents[1] / ".cache" / "guide-pages"
LONG_EDGE = 2330
QUALITY = 80
METHOD = 3


def valid_page(filename, size):
    try:
        with Image.open(filename) as image:
            if image.format != "WEBP" or image.size != size or image.n_frames != 1:
                return False
            image.load()
        return True
    except (OSError, ValueError):
        return False


def render_source(job):
    dist, source = job
    pdf = dist / "assets" / "documents" / (source + ".pdf")
    with pdf.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    profile = f"rgb-{LONG_EDGE}-q{QUALITY}-m{METHOD}-mu{pymupdf.VersionBind}-pil{pillow_version}"
    cache = CACHE / profile / digest
    cache.mkdir(parents=True, exist_ok=True)
    target = dist / "assets" / "pages" / source
    target.mkdir(parents=True, exist_ok=True)
    rendered = 0
    with pymupdf.open(pdf) as document:
        count = len(document)
        if not count:
            raise ValueError(f"{source}: el PDF está vacío")
        for index, page in enumerate(document, start=1):
            scale = LONG_EDGE / max(page.rect.width, page.rect.height)
            matrix = pymupdf.Matrix(scale, scale)
            bounds = (page.rect * matrix).irect
            size = (bounds.width, bounds.height)
            name = f"{index}.webp"
            cached = cache / name
            if not valid_page(cached, size):
                pixels = page.get_pixmap(matrix=matrix, colorspace=pymupdf.csRGB, alpha=False)
                with NamedTemporaryFile(dir=cache, delete=False) as temp:
                    pending = Path(temp.name)
                try:
                    with Image.frombytes("RGB", (pixels.width, pixels.height), pixels.samples) as image:
                        image.save(pending, format="WEBP", quality=QUALITY, method=METHOD)
                    if not valid_page(pending, size):
                        raise ValueError(f"{source}, página {index}: imagen ilegible o dimensiones incorrectas")
                    os.replace(pending, cached)
                finally:
                    pending.unlink(missing_ok=True)
                rendered += 1
            with NamedTemporaryFile(dir=target, delete=False) as temp:
                output = Path(temp.name)
            try:
                shutil.copyfile(cached, output)
                output.chmod(0o644)
                os.replace(output, target / name)
            finally:
                output.unlink(missing_ok=True)
    for filename in target.glob("*.webp"):
        if filename.stem.isdecimal() and int(filename.stem) > count:
            filename.unlink(missing_ok=True)
    return f"{source}: {count} páginas verificadas, {rendered} generadas"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dist", type=Path)
    parser.add_argument("sources", nargs="+")
    args = parser.parse_args()
    if any(not re.fullmatch(r"[A-Z][0-9]+", source) for source in args.sources):
        parser.error("Identificador de fuente no válido")
    jobs = [(args.dist, source) for source in dict.fromkeys(args.sources)]
    with ProcessPoolExecutor(max_workers=min(len(jobs), os.cpu_count() or 1, 4)) as pool:
        for result in pool.map(render_source, jobs):
            print(result, flush=True)


if __name__ == "__main__":
    main()
