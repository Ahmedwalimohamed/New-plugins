import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const parts = await Promise.all(
  Array.from({ length: 6 }, (_, i) =>
    readFile(join(here, 'ui', `part-${String(i).padStart(2, '0')}.html`))
  )
);

await writeFile(join(here, 'index.html'), Buffer.concat(parts));
await import('./server.mjs');
