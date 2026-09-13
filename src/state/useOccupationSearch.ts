import {useEffect,useRef,useState} from 'react';
import type {SearchEngine} from '../search/engine';
import type {SearchOutcome} from '../domain/types';
import type {SemanticClient,DiagnosticFault} from '../semantic/client';
export const emptySearch:SearchOutcome={state:'none',candidates:[],message:'',exact:false};
export function useOccupationSearch(engine:SearchEngine|null,fault:DiagnosticFault='none'){
 const [description,setDraft]=useState(''),[primary,setPrimary]=useState(emptySearch),[meaningOutcome,setMeaning]=useState(emptySearch);
 const [searched,setSearched]=useState(false),[meaningSearched,setMeaningSearched]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState(''),[rejected,setRejected]=useState(false);
 const serial=useRef(0),statusSerial=useRef(0),client=useRef<SemanticClient|null>(null);
 function cancel(){serial.current++;client.current?.cancel();setBusy(false);setStatus('');setError('');}
 function reset(){cancel();setPrimary(emptySearch);setMeaning(emptySearch);setSearched(false);setMeaningSearched(false);setRejected(false);}
 function setDescription(value:string){reset();setDraft(value);}
 function searchResponsibilities(){if(!engine||!description.trim())return;cancel();setMeaning(emptySearch);setMeaningSearched(false);setRejected(false);setPrimary(engine.lexical(description,10));setSearched(true);}
 async function searchMeaning(){
  if(!engine||busy||!description.trim())return;
  const id=++serial.current;statusSerial.current=id;setBusy(true);setError('');setStatus('Preparing meaning search…');setPrimary(engine.lexical(description,10));setSearched(true);setRejected(false);
  try{
   if(!client.current){const {SemanticClient}=await import('../semantic/client');if(id!==serial.current)return;client.current=new SemanticClient(message=>{if(statusSerial.current===serial.current)setStatus(message);},fault,fault==='hang'?1500:120000);}
   // The client may survive several searches: status callbacks are advisory;
   // result and error updates are always guarded by this request generation.
   const result=await client.current.search(description);if(id!==serial.current)return;
   setMeaning(engine.hybrid('',description,result.evidence,10));setMeaningSearched(true);setStatus('Enhanced matching finished. Confirm a suggestion against its source description.');
  }catch(e){if(id===serial.current){setError(e instanceof Error?e.message:'Meaning search is unavailable.');setStatus('');}}
  finally{if(id===serial.current)setBusy(false);}
 }
 function reject(){reset();setRejected(true);}
 useEffect(()=>()=>{serial.current++;client.current?.dispose();},[]);
 return{description,setDescription,primary,meaningOutcome,searched,meaningSearched,busy,status,error,rejected,cancel,reset,reject,searchResponsibilities,searchMeaning};
}
