import type {Exposure,Snapshot} from './types';
import pin from './ai-context-pin.json';
export interface AiOutlookNote {row:number;title:string;code:string;industry:string;industryCode:string;note:string}
export interface AiContextData {schemaVersion:1;release:string;startYear:number;endYear:number;source:{url:string;page:string;sheet:string;sha256:string};notes:AiOutlookNote[]}
export const exposureExplanation:Record<Exposure,string>={
 Low:'This occupation is in the lowest of four relative exposure groups under the combined BLS measures. Lower exposure does not mean AI cannot affect its work.',
 Moderate:'This occupation has more relative exposure than the Low group and less than the High and Very high groups under the combined BLS measures.',
 High:'This occupation is in the higher of the two middle exposure groups, below Very high, under the combined BLS measures.',
 'Very high':'This occupation is in the highest of four relative exposure groups under the combined BLS measures. This does not establish that its work will be automated.',
};
export function validateAiContext(value:unknown,snapshot:Snapshot):AiContextData{
 const d=value as AiContextData;
 if(!d||d.schemaVersion!==1||d.release!==snapshot.release.id||d.startYear!==2025||d.endYear!==2035||d.startYear!==snapshot.release.startYear||d.endYear!==snapshot.release.endYear||d.source?.url!=='https://www.bls.gov/emp/ind-occ-matrix/occupation.xlsx'||d.source?.page!=='https://www.bls.gov/emp/tables/factors-affecting-occupational-utilization.htm'||d.source?.sheet!=='Table 1.12'||d.source?.sha256!=='a7d060f0576f7d4f5b829b9a0bb4a6c11a12766d159ebb0e07aab5bd2e7583c5'||!Array.isArray(d.notes)||d.notes.length!==56)throw Error('AI outlook reference metadata is invalid.');
 const canonical=new Map(snapshot.occupations.map(o=>[o.code,o.title])),seen=new Set<number>();
 for(const n of d.notes){if(!n||!Number.isInteger(n.row)||n.row<3||n.row>937||seen.has(n.row)||canonical.get(n.code)!==n.title||![n.industry,n.industryCode,n.note].every(v=>typeof v==='string'&&v.trim())||!/\b(?:AI|artificial\s+intelligence|machine\s+learning|large\s+language\s+models?)\b/i.test(n.note))throw Error('AI outlook reference notes are invalid.');seen.add(n.row);}
 if(new Set(d.notes.map(n=>n.code)).size!==50)throw Error('AI outlook reference coverage is invalid.');
 return d;
}
export async function loadAiContext(snapshot:Snapshot,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<AiContextData>{
 const response=await fetcher((import.meta.env?.BASE_URL??'/')+'data/ai-context.json',{signal});
 if(!response.ok)throw Error('AI outlook reference download failed.');
 const bytes=await response.arrayBuffer();
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
 if(bytes.byteLength!==pin.bytes||hash!==pin.sha256)throw Error('AI outlook reference integrity check failed.');
 return validateAiContext(JSON.parse(new TextDecoder().decode(bytes)),snapshot);
}
