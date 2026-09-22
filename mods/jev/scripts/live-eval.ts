#!/usr/bin/env bun
/** Opt-in smoke: only fictional prompts, agents and references leave this process. */
import { makeRequest, decide, type Snapshot } from "../hooks/core.ts";
const agents=[
 {id:"a0",alias:"researcher",description:"Read-only code investigation; locate causes and explain findings",route:"fiction:research"},
 {id:"a1",alias:"tester",description:"Independently write and run tests; reproduce failures",route:"fiction:test"},
 {id:"a2",alias:"reviewer",description:"Independently review a finished patch for correctness and safety; do not implement",route:"fiction:review"},
];
const history=[
 {id:"r0",session_id:"fictional-retry",day:"2026-09-20",summary:"Duplicate payment caused by retry after server success",conclusion:"Reuse an idempotency key when retrying payment",file_path:"/fiction/retry.jsonl"},
 {id:"r1",session_id:"fictional-parser",day:"2026-09-21",summary:"CSV parser lost final column when empty",conclusion:"Preserve trailing empty CSV fields",file_path:"/fiction/parser.jsonl"},
];
const cases=[
 {name:"simple",prompt:"Translate hello to Chinese. Just answer.",recent:[],want:[] as string[],refs:[] as string[]},
 {name:"no-agents",prompt:"Investigate a compiler crash yourself. Do not use any agents.",recent:[],want:[],refs:[]},
 {name:"parallel",prompt:"Use two independent agents: one should investigate the new compiler crash read-only; the other should reproduce it and write regression tests. No patch is ready for review yet.",recent:[],want:["researcher","tester"],refs:[]},
 {name:"continue",prompt:"Yes, delegate that investigation now.",recent:[{role:"user",text:"The compiler hangs. Ask a read-only researcher to locate the cause independently; do not run tests or review a patch."}],want:["researcher"],refs:[]},
 {name:"switch",prompt:"Cancel that. Translate hello into Chinese, nothing else.",recent:[{role:"user",text:"Use agents to investigate duplicate payment retries."}],want:[],refs:[]},
 {name:"recall",prompt:"Do not delegate. Find the earlier decision about preventing duplicate payments when a retry follows server success.",recent:[],want:[],refs:["r0"]},
 {name:"context-recall",prompt:"What did we decide last time? No agents.",recent:[{role:"user",text:"The CSV parser drops the last column when the field is empty."}],want:[],refs:["r1"]},
 {name:"unrelated",prompt:"No agents. Explain how to pick a readable button color in one sentence.",recent:[],want:[],refs:[]},
];
if(import.meta.main){
 const key=process.env.TYPESAFE_API_KEY;
 if(!key)throw new Error("Set TYPESAFE_API_KEY; only fictional data is sent.");
 const reports=[];
 for(const c of cases){
  const snapshot:Snapshot={prompt:c.prompt,recent:c.recent,active:[],agents,history};
  const start=performance.now();
  const response=await fetch("https://api.typesafe.ai/v1/systemone",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:makeRequest(snapshot,"jev-1.13.0",[key]),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`Jev HTTP ${response.status}`);
  const raw=await response.json();const decision=decide(raw,snapshot);
  const got=decision.agents.map(a=>a.alias).sort();const refs=decision.history.map(h=>h.id).sort();
  const pass=JSON.stringify(got)===JSON.stringify([...c.want].sort())&&JSON.stringify(refs)===JSON.stringify([...c.refs].sort());
  const report={name:c.name,pass,ms:Math.round(performance.now()-start),delegation:decision.delegation,agents:got,refs,usage:raw.usage};
  reports.push(report);console.log(JSON.stringify(report));
 }
 const times=reports.map(r=>r.ms).sort((a,b)=>a-b);
 console.log(JSON.stringify({pass:reports.filter(r=>r.pass).length,total:reports.length,p50_ms:times[Math.floor(times.length/2)],max_ms:times.at(-1),note:"Synthetic smoke only, not an accuracy or latency guarantee"}));
 if(reports.some(r=>!r.pass))process.exitCode=1;
}
