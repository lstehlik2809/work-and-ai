import type { SemanticEvidence } from '../domain/types';
export interface SemanticResult { evidence: SemanticEvidence[]; timings: Record<string,number>; resources?:{url:string;transfer:number;encoded:number}[] }
export type DiagnosticFault = 'none'|'download'|'cache'|'wasm'|'memory'|'mismatch'|'hang';
export class SemanticClient {
 private worker: Worker|null=null; private serial=0; private pending: {id:number;resolve:(r:SemanticResult)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}|null=null;
 constructor(private status:(message:string)=>void=()=>{},private fault:DiagnosticFault='none',private timeout=120000){}
 search(text:string):Promise<SemanticResult>{
  if(!text.trim())return Promise.reject(new Error('Enter a short description of your responsibilities.'));
  if(text.length>2000)return Promise.reject(new Error('Please shorten your description to 2,000 characters or fewer.'));
  if(this.pending)this.cancel(); // Termination guarantees no overlapping jobs or stale worker reply.
  if(!this.worker){this.worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});this.worker.onmessage=e=>{const p=this.pending;if(!p||e.data.id!==p.id)return;if(e.data.status){this.status(e.data.status);return;}clearTimeout(p.timer);this.pending=null;if(e.data.error){this.worker?.terminate();this.worker=null;p.reject(new Error(e.data.error));}else p.resolve(e.data.result);};this.worker.onerror=()=>this.fail('Enhanced search could not start. Ordinary title search is still available.');}
  return new Promise((resolve,reject)=>{const id=++this.serial;const timer=setTimeout(()=>this.fail('Enhanced search timed out. You can retry or use ordinary title search.'),this.timeout);this.pending={id,resolve,reject,timer};this.worker!.postMessage({id,text,fault:this.fault,base:new URL(import.meta.env.BASE_URL,location.origin).href});});
 }
 private fail(message:string){const p=this.pending;this.pending=null;this.worker?.terminate();this.worker=null;if(p){clearTimeout(p.timer);p.reject(new Error(message));}}
 cancel(){this.fail('Search cancelled.');}
 dispose(){this.cancel();}
}
