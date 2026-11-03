import chromium from '@sparticuz/chromium';import puppeteer from 'puppeteer-core';
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
const FIXED=Date.UTC(2026,9,29,12,0,0),day=864e5,iso=t=>new Date(t).toISOString();
const DATA={schemaVersion:3,courses:[
 {id:'c1',name:'Data Structures',color:'#e58a9b',folder:'C:\\Study\\DS',additionalFolders:[],links:[{title:'Lecture slides',url:'https://example.edu/ds'}],apps:[],resourceGroups:[],resourceAssignments:[],filingKeywords:[],notes:'',createdAt:iso(FIXED-20*day)},
 {id:'c2',name:'Linear Algebra',color:'#5fb3a8',folder:'',additionalFolders:[],links:[],apps:[],resourceGroups:[],resourceAssignments:[],filingKeywords:[],notes:'',createdAt:iso(FIXED-18*day)},
 {id:'c3',name:'Technical Writing',color:'#e2b25c',folder:'',additionalFolders:[],links:[],apps:[],resourceGroups:[],resourceAssignments:[],filingKeywords:[],notes:'',createdAt:iso(FIXED-15*day)}],
 sessions:[...Array(9)].map((_,i)=>({id:'s'+i,courseId:['c1','c2','c3'][i%3],startedAt:iso(FIXED-i*day*0.8),plannedSec:1500,actualSec:1500-i*40,completed:true,countUp:false,summary:i==0?'Finished trees ch.4':null})),
 tasks:[{id:'t1',courseId:'c1',title:'Implement AVL rotations',createdAt:iso(FIXED),completed:false,dueAt:iso(FIXED+day)},{id:'t2',courseId:'c2',title:'Problem set 5',createdAt:iso(FIXED),completed:false}],
 notes:[{id:'n1',courseId:'c1',title:'Tree traversals',content:'# Traversals\n\n- inorder\n- preorder\n- postorder\n\nBalanced trees keep height O(log n).',createdAt:iso(FIXED),updatedAt:iso(FIXED)}],
 study:{courses:{
  c1:{examDate:'2026-11-05',weeklyGoalMinutes:180,sources:[{id:'source-1',title:'Tree lecture',kind:'link',target:'https://example.edu/trees',createdAt:iso(FIXED),chapters:[{id:'chapter-1',title:'Balanced trees',createdAt:iso(FIXED),recallHistory:[]},{id:'chapter-2',title:'Tree rotations',target:'https://example.edu/rotations',createdAt:iso(FIXED),recallHistory:[{at:iso(FIXED-day),rating:'yellow'}]}]}],reviewItems:[{id:'review-1',courseId:'c1',sourceId:'source-1',unitId:'chapter-1',chapterId:'chapter-1',prompt:'Why do balanced trees matter?',box:1,dueAt:iso(FIXED-day),createdAt:iso(FIXED-day),history:[]}]},
  c2:{sources:[{id:'source-2',title:'Linear algebra notes',kind:'link',target:'https://example.edu/linear-algebra',createdAt:iso(FIXED),chapters:[{id:'chapter-3',title:'Eigenvectors',createdAt:iso(FIXED),recallHistory:[]}]}],reviewItems:[{id:'review-2',courseId:'c2',sourceId:'source-2',unitId:'chapter-3',chapterId:'chapter-3',prompt:'Define an eigenvector.',box:1,dueAt:iso(FIXED-day),createdAt:iso(FIXED-day),history:[]}]}
 }},
 settings:{defaultLengthSec:1500,theme:'light',tourDone:true,notifications:false,soundEffects:false,downloadFilingEnabled:false,dashboardComponents:['character','course-dock','next-task']}};
const DIST=process.argv[2],OUT=process.argv[3];fs.mkdirSync(OUT,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const root=path.resolve(DIST);
const srv=http.createServer((q,res)=>{const pathname=decodeURIComponent(new URL(q.url,'http://127.0.0.1').pathname);const relative=pathname.replace(/^\/+/,'')||'index.html';const f=path.resolve(root,relative);if(f!==root&&!f.startsWith(`${root}${path.sep}`)){res.writeHead(404);res.end();return}fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return}res.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream'});res.end(d)})}).listen(0);
await new Promise(r=>srv.on('listening',r));const port=srv.address().port;
const hard=setTimeout(()=>{console.log('HARD TIMEOUT');process.exit(3)},240000);
const browserPath = process.env.CHROME_EXECUTABLE_PATH;
const b=await puppeteer.launch(browserPath
  ? {args:['--no-sandbox','--disable-gpu'],executablePath:browserPath,headless:true}
  : {args:chromium.args,executablePath:await chromium.executablePath(),headless:'shell'});
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
  const errs=[],dialogs=[];p.on('pageerror',e=>errs.push(String(e)));
  p.on('dialog',async dialog=>{dialogs.push({type:dialog.type,message:dialog.message()});await dialog.accept()});
  await p.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle0'});
  await p.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'});
  await new Promise(r=>setTimeout(r,400));
  for(const [i,s] of steps.entries()){
    if(s.viewport)await p.setViewport(s.viewport);
    if(s.page)await p.evaluate(pg=>document.querySelector(`[data-page-target="${pg}"]`).click(),s.page);
    if(s.js)await p.evaluate(s.js);
    if(s.key)await p.keyboard.press(s.key);
    if(s.backdrop)await p.mouse.click(12,12);
    if(s.wait)await new Promise(r=>setTimeout(r,s.wait));
    await new Promise(r=>setTimeout(r,250));
    if(s.check==='flat')await p.evaluate(()=>{const color=getComputedStyle(document.body).backgroundColor;if(color==='rgba(0, 0, 0, 0)')throw new Error('Desk background is transparent');for(const element of [document.body,document.querySelector('.stage'),document.querySelector('.page-panel')].filter(Boolean)){if(getComputedStyle(element).backgroundImage!=='none')throw new Error('Unexpected background image or gradient')}})
    if(s.check==='viewport-shell')await p.evaluate(()=>{if(Math.abs(document.querySelector('.app-shell').getBoundingClientRect().height-innerHeight)>1)throw new Error('App shell does not match the window height');if(document.documentElement.scrollHeight>innerHeight+1||document.body.scrollHeight>innerHeight+1)throw new Error('The window has a page scrollbar');if(getComputedStyle(document.querySelector('.app-page:not([hidden])')).scrollbarWidth!=='none')throw new Error('Main scrollbar is not hidden')})
    if(s.check==='desk-fit')await p.evaluate(()=>{for(const selector of ['.topbar','.buddy-stage','.stage-caption','.timer-display','#start-session','.course-dock']){const element=document.querySelector(selector);const rect=element.getBoundingClientRect();if(rect.top<0||rect.bottom>innerHeight+1)throw new Error(`${selector} is outside the window`)}const bubble=document.getElementById('buddy-bubble');if(!bubble.hidden&&bubble.getBoundingClientRect().bottom>document.getElementById('buddy-art').getBoundingClientRect().top)throw new Error('Buddy art overlaps its status bubble');const page=document.querySelector('#desk-page');if(page.scrollHeight>page.clientHeight+1)throw new Error('Desk content requires scrolling at this viewport')})
    if(s.check==='inner-scrollbars')await p.evaluate(()=>{for(const selector of ['.app-page','.note-list','.notes-editor','.page-panel']){const element=document.querySelector(selector);if(!element)continue;const width=getComputedStyle(element).scrollbarWidth;if(selector==='.app-page'?width!=='none':width!=='thin')throw new Error(`${selector} has unexpected scrollbar width: ${width}`)}})
    if(s.check==='keyboard-scroll'){await p.evaluate(()=>{const page=document.querySelector('.app-page:not([hidden])');const panel=page.querySelector('.page-panel');page.style.cssText+=';height:300px;flex:0 0 300px;display:block';panel.style.cssText+=';height:1400px;min-height:1400px;max-height:none;overflow:visible';page.focus()});let previous=0;for(const key of ['ArrowDown','PageDown','Space']){await p.keyboard.press(key);const next=await p.evaluate(()=>document.querySelector('.app-page:not([hidden])').scrollTop);if(next<=previous)throw new Error(`${key} did not scroll the main content`);previous=next}await p.keyboard.press('End');const bottom=await p.evaluate(()=>{const page=document.querySelector('.app-page:not([hidden])');return{top:page.scrollTop,max:page.scrollHeight-page.clientHeight}});if(bottom.top!==bottom.max)throw new Error('End did not scroll to the bottom');await p.keyboard.press('PageUp');const pageUp=await p.evaluate(()=>document.querySelector('.app-page:not([hidden])').scrollTop);if(pageUp>=bottom.top)throw new Error('Page Up did not scroll the main content upward');await p.keyboard.press('ArrowUp');const arrowUp=await p.evaluate(()=>document.querySelector('.app-page:not([hidden])').scrollTop);if(arrowUp>=pageUp)throw new Error('Arrow Up did not scroll the main content upward');await p.keyboard.press('Home');const reset=await p.evaluate(()=>document.querySelector('.app-page:not([hidden])').scrollTop);if(reset!==0)throw new Error('Home did not return the main content to the top');const box=await p.evaluate(()=>{const rect=document.querySelector('.app-page:not([hidden])').getBoundingClientRect();return{x:rect.left+rect.width/2,y:rect.top+rect.height/2}});await p.mouse.move(box.x,box.y);await p.mouse.wheel({deltaY:400});await new Promise(r=>setTimeout(r,100));const wheelState=await p.evaluate(()=>{const page=document.querySelector('.app-page:not([hidden])');const rect=page.getBoundingClientRect();return{scrollTop:page.scrollTop,overflow:getComputedStyle(page).overflowY,point:document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2)?.className}});if(wheelState.scrollTop<=0)throw new Error(`Mouse-wheel scrolling did not move the main content: ${JSON.stringify(wheelState)}`)}
    if(s.check==='buttons')await p.evaluate(()=>{for(const id of ['add-course','edit-course','empty-add-course']){const button=document.getElementById(id);const wasHidden=button.hidden;button.hidden=false;if(!button.getClientRects().length||getComputedStyle(button).backgroundColor==='rgba(0, 0, 0, 0)')throw new Error(`${id} is not visibly styled`);button.hidden=wasHidden}})
    if(s.check==='resource-buttons')await p.evaluate(()=>{for(const selector of ['#resource-add-folder','#resource-add-files','#resource-link-form button[type="submit"]']){const button=document.querySelector(selector);if(!button.getClientRects().length||getComputedStyle(button).backgroundColor==='rgba(0, 0, 0, 0)')throw new Error(`${selector} is not visibly styled`)}const button=document.getElementById('resources-add-course');const wasHidden=button.hidden;button.hidden=false;if(!button.getClientRects().length||getComputedStyle(button).backgroundColor==='rgba(0, 0, 0, 0)')throw new Error('resources-add-course is not visibly styled');button.hidden=wasHidden})
    if(s.check==='course-modal'||s.check==='settings-modal')await p.evaluate(kind=>{const dialog=document.getElementById(kind==='course-modal'?'course-sheet':'settings-dialog');const rect=dialog.getBoundingClientRect();if(!dialog.open)throw new Error('Dialog did not open');if(Math.abs(rect.left+rect.width/2-innerWidth/2)>2||Math.abs(rect.top+rect.height/2-innerHeight/2)>2)throw new Error('Dialog is not centered');if(rect.width>innerWidth||rect.height>innerHeight*.9+2)throw new Error('Dialog does not fit the viewport');if(!dialog.querySelector('.dialog-close-button'))throw new Error('Dialog has no visible close button');const focusTarget=kind==='course-modal'?'course-name':'theme-setting';if(document.activeElement.id!==focusTarget)throw new Error('Dialog did not receive initial focus');if(kind==='course-modal'&&(innerWidth<=700||innerHeight<=700)){const scrollTop=dialog.scrollTop;dialog.scrollTop=dialog.scrollHeight;if(dialog.scrollTop<=scrollTop)throw new Error('Course dialog does not scroll internally');dialog.scrollTop=scrollTop}},s.check)
    if(s.check==='dialog-focus-scroll')await p.evaluate(()=>{const dialog=document.getElementById('course-sheet');const target=document.getElementById('delete-course');target.focus();const dialogRect=dialog.getBoundingClientRect(),targetRect=target.getBoundingClientRect();if(targetRect.top<dialogRect.top||targetRect.bottom>dialogRect.bottom)throw new Error('Focused dialog control did not scroll into view')})
    if(s.check==='focus-contained')await p.evaluate(()=>{if(!document.activeElement.closest('dialog'))throw new Error('Keyboard focus escaped the active dialog')})
    if(s.check==='focus-restored')await p.evaluate(()=>{if(document.activeElement.id!=='edit-course')throw new Error('Focus did not return to the opener')})
    if(s.check==='settings-focus')await p.evaluate(()=>{if(document.activeElement.id!=='open-settings')throw new Error('Settings focus did not return to its opener')})
    if(s.check==='dirty-close')await p.evaluate(()=>{if(document.getElementById('course-sheet').open)throw new Error('Confirmed dirty dialog did not close')})
    if(s.check==='dirty-confirm'&&!dialogs.some(dialog=>dialog.message.includes('unsaved changes')))throw new Error(`Closing a dirty course did not ask for confirmation: ${JSON.stringify(dialogs)}`)
    if(s.shot)await p.screenshot({path:path.join(OUT,`${name}-${s.shot}.png`)});
  }
  const calls2=await p.evaluate(()=>window.__CALLS);
  log.push({name,errs,dialogs,calls:calls2});await p.close();
}
const pages=['study','resources','notes','tasks','stats','history'];
for(const skin of ['classic','arc']){
  await run(`light-${skin}`,{skin,steps:[{shot:'desk',check:'flat'},{check:'buttons'},...pages.map(pg=>({page:pg,shot:pg,...(pg==='resources'?{check:'resource-buttons'}:{})})),{page:'desk'},{js:'document.querySelector("#open-settings").focus();document.querySelector("#open-settings").click()',shot:'settings',check:'settings-modal'},{js:'document.querySelector("#close-settings").click()'},{check:'settings-focus'},{js:'document.querySelector("#edit-course").focus();document.querySelector("#edit-course").click()',shot:'coursesheet',check:'course-modal'},{key:'Escape',check:'focus-restored'},{viewport:{width:700,height:800},shot:'desk-700',check:'buttons'},{js:'document.querySelector("#edit-course").focus();document.querySelector("#edit-course").click()',shot:'coursesheet-700',check:'course-modal'},{js:'(()=>{const input=document.querySelector("#course-name");input.value="Changed course";input.dispatchEvent(new Event("input",{bubbles:true}))})()'},{backdrop:true,check:'dirty-close'},{check:'dirty-confirm'}]});
}
for(const skin of ['classic','arc']){
  await run(`dark-${skin}`,{theme:'dark',skin,steps:[{shot:'desk',check:'flat'},{check:'buttons'},{js:'document.querySelector("#open-settings").focus();document.querySelector("#open-settings").click()',shot:'settings',check:'settings-modal'},{js:'document.querySelector("#close-settings").click()'},{check:'settings-focus'},{js:'document.querySelector("#edit-course").focus();document.querySelector("#edit-course").click()',shot:'coursesheet',check:'course-modal'},{key:'Escape',check:'focus-restored'},{viewport:{width:700,height:800},shot:'desk-700',check:'buttons'},{js:'document.querySelector("#edit-course").focus();document.querySelector("#edit-course").click()',shot:'coursesheet-700',check:'course-modal'},{js:'(()=>{const input=document.querySelector("#course-name");input.value="Changed course";input.dispatchEvent(new Event("input",{bubbles:true}))})()'},{backdrop:true,check:'dirty-close'},{check:'dirty-confirm'},...(skin==='arc'?[{viewport:{width:1280,height:800}},{page:'notes',shot:'notes'},{page:'history',shot:'history'}]:[])]});
}
await run('session',{skin:'classic',steps:[{js:'document.querySelector("[data-length-sec=\\"1500\\"]").click()'},{js:'document.querySelector("#start-session").click()',wait:900,shot:'running'},{js:'document.querySelector("#pause-session").click()',shot:'paused'},{js:'document.querySelector("#pause-session").click()'},{js:'document.querySelector("#end-session").click()',wait:600,shot:'ended'}]});
await run('notes-flow',{skin:'classic',steps:[{page:'notes'},{js:'document.querySelector("#note-create").click()',wait:300},{js:'(()=>{const t=document.querySelector("#note-title");t.value="Test note";t.dispatchEvent(new Event("input",{bubbles:true}));const c=document.querySelector("#note-content");c.value="hello **world**";c.dispatchEvent(new Event("input",{bubbles:true}))})()',shot:'edited'},{page:'tasks'},{js:'(()=>{const i=document.querySelector("#new-task-title");i.value="A new task";document.querySelector("#task-form").requestSubmit()})()',shot:'taskadded'}]});
for(const theme of ['light','dark']){
  for(const skin of ['classic','arc','mono','paper']){
    await run(`study-${theme}-${skin}`,{theme,skin,steps:[{shot:'desk',check:'flat'},{check:'buttons'},{js:'document.querySelector("#edit-course").focus();document.querySelector("#edit-course").click()',shot:'coursesheet',check:'course-modal'},{key:'Escape',check:'focus-restored'},{page:'study',shot:'hub'},{page:'resources',check:'resource-buttons'}]});
  }
}
for(const theme of ['light','dark']){
  const steps=[];
  for(const height of [700,800,1000]){
    steps.push({viewport:{width:765,height},check:'viewport-shell'},{page:'desk',shot:`desk-${height}`,check:'desk-fit'},{page:'notes',shot:`notes-${height}`,check:'inner-scrollbars'},{page:'history',shot:`history-${height}`,check:'inner-scrollbars'});
  }
  steps.push({check:'keyboard-scroll'},{page:'desk'},{viewport:{width:765,height:700}},{js:'document.querySelector("#edit-course").focus();document.querySelector("#edit-course").click()',check:'course-modal'},{check:'dialog-focus-scroll'},{key:'Escape',check:'focus-restored'});
  await run(`viewport-${theme}`,{theme,skin:'classic',steps});
}
await run('study-recall',{skin:'arc',steps:[
  {page:'study',shot:'hub'},
  {js:'document.querySelector("[data-study-action=\\"source-open\\"]").click()',wait:400},
  {js:'document.querySelector("#study-interleave-review").click();if(!document.querySelector("#recall-read-location").textContent.includes("Linear algebra notes"))throw new Error("Interleaving should choose a different recently studied course")',shot:'interleaved-review'},
  {js:'document.querySelector("#close-recall").click()'},
  {js:'document.querySelector("[data-review-id]").click()',shot:'question-read'},
  {js:'document.querySelector("[data-review-id]").click()',shot:'question-read'},
  {js:'document.querySelector("#recall-begin").click()',shot:'question-writing'},
  {js:'(()=>{const p=document.querySelector("#recall-writing-prompt");if(p.hidden||!p.textContent.includes("eigenvector"))throw new Error("The authored question should stay visible during recall");document.querySelector("#recall-answer").value="A vector scaled by a linear transformation";document.querySelector("#recall-reveal").click()})()',shot:'question-revealed'},
  {js:'document.querySelector("[data-recall-rating=\\"yellow\\"]").click()',wait:400,shot:'question-rated'},
  {js:'document.querySelector("[data-study-action=\\"chapter-recall\\"]").click()',shot:'read'},
  {js:'document.querySelector("#recall-begin").click();document.querySelector("#recall-answer").value="Recall notes"',shot:'writing'},
  {js:'document.querySelector("#recall-reveal").click()',shot:'revealed'},
  {js:'document.querySelector("[data-recall-rating=\\"yellow\\"]").click()',wait:400,shot:'rated'},
  {js:'document.dispatchEvent(new KeyboardEvent("keydown",{key:"k",ctrlKey:true,bubbles:true}))',shot:'keyboard-commands'},
  {js:'document.querySelector("#command-palette").close()'},
  {js:'document.querySelector("#open-command-palette").click()',shot:'commands'},
  {js:'document.querySelector("[data-command=\\"task\\"]").click()',shot:'task-command'},
  {js:'(()=>{document.querySelector("[data-page-target=\\"study\\"]").click();const title=document.querySelector("#study-source-title");title.value="Practice notes";document.querySelector("#study-source-target").value="https://example.edu/practice";document.querySelector("#study-source-form").requestSubmit()})()',shot:'source-added'}
]});
fs.writeFileSync(path.join(OUT,'log.json'),JSON.stringify(log,null,1));
console.log(JSON.stringify(log.map(l=>({n:l.name,errs:l.errs.length,calls:l.calls.length}))));
await b.close();srv.close();clearTimeout(hard);process.exit(0);
