import chromium from '@sparticuz/chromium';import puppeteer from 'puppeteer-core';
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
const FIXED=Date.UTC(2026,9,29,12,0,0),day=864e5,iso=t=>new Date(t).toISOString();
const DATA={schemaVersion:3,courses:[
 {id:'c1',name:'Data Structures',color:'#e58a9b',folder:'C:\\Study\\DS',additionalFolders:[],links:[{title:'Lecture slides',url:'https://example.edu/ds'}],apps:[],resourceGroups:[],resourceAssignments:[],filingKeywords:[],notes:'',createdAt:iso(FIXED-20*day)},
 {id:'c2',name:'Linear Algebra',color:'#5fb3a8',folder:'',additionalFolders:[],links:[],apps:[],resourceGroups:[],resourceAssignments:[],filingKeywords:[],notes:'',createdAt:iso(FIXED-18*day)},
 {id:'c3',name:'Technical Writing',color:'#e2b25c',folder:'',additionalFolders:[],links:[],apps:[],resourceGroups:[],resourceAssignments:[],filingKeywords:[],notes:'',createdAt:iso(FIXED-15*day)}],
 sessions:[...Array(9)].map((_,i)=>({id:'s'+i,courseId:['c1','c2','c3'][i%3],startedAt:iso(FIXED-i*day*0.8),plannedSec:1500,actualSec:1500-i*40,completed:true,countUp:false,summary:i==0?'Finished trees ch.4':null})),
 tasks:[{id:'t1',courseId:'c1',title:'Implement AVL rotations',createdAt:iso(FIXED),completed:false},{id:'t2',courseId:'c2',title:'Problem set 5',createdAt:iso(FIXED),completed:false}],
 notes:[{id:'n1',courseId:'c1',title:'Tree traversals',content:'# Traversals\n\n- inorder\n- preorder\n- postorder\n\nBalanced trees keep height O(log n).',createdAt:iso(FIXED),updatedAt:iso(FIXED)}],
 settings:{defaultLengthSec:1500,theme:'light',tourDone:true,notifications:false,soundEffects:false,downloadFilingEnabled:false,dashboardComponents:['character','course-dock','next-task']}};
const DIST=process.argv[2],OUT=process.argv[3];fs.mkdirSync(OUT,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const srv=http.createServer((q,res)=>{let f=path.join(DIST,q.url.split('?')[0]);if(f.endsWith('/'))f+='index.html';fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return}res.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream'});res.end(d)})}).listen(0);
await new Promise(r=>srv.on('listening',r));const port=srv.address().port;
const hard=setTimeout(()=>{console.log('HARD TIMEOUT');process.exit(3)},240000);
const b=await puppeteer.launch({args:chromium.args,executablePath:await chromium.executablePath(),headless:'shell'});
const log=[];
async function run(name,{theme='light',skin,steps}){
  const p=await b.newPage();await p.setViewport({width:1280,height:800});
  const data=JSON.parse(JSON.stringify(DATA));data.settings.theme=theme;
  const calls=[];
  await p.evaluateOnNewDocument((data,skin)=>{window.__CALLS=[];
    window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{windowLabel:'main',label:'main'}},transformCallback:()=>1,convertFileSrc:x=>x,
     invoke:async(cmd,args)=>{window.__CALLS.push(cmd);return cmd==='load_data'?data:(cmd.startsWith('plugin:event|listen')?1:null)}};
    // freeze time-based randomness/animation for deterministic pixels
    Math.random=()=>0.5;
    {const F=Date.UTC(2026,9,29,12,0,0),R=Date;class FD extends R{constructor(...a){if(a.length===0)super(F);else super(...a)}static now(){return F}}window.Date=FD;}
    if(skin)localStorage.setItem('dd-skin',JSON.stringify({skin}));
  },data,skin||null);
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle0'});
  await p.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'});
  await new Promise(r=>setTimeout(r,400));
  for(const [i,s] of steps.entries()){
    if(s.page)await p.evaluate(pg=>document.querySelector(`[data-page-target="${pg}"]`).click(),s.page);
    if(s.js)await p.evaluate(s.js);
    if(s.wait)await new Promise(r=>setTimeout(r,s.wait));
    await new Promise(r=>setTimeout(r,250));
    if(s.shot)await p.screenshot({path:path.join(OUT,`${name}-${s.shot}.png`)});
  }
  const calls2=await p.evaluate(()=>window.__CALLS);
  log.push({name,errs,calls:calls2});await p.close();
}
const pages=['resources','notes','tasks','stats','history'];
for(const skin of ['classic','arc']){
  await run(`light-${skin}`,{skin,steps:[{shot:'desk'},...pages.map(pg=>({page:pg,shot:pg})),{page:'desk'},{js:'document.querySelector("#open-settings").click()',shot:'settings'},{js:'document.querySelector("#close-settings").click();document.querySelector("#edit-course").click()',shot:'coursesheet'}]});
}
await run('dark-arc',{theme:'dark',skin:'arc',steps:[{shot:'desk'},{page:'notes',shot:'notes'},{page:'history',shot:'history'}]});
await run('session',{skin:'classic',steps:[{js:'document.querySelector("[data-length-sec=\\"1500\\"]").click()'},{js:'document.querySelector("#start-session").click()',wait:900,shot:'running'},{js:'document.querySelector("#pause-session").click()',shot:'paused'},{js:'document.querySelector("#pause-session").click()'},{js:'document.querySelector("#end-session").click()',wait:600,shot:'ended'}]});
await run('notes-flow',{skin:'classic',steps:[{page:'notes'},{js:'document.querySelector("#note-create").click()',wait:300},{js:'(()=>{const t=document.querySelector("#note-title");t.value="Test note";t.dispatchEvent(new Event("input",{bubbles:true}));const c=document.querySelector("#note-content");c.value="hello **world**";c.dispatchEvent(new Event("input",{bubbles:true}))})()',shot:'edited'},{page:'tasks'},{js:'(()=>{const i=document.querySelector("#new-task-title");i.value="A new task";document.querySelector("#task-form").requestSubmit()})()',shot:'taskadded'}]});
fs.writeFileSync(path.join(OUT,'log.json'),JSON.stringify(log,null,1));
console.log(JSON.stringify(log.map(l=>({n:l.name,errs:l.errs.length,calls:l.calls.length}))));
await b.close();srv.close();clearTimeout(hard);process.exit(0);
