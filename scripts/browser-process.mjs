import {spawn,execFile} from 'node:child_process';

// A separate process deadline also covers a browser protocol or cleanup deadlock.
export function runBrowserProcess(args,{label,timeoutMs,env=process.env}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,args,{env,stdio:'inherit',windowsHide:true,detached:process.platform!=='win32'});
  let expired=false;
  const timer=setTimeout(()=>{
   expired=true;
   const error=new Error(`${label}: process deadline exceeded (${timeoutMs} ms); browser checks FAILED`);
   console.error(error.message);
   if(child.pid){
    if(process.platform==='win32')execFile('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},()=>{});
    else try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}
   }
   reject(error);
  },timeoutMs);
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('close',(code,signal)=>{clearTimeout(timer);if(expired)return;if(code===0)resolve();else reject(Error(`${label}: exited ${code ?? signal}; browser checks FAILED`));});
 });
}
