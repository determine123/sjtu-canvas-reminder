# Third-party notices

## jsQR 1.4.0

- Source: https://github.com/cozmo/jsQR
- Unmodified distribution: `vendor/jsQR.js`.
- License: Apache-2.0, preserved in `vendor/jsQR.LICENSE`.

## @undecaf/zbar-wasm 0.11.0

- Source commit: https://github.com/undecaf/zbar-wasm/tree/c04ab59682681e27a24b36b36084806437a5d224
- Unmodified distribution: `vendor/zbar.js` and `vendor/zbar.wasm`.
- License: LGPL-2.1-or-later, preserved in `vendor/zbar.LICENSE`.
- Original npm distribution: `vendor/zbar-package.tgz`.
- Corresponding wrapper source and build instructions: `vendor/zbar-wasm-source.tar.gz`, `vendor/zbar-readme.md`.
- The upstream build uses ZBar 0.23.90. Source: https://github.com/mchehab/zbar/tree/0.23.90
- ZBar source archive: `vendor/zbar-0.23.90.tar.gz`, including its own licenses.

These libraries are separate local files and may be replaced or rebuilt. They
are not covered by this repository's MIT license. No runtime CDN requests are made.

## Project references

The screenshot-and-scan workflow was informed by
https://github.com/Castilane/surveillance and the attendance-number monitoring
workflow by https://github.com/IcekyPrime/SJTU_SignIn_Monitor . Their Python source
has not been copied into this repository. The browser extension is independently
implemented; API behavior remains subject to changes made by the school.
