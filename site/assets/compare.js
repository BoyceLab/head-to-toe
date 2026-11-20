"use strict";
/* Before and after page. Reads the redesign (bank) and the original survey with its crosswalk,
   both embedded by scripts/build.py. One stage at a time, like the survey itself. */
const B = JSON.parse(document.getElementById('bank').textContent);
const C = JSON.parse(document.getElementById('compare').textContent);
const O = C.original, CW = C.crosswalk, LAB = B.labels || {}, NOW = C.current_labels || {};
const TYPES = CW.change_types || {};
const SZ = C.seizure, SZC = C.seizure_crosswalk || {pages:[]};
const SZTYPES = SZC.change_types || {};
/* follow-up questions by key, for redesign targets written as q:<key> */
const QS = {}; B.seizures.forEach(m=>(m.context||[]).forEach(q=>{ QS[q.k]={q, step:m.t}; }));
const PAGE_LABELS = {you:'The Who is answering page, which sets the wording for every later question', testing:'The Genetic testing page', family:'The shared Family history page, with relatives and side of the family', more:'The Anything else page: a plain-language search of HPO terms, then a free-text box', review:'The Review and export page'};
const esc = s => String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const SELF = {you:'you',You:'You',your:'your',HasHad:'Have you had',have_has:'have',were_was:'were',is_are:'are',Is_Are:'Are'};
const tk = s => String(s||'').replace(/\{(\w+)\}/g,(m,k)=>SELF[k]!==undefined?SELF[k]:m);
let changedOnly = false, cur = 'overview';

/* where each redesign term lives */
const IDX = {};
function index(items, where, parent){ (items||[]).forEach(it=>{ if(!IDX[it.h]) IDX[it.h]={it, where, parent}; index(it.c, where, it.h); }); }
B.systems.forEach(s=>index(s.items, s.t));
B.seizures.forEach(m=>index(m.items, 'Seizure follow-up: '+m.t));
const SYS = Object.fromEntries(B.systems.map(s=>[s.k,s]));
const OSCREEN = Object.fromEntries(O.screen.map(s=>[s.key,s]));
const ODETAIL = Object.fromEntries(O.detail.map(s=>[s.key,s]));
const CWS = Object.fromEntries((CW.sections||[]).map(s=>[s.section,s.rows]));
/* redesign term -> the original row that it replaces, in any section */
const FROM = {};
(CW.sections||[]).forEach(sec=>sec.rows.forEach(r=>(r.redesign||[]).forEach(t=>{ if(!FROM[t]) FROM[t]={section:sec.section, row:r}; })));
const shownWhen = s => { const m=/question (\d+)/.exec(s||''); return m ? 'shown when the answer to question '+m[1]+' is Yes' : 'shown when '+s; };

const chip = (k, label, types) => '<span class="chip '+esc(k)+'">'+esc(label || (types||TYPES)[k] || k)+'</span>';
function termLine(h){ return '<div class="term">'+esc(h)+(LAB[h]?' '+esc(LAB[h]):'')+'</div>'; }
function target(h, sectionTitle){
  const x = IDX[h]; if(!x) return '<div class="target">'+termLine(h)+'</div>';
  const kids = (x.it.c||[]).map(k=>k.p);
  return '<div class="target"><div class="lab">'+esc(tk(x.it.p))+'</div>'+(x.it.d?'<div class="desc">'+esc(tk(x.it.d))+'</div>':'')+termLine(h)+
    (kids.length?'<div class="kidsline">More specific choices: '+esc(kids.join('; '))+'</div>':'')+
    (x.where!==sectionTitle?'<div class="kidsline">Asked in '+esc(x.where)+'</div>':'')+'</div>';
}
function origCell(r){
  const h=r.hpo_id; const now = h ? NOW[h] : null;
  const printed = r.hpo_as_printed || 'No term printed';
  let flag='';
  if(now && /obsolete/.test(now)) flag='Now obsolete in HPO';
  return '<div class="lab">'+esc(r.answer)+'</div>'+(r.description?'<div class="desc">'+esc(r.description)+'</div>':'')+
    '<div class="term">As printed: '+esc(printed)+'</div>'+(now && h && !printed.toLowerCase().startsWith(now.toLowerCase())?'<div class="term">'+esc(h)+' in the current release: '+esc(now)+'</div>':'')+(flag?'<div class="flag">'+flag+'</div>':'');
}

/* ---------- stages ---------- */
function stages(){
  const L=[{id:'overview',g:'Overview',t:'How the flow changed',r:rOverview},
    {id:'about-you',g:'Opening questions',t:'About you',r:rAboutYou},
    {id:'diagnosis',g:'Opening questions',t:'Diagnosis',r:rReason},
    {id:'testing',g:'Opening questions',t:'Genetic testing',r:rTesting},
    {id:'screen',g:'Head-to-toe screen',t:'The body-system screen',r:rScreen}];
  B.systems.forEach(s=>L.push({id:'sys-'+s.k,g:'Body systems',t:s.t,r:()=>rSystem(s)}));
  L.push({id:'detail',g:'New pages',t:'More specific choices and timing',r:rDetail});
  L.push({id:'family',g:'New pages',t:'Family history',r:rFamily});
  L.push({id:'end',g:'End of survey',t:'Closing questions and the record',r:rEnd});
  if(SZ) SZ.pages.forEach(pg=>L.push({id:'sz-'+pg.key,g:'Seizure survey',t:pg.title,r:()=>rSzPage(pg)}));
  return L;
}
const GROUPS=['Overview','Opening questions','Head-to-toe screen','Body systems','New pages','End of survey'].concat(SZ?['Seizure survey']:[]);

function go(id, keep){ const L=stages(); if(!L.find(s=>s.id===id)) id=L[0].id; cur=id; try{ history.replaceState(null,'','#'+id); }catch(e){} render(keep); }
function render(keep){
  const L=stages(); const i=L.findIndex(s=>s.id===cur); const st=L[i]; const y=window.scrollY;
  document.getElementById('stage').innerHTML='<div class="stagehead"><span class="kicker">'+esc(st.g)+'</span><h2>'+esc(st.t)+'</h2></div>'+st.r();
  document.getElementById('jump').innerHTML=GROUPS.map(g=>'<button type="button" data-go-group="'+esc(g)+'" aria-current="'+(g===st.g)+'">'+esc(g)+'</button>').join('');
  const inG=L.filter(s=>s.g===st.g);
  document.getElementById('substeps').innerHTML=inG.length>1?inG.map(s=>'<button type="button" data-go="'+s.id+'" aria-current="'+(s.id===cur)+'">'+esc(s.t)+'</button>').join(''):'';
  document.getElementById('prog').style.width=Math.round(100*i/(L.length-1))+'%';
  document.getElementById('prevBtn').disabled=i===0;
  document.getElementById('nextBtn').disabled=i===L.length-1;
  document.getElementById('nextBtn').textContent=i<L.length-1?'Next: '+L[i+1].t:'Next';
  window.scrollTo(0, keep?y:0);
}

/* ---------- renderers ---------- */
function pair(left, right){ return '<div class="cols"><div class="card"><div class="colhead">Original (2018)</div>'+left+'</div><div class="card"><div class="colhead">Redesign</div>'+right+'</div></div>'; }
function opts(list){ return '<ul class="optlist">'+(list||[]).map(o=>'<li>'+esc(o)+'</li>').join('')+'</ul>'; }

function rOverview(){
  let h='<p>Each stage sets a part of the original GenomeConnect Health Survey, as printed in the 2018 supplement, beside its redesign. Body-system pages match every original answer to the redesign items that take its place, using the crosswalk file in the repository, and then list items that are new. Switch on <strong>Only rows that changed</strong> to hide answers that kept the same term and only gained plain wording.</p>';
  h+=pair('<ol class="flow"><li>Gender or sex, in one question</li><li>Genetic testing: whether, what kind, why, and whether you have a copy</li><li>Body-system screen, Yes, No, or Unsure; only Yes opens a detail page</li><li>Detail pages: select all that apply, then age at first symptoms and age at diagnosis for each item, and a free-text box</li><li>How you heard about the registry, and group membership</li></ol>',
    '<ol class="flow"><li>Who is answering, age band, sex recorded at birth, and optional gender identity</li><li>Whether a doctor has named a diagnosis</li><li>Genetic testing with branches for result, sample tested, and reanalysis</li><li>Body-system screen, Yes, No, or Not sure; Yes and Not sure both open the detail page</li><li>Detail pages: Yes, No, or Not sure for each item, more specific choices drawn from HPO, when it started in choices that fit the person\'s age, and whether it is present now</li><li>Follow-up questions about seizures, only when Seizures is answered Yes</li><li>Family history</li><li>A plain-language search for anything not listed, a free-text box, and how you heard about the survey</li><li>Review, and a record shaped like a GA4GH Phenopacket, with excluded findings</li></ol>');
  if(SZ) h+='<p>The <strong>Seizure survey</strong> stages compare the GenomeConnect Seizure Survey (version '+esc(SZ.version)+', dated '+esc(SZ.dated)+') with the seizure follow-up questions, which appear only when Seizures is answered Yes. The seizure survey printed no HPO terms, so its rows say where each answer is now stored.</p>';
  h+='<h3>What the labels on each row mean</h3><div class="legendrow">'+Object.entries(TYPES).map(([k,v])=>chip(k,v)).join('')+chip('new','New in the redesign')+'</div>';
  const fixes=(B.notes||{}).fixes||[];
  h+='<p class="small muted">Rows marked <strong>Term corrected</strong> or <strong>Retired term replaced</strong> change what a stored answer means, and are listed together in the Design notes of the survey.</p>';
  return h;
}
function rAboutYou(){
  const q=(O.intro[0]||{}).questions||[];
  return pair(q.map(x=>'<p><strong>'+esc(x.question)+'</strong></p>'+opts(x.options)).join(''),
    '<p><strong>Who is filling out this survey?</strong></p>'+opts(['I am answering about myself','I am a parent or guardian answering about a child','I am a family member or caregiver answering about an adult','I am a family member answering about someone who has died'])+
    '<p><strong>How old are you now?</strong> Age bands, from under 1 year to 65 or older, in place of a date of birth.</p>'+
    '<p><strong>What sex was recorded at birth?</strong></p>'+opts(['Female','Male','Intersex or a difference of sex development','Not sure','Prefer not to say'])+
    '<p><strong>Gender identity (optional)</strong></p>'+opts(['Woman','Man','Nonbinary','Another identity','Prefer not to say']))+
    '<p class="small">'+chip('corrected','Separated')+' The original combined sex and gender identity in one question. Phenotype interpretation uses sex recorded at birth, so the redesign asks it on its own and makes gender identity a separate, optional question. Who is answering changes the wording of every later question.</p>';
}
function rReason(){
  return pair('<p class="none">Not in the original.</p>',
    '<p><strong>Has a doctor named a diagnosis?</strong> Yes, with a box for the name; Not yet; Not sure.</p>')+'<p class="small">'+chip('new','New in the redesign')+'</p>';
}
function rTesting(){
  const q=(O.intro[1]||{}).questions||[];
  return pair(q.map(x=>'<p><strong>'+esc(x.question)+'</strong></p>'+(x.help?'<p class="desc small">'+esc(x.help)+'</p>':'')+opts(x.options)).join(''),
    '<p><strong>Have you had genetic testing?</strong> Yes, No, or Not sure.</p>'+
    '<p><strong>What kind of testing?</strong> The original types, plus a repeat expansion test and mitochondrial DNA testing.</p>'+
    '<p><strong>Which sample was tested?</strong> Blood, saliva or cheek swab, skin, or tissue removed during surgery.</p>'+
    '<p><strong>Why was testing done?</strong> The original reasons, with family history without symptoms and being proactive while healthy as separate answers, and family planning added.</p>'+
    '<p><strong>What did the result say?</strong> A genetic cause, a variant of uncertain significance (VUS), nothing found, still waiting, or not sure. A cause or VUS asks the gene name; nothing found or a VUS asks about reanalysis.</p>'+
    '<p><strong>Do you have a copy of the report?</strong> Kept, with a note that a coordinator can help request one.</p>')+
    '<p class="small">'+chip('split','Branches added')+' The sample question records whether a tissue other than blood was tested, which helps a reviewer judge whether a variant present in only some cells could have been missed.</p>';
}
function rScreen(){
  let h='<p>The screen asks one question per body system. In the original only Yes opened a detail page; in the redesign Yes and Not sure both do, and a new speech and swallowing section takes the throat and swallowing item out of head, face, and neck.</p><div class="crows"><div class="crow headrow"><div>Original (2018)</div><div>What changed</div><div>Redesign</div></div>';
  B.systems.forEach(s=>{
    const o=OSCREEN[s.k];
    const left = o ? '<div class="lab">'+esc(o.number+'. '+o.question)+'</div>'+(o.examples?'<div class="desc">'+esc(o.examples)+'</div>':'')+'<div class="term">'+esc((o.options||[]).join(' / '))+'</div>' : '<div class="none">Not in the original</div>';
    const ch = o ? chip('same','Reworded; Not sure opens details') : chip('new','New in the redesign');
    h+='<div class="crow'+(o?'':' is-new')+'"><div class="o">'+left+'</div><div class="why">'+ch+'</div><div class="n"><div class="lab">'+esc(tk(s.stem))+'</div><div class="desc">'+esc(tk(s.ex))+'</div><div class="term">Yes / No / Not sure</div></div></div>';
  });
  return h+'</div>';
}
function rSystem(s){
  const od=ODETAIL[s.k], os=OSCREEN[s.k], rows=CWS[s.k]||[];
  let h='';
  if(od){
    const tc=(od.time_columns||[]).length ? '<p class="small">Each checked item then asks: '+esc(od.time_columns.join(' and '))+(od.time_options?' ('+esc(od.time_options.slice(0,4).join(', '))+', and so on)':'')+'. A free-text box follows for anything not listed.</p>' : '<p class="small">A free-text box follows for anything not listed.</p>';
    h+=pair('<p><strong>'+esc(od.heading)+'</strong>, '+esc(shownWhen(od.shown_when))+(s.k==='mouth'?' <span class="flag">(the oral health screen is question 19)</span>':'')+'.</p>'+(od.questions[0]?'<p>'+esc(od.questions[0].question)+'</p>':'')+(od.notes||[]).map(n=>'<p class="desc small">'+esc(n)+'</p>').join('')+tc,
      '<p><strong>'+esc(s.t)+'</strong>, shown when the screen answer is Yes or Not sure.</p><p>Every item is answered Yes, No, or Not sure. A Yes opens more specific choices where they exist, when it started, in choices that fit the person\'s age, and whether it is present now. A button records every remaining item as No.</p><p class="small">Anything not listed is added through the plain-language search near the end of the survey.</p>');
  } else {
    h+=pair('<p class="none">Not a separate section in the original. Throat and swallowing difficulties sat under head, face, and neck.</p>','<p><strong>'+esc(s.t)+'</strong>: '+esc(tk(s.stem))+'</p><p class="desc">'+esc(tk(s.ex))+'</p>');
  }
  h+='<div class="crows"><div class="crow headrow"><div>Original answer</div><div>What changed</div><div>Redesign</div></div>';
  const used=new Set();
  const orows = od ? od.rows : [];
  rows.forEach(cw=>{
    (cw.redesign||[]).forEach(t=>{ used.add(t); let p=IDX[t]&&IDX[t].parent; while(p){ used.add(p); p=IDX[p]&&IDX[p].parent; } });
    if(changedOnly && cw.change==='same') return;
    const r = orows.find(x=>x.answer===cw.original) || {answer:cw.original};
    const right = (cw.redesign||[]).length ? cw.redesign.map(t=>target(t, s.t)).join('') : '<div class="none">'+(cw.change==='answer'?'Handled across the whole survey':'Not asked')+'</div>';
    h+='<div class="crow"><div class="o">'+origCell(r)+'</div><div class="why">'+chip(cw.change)+(cw.note?'<div class="small" style="margin-top:4px">'+esc(cw.note)+'</div>':'')+'</div><div class="n">'+right+'</div></div>';
  });
  (s.items||[]).forEach(it=>{
    const covered = used.has(it.h) || (it.c||[]).some(k=>used.has(k.h));
    if(covered) return;
    const f = FROM[it.h] || (it.c||[]).map(k=>FROM[k.h]).find(Boolean);
    if(f && f.section!==s.k){
      if(changedOnly && f.row.change==='same') return;
      const od2=ODETAIL[f.section]; const r2=(od2?od2.rows:[]).find(x=>x.answer===f.row.original)||{answer:f.row.original};
      h+='<div class="crow"><div class="o">'+origCell(r2)+'<div class="kidsline">In the original '+esc(od2?od2.heading:f.section)+' section</div></div><div class="why">'+chip(f.row.change==='merged'?'merged':'moved')+(f.row.note?'<div class="small" style="margin-top:4px">'+esc(f.row.note)+'</div>':'')+'</div><div class="n">'+target(it.h, s.t)+'</div></div>';
      return;
    }
    h+='<div class="crow is-new"><div class="o"><div class="none">Not in the original</div></div><div class="why">'+chip('new','New in the redesign')+'</div><div class="n">'+target(it.h, s.t)+'</div></div>';
  });
  return h+'</div>';
}
function rDetail(){
  const by=B.onset.by, lab=Object.fromEntries(B.onset.options.map(o=>[o[0],o[1]]));
  const line=(k,who)=>'<p><strong>'+who+':</strong> '+esc(by[k].map(x=>lab[x]).join('; '))+'</p>';
  return '<h3>More specific choices</h3>'+pair('<p>Each detail page was one list of general answers, such as <em>Skull</em>, <em>General face shape</em>, or <em>Hand differences</em>, each mapped to a broad HPO term. There was no way to say which difference.</p>',
    '<p>A Yes opens specific choices in plain words, such as a broad forehead, a skin fold at the inner corner of the eye, or inverted nipples. A longer list drawn from HPO, limited to terms used in disease annotations, sits behind a link under each Yes, and each choice can open its own more specific choices. The record keeps the most specific term chosen.</p>')+
    '<h3>When it started</h3>'+pair('<p>Every checked item asked age at first symptoms and age at diagnosis from one long list: before birth, 0 to 3 months, 4 to 7 months, 8 to 11 months, then every single year to 70 and older.</p>',
    '<p>One question, with choices that follow the person\'s current age, each mapped to an HPO onset term. A second question asks whether the feature is present now or only in the past.</p>'+line('a0','Under 1 year old')+line('a1','1 to 4 years old')+line('a2','5 to 11 years old')+line('a3','12 to 17 years old')+line('a6','Adults (choices stop at the person\'s own age band)'));
}
function rFamily(){
  return pair('<p class="none">Not in the original. Family history appeared only as a reason for testing.</p>',
    '<p><strong>Are the biological parents related to each other by blood?</strong></p><p>Then, for each condition, Yes, No, or Not sure, with which relatives and which side of the family:</p>'+opts((B.family||[]).map(f=>f[1])))+'<p class="small">'+chip('new','New in the redesign')+'</p>';
}
function rEnd(){
  return pair((O.end||[]).map(x=>'<p><strong>'+esc(x.question)+'</strong></p>'+opts(x.options)).join(''),
    '<p><strong>Anything else</strong>: a plain-language search across HPO layperson synonyms, then a free-text box.</p><p><strong>How did you hear about this survey?</strong> Generic categories: a doctor, a genetic counselor, a lab report, an internet search, social media, a patient or family organization, a research study, a friend or family member, or other.</p><p><strong>Are you part of a patient organization or research registry?</strong> Yes, No, or Not sure, with an optional name. A program using the survey would list its own partners.</p><p><strong>Review and export</strong>: findings present, looked for and not present, and not sure, with a record shaped like a GA4GH Phenopacket.</p>')+
    '<p class="small">'+chip('replaced','Generic categories')+' The original membership list named specific organizations; the redesign uses categories so the template does not depend on any one group.</p>';
}

/* ---------- seizure survey ---------- */
function szOpts(q){ const o=q.options; if(o==='age_options') return SZ.age_options; return (o||[]).map(x=>typeof x==='string'?x:x.label); }
function szOrigCell(pg, row){
  const o=String(row.original); const key=o.split(':')[0].split(' ')[0];
  if(key==='all') return '<div class="lab">Every page</div><div class="desc">Keep in mind that, throughout this survey, you are providing information about yourself.</div>';
  const q=(pg.questions||[]).find(x=>x.key===key); if(!q) return esc(o);
  if(o.indexOf(': ')>0){ const lab=o.split(': ').slice(1).join(': '); const opt=(q.options||[]).find(x=>(typeof x==='string'?x:x.label)===lab);
    return '<div class="lab">'+esc(lab)+'</div>'+(opt&&opt.description?'<div class="desc">'+esc(opt.description)+'</div>':'')+'<div class="term">Option in: '+esc(q.question.slice(0,90))+(q.question.length>90?'…':'')+'</div>'; }
  if(/ per /.test(o)){ const pc=(q.per_choice||[]).map(p=>p.question+': '+szOpts(p).slice(0,8).join(', ')+(szOpts(p).length>8?', …':'')); return '<div class="lab">Follow-up asked for each choice</div><div class="desc">'+esc(o.split(' per ')[1])+'</div>'+pc.map(x=>'<div class="term">'+esc(x)+'</div>').join(''); }
  const opts=szOpts(q);
  return '<div class="lab">'+esc(q.question)+'</div>'+(opts.length?'<div class="desc">'+esc(opts.slice(0,10).join(' / '))+(opts.length>10?' / …':'')+'</div>':'<div class="desc">Free text</div>');
}
function szTarget(t){
  if(t.indexOf('q:')===0){ const x=QS[t.slice(2)]; if(!x) return '<div class="target term">'+esc(t)+'</div>'; const q=x.q;
    const opts=(q.opts||[]); const per=(q.per||[]).map(p=>tk(p.q).replace(/\bX\b/g,'each one'));
    return '<div class="target"><div class="lab">'+esc(tk(q.q))+'</div>'+(q.type==='onset'?'<div class="desc">Age bands mapped to HPO onset terms</div>':q.type==='text'?'<div class="desc">Free text</div>':'<div class="desc">'+esc(opts.slice(0,10).join(' / '))+(opts.length>10?' / …':'')+'</div>')+(per.length?'<div class="kidsline">For each choice: '+esc(per.join(' '))+'</div>':'')+(q.hpo_if?'<div class="kidsline">Stored as HPO: '+esc(Object.entries(q.hpo_if).map(([a,h])=>a+' as '+h+' '+(LAB[h]||'')).join('; '))+'</div>':'')+'<div class="kidsline">Seizure follow-up: '+esc(x.step)+'</div></div>'; }
  if(t.indexOf('page:')===0) return '<div class="target"><div class="lab">'+esc(PAGE_LABELS[t.slice(5)]||t)+'</div></div>';
  const x=IDX[t]; if(!x) return '<div class="target">'+termLine(t)+'</div>';
  const kids=(x.it.c||[]).map(k=>k.p);
  return '<div class="target"><div class="lab">'+esc(tk(x.it.p))+'</div>'+termLine(t)+(kids.length?'<div class="kidsline">More specific choices: '+esc(kids.join('; '))+'</div>':'')+(x.it.freq?'<div class="kidsline">Asks when it started and how often now</div>':'')+'</div>';
}
function rSzPage(pg){
  const rows=((SZC.pages||[]).find(p=>p.page===pg.key)||{}).rows||[];
  let h='';
  if(pg.key==='consent') h+='<p>GenomeConnect Seizure Survey, version '+esc(SZ.version)+', dated '+esc(SZ.dated)+'. '+esc(SZ.note)+'</p>';
  if(pg.text) h+='<p class="muted">'+esc(pg.text)+'</p>';
  if(pg.key==='types'){
    const allRows=(SZC.pages||[]).reduce((a,p)=>a.concat(p.rows),[]); const extra=B.seizures[0].items.filter(it=>!allRows.some(r=>(r.redesign||[]).indexOf(it.h)>=0));
    if(extra.length) h+='<p class="small">Seizure types in the redesign that no original question covers: '+esc(extra.map(i=>i.p).join('; '))+'. Typical absence is offered beneath staring spells.</p>';
  }
  h+='<div class="crows"><div class="crow headrow"><div>Original question</div><div>What changed</div><div>Redesign</div></div>';
  rows.forEach(row=>{
    if(changedOnly && row.change==='same') return;
    const right=(row.redesign||[]).length? row.redesign.map(szTarget).join('') : '<div class="none">Not asked</div>';
    h+='<div class="crow"><div class="o">'+szOrigCell(pg,row)+'</div><div class="why">'+chip(row.change,null,SZTYPES)+(row.note?'<div class="small" style="margin-top:4px">'+esc(row.note)+'</div>':'')+'</div><div class="n">'+right+'</div></div>';
  });
  return h+'</div>';
}

/* ---------- events ---------- */
document.addEventListener('click', e=>{
  const t=e.target.closest('button'); if(!t) return; const d=t.dataset;
  if(d.goGroup!==undefined){ const s=stages().find(x=>x.g===d.goGroup); if(s) go(s.id); }
  else if(d.go!==undefined){ go(d.go); }
});
document.getElementById('prevBtn').onclick=()=>{ const L=stages(); const i=L.findIndex(s=>s.id===cur); if(i>0) go(L[i-1].id); };
document.getElementById('nextBtn').onclick=()=>{ const L=stages(); const i=L.findIndex(s=>s.id===cur); if(i<L.length-1) go(L[i+1].id); };
document.getElementById('toTop').onclick=e=>{ e.preventDefault(); window.scrollTo(0,0); };
document.getElementById('changedOnly').onchange=e=>{ changedOnly=e.target.checked; render(true); };
window.addEventListener('hashchange', ()=>{ const id=location.hash.slice(1); if(id && id!==cur) go(id); });
(function(){ const r=(B.config||{}).repo_url; const a=document.getElementById('repoLink'); if(r&&a){ a.href=r+'/issues/new/choose'; a.hidden=false; } })();
go(location.hash.slice(1)||'overview');
