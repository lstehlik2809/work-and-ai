import{readFileSync}from'node:fs';import{createHash}from'node:crypto';import{pathToFileURL}from'node:url';
export function validateSemantic(meta,bytes,snapshotBytes,expected){
 const hash=b=>createHash('sha256').update(b).digest('hex');
 if(JSON.stringify(meta.config)!==JSON.stringify(expected))throw Error('Encoder configuration mismatch');
 if(hash(bytes)!==meta.vectorSha256||hash(snapshotBytes)!==meta.dataSha256)throw Error('Semantic checksum mismatch');
 const snapshot=JSON.parse(snapshotBytes);if(meta.release!==snapshot.release.id)throw Error('Semantic release mismatch');
 if(meta.vectorCount!==meta.rows.length||bytes.byteLength!==meta.vectorCount*expected.dimensions*4)throw Error('Vector dimensions/count mismatch');
 const refs=new Set(snapshot.occupations.map(o=>o.code)),seen=new Set();
 const v=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 meta.rows.forEach((r,i)=>{if(!refs.has(r.code)||seen.has(r.code))throw Error('Invalid vector occupation');seen.add(r.code);const a=v.subarray(i*expected.dimensions,(i+1)*expected.dimensions);if(!a.every(Number.isFinite)||Math.abs(Math.hypot(...a)-1)>0.001)throw Error('Invalid normalized vector');if(!r.passages.length||r.passages.length>expected.maxPassages)throw Error('Passage cap');for(const p of r.passages){if(p.tokens>expected.maxTokens||!p.source||!p.text)throw Error('Invalid passage');const occ=snapshot.occupations.find(o=>o.code===r.code);if(p.onetCode&&!occ.roles.some(role=>role.code===p.onetCode))throw Error('Unknown passage role');}});
 if(seen.size!==refs.size)throw Error('Missing occupation vector');
 return {valid:true,occupations:seen.size,dimensions:expected.dimensions,bytes:bytes.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(validateSemantic(JSON.parse(readFileSync('public/semantic/metadata.json')),readFileSync('public/semantic/vectors.bin'),readFileSync('public/data/occupations.json'),JSON.parse(readFileSync('src/semantic/config.json')))));
