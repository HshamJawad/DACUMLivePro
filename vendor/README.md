# vendor/ — third-party libraries (self-hosted)

Copied unmodified from the official npm registry packages. Each npm
tarball's sha512 was checked against the registry's published
`dist.integrity` before extraction. All three are MIT licensed; each
folder keeps the package's LICENSE file (docx also ships its bundled
third-party notices in `index.js.LICENSE.txt`).

| File | npm package → path | Size | SHA-256 |
|---|---|---|---|
| `vendor/jspdf-2.5.1/jspdf.umd.min.js` | jspdf@2.5.1 → dist/jspdf.umd.min.js | 355 KB | `98ccf17aa10c20bb1301762618fcc9b6ab3a4e7f26b6071d64d0b41154df3875` |
|  | replaces `https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js` | | |
| `vendor/docx-7.8.2/index.js` | docx@7.8.2 → build/index.js | 321 KB | `db49ebb70f85fff8c738deb0e3f2bd5dee5d5f8f37884c0b39158205e0729fd6` |
|  | replaces `https://cdn.jsdelivr.net/npm/docx@7.8.2/build/index.js` | | |
| `vendor/sortablejs-1.15.3/Sortable.min.js` | sortablejs@1.15.3 → Sortable.min.js | 43 KB | `72aa2c4f9f7cb2b8b3268052d6d2daa9d952f209b7fc5cc247ff9e1153db1f16` |
|  | replaces `https://cdn.jsdelivr.net/npm/sortablejs@1.15.3/Sortable.min.js` | | |

To upgrade a library: `npm pack <name>@<version>`, copy the same file
into a new versioned folder, update the `<script src>` in index.html and
the PRECACHE list in sw.js, and bump CACHE_VERSION.

Note: jspdf.umd.min.js ends with a `sourceMappingURL` comment; the map
file is not included. Browsers only request it when DevTools is open,
so it has no effect on users.
