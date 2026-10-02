import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const parts=await Promise.all(Array.from({length:6},(_,i)=>readFile(join(here,'ui',`part-${String(i).padStart(2,'0')}.html`),'utf8')));
const augment=await readFile(join(here,'ui','v3-taskspace.html'),'utf8');
let html=parts.join('');
if(!html.includes('</body>')) throw new Error('Modern workspace UI is incomplete');
html=html.replace('</body>',`${augment}\n</body>`);
await writeFile(join(here,'index-v3.html'),html);
await import('./server-v3.mjs');
