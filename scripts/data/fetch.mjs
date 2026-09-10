// Deliberate, hash-pinned source acquisition. Ordinary builds never call this.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const root = new URL('../../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('data/source-manifest.json',root),'utf8'));
const hash = b => createHash('sha256').update(b).digest('hex');
try {
  const staged = [];
  for (const f of manifest.files) {
    const r = await fetch(f.url, {signal:AbortSignal.timeout(60000)});
    if (!r.ok) throw new Error(`${f.id}: HTTP ${r.status}`);
    const b = Buffer.from(await r.arrayBuffer());
    if (hash(b) !== f.sha256) throw new Error(`${f.id}: upstream bytes changed; inspect release/schema/mapping and approve a deliberate data update before replacing pinned inputs`);
    if (f.id.endsWith('.xlsx') ? b.subarray(0,2).toString() !== 'PK' : !/^"?O\*NET-SOC Code/.test(b.toString('utf8').replace(/^\uFEFF/,''))) throw new Error(`${f.id}: unexpected file format`);
    const stored = f.path.endsWith('.gz') ? gzipSync(b,{mtime:0}) : b;
    staged.push({f,b:stored,retrieved:new Date().toISOString()});
  }
  for (const {f,b,retrieved} of staged) {
    await writeFile(new URL(f.path,root),b);
    f.storedSha256=hash(b); f.storedBytes=b.length; f.retrieved=retrieved;
    f.retrievalClock='Node fetch response fully received UTC timestamp';
  }
  await writeFile(new URL('data/source-manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({status:'PASS',verified:staged.map(({f,retrieved})=>({id:f.id,sha256:f.sha256,retrieved})),note:'Run prepare, validation, and independent reconciliation after acquisition.'}));
} catch(e) { console.error(JSON.stringify({status:'FAIL',error:e.message})); process.exitCode=1; }
