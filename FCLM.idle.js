
// ==UserScript==
// @name         FCLM Idle Tracker v7.9 PRO — RUH8
// @namespace    http://tampermonkey.net/
// @version      7.9
// @description  Professional FCLM Idle Time Dashboard with Live Idle + Custom FANS + Clock Status — Built by mualyanm (Alyan Mujtaba Abbasi)
// @match        https://fclm-portal.amazon.com/?warehouseId=RUH8
// @grant        GM_xmlhttpRequest
// @connect      fans-dub.amazon.com
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/alyanking0999-crypto/my-fclmidle-script/main/FCLM.idle.js
// @downloadURL  https://raw.githubusercontent.com/alyanking0999-crypto/my-fclmidle-script/main/FCLM.idle.js
// ==/UserScript==

(function(){
'use strict';

var _w=typeof unsafeWindow!=='undefined'?unsafeWindow:window;
var _d=document;

// ========== CONFIG ==========
var C={
wh:'RUH8',
parallel:15,
delay:300,
rescanSec:60,
sound:true,
popup:true,
cooldown:15,
dashFrom:'17:45',
dashTo:'04:15',
dashCrossMid:true,
dateMode:'today',
shiftPresets:[
{name:'Night',start:'17:45',end:'04:15',crossMid:true},
{name:'Day',start:'06:00',end:'18:00',crossMid:false},
{name:'Morning',start:'04:00',end:'12:00',crossMid:false},
{name:'Evening',start:'12:00',end:'22:00',crossMid:false}
],
liveAlert:{enabled:true,min:5},
shiftAlert:{enabled:true,min:30},
flags:['none','star','watch','issue','top'],
flagIcons:{none:'\u2B1C',star:'\u2B50',watch:'\uD83D\uDC41',issue:'\u26A0\uFE0F',top:'\uD83C\uDFC6'},
flagColors:{none:'#484f58',star:'#f59e0b',watch:'#58a6ff',issue:'#ef4444',top:'#3fb950'},
fans:{
enabled:true,
autoLive:false,autoLiveMin:5,
autoShift:false,autoShiftMin:30,
cooldown:15,
catMsgs:{
active:'Hi {name}, you are doing great! Keep it up.',
medium:'Hi {name}, your idle time is {totalIdle}m. Please stay on task.',
high:'Hi {name}, your idle time is {totalIdle}m which is high. Please check in with your PA immediately.',
critical:'Hi {name}, your idle time is {totalIdle}m which is critical. Immediate action required.'
}
},
sfRangeViolations:[
{min:0,max:5,level:'OK',label:'Strong Finish',icon:'\uD83D\uDFE2',color:'#3fb950',desc:'Under 5m idle'},
{min:5,max:10,level:'Monitor',label:'Monitor',icon:'\uD83D\uDD35',color:'#58a6ff',desc:'5-10m idle'},
{min:10,max:20,level:'Miss',label:'Missed',icon:'\uD83D\uDFE1',color:'#f59e0b',desc:'10-20m idle'},
{min:20,max:99999,level:'Critical',label:'Critical',icon:'\uD83D\uDD34',color:'#ef4444',desc:'20m+ idle'}
],
// v7.9 PRO: Alert cooldown tracking (1hr per AA)
alertCooldownMin:60
};

// ========== STATE ==========
var S={
data:{},
filteredData:{},
scanning:false,
paused:false,
activeTab:'dash',
search:'',
filter:null,
showAll:false,
rescanTimer:null,
cdInt:null,
scanHistory:[],
sfChecked:false,
sfFrom:'',
sfTo:'',
sfFromSaved:'',
sfToSaved:'',
dateStart:null,
dateEnd:null,
fmtStart:null,
fmtEnd:null,
failedAAs:[],
ctxLogin:null,
// v7.9 PRO: Alert cooldown map {login: lastAlertTimestamp}
alertCooldowns:{},
exp:{},
processOpts:[]
};

// ========== STORAGE KEYS ==========
var LS_L='idt7_logins_'+C.wh;
var LS_H='idt7_hist_'+C.wh;
var LS_C='idt7_cfg_'+C.wh;
var LS_D='idt7_data_'+C.wh;
var LS_N='idt7_notes_'+C.wh;
var LS_F='idt7_flags_'+C.wh;
var LS_FL='idt7_fans_'+C.wh;
var LS_W='idt7_weekly_'+C.wh;

// ========== LOGINS ==========
var LOGINS=[];
var FANS_SENT={};

// ========== LOAD / SAVE FUNCTIONS ==========
function saveLogins(){try{localStorage.setItem(LS_L,JSON.stringify(LOGINS));}catch(e){}}
function loadLogins(){try{var d=localStorage.getItem(LS_L);if(d)LOGINS=JSON.parse(d);}catch(e){}}

function saveCfg(){
try{
var o={parallel:C.parallel,delay:C.delay,rescanSec:C.rescanSec,sound:C.sound,popup:C.popup,
dashFrom:C.dashFrom,dashTo:C.dashTo,dashCrossMid:C.dashCrossMid,dateMode:C.dateMode,
liveAlert:C.liveAlert,shiftAlert:C.shiftAlert,cooldown:C.cooldown,fans:C.fans,
alertCooldownMin:C.alertCooldownMin};
localStorage.setItem(LS_C,JSON.stringify(o));
}catch(e){}
}
function loadCfg(){
try{
var d=localStorage.getItem(LS_C);if(!d)return;
var o=JSON.parse(d);
if(o.parallel)C.parallel=o.parallel;
if(o.delay)C.delay=o.delay;
if(o.rescanSec)C.rescanSec=o.rescanSec;
if(typeof o.sound==='boolean')C.sound=o.sound;
if(typeof o.popup==='boolean')C.popup=o.popup;
if(o.dashFrom)C.dashFrom=o.dashFrom;
if(o.dashTo)C.dashTo=o.dashTo;
if(typeof o.dashCrossMid==='boolean')C.dashCrossMid=o.dashCrossMid;
if(o.dateMode)C.dateMode=o.dateMode;
if(o.liveAlert)C.liveAlert=o.liveAlert;
if(o.shiftAlert)C.shiftAlert=o.shiftAlert;
if(o.cooldown)C.cooldown=o.cooldown;
if(o.alertCooldownMin)C.alertCooldownMin=o.alertCooldownMin;
if(o.fans){
C.fans.enabled=o.fans.enabled;
C.fans.autoLive=o.fans.autoLive;C.fans.autoLiveMin=o.fans.autoLiveMin;
C.fans.autoShift=o.fans.autoShift;C.fans.autoShiftMin=o.fans.autoShiftMin;
C.fans.cooldown=o.fans.cooldown;
if(o.fans.catMsgs)C.fans.catMsgs=o.fans.catMsgs;
}
}catch(e){}
}

function saveHistory(){try{localStorage.setItem(LS_H,JSON.stringify(S.scanHistory.slice(-50)));}catch(e){}}
function loadHistory(){try{var d=localStorage.getItem(LS_H);if(d)S.scanHistory=JSON.parse(d);}catch(e){}}

function saveAAData(){
try{
var slim={};
Object.keys(S.data).forEach(function(k){
var a=S.data[k];
slim[k]={login:a.login,name:a.name,dept:a.dept,totalIdleMin:a.totalIdleMin,
currentIdleMin:a.currentIdleMin,isIdle:a.isIdle,lastActivity:a.lastActivity,
clockStatus:a.clockStatus||'unknown',clockPeriods:a.clockPeriods||[],
segs:a.segs.slice(0,20),directSegs:(a.directSegs||[]).slice(0,20),timestamp:a.timestamp};
});
var json=JSON.stringify(slim);
if(json.length>4000000){
var keys=Object.keys(slim);
for(var i=keys.length-1;i>=0&&json.length>4000000;i--){
delete slim[keys[i]];json=JSON.stringify(slim);}
}
localStorage.setItem(LS_D,json);
}catch(e){}
}
function loadAAData(){try{var d=localStorage.getItem(LS_D);if(d)S.data=JSON.parse(d);}catch(e){}}

function saveNotes(){try{localStorage.setItem(LS_N,JSON.stringify(NOTES));}catch(e){}}
function loadNotes(){try{var d=localStorage.getItem(LS_N);if(d)NOTES=JSON.parse(d);}catch(e){}}
var NOTES={};
function getNote(l){return NOTES[l]||'';}
function setNote(l,n){if(n)NOTES[l]=n;else delete NOTES[l];saveNotes();}

function saveFlags(){try{localStorage.setItem(LS_F,JSON.stringify(FLAGS));}catch(e){}}
function loadFlags(){try{var d=localStorage.getItem(LS_F);if(d)FLAGS=JSON.parse(d);}catch(e){}}
var FLAGS={};
function getFlag(l){return FLAGS[l]||'none';}
function setFlag(l,f){if(f&&f!=='none')FLAGS[l]=f;else delete FLAGS[l];saveFlags();}

function saveFansLog(){try{localStorage.setItem(LS_FL,JSON.stringify(FANS_SENT));}catch(e){}}
function loadFansLog(){try{var d=localStorage.getItem(LS_FL);if(d)FANS_SENT=JSON.parse(d);}catch(e){}}
function getFansLog(){var all=[];Object.keys(FANS_SENT).forEach(function(k){if(FANS_SENT[k])FANS_SENT[k].forEach(function(e){all.push(e);});});return all;}

function saveWeekly(d){try{localStorage.setItem(LS_W,JSON.stringify(d));}catch(e){}}
function loadWeekly(){try{var d=localStorage.getItem(LS_W);return d?JSON.parse(d):[];}catch(e){return[];}}

function saveDailySummary(){
var today=new Date().toISOString().slice(0,10);
var w=loadWeekly();
var all=Object.values(S.data);
if(all.length===0)return;
var totalIdle=0;all.forEach(function(a){totalIdle+=a.totalIdleMin||0;});
var avg=Math.round(totalIdle/all.length);
var existing=w.filter(function(e){return e.date!==today;});
existing.push({date:today,avgIdle:avg,count:all.length,scanned:all.length});
if(existing.length>7)existing=existing.slice(-7);
saveWeekly(existing);
}

// ========== UTILITY FUNCTIONS ==========
function rm(id){var el=_d.getElementById(id);if(el)el.remove();}
function stt(msg){var el=_d.getElementById('idt-st');if(el)el.textContent=msg;}
function updBadge(){
var el=_d.getElementById('b-sn');if(el)el.textContent=LOGINS.length;
var wrap=_d.getElementById('b-saved');if(wrap)wrap.style.display=LOGINS.length>0?'flex':'none';
var clr=_d.getElementById('b-clear');if(clr)clr.style.display=LOGINS.length>0?'inline-block':'none';
}
function updFansCount(){
var cnt=getFansLog().filter(function(l){return l.time&&l.time.slice(0,10)===new Date().toISOString().slice(0,10);}).length;
var el=_d.getElementById('fans-cnt');
if(el){el.textContent=cnt>0?'\uD83D\uDCE8 '+cnt+' sent today':'';el.style.display=cnt>0?'inline':'none';}
}

// v7.9 PRO: Update live idle count in header
function updLiveCount(){
var count=0;
Object.values(S.filteredData).forEach(function(aa){
if(aa.isIdle&&aa.clockStatus==='on')count++;
});
var el=_d.getElementById('b-live-cnt');
if(el){
el.textContent='\uD83D\uDD34 '+count+' Idle';
el.style.background=count>0?'#da3633':'#21262d';
el.style.color=count>0?'#fff':'#8b949e';
}
}

function pDur(s){
if(!s)return 0;
var p=s.replace(/\s/g,'').split(':');
if(p.length===3)return parseInt(p[0]||0)*60+parseInt(p[1]||0)+parseInt(p[2]||0)/60;
if(p.length===2)return parseInt(p[0]||0)+parseInt(p[1]||0)/60;
return parseInt(s)||0;
}

function timeToMin(t){
if(!t)return 0;
var m=t.match(/(\d{2}):(\d{2}):?(\d{2})?/);
if(!m)return 0;
return parseInt(m[1])*60+parseInt(m[2]);
}

function cfgToMin(t){
if(!t)return 0;
var p=t.split(':');
return parseInt(p[0]||0)*60+parseInt(p[1]||0);
}

function buildFilteredData(){
S.filteredData={};
Object.keys(S.data).forEach(function(login){
S.filteredData[login]=S.data[login];
});
}

function calcRangeIdle(aa,fromT,toT,cross){
var fromMin=cfgToMin(fromT);
var toMin=cfgToMin(toT);
var totalIdle=0;
var matchedSegs=[];
if(!aa||!aa.segs)return{idle:0,segs:[]};

aa.segs.forEach(function(seg){
var segStart=timeToMin(seg.ss);
var segEnd=timeToMin(seg.es);
if(segEnd<=segStart)segEnd+=1440;

var wStart=fromMin;
var wEnd=toMin;
if(cross||wEnd<=wStart)wEnd+=1440;

var overlapStart=Math.max(segStart,wStart);
var overlapEnd=Math.min(segEnd,wEnd);
if(overlapStart<overlapEnd){
totalIdle+=overlapEnd-overlapStart;
matchedSegs.push(seg);
}

if(cross){
var segStart2=segStart+1440;
var segEnd2=segEnd+1440;
var overlapStart2=Math.max(segStart2,wStart);
var overlapEnd2=Math.min(segEnd2,wEnd);
if(overlapStart2<overlapEnd2){
totalIdle+=overlapEnd2-overlapStart2;
if(matchedSegs.indexOf(seg)<0)matchedSegs.push(seg);
}
}
});
return{idle:totalIdle,segs:matchedSegs};
}

function playAlert(){
if(!C.sound)return;
try{var a=new(window.AudioContext||window.webkitAudioContext)();var o=a.createOscillator();
o.type='sine';o.frequency.value=800;o.connect(a.destination);o.start();
setTimeout(function(){o.stop();},200);}catch(e){}
}

var origTitle=_d.title;
var flashInt=null;
function flashTab(){
if(flashInt)return;
var on=false;
flashInt=setInterval(function(){
_d.title=on?'\u26A0\uFE0F IDLE ALERT!':origTitle;on=!on;
},500);
}
function stopTab(){
if(flashInt){clearInterval(flashInt);flashInt=null;}_d.title=origTitle;
}

// Expose for console access
_w._IDT={C:C,S:S,LOGINS:LOGINS};


// === PART 2: ALL FANS FUNCTIONS -- Paste directly after Part 1 ===

// ========== FANS API URL ==========
var FANS_URL='https://fans-dub.amazon.com/api/message/new';

// ========== BUILD FANS MESSAGE ==========
function buildFansMsg(login,cat){
var aa=S.data[login]||S.filteredData[login]||{};
var idle=Math.round(aa.totalIdleMin||0);
var curIdle=Math.round(aa.currentIdleMin||0);
var msg=C.fans.catMsgs[cat]||C.fans.catMsgs.medium||'Please check your idle time.';
msg=msg.replace(/\{name\}/g,aa.name||login);
msg=msg.replace(/\{login\}/g,login);
msg=msg.replace(/\{totalIdle\}/g,idle);
msg=msg.replace(/\{currentIdle\}/g,curIdle);
msg=msg.replace(/\{dept\}/g,aa.dept||'');
msg=msg.replace(/\{activity\}/g,aa.lastActivity||'');
msg=msg.replace(/\{category\}/g,cat);
return msg;
}

// ========== SEND FANS (SILENT -- GM_xmlhttpRequest) ==========
function sendFANS(login,reason,silent){
if(!C.fans.enabled){
if(!silent)stt('\u26A0\uFE0F FANS disabled');
return;
}

// Check cooldown
var now=Date.now();
if(FANS_SENT[login]){
var last=FANS_SENT[login][FANS_SENT[login].length-1];
if(last&&last.ts&&(now-last.ts)<C.fans.cooldown*60000){
if(!silent)stt('\u23F3 FANS cooldown active for '+login);
return;
}
}

var aa=S.data[login]||S.filteredData[login]||{};

// Determine category
var cat='active';
var idle=aa.totalIdleMin||0;
if(idle>=30)cat='critical';
else if(idle>=15)cat='high';
else if(idle>=5)cat='medium';

var msg=buildFansMsg(login,cat);

GM_xmlhttpRequest({
method:'POST',
url:FANS_URL,
headers:{
'Content-Type':'application/json',
'Accept':'application/json'
},
data:JSON.stringify({
to:login,
directReports:'',
messageText:msg,
cannedResponses:[]
}),
withCredentials:true,
onload:function(r){
var ok=r.status>=200&&r.status<300;
if(!FANS_SENT[login])FANS_SENT[login]=[];
FANS_SENT[login].push({
time:new Date().toISOString(),
ts:now,
reason:reason||'manual',
cat:cat,
login:login,
status:ok?'sent':'failed'
});
saveFansLog();
updFansCount();
if(!silent){
if(ok){
stt('\uD83D\uDCE8 FANS sent to '+login+' ('+cat+')');
}else{
stt('\u274C FANS failed for '+login+' (status: '+r.status+')');
}
}
},
onerror:function(e){
if(!FANS_SENT[login])FANS_SENT[login]=[];
FANS_SENT[login].push({
time:new Date().toISOString(),
ts:now,
reason:reason||'manual',
cat:cat,
login:login,
status:'error'
});
saveFansLog();
if(!silent)stt('\u274C FANS network error for '+login);
}
});
}

// ========== SEND CUSTOM FANS MESSAGE ==========
function sendCustomFANS(login,customMsg){
if(!customMsg||!customMsg.trim()){
stt('\u26A0\uFE0F Please type a message');
return;
}
if(!C.fans.enabled){
stt('\u26A0\uFE0F FANS disabled');
return;
}

var now=Date.now();

GM_xmlhttpRequest({
method:'POST',
url:FANS_URL,
headers:{
'Content-Type':'application/json',
'Accept':'application/json'
},
data:JSON.stringify({
to:login,
directReports:'',
messageText:customMsg.trim(),
cannedResponses:[]
}),
withCredentials:true,
onload:function(r){
var ok=r.status>=200&&r.status<300;
if(!FANS_SENT[login])FANS_SENT[login]=[];
FANS_SENT[login].push({
time:new Date().toISOString(),
ts:now,
reason:'custom',
cat:'custom',
login:login,
status:ok?'sent':'failed'
});
saveFansLog();
updFansCount();
if(ok){
stt('\uD83D\uDCE8 Custom FANS sent to '+login);
}else{
stt('\u274C FANS failed for '+login+' (status: '+r.status+')');
}
rm('idt-cfans');
},
onerror:function(e){
stt('\u274C FANS network error for '+login);
rm('idt-cfans');
}
});
}


// ========== CUSTOM FANS POPUP ==========
function showCustomFANS(login){
rm('idt-cfans');
var aa=S.data[login]||S.filteredData[login]||{};
var idle=Math.round(aa.totalIdleMin||0);
var curIdle=Math.round(aa.currentIdleMin||0);

var cat='active';
if(idle>=30)cat='critical';
else if(idle>=15)cat='high';
else if(idle>=5)cat='medium';

var ov=_d.createElement('div');ov.id='idt-cfans';
ov.style.cssText='display:flex !important;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);z-index:999999;justify-content:center;align-items:center;';

var md='<div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:24px;width:460px;max-height:85vh;overflow:auto;box-shadow:0 16px 48px rgba(0,0,0,0.5)">';

// Header
md+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">';
md+='<span style="font-size:15px;font-weight:700;color:#58a6ff">\uD83D\uDCE8 Custom FANS Message</span>';
md+='<span id="cfans-x" style="cursor:pointer;color:#8b949e;font-size:20px">\u2715</span></div>';

// AA Info bar
md+='<div style="margin-bottom:12px;padding:8px 12px;background:#0d1117;border:1px solid #21262d;border-radius:8px;font-size:11px;color:#8b949e">';
md+='<span style="color:#58a6ff;font-weight:600">'+login+'</span>';
md+=' \u2014 '+(aa.name||'Unknown');
md+=' | Shift Idle: <span style="color:#ef4444;font-weight:600">'+idle+'m</span>';
md+=' | Current: <span style="color:#f59e0b;font-weight:600">'+curIdle+'m</span>';
md+='</div>';

// Quick templates
md+='<div style="margin-bottom:6px;font-size:10px;color:#8b949e;font-weight:600">Quick Templates:</div>';
md+='<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px">';
md+='<button class="cfans-tpl" data-tpl="active" style="padding:4px 10px;border:1px solid #238636;border-radius:6px;background:#0d1117;color:#3fb950;cursor:pointer;font-size:10px">\uD83D\uDFE2 Active</button>';
md+='<button class="cfans-tpl" data-tpl="medium" style="padding:4px 10px;border:1px solid #1f6feb;border-radius:6px;background:#0d1117;color:#58a6ff;cursor:pointer;font-size:10px">\uD83D\uDD35 Medium</button>';
md+='<button class="cfans-tpl" data-tpl="high" style="padding:4px 10px;border:1px solid #d29922;border-radius:6px;background:#0d1117;color:#f59e0b;cursor:pointer;font-size:10px">\uD83D\uDFE1 High</button>';
md+='<button class="cfans-tpl" data-tpl="critical" style="padding:4px 10px;border:1px solid #da3633;border-radius:6px;background:#0d1117;color:#ef4444;cursor:pointer;font-size:10px">\uD83D\uDD34 Critical</button>';
md+='</div>';

// Message textarea
md+='<textarea id="cfans-msg" placeholder="Type your custom message here..." style="width:100%;height:120px;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:8px;padding:12px;font-family:monospace;font-size:12px;resize:vertical"></textarea>';

// Buttons
md+='<div style="margin-top:12px;display:flex;gap:8px">';
md+='<button id="cfans-send" style="flex:1;padding:10px;background:#238636;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">\uD83D\uDCE8 Send Message</button>';
md+='<button id="cfans-cancel" style="padding:10px 16px;background:#21262d;color:#c9d1d9;border:1px solid #30363d;border-radius:8px;cursor:pointer">\u2715 Cancel</button>';
md+='</div>';
md+='</div>';

ov.innerHTML=md;
var root=_d.getElementById('idt');
if(root)root.appendChild(ov);else _d.body.appendChild(ov);

// Close handlers
_d.getElementById('cfans-x').addEventListener('click',function(){rm('idt-cfans');});
_d.getElementById('cfans-cancel').addEventListener('click',function(){rm('idt-cfans');});
ov.addEventListener('click',function(e){if(e.target===ov)rm('idt-cfans');});

// Template buttons
ov.querySelectorAll('.cfans-tpl').forEach(function(btn){
btn.addEventListener('click',function(){
var tpl=btn.getAttribute('data-tpl');
var tmsg=buildFansMsg(login,tpl);
_d.getElementById('cfans-msg').value=tmsg;
});
});

// Send button
_d.getElementById('cfans-send').addEventListener('click',function(){
var customMsg=_d.getElementById('cfans-msg').value;
sendCustomFANS(login,customMsg);
});
}

// ========== BULK FANS ==========
function bulkFANS(category){
var targets=[];
var minIdle=0,maxIdle=99999;
if(category==='medium'){minIdle=5;maxIdle=15;}
if(category==='high'){minIdle=15;maxIdle=30;}
if(category==='critical'){minIdle=30;maxIdle=99999;}

Object.keys(S.filteredData).forEach(function(login){
var aa=S.filteredData[login];
if(aa.totalIdleMin>=minIdle&&aa.totalIdleMin<maxIdle){
if(aa.clockStatus==='off'||aa.clockStatus==='break')return;
targets.push(login);
}
});

if(targets.length===0){stt('No AAs in '+category+' category');return;}
if(!confirm('Send FANS to '+targets.length+' AAs in "'+category+'" category?'))return;

var sent=0;
targets.forEach(function(login,i){
setTimeout(function(){
sendFANS(login,'bulk-'+category,true);
sent++;
stt('\uD83D\uDCE8 Bulk FANS: '+sent+'/'+targets.length);
},i*1500);
});
}

// ========== AUTO FANS CHECK ==========
function checkAutoFANS(){
if(!C.fans.enabled)return;

Object.keys(S.filteredData).forEach(function(login){
var aa=S.filteredData[login];
if(aa.clockStatus==='off'||aa.clockStatus==='break')return;

// Auto live idle FANS
if(C.fans.autoLive&&aa.isIdle&&aa.currentIdleMin>=C.fans.autoLiveMin){
sendFANS(login,'auto-live',true);
}

// Auto shift idle FANS
if(C.fans.autoShift&&aa.totalIdleMin>=C.fans.autoShiftMin){
sendFANS(login,'auto-shift',true);
}
});
}
// === END PART 2 -- paste Part 3 directly below ===


// === PART 3: PARSE AA (CLOCK DETECTION) + FETCH (ISO DATES) + SCAN — Paste directly after Part 2 ===

// ========== PARSE CLOCK PERIODS ==========
function parseClockPeriods(doc){
var periods=[];
var allRows=doc.querySelectorAll('tr');
for(var i=0;i<allRows.length;i++){
var tds=allRows[i].querySelectorAll('td');
if(tds.length<4)continue;
var first=tds[0].textContent.trim();
if(first==='OnClock/Paid'||first==='OffClock/UnPaid'){
var ss=tds[1].textContent.trim();
var es=tds[2].textContent.trim();
var dur=pDur(tds[3].textContent.trim());
periods.push({status:first,ss:ss,es:es,dur:dur});
}
if(tds[0].getAttribute('colspan')==='2'){
var txt=tds[0].textContent.trim();
if(txt==='OnClock/Paid'||txt==='OffClock/UnPaid'){
if(tds.length>=4){
var ss2=tds[1].textContent.trim();
var es2=tds[2].textContent.trim();
var dur2=pDur(tds[3].textContent.trim());
periods.push({status:txt,ss:ss2,es:es2,dur:dur2});
}
}
}
}
return periods;
}

// ========== DETECT CURRENT CLOCK STATUS ==========
function detectClockStatus(clockPeriods){
if(!clockPeriods||clockPeriods.length===0)return'unknown';

var now=new Date();
var nowMin=now.getHours()*60+now.getMinutes();

var last=clockPeriods[clockPeriods.length-1];
var lastEndMin=timeToMin(last.es);

if(last.status==='OnClock/Paid'){
return'on';
}else{
var hasOnClockBefore=false;
for(var i=0;i<clockPeriods.length;i++){
if(clockPeriods[i].status==='OnClock/Paid'){
var endMin=timeToMin(clockPeriods[i].es);
if(endMin<=timeToMin(last.ss)||endMin>timeToMin(last.ss)+1440-10)hasOnClockBefore=true;
}
}
if(hasOnClockBefore&&last.dur<=90){
return'break';
}
return'off';
}
}

// ========== CHECK IF TIME IS IN ON-CLOCK PERIOD ==========
function isOnClock(clockPeriods,timeMin){
if(!clockPeriods||clockPeriods.length===0)return true;
for(var i=0;i<clockPeriods.length;i++){
if(clockPeriods[i].status!=='OnClock/Paid')continue;
var ss=timeToMin(clockPeriods[i].ss);
var es=timeToMin(clockPeriods[i].es);
if(es<ss)es+=1440;
var checkMin=timeMin;
if(checkMin<ss)checkMin+=1440;
if(checkMin>=ss&&checkMin<=es)return true;
}
return false;
}

// ========== FILTER IDLE SEGS TO ON-CLOCK ONLY ==========
function filterIdleOnClock(segs,clockPeriods){
if(!clockPeriods||clockPeriods.length===0)return segs;
var filtered=[];
for(var i=0;i<segs.length;i++){
var segMid=timeToMin(segs[i].ss);
if(isOnClock(clockPeriods,segMid)){
filtered.push(segs[i]);
}
}
return filtered;
}

// ========== PARSE AA ==========
function parseAA(login,html){
if(!html)return null;
var doc=new DOMParser().parseFromString(html,'text/html');

// Parse name and FCLM idle total
var title=doc.querySelector('td.title');
var name='',idleTotal=0;
if(title){
var tt=title.textContent.trim();
var nm=tt.match(/^([^(]+)\(/);if(nm)name=nm[1].trim();
var im=tt.match(/\((\d+)m\)/);if(im)idleTotal=parseInt(im[1]);
}

// Parse department
var dept='';
var deptRows=doc.querySelectorAll('tr');
for(var d=0;d<deptRows.length;d++){
var dTds=deptRows[d].querySelectorAll('td');
for(var dt=0;dt<dTds.length;dt++){
var dtxt=dTds[dt].textContent.trim();
if(dtxt==='Department:'){
if(dTds[dt+1])dept=dTds[dt+1].textContent.trim();
break;}}}

// Parse clock periods
var clockPeriods=parseClockPeriods(doc);
var clockStatus=detectClockStatus(clockPeriods);

// Parse indirect segments (idle time)
var segs=[];
var indirects=doc.querySelectorAll('tr.function-seg.indirect');
for(var i=0;i<indirects.length;i++){
var cells=indirects[i].querySelectorAll('td');
if(cells.length>=4){
var tl=cells[0].textContent.trim();
var ss=cells[1].textContent.trim();
var es=cells[2].textContent.trim();
var dur=pDur(cells[3].textContent.trim());
segs.push({title:tl,ss:ss,es:es,dur:dur,ongoing:false});
}}

// Parse direct segments (working time)
var directSegs=[];
var directs=doc.querySelectorAll('tr.function-seg.direct');
for(var j=0;j<directs.length;j++){
var dc=directs[j].querySelectorAll('td');
if(dc.length>=4){
var dtl=dc[0].textContent.trim();
var dss=dc[1].textContent.trim();
var des=dc[2].textContent.trim();
var ddur=pDur(dc[3].textContent.trim());
directSegs.push({title:dtl,ss:dss,es:des,dur:ddur});
}}

// Filter idle segments: only count idle during OnClock/Paid periods
var onClockSegs=filterIdleOnClock(segs,clockPeriods);

// Detect current idle status
var lastActivity='';
var currentIdleMin=0;
var isIdle=false;

if(clockStatus==='on'){
if(directSegs.length>0){
var lastDirect=directSegs[directSegs.length-1];
lastActivity=lastDirect.title;
var lastEnd=lastDirect.es;
var lastEndMin=timeToMin(lastEnd);
var now2=new Date();
var nowMin2=now2.getHours()*60+now2.getMinutes();
var gap=nowMin2-lastEndMin;
if(gap<0)gap+=1440;
if(gap>3&&gap<480){isIdle=true;currentIdleMin=gap;}
}
}else{
isIdle=false;
currentIdleMin=0;
if(directSegs.length>0){
lastActivity=directSegs[directSegs.length-1].title;
}
}

// Calculate total idle from on-clock segments only
var totalIdleMin=0;
onClockSegs.forEach(function(s){totalIdleMin+=s.dur;});
if(idleTotal>totalIdleMin)totalIdleMin=idleTotal;

// Build result object
var aa={
login:login,name:name,dept:dept,
segs:onClockSegs,
allSegs:segs,
directSegs:directSegs,
clockPeriods:clockPeriods,
clockStatus:clockStatus,
totalIdleMin:totalIdleMin,
currentIdleMin:currentIdleMin,
isIdle:isIdle,
lastActivity:lastActivity,
timestamp:new Date().toISOString()
};

// FIX: if last direct seg has no end time, AA is actively working (NOT idle)
if(directSegs.length>0){
var _lastD=directSegs[directSegs.length-1];
if(!_lastD.es||_lastD.es.trim()===''){
aa.isIdle=false;
aa.currentIdleMin=0;
}
}

// ===== TOT FIX: Parse employee numeric ID =====

// ===== TOT FIX: Get employee ID and process list =====
var totDoc=new DOMParser().parseFromString(html,'text/html');
var eidEl=totDoc.getElementsByName('employeeId').item(0);
aa.eid=eidEl?eidEl.value:'';
if(!S.processOpts){S.processOpts=[];}
if(S.processOpts.length<1){
var pSel=totDoc.getElementById('newLaborProcessId');
if(pSel){
var pOpts=pSel.getElementsByTagName('option');
for(var pi=0;pi<pOpts.length;pi++){
var pO=pOpts.item(pi);
if(pO.value){S.processOpts.push({v:pO.value,l:pO.textContent.trim()});}
}
}
}


return aa;
}


// ===== TOT FIX: Fetch labor functions for process =====
function fetchLaborFuncs(processId,cb){
var url='/rest/api/jedi/v1/getAllNonDirectLaborFunctionsForLaborProcessId';
url+='?warehouseId='+C.wh+'&processId='+encodeURIComponent(processId);
fetch(url,{credentials:'include'}).then(function(r){
return r.text();
}).then(function(txt){
try{
var d=JSON.parse(txt);
var funcs=d.laborFunctions||d.result||[];
cb(funcs);
}catch(e){cb([]);}
}).catch(function(){cb([]);});
}

// ===== TOT FIX: Submit one segment fix =====

// ========== FETCH AA (ISO DATE FORMAT — FCLM NATIVE) ==========
function fetchAA(login){
var url='https://fclm-portal.amazon.com/employee/timeDetails?warehouseId='+C.wh+'&employeeId='+encodeURIComponent(login);

// Priority 1: Strong Finish historical check — read sf-date from DOM
var sfDate=_d.getElementById('sf-date');
if(S.sfChecked&&sfDate&&sfDate.value){
var sv=sfDate.value;
var d2=new Date(sv+'T00:00:00');
d2.setDate(d2.getDate()+1);
var nd=d2.toISOString().slice(0,10);
url+='&startTime='+encodeURIComponent(sv+'T00:00:00+0300');
url+='&endTime='+encodeURIComponent(nd+'T23:59:59+0300');
}
// Priority 2: Custom date picker (Dashboard)
else{
var dtMode=_d.getElementById('dt-mode');
if(dtMode&&dtMode.value==='custom'){
var sd=_d.getElementById('dt-sd').value;
var sh=_d.getElementById('dt-sh').value||'0';
var sm=_d.getElementById('dt-sm').value||'0';
var ed=_d.getElementById('dt-ed').value;
var eh=_d.getElementById('dt-eh').value||'0';
var em=_d.getElementById('dt-em').value||'0';
if(sd&&ed){
var sHH=sh;if(sHH.length<2)sHH='0'+sHH;
var sMM=sm;if(sMM.length<2)sMM='0'+sMM;
var eHH=eh;if(eHH.length<2)eHH='0'+eHH;
var eMM=em;if(eMM.length<2)eMM='0'+eMM;
url+='&startTime='+encodeURIComponent(sd+'T'+sHH+':'+sMM+':00+0300');
url+='&endTime='+encodeURIComponent(ed+'T'+eHH+':'+eMM+':00+0300');
}
}
}

return fetch(url,{credentials:'include'}).then(function(r){
if(!r.ok)return null;return r.text();
}).then(function(html){
if(!html)return null;return parseAA(login,html);
}).catch(function(e){return null;});
}

// ========== IMPORT MODAL ==========
function importMdl(){
rm('idt-imp');
var ov=_d.createElement('div');ov.id='idt-imp';ov.className='ovl';
ov.style.cssText='display:flex !important;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:999999;justify-content:center;align-items:center;';
var md='<div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:24px;width:500px;max-height:80vh;overflow:auto">';
md+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">';
md+='<span style="font-size:16px;font-weight:700;color:#58a6ff">\uD83D\uDCCB Import AA Logins</span>';
md+='<span id="imp-x" style="cursor:pointer;color:#8b949e;font-size:20px">\u2715</span></div>';
md+='<textarea id="imp-ta" placeholder="Paste logins here, one per line or comma separated..." style="width:100%;height:200px;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:8px;padding:12px;font-family:monospace;font-size:12px;resize:vertical"></textarea>';
md+='<div style="margin-top:12px;display:flex;gap:8px">';
md+='<button id="imp-add" style="flex:1;padding:10px;background:#238636;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">\u2795 Add to List</button>';
md+='<button id="imp-rep" style="flex:1;padding:10px;background:#1f6feb;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">\uD83D\uDD04 Replace List</button>';
md+='</div>';
md+='<div style="margin-top:8px;font-size:11px;color:#8b949e">Current: '+LOGINS.length+' logins | Max: 400</div>';
md+='</div>';
ov.innerHTML=md;

var root=_d.getElementById('idt');
if(root)root.appendChild(ov);else _d.body.appendChild(ov);

_d.getElementById('imp-x').addEventListener('click',function(){rm('idt-imp');});
ov.addEventListener('click',function(e){if(e.target===ov)rm('idt-imp');});

_d.getElementById('imp-add').addEventListener('click',function(){
var raw=_d.getElementById('imp-ta').value;
var arr=raw.split(/[\n,;\s]+/).map(function(s){return s.trim();}).filter(function(s){return s.length>0;});
var added=0;
arr.forEach(function(l){if(LOGINS.indexOf(l)<0&&LOGINS.length<400){LOGINS.push(l);added++;}});
saveLogins();updBadge();rm('idt-imp');
stt('\u2795 Added '+added+' logins (total: '+LOGINS.length+')');});

_d.getElementById('imp-rep').addEventListener('click',function(){
var raw=_d.getElementById('imp-ta').value;
var arr=raw.split(/[\n,;\s]+/).map(function(s){return s.trim();}).filter(function(s){return s.length>0;});
LOGINS.length=0;
arr.forEach(function(l){if(LOGINS.indexOf(l)<0&&LOGINS.length<400)LOGINS.push(l);});
saveLogins();updBadge();S.data={};saveAAData();rm('idt-imp');
stt('\uD83D\uDD04 Replaced with '+LOGINS.length+' logins');});
}

// ========== SMART PRIORITY SCAN ==========
function scan(){
if(S.scanning)return Promise.resolve();
S.scanning=true;S.failedAAs=[];
var total=LOGINS.length;if(total===0){S.scanning=false;stt('No logins');return Promise.resolve();}
stt('\u23F3 Scanning '+total+' AAs...');
var pf=_d.getElementById('idt-pf');
if(pf)pf.style.width='0%';

var done=0,success=0,fail=0;

function processBatch(list,batchSize){
if(list.length===0)return Promise.resolve();
var batch=list.splice(0,batchSize);
var promises=batch.map(function(login){
return fetchAA(login).then(function(result){
done++;
if(result){
S.data[login]=result;success++;
}else{fail++;S.failedAAs.push(login);}
if(pf)pf.style.width=Math.round(done/total*100)+'%';
stt('\u23F3 '+done+'/'+total+' ('+success+'\u2705 '+fail+'\u274C)');
});
});
return Promise.all(promises).then(function(){
return new Promise(function(resolve){
setTimeout(function(){resolve(processBatch(list,batchSize));},C.delay);
});
});
}

// Priority sort: previously idle AAs first
var sorted=LOGINS.slice();
sorted.sort(function(a,b){
var aa=S.data[a],bb=S.data[b];
var aIdle=aa?aa.totalIdleMin||0:0;
var bIdle=bb?bb.totalIdleMin||0:0;
return bIdle-aIdle;
});

return processBatch(sorted,C.parallel).then(function(){
S.scanning=false;
if(S.paused){saveAAData();buildFilteredData();drawDash();return;}
saveAAData();buildFilteredData();
checkAutoFANS();
saveDailySummary();

S.scanHistory.push({time:new Date().toISOString(),count:total,success:success,fail:fail});
if(S.scanHistory.length>50)S.scanHistory=S.scanHistory.slice(-50);
saveHistory();

stt('\u2705 Done: '+success+'/'+total+' AAs'+(fail>0?' ('+fail+' failed)':''));

if(S.activeTab==='dash')drawDash();
if(S.activeTab==='sf')drawSF();
if(S.activeTab==='lb')drawLeaderboard();
if(S.activeTab==='dept')drawDept();

checkAlerts();

if(!S.paused&&C.rescanSec>0){
if(S.rescanTimer)clearTimeout(S.rescanTimer);
var cd=C.rescanSec;
if(S.cdInt)clearInterval(S.cdInt);
S.cdInt=setInterval(function(){
cd--;var el=_d.getElementById('idt-cd');
if(el)el.textContent='\u23F1 '+cd+'s';
if(cd<=0){clearInterval(S.cdInt);}
},1000);
S.rescanTimer=setTimeout(function(){
if(!S.paused)scan();
},C.rescanSec*1000);
}
});
}

// ========== ALERTS CHECK ==========
function checkAlerts(){
var liveAlerts=[],shiftAlerts=[];
Object.keys(S.filteredData).forEach(function(login){
var aa=S.filteredData[login];
if(aa.clockStatus==='off'||aa.clockStatus==='break')return;
if(C.liveAlert.enabled&&aa.currentIdleMin>=C.liveAlert.min){
liveAlerts.push(aa);}
if(C.shiftAlert.enabled&&aa.totalIdleMin>=C.shiftAlert.min){
shiftAlerts.push(aa);}
});
if(liveAlerts.length>0){playAlert();flashTab();alertPopLive(liveAlerts);}
else if(shiftAlerts.length>0){playAlert();flashTab();alertPop(shiftAlerts);}
}
// === END PART 3 ===

// ===== TOT FIX: SOFT_MAP + submitOneTot =====
var SOFT_MAP={"RSVDC":{"pn":"Receive Dock","pv":"1003010","fn":"Inbound Dock Clerk","fv":"4300006683"},"RSVTDR":{"pn":"Receive Dock","pv":"1003010","fn":"Receive Dock TDR","fv":"1597872921763"},"RSVLD":{"pn":"Receive Dock","pv":"1003010","fn":"Receive Line Loader","fv":"4300006786"},"RSVSCH":{"pn":"Receive Dock","pv":"1003010","fn":"Receive Dock Crew","fv":"4300006784"},"RSVULD":{"pn":"Receive Dock","pv":"1003010","fn":"ReceiveLine Unloader","fv":"4300006788"},"RSVCRW":{"pn":"Receive Dock","pv":"1003010","fn":"Receive Dock Crew","fv":"4300006784"},"PARSRT":{"pn":"Receive Dock","pv":"1003010","fn":"Parcel Sort","fv":"4300016803"},"CASEWATER":{"pn":"Receive-Support","pv":"1003033","fn":"Case Rcv WaterSpider","fv":"4300034942"},"WATER":{"pn":"Receive-Support","pv":"1003033","fn":"Rcv WaterSpider","fv":"4300008689"},"RCVACTR":{"pn":"Receive-Support","pv":"1003033","fn":"General Audits","fv":"4300035049"},"PRECLP":{"pn":"Prep Recorder","pv":"1003002","fn":"Prep Support","fv":"4300000201"},"IXDUPS":{"pn":"Prep Recorder","pv":"1003002","fn":"Prep Support","fv":"4300000201"},"DCSUP":{"pn":"Prep Recorder","pv":"1003002","fn":"Prep Support","fv":"4300000201"},"CRNSTO":{"pn":"Stow to Prime Spt","pv":"1003017","fn":"Cart Handler Stow","fv":"4300008576"},"BSCSTO":{"pn":"Stow to Prime Spt","pv":"1003017","fn":"Bin Scout Stow","fv":"4300008575"},"STWTP":{"pn":"Stow to Prime Spt","pv":"1003017","fn":"Stow to Prime Trans","fv":"4300006829"},"STOWACTR":{"pn":"Stow to Prime Spt","pv":"1003017","fn":"Stow Accel Coaching","fv":"4300032953"},"RPEPR":{"pn":"RSR Support","pv":"1003012","fn":"Empty Pallet Removal","fv":"4300006664"},"BINCON":{"pn":"RSR Support","pv":"1003012","fn":"RSR 5S","fv":"4300006791"},"RSR5S":{"pn":"RSR Support","pv":"1003012","fn":"RSR 5S","fv":"4300006791"},"CRDRML":{"pn":"RSR Support","pv":"1003012","fn":"Cardboard Removal","fv":"4300006880"},"RSLR":{"pn":"Inbound Lead/PA","pv":"1002982","fn":"Receive Lead/PA","fv":"4300006785"},"SLSP":{"pn":"Inbound Lead/PA","pv":"1002982","fn":"Stow to Prime LeadPA","fv":"4300006827"},"LPREP":{"pn":"Inbound Lead/PA","pv":"1002982","fn":"Prep Lead/PA","fv":"4300006745"},"LDOCK":{"pn":"Inbound Lead/PA","pv":"1002982","fn":"Dock Lead/PA","fv":"4300006657"},"LRSR":{"pn":"Inbound Lead/PA","pv":"1002982","fn":"RSR Lead/PA","fv":"4300006793"},"PSIFRPS":{"pn":"IB Problem Solve","pv":"1002980","fn":"ISS Field Rep","fv":"4300006685"},"ISSPSHAZ":{"pn":"IB Problem Solve","pv":"1002980","fn":"ISS Psolve & Hazmat","fv":"1600788125021"},"OPSREGP":{"pn":"IB Problem Solve","pv":"1002980","fn":"Receive ProblemSolve","fv":"4300006787"},"PSRPS":{"pn":"IB Problem Solve","pv":"1002980","fn":"RSR Problem Solve","fv":"4300006794"},"ISSBIN":{"pn":"IB Problem Solve","pv":"1002980","fn":"ISS Bin Chk Non-WAVE","fv":"1600788465868"},"LPSWEEP":{"pn":"IB Problem Solve","pv":"1002980","fn":"IB Sweeper","fv":"4300006681"},"RECON":{"pn":"IB Problem Solve","pv":"1002980","fn":"Reconcile PeerTrn","fv":"1661960405024"},"IBPS":{"pn":"IB Problem Solve","pv":"1002980","fn":"Receive ProblemSolve","fv":"4300006787"},"PREPPS":{"pn":"IB Problem Solve","pv":"1002980","fn":"Prep Problem Solve","fv":"4300006747"},"PIKREP":{"pn":"Pick Support","pv":"1003049","fn":"Tote Replenishment","fv":"4300000171"},"PIKTP":{"pn":"Pick Support","pv":"1003049","fn":"Pick Transport","fv":"4300006742"},"PIKACTR":{"pn":"Pick Support","pv":"1003049","fn":"Pick Accel Coaching","fv":"4300032951"},"PGPICK":{"pn":"Pick Support","pv":"1003049","fn":"Process Guide Pick","fv":"4300008660"},"SRTWS":{"pn":"Sort Support","pv":"1003050","fn":"Water Spider","fv":"4300006861"},"PRGSORT":{"pn":"Sort Support","pv":"1003050","fn":"Process Guide Sort","fv":"4300010623"},"SSTH":{"pn":"Sort Support","pv":"1003050","fn":"Tote handling","fv":"4300000349"},"PACKWS":{"pn":"Pack Support","pv":"1002994","fn":"Water Spider","fv":"4300006861"},"PRGMULTI":{"pn":"Pack Support","pv":"1002994","fn":"Process Guide PackMu","fv":"4300010621"},"PRGSING":{"pn":"Pack Support","pv":"1002994","fn":"Process Guide PackSi","fv":"4300010622"},"PLPACK":{"pn":"Outbound Lead/PA","pv":"1002987","fn":"Pack Lead/PA","fv":"4300006709"},"LWFLOW":{"pn":"Outbound Lead/PA","pv":"1002987","fn":"Workflow Management","fv":"4300016853"},"LPICK":{"pn":"Outbound Lead/PA","pv":"1002987","fn":"Pick Lead/PA","fv":"4300006737"},"SLPS":{"pn":"Outbound Lead/PA","pv":"1002987","fn":"Sort Lead/PA","fv":"4300006817"},"PSPPS":{"pn":"OB Problem Solve","pv":"1002985","fn":"Pack Problem Solve","fv":"4300006716"},"PPRS":{"pn":"OB Problem Solve","pv":"1002985","fn":"Pick Problem Solve","fv":"4300006738"},"REBPS":{"pn":"OB Problem Solve","pv":"1002985","fn":"Sort Problem Solve","fv":"4300006820"},"OBIOL":{"pn":"OB Problem Solve","pv":"1002985","fn":"IOL","fv":"4300035068"},"SPSOLVE":{"pn":"OB Problem Solve","pv":"1002985","fn":"Ship Problem Solve","fv":"4300006807"},"ICQAPS":{"pn":"IC-QA-CS","pv":"1003030","fn":"Problem Solving","fv":"4300000345"},"ICQALQA":{"pn":"IC-QA-CS","pv":"1003030","fn":"Lead/PA - QA","fv":"4300002298"},"ICQADMP":{"pn":"IC-QA-CS","pv":"1003030","fn":"Damage Processing","fv":"4300000682"},"CDC":{"pn":"IC-QA-CS","pv":"1003030","fn":"CentDefectCtrl","fv":"4300008708"},"ICQAAM":{"pn":"IC-QA-CS","pv":"1003030","fn":"Amnesty","fv":"4300002411"},"QARSH":{"pn":"IC-QA-CS","pv":"1003030","fn":"Research","fv":"4300002534"},"CUSS":{"pn":"IC-QA-CS","pv":"1003030","fn":"Customer Service","fv":"4300000121"},"ICQA5S":{"pn":"IC-QA-CS","pv":"1003030","fn":"ICQA 5S","fv":"4300006875"},"ICQAQA":{"pn":"IC-QA-CS","pv":"1003030","fn":"Audits","fv":"4300002532"},"PLTBLD":{"pn":"Transfer In Support","pv":"1003020","fn":"Cart/Pallet Builder","fv":"4300006639"},"CRNTRA":{"pn":"Transfer In Support","pv":"1003020","fn":"Cart Handler Trans","fv":"4300008573"},"PRGTRA":{"pn":"Transfer In Support","pv":"1003020","fn":"Process Guide Trans","fv":"4300008571"},"TRFOCR":{"pn":"Transfer Out Dock","pv":"1003022","fn":"TransferOut DockCrew","fv":"4300006848"},"SHPCL":{"pn":"Transfer Out Dock","pv":"1003022","fn":"Ship Clerk","fv":"4300000289"},"TOWTSP":{"pn":"Transfer Out","pv":"1003021","fn":"Water Spider","fv":"4300006861"},"OVRFLW":{"pn":"Transfer Out","pv":"1003021","fn":"Trans Out Overflow","fv":"1540335754674"},"TOTOL":{"pn":"Transfer Out Lead/PA","pv":"1003023","fn":"Transfer Out Lead/PA","fv":"4300006843"},"TROQA":{"pn":"Trans Out Prob Solve","pv":"1003018","fn":"TransferOut PSolve","fv":"4300006849"},"VRSORT":{"pn":"V-Returns Support","pv":"1003059","fn":"V-Ret Sort Support","fv":"1648137751400"},"PRGVRET":{"pn":"V-Returns Support","pv":"1003059","fn":"Process Guide V-Ret","fv":"4300016760"},"LVRET":{"pn":"V-Returns Support","pv":"1003059","fn":"V-Returns Lead/PA","fv":"4300006858"},"TRVPS":{"pn":"V-Returns Support","pv":"1003059","fn":"V-Returns Prob Solve","fv":"4300006859"},"VRTRP":{"pn":"V-Returns Support","pv":"1003059","fn":"VRET Cart Handler","fv":"1632517294590"},"VRETRET":{"pn":"V-Returns Support","pv":"1003059","fn":"VR Return Returns","fv":"4300014740"},"CRDSCAN":{"pn":"C-Returns Support","pv":"1003058","fn":"C-Return Dock Scan","fv":"4300018930"},"CRUNLD":{"pn":"C-Returns Support","pv":"1003058","fn":"Unloader","fv":"4300000075"},"OTRTP":{"pn":"C-Returns Support","pv":"1003058","fn":"Transport","fv":"4300000225"},"CRAUDIT":{"pn":"C-Returns Support","pv":"1003058","fn":"C-Return Audit","fv":"4300018934"},"REBTRN3":{"pn":"C-Returns Support","pv":"1003058","fn":"C-Returns Prob Solve","fv":"4300006654"},"STWSWP":{"pn":"C-Returns Support","pv":"1003058","fn":"C-Returns_StowSweep","fv":"1599235343587"},"LRTN":{"pn":"C-Returns Support","pv":"1003058","fn":"C-Returns Lead/PA","fv":"4300006653"},"NSCRTP":{"pn":"C-Returns Support","pv":"1003058","fn":"NS CRet Transport","fv":"4300008600"},"CRETREF":{"pn":"C-Returns Support","pv":"1003058","fn":"C-Returns_EndofLine","fv":"1599235147315"},"CRSDCNT":{"pn":"C-Returns Support","pv":"1003058","fn":"C-Returns Ambassador","fv":"4300006651"}};

function buildProcessOpts(){
var seen={};
var opts='<option value="">-- Select Process --</option>';
var keys=Object.keys(SOFT_MAP);
for(var i=0;i<keys.length;i++){
var entry=SOFT_MAP[keys[i]];
if(!seen[entry.pv]){
seen[entry.pv]=true;
opts+='<option value="'+entry.pv+'">'+entry.pn+'</option>';
}
}
return opts;
}
// Auto-populate S.processOpts from SOFT_MAP
(function(){
var seen={};
Object.keys(SOFT_MAP).forEach(function(k){
var e=SOFT_MAP[k];
if(!seen[e.pv]){seen[e.pv]=true;S.processOpts.push({v:e.pv,l:e.pn});}
});
})();

function buildFuncOpts(processId){
var opts='<option value="">-- Select Function --</option>';
var keys=Object.keys(SOFT_MAP);
for(var i=0;i<keys.length;i++){
var entry=SOFT_MAP[keys[i]];
if(entry.pv===processId){
opts+='<option value="'+entry.fv+'">'+entry.fn+'</option>';
}
}
return opts;
}

// ===== END TOT FIX FUNCTIONS =====


function segTimeToISO(segTime){
if(!segTime)return '';
var slash=segTime.indexOf('/');
var dash=segTime.indexOf('-');
var mo=segTime.substring(0,slash);
var dy=segTime.substring(slash+1,dash);
var timePart=segTime.substring(dash+1);
var yr=new Date().getFullYear();
var moStr=mo.length<2?'0'+mo:mo;
var dyStr=dy.length<2?'0'+dy:dy;
return yr+'-'+moStr+'-'+dyStr+'T'+timePart+'.000+0300';
}

function submitOneTot(login,seg,processId,functionId){
var enc=encodeURIComponent;
var aa=S.data[login]||{};
var numId=aa&&aa.eid?aa.eid:'';
var now=new Date();
var y=now.getFullYear();
var mo=String(now.getMonth()+1).padStart(2,'0');
var da=String(now.getDate()).padStart(2,'0');
var dateStr=y+'/'+mo+'/'+da;
var tomorrow=new Date(now.getTime()+86400000);
var y2=tomorrow.getFullYear();
var mo2=String(tomorrow.getMonth()+1).padStart(2,'0');
var da2=String(tomorrow.getDate()).padStart(2,'0');
var endDateStr=y2+'/'+mo2+'/'+da2;
var startISO=segTimeToISO(seg.ss);
var endISO=segTimeToISO(seg.es);
var body='startDate='+enc(dateStr);
body+='&startHour=00&startMinute=00';
body+='&endDate='+enc(endDateStr);
body+='&endHour=00&endMinute=00';
body+='&employeeId='+enc(numId);
body+='&warehouseId='+enc(C.wh);
body+='&laborFuncStartTime='+enc(startISO);
body+='&laborFuncEndTime='+enc(endISO);
body+='&newLaborProcessId='+enc(processId);
body+='&newLaborFunctionId='+enc(functionId);
return fetch('/employee/timeDetails?warehouseId='+enc(C.wh)+'&employeeId='+enc(login),{
method:'POST',
headers:{'Content-Type':'application/x-www-form-urlencoded'},
credentials:'include',
body:body
});
}


// === PART 4: CSS STYLES — Paste directly after Part 3 ===

// ========== ADD STYLES ==========
function addStyles(){
var s=_d.createElement('style');
s.textContent='\
#idt{position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:#0d1117;color:#c9d1d9;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;font-size:12px;overflow:auto;display:flex;flex-direction:column;}\
#idt *{box-sizing:border-box;}\
#idt .hdr{background:linear-gradient(135deg,#161b22,#0d1117);border-bottom:1px solid #21262d;padding:10px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-height:50px;}\
#idt .hdr .logo{font-size:16px;font-weight:800;color:#58a6ff;white-space:nowrap;}\
#idt .hdr .logo small{font-size:9px;color:#484f58;font-weight:400;margin-left:6px;}\
#idt .hdr .built{font-size:9px;color:#8b949e;}\
#idt .toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}\
#idt .btn{padding:6px 12px;border:1px solid #30363d;border-radius:6px;background:#21262d;color:#c9d1d9;cursor:pointer;font-size:11px;font-weight:600;transition:all 0.2s;white-space:nowrap;}\
#idt .btn:hover{background:#30363d;border-color:#484f58;}\
#idt .btn-go{background:#238636;color:#fff;border-color:#238636;}\
#idt .btn-go:hover{background:#2ea043;}\
#idt .btn-stop{background:#da3633;color:#fff;border-color:#da3633;}\
#idt .btn-stop:hover{background:#f85149;}\
#idt .btn-imp{background:#1f6feb;color:#fff;border-color:#1f6feb;}\
#idt .btn-imp:hover{background:#388bfd;}\
#idt .btn-live{padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid #da3633;background:#21262d;color:#da3633;transition:all 0.2s;}\
#idt .btn-live.active{background:#da3633;color:#fff;animation:pulse 2s infinite;}\
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.6;}}\
#idt .tabs{display:flex;gap:2px;background:#161b22;border-bottom:1px solid #21262d;padding:0 16px;overflow-x:auto;}\
#idt .tabs .tab{padding:8px 14px;cursor:pointer;color:#8b949e;font-size:11px;font-weight:600;border-bottom:2px solid transparent;transition:all 0.2s;white-space:nowrap;}\
#idt .tabs .tab:hover{color:#c9d1d9;}\
#idt .tabs .tab.active{color:#58a6ff;border-bottom-color:#58a6ff;}\
#idt .tab-pan{display:none;flex:1;overflow:auto;padding:16px;}\
#idt .tab-pan.active{display:block;}\
#idt .shift-bar{background:#161b22;border-bottom:1px solid #21262d;padding:8px 16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;}\
#idt .shift-bar label{color:#8b949e;font-weight:600;}\
#idt .shift-bar select,#idt .shift-bar input{padding:4px 8px;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;font-size:11px;}\
#idt .date-bar{background:#0d1117;border-bottom:1px solid #21262d;padding:8px 16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;}\
#idt .date-bar label{color:#8b949e;font-weight:600;}\
#idt .date-bar input,#idt .date-bar select{padding:4px 8px;background:#161b22;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;font-size:11px;}\
#idt .stats{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;}\
#idt .stat{background:#161b22;border:1px solid #21262d;border-radius:8px;padding:10px 14px;min-width:100px;text-align:center;}\
#idt .stat .val{font-size:20px;font-weight:800;}\
#idt .stat .lbl{font-size:9px;color:#8b949e;margin-top:2px;}\
#idt .buckets{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;}\
#idt .bk{padding:6px 12px;border-radius:20px;cursor:pointer;font-size:10px;font-weight:700;border:1px solid #30363d;background:#161b22;color:#c9d1d9;transition:all 0.2s;}\
#idt .bk:hover,#idt .bk.active{background:#30363d;border-color:#58a6ff;color:#58a6ff;}\
#idt .search-bar{margin-bottom:12px;display:flex;gap:8px;align-items:center;}\
#idt .search-bar input{flex:1;padding:8px 12px;background:#161b22;border:1px solid #30363d;border-radius:6px;color:#c9d1d9;font-size:12px;}\
#idt .dt{width:100%;border-collapse:collapse;}\
#idt .dt th{position:sticky;top:0;background:#161b22;color:#8b949e;font-weight:700;text-align:left;padding:8px 10px;border-bottom:2px solid #21262d;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;cursor:pointer;white-space:nowrap;}\
#idt .dt th:hover{color:#58a6ff;}\
#idt .dt td{padding:6px 10px;border-bottom:1px solid #161b22;font-size:11px;white-space:nowrap;}\
#idt .dt tr:hover{background:#161b22;}\
#idt .dt tr.idle{background:rgba(218,54,51,0.08);}\
#idt .offclock{opacity:0.5;}\
#idt .xr td{background:#0a0c10;padding:12px 20px!important;}\
#idt .xt{display:inline-block;margin:2px;padding:3px 8px;border-radius:4px;font-size:10px;}\
#idt tr[data-l]{cursor:pointer;}\
#idt tr[data-l]:hover{background:#161b22;}\
#idt .idle-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;}\
#idt .idle-ok{background:#0d1117;color:#3fb950;border:1px solid #238636;}\
#idt .idle-med{background:#0d1117;color:#58a6ff;border:1px solid #1f6feb;}\
#idt .idle-high{background:#0d1117;color:#f59e0b;border:1px solid #d29922;}\
#idt .idle-crit{background:rgba(218,54,51,0.15);color:#ef4444;border:1px solid #da3633;}\
#idt .clock-on{color:#3fb950;}\
#idt .clock-break{color:#f59e0b;}\
#idt .clock-off{color:#8b949e;}\
#idt .fans-btn{padding:2px 6px;border-radius:4px;border:1px solid #30363d;background:#0d1117;color:#58a6ff;cursor:pointer;font-size:10px;transition:all 0.2s;}\
#idt .fans-btn:hover{background:#1f6feb;color:#fff;border-color:#1f6feb;}\
#idt .ctx-menu{position:fixed;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:4px 0;z-index:9999999;min-width:180px;box-shadow:0 8px 24px rgba(0,0,0,0.4);}\
#idt .ctx-menu .ctx-item{padding:8px 14px;cursor:pointer;font-size:11px;color:#c9d1d9;display:flex;align-items:center;gap:8px;}\
#idt .ctx-menu .ctx-item:hover{background:#21262d;}\
#idt .ctx-menu .ctx-sep{height:1px;background:#21262d;margin:4px 0;}\
#idt .ovl{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:999999;justify-content:center;align-items:center;}\
#idt .alert-pop{position:fixed;top:20px;right:20px;background:#161b22;border:2px solid #da3633;border-radius:12px;padding:16px;min-width:320px;max-width:400px;z-index:9999999;box-shadow:0 8px 32px rgba(218,54,51,0.3);animation:slideIn 0.3s ease;}\
@keyframes slideIn{from{transform:translateX(100px);opacity:0;}to{transform:translateX(0);opacity:1;}}\
#idt .sf-card{background:#161b22;border:1px solid #21262d;border-radius:8px;padding:12px;margin-bottom:8px;}\
#idt .sf-header{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center;}\
#idt .sf-header input,#idt .sf-header select{padding:4px 8px;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;font-size:11px;}\
#idt .settings-card{background:#161b22;border:1px solid #21262d;border-radius:8px;padding:16px;margin-bottom:12px;}\
#idt .settings-card h3{font-size:13px;color:#58a6ff;margin:0 0 10px;font-weight:700;}\
#idt .settings-card label{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:11px;color:#c9d1d9;}\
#idt .settings-card input[type=number],#idt .settings-card input[type=text],#idt .settings-card textarea{padding:6px 10px;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;font-size:11px;width:100%;}\
#idt .settings-card textarea{height:60px;font-family:monospace;resize:vertical;}\
#idt .status-bar{background:#161b22;border-top:1px solid #21262d;padding:6px 16px;font-size:10px;color:#484f58;display:flex;justify-content:space-between;align-items:center;}\
#idt .pf-wrap{width:100%;height:3px;background:#21262d;border-radius:2px;overflow:hidden;}\
#idt .pf-bar{height:100%;background:linear-gradient(90deg,#238636,#58a6ff);border-radius:2px;transition:width 0.3s;width:0%;}\
';
_d.head.appendChild(s);
var s2=_d.createElement('style');
s2.textContent='#idt .detail-row{display:none}#idt .detail-row.open{display:table-row}#idt .detail-row td{padding:8px 16px;font-size:10px;color:#8b949e;background:#0d1117}#idt tr[data-login]{cursor:pointer}#idt tr[data-login]:hover{background:#161b22}#idt .seg-tbl{width:100%;border-collapse:collapse;font-size:10px;margin:6px 0}#idt .seg-tbl th{text-align:left;padding:4px 6px;color:#8b949e;border-bottom:1px solid #21262d;font-size:9px;text-transform:uppercase}#idt .seg-tbl td{padding:4px 6px;border-bottom:1px solid #161b22;color:#c9d1d9}#idt .tot-bar{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:8px;margin-top:8px}#idt .tot-tbl{width:100%;border-collapse:collapse;font-size:10px;margin:6px 0}#idt .tot-tbl th{text-align:left;padding:4px 6px;color:#8b949e;border-bottom:1px solid #21262d}#idt .tot-tbl td{padding:4px 6px;color:#c9d1d9;border-bottom:1px solid #161b22}#idt .tot-proc{background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;padding:4px;font-size:10px}#idt .tot-func{background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;padding:4px;font-size:10px}#idt .tot-fix{background:#238636;color:#fff;border:none;border-radius:4px;padding:5px 12px;font-size:10px;font-weight:600;cursor:pointer}#idt .tot-fix:hover{background:#2ea043}#idt .tot-fix:disabled{opacity:0.5;cursor:not-allowed}#idt .seg-status{font-size:10px;margin-left:6px}';

_d.head.appendChild(s2);
}

// === END PART 4 — paste Part 5 directly below ===


// === PART 5: BUILD UI — Paste directly after Part 4 ===

// ========== BUILD UI ==========
function buildUI(){
var mc=_d.getElementById('main-content');
if(mc)mc.style.display='none';

var root=_d.createElement('div');root.id='idt';

// ===== HEADER =====
var h='<div class="hdr">';
h+='<span class="logo">\uD83D\uDCCA FCLM Idle Tracker <small>v7.9 PRO \u2014 '+C.wh+'</small></span>';
h+='<span class="built">Built by mualyanm (Alyan Mujtaba Abbasi)</span>';
h+='<div class="toolbar">';
h+='<span id="b-saved" style="display:none;align-items:center;gap:4px;font-size:10px;color:#8b949e;background:#21262d;padding:3px 8px;border-radius:10px">\uD83D\uDC65 <span id="b-sn">0</span> saved</span>';
h+='<button class="btn btn-imp" id="b-import">\uD83D\uDCCB Import</button>';
h+='<button class="btn" id="b-clear" style="display:none">\uD83D\uDDD1 Clear</button>';
h+='<button class="btn btn-go" id="b-scan">\u25B6 Scan</button>';
h+='<button class="btn btn-stop" id="b-pause" style="display:none">\u23F8 Pause</button>';
h+='<span id="idt-cd" style="font-size:10px;color:#484f58"></span>';
h+='<button class="btn-live" id="b-live-cnt">\uD83D\uDD34 0 Idle</button>';
h+='<button class="btn" id="b-bulk-fix" style="background:#6e40c9;border-color:#6e40c9;color:#fff">\uD83D\uDD27 Bulk Fix</button>';
h+='<span id="fans-cnt" style="display:none;font-size:10px;color:#58a6ff"></span>';
h+='</div>';
h+='<div id="idt-st" style="font-size:10px;color:#8b949e;margin-left:auto"></div>';
h+='</div>';

// ===== DATE BAR =====
h+='<div class="date-bar">';
h+='<label>\uD83D\uDCC5 Date:</label>';
h+='<select id="dt-mode" style="padding:4px 8px">';
h+='<option value="today">Today (Live)</option>';
h+='<option value="custom">Custom Date</option>';
h+='</select>';
h+='<span id="dt-custom" style="display:none">';
h+='<label>From:</label>';
h+='<input type="date" id="dt-sd" style="width:130px">';
h+='<input type="number" id="dt-sh" min="0" max="23" placeholder="HH" style="width:50px" value="17">';
h+='<span style="color:#484f58">:</span>';
h+='<input type="number" id="dt-sm" min="0" max="59" placeholder="MM" style="width:50px" value="45">';
h+='<label style="margin-left:8px">To:</label>';
h+='<input type="date" id="dt-ed" style="width:130px">';
h+='<input type="number" id="dt-eh" min="0" max="23" placeholder="HH" style="width:50px" value="4">';
h+='<span style="color:#484f58">:</span>';
h+='<input type="number" id="dt-em" min="0" max="59" placeholder="MM" style="width:50px" value="15">';
h+='<button class="btn btn-go" id="dt-apply" style="margin-left:8px">\uD83D\uDCC5 Apply & Scan</button>';
h+='</span>';
h+='</div>';

// ===== PROGRESS BAR =====
h+='<div class="pf-wrap"><div class="pf-bar" id="idt-pf"></div></div>';

// ===== TABS =====
h+='<div class="tabs">';
h+='<div class="tab active" data-tab="dash">\uD83D\uDCCA Dashboard</div>';
h+='<div class="tab" data-tab="sf">\uD83C\uDFC6 Strong Finish</div>';
h+='<div class="tab" data-tab="lb">\uD83C\uDFC5 Leaderboard</div>';
h+='<div class="tab" data-tab="dept">\uD83C\uDFE2 Department</div>';
h+='<div class="tab" data-tab="hm">\uD83D\uDFE5 Heatmap</div>';
h+='<div class="tab" data-tab="trend">\uD83D\uDCC8 Trends</div>';
h+='<div class="tab" data-tab="rpt">\uD83D\uDCCB Report</div>';
h+='<div class="tab" data-tab="cfg">\u2699\uFE0F Settings</div>';
h+='</div>';

// ===== TAB PANELS =====

// --- Dashboard ---
h+='<div class="tab-pan active" id="pan-dash"></div>';

// --- Strong Finish ---
h+='<div class="tab-pan" id="pan-sf">';
h+='<div class="sf-header">';
h+='<label style="color:#8b949e;font-weight:600">\uD83D\uDCC5 Date:</label>';
h+='<input type="date" id="sf-date" style="width:130px">';
h+='<label style="color:#8b949e;font-weight:600;margin-left:8px">From:</label>';
h+='<input type="number" id="sf-fh" min="0" max="23" placeholder="HH" style="width:50px">';
h+='<span style="color:#484f58">:</span>';
h+='<input type="number" id="sf-fm" min="0" max="59" placeholder="MM" style="width:50px">';
h+='<label style="color:#8b949e;font-weight:600;margin-left:8px">To:</label>';
h+='<input type="number" id="sf-th" min="0" max="23" placeholder="HH" style="width:50px">';
h+='<span style="color:#484f58">:</span>';
h+='<input type="number" id="sf-tm" min="0" max="59" placeholder="MM" style="width:50px">';
h+='<button class="btn btn-go" id="sf-check">\u2705 Check</button>';
h+='<button class="btn" id="sf-bulk-fans">\uD83D\uDCE8 Bulk FANS</button>';
h+='</div>';
h+='<div id="sf-body"></div>';
h+='</div>';

// --- Leaderboard ---
h+='<div class="tab-pan" id="pan-lb"></div>';

// --- Department ---
h+='<div class="tab-pan" id="pan-dept"></div>';

// --- Heatmap ---
h+='<div class="tab-pan" id="pan-hm"></div>';

// --- Trends ---
h+='<div class="tab-pan" id="pan-trend"></div>';

// --- Report ---
h+='<div class="tab-pan" id="pan-rpt"></div>';

// --- Settings ---
h+='<div class="tab-pan" id="pan-cfg">';

// Scan Settings
h+='<div class="settings-card"><h3>\u2699\uFE0F Scan Settings</h3>';
h+='<label>Parallel requests: <input type="number" id="cfg-par" value="'+C.parallel+'" min="1" max="30" style="width:60px"></label>';
h+='<label>Delay between batches (ms): <input type="number" id="cfg-del" value="'+C.delay+'" min="100" max="5000" style="width:80px"></label>';
h+='<label>Auto rescan (seconds): <input type="number" id="cfg-res" value="'+C.rescanSec+'" min="0" max="600" style="width:80px"></label>';
h+='<label>Cooldown per AA alert (min): <input type="number" id="cfg-cooldown" value="'+C.alertCooldownMin+'" min="1" max="120" style="width:80px"></label>';
h+='</div>';

// Alert Settings
h+='<div class="settings-card"><h3>\uD83D\uDD14 Alert Settings</h3>';
h+='<label><input type="checkbox" id="cfg-snd" '+(C.sound?'checked':'')+'> Sound alerts</label>';
h+='<label><input type="checkbox" id="cfg-pop" '+(C.popup?'checked':'')+'> Popup alerts</label>';
h+='<label><input type="checkbox" id="cfg-la" '+(C.liveAlert.enabled?'checked':'')+'> Live idle alert when AA idle >=</label>';
h+='<label><input type="number" id="cfg-lam" value="'+C.liveAlert.min+'" min="1" max="60" style="width:60px"> minutes</label>';
h+='<label><input type="checkbox" id="cfg-sa" '+(C.shiftAlert.enabled?'checked':'')+'> Shift idle alert when AA idle >=</label>';
h+='<label><input type="number" id="cfg-sam" value="'+C.shiftAlert.min+'" min="1" max="120" style="width:60px"> minutes</label>';
h+='</div>';

// FANS Settings
h+='<div class="settings-card"><h3>\uD83D\uDCE8 FANS Settings</h3>';
h+='<label><input type="checkbox" id="cfg-fans" '+(C.fans.enabled?'checked':'')+'> Enable FANS messaging</label>';
h+='<label>FANS cooldown (min): <input type="number" id="cfg-fc" value="'+C.fans.cooldown+'" min="1" max="120" style="width:60px"></label>';
h+='<label><input type="checkbox" id="cfg-fal" '+(C.fans.autoLive?'checked':'')+'> Auto FANS on live idle >= <input type="number" id="cfg-falm" value="'+C.fans.autoLiveMin+'" min="1" max="60" style="width:50px"> min</label>';
h+='<label><input type="checkbox" id="cfg-fas" '+(C.fans.autoShift?'checked':'')+'> Auto FANS on shift idle >= <input type="number" id="cfg-fasm" value="'+C.fans.autoShiftMin+'" min="1" max="120" style="width:50px"> min</label>';
h+='</div>';

// FANS Category Messages
h+='<div class="settings-card"><h3>\uD83D\uDCDD Category Messages</h3>';
h+='<div style="font-size:9px;color:#484f58;margin-bottom:8px">Variables: {name} {login} {totalIdle} {currentIdle} {dept} {activity} {category}</div>';
h+='<label>\uD83D\uDFE2 Active:</label><textarea id="cfg-msg-active">'+C.fans.catMsgs.active+'</textarea>';
h+='<label>\uD83D\uDD35 Medium (5-15m):</label><textarea id="cfg-msg-medium">'+C.fans.catMsgs.medium+'</textarea>';
h+='<label>\uD83D\uDFE1 High (15-30m):</label><textarea id="cfg-msg-high">'+C.fans.catMsgs.high+'</textarea>';
h+='<label>\uD83D\uDD34 Critical (30m+):</label><textarea id="cfg-msg-critical">'+C.fans.catMsgs.critical+'</textarea>';
h+='</div>';

// Save & Reset buttons
h+='<div style="display:flex;gap:8px">';
h+='<button class="btn btn-go" id="cfg-save">\uD83D\uDCBE Save Settings</button>';
h+='<button class="btn btn-stop" id="cfg-reset">\uD83D\uDDD1 Reset All Data</button>';
h+='</div>';

h+='</div>';

// ===== BULK FIX POPUP =====
h+='<div class="ovl" id="bulkfix-ovl" style="display:none">';
h+='<div style="background:#161b22;border:1px solid #30363d;border-radius:12px;padding:24px;width:520px;max-height:85vh;overflow:auto;box-shadow:0 16px 48px rgba(0,0,0,0.5)">';
h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">';
h+='<span style="font-size:15px;font-weight:700;color:#6e40c9">\uD83D\uDD27 Bulk Fix Idle Segments</span>';
h+='<span id="bf-close" style="cursor:pointer;color:#8b949e;font-size:20px">\u2715</span></div>';

h+='<div style="font-size:10px;color:#8b949e;margin-bottom:12px">Fixes idle segments within a time range for ALL scanned AAs</div>';

// Time range inputs
h+='<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">';
h+='<label style="color:#8b949e;font-size:11px;font-weight:600">From:</label>';
h+='<input type="number" id="bf-fh" min="0" max="23" placeholder="HH" style="width:50px;padding:4px;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;font-size:11px" value="17">';
h+='<span style="color:#484f58">:</span>';
h+='<input type="number" id="bf-fm" min="0" max="59" placeholder="MM" style="width:50px;padding:4px;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;font-size:11px" value="45">';
h+='<label style="color:#8b949e;font-size:11px;font-weight:600;margin-left:8px">To:</label>';
h+='<input type="number" id="bf-th" min="0" max="23" placeholder="HH" style="width:50px;padding:4px;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;font-size:11px" value="4">';
h+='<span style="color:#484f58">:</span>';
h+='<input type="number" id="bf-tm" min="0" max="59" placeholder="MM" style="width:50px;padding:4px;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;font-size:11px" value="15">';
h+='<input type="number" id="bf-min" min="1" max="999" placeholder="Min dur" style="width:60px;padding:4px;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;font-size:11px" value="5">';
h+='<span style="color:#484f58;font-size:10px">min dur</span>';
h+='</div>';

// Process and Function dropdowns
h+='<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">';
h+='<select id="bf-process" style="flex:1;padding:6px;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;font-size:11px">';
h+=buildProcessOpts();
h+='</select>';
h+='<select id="bf-function" style="flex:1;padding:6px;background:#0d1117;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;font-size:11px">';
h+='<option value="">-- Select Function --</option>';
h+='</select>';
h+='</div>';

// Buttons
h+='<div style="display:flex;gap:8px;margin-bottom:12px">';
h+='<button id="bf-preview" class="btn" style="flex:1">\uD83D\uDD0D Preview</button>';
h+='<button id="bf-go" class="btn btn-go" style="flex:1">\uD83D\uDD27 Fix All</button>';
h+='<button id="bf-cancel" class="btn" style="flex:1">\u2715 Cancel</button>';
h+='</div>';

// Preview area
h+='<div id="bf-result" style="max-height:300px;overflow:auto;font-size:10px"></div>';

h+='</div></div>';



// ===== STATUS BAR =====
h+='<div class="status-bar">';
h+='<span>FCLM Idle Tracker v7.9 PRO \u2014 '+C.wh+' \u2014 Built by mualyanm</span>';
h+='<span id="idt-clock"></span>';
h+='</div>';

root.innerHTML=h;
_d.body.appendChild(root);

// Start clock
setInterval(function(){
var el=_d.getElementById('idt-clock');
if(el)el.textContent=new Date().toLocaleTimeString('en-US',{hour12:true});
},1000);
}
// === END PART 5 — paste Part 6 directly below ===


// === PART 6: EVENTS + KEYBOARD — Paste directly after Part 5 ===

// ========== BIND EVENTS ==========
function bindEvents(){

// --- Tab switching ---
_d.querySelectorAll('#idt .tab').forEach(function(tab){
tab.addEventListener('click',function(){
var id=tab.getAttribute('data-tab');
_d.querySelectorAll('#idt .tab').forEach(function(t){t.classList.remove('active');});
tab.classList.add('active');
_d.querySelectorAll('#idt .tab-pan').forEach(function(p){p.classList.remove('active');});
var pan=_d.getElementById('pan-'+id);
if(pan)pan.classList.add('active');
S.activeTab=id;
if(id==='dash')drawDash();
if(id==='sf')drawSF();
if(id==='lb')drawLeaderboard();
if(id==='dept')drawDept();
if(id==='hm')drawHeatmap();
if(id==='trend')drawTrends();
if(id==='rpt')drawReport();
});
});

// --- Import button ---
var impBtn=_d.getElementById('b-import');
if(impBtn)impBtn.addEventListener('click',function(){importMdl();});

// --- Clear button ---
var clrBtn=_d.getElementById('b-clear');
if(clrBtn)clrBtn.addEventListener('click',function(){
if(!confirm('Clear all '+LOGINS.length+' logins and scanned data?'))return;
LOGINS.length=0;saveLogins();
S.data={};S.filteredData={};saveAAData();
updBadge();drawDash();
stt('\uD83D\uDDD1 All data cleared');
});

// --- Scan button ---
// --- Scan button (Scan / Stop / Resume) ---
var scanBtn=_d.getElementById('b-scan');
var scanCycle=false;
if(scanBtn)scanBtn.addEventListener('click',function(){
if(!scanCycle){
scanCycle=true;
S.paused=false;
S.sfChecked=false;
scanBtn.textContent='\u23F9 Stop';
scan();
}else{
scanCycle=false;
S.paused=true;
if(S.cdInt){clearInterval(S.cdInt);S.cdInt=0;}
var cdEl=_d.getElementById('idt-cd');
if(cdEl)cdEl.textContent='';
scanBtn.textContent='\u25B6 Resume';
stt('\u23F9 Stopped - data preserved');
}
});

// --- Pause button ---
var pauseBtn=_d.getElementById('b-pause');
if(pauseBtn)pauseBtn.addEventListener('click',function(){
S.paused=!S.paused;
pauseBtn.textContent=S.paused?'\u25B6 Resume':'\u23F8 Pause';
if(S.paused){
if(S.rescanTimer)clearTimeout(S.rescanTimer);
if(S.cdInt)clearInterval(S.cdInt);
stt('\u23F8 Paused');
}else{
stt('\u25B6 Resumed');scan();
}
});

// --- Live Idle button ---
var liveBtn=_d.getElementById('b-live-cnt');
if(liveBtn)liveBtn.addEventListener('click',function(){showLiveIdlePopup();});

// --- Date mode toggle ---
var dtMode=_d.getElementById('dt-mode');
if(dtMode)dtMode.addEventListener('change',function(){
var custom=_d.getElementById('dt-custom');
if(custom)custom.style.display=dtMode.value==='custom'?'inline':'none';
});

// --- Apply & Scan date ---
var dtApply=_d.getElementById('dt-apply');
if(dtApply)dtApply.addEventListener('click',function(){
S.sfChecked=false;
scan();
});

// --- Strong Finish Check ---
var sfCheck=_d.getElementById('sf-check');
if(sfCheck)sfCheck.addEventListener('click',function(){
var fh=_d.getElementById('sf-fh').value||'0';
var fm=_d.getElementById('sf-fm').value||'0';
var th=_d.getElementById('sf-th').value||'0';
var tm=_d.getElementById('sf-tm').value||'0';
if(fh.length<2)fh='0'+fh;
if(fm.length<2)fm='0'+fm;
if(th.length<2)th='0'+th;
if(tm.length<2)tm='0'+tm;
S.sfFrom=fh+':'+fm;
S.sfTo=th+':'+tm;
S.sfChecked=true;

// Check if we need historical data
var sfDate=_d.getElementById('sf-date').value;
if(sfDate){
// Need to rescan with this date
stt('\u23F3 Fetching historical data for '+sfDate+'...');
scan().then(function(){
S.sfChecked=true;
drawSF();
});
}else{
drawSF();
}
});

// --- SF Bulk FANS ---
var sfBulk=_d.getElementById('sf-bulk-fans');
if(sfBulk)sfBulk.addEventListener('click',function(){
if(!S.sfChecked){stt('\u26A0\uFE0F Run SF Check first');return;}
var targets=[];
var data=S.filteredData;
Object.keys(data).forEach(function(login){
var aa=data[login];
if(aa.clockStatus==='off'||aa.clockStatus==='break')return;
var ri=calcRangeIdle(aa,S.sfFrom,S.sfTo,true);
if(ri.idle>=5)targets.push(login);
});
if(targets.length===0){stt('No AAs with idle in SF range');return;}
if(!confirm('Send FANS to '+targets.length+' AAs with idle in Strong Finish range?'))return;
var sent=0;
targets.forEach(function(login,i){
setTimeout(function(){
sendFANS(login,'sf-bulk',true);
sent++;stt('\uD83D\uDCE8 SF FANS: '+sent+'/'+targets.length);
},i*1500);
});
});

// --- Settings Save ---
var cfgSave=_d.getElementById('cfg-save');
if(cfgSave)cfgSave.addEventListener('click',function(){
C.parallel=parseInt(_d.getElementById('cfg-par').value)||15;
C.delay=parseInt(_d.getElementById('cfg-del').value)||300;
C.rescanSec=parseInt(_d.getElementById('cfg-res').value)||60;
C.alertCooldownMin=parseInt(_d.getElementById('cfg-cooldown').value)||60;
C.sound=_d.getElementById('cfg-snd').checked;
C.popup=_d.getElementById('cfg-pop').checked;
C.liveAlert.enabled=_d.getElementById('cfg-la').checked;
C.liveAlert.min=parseInt(_d.getElementById('cfg-lam').value)||5;
C.shiftAlert.enabled=_d.getElementById('cfg-sa').checked;
C.shiftAlert.min=parseInt(_d.getElementById('cfg-sam').value)||30;
C.fans.enabled=_d.getElementById('cfg-fans').checked;
C.fans.cooldown=parseInt(_d.getElementById('cfg-fc').value)||15;
C.fans.autoLive=_d.getElementById('cfg-fal').checked;
C.fans.autoLiveMin=parseInt(_d.getElementById('cfg-falm').value)||5;
C.fans.autoShift=_d.getElementById('cfg-fas').checked;
C.fans.autoShiftMin=parseInt(_d.getElementById('cfg-fasm').value)||30;
C.fans.catMsgs.active=_d.getElementById('cfg-msg-active').value;
C.fans.catMsgs.medium=_d.getElementById('cfg-msg-medium').value;
C.fans.catMsgs.high=_d.getElementById('cfg-msg-high').value;
C.fans.catMsgs.critical=_d.getElementById('cfg-msg-critical').value;
saveCfg();
stt('\uD83D\uDCBE Settings saved!');
});

// --- Settings Reset ---
var cfgReset=_d.getElementById('cfg-reset');
if(cfgReset)cfgReset.addEventListener('click',function(){
if(!confirm('Reset ALL data? This will clear logins, scan data, notes, flags, and FANS history.'))return;
localStorage.removeItem(LS_L);localStorage.removeItem(LS_H);
localStorage.removeItem(LS_C);localStorage.removeItem(LS_D);
localStorage.removeItem(LS_N);localStorage.removeItem(LS_F);
localStorage.removeItem(LS_FL);localStorage.removeItem(LS_W);
LOGINS.length=0;S.data={};S.filteredData={};
NOTES={};FLAGS={};FANS_SENT={};
stt('\uD83D\uDDD1 All data reset');
location.reload();
});


// ===== BULK FIX EVENTS =====
_d.addEventListener('click',function(e){
var bfBtn=e.target.closest('#b-bulk-fix');
if(bfBtn){_d.getElementById('bulkfix-ovl').style.display='flex';}
});
var bfClose=_d.getElementById('bf-close');
if(bfClose)bfClose.addEventListener('click',function(){_d.getElementById('bulkfix-ovl').style.display='none';});
var bfCancelBtn=_d.getElementById('bf-cancel');
if(bfCancelBtn)bfCancelBtn.addEventListener('click',function(){_d.getElementById('bulkfix-ovl').style.display='none';});

// Process change populates Function from SOFT_MAP
var bfProcSel=_d.getElementById('bf-process');
if(bfProcSel)bfProcSel.addEventListener('change',function(){
var funcSel=_d.getElementById('bf-function');
if(!funcSel)return;
var pid=bfProcSel.value;
if(!pid){funcSel.innerHTML='<option value="">-- Select Function --</option>';return;}
funcSel.innerHTML=buildFuncOpts(pid);
});

// Preview button
var bfPreview=_d.getElementById('bf-preview');
if(bfPreview)bfPreview.addEventListener('click',function(){
var fh=_d.getElementById('bf-fh').value||'0';
var fm=_d.getElementById('bf-fm').value||'0';
var th=_d.getElementById('bf-th').value||'0';
var tm=_d.getElementById('bf-tm').value||'0';
var minDur=parseInt(_d.getElementById('bf-min').value)||5;
if(fh.length<2)fh='0'+fh;if(fm.length<2)fm='0'+fm;
if(th.length<2)th='0'+th;if(tm.length<2)tm='0'+tm;
var fromT=fh+':'+fm;
var toT=th+':'+tm;
var fromMin=cfgToMin(fromT);
var toMin=cfgToMin(toT);
var cross=toMin<=fromMin;
if(cross)toMin+=1440;

var matches=[];
Object.keys(S.data).forEach(function(login){
var aa=S.data[login];
if(!aa||!aa.eid)return;
var segs=aa.allSegs||aa.segs||[];
segs.forEach(function(sg){
if((sg.dur||0)<minDur)return;
var ss=timeToMin(sg.ss);
if(ss<fromMin&&cross)ss+=1440;
if(ss>=fromMin&&ss<toMin){
matches.push({login:login,eid:aa.eid,seg:sg});
}
});
});

var res=_d.getElementById('bf-result');
if(!res)return;
if(matches.length===0){res.innerHTML='<div style="color:#f59e0b;padding:12px">No segments found in '+fromT+' to '+toT+' with min '+minDur+'m</div>';return;}
var rh='<div style="color:#3fb950;font-weight:700;margin-bottom:8px">Found '+matches.length+' segments from '+fromT+' to '+toT+'</div>';
rh+='<table class="seg-tbl"><thead><tr><th>Login</th><th>Activity</th><th>Start</th><th>End</th><th>Dur</th></tr></thead><tbody>';
matches.forEach(function(m){
var sc=m.seg.dur>=15?'#ef4444':(m.seg.dur>=10?'#f59e0b':'#58a6ff');
rh+='<tr><td style="color:#58a6ff">'+m.login+'</td><td>'+m.seg.title+'</td><td>'+m.seg.ss+'</td><td>'+m.seg.es+'</td><td style="color:'+sc+';font-weight:700">'+m.seg.dur+'m</td></tr>';
});
rh+='</tbody></table>';
res.innerHTML=rh;
});

// Fix All button
var bfGo=_d.getElementById('bf-go');
if(bfGo)bfGo.addEventListener('click',function(){
var procVal=_d.getElementById('bf-process').value;
var funcVal=_d.getElementById('bf-function').value;
if(!procVal||!funcVal){stt('Select Process and Function first');return;}

var fh=_d.getElementById('bf-fh').value||'0';
var fm=_d.getElementById('bf-fm').value||'0';
var th=_d.getElementById('bf-th').value||'0';
var tm=_d.getElementById('bf-tm').value||'0';
var minDur=parseInt(_d.getElementById('bf-min').value)||5;
if(fh.length<2)fh='0'+fh;if(fm.length<2)fm='0'+fm;
if(th.length<2)th='0'+th;if(tm.length<2)tm='0'+tm;
var fromT=fh+':'+fm;
var toT=th+':'+tm;
var fromMin=cfgToMin(fromT);
var toMin=cfgToMin(toT);
var cross=toMin<=fromMin;
if(cross)toMin+=1440;

var matches=[];
Object.keys(S.data).forEach(function(login){
var aa=S.data[login];
if(!aa||!aa.eid)return;
var segs=aa.allSegs||aa.segs||[];
segs.forEach(function(sg){
if((sg.dur||0)<minDur)return;
var ss=timeToMin(sg.ss);
if(ss<fromMin&&cross)ss+=1440;
if(ss>=fromMin&&ss<toMin){
matches.push({login:login,eid:aa.eid,seg:sg});
}
});
});

if(matches.length===0){stt('No segments found');return;}
if(!confirm('Fix '+matches.length+' idle segments?'))return;

var res=_d.getElementById('bf-result');
var done=0;var failed=0;var total=matches.length;
bfGo.disabled=true;bfGo.textContent='Fixing...';

matches.forEach(function(m,i){
setTimeout(function(){
submitOneTot(m.login,m.seg,procVal,funcVal)
.then(function(r){
done++;
if(!r||!r.ok)failed++;
if(res)res.innerHTML='<div style="color:#58a6ff">Progress: '+done+'/'+total+(failed>0?' ('+failed+' failed)':'')+'</div>';
if(done>=total){
bfGo.disabled=false;bfGo.textContent='\uD83D\uDD27 Fix All';
stt('Bulk Fix complete: '+done+'/'+total+(failed>0?' ('+failed+' failed)':''));
}
})
.catch(function(){
done++;failed++;
if(res)res.innerHTML='<div style="color:#58a6ff">Progress: '+done+'/'+total+' ('+failed+' failed)</div>';
if(done>=total){
bfGo.disabled=false;bfGo.textContent='\uD83D\uDD27 Fix All';
stt('Bulk Fix complete: '+done+'/'+total+' ('+failed+' failed)');
}
});
},i*800);
});
});



// ========== KEYBOARD SHORTCUTS ==========
_d.addEventListener('keydown',function(e){
if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT')return;

if(e.key==='s'||e.key==='S'){e.preventDefault();scan();}
if(e.key==='p'||e.key==='P'){e.preventDefault();
S.paused=!S.paused;
var pb=_d.getElementById('b-pause');
if(pb)pb.textContent=S.paused?'\u25B6 Resume':'\u23F8 Pause';
if(S.paused){if(S.rescanTimer)clearTimeout(S.rescanTimer);if(S.cdInt)clearInterval(S.cdInt);stt('\u23F8 Paused');}
else{stt('\u25B6 Resumed');scan();}
}
if(e.key==='i'||e.key==='I'){e.preventDefault();importMdl();}
if(e.key==='1'){var t=_d.querySelector('[data-tab="dash"]');if(t)t.click();}
if(e.key==='2'){var t2=_d.querySelector('[data-tab="sf"]');if(t2)t2.click();}
if(e.key==='3'){var t3=_d.querySelector('[data-tab="lb"]');if(t3)t3.click();}
if(e.key==='4'){var t4=_d.querySelector('[data-tab="dept"]');if(t4)t4.click();}
if(e.key==='5'){var t5=_d.querySelector('[data-tab="hm"]');if(t5)t5.click();}
if(e.key==='6'){var t6=_d.querySelector('[data-tab="trend"]');if(t6)t6.click();}
if(e.key==='7'){var t7=_d.querySelector('[data-tab="rpt"]');if(t7)t7.click();}
if(e.key==='8'){var t8=_d.querySelector('[data-tab="cfg"]');if(t8)t8.click();}
if(e.key==='Escape'){stopTab();rm('idt-ctx');rm('idt-cfans');rm('idt-imp');rm('idt-alert');rm('idt-lalert');}
});
}

// ========== LIVE IDLE POPUP ==========
function showLiveIdlePopup(){
rm('idt-lalert');
var list=[];
Object.keys(S.filteredData).forEach(function(login){
var aa=S.filteredData[login];
if(aa.isIdle&&aa.clockStatus==='on'){
list.push(aa);
}
});
list.sort(function(a,b){return(b.currentIdleMin||0)-(a.currentIdleMin||0);});

var pop=_d.createElement('div');pop.id='idt-lalert';
pop.style.cssText='position:fixed;top:60px;right:20px;background:#161b22;border:2px solid #da3633;border-radius:12px;padding:16px;width:380px;max-height:70vh;overflow:auto;z-index:9999999;box-shadow:0 8px 32px rgba(218,54,51,0.3);';
var h='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
h+='<span style="font-size:14px;font-weight:700;color:#da3633">\uD83D\uDD34 Currently Idle ('+list.length+' AAs)</span>';
h+='<span id="lalert-x" style="cursor:pointer;color:#8b949e;font-size:18px">\u2715</span></div>';

if(list.length===0){
h+='<div style="color:#3fb950;text-align:center;padding:20px">\u2705 No one is currently idle!</div>';
}else{
h+='<table style="width:100%;border-collapse:collapse">';
h+='<tr style="color:#8b949e;font-size:10px;border-bottom:1px solid #21262d"><th style="text-align:left;padding:4px">Login</th><th style="text-align:left;padding:4px">Name</th><th style="text-align:right;padding:4px">Idle</th><th style="text-align:center;padding:4px">FANS</th></tr>';
list.forEach(function(aa){
var cls=aa.currentIdleMin>=15?'color:#ef4444':(aa.currentIdleMin>=10?'color:#f59e0b':'color:#58a6ff');
h+='<tr style="border-bottom:1px solid #161b22">';
h+='<td style="padding:4px;font-size:11px;color:#58a6ff">'+aa.login+'</td>';
h+='<td style="padding:4px;font-size:11px">'+(aa.name||'-')+'</td>';
h+='<td style="padding:4px;font-size:11px;text-align:right;font-weight:700;'+cls+'">'+Math.round(aa.currentIdleMin)+'m</td>';
h+='<td style="padding:4px;text-align:center"><button class="fans-btn lalert-fans" data-login="'+aa.login+'">\uD83D\uDCE8</button></td>';
h+='</tr>';
});
h+='</table>';
}
pop.innerHTML=h;

var root=_d.getElementById('idt');
if(root)root.appendChild(pop);else _d.body.appendChild(pop);

_d.getElementById('lalert-x').addEventListener('click',function(){rm('idt-lalert');});

// FANS buttons in live popup
pop.querySelectorAll('.lalert-fans').forEach(function(btn){
btn.addEventListener('click',function(){
var login=btn.getAttribute('data-login');
showCustomFANS(login);
});
});
}
// === END PART 6 — paste Part 7 directly below ===


// === PART 7: CONTEXT MENU + ALERT POPUPS — Paste directly after Part 6 ===

// ========== CONTEXT MENU ==========
function showCtx(e,login){
e.preventDefault();
rm('idt-ctx');
S.ctxLogin=login;
var aa=S.data[login]||S.filteredData[login]||{};
var flag=getFlag(login);
var note=getNote(login);

var ctx=_d.createElement('div');ctx.id='idt-ctx';ctx.className='ctx-menu';
ctx.style.left=e.pageX+'px';ctx.style.top=e.pageY+'px';

var h='';
h+='<div style="padding:8px 14px;font-size:10px;color:#484f58;border-bottom:1px solid #21262d">'+(aa.name||login)+' ('+login+')</div>';
h+='<div class="ctx-item" data-act="fclm">\uD83D\uDD17 Open in FCLM</div>';
h+='<div class="ctx-item" data-act="fans">\uD83D\uDCE8 Send FANS Message</div>';
h+='<div class="ctx-item" data-act="cfans">\u270D\uFE0F Custom FANS Message</div>';
h+='<div class="ctx-sep"></div>';

// Flag options
h+='<div style="padding:4px 14px;font-size:9px;color:#484f58">Set Flag:</div>';
C.flags.forEach(function(f){
var active=flag===f?'background:#21262d;':'';
h+='<div class="ctx-item" data-act="flag" data-flag="'+f+'" style="'+active+'">'+C.flagIcons[f]+' '+f+'</div>';
});

h+='<div class="ctx-sep"></div>';
h+='<div class="ctx-item" data-act="note">\uD83D\uDCDD '+(note?'Edit':'Add')+' Note</div>';
h+='<div class="ctx-item" data-act="copy">\uD83D\uDCCB Copy Login</div>';

ctx.innerHTML=h;

var root=_d.getElementById('idt');
if(root)root.appendChild(ctx);else _d.body.appendChild(ctx);

// Handle context menu clicks
ctx.querySelectorAll('.ctx-item').forEach(function(item){
item.addEventListener('click',function(){
var act=item.getAttribute('data-act');

if(act==='fclm'){
window.open('https://fclm-portal.amazon.com/employee/timeDetails?warehouseId='+C.wh+'&employeeId='+login,'_blank');
}
if(act==='fans'){
sendFANS(login,'manual',false);
}
if(act==='cfans'){
showCustomFANS(login);
}
if(act==='flag'){
var f=item.getAttribute('data-flag');
setFlag(login,f);
if(S.activeTab==='dash')drawDash();
stt('\u2705 Flag set: '+C.flagIcons[f]+' '+f+' for '+login);
}
if(act==='note'){
var current=getNote(login);
var newNote=prompt('Note for '+login+':',current);
if(newNote!==null){
setNote(login,newNote);
if(S.activeTab==='dash')drawDash();
stt('\uD83D\uDCDD Note saved for '+login);
}
}
if(act==='copy'){
try{
var ta=_d.createElement('textarea');
ta.value=login;_d.body.appendChild(ta);
ta.select();_d.execCommand('copy');
_d.body.removeChild(ta);
stt('\uD83D\uDCCB Copied: '+login);
}catch(e){stt('\u26A0\uFE0F Copy failed');}
}

rm('idt-ctx');
});
});
}

// Close context menu on click outside
_d.addEventListener('click',function(e){
var ctx=_d.getElementById('idt-ctx');
if(ctx&&!ctx.contains(e.target))rm('idt-ctx');
});

// ========== ALERT POPUP — LIVE IDLE ==========
function alertPopLive(list){
if(!C.popup)return;
rm('idt-alert');
stopTab();

var pop=_d.createElement('div');pop.id='idt-alert';pop.className='alert-pop';
var h='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
h+='<span style="font-size:14px;font-weight:700;color:#da3633">\uD83D\uDD34 Live Idle Alert!</span>';
h+='<span id="alert-x" style="cursor:pointer;color:#8b949e;font-size:18px">\u2715</span></div>';
h+='<div style="font-size:11px;color:#8b949e;margin-bottom:8px">'+list.length+' AA(s) currently idle \u2265 '+C.liveAlert.min+' min:</div>';

list.sort(function(a,b){return(b.currentIdleMin||0)-(a.currentIdleMin||0);});
list.forEach(function(aa){
var cls=aa.currentIdleMin>=15?'color:#ef4444':(aa.currentIdleMin>=10?'color:#f59e0b':'color:#58a6ff');
h+='<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #21262d">';
h+='<div>';
h+='<span style="color:#58a6ff;font-weight:600;font-size:11px">'+aa.login+'</span>';
h+='<span style="color:#8b949e;font-size:10px;margin-left:6px">'+(aa.name||'')+'</span>';
h+='</div>';
h+='<div style="display:flex;align-items:center;gap:8px">';
h+='<span style="font-weight:700;font-size:12px;'+cls+'">'+Math.round(aa.currentIdleMin)+'m</span>';
h+='<button class="fans-btn alert-fans" data-login="'+aa.login+'">\uD83D\uDCE8</button>';
h+='</div></div>';
});

h+='<div style="margin-top:12px;display:flex;gap:6px">';
h+='<button class="btn" id="alert-dismiss" style="flex:1">\u2715 Dismiss</button>';
h+='<button class="btn btn-imp" id="alert-fans-all" style="flex:1">\uD83D\uDCE8 FANS All</button>';
h+='</div>';
pop.innerHTML=h;

var root=_d.getElementById('idt');
if(root)root.appendChild(pop);else _d.body.appendChild(pop);

_d.getElementById('alert-x').addEventListener('click',function(){rm('idt-alert');stopTab();});
_d.getElementById('alert-dismiss').addEventListener('click',function(){rm('idt-alert');stopTab();});

// FANS All button
_d.getElementById('alert-fans-all').addEventListener('click',function(){
list.forEach(function(aa,i){
setTimeout(function(){sendFANS(aa.login,'alert-bulk',true);},i*1500);
});
stt('\uD83D\uDCE8 Sending FANS to '+list.length+' idle AAs...');
rm('idt-alert');stopTab();
});

// Individual FANS buttons
pop.querySelectorAll('.alert-fans').forEach(function(btn){
btn.addEventListener('click',function(){
var login=btn.getAttribute('data-login');
showCustomFANS(login);
});
});

// Auto-dismiss after 30 seconds
setTimeout(function(){rm('idt-alert');stopTab();},30000);
}

// ========== ALERT POPUP — SHIFT IDLE ==========
function alertPop(list){
if(!C.popup)return;
rm('idt-alert');
stopTab();

var pop=_d.createElement('div');pop.id='idt-alert';pop.className='alert-pop';
var h='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
h+='<span style="font-size:14px;font-weight:700;color:#f59e0b">\u26A0\uFE0F Shift Idle Alert!</span>';
h+='<span id="alert-x2" style="cursor:pointer;color:#8b949e;font-size:18px">\u2715</span></div>';
h+='<div style="font-size:11px;color:#8b949e;margin-bottom:8px">'+list.length+' AA(s) with shift idle \u2265 '+C.shiftAlert.min+' min:</div>';

list.sort(function(a,b){return(b.totalIdleMin||0)-(a.totalIdleMin||0);});
list.forEach(function(aa){
var cls=aa.totalIdleMin>=30?'color:#ef4444':'color:#f59e0b';
h+='<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #21262d">';
h+='<div>';
h+='<span style="color:#58a6ff;font-weight:600;font-size:11px">'+aa.login+'</span>';
h+='<span style="color:#8b949e;font-size:10px;margin-left:6px">'+(aa.name||'')+'</span>';
h+='</div>';
h+='<div style="display:flex;align-items:center;gap:8px">';
h+='<span style="font-weight:700;font-size:12px;'+cls+'">'+Math.round(aa.totalIdleMin)+'m</span>';
h+='<button class="fans-btn salert-fans" data-login="'+aa.login+'">\uD83D\uDCE8</button>';
h+='</div></div>';
});

h+='<div style="margin-top:12px;display:flex;gap:6px">';
h+='<button class="btn" id="alert-dismiss2" style="flex:1">\u2715 Dismiss</button>';
h+='<button class="btn btn-imp" id="alert-fans-all2" style="flex:1">\uD83D\uDCE8 FANS All</button>';
h+='</div>';
pop.innerHTML=h;

var root=_d.getElementById('idt');
if(root)root.appendChild(pop);else _d.body.appendChild(pop);

_d.getElementById('alert-x2').addEventListener('click',function(){rm('idt-alert');stopTab();});
_d.getElementById('alert-dismiss2').addEventListener('click',function(){rm('idt-alert');stopTab();});

_d.getElementById('alert-fans-all2').addEventListener('click',function(){
list.forEach(function(aa,i){
setTimeout(function(){sendFANS(aa.login,'shift-alert-bulk',true);},i*1500);
});
stt('\uD83D\uDCE8 Sending FANS to '+list.length+' AAs...');
rm('idt-alert');stopTab();
});

pop.querySelectorAll('.salert-fans').forEach(function(btn){
btn.addEventListener('click',function(){
var login=btn.getAttribute('data-login');
showCustomFANS(login);
});
});

setTimeout(function(){rm('idt-alert');stopTab();},30000);
}
// === END PART 7 — paste Part 8 directly below ===


// === PART 8: drawDash + STATS + BUCKETS + SEARCH — Paste directly after Part 7 ===

// ========== BUCKET DEFINITIONS ==========
var BK=[
{label:'All',min:0,max:99999,color:'#c9d1d9'},
{label:'3-10m',min:3,max:10,color:'#58a6ff'},
{label:'10-20m',min:10,max:20,color:'#f59e0b'},
{label:'20-30m',min:20,max:30,color:'#e3742f'},
{label:'30-60m',min:30,max:60,color:'#ef4444'},
{label:'60m+',min:60,max:99999,color:'#da3633'}
];

// ========== DRAW DASHBOARD ==========
function drawDash(){
var pan=_d.getElementById('pan-dash');
if(!pan)return;

buildFilteredData();
updLiveCount();

var all=Object.values(S.filteredData);
var total=all.length;
if(total===0){
pan.innerHTML='<div style="text-align:center;padding:40px;color:#8b949e"><div style="font-size:40px;margin-bottom:12px">\uD83D\uDCCA</div><div style="font-size:14px">No data yet</div><div style="font-size:11px;margin-top:8px">Import logins and click \u25B6 Scan</div></div>';
return;
}

// Calculate stats
var totalIdle=0,idle0=0,idleActive=0,onClock=0,offClock=0,onBreak=0,currentlyIdle=0;
all.forEach(function(aa){
totalIdle+=aa.totalIdleMin||0;
if(aa.totalIdleMin===0)idle0++;
if(aa.isIdle&&aa.clockStatus==='on')currentlyIdle++;
if(aa.clockStatus==='on')onClock++;
else if(aa.clockStatus==='break')onBreak++;
else if(aa.clockStatus==='off')offClock++;
});
var avgIdle=total>0?Math.round(totalIdle/total):0;

// Count buckets
var bCounts=BK.map(function(b){
return all.filter(function(aa){
var idle=aa.totalIdleMin||0;
if(b.label==='All')return true;
if(b.label==='60m+')return idle>=60;
return idle>=b.min&&idle<b.max;
}).length;
});

var h='';

// ===== STATS CARDS =====
h+='<div class="stats">';
h+='<div class="stat"><div class="val" style="color:#58a6ff">'+total+'</div><div class="lbl">Total AAs</div></div>';
h+='<div class="stat"><div class="val" style="color:#3fb950">'+onClock+'</div><div class="lbl">\uD83D\uDFE2 On Clock</div></div>';
h+='<div class="stat"><div class="val" style="color:#f59e0b">'+onBreak+'</div><div class="lbl">\u2615 Break</div></div>';
h+='<div class="stat"><div class="val" style="color:#8b949e">'+offClock+'</div><div class="lbl">\uD83D\uDD34 Off Clock</div></div>';
h+='<div class="stat"><div class="val" style="color:#da3633">'+currentlyIdle+'</div><div class="lbl">\u26A0\uFE0F Currently Idle</div></div>';
h+='<div class="stat"><div class="val" style="color:#f59e0b">'+avgIdle+'m</div><div class="lbl">Avg Idle</div></div>';
h+='<div class="stat"><div class="val" style="color:#3fb950">'+idle0+'</div><div class="lbl">Zero Idle</div></div>';
h+='</div>';

// ===== BUCKET FILTERS =====
h+='<div class="buckets">';
BK.forEach(function(b,i){
var active=S.filter===b||(!S.filter&&i===0)?'active':'';
h+='<div class="bk '+active+'" data-bk="'+i+'" style="border-color:'+b.color+'">'+b.label+' <span style="font-weight:400;opacity:0.7">('+bCounts[i]+')</span></div>';
});
// FANS bulk buttons
h+='<div style="margin-left:auto;display:flex;gap:4px">';
h+='<button class="fans-btn" id="bulk-medium">\uD83D\uDD35 FANS Medium</button>';
h+='<button class="fans-btn" id="bulk-high">\uD83D\uDFE1 FANS High</button>';
h+='<button class="fans-btn" id="bulk-critical">\uD83D\uDD34 FANS Critical</button>';
h+='</div>';
h+='</div>';

// ===== SEARCH BAR =====
h+='<div class="search-bar">';
h+='<input type="text" id="idt-search" placeholder="\uD83D\uDD0D Search by login, name, or dept..." value="'+(S.search||'')+'">';
h+='<label style="font-size:10px;color:#8b949e;white-space:nowrap"><input type="checkbox" id="idt-showall" '+(S.showAll?'checked':'')+' style="margin-right:4px"> Show All</label>';
h+='</div>';

// ===== TABLE =====
h+='<div style="overflow:auto;flex:1">';
h+='<table class="dt" id="idt-tbl">';
h+='<thead><tr>';
h+='<th data-col="idx">#</th>';
h+='<th data-col="login">Login</th>';
h+='<th data-col="name">Name</th>';
h+='<th data-col="dept">Dept</th>';
h+='<th data-col="clock">Clock</th>';
h+='<th data-col="status">Status</th>';
h+='<th data-col="currentIdle">Current Idle</th>';
h+='<th data-col="totalIdle">Shift Idle</th>';
h+='<th data-col="idlePct">Idle %</th>';
h+='<th data-col="lastAct">Last Activity</th>';
h+='<th data-col="flag">Flag</th>';
h+='<th data-col="note">Note</th>';
h+='<th data-col="fans">FANS</th>';
h+='</tr></thead>';
h+='<tbody id="idt-tbody"></tbody>';
h+='</table></div>';

pan.innerHTML=h;

// Draw table rows
drawRows();

// ===== BIND DASHBOARD EVENTS =====

// Bucket filter click
pan.querySelectorAll('.bk').forEach(function(bk){
bk.addEventListener('click',function(){
var idx=parseInt(bk.getAttribute('data-bk'));
S.filter=idx===0?null:BK[idx];
pan.querySelectorAll('.bk').forEach(function(b){b.classList.remove('active');});
bk.classList.add('active');
drawRows();
});
});

// Search
var searchInput=_d.getElementById('idt-search');
if(searchInput)searchInput.addEventListener('input',function(){
S.search=searchInput.value.toLowerCase();
drawRows();
});

// Show All toggle
var showAllCheck=_d.getElementById('idt-showall');
if(showAllCheck)showAllCheck.addEventListener('change',function(){
S.showAll=showAllCheck.checked;
drawRows();
});

// Bulk FANS buttons
var bulkMed=_d.getElementById('bulk-medium');
if(bulkMed)bulkMed.addEventListener('click',function(){bulkFANS('medium');});
var bulkHigh=_d.getElementById('bulk-high');
if(bulkHigh)bulkHigh.addEventListener('click',function(){bulkFANS('high');});
var bulkCrit=_d.getElementById('bulk-critical');
if(bulkCrit)bulkCrit.addEventListener('click',function(){bulkFANS('critical');});

// Table header sort
pan.querySelectorAll('.dt th').forEach(function(th){
th.addEventListener('click',function(){
var col=th.getAttribute('data-col');
if(!col)return;
if(!S.sortCol)S.sortCol=col;
if(S.sortCol===col){S.sortAsc=!S.sortAsc;}else{S.sortCol=col;S.sortAsc=true;}
drawRows();
});
});
}
// === END PART 8 — paste Part 9 directly below ===


// === PART 9: drawRows — Paste directly after Part 8 ===

// ========== DRAW TABLE ROWS ==========
function drawRows(){
var tbody=_d.getElementById('idt-tbody');
if(!tbody)return;

var all=Object.values(S.filteredData);

// Apply bucket filter
if(S.filter){
all=all.filter(function(aa){
var idle=aa.totalIdleMin||0;
if(S.filter.label==='60m+')return idle>=60;
return idle>=S.filter.min&&idle<S.filter.max;
});
}

// Apply search filter
if(S.search){
var q=S.search.toLowerCase();
all=all.filter(function(aa){
return(aa.login&&aa.login.toLowerCase().indexOf(q)>=0)||
(aa.name&&aa.name.toLowerCase().indexOf(q)>=0)||
(aa.dept&&aa.dept.toLowerCase().indexOf(q)>=0);
});
}

// Sort
if(S.sortCol){
all.sort(function(a,b){
var va,vb;
if(S.sortCol==='login'){va=a.login||'';vb=b.login||'';}
else if(S.sortCol==='name'){va=a.name||'';vb=b.name||'';}
else if(S.sortCol==='dept'){va=a.dept||'';vb=b.dept||'';}
else if(S.sortCol==='clock'){va=a.clockStatus||'';vb=b.clockStatus||'';}
else if(S.sortCol==='status'){va=a.isIdle?1:0;vb=b.isIdle?1:0;}
else if(S.sortCol==='currentIdle'){va=a.currentIdleMin||0;vb=b.currentIdleMin||0;}
else if(S.sortCol==='totalIdle'){va=a.totalIdleMin||0;vb=b.totalIdleMin||0;}
else if(S.sortCol==='idlePct'){
var shiftMin=getShiftMinutes();
va=shiftMin>0?(a.totalIdleMin||0)/shiftMin:0;
vb=shiftMin>0?(b.totalIdleMin||0)/shiftMin:0;
}
else if(S.sortCol==='lastAct'){va=a.lastActivity||'';vb=b.lastActivity||'';}
else if(S.sortCol==='flag'){va=getFlag(a.login);vb=getFlag(b.login);}
else{va=a.totalIdleMin||0;vb=b.totalIdleMin||0;}

if(typeof va==='string')return S.sortAsc?va.localeCompare(vb):vb.localeCompare(va);
return S.sortAsc?va-vb:vb-va;
});
}else{
// Default sort: highest idle first
all.sort(function(a,b){return(b.totalIdleMin||0)-(a.totalIdleMin||0);});
}

// Limit rows (unless Show All is checked)
var maxRows=S.showAll?all.length:Math.min(all.length,400);
var display=all.slice(0,maxRows);

var shiftMin=getShiftMinutes();

var html='';
display.forEach(function(aa,idx){
var idle=Math.round(aa.totalIdleMin||0);
var curIdle=Math.round(aa.currentIdleMin||0);

// Row class
var rowCls='';
if(aa.isIdle&&aa.clockStatus==='on')rowCls='idle';
if(aa.clockStatus==='off')rowCls='offclock';

// Clock status icon
var clockIcon='\u2753';
if(aa.clockStatus==='on')clockIcon='<span class="clock-on">\uD83D\uDFE2 On</span>';
else if(aa.clockStatus==='break')clockIcon='<span class="clock-break">\u2615 Break</span>';
else if(aa.clockStatus==='off')clockIcon='<span class="clock-off">\uD83D\uDD34 Off</span>';

// Status
var status='<span style="color:#3fb950">\u25B6 Working</span>';
if(aa.clockStatus==='off')status='<span style="color:#8b949e">\uD83D\uDD12 Off Clock</span>';
else if(aa.clockStatus==='break')status='<span style="color:#f59e0b">\u2615 Break</span>';
else if(aa.isIdle)status='<span style="color:#da3633">\u23F8 Idle '+curIdle+'m</span>';

// Current idle badge
var curBadge='<span class="idle-badge idle-ok">\u2714</span>';
if(aa.clockStatus==='off'){
curBadge='<span class="idle-badge" style="background:#0d1117;color:#8b949e;border:1px solid #30363d">\uD83D\uDD12 Off</span>';
}else if(aa.clockStatus==='break'){
curBadge='<span class="idle-badge" style="background:#0d1117;color:#f59e0b;border:1px solid #d29922">\u2615 Break</span>';
}else if(aa.isIdle){
var curCls='idle-med';
if(curIdle>=15)curCls='idle-crit';
else if(curIdle>=10)curCls='idle-high';
curBadge='<span class="idle-badge '+curCls+'">'+curIdle+'m</span>';
}

// Shift idle badge
var idleCls='idle-ok';
if(idle>=30)idleCls='idle-crit';
else if(idle>=15)idleCls='idle-high';
else if(idle>=5)idleCls='idle-med';
var idleBadge='<span class="idle-badge '+idleCls+'">'+idle+'m</span>';

// Idle percentage
var idlePct=0;
if(shiftMin>0)idlePct=Math.round((idle/shiftMin)*100);
var pctColor='#3fb950';
if(idlePct>=15)pctColor='#ef4444';
else if(idlePct>=10)pctColor='#f59e0b';
else if(idlePct>=5)pctColor='#58a6ff';

// Flag
var flag=getFlag(aa.login);
var flagIcon=C.flagIcons[flag]||'\u2B1C';

// Note
var note=getNote(aa.login);
var noteIcon=note?'\uD83D\uDCDD':'';

// FANS today count
var fansToday=0;
if(FANS_SENT[aa.login]){
var todayStr=new Date().toISOString().slice(0,10);
FANS_SENT[aa.login].forEach(function(l){if(l.time&&l.time.slice(0,10)===todayStr)fansToday++;});
}

html+='<tr class="'+rowCls+'" data-login="'+aa.login+'">';
html+='<td style="color:#484f58">'+(idx+1)+'</td>';
html+='<td><a href="https://fclm-portal.amazon.com/employee/timeDetails?warehouseId='+C.wh+'&employeeId='+aa.login+'" target="_blank" style="color:#58a6ff;text-decoration:none">'+aa.login+'</a></td>';
html+='<td>'+(aa.name||'-')+'</td>';
html+='<td style="color:#8b949e">'+(aa.dept||'-')+'</td>';
html+='<td>'+clockIcon+'</td>';
html+='<td>'+status+'</td>';
html+='<td>'+curBadge+'</td>';
html+='<td>'+idleBadge+'</td>';
html+='<td style="color:'+pctColor+';font-weight:700">'+idlePct+'%</td>';
html+='<td style="color:#8b949e;max-width:150px;overflow:hidden;text-overflow:ellipsis">'+(aa.lastActivity||'-')+'</td>';
html+='<td style="cursor:pointer" title="'+flag+'">'+flagIcon+'</td>';
html+='<td style="cursor:pointer;max-width:80px;overflow:hidden;text-overflow:ellipsis" title="'+(note||'No note')+'">'+noteIcon+'</td>';
html+='<td><div style="display:flex;gap:3px">';
html+='<button class="fans-btn row-fans" data-login="'+aa.login+'" title="Send FANS">\uD83D\uDCE8</button>';
html+='<button class="fans-btn row-cfans" data-login="'+aa.login+'" title="Custom FANS">\u270D\uFE0F</button>';
html+='<button class="fans-btn row-tot" data-login="'+aa.login+'" title="Fix ToT" style="background:#1f6feb;border-color:#1f6feb;color:#fff">\uD83D\uDD27</button>';
if(fansToday>0)html+='<span style="font-size:9px;color:#484f58">'+fansToday+'x</span>';
html+='</div></td>';
html+='</tr>';

// === EXPANDED DETAIL ROW WITH TOT FIX ===
var isOpen=S.exp&&S.exp[aa.login];
html+='<tr class="detail-row'+(isOpen?' open':'')+'" data-detail="'+aa.login+'" style="display:'+(isOpen?'table-row':'none')+'">';
html+='<td colspan="13" style="padding:8px 16px;background:#0d1117;border-bottom:1px solid #21262d">';
var segs=aa.allSegs||aa.segs||[];
if(segs.length>0){
html+='<div style="font-size:11px;font-weight:700;color:#58a6ff;margin-bottom:6px">Idle Segments ('+segs.length+')</div>';
html+='<table class="seg-tbl"><thead><tr>';
html+='<th style="width:24px"><input type="checkbox" class="tot-all" data-login="'+aa.login+'"/></th>';
html+='<th>Activity</th><th>Start</th><th>End</th><th>Duration</th><th>Status</th>';
html+='</tr></thead><tbody>';
segs.forEach(function(sg){
var sdur=sg.dur||0;
var scolor=sdur>=15?'#ef4444':(sdur>=10?'#f59e0b':(sdur>=5?'#58a6ff':'#8b949e'));
var hasTot=true;
html+='<tr data-ss="'+(sg.ss||'')+'">';
html+='<td>'+(hasTot?'<input type="checkbox" class="tot-chk" data-login="'+aa.login+'" data-ss="'+sg.ss+'"/>':'<span style="color:#484f58">-</span>')+'</td>';
html+='<td style="color:#c9d1d9">'+(sg.title||'Unknown')+'</td>';
html+='<td style="color:#8b949e">'+(sg.ss||'-')+'</td>';
html+='<td style="color:#8b949e">'+(sg.es||'-')+'</td>';
html+='<td style="color:'+scolor+';font-weight:700">'+sdur+'m</td>';
html+='<td class="seg-status" style="color:#484f58;font-size:9px">'+(hasTot?'Fixable':'')+'</td>';
html+='</tr>';
});
html+='</tbody></table>';
// === TOT FIX BAR ===
html+='<div style="margin-top:8px;padding-top:8px;border-top:1px solid #21262d;display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
var hasOpts=S.processOpts&&S.processOpts.length>0;
if(hasOpts){
html+='<select class="tot-proc" data-login="'+aa.login+'" style="background:#161b22;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;padding:3px 8px;font-size:10px;min-width:120px">';
html+='<option value="">Select Process</option>';
S.processOpts.forEach(function(o){
html+='<option value="'+o.v+'">'+o.l+'</option>';
});
html+='</select>';
html+='<select class="tot-func" data-login="'+aa.login+'" style="background:#161b22;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;padding:3px 8px;font-size:10px;min-width:150px">';
html+='<option value="">Select Function</option>';
html+='</select>';
html+='<button class="tot-fix" data-login="'+aa.login+'" style="background:#1f6feb;color:#fff;border:none;border-radius:6px;padding:4px 12px;font-size:10px;font-weight:600;cursor:pointer">Fix Selected</button>';
}else{
html+='<span style="color:#8b949e;font-size:10px">Process list loads after scan</span>';
}
html+='<a href="https://fclm-portal.amazon.com/employee/timeDetails?warehouseId='+C.wh+'&employeeId='+aa.login+'" target="_blank" style="color:#58a6ff;font-size:10px;text-decoration:none">Open FCLM</a>';
html+='<span class="tot-status" data-login="'+aa.login+'" style="font-size:10px;color:#8b949e;margin-left:auto"></span>';
html+='</div>';
}else{
html+='<div style="color:#3fb950;font-size:11px">No idle segments found</div>';
html+='<a href="https://fclm-portal.amazon.com/employee/timeDetails?warehouseId='+C.wh+'&employeeId='+aa.login+'" target="_blank" style="color:#58a6ff;font-size:10px;text-decoration:none;margin-top:6px;display:inline-block">Open FCLM</a>';
}
html+='</td></tr>';


});


if(display.length<all.length){
html+='<tr><td colspan="13" style="text-align:center;color:#484f58;padding:10px">Showing '+display.length+' of '+all.length+' — check "Show All" to see all</td></tr>';
}

tbody.innerHTML=html;

// ===== BIND ROW EVENTS =====

// Right-click context menu
tbody.querySelectorAll('tr').forEach(function(tr){
tr.addEventListener('contextmenu',function(e){
var login=tr.getAttribute('data-login');
if(login)showCtx(e,login);
});
});

// FANS buttons
tbody.querySelectorAll('.row-fans').forEach(function(btn){
btn.addEventListener('click',function(e){
e.stopPropagation();
var login=btn.getAttribute('data-login');
sendFANS(login,'manual',false);
});
});
// ToT Fix link — opens AA's time detail page with dates
tbody.querySelectorAll('.row-tot').forEach(function(btn){
btn.addEventListener('click',function(e){
e.stopPropagation();
var login=btn.getAttribute('data-login');
var url='https://fclm-portal.amazon.com/employee/timeDetails?warehouseId='+C.wh+'&employeeId='+encodeURIComponent(login);
window.open(url,'_blank');
});
});
// Custom FANS buttons
tbody.querySelectorAll('tr[data-login]').forEach(function(row){
row.addEventListener('click',function(ev){
if(ev.target.tagName==='A'||ev.target.tagName==='BUTTON'||ev.target.tagName==='INPUT')return;
var l=this.getAttribute('data-login');
if(!S.exp)S.exp={};
S.exp[l]=!S.exp[l];
drawDash();
});
});
tbody.querySelectorAll('.row-cfans').forEach(function(btn){
btn.addEventListener('click',function(e){
e.stopPropagation();
var login=btn.getAttribute('data-login');
showCustomFANS(login);
});
});

// ===== TOT FIX EVENT HANDLERS =====
tbody.querySelectorAll('.tot-all').forEach(function(cb){
cb.addEventListener('change',function(){
var login=cb.getAttribute('data-login');
var detRow=tbody.querySelector('tr[data-detail="'+login+'"]');
if(!detRow)return;
detRow.querySelectorAll('.tot-chk').forEach(function(c){c.checked=cb.checked;});
});
});

tbody.querySelectorAll('.tot-proc').forEach(function(sel){
sel.addEventListener('change',function(){
var login=sel.getAttribute('data-login');
var pid=sel.value;
var detRow=tbody.querySelector('tr[data-detail="'+login+'"]');
if(!detRow)return;
var funcSel=detRow.querySelector('.tot-func');
if(!funcSel)return;
if(!pid){funcSel.innerHTML='<option value="">Select Function</option>';return;}
funcSel.innerHTML=buildFuncOpts(pid);
});
});

tbody.querySelectorAll('.tot-fix').forEach(function(btn){
btn.addEventListener('click',function(e){
e.stopPropagation();
var login=btn.getAttribute('data-login');
var detRow=tbody.querySelector('tr[data-detail="'+login+'"]');
if(!detRow)return;
var procSel=detRow.querySelector('.tot-proc');
var funcSel=detRow.querySelector('.tot-func');
if(!procSel||!funcSel||!procSel.value||!funcSel.value){
stt('Select Process and Function first');return;
}
var checked=detRow.querySelectorAll('.tot-chk:checked');
if(checked.length===0){stt('Select segments to fix');return;}
var statusEl=detRow.querySelector('.tot-status[data-login="'+login+'"]');
var done=0;var total=checked.length;var failed=0;
if(statusEl)statusEl.textContent='Fixing 0/'+total+'...';
checked.forEach(function(cb){
var ss=cb.getAttribute('data-ss');
var tr=cb.closest('tr');
var stEl=tr?tr.querySelector('.seg-status'):null;
if(stEl)stEl.textContent='Fixing...';
if(stEl)stEl.style.color='#f59e0b';
var aa=S.data[login];
if(!aa){
done++;failed++;
if(stEl){stEl.textContent='No data';stEl.style.color='#ef4444';}
if(statusEl)statusEl.textContent='Fixing '+done+'/'+total+'...';
return;
}
var seg={ss:ss,es:cb.getAttribute('data-es')||''};
submitOneTot(login,seg,procSel.value,funcSel.value).then(function(r){
done++;
if(r&&r.ok){
if(stEl){stEl.textContent='Fixed';stEl.style.color='#3fb950';}
if(tr)tr.style.background='#0d2818';
}else{
failed++;
if(stEl){stEl.textContent='Failed';stEl.style.color='#ef4444';}
if(tr)tr.style.background='#3d1117';
}
if(statusEl)statusEl.textContent=done===total?('Done! '+failed+' failed'):'Fixing '+done+'/'+total+'...';
});
});
});
});


// Flag click

// === EXPANDABLE ROW CLICK HANDLER ===
tbody.querySelectorAll('tr[data-login]').forEach(function(tr){
tr.addEventListener('click',function(e){
if(e.target.tagName==='A'||e.target.tagName==='BUTTON'||e.target.closest('button')||e.target.closest('a'))return;
var login=tr.getAttribute('data-login');
if(!login)return;
if(!S.exp)S.exp={};
S.exp[login]=!S.exp[login];
var detail=tbody.querySelector('tr[data-detail="'+login+'"]');
if(detail){
detail.style.display=S.exp[login]?'table-row':'none';
}
});
});
}


// ===== TOT FIX EVENT HANDLERS =====

// Select All checkbox
_d.addEventListener('change',function(e){
if(!e.target.classList.contains('tot-all'))return;
var login=e.target.getAttribute('data-login');
var checked=e.target.checked;
_d.querySelectorAll('.tot-chk[data-login="'+login+'"]').forEach(function(cb){
cb.checked=checked;
});
});

// Process dropdown - fetch functions
_d.addEventListener('change',function(e){
if(!e.target.classList.contains('tot-proc'))return;
var login=e.target.getAttribute('data-login');
var processId=e.target.value;
var funcSel=_d.querySelector('.tot-func[data-login="'+login+'"]');
if(!funcSel)return;
if(!processId){
funcSel.innerHTML='<option value="">Select Function</option>';
return;
}
funcSel.innerHTML='<option value="">Loading...</option>';
fetchLaborFuncs(processId,function(funcs){
var h='<option value="">Select Function ('+funcs.length+')</option>';
funcs.forEach(function(f){
var fid=f.laborFunctionId||f.id||f.value||'';
var fname=f.laborFunctionName||f.name||f.label||'Unknown';
h+='<option value="'+fid+'">'+fname+'</option>';
});
funcSel.innerHTML=h;
});
});

// Fix Selected button
_d.addEventListener('click',function(e){
if(!e.target.classList.contains('tot-fix'))return;
var fixBtn=e.target;
var login=fixBtn.getAttribute('data-login');
var procSel=_d.querySelector('.tot-proc[data-login="'+login+'"]');
var funcSel=_d.querySelector('.tot-func[data-login="'+login+'"]');
var statusEl=_d.querySelector('.tot-status[data-login="'+login+'"]');
if(!procSel||!procSel.value){
if(statusEl){statusEl.textContent='Select a Process first';statusEl.style.color='#f85149';}
return;
}
if(!funcSel||!funcSel.value){
if(statusEl){statusEl.textContent='Select a Function first';statusEl.style.color='#f85149';}
return;
}
var aa=S.data[login];
if(!aa){
if(statusEl){statusEl.textContent='No data for this AA';}
return;
}
var checked=_d.querySelectorAll('.tot-chk[data-login="'+login+'"]:checked');
if(checked.length===0){
if(statusEl){statusEl.textContent='Select at least one segment';statusEl.style.color='#f85149';}
return;
}
var total=checked.length;
var done=0;
var failed=0;
if(statusEl){statusEl.textContent='Fixing 0/'+total+'...';statusEl.style.color='#58a6ff';}
fixBtn.disabled=true;
fixBtn.textContent='Fixing...';

function onDone(){
done++;
if(done<total){
if(statusEl){statusEl.textContent='Fixing '+done+'/'+total+'...';}
return;
}
if(statusEl){
statusEl.textContent='Done! '+done+' processed'+(failed>0?' ('+failed+' failed)':'');
if(failed>0){
statusEl.style.color='#f85149';
}else{
statusEl.style.color='#3fb950';
}
}
fixBtn.disabled=false;
fixBtn.textContent='Fix Selected';
}

checked.forEach(function(cb){
var ss=cb.getAttribute('data-ss');
var es=cb.getAttribute('data-es')||'';
var seg={ss:ss,es:es,sf:ss,ef:es};
submitOneTot(login,seg,procSel.value,funcSel.value)
.then(function(r){
var row=cb.closest('tr');
if(r.ok){
if(row){row.style.background='#0d2818';}
var st=null;
if(row){st=row.querySelector('.seg-status');}
if(st){st.textContent='Fixed';st.style.color='#3fb950';}
}
if(!r.ok){
failed++;
if(row){row.style.background='#3d1117';}
}
onDone();
})
.catch(function(){
failed++;
var row=cb.closest('tr');
if(row){row.style.background='#3d1117';}
onDone();
});
});
});



// ========== GET SHIFT MINUTES ==========
function getShiftMinutes(){
var fromMin=cfgToMin(C.dashFrom);
var toMin=cfgToMin(C.dashTo);
if(C.dashCrossMid||toMin<=fromMin){
return(1440-fromMin)+toMin;
}
return toMin-fromMin;
}
// === END PART 9 paste Part 10 directly below ===


// === PART 10 calcRangeIdle  drawSF  Paste directly after Part 9 ===

// ========== CALCULATE RANGE IDLE ==========
function calcRangeIdle(aa,fromT,toT,cross){
var fromMin=cfgToMin(fromT);
var toMin=cfgToMin(toT);
if(cross||toMin<=fromMin)toMin+=1440;

var total=0;
var segs=[];
var allSegs=aa.allSegs||aa.segs||[];
for(var i=0;i<allSegs.length;i++){
var seg=allSegs[i];
var ss=timeToMin(seg.ss);
var es=timeToMin(seg.es);
if(es<=ss)es+=1440;

// Check if segment overlaps with the time window
var segStart=ss;
var segEnd=es;
// Handle cross-midnight: segment might be in yesterday
if(segStart<fromMin)segStart+=1440;
if(segEnd<fromMin)segEnd+=1440;

// Recalc if wrapping made segEnd < segStart
if(segEnd<segStart)segEnd+=1440;

// Check overlap
var overlapStart=Math.max(fromMin,segStart);
var overlapEnd=Math.min(toMin,segEnd);

if(overlapStart<overlapEnd){
var dur=overlapEnd-overlapStart;
total+=dur;
segs.push({title:seg.title,ss:seg.ss,es:seg.es,dur:dur});
}
}
return{idle:Math.round(total),segs:segs};}

// ========== DRAW STRONG FINISH ==========
function drawSF(){
var body=_d.getElementById('sf-body');
if(!body)return;

if(!S.sfChecked){
body.innerHTML='<div style="text-align:center;padding:40px;color:#8b949e"><div style="font-size:40px;margin-bottom:12px">\uD83C\uDFC6</div><div style="font-size:14px">Strong Finish</div><div style="font-size:11px;margin-top:8px">Set time range above and click \u2705 Check</div></div>';
return;
}

var fromT=S.sfFrom||'22:00';
var toT=S.sfTo||'22:15';
var cross=cfgToMin(toT)<=cfgToMin(fromT);

// Categorize each AA by range idle
var results=[];
var data=S.filteredData;
if(Object.keys(data).length===0)data=S.data;

Object.keys(data).forEach(function(login){
var aa=data[login];
var ri=calcRangeIdle(aa,fromT,toT,cross);
var rangeIdle=ri.idle;

// Violation level based on RANGE IDLE (not gap)
var viol='none';
if(rangeIdle>=20)viol='critical';
else if(rangeIdle>=10)viol='major';
else if(rangeIdle>=5)viol='minor';

results.push({
login:login,
name:aa.name||'',
dept:aa.dept||'',
clockStatus:aa.clockStatus||'unknown',
totalIdle:Math.round(aa.totalIdleMin||0),
rangeIdle:rangeIdle,
segs:ri.segs,
violation:viol
});
});

// Sort by range idle descending
results.sort(function(a,b){return b.rangeIdle-a.rangeIdle;});

// Count violations
var cNone=0,cMinor=0,cMajor=0,cCritical=0;
results.forEach(function(r){
if(r.violation==='none')cNone++;
if(r.violation==='minor')cMinor++;
if(r.violation==='major')cMajor++;
if(r.violation==='critical')cCritical++;
});

var h='';

// Stats
h+='<div class="stats" style="margin-top:12px">';
h+='<div class="stat"><div class="val" style="color:#c9d1d9">'+results.length+'</div><div class="lbl">Total AAs</div></div>';
h+='<div class="stat"><div class="val" style="color:#3fb950">'+cNone+'</div><div class="lbl">\u2705 Strong (0-5m)</div></div>';
h+='<div class="stat"><div class="val" style="color:#58a6ff">'+cMinor+'</div><div class="lbl">\uD83D\uDD35 Minor (5-10m)</div></div>';
h+='<div class="stat"><div class="val" style="color:#f59e0b">'+cMajor+'</div><div class="lbl">\uD83D\uDFE1 Major (10-20m)</div></div>';
h+='<div class="stat"><div class="val" style="color:#ef4444">'+cCritical+'</div><div class="lbl">\uD83D\uDD34 Critical (20m+)</div></div>';
h+='</div>';

// Time range display
h+='<div style="margin-bottom:12px;padding:8px 12px;background:#161b22;border:1px solid #21262d;border-radius:6px;font-size:11px">';
h+='<span style="color:#8b949e">Checking:</span> <span style="color:#58a6ff;font-weight:700">'+fromT+' \u2192 '+toT+'</span>';
if(cross)h+=' <span style="color:#f59e0b">(cross midnight)</span>';
h+='</div>';

// Table
h+='<div style="overflow:auto">';
h+='<table class="dt">';
h+='<thead><tr>';
h+='<th>#</th>';
h+='<th>Login</th>';
h+='<th>Name</th>';
h+='<th>Dept</th>';
h+='<th>Clock</th>';
h+='<th>Total Idle</th>';
h+='<th>Range Idle</th>';
h+='<th>Violation</th>';
h+='<th>Segments</th>';
h+='<th>FANS</th>';
h+='</tr></thead><tbody>';

results.forEach(function(r,idx){
var rowCls=r.violation==='critical'?'idle':(r.clockStatus==='off'?'offclock':'');

// Clock icon
var clockIcon='\uD83D\uDFE2';
if(r.clockStatus==='break')clockIcon='\u2615';
if(r.clockStatus==='off')clockIcon='\uD83D\uDD34';

// Violation badge
var vBadge='<span class="idle-badge idle-ok">\u2705 Strong</span>';
if(r.violation==='minor')vBadge='<span class="idle-badge idle-med">\uD83D\uDD35 Minor</span>';
if(r.violation==='major')vBadge='<span class="idle-badge idle-high">\uD83D\uDFE1 Major</span>';
if(r.violation==='critical')vBadge='<span class="idle-badge idle-crit">\uD83D\uDD34 Critical</span>';

// Range idle badge
var riCls='idle-ok';
if(r.rangeIdle>=20)riCls='idle-crit';
else if(r.rangeIdle>=10)riCls='idle-high';
else if(r.rangeIdle>=5)riCls='idle-med';

// Segments text
var segTxt='-';
if(r.segs.length>0){
segTxt=r.segs.map(function(s){return s.title+' ('+s.dur+'m)';}).join('; ');
}

h+='<tr class="'+rowCls+'" data-login="'+r.login+'">';
h+='<td style="color:#484f58">'+(idx+1)+'</td>';
h+='<td><a href="https://fclm-portal.amazon.com/employee/timeDetails?warehouseId='+C.wh+'&employeeId='+r.login+'" target="_blank" style="color:#58a6ff;text-decoration:none">'+r.login+'</a></td>';
h+='<td>'+(r.name||'-')+'</td>';
h+='<td style="color:#8b949e">'+(r.dept||'-')+'</td>';
h+='<td>'+clockIcon+'</td>';
h+='<td><span class="idle-badge '+(r.totalIdle>=30?'idle-crit':(r.totalIdle>=15?'idle-high':'idle-ok'))+'">'+r.totalIdle+'m</span></td>';
h+='<td><span class="idle-badge '+riCls+'">'+r.rangeIdle+'m</span></td>';
h+='<td>'+vBadge+'</td>';
h+='<td style="color:#8b949e;font-size:10px;max-width:200px;overflow:hidden;text-overflow:ellipsis" title="'+segTxt+'">'+segTxt+'</td>';
h+='<td><div style="display:flex;gap:3px">';
h+='<button class="fans-btn sf-fans" data-login="'+r.login+'">\uD83D\uDCE8</button>';
h+='<button class="fans-btn sf-cfans" data-login="'+r.login+'">\u270D\uFE0F</button>';
h+='</div></td>';
h+='</tr>';
});

h+='</tbody></table></div>';
body.innerHTML=h;

// Bind SF FANS buttons
body.querySelectorAll('.sf-fans').forEach(function(btn){
btn.addEventListener('click',function(e){
e.stopPropagation();
sendFANS(btn.getAttribute('data-login'),'sf-manual',false);
});
});

body.querySelectorAll('.sf-cfans').forEach(function(btn){
btn.addEventListener('click',function(e){
e.stopPropagation();
showCustomFANS(btn.getAttribute('data-login'));
});
});

// Context menu on SF rows
body.querySelectorAll('tr').forEach(function(tr){
tr.addEventListener('contextmenu',function(e){
var login=tr.getAttribute('data-login');
if(login)showCtx(e,login);
});
});
}
// === END PART 10 — paste Part 11 directly below ===


// === PART 11: LEADERBOARD + DEPT + HEATMAP + TRENDS — Paste directly after Part 10 ===

// ========== DRAW LEADERBOARD ==========
function drawLeaderboard(){
var pan=_d.getElementById('pan-lb');
if(!pan)return;

var all=Object.values(S.filteredData);
if(all.length===0){
pan.innerHTML='<div style="text-align:center;padding:40px;color:#8b949e">\uD83C\uDFC5 No data yet</div>';
return;
}

// Sort by idle ascending (best = least idle)
var sorted=all.slice().sort(function(a,b){return(a.totalIdleMin||0)-(b.totalIdleMin||0);});

var h='';
h+='<div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">';

// Top 5 Best
h+='<div style="flex:1;min-width:300px"><div class="sf-card">';
h+='<h3 style="color:#3fb950;margin:0 0 10px;font-size:14px">\uD83C\uDFC6 Top 5 — Least Idle (Best)</h3>';
h+='<table class="dt"><thead><tr><th>Rank</th><th>Login</th><th>Name</th><th>Dept</th><th>Idle</th><th>FCLM</th></tr></thead><tbody>';
sorted.slice(0,5).forEach(function(aa,idx){
var medals=['\uD83E\uDD47','\uD83E\uDD48','\uD83E\uDD49','\u0034\uFE0F\u20E3','\u0035\uFE0F\u20E3'];
h+='<tr>';
h+='<td>'+medals[idx]+'</td>';
h+='<td style="color:#58a6ff">'+aa.login+'</td>';
h+='<td>'+(aa.name||'-')+'</td>';
h+='<td style="color:#8b949e">'+(aa.dept||'-')+'</td>';
h+='<td><span class="idle-badge idle-ok">'+Math.round(aa.totalIdleMin||0)+'m</span></td>';
h+='<td><a href="https://fclm-portal.amazon.com/employee/timeDetails?warehouseId='+C.wh+'&employeeId='+aa.login+'" target="_blank" style="color:#58a6ff">\uD83D\uDD17</a></td>';
h+='</tr>';
});
h+='</tbody></table></div></div>';

// Top 5 Worst
var worst=sorted.slice().reverse();
h+='<div style="flex:1;min-width:300px"><div class="sf-card">';
h+='<h3 style="color:#ef4444;margin:0 0 10px;font-size:14px">\u26A0\uFE0F Top 5 — Most Idle (Needs Coaching)</h3>';
h+='<table class="dt"><thead><tr><th>Rank</th><th>Login</th><th>Name</th><th>Dept</th><th>Idle</th><th>FANS</th></tr></thead><tbody>';
worst.slice(0,5).forEach(function(aa,idx){
var idle=Math.round(aa.totalIdleMin||0);
var cls=idle>=30?'idle-crit':(idle>=15?'idle-high':'idle-med');
h+='<tr>';
h+='<td style="color:#ef4444">'+(idx+1)+'</td>';
h+='<td style="color:#58a6ff">'+aa.login+'</td>';
h+='<td>'+(aa.name||'-')+'</td>';
h+='<td style="color:#8b949e">'+(aa.dept||'-')+'</td>';
h+='<td><span class="idle-badge '+cls+'">'+idle+'m</span></td>';
h+='<td><button class="fans-btn lb-fans" data-login="'+aa.login+'">\uD83D\uDCE8</button></td>';
h+='</tr>';
});
h+='</tbody></table></div></div>';
h+='</div>';

// Full Ranking Table
h+='<div class="sf-card"><h3 style="color:#58a6ff;margin:0 0 10px;font-size:14px">\uD83D\uDCCA Full Ranking — All AAs by Idle Time</h3>';
h+='<table class="dt"><thead><tr><th>Rank</th><th>Login</th><th>Name</th><th>Dept</th><th>Clock</th><th>Idle</th><th>Idle %</th><th>FCLM</th><th>FANS</th></tr></thead><tbody>';
var shiftMin=getShiftMinutes();
sorted.forEach(function(aa,idx){
var idle=Math.round(aa.totalIdleMin||0);
var cls=idle>=30?'idle-crit':(idle>=15?'idle-high':(idle>=5?'idle-med':'idle-ok'));
var pct=shiftMin>0?Math.round((idle/shiftMin)*100):0;
var clockIcon=aa.clockStatus==='on'?'\uD83D\uDFE2':(aa.clockStatus==='break'?'\u2615':'\uD83D\uDD34');
h+='<tr>';
h+='<td style="color:#484f58">'+(idx+1)+'</td>';
h+='<td style="color:#58a6ff">'+aa.login+'</td>';
h+='<td>'+(aa.name||'-')+'</td>';
h+='<td style="color:#8b949e">'+(aa.dept||'-')+'</td>';
h+='<td>'+clockIcon+'</td>';
h+='<td><span class="idle-badge '+cls+'">'+idle+'m</span></td>';
h+='<td style="color:'+(pct>=15?'#ef4444':(pct>=10?'#f59e0b':'#3fb950'))+'">'+pct+'%</td>';
h+='<td><a href="https://fclm-portal.amazon.com/employee/timeDetails?warehouseId='+C.wh+'&employeeId='+aa.login+'" target="_blank" style="color:#58a6ff">\uD83D\uDD17</a></td>';
h+='<td><button class="fans-btn lb-fans2" data-login="'+aa.login+'">\uD83D\uDCE8</button></td>';
h+='</tr>';
});
h+='</tbody></table></div>';

pan.innerHTML=h;

// Bind FANS buttons
pan.querySelectorAll('.lb-fans,.lb-fans2').forEach(function(btn){
btn.addEventListener('click',function(e){
e.stopPropagation();
showCustomFANS(btn.getAttribute('data-login'));
});
});
}

// ========== DRAW DEPARTMENT ==========
function drawDept(){
var pan=_d.getElementById('pan-dept');
if(!pan)return;

var all=Object.values(S.filteredData);
if(all.length===0){
pan.innerHTML='<div style="text-align:center;padding:40px;color:#8b949e">\uD83C\uDFE2 No data yet</div>';
return;
}

// Group by department
var depts={};
all.forEach(function(aa){
var d=aa.dept||'Unknown';
if(!depts[d])depts[d]={name:d,total:0,idle:0,onClock:0,offClock:0,onBreak:0,currentlyIdle:0,aas:[]};
depts[d].total++;
depts[d].idle+=(aa.totalIdleMin||0);
if(aa.clockStatus==='on')depts[d].onClock++;
if(aa.clockStatus==='off')depts[d].offClock++;
if(aa.clockStatus==='break')depts[d].onBreak++;
if(aa.isIdle&&aa.clockStatus==='on')depts[d].currentlyIdle++;
depts[d].aas.push(aa);
});

var deptArr=Object.values(depts).sort(function(a,b){return b.idle-a.idle;});

var h='<div class="stats" style="margin-bottom:16px">';
h+='<div class="stat"><div class="val" style="color:#58a6ff">'+deptArr.length+'</div><div class="lbl">Departments</div></div>';
h+='<div class="stat"><div class="val" style="color:#c9d1d9">'+all.length+'</div><div class="lbl">Total AAs</div></div>';
h+='</div>';

h+='<table class="dt"><thead><tr>';
h+='<th>#</th><th>Department</th><th>AAs</th><th>On Clock</th><th>Break</th><th>Off</th><th>Currently Idle</th><th>Avg Idle</th><th>Total Idle</th>';
h+='</tr></thead><tbody>';

deptArr.forEach(function(d,idx){
var avg=d.total>0?Math.round(d.idle/d.total):0;
var avgCls=avg>=30?'idle-crit':(avg>=15?'idle-high':(avg>=5?'idle-med':'idle-ok'));
h+='<tr>';
h+='<td style="color:#484f58">'+(idx+1)+'</td>';
h+='<td style="color:#58a6ff;font-weight:600">'+d.name+'</td>';
h+='<td>'+d.total+'</td>';
h+='<td style="color:#3fb950">'+d.onClock+'</td>';
h+='<td style="color:#f59e0b">'+d.onBreak+'</td>';
h+='<td style="color:#8b949e">'+d.offClock+'</td>';
h+='<td style="color:#da3633;font-weight:700">'+d.currentlyIdle+'</td>';
h+='<td><span class="idle-badge '+avgCls+'">'+avg+'m</span></td>';
h+='<td style="font-weight:700">'+Math.round(d.idle)+'m</td>';
h+='</tr>';
});
h+='</tbody></table>';

pan.innerHTML=h;
}

// ========== DRAW HEATMAP ==========
function drawHeatmap(){
var pan=_d.getElementById('pan-hm');
if(!pan)return;

var all=Object.values(S.filteredData);
if(all.length===0){
pan.innerHTML='<div style="text-align:center;padding:40px;color:#8b949e">\uD83D\uDFE5 No data yet</div>';
return;
}

// Create hourly heatmap data
var hours=[];
for(var i=0;i<24;i++)hours.push({hour:i,count:0,totalIdle:0});

all.forEach(function(aa){
var segs=aa.allSegs||aa.segs||[];
segs.forEach(function(seg){
var ssMin=timeToMin(seg.ss);
var hr=Math.floor(ssMin/60)%24;
hours[hr].count++;
hours[hr].totalIdle+=seg.dur||0;
});
});

var maxIdle=Math.max.apply(null,hours.map(function(h){return h.totalIdle;}))||1;

var h='<h3 style="color:#58a6ff;margin:0 0 16px;font-size:14px">\uD83D\uDFE5 Idle Heatmap — By Hour of Day</h3>';
h+='<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:16px">';

hours.forEach(function(hr){
var intensity=hr.totalIdle/maxIdle;
var r=Math.round(218*intensity);
var g=Math.round(54*intensity);
var b=Math.round(51*intensity);
var bg='rgb('+r+','+g+','+b+')';
if(intensity<0.1)bg='#161b22';

var label=(hr.hour<10?'0':'')+hr.hour+':00';
h+='<div style="width:60px;height:60px;background:'+bg+';border:1px solid #21262d;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:default" title="'+label+': '+hr.count+' idle segs, '+hr.totalIdle+' total mins">';
h+='<div style="font-size:9px;color:#8b949e">'+label+'</div>';
h+='<div style="font-size:14px;font-weight:700;color:'+(intensity>0.5?'#fff':'#c9d1d9')+'">'+hr.totalIdle+'m</div>';
h+='<div style="font-size:8px;color:#484f58">'+hr.count+' segs</div>';
h+='</div>';
});
h+='</div>';

// Legend
h+='<div style="display:flex;gap:12px;align-items:center;font-size:10px;color:#8b949e">';
h+='<span>Legend:</span>';
h+='<span><span style="display:inline-block;width:12px;height:12px;background:#161b22;border:1px solid #21262d;border-radius:2px;vertical-align:middle"></span> Low</span>';
h+='<span><span style="display:inline-block;width:12px;height:12px;background:rgb(109,27,25);border-radius:2px;vertical-align:middle"></span> Medium</span>';
h+='<span><span style="display:inline-block;width:12px;height:12px;background:rgb(218,54,51);border-radius:2px;vertical-align:middle"></span> High</span>';
h+='</div>';

pan.innerHTML=h;
}

// ========== DRAW TRENDS ==========
function drawTrends(){
var pan=_d.getElementById('pan-trend');
if(!pan)return;

var hist=S.scanHistory||[];
if(hist.length===0){
pan.innerHTML='<div style="text-align:center;padding:40px;color:#8b949e">\uD83D\uDCC8 No scan history yet. Scan data will appear after multiple scans.</div>';
return;
}

var h='<h3 style="color:#58a6ff;margin:0 0 16px;font-size:14px">\uD83D\uDCC8 Scan Trends — Last '+hist.length+' Scans</h3>';

// Scan history table
h+='<table class="dt"><thead><tr>';
h+='<th>#</th><th>Time</th><th>Total</th><th>Success</th><th>Failed</th>';
h+='</tr></thead><tbody>';

hist.slice().reverse().forEach(function(s,idx){
var t=new Date(s.time);
var timeStr=t.toLocaleTimeString('en-US',{hour12:true,hour:'2-digit',minute:'2-digit'});
var dateStr=t.toLocaleDateString('en-US',{month:'short',day:'numeric'});
h+='<tr>';
h+='<td style="color:#484f58">'+(idx+1)+'</td>';
h+='<td style="color:#8b949e">'+dateStr+' '+timeStr+'</td>';
h+='<td>'+s.count+'</td>';
h+='<td style="color:#3fb950">'+s.success+'</td>';
h+='<td style="color:'+(s.fail>0?'#ef4444':'#3fb950')+'">'+s.fail+'</td>';
h+='</tr>';
});
h+='</tbody></table>';

// Daily summary if available
var daily=loadDailySummary();
if(daily&&Object.keys(daily).length>0){
h+='<h3 style="color:#58a6ff;margin:16px 0;font-size:14px">\uD83D\uDCC5 Daily Summary — Last 7 Days</h3>';
h+='<table class="dt"><thead><tr>';
h+='<th>Date</th><th>AAs Scanned</th><th>Avg Idle</th><th>Max Idle</th><th>Zero Idle</th>';
h+='</tr></thead><tbody>';

var dates=Object.keys(daily).sort().reverse().slice(0,7);
dates.forEach(function(d){
var ds=daily[d];
h+='<tr>';
h+='<td style="color:#58a6ff">'+d+'</td>';
h+='<td>'+(ds.count||0)+'</td>';
h+='<td><span class="idle-badge '+(ds.avg>=15?'idle-high':'idle-ok')+'">'+Math.round(ds.avg||0)+'m</span></td>';
h+='<td style="color:#ef4444;font-weight:700">'+Math.round(ds.max||0)+'m</td>';
h+='<td style="color:#3fb950">'+(ds.zero||0)+'</td>';
h+='</tr>';
});
h+='</tbody></table>';
}

pan.innerHTML=h;
}

// ========== SAVE DAILY SUMMARY ==========
function saveDailySummary(){
var today=new Date().toISOString().slice(0,10);
var daily=loadDailySummary();
var all=Object.values(S.filteredData);
if(all.length===0)return;

var totalIdle=0,maxIdle=0,zeroCount=0;
all.forEach(function(aa){
var idle=aa.totalIdleMin||0;
totalIdle+=idle;
if(idle>maxIdle)maxIdle=idle;
if(idle===0)zeroCount++;
});

daily[today]={count:all.length,avg:totalIdle/all.length,max:maxIdle,zero:zeroCount};

// Keep only last 31 days
var keys=Object.keys(daily).sort().reverse();
if(keys.length>31){
keys.slice(31).forEach(function(k){delete daily[k];});
}

try{localStorage.setItem(LS_W,JSON.stringify(daily));}catch(e){}
}

// ========== LOAD DAILY SUMMARY ==========
function loadDailySummary(){
try{return JSON.parse(localStorage.getItem(LS_W))||{};}catch(e){return{};}
}
// === END PART 11 — paste Part 12 directly below ===


// === PART 12 (FINAL): REPORT + CSV + BULK FANS + INIT — Paste directly after Part 11 ===

// ========== DRAW REPORT ==========
function drawReport(){
var pan=_d.getElementById('pan-rpt');
if(!pan)return;

var all=Object.values(S.filteredData);
if(all.length===0){
pan.innerHTML='<div style="text-align:center;padding:40px;color:#8b949e">\uD83D\uDCCB No data for report. Scan first.</div>';
return;
}

var totalIdle=0,maxIdle=0,maxLogin='',idle0=0,onClock=0,offClock=0,onBreak=0,curIdle=0;
all.forEach(function(aa){
var idle=aa.totalIdleMin||0;
totalIdle+=idle;
if(idle>maxIdle){maxIdle=idle;maxLogin=aa.login;}
if(idle===0)idle0++;
if(aa.clockStatus==='on')onClock++;
if(aa.clockStatus==='off')offClock++;
if(aa.clockStatus==='break')onBreak++;
if(aa.isIdle&&aa.clockStatus==='on')curIdle++;
});

var avg=all.length>0?Math.round(totalIdle/all.length):0;
var now=new Date();
var dateStr=now.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
var timeStr=now.toLocaleTimeString('en-US',{hour12:true});

var h='<div class="sf-card" style="max-width:700px;margin:0 auto">';
h+='<div style="text-align:center;margin-bottom:16px">';
h+='<div style="font-size:18px;font-weight:800;color:#58a6ff">\uD83D\uDCCA FCLM Idle Time Report</div>';
h+='<div style="font-size:11px;color:#8b949e">'+C.wh+' \u2014 '+dateStr+' at '+timeStr+'</div>';
h+='<div style="font-size:9px;color:#484f58;margin-top:4px">Generated by FCLM Idle Tracker v7.9 PRO (Built by mualyanm)</div>';
h+='</div>';

h+='<table style="width:100%;border-collapse:collapse">';
var rows=[
['\uD83D\uDC65 Total Associates',all.length],
['\uD83D\uDFE2 On Clock',onClock],
['\u2615 On Break',onBreak],
['\uD83D\uDD34 Off Clock',offClock],
['\u26A0\uFE0F Currently Idle',curIdle],
['\uD83D\uDCCA Average Idle',avg+'m'],
['\uD83D\uDD3A Max Idle',maxIdle+'m ('+maxLogin+')'],
['\u2705 Zero Idle',idle0],
['\u23F1 Scan Time',timeStr]
];
rows.forEach(function(r){
h+='<tr style="border-bottom:1px solid #21262d"><td style="padding:8px 12px;color:#8b949e;font-size:12px">'+r[0]+'</td><td style="padding:8px 12px;font-weight:700;font-size:12px;text-align:right">'+r[1]+'</td></tr>';
});
h+='</table>';

// Buckets summary
h+='<div style="margin-top:16px;font-size:12px;font-weight:700;color:#58a6ff;margin-bottom:8px">Idle Distribution</div>';
h+='<table style="width:100%;border-collapse:collapse">';
BK.forEach(function(b){
if(b.label==='All')return;
var cnt=all.filter(function(aa){
var idle=aa.totalIdleMin||0;
if(b.label==='60m+')return idle>=60;
return idle>=b.min&&idle<b.max;
}).length;
var pct=all.length>0?Math.round(cnt/all.length*100):0;
h+='<tr style="border-bottom:1px solid #21262d">';
h+='<td style="padding:6px 12px;font-size:11px;color:'+b.color+'">'+b.label+'</td>';
h+='<td style="padding:6px 12px;font-size:11px;text-align:right">'+cnt+' AAs ('+pct+'%)</td>';
h+='</tr>';
});
h+='</table>';

h+='<div style="margin-top:16px;display:flex;gap:8px;justify-content:center">';
h+='<button class="btn btn-go" id="rpt-copy">\uD83D\uDCCB Copy Report</button>';
h+='<button class="btn btn-imp" id="rpt-csv">\uD83D\uDCC4 Export CSV</button>';
h+='</div>';
h+='</div>';

pan.innerHTML=h;

// Copy Report
var copyBtn=_d.getElementById('rpt-copy');
if(copyBtn)copyBtn.addEventListener('click',function(){
var text='FCLM Idle Time Report - '+C.wh+'\n';
text+=dateStr+' at '+timeStr+'\n';
text+='Generated by FCLM Idle Tracker v7.9 PRO (Built by mualyanm)\n\n';
rows.forEach(function(r){text+=r[0]+': '+r[1]+'\n';});
try{
var ta=_d.createElement('textarea');ta.value=text;
_d.body.appendChild(ta);ta.select();_d.execCommand('copy');
_d.body.removeChild(ta);
stt('\uD83D\uDCCB Report copied to clipboard!');
}catch(e){stt('\u26A0\uFE0F Copy failed');}
});

// CSV Export
var csvBtn=_d.getElementById('rpt-csv');
if(csvBtn)csvBtn.addEventListener('click',function(){exportCSV();});
}

// ========== EXPORT CSV ==========
function exportCSV(){
var all=Object.values(S.filteredData);
if(all.length===0){stt('No data to export');return;}

var shiftMin=getShiftMinutes();
var todayStr=new Date().toISOString().slice(0,10);
var rows=[];
rows.push(['#','Login','Name','Department','Clock Status','Status','Current Idle (min)','Shift Idle (min)','Idle %','Last Activity','Flag','Note','FANS Sent Today'].join(','));

all.sort(function(a,b){return(b.totalIdleMin||0)-(a.totalIdleMin||0);});

all.forEach(function(aa,idx){
var idle=Math.round(aa.totalIdleMin||0);
var curIdle=Math.round(aa.currentIdleMin||0);
var pct=shiftMin>0?Math.round(idle/shiftMin*100):0;
var status=aa.clockStatus==='off'?'Off Clock':(aa.clockStatus==='break'?'Break':(aa.isIdle?'Idle':'Working'));
var flag=getFlag(aa.login);
var note=(getNote(aa.login)||'').replace(/,/g,';').replace(/\n/g,' ');
var fansToday=0;
if(FANS_SENT[aa.login]){
FANS_SENT[aa.login].forEach(function(l){if(l.time&&l.time.slice(0,10)===todayStr)fansToday++;});
}

rows.push([
idx+1,
aa.login,
'"'+(aa.name||'')+'"',
'"'+(aa.dept||'')+'"',
aa.clockStatus||'unknown',
status,
curIdle,
idle,
pct+'%',
'"'+(aa.lastActivity||'')+'"',
flag,
'"'+note+'"',
fansToday
].join(','));
});

var csv=rows.join('\n');
var blob=new Blob([csv],{type:'text/csv'});
var url=URL.createObjectURL(blob);
var a=_d.createElement('a');
a.href=url;
a.download='FCLM_Idle_Report_'+C.wh+'_'+todayStr+'.csv';
a.click();
URL.revokeObjectURL(url);
stt('\uD83D\uDCC4 CSV exported!');
}

// ========== BULK FANS HELPER ==========
function bulkFANS(category){
var all=Object.values(S.filteredData);
var targets=[];

all.forEach(function(aa){
if(aa.clockStatus==='off'||aa.clockStatus==='break')return;
var idle=aa.totalIdleMin||0;
if(category==='medium'&&idle>=5&&idle<15)targets.push(aa);
if(category==='high'&&idle>=15&&idle<30)targets.push(aa);
if(category==='critical'&&idle>=30)targets.push(aa);
});

if(targets.length===0){stt('No AAs in '+category+' category');return;}
if(!confirm('Send FANS to '+targets.length+' AAs in '+category.toUpperCase()+' category?'))return;

var sent=0;
targets.forEach(function(aa,i){
setTimeout(function(){
sendFANS(aa.login,'bulk-'+category,true);
sent++;
stt('\uD83D\uDCE8 Bulk FANS: '+sent+'/'+targets.length+' ('+category+')');
},i*1500);
});
}

// ========== CHECK AUTO FANS ==========
function checkAutoFANS(){
if(!C.fans.enabled)return;

Object.keys(S.filteredData).forEach(function(login){
var aa=S.filteredData[login];
if(aa.clockStatus==='off'||aa.clockStatus==='break')return;

// Auto FANS on live idle
if(C.fans.autoLive&&aa.isIdle&&aa.currentIdleMin>=C.fans.autoLiveMin){
sendFANS(login,'auto-live',true);
}

// Auto FANS on shift idle
if(C.fans.autoShift&&aa.totalIdleMin>=C.fans.autoShiftMin){
sendFANS(login,'auto-shift',true);
}
});
}

// ========== UPDATE LIVE IDLE COUNT ==========
function updLiveCount(){
var cnt=0;
Object.values(S.filteredData).forEach(function(aa){
if(aa.isIdle&&aa.clockStatus==='on')cnt++;
});
var el=_d.getElementById('b-live-cnt');
if(el){
el.textContent='\uD83D\uDD34 '+cnt+' Idle';
if(cnt>0){el.classList.add('active');}else{el.classList.remove('active');}
}
}

// ========== UPDATE BADGE ==========
function updBadge(){
var sv=_d.getElementById('b-saved');
var sn=_d.getElementById('b-sn');
var cl=_d.getElementById('b-clear');
if(sv)sv.style.display=LOGINS.length>0?'flex':'none';
if(sn)sn.textContent=LOGINS.length;
if(cl)cl.style.display=LOGINS.length>0?'inline-block':'none';
}

// ========== FLASH TAB ==========
var flashInt=null;
function flashTab(){
if(flashInt)return;
var orig=_d.title;var on=true;
flashInt=setInterval(function(){
_d.title=on?'\u26A0\uFE0F IDLE ALERT!':orig;on=!on;
},1000);
setTimeout(function(){stopTab();},15000);
}
function stopTab(){
if(flashInt){clearInterval(flashInt);flashInt=null;}
_d.title='FCLM Idle Tracker';
}

// ========== INIT ==========
function init(){
addStyles();
buildUI();
bindEvents();
loadLogins();
loadAAData();
updBadge();

// If data exists, draw dashboard
if(Object.keys(S.data).length>0){
buildFilteredData();
drawDash();
}

stt('\u2705 v7.9 PRO Ready \u2014 '+LOGINS.length+' logins loaded');
}

// ========== START ==========
if(_d.readyState==='loading'){
_d.addEventListener('DOMContentLoaded',init);
}else{
init();
}

// Expose for console debugging
_w._IDT={S:S,C:C,LOGINS:LOGINS,NOTES:NOTES,FLAGS:FLAGS,FANS_SENT:FANS_SENT,drawDash:drawDash};

})();
// === END OF SCRIPT — v7.9 PRO COMPLETE ===


