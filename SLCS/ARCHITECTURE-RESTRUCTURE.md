# SLC architecture restructure

This build removes the previous "patch on top of patch" direction.

## Boundaries
- `src/vplus-platform.js`: platform schema, permissions and platform events only.
- `public/classroom/*`: classroom/media/beauty only.
- `public/app.js`: application routing/screens and API client.
- `public/styles.css`: one consolidated stylesheet. The appended UI reconstruction override block was removed; the light Sky First tokens are now the base source values.


