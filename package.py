"""Build an unpacked-extension ZIP without test fixtures or machine-specific files."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
required = [manifest['background']['service_worker'], manifest['action']['default_popup']]
required += list(manifest['icons'].values())
for entry in manifest['content_scripts']:
    required += entry['js']
for name in required:
    if not (root / name).is_file():
        raise RuntimeError(f'Missing manifest resource: {name}')
for name in ('popup.html', 'offscreen.html', 'monitor.html'):
    for resource in re.findall(r'(?:src|href)="([^"#:]+)"', (root / name).read_text(encoding='utf-8')):
        if not (root / resource).is_file():
            raise RuntimeError(f'Missing page resource: {resource}')
files = [p for p in root.iterdir() if p.is_file() and
         (p.suffix in ('.js', '.html', '.css', '.wav') or p.name in ('manifest.json','README.md','LICENSE','THIRD_PARTY_NOTICES.md'))]
files += list((root / 'icons').glob('*.png')) + [p for p in (root / 'vendor').iterdir() if p.is_file()]
(root / 'dist').mkdir(exist_ok=True)
target = root / 'dist' / f'sjtu-canvas-reminder-{manifest["version"]}.zip'
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(files):
        archive.write(file, file.relative_to(root))
print(target)
print(f'{len(files)} files; {target.stat().st_size} bytes')
print('SHA256:', hashlib.sha256(target.read_bytes()).hexdigest())
