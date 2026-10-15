"""Check local extension resources without reading browser profiles or secrets."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parent.parent


def validate():
    manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
    names = [manifest['background']['service_worker'], manifest['action']['default_popup']]
    names += list(manifest['icons'].values())
    for entry in manifest['content_scripts']:
        names += entry['js']
    for page in ('popup.html', 'monitor.html', 'offscreen.html'):
        names += re.findall(r'(?:src|href)="([^"#:]+)"', (ROOT / page).read_text(encoding='utf-8'))
    names += ['hint-policy.js', 'hint-background.js', 'voice-hints.js', 'captions-content.js', 'vendor/zbar.wasm', 'vendor/zbar.LICENSE', 'vendor/jsQR.LICENSE',
              'vendor/zbar-wasm-source.tar.gz', 'vendor/zbar-0.23.90.tar.gz']
    for name in names:
        target = (ROOT / name).resolve()
        if not target.is_relative_to(ROOT) or not target.is_file():
            raise RuntimeError('Missing/invalid resource: ' + name)
    if (ROOT / 'vendor/zbar.wasm').read_bytes()[:4] != b'\0asm':
        raise RuntimeError('ZBar is not a valid WebAssembly file')
    print('Manifest', manifest['version'], 'and local resources validated')


if __name__ == '__main__':
    validate()
