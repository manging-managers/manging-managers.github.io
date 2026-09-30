# Bundled browser libraries

These files are served from this site, without external CDN requests.

- SheetJS Community Edition 0.20.3: `xlsx.full.min.js`, Apache-2.0, `SHEETJS-LICENSE.txt`. Source: https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
- HiGHS-JS 1.15.3: `highs.js`, `highs.wasm`, MIT, `HIGHS-LICENSE.txt`. Source: https://github.com/lovasoa/highs-js (npm package `highs@1.15.3`).
- JSZip 3.10.1: `jszip.min.js`, MIT (selected from dual license), `JSZIP-LICENSE.txt`. Source: https://github.com/Stuk/jszip (npm package `jszip@3.10.1`).

Keep the matching JavaScript loader and WebAssembly binary together when updating HiGHS.
