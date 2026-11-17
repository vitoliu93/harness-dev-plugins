import { describe, expect, mock, test, tier } from "claude-code/testing";
import type { On } from "claude-code";

tier("user");
const secret="synthetic-test-key-never-real";
const skills=[{name:"fiction-plan",description:"Write and track a dev plan"},{name:"fiction-kit:fiction-plan",description:"duplicate of the workspace one"},{name:"fiction-html",description:"Build one HTML explainer"}];
const answer={answers:{s0:{type:"noul",noul:0.9},s1:{type:"noul",noul:0.2}}};
function fixture(on:On, options:{key?:string,skills?:unknown,answer?:unknown,delay?:number,bad?:boolean,throwNext?:boolean}={}){
 const clock=mock.clock(on,{now:Date.parse("2026-09-22")});
 const env:Record<string,string|undefined>={HOME:"/fiction",TYPESAFE_API_KEY:options.key??secret};
 const sent:any[]=[];const logs:string[]=[];const processes:any[]=[];const seen:any[]=[];const messages:any[]=[];
 on("env.get",($,e)=>({value:env[e.name]}));
 on("env.set",($,e)=>{env[e.name]=e.value;return {value:undefined};});
 on("session.cwd",()=>({value:"/fiction/repo"}));
 on("session.messages",()=>({value:messages}));
 on("process.run",($,e)=>{processes.push(e);return {value:{exitCode:0,stdout:JSON.stringify(options.skills??skills),stderr:""}};});
 on("ui.log",($,e)=>{logs.push(e.text);return {value:undefined};});
 on("http.fetch",async($,e)=>{sent.push(e);if(options.delay)await clock.sleep(options.delay);return {value:{ok:!options.bad,status:options.bad?401:200,headers:{},text:options.bad?secret:JSON.stringify(options.answer??answer)}};});
 on("prompt.submit",($,e)=>{seen.push(e);if(options.throwNext)throw new Error("downstream-failure");return {text:e.text,context:e.context,origin:e.origin};});
 return {clock,env,sent,logs,processes,seen,messages};
}
const prompt={text:"Plan the retry bug fix",origin:{kind:"sdk" as const},wait:false};
const scans=(f:{processes:any[]})=>f.processes.filter(p=>String(p.argv[1]).endsWith("scan-skills.ts"));
describe("register",()=>{
 test("a missing key never sends or injects",async($,on)=>{
  const f=fixture(on,{key:""});
  const result=await $.prompt.submit(prompt);expect(result.text).toBe(prompt.text);expect(result.context).toBeUndefined();expect(f.sent).toEqual([]);expect(f.processes).toEqual([]);
  f.env.TYPESAFE_API_KEY=undefined; // unset, not just empty
  await $.prompt.submit(prompt);expect(f.sent).toEqual([]);
 });
 test("injects skills without changing the user input",async($,on)=>{
  const f=fixture(on);const result=await $.prompt.submit({...prompt,context:["existing"]});
  expect(result.text).toBe(prompt.text);expect(result.origin).toEqual(prompt.origin);expect(result.context?.[0]).toBe("existing");
  expect(result.context?.[1]).toContain('<jev-skills>\nAdvisory only. The user task may benefit from invoking these skills:\n["fiction-plan"]\n</jev-skills>');
  expect(result.context?.[1]).not.toContain("fiction-html");
  expect(f.sent.length).toBe(1);
  expect(f.processes.map(p=>p.argv[0])).toEqual(["bun"]);expect(scans(f)[0].init.timeoutMs).toBe(1500);
  expect(f.sent[0].url).toBe("https://api.typesafe.ai/v1/systemone");expect(f.sent[0].init.headers.Authorization).toBe(`Bearer ${secret}`);
  expect(f.sent[0].init.body).not.toContain("/fiction/");expect(f.sent[0].init.body).not.toContain(secret);
  const state=JSON.parse(f.sent[0].init.body).state;
  // The duplicate plugin copy is dropped; descriptions travel verbatim; no delegation question remains.
  expect(state.available_skills).toEqual([{id:"s0",name:"fiction-plan",description:"Write and track a dev plan"},{id:"s1",name:"fiction-html",description:"Build one HTML explainer"}]);
  expect(JSON.parse(f.sent[0].init.body).questions.delegation).toBeUndefined();
 });
 test("scans skills once per five minutes and re-reads recent text without tool output",async($,on)=>{
  const f=fixture(on);await $.prompt.submit(prompt);
  f.messages.push({role:"user",text:"Research retry; then plan it",toolResults:[{content:"PRIVATE-TOOL-OUTPUT"}],toolUses:[]});
  await $.prompt.submit({...prompt,text:`Continue; ${secret}`});
  expect(f.sent.length).toBe(2);expect(scans(f).length).toBe(1);
  const state=JSON.parse(f.sent[1].init.body).state;
  expect(state.recent_context[0].text).toContain("then plan it");expect(f.sent[1].init.body).not.toContain(secret);expect(f.sent[1].init.body).not.toContain("PRIVATE-TOOL-OUTPUT");
  await f.clock.advance(300_001);await $.prompt.submit(prompt);expect(scans(f).length).toBe(2);
 });
 test("notifications and commands do not recurse",async($,on)=>{
  const f=fixture(on);await $.prompt.submit({...prompt,origin:{kind:"plugin",name:"other"}});
  await $.prompt.submit({...prompt,text:"/help"});await $.prompt.submit({...prompt,text:"! pwd"});
  expect(f.sent).toEqual([]);expect(f.processes).toEqual([]);expect(f.seen.length).toBe(3);
 });
 test("timeout releases the prompt once, ignores late response",async($,on)=>{
  const f=fixture(on,{delay:6000});const pending=$.prompt.submit(prompt);await f.clock.settle();
  expect(f.sent.length).toBe(1);expect(f.seen.length).toBe(0);
  await f.clock.advance(3001);const result=await pending;
  expect(result.context).toBeUndefined();expect(f.seen.length).toBe(1);
  await f.clock.advance(4000);expect(f.seen.length).toBe(1);expect(f.logs.length).toBe(1);expect(f.logs[0]).toContain("timed out");
 });
 test("provider failure passes input and never logs its body or key",async($,on)=>{
  const f=fixture(on,{bad:true});const result=await $.prompt.submit(prompt);
  expect(result.context).toBeUndefined();expect(f.seen.length).toBe(1);expect(f.logs.join(" ")).not.toContain(secret);
 });
 test("no candidates needs no network",async($,on)=>{
  const f=fixture(on,{skills:[]});const result=await $.prompt.submit(prompt);expect(f.sent).toEqual([]);expect(result.context).toBeUndefined();
 });
 test("nothing above threshold injects nothing",async($,on)=>{
  const f=fixture(on,{skills:[skills[2]],answer:{answers:{s0:{type:"noul",noul:0.74}}}});const result=await $.prompt.submit(prompt);
  expect(f.sent.length).toBe(1);expect(result.context).toBeUndefined();
 });
 test("a downstream failure is not replayed by the Mod",async($,on)=>{
  const f=fixture(on,{throwNext:true});try{await $.prompt.submit(prompt);}catch{}
  expect(f.seen.length).toBe(1);
 });
});
