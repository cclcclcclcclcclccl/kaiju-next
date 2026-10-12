"""Local OCR. Images stay in memory; no account data or images are persisted."""
import base64
import contextlib
import io
import json
import sys

def main():
    request = json.loads(sys.stdin.buffer.read(12 * 1024 * 1024))
    from PIL import Image, ImageOps
    Image.MAX_IMAGE_PIXELS = 20_000_000
    raw = base64.b64decode(request['image'], validate=True)
    image = Image.open(io.BytesIO(raw))
    if image.width * image.height > 20_000_000:
        raise ValueError('Image exceeds pixel limit')
    image = ImageOps.exif_transpose(image).convert('RGB')
    image.thumbnail((2200, 2200))
    with contextlib.redirect_stdout(sys.stderr):
        from rapidocr import RapidOCR
        engine = RapidOCR(params={'Global.log_level': 'error'})
        result = engine(image)
    rows = []
    for box, text, score in zip(result.boxes if result.boxes is not None else [], result.txts if result.txts is not None else [], result.scores if result.scores is not None else []):
        rows.append({'text': text, 'confidence': float(score), 'box': [[float(v) for v in p] for p in box]})
    sys.stdout.buffer.write(json.dumps({'width': image.width, 'height': image.height, 'lines': rows}, ensure_ascii=False).encode('utf-8'))

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        sys.stderr.write(type(error).__name__ + ': ' + str(error)[:400])
        sys.exit(1)
