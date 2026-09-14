import test from 'node:test';
import assert from 'node:assert/strict';
import {runBrowserProcess} from '../scripts/browser-process.mjs';

test('browser supervisor terminates an unresponsive child and fails with its engine/stage label',async()=>{
 const start=Date.now();
 await assert.rejects(runBrowserProcess(['-e','setInterval(()=>{},1000)'],{label:'forced-hang: browser cleanup',timeoutMs:500}),/forced-hang: browser cleanup: process deadline exceeded/);
 assert(Date.now()-start<5000);
});
test('browser supervisor preserves a failed child exit instead of reporting success',async()=>{
 await assert.rejects(runBrowserProcess(['-e','process.exit(7)'],{label:'failure-control',timeoutMs:5000}),/exited 7/);
 await runBrowserProcess(['-e','process.exit(0)'],{label:'success-control',timeoutMs:5000});
});
