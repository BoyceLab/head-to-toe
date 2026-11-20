"use strict";
/* Annotation page. Items come from the JSON block that scripts/build.py embeds; answers stay in this
   browser (localStorage, when available) until the reviewer downloads or copies them. */
const RV = JSON.parse(document.getElementById('review').textContent);
const DEC = RV.decisions, DECMAP = Object.fromEntries(DEC.map(d=>[d.code,d]));
const STORE = 'h2t-review-v1';
const esc = s => String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const domId = s => String(s).replace(/[^A-Za-z0-9_-]/g,'_');
const ITEMS_BY_STAGE = {}; RV.items.forEach(it=>{ (ITEMS_BY_STAGE[it.stage]=ITEMS_BY_STAGE[it.stage]||[]).push(it); });
const TITLES = Object.fromEntries(RV.stages.map(s=>[s.id,s.title]));
const now = () => new Date().toISOString();

function blank(){ return {reviewer:{name:'',role:'',role_other:''}, d:{}, q:{}, started_at:now()}; }
let R = blank(), cur = 'about', armedClear = false;
try{ const saved = localStorage.getItem(STORE); if(saved) R = Object.assign(blank(), JSON.parse(saved)); }catch(e){}
function save(){ try{ localStorage.setItem(STORE, JSON.stringify(R)); }catch(e){} }

/* ---------- stages ---------- */
const SURVEY_GROUP = {HS:'Health Survey', SZ:'Seizure Survey'};
function stages(){
  const L=[{id:'about', g:'About this review', t:'About this review', r:rAbout}];
  RV.stages.forEach(s=>L.push({id:s.id, g:SURVEY_GROUP[s.survey], t:s.title, r:()=>rItems(s), items:ITEMS_BY_STAGE[s.id]||[]}));
  L.push({id:'open-questions', g:'Open questions', t:'Open questions', r:rQuestions});
  L.push({id:'export', g:'Save and download', t:'Save and download your review', r:rExport});
  return L;
}
const GROUPS=['About this review','Health Survey'].concat(RV.stages.some(s=>s.survey==='SZ')?['Seizure Survey']:[]).concat(['Open questions','Save and download']);
const done = it => !!(R.d[it.id] && R.d[it.id].code);

function go(id){ const L=stages(); if(!L.find(s=>s.id===id)) id=L[0].id; cur=id; try{ history.replaceState(null,'','#'+id); }catch(e){} render(false); }
function render(keep){
  const L=stages(); const i=L.findIndex(s=>s.id===cur); const st=L[i]; const y=window.scrollY;
  const fid=document.activeElement && document.activeElement.id;
  document.getElementById('stage').innerHTML='<div class="stagehead"><span class="kicker">'+esc(st.g)+'</span><h2>'+esc(st.t)+'</h2></div>'+st.r();
  document.getElementById('jump').innerHTML=GROUPS.map(g=>'<button type="button" data-go-group="'+esc(g)+'" aria-current="'+(g===st.g)+'">'+esc(g)+'</button>').join('');
  const inG=L.filter(s=>s.g===st.g);
  document.getElementById('substeps').innerHTML=inG.length>1?inG.map(s=>'<button type="button" data-go="'+s.id+'" aria-current="'+(s.id===cur)+'" class="'+(s.items&&s.items.length&&s.items.every(done)?'complete':'')+'">'+esc(s.t)+'</button>').join(''):'';
  const all=RV.items.length, n=RV.items.filter(done).length;
  document.getElementById('prog').style.width=Math.round(100*n/all)+'%';
  document.getElementById('prevBtn').disabled=i===0;
  document.getElementById('nextBtn').disabled=i===L.length-1;
  document.getElementById('nextBtn').textContent=i<L.length-1?'Next: '+L[i+1].t:'Next';
  window.scrollTo(0, keep?y:0);
  if(fid){ const el=document.getElementById(fid); if(el) el.focus({preventScroll:true}); }
}

/* ---------- renderers ---------- */
function decisionButtons(id, code){
  return '<div class="decision" role="radiogroup" aria-label="Decision">'+DEC.map(d=>'<button type="button" class="choice" id="d-'+domId(id)+'-'+d.code+'" data-dec="'+esc(id)+'" data-code="'+d.code+'" aria-pressed="'+(code===d.code)+'" title="'+esc(d.help||'')+'">'+esc(d.label)+(d.also?'<small>'+esc(d.also)+'</small>':'')+'</button>').join('')+'</div>';
}
function itemCard(it){
  const a=R.d[it.id]||{}; const p=it.proposal||{};
  let h='<div class="ritem'+(a.code?' done':'')+'" id="it-'+domId(it.id)+'"><span class="iid">'+esc(it.id)+'</span><div class="rgrid"><div class="orig">';
  h+='<div class="lab">'+esc(it.text)+'</div>'+(it.detail?'<div class="desc">'+esc(it.detail)+'</div>':'');
  if(it.hpo_printed) h+='<div class="term">As printed: '+esc(it.hpo_printed)+'</div>';
  if(it.hpo_now) h+='<div class="term'+(/obsolete/.test(it.hpo_now)?' flag':'')+'">'+esc(it.hpo_now)+'</div>';
  h+='</div><div class="prop">'+(p.label?'<span class="chip '+esc(p.change)+'">'+esc(p.label)+'</span>':'')+(p.note?'<div style="margin-top:4px">'+esc(p.note)+'</div>':'')+((p.redesign||[]).length?'<ul>'+p.redesign.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'')+'</div></div>';
  if(it.question) h+='<p class="ask">'+esc(it.question)+'</p>';
  h+=decisionButtons(it.id, a.code);
  const ph = a.code==='keep_some' ? 'Which part should stay, and what should change?' : a.code==='reject' ? 'Why should it go?' : 'Comment (optional)';
  h+='<textarea id="c-'+domId(it.id)+'" aria-label="Comment on '+esc(it.text)+'" data-com="'+esc(it.id)+'" placeholder="'+esc(ph)+'">'+esc(a.comment||'')+'</textarea>';
  return h+'</div>';
}
function rAbout(){
  const rv=R.reviewer;
  let h='<p>This page sets every item of the original surveys in front of you, one section at a time. For each item, choose a decision and, if you like, add a comment. The proposed redesign appears beside each item for context; switch it off at the top to review the original alone.</p>';
  h+='<div class="card"><div class="q"><label class="qt" for="rvName">Your name or initials</label><input type="text" id="rvName" data-rv="name" value="'+esc(rv.name)+'" autocomplete="off"><p class="help">Used to tell reviews apart when they are combined. The combining notebook also makes a version with names replaced by codes.</p></div>';
  h+='<div class="q"><label class="qt" for="rvRole">Your role</label><select id="rvRole" data-rv="role"><option value="">Choose</option>'+RV.roles.map(r=>'<option'+(rv.role===r?' selected':'')+'>'+esc(r)+'</option>').join('')+'</select>'+(rv.role==='Other'?' <input type="text" id="rvRoleOther" data-rv="role_other" value="'+esc(rv.role_other)+'" placeholder="Describe your role">':'')+'</div></div>';
  h+='<h3>The decisions</h3><table class="tally">'+DEC.map(d=>'<tr><th>'+esc(d.label)+(d.also?'<div class="small muted">'+esc(d.also)+'</div>':'')+'</th><td>'+esc(d.help||'')+'</td></tr>').join('')+'</table>';
  h+='<h3>Notes before you start</h3><ul class="list">'+RV.notes.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul>';
  h+='<p>Open questions that apply to the whole redesign are near the end, before the download page. Some items also have a question of their own, set in a shaded box under the item.</p>';
  h+='<h3>Continue a saved review</h3><p class="small">Choose a review file you downloaded earlier, or paste a review you copied. Answers in the file replace answers for the same items here.</p>';
  h+='<div class="rowbtns"><input type="file" id="importFile" accept=".csv,.json,text/csv,application/json"></div><textarea id="importText" placeholder="Paste a copied review here"></textarea><div class="rowbtns"><button type="button" class="btn quiet" data-act="import-text">Load the pasted review</button><span class="status" id="importStatus"></span></div>';
  return h;
}
function rItems(s){
  const items=ITEMS_BY_STAGE[s.id]||[];
  let h=s.intro?'<p class="muted">'+esc(s.intro)+'</p>':'';
  h+=items.map(itemCard).join('');
  if(items.some(it=>!done(it))) h+='<div class="rowbtns"><button type="button" class="btn quiet" data-act="keep-rest" data-stage="'+s.id+'">Keep all of the items in this section that have no decision yet</button></div>';
  return h;
}
function rQuestions(){
  let h='<p>These questions apply to the redesign as a whole. Comment on any you have a view about; leave the rest blank.</p>';
  RV.questions.forEach(q=>{ const a=R.q[q.id]||{};
    h+='<div class="ritem'+(a.comment?' done':'')+'"><span class="iid">OQ.'+esc(q.id)+'</span><div class="lab"><strong>'+esc(q.question)+'</strong></div>'+(q.context?'<p class="desc small">'+esc(q.context)+'</p>':'')+'<textarea id="q-'+domId(q.id)+'" data-oq="'+esc(q.id)+'" placeholder="Your view (optional)">'+esc(a.comment||'')+'</textarea></div>'; });
  return h;
}
function rExport(){
  const byS={HS:{}, SZ:{}};
  RV.items.forEach(it=>{ const s=it.id.slice(0,2); const c=(R.d[it.id]||{}).code||'none'; byS[s][c]=(byS[s][c]||0)+1; });
  const cols=DEC.map(d=>d.code).concat(['none']);
  const lab=c=>c==='none'?'No decision yet':DECMAP[c].label;
  let h='<p>'+(R.reviewer.name?'Review by <strong>'+esc(R.reviewer.name)+'</strong>'+(R.reviewer.role?', '+esc(R.reviewer.role==='Other'&&R.reviewer.role_other?R.reviewer.role_other:R.reviewer.role):'')+'.':'Add your name or initials on the <a href="#about" data-go="about">first page</a> before downloading, so the review can be combined with others.')+'</p>';
  h+='<table class="tally"><thead><tr><th></th>'+['HS','SZ'].filter(s=>Object.keys(byS[s]).length).map(s=>'<th>'+SURVEY_GROUP[s]+'</th>').join('')+'</tr></thead><tbody>'+cols.map(c=>'<tr><td>'+esc(lab(c))+'</td>'+['HS','SZ'].filter(s=>Object.keys(byS[s]).length).map(s=>'<td class="n">'+(byS[s][c]||0)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  const open=stages().filter(s=>s.items&&s.items.some(it=>!done(it)));
  if(open.length) h+='<p class="small">Sections with items still open: '+open.map(s=>'<a href="#'+s.id+'" data-go="'+s.id+'">'+esc(s.g+': '+s.t)+'</a>').join('; ')+'.</p>';
  h+='<h3>Download</h3><p class="small">The spreadsheet file has one row per item, with the item text, your decision, and your comment, ready for the combining notebook. The JSON file holds the same answers and can be loaded back into this page later.</p>';
  h+='<div class="rowbtns"><button type="button" class="btn primary" data-act="dl-csv">Download as CSV</button><button type="button" class="btn" data-act="dl-json">Download as JSON</button><a class="btn quiet" href="review-template.csv" download>Blank template for working offline</a></div><p class="status" id="dlStatus"></p>';
  h+='<h3>Copy</h3><p class="small">Some viewers block downloads. Copy the review instead and paste it into a plain text file saved with a .csv ending, or into an email to the review lead.</p>';
  h+='<div class="rowbtns"><button type="button" class="btn" data-act="cp-csv">Copy as CSV</button><button type="button" class="btn" data-act="cp-json">Copy as JSON</button><span class="status" id="cpStatus"></span></div><pre class="out" id="cpOut" hidden></pre>';
  h+='<h3>Combining reviews</h3><p class="small">The review lead collects every reviewer\'s CSV or JSON file and runs the notebook <span class="code">notebooks/combine_reviews.ipynb</span> from the project repository in Google Colab. It reports agreement item by item, gathers comments, and lists items that need discussion.'+(RV.config.repo_url?' <a href="https://colab.research.google.com/github/'+esc(RV.config.repo_url.replace('https://github.com/',''))+'/blob/main/notebooks/combine_reviews.ipynb">Open the notebook in Colab</a>.':'')+'</p>';
  h+='<h3>Start over</h3><div class="rowbtns"><button type="button" class="btn quiet danger" data-act="clear">'+(armedClear?'Select again to clear every answer on this device':'Clear this review')+'</button></div>';
  return h;
}

/* ---------- export and import ---------- */
function stamp(){ return new Date().toISOString().slice(0,10); }
function fileBase(){ const n=(R.reviewer.name||'reviewer').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'reviewer'; return 'review_'+n+'_'+stamp(); }
function role(){ return R.reviewer.role==='Other' && R.reviewer.role_other ? 'Other: '+R.reviewer.role_other : R.reviewer.role; }
function csvCell(v){ return '"'+String(v==null?'':v).replace(/"/g,'""')+'"'; }
function toCSV(){
  const ex=now(); const rows=[RV.columns];
  RV.items.forEach(it=>{ const a=R.d[it.id]||{}; const p=it.proposal||{};
    rows.push(['h2t-review-1', it.id.slice(0,2)==='HS'?'Health Survey':'Seizure Survey', it.stage, TITLES[it.stage]||'', it.id, it.text, it.detail, it.hpo_printed, it.hpo_now||'', p.label||'', p.note||'', it.question||'', a.code||'', a.code?DECMAP[a.code].label:'', a.comment||'', R.reviewer.name, role(), a.updated_at||'', ex, RV.build.date]); });
  RV.questions.forEach(q=>{ const a=R.q[q.id]||{};
    rows.push(['h2t-review-1','Open questions','open-questions','Open questions','OQ.'+q.id, q.question, q.context||'', '', '', '', '', '', '', '', a.comment||'', R.reviewer.name, role(), a.updated_at||'', ex, RV.build.date]); });
  return '﻿'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
function toJSON(){
  return JSON.stringify({format:'h2t-review-1', exported_at:now(), site_build:RV.build, reviewer:{name:R.reviewer.name, role:role()},
    items:RV.items.map(it=>{ const a=R.d[it.id]||{}; return {item_id:it.id, survey:it.id.slice(0,2)==='HS'?'Health Survey':'Seizure Survey', section_id:it.stage, section:TITLES[it.stage]||'', item:it.text, decision:a.code||'', decision_label:a.code?DECMAP[a.code].label:'', comment:a.comment||'', updated_at:a.updated_at||''}; }),
    open_questions:RV.questions.map(q=>({item_id:'OQ.'+q.id, question:q.question, comment:(R.q[q.id]||{}).comment||'', updated_at:(R.q[q.id]||{}).updated_at||''}))}, null, 2);
}
function download(text, name, type){
  const st=document.getElementById('dlStatus');
  try{ const url=URL.createObjectURL(new Blob([text],{type})); const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 4000);
    st.textContent='Saving '+name+'. If no file appears, this viewer blocks downloads; use Copy below.'; }
  catch(e){ st.textContent='This viewer blocked the download. Use Copy below.'; }
}
function copy(text){
  const st=document.getElementById('cpStatus'), out=document.getElementById('cpOut');
  out.textContent=text.replace(/^﻿/,''); out.hidden=false;
  (navigator.clipboard?navigator.clipboard.writeText(out.textContent):Promise.reject()).then(()=>{ st.textContent='Copied.'; st.className='status ok'; })
    .catch(()=>{ const r=document.createRange(); r.selectNodeContents(out); const s=getSelection(); s.removeAllRanges(); s.addRange(r); st.textContent='Copy was blocked here; the review is selected below, so press Ctrl+C or Command+C.'; });
}
function parseCSV(text){
  text=text.replace(/^﻿/,''); const rows=[]; let row=[], f='', q=false;
  for(let i=0;i<text.length;i++){ const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){ f+='"'; i++; } else q=false; } else f+=c; }
    else if(c==='"') q=true; else if(c===','){ row.push(f); f=''; } else if(c==='\n'){ row.push(f.replace(/\r$/,'')); rows.push(row); row=[]; f=''; } else f+=c; }
  if(f!==''||row.length){ row.push(f); rows.push(row); }
  const head=rows.shift()||[]; return rows.filter(r=>r.length>1).map(r=>Object.fromEntries(head.map((h,i)=>[h.trim(), r[i]||''])));
}
function importText(text){
  let n=0; const ids=new Set(RV.items.map(i=>i.id));
  const t=text.trim(); if(!t) throw new Error('empty');
  if(t[0]==='{'){
    const j=JSON.parse(t); if(!/^h2t-review/.test(j.format||'')) throw new Error('not a review file');
    if(j.reviewer){ R.reviewer.name=j.reviewer.name||R.reviewer.name; const rl=j.reviewer.role||''; if(RV.roles.indexOf(rl)>=0) R.reviewer.role=rl; else if(rl.indexOf('Other: ')===0){ R.reviewer.role='Other'; R.reviewer.role_other=rl.slice(7); } }
    (j.items||[]).forEach(x=>{ if(ids.has(x.item_id) && (x.decision||x.comment)){ R.d[x.item_id]={code:DECMAP[x.decision]?x.decision:'', comment:x.comment||'', updated_at:x.updated_at||now()}; n++; } });
    (j.open_questions||[]).forEach(x=>{ if(x.comment){ R.q[String(x.item_id).replace(/^OQ\./,'')]={comment:x.comment, updated_at:x.updated_at||now()}; n++; } });
  } else {
    parseCSV(t).forEach(r=>{ const id=r.item_id; if(!id) return;
      if(r.reviewer && !R.reviewer.name) R.reviewer.name=r.reviewer;
      if(r.reviewer_role && !R.reviewer.role){ if(RV.roles.indexOf(r.reviewer_role)>=0) R.reviewer.role=r.reviewer_role; }
      if(id.indexOf('OQ.')===0){ if(r.comment){ R.q[id.slice(3)]={comment:r.comment, updated_at:r.updated_at||now()}; n++; } return; }
      if(ids.has(id) && (r.decision||r.comment)){ R.d[id]={code:DECMAP[r.decision]?r.decision:'', comment:r.comment||'', updated_at:r.updated_at||now()}; n++; } });
  }
  save(); return n;
}

/* ---------- events ---------- */
document.addEventListener('click', e=>{
  const t=e.target.closest('button, a[data-go]'); if(!t) return; const d=t.dataset;
  if(d.goGroup!==undefined){ const s=stages().find(x=>x.g===d.goGroup); if(s) go(s.id); return; }
  if(d.go!==undefined){ e.preventDefault(); go(d.go); return; }
  if(d.dec){ const a=R.d[d.dec]=R.d[d.dec]||{}; a.code = a.code===d.code ? '' : d.code; a.updated_at=now(); save(); render(true); return; }
  if(d.act==='keep-rest'){ (ITEMS_BY_STAGE[d.stage]||[]).forEach(it=>{ if(!done(it)){ R.d[it.id]=Object.assign(R.d[it.id]||{}, {code:'keep_all', updated_at:now()}); } }); save(); render(true); return; }
  if(d.act==='dl-csv'){ download(toCSV(), fileBase()+'.csv', 'text/csv;charset=utf-8'); return; }
  if(d.act==='dl-json'){ download(toJSON(), fileBase()+'.json', 'application/json'); return; }
  if(d.act==='cp-csv'){ copy(toCSV()); return; }
  if(d.act==='cp-json'){ copy(toJSON()); return; }
  if(d.act==='import-text'){ const st=document.getElementById('importStatus'); try{ const n=importText(document.getElementById('importText').value); st.textContent='Loaded answers for '+n+' items.'; render(true); }catch(err){ st.textContent='That text is not a review from this page. Paste the whole CSV or JSON text.'; } return; }
  if(d.act==='clear'){ if(!armedClear){ armedClear=true; render(true); return; } R=blank(); armedClear=false; save(); go('about'); return; }
});
document.addEventListener('input', e=>{
  const t=e.target, d=t.dataset;
  if(d.com!==undefined){ const a=R.d[d.com]=R.d[d.com]||{}; a.comment=t.value; a.updated_at=now(); save(); return; }
  if(d.oq!==undefined){ R.q[d.oq]={comment:t.value, updated_at:now()}; save(); return; }
  if(d.rv!==undefined){ R.reviewer[d.rv]=t.value; save(); return; }
});
document.addEventListener('change', e=>{
  const t=e.target;
  if(t.id==='rvRole'){ R.reviewer.role=t.value; save(); render(true); return; }
  if(t.id==='importFile' && t.files && t.files[0]){ const st=document.getElementById('importStatus'); const fr=new FileReader();
    fr.onload=()=>{ try{ const n=importText(String(fr.result)); render(true); document.getElementById('importStatus').textContent='Loaded answers for '+n+' items from '+t.files[0].name+'.'; }catch(err){ st.textContent='That file is not a review from this page.'; } };
    fr.readAsText(t.files[0]); }
});
document.getElementById('prevBtn').onclick=()=>{ const L=stages(); const i=L.findIndex(s=>s.id===cur); if(i>0) go(L[i-1].id); };
document.getElementById('nextBtn').onclick=()=>{ const L=stages(); const i=L.findIndex(s=>s.id===cur); if(i<L.length-1) go(L[i+1].id); };
document.getElementById('toTop').onclick=e=>{ e.preventDefault(); window.scrollTo(0,0); };
const sp=document.getElementById('showProp');
sp.onchange=()=>{ document.body.classList.toggle('noprop', !sp.checked); try{ localStorage.setItem(STORE+'-prop', sp.checked?'1':'0'); }catch(e){} };
try{ if(localStorage.getItem(STORE+'-prop')==='0'){ sp.checked=false; document.body.classList.add('noprop'); } }catch(e){}
window.addEventListener('hashchange', ()=>{ const id=location.hash.slice(1); if(id && id!==cur) go(id); });
(function(){ const r=(RV.config||{}).repo_url; const a=document.getElementById('repoLink'); if(r&&a){ a.href=r+'/issues/new/choose'; a.hidden=false; } })();
go(location.hash.slice(1)||'about');
