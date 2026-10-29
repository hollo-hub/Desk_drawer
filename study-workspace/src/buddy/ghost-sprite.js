// Desk Drawer ghost buddy: 16x16 pixel ghost. sprite(state,frame,coat) returns an SVG string.
// states: idle, blink, focus, done, nudge, paused. coats: lavender, mint, coral, sunny.
// frame alternates 0/1 every ~350ms to wave the hem.
const row=(l,s)=>".".repeat(l)+s+".".repeat(16-l-s.length);
const F="B".repeat(16);
const TOP=[row(4,"B".repeat(8)),row(2,"B".repeat(12)),row(1,"B".repeat(14)),row(1,"B".repeat(14)),...Array(9).fill(F),F,F];
const FEET=["BBB..BBBBBB..BBB",".BBB..BBBB..BBB."];
const COATS={lavender:{B:"#b7a5f3",S:"#9784dc",h:"#dcd2fb"},mint:{B:"#7fe0c3",S:"#5cc2a4",h:"#bff3e2"},coral:{B:"#f58f8f",S:"#d86f6f",h:"#fbc3c3"},sunny:{B:"#f6d365",S:"#dcb64a",h:"#fbe9a8"}};
const FRIGHT={B:"#8c9bf5",S:"#6d7ae0",h:"#b9c3ff"};
const FIX={E:"#262338",W:"#ffffff",R:"#f7a3b5",M:"#262338",T:"#8fd3ff"};
function face(st){
 const o=[],a=(c,...p)=>p.forEach(([x,y])=>o.push([x,y,c]));
 const blush=()=>a("R",[2,8],[3,8],[12,8],[13,8]);
 const smile=()=>a("M",[6,8],[7,9],[8,9],[9,8]);
 if(st==="idle"||st==="paused"){
  [4,10].forEach(x=>{[5,6,7].forEach(y=>a("E",[x,y],[x+1,y]));a("W",[x,5])});
  if(st==="idle"){blush();smile()}
 }else if(st==="blink"){[4,10].forEach(x=>a("E",[x,7],[x+1,7]));blush();smile()}
 else if(st==="focus"){[4,10].forEach(x=>{[6,7].forEach(y=>a("E",[x,y],[x+1,y]));a("S",[x-1,5],[x,5],[x+1,5],[x+2,5])});a("M",[7,9],[8,9])}
 else if(st==="done"){[3,10].forEach(x=>a("E",[x,7],[x+1,6],[x+2,7]));blush();a("M",[7,8],[8,8],[7,9],[8,9])}
 else if(st==="nudge"){[4,10].forEach(x=>a("E",[x,5],[x,6]));a("M",[4,10],[5,9],[6,10],[7,9],[8,10],[9,9],[10,10],[11,9]);a("T",[13,3],[13,4])}
 return o;
}
function sprite(st,fr,coat){
 const pal=st==="nudge"?FRIGHT:(COATS[coat]||COATS.lavender);
 const g=[...TOP,FEET[fr%2]].map(r=>[...r]);
 g.forEach((r,y)=>r.forEach((c,x)=>{if(c==="B"&&x>=13&&y>=5)r[x]="S"}));
 [[4,1],[3,2],[2,3],[2,4]].forEach(([x,y])=>{if(g[y][x]==="B")g[y][x]="h"});
 face(st).forEach(([x,y,c])=>{g[y][x]=c});
 const fade=st==="paused"?.2:1;
 let s="";
 g.forEach((r,y)=>r.forEach((c,x)=>{if(c===".")return;const body=pal[c]&&c!=="E";s+=`<rect x="${x}" y="${y}" width="1" height="1" fill="${body?pal[c]:FIX[c]}"${body?` fill-opacity="${fade}"`:""}/>`}));
 return `<svg viewBox="0 0 16 16" width="100%" height="100%" shape-rendering="crispEdges">${s}</svg>`;
}
export { sprite };
