import{readFileSync,writeFileSync}from'node:fs';
import{createHash}from'node:crypto';
import{buildPatternCounts,PATTERN_METHOD,PATTERN_PARAMETERS}from'../../src/domain/skill-pattern-data';
import{buildOccupationProfiles}from'../../src/domain/occupation-map';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const snapshot=read('public/data/occupations.json'),skills=read('public/data/skills.json');
const variants=buildPatternCounts(snapshot,skills);
const sourceHashes={occupations:hash('public/data/occupations.json'),skills:hash('public/data/skills.json')};
const generationCodeHash=createHash('sha256').update(['scripts/data/skill-patterns.ts','src/domain/skill-pattern-data.ts','src/domain/skill-exposure.ts','src/domain/occupation-map.ts'].map(p=>p+':'+hash(p)).join('\n')).digest('hex');
const artifact={schemaVersion:2,release:snapshot.release.id,method:PATTERN_METHOD,sourceHashes,generationCodeHash,parameters:PATTERN_PARAMETERS,skillIds:skills.skills.map((s:{id:string})=>s.id),total:snapshot.occupations.length,unknownExposure:snapshot.occupations.filter((o:{exposure:unknown})=>o.exposure===null).length,noRatings:buildOccupationProfiles(snapshot,skills).excludedCodes.filter(c=>snapshot.occupations.find((o:{code:string})=>o.code===c).exposure!==null).length,variants};
const text=JSON.stringify(artifact)+'\n';
const objectHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sourceObjectHashes={occupations:objectHash(snapshot),skills:objectHash(skills)};
const pin=JSON.stringify({sha256:createHash('sha256').update(text).digest('hex'),release:artifact.release,sourceHashes,sourceObjectHashes,generationCodeHash,variantIds:variants.map(v=>v.id)},null,2)+'\n';
if(process.argv.includes('--check')){if(readFileSync('public/data/skill-patterns.json','utf8')!==text||readFileSync('src/domain/skill-pattern-pin.json','utf8')!==pin)throw Error('Skill pattern artifact or pin does not reproduce');console.log('Skill patterns reproduce exactly.');}
else{writeFileSync('public/data/skill-patterns.json',text);writeFileSync('src/domain/skill-pattern-pin.json',pin);console.log(`Generated ${variants.length} variants, ${Buffer.byteLength(text)} bytes.`);}
