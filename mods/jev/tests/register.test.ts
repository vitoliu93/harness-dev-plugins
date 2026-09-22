import { describe, expect, mock, test, tier } from "claude-code/testing";
import type { On } from "claude-code";

tier("user");
const secret="synthetic-test-key-never-real";
const catalog=JSON.stringify({agents:{researcher:{description:"Read-only code research",routes:[{id:"test:research",use:"normal",model:"fiction",cli:"claude"}]}}});
const rows=[{session_id:"fictional-history",day:"2026-09-01",summary:"retry bug",conclusion:"retry once",file_path:"/fiction/transcript.jsonl"}];
const answer={answers:{delegation:{type:"choice",choice:"delegate",confidence:0.9,probabilities:{self:0.05,delegate:0.9,unknown:0.05}},a0:{type:"noul",noul:0.9},r0:{type:"noul",noul:0.9}}};
function fixture(on:On, options:{enabled?:boolean,key?:string,catalog?:string,rows?:unknown,delay?:number,bad?:boolean,throwNext?:boolean}={}){
 const clock=mock.clock(on,{now:Date.parse("2026-09-22")});
 const env:Record<string,string|undefined>={HOME:"/fiction",CCOBS_DIR:"/fiction/obs",AGENTS_CONFIG:"/fiction/agents.json",DEVKIT_JEV_ENABLED:options.enabled===false?"0":"1",TYPESAFE_API_KEY:options.key??secret};
 const sent:any[]=[];const logs:string[]=[];const processes:any[]=[];const seen:any[]=[];const messages:any[]=[];
 on("env.get",($,e)=>({value:env[e.name]}));
 on("env.set",($,e)=>{env[e.name]=e.value;return {value:undefined};});
 on("session.id",()=>({value:"fictional-current"}));
 on("session.cwd",()=>({value:"/fiction/repo"}));
 on("session.messages",()=>({value:messages}));
 on("agent.list",()=>({value:[]}));
 on("fs.exists",()=>({value:false}));
 on("fs.read",()=>({value:options.catalog??catalog}));
 on("process.run",($,e)=>{processes.push(e);return {value:{exitCode:0,stdout:JSON.stringify(options.rows??rows),stderr:""}};});
 on("ui.log",($,e)=>{logs.push(e.text);return {value:undefined};});
 on("http.fetch",async($,e)=>{sent.push(e);if(options.delay)await clock.sleep(options.delay);return {value:{ok:!options.bad,status:options.bad?401:200,headers:{},text:options.bad?secret:JSON.stringify(answer)}};});
 on("prompt.submit",($,e)=>{seen.push({...e,legacyOwner:env.DEVKIT_JEV_RECALL_SESSION});if(options.throwNext)throw new Error("downstream-failure");return {text:e.text,context:e.context,origin:e.origin};});
 return {clock,env,sent,logs,processes,seen,messages};
}
const prompt={text:"Independently research the retry bug",origin:{kind:"sdk" as const},wait:false};
describe("register",()=>{
 test("disabled or missing key never sends, injects or owns recall",async($,on)=>{
  const f=fixture(on,{enabled:false});
  const result=await $.prompt.submit(prompt);expect(result.text).toBe(prompt.text);expect(result.context).toBeUndefined();expect(f.sent).toEqual([]);expect(f.processes).toEqual([]);expect(f.env.DEVKIT_JEV_RECALL_SESSION).toBeUndefined();
  f.env.DEVKIT_JEV_ENABLED="1";f.env.TYPESAFE_API_KEY="";
  await $.prompt.submit(prompt);expect(f.sent).toEqual([]);expect(f.env.DEVKIT_JEV_RECALL_SESSION).toBeUndefined();
 });
 test("injects advice and original sources without changing the user input",async($,on)=>{
  const f=fixture(on);const result=await $.prompt.submit({...prompt,context:["existing"]});
  expect(result.text).toBe(prompt.text);expect(result.origin).toEqual(prompt.origin);expect(result.context?.[0]).toBe("existing");
  expect(result.context?.[1]).toContain("researcher");expect(result.context?.[1]).toContain("/fiction/transcript.jsonl");expect(result.context?.[1]).toContain("Advisory only");
  expect(f.sent.length).toBe(1);expect(f.seen[0].legacyOwner).toBe("fictional-current");expect(f.env.DEVKIT_JEV_RECALL_SESSION).toBeUndefined();
  expect(f.processes[0].argv[0]).toBe("bun");expect(f.processes[0].argv[1]).toContain("/scripts/recall-candidates.ts");expect(f.processes[0].init.timeoutMs).toBe(1500);
  expect(f.sent[0].url).toBe("https://api.typesafe.ai/v1/systemone");expect(f.sent[0].init.headers.Authorization).toBe(`Bearer ${secret}`);
  expect(f.sent[0].init.body).not.toContain("/fiction/");expect(f.sent[0].init.body).not.toContain(secret);
 });
 test("re-evaluates continuation using recent text without tool output",async($,on)=>{
  const f=fixture(on);await $.prompt.submit(prompt);
  f.messages.push({role:"user",text:"Research retry; then independently test it",toolResults:[{content:"PRIVATE-TOOL-OUTPUT"}],toolUses:[]});
  await $.prompt.submit({...prompt,text:`Continue; ${secret}`});
  expect(f.sent.length).toBe(2);const state=JSON.parse(f.sent[1].init.body).state;
  expect(state.recent_context[0].text).toContain("independently test");expect(f.sent[1].init.body).not.toContain(secret);expect(f.sent[1].init.body).not.toContain("PRIVATE-TOOL-OUTPUT");
 });
 test("notifications and commands do not recurse",async($,on)=>{
  const f=fixture(on);await $.prompt.submit({...prompt,origin:{kind:"plugin",name:"other"}});
  await $.prompt.submit({...prompt,text:"/help"});await $.prompt.submit({...prompt,text:"! pwd"});
  expect(f.sent).toEqual([]);expect(f.processes).toEqual([]);expect(f.seen.length).toBe(3);
 });
 test("timeout releases the prompt once, ignores late response and owns legacy recall",async($,on)=>{
  const f=fixture(on,{delay:6000});const pending=$.prompt.submit(prompt);await f.clock.settle();
  expect(f.sent.length).toBe(1);expect(f.seen.length).toBe(0);
  await f.clock.advance(3001);const result=await pending;
  expect(result.context).toBeUndefined();expect(f.seen.length).toBe(1);expect(f.seen[0].legacyOwner).toBe("fictional-current");expect(f.env.DEVKIT_JEV_RECALL_SESSION).toBeUndefined();
  await f.clock.advance(4000);expect(f.seen.length).toBe(1);expect(f.logs.length).toBe(1);expect(f.logs[0]).toContain("timed out");
 });
 test("provider failure passes input and never logs its body or key",async($,on)=>{
  const f=fixture(on,{bad:true});const result=await $.prompt.submit(prompt);
  expect(result.context).toBeUndefined();expect(f.seen.length).toBe(1);expect(f.logs.join(" ")).not.toContain(secret);
 });
 test("no candidates needs no network and disabling restores legacy ownership",async($,on)=>{
  const f=fixture(on,{catalog:"{}",rows:[]});const result=await $.prompt.submit(prompt);expect(f.sent).toEqual([]);expect(result.context).toBeUndefined();
  expect(f.seen[0].legacyOwner).toBe("fictional-current");expect(f.env.DEVKIT_JEV_RECALL_SESSION).toBeUndefined();
  f.env.DEVKIT_JEV_ENABLED="0";await $.prompt.submit(prompt);expect(f.env.DEVKIT_JEV_RECALL_SESSION).toBeUndefined();
 });
 test("a downstream failure is not replayed by the Mod",async($,on)=>{
  const f=fixture(on,{throwNext:true});try{await $.prompt.submit(prompt);}catch{}
  expect(f.seen.length).toBe(1);
 });
});
