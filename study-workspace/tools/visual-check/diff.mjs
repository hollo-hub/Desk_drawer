import fs from 'node:fs';import {PNG} from 'pngjs';import pixelmatch from 'pixelmatch';import path from 'node:path';
const [,,A,B]=process.argv;let bad=0,n=0;
for(const f of fs.readdirSync(A).filter(f=>f.endsWith('.png')).sort()){
  const a=PNG.sync.read(fs.readFileSync(path.join(A,f)));let bp=path.join(B,f);
  if(!fs.existsSync(bp)){console.log('MISSING',f);bad++;continue}
  const b=PNG.sync.read(fs.readFileSync(bp));
  if(a.width!==b.width||a.height!==b.height){console.log('SIZE',f);bad++;continue}
  const d=pixelmatch(a.data,b.data,null,a.width,a.height,{threshold:0});n++;
  if(d>0){console.log('DIFF',f,d,'px');bad++}
}
console.log(`${n} compared, ${bad} differing`);
const la=JSON.parse(fs.readFileSync(path.join(A,'log.json')));const lb=JSON.parse(fs.readFileSync(path.join(B,'log.json')));
console.log('invoke calls identical:',JSON.stringify(la.map(x=>x.calls))===JSON.stringify(lb.map(x=>x.calls)),'| errors:',lb.reduce((s,x)=>s+x.errs.length,0));
