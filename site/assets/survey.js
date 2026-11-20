"use strict";
/* Survey engine. Content comes from the JSON block that scripts/build.py embeds in index.html. */
const B = JSON.parse(document.getElementById('bank').textContent);
const LAB = B.labels;
const AGES = [['a0','Under 1 year'],['a1','1 to 4 years'],['a2','5 to 11 years'],['a3','12 to 17 years'],['a4','18 to 39 years'],['a5','40 to 64 years'],['a6','65 years or older'],['na','Prefer not to say']];
const AGE_RANGE = {a0:['P0Y','P1Y'],a1:['P1Y','P4Y'],a2:['P5Y','P11Y'],a3:['P12Y','P17Y'],a4:['P18Y','P39Y'],a5:['P40Y','P64Y'],a6:['P65Y',null]};
const RESP = {
  self:{you:'you',You:'You',your:'your',HasHad:'Have you had',have_has:'have',were_was:'were',is_are:'are',Is_Are:'Are'},
  parent:{you:'your child',You:'Your child',your:"your child's",HasHad:'Has your child had',have_has:'has',were_was:'was',is_are:'is',Is_Are:'Is'},
  care:{you:'the person you care for',You:'The person you care for',your:'their',HasHad:'Has the person you care for had',have_has:'has',were_was:'was',is_are:'is',Is_Are:'Is'},
  bereaved:{you:'your family member',You:'Your family member',your:"your family member's",HasHad:'Did your family member have',have_has:'had',were_was:'was',is_are:'was',Is_Are:'Was'}
};
function blank(){ return {resp:'',age:'',sex:'',gender:'',routes:[],dxNamed:'',dxName:'',dxMondo:null,
  t:{had:'',types:[],sample:[],reason:[],result:'',gene:'',copy:'',reanalysis:'',interest:''},
  screen:{}, ans:{}, ctx:{}, ctxd:{}, dyn:{}, open:{}, fam:{}, consang:'', extra:[], freeText:'', referral:[], member:'', memberName:'', fx:{},
  exp:{places:[{}], worked:'', jobs:[], mil:{served:'', branch:[], x:{}}, act:{}, smoke:{status:'', second:''}, other:[]} }; }
let S = blank();
let cur = 'about';
let SEARCH = null, DRILL = null, OMOP = null, MONDO = null, ECTO = null;
const E = B.exposures;

/* ---------- helpers ---------- */
const esc = s => String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function tk(s){ const r = RESP[S.resp||'self']; return s.replace(/\{(\w+)\}/g,(m,k)=> r[k]!==undefined ? r[k] : m); }
function ageIdx(){ const i = ['a0','a1','a2','a3','a4','a5','a6'].indexOf(S.age); return i; }
function isAdult(){ const i=ageIdx(); return i>=4; }
function shows(when){
  if(!when) return true;
  const i = ageIdx(), sx = S.sex;
  const fem = !(sx==='M'), mal = !(sx==='F');
  switch(when){
    case 'childhood': return true;
    case 'school': return i<0 || i>=2;
    case 'teen': return i<0 || i>=3;
    case 'adult': return i<0 || i>=4;
    case 'female': return fem;
    case 'male': return mal;
    case 'femaleteen': return fem && (i<0 || i>=3);
  }
  return true;
}
function plainLabel(it){ return (it.when==='childhood' && isAdult()) ? it.p + ' (as a child)' : it.p; }
function hasRoute(r){ return S.routes.indexOf(r)>=0; }
function toggleIn(arr, v){ const i=arr.indexOf(v); if(i>=0) arr.splice(i,1); else arr.push(v); }
function ctxShow(f){
  /* show_when forms: key:value, key:a|b (any of), key:!a|b (answered, with something other than a or b) */
  if(!f.show) return true;
  const i = f.show.indexOf(':'); const k = f.show.slice(0,i); let v = f.show.slice(i+1);
  const neg = v.charAt(0)==='!'; if(neg) v = v.slice(1);
  const alts = v.split('|'); const val = S.ctx[k];
  const vals = Array.isArray(val) ? val : (val===undefined || val==='' ? [] : [val]);
  if(!vals.length) return k==='als_status';
  return neg ? vals.some(x=>alts.indexOf(x)<0) : vals.some(x=>alts.indexOf(x)>=0);
}
function epiOn(){ return (S.ans['HP:0001250']||{}).v==='yes' || (S.ans['HP:0032807']||{}).v==='yes'; }


function fmt(n){ return n.toLocaleString('en-US'); }
function shortName(o){ return String(o).replace(/\s*\(.*?\)\s*/g,' ').split(',')[0].trim().replace(/^./,c=>c.toLowerCase()).replace(/^(acth|vns|rns|dbs)/i,m=>m.toUpperCase()); }

/* index of every item by HPO id, with where it lives and its parent */
const IDX = {};
function indexItems(items, where, parent){
  items.forEach(it=>{
    if(!IDX[it.h]) IDX[it.h] = {it, where:[], parent:parent||null, kids:(it.c||[]).map(k=>k.h)};
    IDX[it.h].where.push(where);
    if(parent && !IDX[it.h].parent) IDX[it.h].parent = parent;
    if(it.c) indexItems(it.c, where, it.h);
  });
}
B.systems.forEach(s=>indexItems(s.items, s.t));
B.seizures.forEach(m=>m.items && indexItems(m.items, 'Seizure follow-up: '+m.t));
const parentOf = h => (S.dyn[h]&&S.dyn[h].parent) || (IDX[h]||{}).parent || null;
const ONSET = Object.fromEntries(B.onset.options.map(([k,p,h])=>[k,{p,h}]));

/* ---------- stages ---------- */
function stages(){
  const L = [];
  L.push({id:'about', g:'About', t:'About this survey', r:rAbout});
  L.push({id:'you', g:'About you', t:'Who is answering', r:rYou});
  L.push({id:'diagnosis', g:'About you', t:'Diagnosis', r:rReason});
  L.push({id:'testing', g:'About you', t:'Genetic testing', r:rTesting});
  L.push({id:'screen', g:'Head to toe', t:'Head-to-toe check', r:rScreen});
  B.systems.forEach(s=>{ const v=S.screen[s.k]; if(v==='yes'||v==='unsure') L.push({id:'sys-'+s.k, g:'Head to toe', t:s.t, r:()=>rSystem(s)}); });
  if(epiOn()) B.seizures.forEach(m=>L.push({id:'seizure-'+m.k.slice(3), g:'Seizure follow-up', t:m.t, r:()=>rModule(m)}));
  L.push({id:'family', g:'Family history', t:'Family history', r:rFamily});
  if(E){
    L.push({id:'exp-places', g:'Exposures', t:'Places lived', r:rPlaces});
    if(shows(E.work.when)) L.push({id:'exp-work', g:'Exposures', t:'Jobs', r:rJobs});
    if(shows(E.military.when)) L.push({id:'exp-military', g:'Exposures', t:'Military service', r:rMilitary});
    L.push({id:'exp-activities', g:'Exposures', t:'Activities and habits', r:rActivities});
  }
  L.push({id:'more', g:'Anything else', t:'Anything else', r:rMore});
  L.push({id:'review', g:'Review', t:'Review and export', r:rReview});
  L.push({id:'design-notes', g:'Design notes', t:'Design notes', r:rNotes});
  return L;
}
const GROUPS = ['About','About you','Head to toe','Seizure follow-up','Family history','Exposures','Anything else','Review','Design notes'];

function go(id, keepScroll){
  const L = stages(); if(!L.find(s=>s.id===id)) id = L[0].id;
  cur = id;
  if(location.hash.slice(1)!==id){ try{ history.replaceState(null,'','#'+id); }catch(e){ location.hash=id; } }
  render(keepScroll);
}
function render(keepScroll){
  const L = stages(); let i = L.findIndex(s=>s.id===cur); if(i<0){ i=0; cur=L[0].id; }
  const st = L[i];
  const y = window.scrollY;
  const focusId = document.activeElement && document.activeElement.id;
  document.getElementById('stage').innerHTML = '<div class="stagehead"><span class="kicker">'+esc(st.g)+'</span><h2>'+esc(st.t)+'</h2></div>' + st.r();
  // jump bar
  const present = new Set(L.map(s=>s.g));
  document.getElementById('jump').innerHTML = GROUPS.map(g=>'<button type="button" data-go-group="'+esc(g)+'" class="'+(present.has(g)?'':'off')+'" aria-current="'+(g===st.g)+'">'+esc(g)+'</button>').join('');
  const inGroup = L.filter(s=>s.g===st.g);
  document.getElementById('substeps').innerHTML = inGroup.length>1 ? inGroup.map(s=>'<button type="button" data-go="'+s.id+'" aria-current="'+(s.id===cur)+'">'+esc(s.t)+'</button>').join('') : '';
  document.getElementById('prog').style.width = Math.round(100*(i)/(L.length-1))+'%';
  document.getElementById('prevBtn').disabled = i===0;
  document.getElementById('nextBtn').disabled = i===L.length-1;
  document.getElementById('nextBtn').textContent = i<L.length-1 ? 'Next: '+L[i+1].t : 'Next';
  if(keepScroll) window.scrollTo(0,y); else window.scrollTo(0,0);
  if(focusId){ const el=document.getElementById(focusId); if(el) el.focus({preventScroll:true}); }
  if(cur==='more') loadSearch();
  if(!DRILL && (cur.indexOf('sys-')===0 || cur.indexOf('seizure-')===0 || cur==='review')) loadDrill();
}

/* ---------- small renderers ---------- */
function choiceGroup(path, opts, val, multi){
  return '<div class="choices" role="group">'+opts.map(o=>{
    const [v,lab,small] = Array.isArray(o)?o:[o,o];
    const on = multi ? (val||[]).indexOf(v)>=0 : val===v;
    return '<button type="button" class="choice" data-set="'+esc(path)+'" data-v="'+esc(v)+'"'+(multi?' data-multi="1"':'')+' aria-pressed="'+on+'">'+esc(lab)+(small?'<small>'+esc(small)+'</small>':'')+'</button>';
  }).join('')+'</div>';
}
function q(title, body, help){ return '<div class="q"><span class="qt">'+title+'</span>'+(help?'<p class="help">'+help+'</p>':'')+body+'</div>'; }
function getPath(p){ return p.split('.').reduce((o,k)=>o==null?undefined:o[k], S); }
function setPath(p, v){ const ks=p.split('.'); let o=S; for(let i=0;i<ks.length-1;i++){ if(o[ks[i]]==null) o[ks[i]]={}; o=o[ks[i]]; } o[ks[ks.length-1]]=v; }
function onsetKeys(){ return B.onset.by[S.age] || B.onset.by.unknown; }
function onsetSelect(id, val, dataAttrs, placeholder){
  const keys = onsetKeys().slice(); if(val && val!=='unsure' && keys.indexOf(val)<0 && ONSET[val]) keys.push(val);
  return '<select id="'+id+'" '+dataAttrs+'><option value="">'+(placeholder||'When did it start?')+'</option>'+keys.map(k=>'<option value="'+k+'"'+(val===k?' selected':'')+'>'+esc(ONSET[k].p)+'</option>').join('')+'<option value="unsure"'+(val==='unsure'?' selected':'')+'>Not sure</option></select>';
}
function loadDrill(){
  fetch('drill.json').then(r=>{ if(!r.ok) throw new Error(r.status); return r.json(); }).then(j=>{ DRILL=j; render(true); }).catch(()=>{ DRILL={}; });
}
function loadOmop(){
  if(OMOP) return; OMOP={terms:{},loading:true};
  fetch('omop.json').then(r=>{ if(!r.ok) throw new Error(r.status); return r.json(); }).then(j=>{ OMOP=j; if(cur==='review') render(true); }).catch(()=>{ OMOP={terms:{},failed:true}; if(cur==='review') render(true); });
}
function loadMondo(){
  if(MONDO) return; MONDO=[];
  fetch('mondo.json').then(r=>{ if(!r.ok) throw new Error(r.status); return r.json(); }).then(j=>{ MONDO=j.map(([id,n,c])=>({id,n,c,k:n.toLowerCase()})); runMondo(); }).catch(()=>{ MONDO=[]; });
}
/* Suggestions from Mondo for the diagnosis name. The typed name is always kept; choosing a suggestion adds a code beside it. */
function runMondo(){
  const inp=document.getElementById('dxName'), out=document.getElementById('dxRes'); if(!inp||!out||!MONDO) return;
  const qv=inp.value.trim().toLowerCase(); if(qv.length<3 || (S.dxMondo && S.dxMondo.name.toLowerCase()===qv)){ out.innerHTML=''; return; }
  const words=qv.split(/\s+/);
  const hits=MONDO.filter(x=>words.every(w=>x.k.indexOf(w)>=0)).sort((a,b)=>(a.k.startsWith(qv)?0:1)-(b.k.startsWith(qv)?0:1) || a.n.length-b.n.length).slice(0,8);
  out.innerHTML = hits.length ? '<div class="small muted" style="margin-top:6px">If one of these is the same diagnosis, choose it. If none fits, leave the name as typed.</div><div class="items">'+hits.map(x=>'<div class="item"><div><div class="lab">'+esc(x.n)+'</div><div class="cvb"><span class="code">'+x.id+'</span></div></div><div><button type="button" class="btn" data-mondo="'+x.id+'" data-name="'+esc(x.n)+'" data-cid="'+x.c+'">Choose</button></div></div>').join('')+'</div>' : '';
}
function drillName(k){ const e=(DRILL||{})[k]; return IDX[k] ? IDX[k].it.p : e ? (e[0]||e[1]) : (LAB[k]||k); }
/* More specific choices from HPO for a Yes item: one row for the item, then one for each chosen term beneath it. */
function drillRows(root, where){
  if(!DRILL || !DRILL[root]) return '';
  const rows=[], seen=new Set();
  const visit = t => {
    if(seen.has(t)) return; seen.add(t);
    const e=DRILL[t]; const curated=(IDX[t]?IDX[t].kids:[]);
    const cand = e ? e[2].filter(k=>curated.indexOf(k)<0 && !(IDX[k] && isAncestorIn(root,k))) : [];
    if(cand.length) rows.push('<div class="small muted">'+(t===root?'More specific choices':'More specific kinds of: '+esc(tk(drillName(t))))+'</div><div class="kids">'+cand.map(k=>{ const on=(S.ans[k]||{}).v==='yes'; const e2=DRILL[k]||['',k,[]]; const lab=drillName(k);
      return '<label class="kid'+(on?' on':'')+'"><input type="checkbox" id="dy-'+root.replace(':','')+'-'+k.replace(':','')+'" data-dyn="'+k+'" data-parent="'+t+'" data-where="'+esc(where)+'"'+(on?' checked':'')+'> '+esc(tk(lab))+'<span class="cv code"> '+k+(lab!==e2[1]?' '+esc(e2[1]):'')+'</span></label>'; }).join('')+'</div>');
    curated.concat(cand).forEach(k=>{ if((S.ans[k]||{}).v==='yes') visit(k); });
  };
  visit(root);
  if(!rows.length) return '';
  const open=!!S.open[root];
  return '<div><button type="button" class="linkbtn" id="dr-'+root.replace(':','')+'" data-drill="'+root+'" aria-expanded="'+open+'">'+(open?'Hide the longer list':'Show a longer list of more specific choices')+'</button></div>'+(open?rows.join(''):'');
}
function clearUnder(h){
  (IDX[h]?IDX[h].kids:[]).forEach(k=>{ if((S.ans[k]||{}).v==='yes'){ delete S.ans[k]; clearUnder(k); } });
  Object.keys(S.dyn).forEach(k=>{ let p=S.dyn[k]&&S.dyn[k].parent; while(p){ if(p===h){ delete S.ans[k]; delete S.dyn[k]; break; } p=parentOf(p); } });
}


function itemRow(it, ctx, where){
  if(!shows(it.when)) return '';
  const a = S.ans[it.h]||{}; const v=a.v||''; const hid=it.h.replace(':','');
  const lab = plainLabel(it);
  const elsewhere = a.v && a.where && a.where!==where ? '<span class="pill">Answered in '+esc(a.where)+'</span>' : '';
  let h = '<div class="item'+(v?' ans-'+v:'')+'" id="row-'+hid+'">';
  h += '<div><div class="lab">'+esc(tk(lab))+elsewhere+'</div>';
  if(it.d) h += '<div class="desc">'+esc(tk(it.d))+'</div>';
  h += '<div class="cvb"><span class="code">'+it.h+'</span> '+esc(LAB[it.h]||'')+'</div></div>';
  h += '<div class="tri" role="group" aria-label="'+esc(lab)+'">'+['yes','no','unsure'].map(x=>'<button type="button" id="b-'+hid+'-'+x+'" data-ans="'+it.h+'" data-v="'+x+'" data-where="'+esc(where)+'" aria-pressed="'+(v===x)+'">'+({yes:'Yes',no:'No',unsure:'Not sure'})[x]+'</button>').join('')+'</div>';
  if(v==='yes'){
    h += '<div class="more">';
    const kids=(it.c||[]).filter(k=>shows(k.when));
    if(kids.length) h += '<div class="small muted">Which of these fit? Choose any.</div><div class="kids">'+kids.map(k=>{ const on=(S.ans[k.h]||{}).v==='yes'; return '<label class="kid'+(on?' on':'')+'"><input type="checkbox" id="k-'+k.h.replace(':','')+'" data-kid="'+k.h+'" data-parent="'+it.h+'" data-where="'+esc(where)+'"'+(on?' checked':'')+'> '+esc(tk(k.p))+'<span class="cv code"> '+k.h+'</span></label>'; }).join('')+'</div>';
    h += drillRows(it.h, where);
    if(ctx!=='birth'){
      h += '<div class="meta"><label>'+onsetSelect('on-'+hid, a.onset||'', 'data-onset="'+it.h+'"')+'</label>';
      if(it.freq) h += '<label><select id="fq-'+hid+'" data-freq="'+it.h+'"><option value="">How often now?</option>'+(B.seizure_frequency||[]).map(x=>'<option'+(a.freq===x?' selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label>';
      else h += '<label><select id="now-'+hid+'" data-now="'+it.h+'"><option value="">Now or in the past?</option>'+['Present now','Only in the past','Not sure'].map(x=>'<option'+(a.now===x?' selected':'')+'>'+x+'</option>').join('')+'</select></label>';
      h += '</div>';
    }
    h += '</div>';
  }
  return h+'</div>';
}
function itemList(items, ctx, where){
  const rows = items.map(it=>itemRow(it, ctx, where)).join('');
  return '<div class="items">'+rows+'</div><div class="rowbtns"><button type="button" class="btn quiet" data-none="'+esc(items.map(i=>i.h).join(','))+'" data-where="'+esc(where)+'">None of the remaining items apply</button></div>';
}
function ctxField(f){
  if(!ctxShow(f)) return '';
  const val = S.ctx[f.k];
  let body='';
  if(f.type==='onset') body = onsetSelect('ctx-'+f.k, val||'', 'data-ctx="'+f.k+'"', 'Choose');
  else if(f.type==='text') body = '<textarea id="ctx-'+f.k+'" data-text="ctx.'+f.k+'">'+esc(val||'')+'</textarea>';
  else body = choiceGroup('ctx.'+f.k, f.opts, val, f.type==='multi');
  if(f.per && Array.isArray(val) && val.length){
    const skip = /^(Not sure|None|Another)/;
    body += val.filter(o=>!skip.test(o)).map((o,oi)=>{ const d=((S.ctxd[f.k]||{})[o])||{};
      return '<div class="more" style="margin-top:8px"><div class="lab">'+esc(o)+'</div><div class="meta">'+f.per.map(p=>{
        const id='pc-'+f.k+'-'+oi+'-'+p.k; const lab=esc(tk(p.q).replace(/\bX\b/g, shortName(o)));
        if(p.type==='onset') return '<label>'+lab+' '+onsetSelect(id, d[p.k]||'', 'data-pc="'+esc(f.k)+'" data-po="'+esc(o)+'" data-pk="'+p.k+'"', 'Choose')+'</label>';
        return '<label>'+lab+' <select id="'+id+'" data-pc="'+esc(f.k)+'" data-po="'+esc(o)+'" data-pk="'+p.k+'"><option value="">Choose</option>'+p.opts.map(x=>'<option'+(d[p.k]===x?' selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label>';
      }).join('')+'</div></div>'; }).join('');
  }
  return q(esc(tk(f.q)), body, f.help?esc(tk(f.help)):'');
}

/* ---------- stage renderers ---------- */
function rAbout(){
  return `<p>This is a proposed replacement for the ClinGen GenomeConnect Health Survey, for children and adults. It keeps the head-to-toe order and asks for more detail: each body area opens a list of features in plain language, and a Yes opens more specific choices, so the record ends with specific Human Phenotype Ontology (HPO) terms rather than broad categories.</p>
  <ul class="list">
    <li>Every feature is answered Yes, No, or Not sure.</li>
    <li>Timing choices follow the person's age: months for babies and toddlers, years for children, and broad life stages for adults.</li>
    <li>Places lived, jobs, military service, and activities are asked with ages, and coded to ECTO, an ontology of environmental exposures.</li>
    <li>Nothing you enter leaves this page.</li>
  </ul>
  <div class="rowbtns"><button type="button" class="btn primary" data-go="you">Start</button></div>
  <div class="card" id="walkthrough">
    <p>This video walks through the proposed review process, following an invented reviewer through the <a href="annotate.html">review page</a>. It has no sound; captions are on screen and the same text is in the transcript beneath it.</p>
    <video controls preload="metadata" poster="assets/review-walkthrough-poster.jpg" style="width:100%;max-width:960px;border:1px solid var(--line);border-radius:6px" aria-label="Silent walk-through of the review process, with captions on screen"><source src="assets/review-walkthrough.mp4" type="video/mp4"></video>
    <details><summary>Transcript</summary><div class="in"><ol class="small"><li>Reviewing the original head-to-toe surveys. A walk-through of the proposed review process for the GenomeConnect Health Survey and Seizure Survey. This video has no sound. Captions are on screen.</li><li>The site has a redesigned survey, a before and after comparison, a summary of changes, and a page for reviewing the original surveys.</li><li>Reviewers work on the review page. It lists every item of the original Health Survey and Seizure Survey, one section at a time.</li><li>Start with your name or initials and your role. This walk-through uses an invented reviewer, Jane Doe.</li><li>Each section of the original survey is one page. The bar at the top moves between sections.</li><li>Each item shows the original wording and the HPO term as printed. The proposed redesign is beside it.</li><li>Choose a decision: keep all of it, keep some of it, reject it, or not sure. A comment can say which part to keep.</li><li>Switch off the proposed redesign to judge the original survey without it.</li><li>One button keeps every remaining item in a section, so time goes to the items a reviewer would change.</li><li>The Seizure Survey is reviewed the same way.</li><li>Open questions about the whole redesign have their own page, with room for each reviewer&#x27;s view.</li><li>Answers stay in the reviewer&#x27;s browser. When finished, download the review as a CSV or JSON file and send it to the review lead.</li><li>Combining the reviews. The review lead uploads every reviewer&#x27;s file to a Google Colab notebook in the repository. The notebook reports the consensus for each item, how closely reviewers agree, and every comment. It also writes a version with reviewer names replaced by codes. The review lead combines the files in a Colab notebook.</li><li>The Before and after page shows each original answer beside its replacement.</li><li>The Summary of changes page gives the reason and the source for each proposed change.</li><li>After the review. Agreed changes are proposed as pull requests to the repository. Every pull request is checked against the pinned HPO release before it is merged. Links to every page are at the top of the home page.</li></ol></div></details>
  </div>
  <p class="small muted">Switch on <strong>Show clinical terms</strong> at the top to see the HPO term behind each answer. <a href="#design-notes" data-go="design-notes">Design notes</a> list what changed from the original.</p>`;
}
function rYou(){
  const r = S.resp;
  let h = q('Who is filling out this survey?', choiceGroup('resp',[['self','I am answering about myself'],['parent','I am a parent or guardian answering about a child'],['care','I am a family member or caregiver answering about an adult'],['bereaved','I am a family member answering about someone who has died']], r),
    'The wording of every later question follows this answer.');
  h += q(S.resp==='bereaved' ? 'How old was your family member at the time of death?' : tk('How old {is_are} {you} now?'), choiceGroup('age', AGES, S.age), 'The age band decides which questions and timing choices appear. It assumes the program collects date of birth another way, such as at enrollment, and is not meant to be a study\'s only record of age.');
  h += q('What sex was recorded at birth?', choiceGroup('sex',[['F','Female'],['M','Male'],['I','Intersex or a difference of sex development'],['U','Not sure'],['N','Prefer not to say']], S.sex),
    'This is used to show or hide questions about reproductive organs and some cancers. Gender identity is asked separately below.');
  h += q('Gender identity (optional)', choiceGroup('gender',['Woman','Man','Nonbinary','Another identity','Prefer not to say'], S.gender), 'Optional. It is stored with the survey but is not used to match findings.');
  return h;
}
function rReason(){
  let h = q('Has a doctor named a diagnosis?', choiceGroup('dxNamed',['Yes','Not yet','Not sure'], S.dxNamed));
  if(S.dxNamed==='Yes'){
    h += q('What is the diagnosis called?', '<input type="text" id="dxName" data-text="dxName" data-mondosearch="1" autocomplete="off" value="'+esc(S.dxName)+'"><div id="dxRes" class="results"></div>', 'Type the name as the doctor wrote it. Matching names from the Mondo disease list appear as you type.');
    if(S.dxMondo) h += '<div class="items"><div class="item ans-yes"><div><div class="lab">Matched to: '+esc(S.dxMondo.name)+'</div><div class="cvb"><span class="code">'+S.dxMondo.id+'</span></div></div><div><button type="button" class="btn quiet" data-rmmondo="1">Remove the match</button></div></div></div>';
    loadMondo();
  }
  return h;
}
function rTesting(){
  const t=S.t;
  let h = q(tk('{HasHad} genetic testing?'), choiceGroup('t.had',['Yes','No','Not sure'], t.had), 'Including testing on blood, saliva, skin, or tissue, and direct-to-consumer tests.');
  if(t.had==='Yes' || t.had==='Not sure'){
    h += q('What kind of testing? Choose any that fit.', choiceGroup('t.types',[
      ['karyotype','Chromosome analysis','Also called karyotype'],['cma','Chromosomal microarray','Also called CMA or array CGH'],
      ['panel','A single gene or a gene panel','Tests one gene or a set of genes'],['exome','Exome sequencing','Looks at nearly all genes'],
      ['genome','Genome sequencing','Looks at genes and the DNA between them'],['repeat','A repeat expansion test','Looks for a stretch of DNA repeated too many times'],
      ['mito','Mitochondrial DNA testing'],['dtc','A direct-to-consumer test','Ordered without a doctor'],['unsure','Not sure']], t.types, true));
    h += q('Which sample was tested?', choiceGroup('t.sample',[['blood','Blood'],['saliva','Saliva or cheek swab'],['skin','Skin'],['tissue','Tissue removed during surgery'],['unsure','Not sure']], t.sample, true),
      'Some genetic changes are present in only some of the body\'s cells. Knowing the sample helps a reviewer judge whether testing another tissue could help.');
    h += q('Why was testing done? Choose any that fit.', choiceGroup('t.reason',[
      ['symptoms','Symptoms that could have a genetic cause'],['confirm','To confirm a diagnosis a doctor suspected'],
      ['fh_sym','A family history, with symptoms'],['fh_nosym','A family history, without symptoms, to learn about risk'],
      ['proactive','No symptoms or family history, to be proactive about health'],['planning','Family planning'],['unsure','Not sure']], t.reason, true));
    h += q('What did the result say?', choiceGroup('t.result',[
      ['cause','A genetic cause was found'],['vus','A variant of uncertain significance (VUS) was found'],['none','Nothing was found that explains the symptoms'],['pending','Still waiting for results'],['unsure','Not sure']], t.result));
    if(t.result==='cause' || t.result==='vus'){
      h += q('Gene name, if you know it', '<input type="text" id="tgene" data-text="t.gene" value="'+esc(t.gene)+'" >', 'Optional. A coordinator will read it from the report.');
    }
    if(t.result && t.result!=='pending'){
      h += q('Do you have a copy of the report?', choiceGroup('t.copy',['Yes','No','Not sure'], t.copy), t.copy==='No' ? 'A coordinator can help request a copy from the lab or the ordering clinic.' : 'Instructions for sharing a copy come after the survey.');
    }
    if(t.result==='none' || t.result==='vus'){
      h += q('Has the lab or a doctor offered to look at the results again (reanalysis)?', choiceGroup('t.reanalysis',['Yes, and it was done','Offered, but not done yet','No','Not sure'], t.reanalysis),
        'Knowledge about genes changes over time, and a result can be read differently a few years later.');
    }
  }
  if(t.had==='No') h += q('Would you like information about genetic testing?', choiceGroup('t.interest',['Yes','No'], t.interest));
  return h;
}
function rScreen(){
  let h = '<p>'+tk('For each area of the body, answer Yes if {you} {have_has} had a problem a doctor looked at, or a difference that stands out from others in the family. Choose Not sure if you are unsure; the list for that area will open so you can look through it.')+'</p>';
  h += '<div class="items">';
  B.systems.forEach(s=>{
    const v=S.screen[s.k]||'';
    let stem = tk(s.stem); if(s.k==='birth' && isAdult() && S.resp!=='parent') stem = 'If known: '+stem.charAt(0).toLowerCase()+stem.slice(1);
    h += '<div class="item'+(v?' ans-'+v:'')+'"><div><div class="lab">'+esc(stem)+'</div><div class="desc">'+esc(tk(s.ex))+'</div></div>';
    h += '<div class="tri" role="group" aria-label="'+esc(s.t)+'">'+['yes','no','unsure'].map(x=>'<button type="button" id="s-'+s.k+'-'+x+'" data-screen="'+s.k+'" data-v="'+x+'" aria-pressed="'+(v===x)+'">'+({yes:'Yes',no:'No',unsure:'Not sure'})[x]+'</button>').join('')+'</div></div>';
  });
  h += '</div><div class="rowbtns"><button type="button" class="btn quiet" data-screen-none="1">None of the remaining areas apply</button></div>';
  const open = B.systems.filter(s=>['yes','unsure'].includes(S.screen[s.k])).map(s=>s.t);
  if(open.length) h += '<p class="small muted">Detail pages come next for: '+esc(open.join(', '))+'.</p>';
  return h;
}
function rSystem(s){
  let h = '';
  if(S.screen[s.k]==='unsure') h += '<p class="note unsure">The answer for this area was Not sure. Answer what you recognize; Not sure is a fine answer for the rest.</p>';
  h += itemList(s.items, s.k, s.t);
  if(s.k==='brain' && epiOn()) h += '<p class="note">Seizures were answered Yes, so follow-up questions about seizures come after the body areas.</p>';
  return h;
}
function rModule(m){
  let h = m.intro ? '<p>'+esc(tk(m.intro))+'</p>' : '';
  if(m.context) h += '<div class="card">'+m.context.map(ctxField).join('')+'</div>';
  if(m.items) h += itemList(m.items, 'seizures', 'Seizure follow-up: '+m.t);
  return h;
}
function rFamily(){
  let h = '<p>'+tk('These questions are about blood relatives of {you}.')+'</p>';
  h += q('Are the biological parents related to each other by blood, for example as cousins?', choiceGroup('consang',['Yes','No','Not sure','Prefer not to answer'], S.consang), 'This helps a reviewer judge which inheritance patterns to consider.');
  let rows = B.family.slice();
  h += '<div class="items">';
  rows.forEach(([k,lab])=>{
    const f=S.fam[k]||{}; const v=f.v||'';
    h += '<div class="item'+(v?' ans-'+v:'')+'"><div><div class="lab">'+esc(lab)+'</div></div><div class="tri" role="group" aria-label="'+esc(lab)+'">'+['yes','no','unsure'].map(x=>'<button type="button" id="f-'+k+'-'+x+'" data-fam="'+k+'" data-v="'+x+'" aria-pressed="'+(v===x)+'">'+({yes:'Yes',no:'No',unsure:'Not sure'})[x]+'</button>').join('')+'</div>';
    if(v==='yes'){
      h += '<div class="more"><div class="small muted">Which relatives? Choose any that fit.</div>'+choiceGroup('fam.'+k+'.rel', B.relatives, f.rel||[], true)+
        '<div class="small muted">Which side of the family?</div>'+choiceGroup('fam.'+k+'.side', ["Mother's side","Father's side",'Both sides','Not sure'], f.side||'')+'</div>';
    }
    h += '</div>';
  });
  return h+'</div>';
}
/* ---------- exposures (content/survey/exposures.yaml) ---------- */
const ectoTag = c => c.e ? ' <span class="cv code muted">'+c.e[0]+' '+esc(c.e[1])+'</span>' : ' <span class="cv code muted">no ECTO class yet</span>';
function ageRange(path, o, toLabel){
  o = o || {};
  return '<div class="agerange"><label>From age <input type="number" min="0" max="120" inputmode="numeric" data-text="'+path+'.from" value="'+esc(o.from||'')+'"></label>'+
    '<label>'+(toLabel||'To age')+' <input type="number" min="0" max="120" inputmode="numeric" data-text="'+path+'.to" value="'+esc(o.to||'')+'"></label></div>';
}
function textIn(path, val, ph){ return '<input type="text" data-text="'+path+'" value="'+esc(val||'')+'"'+(ph?' placeholder="'+esc(ph)+'"':'')+'>'; }
function triRow(path, label, extra, o){
  o = o || {}; const v = o.v || '';
  let h = '<div class="item'+(v?' ans-'+v:'')+'"><div><div class="lab">'+esc(tk(label))+extra+'</div></div><div class="tri" role="group" aria-label="'+esc(tk(label))+'">'+
    ['yes','no','unsure'].map(x=>'<button type="button" data-expv="'+path+'" data-v="'+x+'" aria-pressed="'+(v===x)+'">'+({yes:'Yes',no:'No',unsure:'Not sure'})[x]+'</button>').join('')+'</div>';
  if(v==='yes') h += '<div class="more">'+ageRange(path, o, 'To age (blank if still)')+'</div>';
  return h+'</div>';
}
function rPlaces(){
  const P = E.places, L = S.exp.places;
  let h = '<p>'+esc(tk(P.intro))+' A study using this survey would collect full addresses separately, so they could be linked to environmental data without being stored with the health answers.</p>';
  L.forEach((pl,i)=>{
    const b = 'exp.places.'+i;
    h += '<div class="card exp"><div class="exphead"><h3>'+(i===0?'First place':'Place '+(i+1))+'</h3>'+(L.length>1?'<button type="button" class="btn quiet" data-exprm="places:'+i+'">Remove</button>':'')+'</div>';
    h += q('Ages '+tk('{you}')+' lived there', ageRange(b, pl, 'To age (blank if still there)'));
    h += q('State or province, and country', '<div class="agerange">'+textIn(b+'.area', pl.area, 'State or province')+textIn(b+'.country', pl.country, 'Country')+'</div>');
    h += q('Setting', choiceGroup(b+'.setting', P.settings, pl.setting));
    h += q('Drinking water at home', choiceGroup(b+'.water', P.water, pl.water));
    h += q('Within about a mile (1.5 km) of home, was there any of these?', choiceGroup(b+'.near', P.nearby.map(c=>[c.k, c.p]), pl.near||[], true), 'Choose any that apply.');
    h += '</div>';
  });
  return h + '<div class="rowbtns"><button type="button" class="btn" data-expadd="places">Add another place</button></div>';
}
function rJobs(){
  const W = E.work;
  let h = '<p>'+esc(tk(W.intro))+'</p>';
  h += q(tk('{HasHad} a job, including part-time or farm work?'), choiceGroup('exp.worked',['Yes','No','Not sure'], S.exp.worked));
  if(S.exp.worked!=='Yes') return h;
  if(!S.exp.jobs.length) S.exp.jobs.push({});
  const tasks = W.tasks.filter(c=>shows(c.when));
  S.exp.jobs.forEach((jb,i)=>{
    const b = 'exp.jobs.'+i;
    h += '<div class="card exp"><div class="exphead"><h3>'+(i===0?'First job':'Job '+(i+1))+'</h3>'+(S.exp.jobs.length>1?'<button type="button" class="btn quiet" data-exprm="jobs:'+i+'">Remove</button>':'')+'</div>';
    h += q('Job title or kind of work', textIn(b+'.title', jb.title, 'For example: farm worker, welder, nurse'));
    h += q('Ages in this job', ageRange(b, jb, 'To age (blank if still)'));
    h += q('At this job, '+tk('{you}')+' did or worked near', choiceGroup(b+'.tasks', tasks.map(c=>[c.k, c.p]), jb.tasks||[], true), 'Choose any that apply.');
    h += q('Anything else used or worked near (optional)', textIn(b+'.otherText', jb.otherText));
    h += '</div>';
  });
  return h + '<div class="rowbtns"><button type="button" class="btn" data-expadd="jobs">Add another job</button></div>';
}
function rMilitary(){
  const M = E.military, m = S.exp.mil;
  let h = '<p>'+esc(tk(M.intro))+'</p>';
  h += q(tk('{HasHad} military service?'), choiceGroup('exp.mil.served',['Yes','No','Not sure','Prefer not to answer'], m.served));
  if(m.served!=='Yes') return h;
  h += q('Branch', choiceGroup('exp.mil.branch', M.branches, m.branch||[], true), 'Choose any that apply.');
  h += q('Ages in service', ageRange('exp.mil', m, 'To age (blank if still serving)'));
  h += q('Bases, ships, and deployments', '<textarea data-text="exp.mil.where" placeholder="Name each place and the ages or years">'+esc(m.where||'')+'</textarea>', 'A study would link these places to known exposures, as was done for the water at Camp Lejeune.');
  h += '<h3>During service</h3><div class="items">'+M.exposures.filter(c=>shows(c.when)).map(c=>triRow('exp.mil.x.'+c.k, c.p, ectoTag(c), m.x[c.k])).join('')+'</div>';
  return h;
}
function rActivities(){
  const A = E.activities, sm = S.exp.smoke;
  let h = '<p>'+esc(tk(A.intro))+'</p><div class="items">'+A.items.filter(c=>shows(c.when)).map(c=>triRow('exp.act.'+c.k, c.p, ectoTag(c), S.exp.act[c.k])).join('')+'</div>';
  h += '<h3>Smoking</h3>';
  h += q(tk('{HasHad} a habit of smoking cigarettes, cigars, or a pipe?'), choiceGroup('exp.smoke.status', E.smoking.status, sm.status));
  if(sm.status==='Used to' || sm.status==='Still do') h += q('Ages', ageRange('exp.smoke', sm, sm.status==='Still do'?'To age (blank if still)':'To age'));
  h += q(tk(E.smoking.secondhand), choiceGroup('exp.smoke.second',['Yes','No','Not sure'], sm.second));
  if(B.ecto && B.ecto.search){
    h += '<h3>Something else</h3><p>'+tk('If {you} had another exposure, search for it. The search covers exposure terms in ECTO, the Environmental Conditions, Treatments and Exposures Ontology.')+'</p>';
    h += '<div class="searchrow"><input type="text" id="ectoSrch" data-ectosearch="1" placeholder="Try: mercury, mold, radon, asbestos" autocomplete="off"><span class="status" id="ectoStatus"></span></div><div id="ectoRes" class="results"></div>';
  }
  if(S.exp.other.length) h += '<div class="items">'+S.exp.other.map((x,i)=>'<div class="item ans-yes"><div><div class="lab">'+esc(x.l.replace(/^exposure to /i,'').replace(/^./,c=>c.toUpperCase()))+' <span class="cv code muted">'+x.id+' '+esc(x.l)+'</span></div><div class="more">'+ageRange('exp.other.'+i, x, 'To age (blank if still)')+'</div></div><div><button type="button" class="btn quiet" data-rmecto="'+i+'">Remove</button></div></div>').join('')+'</div>';
  return h;
}
function loadEcto(){
  if(ECTO) return; ECTO=[];
  fetch('ecto.json').then(r=>{ if(!r.ok) throw new Error(r.status); return r.json(); }).then(j=>{ ECTO=j.map(([id,l,syn])=>({id,l,k:(l+' '+(syn||'')).toLowerCase()})); runEcto(); }).catch(()=>{ const s=document.getElementById('ectoStatus'); if(s) s.textContent='The exposure list could not be loaded here.'; });
}
function runEcto(){
  const inp=document.getElementById('ectoSrch'), out=document.getElementById('ectoRes'); if(!inp||!out||!ECTO) return;
  const qv=inp.value.trim().toLowerCase(); if(qv.length<3){ out.innerHTML=''; return; }
  const words=qv.split(/\s+/).map(w=>w.length>3 && /[^s]s$/.test(w) ? w.slice(0,-1) : w);
  const hits=ECTO.filter(x=>words.every(w=>x.k.indexOf(w)>=0)).sort((a,b)=>a.l.length-b.l.length).slice(0,10);
  out.innerHTML = hits.length ? '<div class="items">'+hits.map(x=>{ const added=S.exp.other.some(o=>o.id===x.id); return '<div class="item"><div><div class="lab">'+esc(x.l.replace(/^exposure to /i,'').replace(/^./,c=>c.toUpperCase()))+'</div><div class="cvb"><span class="code">'+x.id+' '+esc(x.l)+'</span></div></div><div><button type="button" class="btn" data-addecto="'+x.id+'" data-l="'+esc(x.l)+'"'+(added?' disabled':'')+'>'+(added?'Added':'Add')+'</button></div></div>'; }).join('')+'</div>' : '<p class="muted">No match in ECTO. Try other words, or describe it in the free-text box on the next page.</p>';
}
/* Exposure answers as a record: places, then every Yes or Not sure exposure, shaped after the Beacon v2
   exposure fields (exposureCode, ageAtExposure, duration) and coded to ECTO where a class exists. */
function expRecord(){
  if(!E) return null;
  const age = a => (a!==undefined && a!=='' && !isNaN(+a)) ? {iso8601duration:'P'+(+a)+'Y'} : undefined;
  const dur = (f,t) => (f!==undefined&&f!==''&&t!==undefined&&t!==''&&+t>=+f) ? 'P'+(+t-+f)+'Y' : undefined;
  const out = [], add = (c, ctx, ans, o, extra) => { if(!ans) return; out.push(Object.assign({context:ctx, plain:c.p, answer:ans, exposureCode:c.e?{id:c.e[0],label:c.e[1]}:undefined,
    ageAtExposure:age(o.from), ageAtEnd:age(o.to), duration:dur(o.from,o.to), source:'reported in survey'}, extra||{})); };
  const ansOf = v => ({yes:'Yes',no:'No',unsure:'Not sure'})[v];
  const places = S.exp.places.filter(p=>Object.keys(p).some(k=>p[k] && (!Array.isArray(p[k])||p[k].length))).map(p=>{
    (p.near||[]).forEach(k=>{ const c=E.places.nearby.find(x=>x.k===k); if(c) add(c,'near home','Yes',p,{place:[p.area,p.country].filter(Boolean).join(', ')||undefined}); });
    return {ageStart:age(p.from), ageEnd:age(p.to), area:p.area||undefined, country:p.country||undefined, setting:p.setting||undefined, waterSource:p.water||undefined,
      nearby:(p.near||[]).map(k=>(E.places.nearby.find(x=>x.k===k)||{p:k}).p)};
  });
  if(S.exp.worked==='Yes') S.exp.jobs.forEach(j=>(j.tasks||[]).forEach(k=>{ const c=E.work.tasks.find(x=>x.k===k); if(c) add(c,'work','Yes',j,{jobTitle:j.title||undefined}); }));
  if(S.exp.mil.served==='Yes') E.military.exposures.forEach(c=>{ const o=S.exp.mil.x[c.k]||{}; add(c,'military service',ansOf(o.v),o.v==='yes'?o:{}); });
  E.activities.items.forEach(c=>{ const o=S.exp.act[c.k]||{}; add(c,'activity',ansOf(o.v),o.v==='yes'?o:{}); });
  S.exp.other.forEach(x=>add({p:x.l.replace(/^exposure to /i,'').replace(/^./,c=>c.toUpperCase()), e:[x.id,x.l]},'searched','Yes',x));
  const sm=S.exp.smoke;
  if(sm.status==='Used to'||sm.status==='Still do'||sm.status==='Not sure') add({p:'Tobacco smoking', e:E.smoking.e},'smoking',sm.status==='Not sure'?'Not sure':'Yes',sm.status==='Not sure'?{}:sm);
  if(sm.status==='Never') add({p:'Tobacco smoking', e:E.smoking.e},'smoking','No',{});
  if(sm.second) add({p:E.smoking.secondhand},'smoking',sm.second,{});
  return {ectoRelease:(B.ecto||{}).release, places, exposures:out,
    jobs:S.exp.worked==='Yes'?S.exp.jobs.map(j=>({title:j.title||undefined, ageStart:age(j.from), ageEnd:age(j.to), otherText:j.otherText||undefined})):[], worked:S.exp.worked||undefined,
    military:S.exp.mil.served?{served:S.exp.mil.served, branch:S.exp.mil.branch, ageStart:age(S.exp.mil.from), ageEnd:age(S.exp.mil.to), places:S.exp.mil.where||undefined}:undefined,
    smoking:sm.status||sm.second?{status:sm.status||undefined, ageStart:age(sm.from), ageEnd:age(sm.to), livedWithSmoker:sm.second||undefined}:undefined};
}
function rMore(){
  let h = '<p>'+tk('If {you} {have_has} a feature that was not listed, search for it in everyday words. The search covers the plain-language synonyms in the Human Phenotype Ontology.')+'</p>';
  h += '<div class="searchrow"><input type="text" id="srch" data-search="1" placeholder="Try: toe walking, bushy eyebrows, burning tongue" autocomplete="off"><span class="status" id="srchStatus"></span></div><div id="srchRes" class="results"></div>';
  if(S.extra.length){
    h += '<h3>Added from search</h3><div class="items">'+S.extra.map(x=>'<div class="item ans-yes"><div><div class="lab">'+esc(x.p)+'</div><div class="dr">Doctors may call this: '+esc(x.l)+' <span class="cv code">'+x.h+'</span></div></div><div><button type="button" class="btn quiet" data-rmextra="'+x.h+'">Remove</button></div></div>').join('')+'</div>';
  }
  h += q('Anything else the research team should know', '<textarea id="freeText" data-text="freeText" placeholder="Describe anything in your own words, including when it started">'+esc(S.freeText)+'</textarea>', 'Free text is read by a person and is not turned into terms automatically.');
  h += q('How did you hear about this survey? Choose any that fit.', choiceGroup('referral',['A doctor','A genetic counselor','A lab report','An internet search','Social media','A patient or family organization','A research study','A friend or family member','Other'], S.referral, true));
  h += q(tk('{Is_Are} {you} part of a patient organization or research registry?'), choiceGroup('member',['Yes','No','Not sure'], S.member), 'Programs that use this survey would list their own partner organizations here.');
  if(S.member==='Yes') h += q('Which one? (optional)', '<input type="text" id="memberName" data-text="memberName" value="'+esc(S.memberName)+'">');
  return h;
}

/* ---------- record ---------- */
function onsetLabel(k){ return ONSET[k] ? ONSET[k].p : ''; }
function features(){
  const yes={}, no=[], unsure=[];
  Object.entries(S.ans).forEach(([h,a])=>{ if(a.v==='yes') yes[h]=a; else if(a.v==='no') no.push(h); else if(a.v==='unsure') unsure.push(h); });
  const implied=new Set();
  Object.keys(yes).forEach(h=>{ const p=parentOf(h); if(p && yes[p]) implied.add(p); });
  const present=[];
  Object.keys(yes).forEach(h=>{ if(!implied.has(h)) { const a=yes[h]; let on=a.onset, now=a.now; let p=parentOf(h); while((!on||!now) && p && yes[p]){ on=on||yes[p].onset; now=now||yes[p].now; p=parentOf(p); } present.push({h, onset:on, now}); } });
  const ctxf=[];
  const seizing = S.ctx.sz_now && S.ctx.sz_now!=='Seizure-free for at least a year' && S.ctx.sz_now!=='Not sure';
  if(epiOn() && (S.ctx.sz_meds==='Two'||S.ctx.sz_meds==='Three or more') && seizing) ctxf.push({h:'HP:0020174', onset:'', note:'Seizures continuing after two or more seizure medicines'});
  if(epiOn() && S.ctx.sz_first && yes['HP:0001250']) ctxf.push({h:'HP:0001250', onset:S.ctx.sz_first, note:'Age at first seizure'});
  (epiOn()?B.seizures:[]).forEach(m=>(m.context||[]).forEach(q=>{ if(!q.hpo_if || q.k==='sz_meds' || !ctxShow(q)) return; const v=S.ctx[q.k]; (Array.isArray(v)?v:[v]).forEach(x=>{ const h=q.hpo_if[x]; if(h && !yes[h]) ctxf.push({h, onset:'', note:'From the question: '+tk(q.q)}); }); }));
  S.extra.forEach(x=>{ if(!yes[x.h]) present.push({h:x.h, onset:'', extra:x}); });
  ctxf.forEach(c=>{ const ex=present.find(p=>p.h===c.h); if(ex){ ex.onset=ex.onset||c.onset; ex.note=c.note; } else if(!implied.has(c.h) && !Object.keys(yes).some(y=>isAncestorIn(c.h,y))) present.push(c); });
  return {present, no, unsure, yes, implied};
}
function isAncestorIn(anc, h){ let p=parentOf(h); while(p){ if(p===anc) return true; p=parentOf(p); } return false; }
function nameOf(h){ const x=IDX[h]; if(x) return x.it.p; if(S.dyn[h]) return S.dyn[h].p; const e=S.extra.find(z=>z.h===h); if(e) return e.p; return LAB[h]||h; }
function clinOf(h){ if(LAB[h]) return LAB[h]; if(S.dyn[h]) return S.dyn[h].l; const e=S.extra.find(z=>z.h===h); return e?e.l:h; }
function sysOf(h){ const x=IDX[h]; if(x) return x.where[0]; if(S.dyn[h]) return S.dyn[h].where; return 'Added from search'; }
function phenopacket(){
  const F=features();
  const sexMap={F:'FEMALE',M:'MALE',I:'OTHER_SEX',U:'UNKNOWN_SEX',N:'UNKNOWN_SEX'};
  const subj={id:'participant-1', sex:sexMap[S.sex]||'UNKNOWN_SEX'};
  const ar=AGE_RANGE[S.age]; if(ar){ subj.timeAtLastEncounter={ageRange:{start:{iso8601duration:ar[0]}}}; if(ar[1]) subj.timeAtLastEncounter.ageRange.end={iso8601duration:ar[1]}; }
  const resp={self:'self-reported',parent:'reported by parent or guardian',care:'reported by family member or caregiver',bereaved:'reported by family member after death'}[S.resp]||'reported';
  const pf=[];
  F.present.forEach(p=>{
    const o={type:{id:p.h,label:clinOf(p.h)}};
    const on=ONSET[p.onset];
    if(on) o.onset={ontologyClass:{id:on.h,label:LAB[on.h]}};
    const fq=(S.ans[p.h]||{}).freq;
    o.description=[resp, on?'started: '+on.p.toLowerCase():'', p.now?p.now.toLowerCase():'', p.note, fq?'how often now: '+fq.toLowerCase():'', 'plain wording: '+nameOf(p.h)].filter(Boolean).join('; ');
    pf.push(o);
  });
  F.no.forEach(h=>pf.push({type:{id:h,label:clinOf(h)}, excluded:true, description:resp+'; plain wording: '+nameOf(h)}));
  const pp={id:'survey-record-1', subject:subj, phenotypicFeatures:pf,
    metaData:{created:new Date().toISOString(), createdBy:'Head-to-toe survey prototype', phenopacketSchemaVersion:'2.0',
      resources:[{id:'hp',name:'Human Phenotype Ontology',url:'http://purl.obolibrary.org/obo/hp.owl',version:B.hpo_version,namespacePrefix:'HP',iriPrefix:'http://purl.obolibrary.org/obo/HP_'}]}};
  if(S.dxNamed==='Yes' && S.dxMondo){ pp.diseases=[{term:{id:S.dxMondo.id,label:S.dxMondo.name}}];
    pp.metaData.resources.push({id:'mondo',name:'Mondo Disease Ontology',url:'http://purl.obolibrary.org/obo/mondo.owl',version:((B.mapping||{}).vocabulary_versions||{}).Mondo||'',namespacePrefix:'MONDO',iriPrefix:'http://purl.obolibrary.org/obo/MONDO_'}); }
  const extras={respondent:S.resp, ageBand:S.age, genderIdentity:S.gender||undefined, diagnosisNamed:S.dxNamed, diagnosisName:S.dxName||undefined,
    geneticTesting:S.t, bodySystemScreen:S.screen, notSure:F.unsure.map(h=>({id:h,label:clinOf(h),plain:nameOf(h)})),
    contextFields:S.ctx, contextDetails:S.ctxd, consanguinity:S.consang, familyHistory:Object.fromEntries(Object.entries(S.fam).map(([k,v])=>[ (B.family.find(f=>f[0]===k)||[k,k])[1], v])),
    freeText:S.freeText||undefined, referral:S.referral, organizationMember:S.member, exposureHistory:expRecord()||undefined};
  return {phenopacket:pp, surveyContext:extras};
}

/* ---------- OMOP rows ---------- */
const OMOP_COLS=['record','source_vocabulary','source_code','source_name','source_concept_id','answer','status','started','mapping','mapped_through','target_concept_id','target_concept_name','target_domain_id','target_vocabulary_id','value_as_concept_id','type_concept_id'];
const MATCH_LABEL={athena_map:'Athena map',name_match:'Name match, needs review',broader:'Broader concept',reviewed:'Reviewed choice',none:'No standard concept'};
function omopRows(){
  const F=features(), rows=[], T=(OMOP||{}).terms||{};
  const add=(h,answer,p)=>{
    const m=T[h]; const on=p&&ONSET[p.onset]; const tg=(m&&m[3].length)?m[3]:[[]];
    tg.forEach(t=>rows.push({record:'finding',source_vocabulary:'HPO',source_code:h,source_name:clinOf(h),source_concept_id:m?m[0]:'',answer,
      status:p&&p.now?p.now:'',started:on?on.p:'',mapping:m?MATCH_LABEL[m[1]]:'Not in the mapping file',mapped_through:m&&m[2]?m[2]+' '+(LAB[m[2]]||''):'',
      target_concept_id:t[0]||0,target_concept_name:t[1]||'',target_domain_id:t[2]||'',target_vocabulary_id:t[3]||'',value_as_concept_id:t[4]||'',type_concept_id:32865}));
  };
  F.present.forEach(p=>add(p.h,'Yes',p)); F.no.forEach(h=>add(h,'No')); F.unsure.forEach(h=>add(h,'Not sure'));
  const X=expRecord();
  (X?X.exposures:[]).forEach(e=>rows.push({record:'exposure',source_vocabulary:e.exposureCode?'ECTO':'',source_code:e.exposureCode?e.exposureCode.id:'',source_name:e.exposureCode?e.exposureCode.label:e.plain,source_concept_id:'',answer:e.answer,
    status:e.context,started:e.ageAtExposure?'age '+e.ageAtExposure.iso8601duration.slice(1,-1):'',mapping:e.exposureCode?'No standard concept (ECTO is not an OHDSI vocabulary)':'No ECTO class yet',mapped_through:'',target_concept_id:0,target_concept_name:'',target_domain_id:'',target_vocabulary_id:'',value_as_concept_id:'',type_concept_id:32865}));
  if(S.dxNamed==='Yes' && (S.dxMondo||S.dxName)) rows.unshift({record:'diagnosis',source_vocabulary:S.dxMondo?'Mondo':'',source_code:S.dxMondo?S.dxMondo.id:'',source_name:S.dxMondo?S.dxMondo.name:S.dxName,source_concept_id:S.dxMondo?S.dxMondo.cid:'',answer:'Yes',status:'',started:'',
    mapping:S.dxMondo?'No standard concept':'Typed name, not matched',mapped_through:'',target_concept_id:0,target_concept_name:'',target_domain_id:'',target_vocabulary_id:'',value_as_concept_id:'',type_concept_id:32865});
  return rows;
}
function omopCsv(){ const cell=v=>{ v=String(v==null?'':v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }; return [OMOP_COLS.join(',')].concat(omopRows().map(r=>OMOP_COLS.map(c=>cell(r[c])).join(','))).join('\n'); }
function downloadOmop(){ const st=document.getElementById('omopStatus'); try{ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['\ufeff'+omopCsv()],{type:'text/csv'})); a.download='head-to-toe-omop-rows.csv'; document.body.appendChild(a); a.click(); a.remove(); st.textContent='Saved as head-to-toe-omop-rows.csv.'; }catch(e){ st.textContent='The download was blocked here; use Copy.'; } }
function rOmop(){
  loadOmop();
  const rel=B.mapping||{};
  let h='<h3 id="omop-h">OMOP rows</h3>';
  if(!rel.athena_release || OMOP.failed) return h+'<p class="small muted">This build has no OMOP mapping file, so there is nothing to export in this form.</p>';
  if(OMOP.loading) return h+'<p class="small muted">Loading the mapping.</p>';
  const rows=omopRows(), f=rows.filter(r=>r.record==='finding'||r.record==='exposure');
  h+='<p class="small">Each answer as a row for the OMOP Common Data Model (CDM). The HPO term is the source code and the OMOP standard concept is beside it, from Athena release '+esc(rel.athena_release)+'. Target concept 0 means no standard concept was found. A broader concept keeps less detail than the HPO term, so keep the source code when loading. No and Not sure answers are listed for completeness; the CDM has no agreed place for a finding that is absent. Exposures are listed with their ECTO code as the source code and target concept 0, because ECTO is not in the OHDSI vocabularies; places lived are left out, because the core CDM has no table for residential history.</p>';
  if(!f.length) return h+'<p class="muted">No findings answered yet.</p>';
  h+='<div class="rowbtns"><button type="button" class="btn" data-omopcsv="1">Download OMOP rows (CSV)</button><button type="button" class="btn quiet" data-copy="omopOut">Copy</button><span class="status" id="omopStatus"></span></div>';
  h+='<details><summary>Preview of the findings and their standard concepts</summary><div class="in"><table><thead><tr><th>Answer</th><th>Source term</th><th>OMOP standard concept</th><th>Domain</th><th>How it was matched</th></tr></thead><tbody>'+f.map(r=>'<tr><td>'+r.answer+'</td><td>'+esc(r.source_name)+' <span class="code muted">'+r.source_code+'</span></td><td>'+(r.target_concept_id?esc(r.target_concept_name)+' <span class="code muted">'+r.target_concept_id+'</span>':'<span class="muted">None</span>')+'</td><td>'+esc(r.target_domain_id)+'</td><td>'+esc(r.mapping)+(r.mapped_through?' <span class="muted small">through '+esc(r.mapped_through)+'</span>':'')+'</td></tr>').join('')+'</tbody></table></div></details>';
  h+='<pre class="out" id="omopOut" hidden>'+esc(omopCsv())+'</pre>';
  return h;
}
function rReview(){
  const F=features();
  const by = list => { const g={}; list.forEach(x=>{ const h=x.h||x; const s=sysOf(h); (g[s]=g[s]||[]).push(x); }); return g; };
  const li = x => { const h=x.h||x; const extra=[]; if(x.onset && x.onset!=='unsure') extra.push('started '+onsetLabel(x.onset).toLowerCase()); if(x.now==='Only in the past') extra.push('only in the past'); if(x.note) extra.push(x.note.toLowerCase()); return '<li>'+esc(tk(nameOf(h)))+(extra.length?' <span class="muted small">('+esc(extra.join('; '))+')</span>':'')+' <span class="cv code muted">'+h+' '+esc(clinOf(h))+'</span></li>'; };
  const block = (title, list, empty) => { const g=by(list); const ks=Object.keys(g); return '<div class="card sum"><h3>'+title+'</h3>'+(ks.length? ks.map(k=>'<div class="small muted">'+esc(k)+'</div><ul class="list">'+g[k].map(li).join('')+'</ul>').join('') : '<p class="muted">'+empty+'</p>')+'</div>'; };
  let h = '<p>This is what the survey would send, in plain words. Switch on <strong>Show clinical terms</strong> to see the HPO terms.</p>';
  h += '<div class="grid2">'+block('Findings present', F.present, 'None yet.')+block('Looked for and not present', F.no, 'None yet. Answering No to a feature records it here.')+'</div>';
  // could be more specific
  const hasMore = x => (IDX[x] && IDX[x].kids.length) || (DRILL && DRILL[x] && DRILL[x][2].length);
  const vague = Object.keys(F.yes).filter(x=>hasMore(x) && !F.implied.has(x));
  h += '<div class="grid2">'+block('Not sure', F.unsure, 'None.');
  h += '<div class="card sum"><h3>Answers that could be more specific</h3>'+(vague.length?'<p class="small">These answers have more specific choices that were left open. A coordinator could follow up on them, since specific terms describe a rare condition better than general ones.</p><ul class="list">'+vague.map(v=>li(v)).join('')+'</ul>':'<p class="muted">None.</p>')+'</div></div>';
  // testing & family
  const t=S.t; const tl=[];
  if(t.had) tl.push('Genetic testing: '+t.had+(t.types.length?' ('+t.types.join(', ')+')':''));
  if(t.result) tl.push('Result: '+({cause:'a genetic cause was found',vus:'a variant of uncertain significance',none:'nothing found that explains the symptoms',pending:'pending',unsure:'not sure'})[t.result]+(t.gene?' in '+t.gene:''));
  if(t.sample.length) tl.push('Sample tested: '+t.sample.join(', '));
  if(S.ctx.sz_tissue && ctxShow({show:'sz_surgery:Removal of a lobe or part of a lobe (lobectomy or resection)|Removal of a lesion, such as a tumor or malformed blood vessels (lesionectomy)|Removal or disconnection of one side of the brain (hemispherectomy or hemispherotomy)'})) tl.push('Brain tissue tested after surgery: '+S.ctx.sz_tissue);
  const fl = Object.entries(S.fam).filter(([k,v])=>v.v==='yes').map(([k,v])=>(B.family.find(f=>f[0]===k)||[k,k])[1]+((v.rel||[]).length?': '+v.rel.join(', '):'')+(v.side?' ('+v.side.toLowerCase()+')':''));
  if(epiOn()){
    const lines=[]; const c=S.ctx;
    if(c.sz_first) lines.push('First diagnosed seizure: '+onsetLabel(c.sz_first).toLowerCase());
    if((c.sz_syndrome||[]).length) lines.push('Syndrome named: '+c.sz_syndrome.join('; '));
    if((c.sz_cause||[]).length) lines.push('Cause: '+c.sz_cause.join('; '));
    if(c.sz_now) lines.push('How often now: '+c.sz_now.toLowerCase());
    if(c.sz_control) lines.push('Control: '+c.sz_control.toLowerCase());
    ['sz_med_list','sz_diets','sz_surgery'].forEach(k=>{ (c[k]||[]).forEach(o=>{ const d=((S.ctxd[k]||{})[o])||{}; const bits=Object.entries(d).filter(([kk,v])=>v).map(([kk,v])=>kk==='age'?'started '+onsetLabel(v).toLowerCase():kk==='effect'?'seizures: '+v.toLowerCase():kk==='side'?'stopped or lowered for side effects: '+v.toLowerCase():kk==='length'?'for '+v.toLowerCase():v.toLowerCase()); lines.push(o+(bits.length?': '+bits.join('; '):'')); }); });
    const freq=Object.entries(S.ans).filter(([h,a])=>a.v==='yes'&&a.freq).map(([h,a])=>nameOf(h)+': '+a.freq.toLowerCase());
    h += '<div class="card sum"><h3>Seizure history and treatment</h3>'+(lines.length||freq.length?'<ul class="list">'+lines.concat(freq).map(x=>'<li>'+esc(tk(x))+'</li>').join('')+'</ul>':'<p class="muted">Not answered.</p>')+'</div>';
  }
  h += '<div class="grid2"><div class="card sum"><h3>Genetic testing</h3>'+(tl.length?'<ul class="list">'+tl.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'<p class="muted">Not answered.</p>')+'</div><div class="card sum"><h3>Family history</h3>'+(fl.length?'<ul class="list">'+fl.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'<p class="muted">Nothing reported.</p>')+'</div></div>';
  // exposures
  const X = expRecord();
  if(X){
    const el=[]; const yrs=(a,b)=>(a?' (ages '+a.iso8601duration.slice(1,-1)+(b?' to '+b.iso8601duration.slice(1,-1):' on')+')':'');
    X.places.forEach(p=>el.push('Lived in '+([p.area,p.country].filter(Boolean).join(', ')||'a place not named')+yrs(p.ageStart,p.ageEnd)+(p.waterSource?'; water: '+p.waterSource.toLowerCase():'')+(p.nearby.length?'; near: '+p.nearby.join('; ').toLowerCase():'')));
    X.exposures.filter(e=>e.context!=='near home' && e.context!=='smoking' && e.answer!=='No').forEach(e=>el.push(e.plain+(e.answer==='Not sure'?' (not sure)':'')+yrs(e.ageAtExposure,e.ageAtEnd)+(e.jobTitle?', as '+e.jobTitle:'')+(e.exposureCode?' <span class="cv code muted">'+e.exposureCode.id+' '+esc(e.exposureCode.label)+'</span>':'')));
    if(X.smoking && X.smoking.status) el.push('Smoking: '+X.smoking.status.toLowerCase()+yrs(X.smoking.ageStart,X.smoking.ageEnd));
    h += '<div class="card sum"><h3>Exposure history</h3>'+(el.length?'<ul class="list">'+el.map(x=>'<li>'+x+'</li>').join('')+'</ul>':'<p class="muted">Not answered.</p>')+'</div>';
  }
  // export
  const rec = JSON.stringify(phenopacket(), null, 2);
  h += '<h3>Phenopacket</h3><p class="small">The record is shaped like a GA4GH Phenopacket (schema version 2). Findings answered No are marked <span class="code">"excluded": true</span>. Answers that are not HPO terms, such as testing history and family history, travel beside it as survey context. Phenopackets version 2 has no exposure element, so the exposure history travels there too, coded to ECTO and shaped after the exposure fields in Beacon version 2 (exposure code, age at exposure, duration). Download the record to load it into another tool that reads Phenopackets. If the download is blocked, use Copy.</p>';
  h += '<div class="rowbtns"><button type="button" class="btn" data-dlrec="1">Download the record (JSON)</button><button type="button" class="btn quiet" data-copy="rec">Copy the record</button><span class="status" id="copyStatus"></span></div><pre class="out" id="rec">'+esc(rec)+'</pre>';
  h += rOmop();
  return h;
}



function loadSearch(){
  if(SEARCH) return;
  const st=document.getElementById('srchStatus'); if(st) st.textContent='Loading the term list…';
  fetch('search.json').then(r=>{ if(!r.ok) throw new Error(r.status); return r.json(); }).then(j=>{ SEARCH=j.map(([h,l,lay,ex])=>({h,l,lay:lay?lay.split('|'):[],k:(h+' '+l+' '+(lay||'')+' '+(ex||'')).toLowerCase()})); const s=document.getElementById('srchStatus'); if(s) s.textContent=''; runSearch(); })
   .catch(()=>{ SEARCH=[]; const s=document.getElementById('srchStatus'); if(s) s.textContent='The term list could not be loaded here; use the free-text box below.'; });
}
function runSearch(){
  const inp=document.getElementById('srch'); const out=document.getElementById('srchRes'); if(!inp||!out||!SEARCH) return;
  const qv=inp.value.trim().toLowerCase(); if(qv.length<3){ out.innerHTML=''; return; }
  const words=qv.split(/\s+/).map(w=>w.length>3 && /[^s]s$/.test(w) ? w.slice(0,-1) : w);
  const hits=SEARCH.filter(x=>words.every(w=>x.k.indexOf(w)>=0)).map(x=>{ const plain=(IDX[x.h]&&IDX[x.h].it.p)||x.lay[0]||x.l; const score=(plain.toLowerCase().startsWith(qv)?0:1)+(x.lay.some(s=>s.toLowerCase().indexOf(qv)>=0)?0:1)+plain.length/200; return {x,plain,score}; }).sort((a,b)=>a.score-b.score).slice(0,12);
  out.innerHTML = hits.length ? '<div class="items" style="margin-top:8px">'+hits.map(({x,plain})=>{ const added=S.extra.some(e=>e.h===x.h)||(S.ans[x.h]||{}).v==='yes'; return '<div class="item"><div><div class="lab">'+esc(plain)+'</div>'+(plain.toLowerCase()!==x.l.toLowerCase()?'<div class="dr">Doctors may call this: '+esc(x.l)+'</div>':'')+'<div class="cvb"><span class="code">'+x.h+'</span></div></div><div><button type="button" class="btn" data-addextra="'+x.h+'" data-plain="'+esc(plain)+'" data-l="'+esc(x.l)+'"'+(added?' disabled':'')+'>'+(added?'Added':'Add as present')+'</button></div></div>'; }).join('')+'</div>' : '<p class="muted">No match. Try other everyday words, or describe it in the box below.</p>';
}

/* ---------- design notes (from content/notes/design-notes.yaml) ---------- */
function rNotes(){
  const N=B.notes||{};
  let h='<p>'+esc(N.intro||'')+'</p>';
  h+='<details open id="changes"><summary>What changed from the original</summary><div class="in"><table><tbody>'+(N.changes||[]).map(c=>'<tr><td><strong>'+esc(c.name)+'</strong></td><td>'+esc(c.text)+'</td></tr>').join('')+'</tbody></table></div></details>';
  h+='<details id="fixes"><summary>Corrections to the original HPO terms, checked against release '+B.hpo_version+'</summary><div class="in"><table><thead><tr><th>Original answer</th><th>Original term</th><th>Problem</th><th>Term used here</th></tr></thead><tbody>'+(N.fixes||[]).map(r=>'<tr><td>'+esc(r.original)+'</td><td class="small">'+esc(r.printed_term)+'</td><td>'+esc(r.problem)+'</td><td class="small">'+esc(r.redesign)+'</td></tr>').join('')+'</tbody></table></div></details>';
  if(E){ const un=[].concat(E.places.nearby,E.work.tasks,E.military.exposures,E.activities.items,[{p:E.smoking.secondhand}]).filter(c=>!c.e).map(c=>c.p);
    h+='<details id="ecto-requests"><summary>Exposure choices with no ECTO class yet, release '+esc((B.ecto||{}).release||'')+'</summary><div class="in"><p class="small">These are kept in the record in plain words. Each is a candidate for a term request to ECTO.</p><ul class="list">'+un.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div></details>'; }
  h+='<details id="open"><summary>Open questions</summary><div class="in"><ul class="list">'+(N.open_questions||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div></details>';
  h+='<details id="sources"><summary>Sources</summary><div class="in"><ul class="list small">'+(N.sources||[]).map(s=>'<li>'+(s.url?'<a href="'+esc(s.url)+'">'+esc(s.title)+'</a>':esc(s.title))+'</li>').join('')+'</ul></div></details>';
  return h;
}
/* ---------- events ---------- */
document.addEventListener('click', e=>{
  const t=e.target.closest('button, a[data-go]'); if(!t) return;
  const d=t.dataset;
  if(d.goGroup!==undefined){ const L=stages(); const s=L.find(x=>x.g===d.goGroup); if(s) go(s.id); return; }
  if(d.go!==undefined){ e.preventDefault(); go(d.go); return; }
  if(d.ans){ const h=d.ans; const prev=(S.ans[h]||{}).v; if(prev===d.v){ delete S.ans[h]; clearUnder(h); } else { S.ans[h]=Object.assign(S.ans[h]||{}, {v:d.v, where:S.ans[h]&&S.ans[h].v?S.ans[h].where:d.where}); if(d.v!=='yes') clearUnder(h); } render(true); return; }
  if(d.drill){ S.open[d.drill]=!S.open[d.drill]; render(true); return; }
  if(d.screen){ S.screen[d.screen] = S.screen[d.screen]===d.v ? undefined : d.v; if(!S.screen[d.screen]) delete S.screen[d.screen]; render(true); return; }
  if(d.screenNone){ B.systems.forEach(s=>{ if(!S.screen[s.k]) S.screen[s.k]='no'; }); render(true); return; }
  if(d.none){ d.none.split(',').forEach(h=>{ const it=IDX[h]&&IDX[h].it; if(it && !shows(it.when)) return; if(!S.ans[h]||!S.ans[h].v) S.ans[h]={v:'no', where:d.where}; }); render(true); return; }
  if(d.fam){ const f=S.fam[d.fam]=S.fam[d.fam]||{}; f.v = f.v===d.v ? '' : d.v; render(true); return; }
  if(d.set){ const p=d.set; if(d.multi){ let arr=getPath(p); if(!Array.isArray(arr)){ arr=[]; setPath(p,arr); } toggleIn(arr,d.v); if(p==='routes'){ const nos='No symptoms; a family history or a known genetic variant'; if(arr.indexOf('alsfh')>=0 && arr.indexOf('als')<0 && !S.ctx.als_status) S.ctx.als_status=nos; if(arr.indexOf('alsfh')<0 && S.ctx.als_status===nos) delete S.ctx.als_status; } } else { setPath(p, getPath(p)===d.v ? '' : d.v); } render(true); return; }
  if(d.expv){ const o=getPath(d.expv)||{}; o.v = o.v===d.v ? '' : d.v; setPath(d.expv,o); render(true); return; }
  if(d.expadd){ S.exp[d.expadd].push({}); render(true); return; }
  if(d.exprm){ const [k,i]=d.exprm.split(':'); S.exp[k].splice(+i,1); render(true); return; }
  if(d.addecto){ if(!S.exp.other.some(x=>x.id===d.addecto)) S.exp.other.push({id:d.addecto,l:d.l}); render(true); setTimeout(()=>{ loadEcto(); runEcto(); },0); return; }
  if(d.rmecto!==undefined){ S.exp.other.splice(+d.rmecto,1); render(true); return; }
  if(d.mondo){ S.dxMondo={id:d.mondo,name:d.name,cid:d.cid}; if(!S.dxName.trim()) S.dxName=d.name; render(true); return; }
  if(d.rmmondo){ S.dxMondo=null; render(true); return; }
  if(d.omopcsv){ downloadOmop(); return; }
  if(d.dlrec){ const st=document.getElementById('copyStatus'); try{ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(phenopacket(),null,2)],{type:'application/json'})); a.download='head-to-toe-phenopacket.json'; document.body.appendChild(a); a.click(); a.remove(); st.textContent='Saved as head-to-toe-phenopacket.json.'; }catch(e){ st.textContent='The download was blocked here; use Copy.'; } return; }
  if(d.addextra){ if(!S.extra.some(x=>x.h===d.addextra)) S.extra.push({h:d.addextra,p:d.plain,l:d.l}); render(true); setTimeout(runSearch,0); return; }
  if(d.rmextra){ S.extra=S.extra.filter(x=>x.h!==d.rmextra); render(true); return; }
  if(d.copy){ const txt=document.getElementById(d.copy).textContent; const st=document.getElementById(d.copy==='omopOut'?'omopStatus':'copyStatus');
    (navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(()=>{ st.textContent='Copied.'; }).catch(()=>{ const el=document.getElementById(d.copy); el.hidden=false; const r=document.createRange(); r.selectNodeContents(el); const s=getSelection(); s.removeAllRanges(); s.addRange(r); st.textContent='Copy was blocked here; the record is selected, so press Ctrl+C or Command+C.'; }); return; }
});
document.addEventListener('change', e=>{
  const t=e.target, d=t.dataset;
  if(d.kid){ if(t.checked){ S.ans[d.kid]={v:'yes', where:d.where}; S.ans[d.parent]=Object.assign(S.ans[d.parent]||{}, {v:'yes'}); } else { delete S.ans[d.kid]; clearUnder(d.kid); } render(true); return; }
  if(d.dyn){ const k=d.dyn; if(t.checked){ S.ans[k]={v:'yes', where:(IDX[k]?IDX[k].where[0]:d.where)}; if(!IDX[k]){ const e=DRILL[k]; S.dyn[k]={p:e[0]||e[1], l:e[1], parent:d.parent, where:d.where}; } } else { delete S.ans[k]; clearUnder(k); delete S.dyn[k]; } render(true); return; }
  if(d.now){ S.ans[d.now].now=t.value; return; }
  if(d.onset){ S.ans[d.onset].onset=t.value; return; }
  if(d.freq){ S.ans[d.freq].freq=t.value; return; }
  if(d.pc){ const a=S.ctxd[d.pc]=S.ctxd[d.pc]||{}; const b=a[d.po]=a[d.po]||{}; b[d.pk]=t.value; return; }
  if(d.ctx){ S.ctx[d.ctx]=t.value; render(true); return; }
});
document.addEventListener('input', e=>{
  const t=e.target, d=t.dataset;
  if(d.text){ setPath(d.text, t.value); if(d.mondosearch) runMondo(); return; }
  if(d.search){ runSearch(); }
  if(d.ectosearch){ loadEcto(); runEcto(); }
});
document.getElementById('prevBtn').onclick=()=>{ const L=stages(); const i=L.findIndex(s=>s.id===cur); if(i>0) go(L[i-1].id); };
document.getElementById('nextBtn').onclick=()=>{ const L=stages(); const i=L.findIndex(s=>s.id===cur); if(i<L.length-1) go(L[i+1].id); };
document.getElementById('toTop').onclick=e=>{ e.preventDefault(); window.scrollTo(0,0); const j=document.getElementById('jump').querySelector('button[aria-current="true"]'); if(j) j.focus(); };
const ct=document.getElementById('coordToggle');
ct.onchange=()=>{ document.body.classList.toggle('coord', ct.checked); try{ localStorage.setItem('h2t-coord', ct.checked?'1':''); }catch(e){} render(true); };
try{ if(localStorage.getItem('h2t-coord')==='1'){ ct.checked=true; document.body.classList.add('coord'); } }catch(e){}
window.addEventListener('hashchange', ()=>{ const id=location.hash.slice(1); if(id==='walkthrough'){ if(cur!=='about') go('about'); const v=document.getElementById('walkthrough'); if(v) v.scrollIntoView({block:'start'}); return; } if(id && id!==cur) go(id); });
window.addEventListener('beforeprint', ()=>document.querySelectorAll('details').forEach(x=>x.open=true));
(function(){ const r=(B.config||{}).repo_url; const a=document.getElementById('repoLink'); if(r&&a){ a.href=r+'/issues/new/choose'; a.hidden=false; } })();
(function(){ const h=location.hash.slice(1); if(h==='walkthrough'){ go('about'); const v=document.getElementById('walkthrough'); if(v) setTimeout(()=>v.scrollIntoView({block:'start'}),50); } else go(h || 'about'); })();
