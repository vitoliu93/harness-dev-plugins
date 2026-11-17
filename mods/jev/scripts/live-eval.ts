#!/usr/bin/env bun
/** Opt-in smoke: only fictional prompts and skills leave this process. */
import { makeRequest, decide, type Snapshot } from "../hooks/core.ts";
const skills=[
 {id:"s0",name:"fiction-plan",description:"Write and track a deterministic dev plan as a mini-project. Use when starting multi-step dev work or the user says plan this task."},
 {id:"s1",name:"fiction-html",description:"Build one self-contained HTML explainer or clickable prototype. Use for visual explainers or approval prototypes before UI work."},
 {id:"s2",name:"fiction-deploy",description:"Trigger a Kubernetes release through the CI webhook and verify the rollout. Use when the user says deploy, release or ship to production."},
 {id:"s3",name:"fiction-sheets",description:"Read and edit spreadsheet cells, ranges and formulas. Use when the user gives a spreadsheet URL or asks to update a table."},
];
const cases=[
 {name:"simple",prompt:"Translate hello to Chinese. Just answer.",recent:[],want:[] as string[]},
 {name:"plan",prompt:"Plan this task: migrate the auth service to the new token format over the next week.",recent:[],want:["fiction-plan"]},
 {name:"two-skills",prompt:"Make a clickable HTML prototype of the new settings page, then plan the implementation as a tracked multi-step task.",recent:[],want:["fiction-html","fiction-plan"]},
 {name:"continue",prompt:"Yes, go ahead with it.",recent:[{role:"user",text:"Deploy the current build to production once tests pass."}],want:["fiction-deploy"]},
 {name:"switch",prompt:"Cancel that. Translate hello into Chinese, nothing else.",recent:[{role:"user",text:"Update the budget spreadsheet's Q3 column."}],want:[]},
 {name:"unrelated",prompt:"Explain how to pick a readable button color in one sentence.",recent:[],want:[]},
];
if(import.meta.main){
 const key=process.env.TYPESAFE_API_KEY;
 if(!key)throw new Error("Set TYPESAFE_API_KEY; only fictional data is sent.");
 const reports=[];
 for(const c of cases){
  const {body,snapshot}=makeRequest({prompt:c.prompt,recent:c.recent,skills},"jev-1.13.0",[key]);
  const start=performance.now();
  const response=await fetch("https://api.typesafe.ai/v1/systemone",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body,signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`Jev HTTP ${response.status}`);
  const raw=await response.json();const decision=decide(raw,snapshot);
  const got=decision.skills.map(s=>s.name).sort();
  const pass=JSON.stringify(got)===JSON.stringify([...c.want].sort());
  const report={name:c.name,pass,ms:Math.round(performance.now()-start),skills:got,usage:raw.usage};
  reports.push(report);console.log(JSON.stringify(report));
 }
 const times=reports.map(r=>r.ms).sort((a,b)=>a-b);
 console.log(JSON.stringify({pass:reports.filter(r=>r.pass).length,total:reports.length,p50_ms:times[Math.floor(times.length/2)],max_ms:times.at(-1),note:"Synthetic smoke only, not an accuracy or latency guarantee"}));
 if(reports.some(r=>!r.pass))process.exitCode=1;
}
