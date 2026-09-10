import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {pipeline,env} from '@huggingface/transformers';
import {SearchEngine} from '../src/search/engine';
import type {Snapshot,Lexicon,SearchOutcome,SemanticEvidence} from '../src/domain/types';
interface Case {id:string;input:string;type:'title'|'responsibility';kind:'M'|'A'|'C'|'N';acceptable:string[]}
const split=process.argv.find(a=>a.startsWith('--split='))?.split('=')[1];
if(split!=='dev'&&split!=='heldout')throw Error('Specify --split=dev or --split=heldout');
const hash=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const fixturePath=`data/evaluation/${split}.json`,freeze=read('data/evaluation/freeze.json');
if(hash(readFileSync(fixturePath))!==freeze.fixtureHashes[split])throw Error('Frozen fixture mismatch');
const fixtures=read(fixturePath) as {cases:Case[]};
for(const [kind,count] of [['M',14],['A',2],['C',2],['N',2]] as const)if(fixtures.cases.filter(f=>f.kind===kind).length!==count)throw Error(`Frozen ${kind} denominator mismatch`);
if(fixtures.cases.filter(f=>f.kind==='M'&&f.type==='title').length!==10||fixtures.cases.filter(f=>f.kind==='M'&&f.type==='responsibility').length!==4)throw Error('Frozen matched type denominator mismatch');
const config=read('src/semantic/config.json'),meta=read('public/semantic/metadata.json');
const snapshot:Snapshot=read('public/data/occupations.json'),lexicon:Lexicon=read('public/data/lexicon.json');
for(const [p,h] of Object.entries(freeze.corpusHashes))if(hash(readFileSync(p))!==h)throw Error(`Frozen corpus mismatch: ${p}`);
const engineHash=hash(readFileSync('src/search/engine.ts'));
if(split==='heldout'){
 if(existsSync('data/evaluation/heldout-results.json'))throw Error('Heldout already executed. Do not rerun/tune silently; retain this result and seek approved untouched evaluation.');
 const gate=read('data/evaluation/dev-readiness.json');
 if(gate.engineSha256!==engineHash||gate.status!=='READY')throw Error('Development configuration not frozen and ready');
}
if(meta.dataSha256!==hash(readFileSync('public/data/occupations.json'))||meta.vectorSha256!==hash(readFileSync('public/semantic/vectors.bin')))throw Error('Semantic artifact checksum mismatch');
if(JSON.stringify(config)!==JSON.stringify(meta.config))throw Error('Encoder configuration mismatch');
function vectorFile(p:string){const bytes=readFileSync(p);if(bytes.length!==meta.vectorCount*config.dimensions*4)throw Error('Vector dimensions');const array=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));for(const n of array)if(!Number.isFinite(n))throw Error('Nonfinite vector');return array;}
const vectors=vectorFile('public/semantic/vectors.bin'),primary=vectorFile('data/evaluation/primary-vectors.bin');
env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=`./public/models/${config.revision}/`;
const init=performance.now();const encoder=await pipeline('feature-extraction',config.localName,{dtype:config.dtype,device:'cpu'});const initializationMs=performance.now()-init;
const engine=new SearchEngine(snapshot,lexicon);
function rank(q:Float32Array,corpus:Float32Array):SemanticEvidence[]{return meta.rows.map((r:{code:string},i:number)=>{let score=0;for(let d=0;d<config.dimensions;d++)score+=q[d]*corpus[i*config.dimensions+d];return{code:r.code,score};}).sort((a:SemanticEvidence,b:SemanticEvidence)=>b.score-a.score||a.code.localeCompare(b.code));}
function assess(f:Case,out:SearchOutcome){const codes=out.candidates.map(c=>c.code);const good=f.kind==='M'||f.kind==='A';const inappropriate=codes.filter(c=>!good||!f.acceptable.includes(c));return{top1:f.kind==='M'&&f.acceptable.includes(codes[0]),top3:f.kind==='M'&&codes.some(c=>f.acceptable.includes(c)),inappropriate,hardFailure:(f.kind==='N'&&codes.length>0)||(f.kind==='C'&&out.state!=='clarify')||(f.kind==='A'&&out.state!=='clarify'&&(codes.length!==f.acceptable.length||inappropriate.length>0))};}
interface EvaluationRow {fixture:Case;tokenCount:number;queryMs:number;baseline:SearchOutcome;hybrid:SearchOutcome;primaryHybrid:SearchOutcome;baselineAssessment:ReturnType<typeof assess>;hybridAssessment:ReturnType<typeof assess>;primaryAssessment:ReturnType<typeof assess>;semanticRanks:SemanticEvidence[];lexicalRanks:{code:string;score:number;support:number;coverage:number}[];relevantSourceRoleCounts:number[];relevantPassageCounts:number[]}
const rows:EvaluationRow[]=[];
for(const f of fixtures.cases){
 const tokenCount=encoder.tokenizer(f.input).input_ids.size;if(tokenCount>config.maxTokens)throw Error(`${f.id}: input exceeds explicit tokenizer limit`);
 const begin=performance.now();const output=await encoder(f.input,{pooling:config.pooling,normalize:true});const queryMs=performance.now()-begin;
 const q=new Float32Array(output.data as Float32Array);if(q.length!==config.dimensions)throw Error('Query encoder dimension');
 const evidence=rank(q,vectors),ablation=rank(q,primary),bm25=engine.bm25(f.input);
 const baseline=f.type==='title'?engine.title(f.input):engine.lexical(f.input);
 const hybrid=engine.hybrid(f.type==='title'?f.input:'',f.input,evidence);
 const primaryHybrid=engine.hybrid(f.type==='title'?f.input:'',f.input,ablation);
 const relevant=meta.rows.filter((r:{code:string})=>f.acceptable.includes(r.code));
 rows.push({fixture:f,tokenCount,queryMs,baseline,hybrid,primaryHybrid,baselineAssessment:assess(f,baseline),hybridAssessment:assess(f,hybrid),primaryAssessment:assess(f,primaryHybrid),semanticRanks:evidence.map(r=>({code:r.code,score:r.score})),lexicalRanks:bm25.map(r=>({code:r.code,score:r.score,support:r.support,coverage:r.coverage})),relevantSourceRoleCounts:relevant.map((r:{sourceRoleCount:number})=>r.sourceRoleCount),relevantPassageCounts:relevant.map((r:{passages:unknown[]})=>r.passages.length)});
}
function summarize(selected:typeof rows,kind:'baseline'|'hybrid'|'primary'){
 const key=kind==='baseline'?'baselineAssessment':kind==='hybrid'?'hybridAssessment':'primaryAssessment';const outcome=kind==='primary'?'primaryHybrid':kind;
 const m=selected.filter(r=>r.fixture.kind==='M');
 return {queries:selected.length,matched:{top1:m.filter(r=>r[key].top1).length,top3:m.filter(r=>r[key].top3).length,denominator:m.length},titles:{top1:m.filter(r=>r.fixture.type==='title'&&r[key].top1).length,top3:m.filter(r=>r.fixture.type==='title'&&r[key].top3).length,denominator:m.filter(r=>r.fixture.type==='title').length},responsibilities:{top1:m.filter(r=>r.fixture.type==='responsibility'&&r[key].top1).length,top3:m.filter(r=>r.fixture.type==='responsibility'&&r[key].top3).length,denominator:m.filter(r=>r.fixture.type==='responsibility').length},inappropriateCandidates:selected.reduce((s,r)=>s+r[key].inappropriate.length,0),allCandidates:selected.reduce((s,r)=>s+r[outcome].candidates.length,0),queriesWithInappropriate:selected.filter(r=>r[key].inappropriate.length).length,abstentions:selected.filter(r=>r[outcome].state==='none').length,clarifications:selected.filter(r=>r[outcome].state==='clarify').length,hardFailures:selected.filter(r=>r[key].hardFailure).map(r=>r.fixture.id),ACN:selected.filter(r=>r.fixture.kind!=='M').map(r=>({id:r.fixture.id,kind:r.fixture.kind,state:r[outcome].state,codes:r[outcome].candidates.map(c=>c.code)}))};
}
const summary={baseline:summarize(rows,'baseline'),hybrid:summarize(rows,'hybrid'),primaryPassageAblation:summarize(rows,'primary')};
const losses={top1:rows.filter(r=>r.fixture.kind==='M'&&r.baselineAssessment.top1&&!r.hybridAssessment.top1).map(r=>r.fixture.id),top3:rows.filter(r=>r.fixture.kind==='M'&&r.baselineAssessment.top3&&!r.hybridAssessment.top3).map(r=>r.fixture.id),additionalInappropriateQueries:rows.filter(r=>!r.baselineAssessment.inappropriate.length&&r.hybridAssessment.inappropriate.length).map(r=>r.fixture.id)};
const materialRegression=losses.top1.length>=2||losses.top3.length>=2||losses.additionalInappropriateQueries.length>=2;
const groups=Object.fromEntries([['singleRole',rows.filter(r=>r.relevantSourceRoleCounts.length&&Math.max(...r.relevantSourceRoleCounts)===1)],['multipleRoles',rows.filter(r=>Math.max(...r.relevantSourceRoleCounts)>1)],['singlePassage',rows.filter(r=>r.relevantPassageCounts.length&&Math.max(...r.relevantPassageCounts)===1)],['multiplePassages',rows.filter(r=>Math.max(...r.relevantPassageCounts)>1)]].map(([label,items])=>[label,{baseline:summarize(items as typeof rows,'baseline'),hybrid:summarize(items as typeof rows,'hybrid'),primary:summarize(items as typeof rows,'primary')}]));
const report={schema:1,split,executed:new Date().toISOString(),runtime:process.version,platform:process.platform,encoderBackend:'Node CPU; this does not establish browser WASM performance',provenance:'Frozen provisional authored labels, source relationships checked; not expert ground truth',fixtureSha256:hash(readFileSync(fixturePath)),engineSha256:engineHash,semanticMetadataSha256:hash(readFileSync('public/semantic/metadata.json')),primaryVectorsSha256:hash(readFileSync('data/evaluation/primary-vectors.bin')),configuration:config,initializationMs,summary,pairedLosses:losses,materialRegression,groups,rows};
const run=split==='dev'?readdirSync('data/evaluation').filter(n=>/^dev-results-\d+\.json$/.test(n)).length+1:0;
const destination=split==='dev'?`data/evaluation/dev-results-${run}.json`:'data/evaluation/heldout-results.json';
writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({report:destination,summary,pairedLosses:losses,materialRegression}));
if(materialRegression||summary.baseline.hardFailures.length||summary.hybrid.hardFailures.length)process.exitCode=1;
