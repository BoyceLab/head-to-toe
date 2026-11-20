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
function blank(){ return {resp:'',age:'',sex:'',gender:'',routes:[],dxNamed:'',dxName:'',
  t:{had:'',types:[],sample:[],reason:[],result:'',gene:'',copy:'',reanalysis:'',interest:''},
  screen:{}, ans:{}, ctx:{}, ctxd:{}, fam:{}, consang:'', extra:[], freeText:'', referral:[], member:'', memberName:'', fx:{} }; }
let S = blank();
let example = '';
let cur = 'about';
let FUN = null, SEARCH = null;

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
function epiOn(){ return hasRoute('epilepsy') || (S.ans['HP:0001250']||{}).v==='yes' || (S.ans['HP:0032807']||{}).v==='yes'; }
function alsOn(){ return hasRoute('als') || hasRoute('alsfh'); }
function alsSymptoms(){ const v=S.ctx.als_status; return !v || v==='Symptoms of ALS or another motor neuron disease' || v==='Not sure'; }
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
B.epilepsy.forEach(m=>m.items && indexItems(m.items, 'Epilepsy: '+m.t));
B.als.forEach(m=>m.items && indexItems(m.items, 'ALS: '+m.t));

/* ---------- stages ---------- */
function stages(){
  const L = [];
  L.push({id:'about', g:'About', t:'About this redesign', r:rAbout});
  L.push({id:'you', g:'You', t:'Who is answering', r:rYou});
  L.push({id:'reason', g:'You', t:'Reason for joining', r:rReason});
  L.push({id:'testing', g:'Genetic testing', t:'Genetic testing', r:rTesting});
  L.push({id:'screen', g:'Head to toe', t:'Head-to-toe check', r:rScreen});
  B.systems.forEach(s=>{ const v=S.screen[s.k]; if(v==='yes'||v==='unsure') L.push({id:'sys-'+s.k, g:'Head to toe', t:s.t, r:()=>rSystem(s)}); });
  if(epiOn()) B.epilepsy.forEach(m=>L.push({id:'epi-'+m.k.slice(2), g:'Epilepsy', t:m.t, r:()=>rModule(m,'epi')}));
  if(alsOn()) B.als.forEach(m=>{ if(m.show && !alsSymptoms()) return; L.push({id:'als-'+m.k.slice(2), g:'ALS', t:m.t, r:()=>rModule(m,'als')}); });
  L.push({id:'family', g:'Family history', t:'Family history', r:rFamily});
  L.push({id:'more', g:'Anything else', t:'Anything else', r:rMore});
  L.push({id:'review', g:'Review', t:'Review and export', r:rReview});
  L.push({id:'design-notes', g:'Design notes', t:'Design notes', r:rNotes});
  return L;
}
const GROUPS = ['About','You','Genetic testing','Head to toe','Epilepsy','ALS','Family history','Anything else','Review','Design notes'];

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
  const ef = document.getElementById('exampleFlag');
  ef.hidden = !example; ef.textContent = example ? 'Example answers loaded: '+example+' (an invented person)' : '';
  if(keepScroll) window.scrollTo(0,y); else window.scrollTo(0,0);
  if(focusId){ const el=document.getElementById(focusId); if(el) el.focus({preventScroll:true}); }
  if(cur==='more') loadSearch();
  if(cur==='review' && document.body.classList.contains('coord')) loadFunnel();
  if(location.hash && cur==='design-notes'){ /* nothing */ }
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
function onsetSelect(id, val, dataAttrs){
  return '<select id="'+id+'" '+dataAttrs+'><option value="">Age when it started</option>'+B.onset.map(([l,h])=>'<option value="'+h+'"'+(val===h?' selected':'')+'>'+esc(l)+'</option>').join('')+'<option value="unsure"'+(val==='unsure'?' selected':'')+'>Not sure</option></select>';
}
function fb(h, which){
  const k=B.kept; let out='';
  const one=(u,n,lab)=>{ const v=(k[u]||{})[h]||0; const pct=Math.max(v>0?2:0,Math.round(100*v/n)); return '<span class="fb" title="Genes with at least one linked disease record annotated with this term">'+lab+' '+fmt(v)+' of '+fmt(n)+' <i><b style="width:'+pct+'%"></b></i></span>'; };
  if(which==='als'||which==='both') out+=one('als',k.als_n,'ALS genes kept:');
  if(which==='epi'||which==='both') out+=one('epi',k.epi_n,'Epilepsy genes kept:');
  return out;
}
function whichFunnel(ctx){ if(ctx==='als') return 'als'; if(ctx==='epi') return 'epi'; const a=alsOn(), e=epiOn(); return a&&e?'both':a?'als':e?'epi':'both'; }

function itemRow(it, ctx, where){
  if(!shows(it.when)) return '';
  const a = S.ans[it.h]||{}; const v=a.v||'';
  const lab = plainLabel(it);
  const elsewhere = a.v && a.where && a.where!==where ? '<span class="pill">Answered in '+esc(a.where)+'</span>' : '';
  let h = '<div class="item'+(v?' ans-'+v:'')+'" id="row-'+it.h.replace(':','')+'">';
  h += '<div><div class="lab">'+esc(tk(lab))+elsewhere+'</div>';
  if(it.d) h += '<div class="desc">'+esc(tk(it.d))+'</div>';
  const clin = LAB[it.h];
  if(clin && clin.toLowerCase()!==lab.toLowerCase()) h += '<div class="dr">Doctors may call this: '+esc(clin)+'</div>';
  h += '<div class="cvb"><span class="code">'+it.h+'</span>'+fb(it.h, whichFunnel(ctx))+'</div></div>';
  h += '<div class="tri" role="group" aria-label="'+esc(lab)+'">'+['yes','no','unsure'].map(x=>'<button type="button" id="b-'+it.h.replace(':','')+'-'+x+'" data-ans="'+it.h+'" data-v="'+x+'" data-where="'+esc(where)+'" aria-pressed="'+(v===x)+'">'+({yes:'Yes',no:'No',unsure:'Not sure'})[x]+'</button>').join('')+'</div>';
  if(v==='yes'){
    h += '<div class="more">';
    const kids=(it.c||[]).filter(k=>shows(k.when));
    if(kids.length){
      h += '<div class="small muted">More specific, if known (choose any that fit):</div><div class="kids">'+kids.map(k=>{ const on=(S.ans[k.h]||{}).v==='yes'; return '<label class="kid'+(on?' on':'')+'"><input type="checkbox" id="k-'+k.h.replace(':','')+'" data-kid="'+k.h+'" data-parent="'+it.h+'" data-where="'+esc(where)+'"'+(on?' checked':'')+'> '+esc(tk(k.p))+'<span class="cv code"> '+k.h+'</span></label>'; }).join('')+'</div>';
      const kk = kids.filter(k=>LAB[k.h]); if(document.body.classList.contains('coord') && kk.length) h += '<div class="cvb">'+kk.map(k=>'<span>'+esc(k.p)+': '+fb(k.h, whichFunnel(ctx))+'</span>').join('')+'</div>';
    }
    h += '<div class="meta"><label>'+onsetSelect('on-'+it.h.replace(':',''), a.onset||'', 'data-onset="'+it.h+'"')+'</label>';
    if(it.freq) h += '<label><select id="fq-'+it.h.replace(':','')+'" data-freq="'+it.h+'"><option value="">How often now?</option>'+(B.seizure_frequency||[]).map(x=>'<option'+(a.freq===x?' selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label>';
    h += '<label><select id="src-'+it.h.replace(':','')+'" data-src="'+it.h+'"><option value="">Who noticed or confirmed it?</option>'+
      [['doctor','A doctor diagnosed or confirmed it'],['report','It is in a test report'],['family','Noticed at home, not yet checked by a doctor']].map(([k,l])=>'<option value="'+k+'"'+(a.src===k?' selected':'')+'>'+l+'</option>').join('')+'</select></label></div>';
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
  if(f.type==='onset') body = onsetSelect('ctx-'+f.k, val||'', 'data-ctx="'+f.k+'"');
  else if(f.type==='text') body = '<textarea id="ctx-'+f.k+'" data-text="ctx.'+f.k+'">'+esc(val||'')+'</textarea>';
  else body = choiceGroup('ctx.'+f.k, f.opts, val, f.type==='multi');
  if(f.per && Array.isArray(val) && val.length){
    const skip = /^(Not sure|None|Another)/;
    body += val.filter(o=>!skip.test(o)).map((o,oi)=>{ const d=((S.ctxd[f.k]||{})[o])||{};
      return '<div class="more" style="margin-top:8px"><div class="lab">'+esc(o)+'</div><div class="meta">'+f.per.map(p=>{
        const id='pc-'+f.k+'-'+oi+'-'+p.k; const lab=esc(tk(p.q).replace(/\bX\b/g, shortName(o)));
        if(p.type==='onset') return '<label>'+lab+' '+onsetSelect(id, d[p.k]||'', 'data-pc="'+esc(f.k)+'" data-po="'+esc(o)+'" data-pk="'+p.k+'"').replace('Age when it started','Choose')+'</label>';
        return '<label>'+lab+' <select id="'+id+'" data-pc="'+esc(f.k)+'" data-po="'+esc(o)+'" data-pk="'+p.k+'"><option value="">Choose</option>'+p.opts.map(x=>'<option'+(d[p.k]===x?' selected':'')+'>'+esc(x)+'</option>').join('')+'</select></label>';
      }).join('')+'</div></div>'; }).join('');
  }
  return q(esc(tk(f.q)), body, f.help?esc(tk(f.help)):'');
}

/* ---------- stage renderers ---------- */
function rAbout(){
  return `<p>This is a working prototype of how the ClinGen GenomeConnect Health Survey could be rebuilt. It keeps the head-to-toe structure that families already know, and changes how each answer is asked and stored. Epilepsy and ALS are the test cases. Every feature is offered in plain language, every answer maps to a term in the Human Phenotype Ontology (HPO), and every feature can be answered Yes, No, or Not sure.</p>
  <div class="card"><h3 style="margin-top:0">Choose how to start</h3>
  <p class="small muted">The examples are invented people, built so the review and export stages have something realistic to show. Nothing you enter leaves this page.</p>
  <div class="rowbtns"><button type="button" class="btn" data-example="epi">Load the epilepsy example</button><button type="button" class="btn" data-example="als">Load the ALS example</button><button type="button" class="btn quiet" data-example="blank">Start blank</button></div></div>
  <h3>The main changes</h3>
  <ul class="list">
    <li>A No is stored as a finding that was looked for and is absent, which matching tools can use. The original kept No only at the body-system level.</li>
    <li>Not sure opens the feature list for that area instead of closing the branch.</li>
    <li>General findings open more specific choices, because specific terms narrow a candidate gene list far more than general ones.</li>
    <li>Epilepsy and ALS modules ask about small physical features and non-motor features that help tell genes apart, even when the body-system answer was No.</li>
    <li>Wording follows who is answering, and items follow age band and sex recorded at birth.</li>
    <li>The result is a record shaped like a GA4GH Phenopacket, with onset, source, and excluded findings.</li>
  </ul>
  <p>Turn on <strong>Show clinical terms and funnel counts</strong> at the top to see the HPO term behind each answer and how many genes each finding keeps in the epilepsy and ALS gene funnels. <a href="#design-notes" data-go="design-notes">Design notes</a> explain each change and list corrections to the original term mapping.</p>
  <p>Two companion pages sit beside the survey. <a href="compare.html">Before and after</a> sets each original question next to its redesign. <a href="annotate.html">Review the original surveys</a> lets a reviewer mark every original item as kept, partly kept, or rejected, add comments, and download the review for combining with others.</p>`;
}
function rYou(){
  const r = S.resp;
  let h = q('Who is filling out this survey?', choiceGroup('resp',[['self','I am answering about myself'],['parent','I am a parent or guardian answering about a child'],['care','I am a family member or caregiver answering about an adult'],['bereaved','I am a family member answering about someone who has died']], r),
    'The wording of every later question follows this answer.');
  h += q(S.resp==='bereaved' ? 'How old was your family member at the time of death?' : tk('How old {is_are} {you} now?'), choiceGroup('age', AGES, S.age), 'Age bands are used instead of a date of birth. They decide which growth, puberty, and development questions appear.');
  h += q('What sex was recorded at birth?', choiceGroup('sex',[['F','Female'],['M','Male'],['I','Intersex or a difference of sex development'],['U','Not sure'],['N','Prefer not to say']], S.sex),
    'This is used to show or hide questions about reproductive organs and some cancers. Gender identity is asked separately below.');
  h += q('Gender identity (optional)', choiceGroup('gender',['Woman','Man','Nonbinary','Another identity','Prefer not to say'], S.gender), 'Optional. It is stored with the survey but is not used to match findings.');
  return h;
}
function rReason(){
  let h = q('Which of these describe the health history you are sharing? Choose any that fit.', choiceGroup('routes',[
      ['epilepsy','Seizures or epilepsy','Opens the epilepsy questions'],
      ['als','ALS or another motor neuron disease','Opens the ALS questions'],
      ['alsfh','A family history of ALS or frontotemporal dementia, or a known ALS-related variant, without symptoms','Opens the ALS questions, without the symptom pages'],
      ['other','Another condition, or still searching for a diagnosis'],
      ['healthy','No health concerns; genetic testing was for personal or family planning']], S.routes, true));
  h += q('Has a doctor named a diagnosis?', choiceGroup('dxNamed',['Yes','Not yet','Not sure'], S.dxNamed));
  if(S.dxNamed==='Yes') h += q('What is the diagnosis called?', '<input type="text" id="dxName" data-text="dxName" value="'+esc(S.dxName)+'" placeholder="For example: Dravet syndrome, or ALS">');
  return h;
}
function rTesting(){
  const t=S.t;
  let h = q(tk('{HasHad} genetic testing?'), choiceGroup('t.had',['Yes','No','Not sure'], t.had), 'Including testing on blood, saliva, skin, or tissue, and direct-to-consumer tests.');
  if(t.had==='Yes' || t.had==='Not sure'){
    h += q('What kind of testing? Choose any that fit.', choiceGroup('t.types',[
      ['karyotype','Chromosome analysis','Also called karyotype'],['cma','Chromosomal microarray','Also called CMA or array CGH'],
      ['panel','A single gene or a gene panel','Tests one gene or a set of genes'],['exome','Exome sequencing','Looks at nearly all genes'],
      ['genome','Genome sequencing','Looks at genes and the DNA between them'],['repeat','A repeat expansion test','For example, the C9orf72 test used in ALS and FTD'],
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
      h += q('Gene name, if you know it', '<input type="text" id="tgene" data-text="t.gene" value="'+esc(t.gene)+'" placeholder="For example: SCN1A or SOD1">', 'Optional. A coordinator will read it from the report.');
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
    h += '<div class="item'+(v?' ans-'+v:'')+'"><div><div class="lab">'+esc(s.t)+'</div><div>'+esc(stem)+'</div><div class="desc">'+esc(tk(s.ex))+'</div></div>';
    h += '<div class="tri" role="group" aria-label="'+esc(s.t)+'">'+['yes','no','unsure'].map(x=>'<button type="button" id="s-'+s.k+'-'+x+'" data-screen="'+s.k+'" data-v="'+x+'" aria-pressed="'+(v===x)+'">'+({yes:'Yes',no:'No',unsure:'Not sure'})[x]+'</button>').join('')+'</div></div>';
  });
  h += '</div><div class="rowbtns"><button type="button" class="btn quiet" data-screen-none="1">None of the remaining areas apply</button></div>';
  const open = B.systems.filter(s=>['yes','unsure'].includes(S.screen[s.k])).map(s=>s.t);
  if(open.length) h += '<p class="small muted">Detail pages come next for: '+esc(open.join(', '))+'.</p>';
  return h;
}
function rSystem(s){
  let h = '';
  if(S.screen[s.k]==='unsure') h += '<p class="note unsure">The answer for this area was Not sure. Look through the list and answer what you recognize; Not sure is a fine answer for the rest.</p>';
  h += '<p class="muted">'+esc(tk(s.ex))+'</p>';
  h += itemList(s.items, '', s.t);
  if(s.k==='muscles' && !alsOn()){
    const tw=(S.ans['HP:0002380']||{}).v==='yes', wk=(S.ans['HP:0001324']||{}).v==='yes' || ['HP:0003484','HP:0007340','HP:0002460'].some(x=>(S.ans[x]||{}).v==='yes');
    if(tw && wk) h += '<div class="offer"><strong>Muscle twitching together with weakness can come from the motor nerves.</strong> <p>The ALS questions add detail about where symptoms started, speech and breathing, and features in other body systems that help tell causes apart.</p><button type="button" class="btn" data-addroute="als">Add the ALS questions</button></div>';
  }
  if(s.k==='brain' && (S.ans['HP:0001250']||{}).v==='yes' && !hasRoute('epilepsy')) h += '<p class="note">Seizures were answered Yes, so the epilepsy questions have been added after the body-system pages.</p>';
  return h;
}
function rModule(m, ctx){
  let h = m.intro ? '<p>'+esc(tk(m.intro))+'</p>' : '';
  if(m.context) h += '<div class="card">'+m.context.map(ctxField).join('')+'</div>';
  if(m.items) h += itemList(m.items, ctx, (ctx==='epi'?'Epilepsy: ':'ALS: ')+m.t);
  if(m.k==='a_start' && S.ctx.als_status==='No symptoms; a family history or a known genetic variant') h += '<p class="note">The symptom pages are skipped. The thinking and behavior page and the other body systems page stay, because some relatives notice changes before any motor symptom.</p>';
  return h;
}
function rFamily(){
  let h = '<p>'+tk('These questions are about blood relatives of {you}. Some conditions in a family point toward particular genes, for example ALS together with frontotemporal dementia, or ALS with Paget disease of bone.')+'</p>';
  h += q('Are the biological parents related to each other by blood, for example as cousins?', choiceGroup('consang',['Yes','No','Not sure','Prefer not to answer'], S.consang), 'This helps a reviewer judge which inheritance patterns to consider.');
  let rows = B.family.slice();
  const pri = alsOn() ? ['fh_als','fh_ftd','fh_dem','fh_psy','fh_pd','fh_bone','fh_mus'] : epiOn() ? ['fh_epi','fh_id','fh_death'] : [];
  rows.sort((a,b)=>(pri.indexOf(a[0])<0?99:pri.indexOf(a[0]))-(pri.indexOf(b[0])<0?99:pri.indexOf(b[0])));
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
function onsetLabel(h){ const o=B.onset.find(x=>x[1]===h); return o?o[0]:''; }
function features(){
  const yes={}, no=[], unsure=[];
  Object.entries(S.ans).forEach(([h,a])=>{ if(a.v==='yes') yes[h]=a; else if(a.v==='no') no.push(h); else if(a.v==='unsure') unsure.push(h); });
  const implied=new Set();
  Object.keys(yes).forEach(h=>{ const p=(IDX[h]||{}).parent; if(p && yes[p]) implied.add(p); });
  const present=[];
  Object.keys(yes).forEach(h=>{ if(!implied.has(h)) { const a=yes[h]; let on=a.onset, src=a.src; let p=(IDX[h]||{}).parent; while((!on||!src) && p && yes[p]){ on=on||yes[p].onset; src=src||yes[p].src; p=(IDX[p]||{}).parent; } present.push({h, onset:on, src}); } });
  // context-derived findings
  const ctxf=[];
  const reg = S.ctx.als_region; const regMap = (B.als[0].context.find(f=>f.k==='als_region')||{}).hpo_if||{};
  if(alsOn() && alsSymptoms() && regMap[reg]) ctxf.push({h:regMap[reg], onset:S.ctx.als_onset, src:'', note:'Site of first symptom', mod:({'Slowly':'HP:0003677','Quickly':'HP:0003678'})[S.ctx.als_pace]});
  const seizing = S.ctx.sz_now && S.ctx.sz_now!=='Seizure-free for at least a year' && S.ctx.sz_now!=='Not sure';
  if(epiOn() && (S.ctx.sz_meds==='Two'||S.ctx.sz_meds==='Three or more') && seizing) ctxf.push({h:'HP:0020174', onset:'', src:'', note:'Seizures continuing after two or more seizure medicines'});
  if(epiOn() && S.ctx.sz_first && (yes['HP:0001250']||Object.keys(yes).some(h=>(IDX[h]||{}).where && IDX[h].where.some(w=>w.indexOf('Seizure types')>=0)))) ctxf.push({h:'HP:0001250', onset:S.ctx.sz_first, src:'', note:'Age at first seizure'});
  /* any other module question that maps answers to HPO terms */
  const special = {als_region:1, sz_meds:1};
  const mods = (alsOn()?B.als:[]).concat(epiOn()?B.epilepsy:[]);
  mods.forEach(m=>(m.context||[]).forEach(q=>{ if(!q.hpo_if || special[q.k] || !ctxShow(q)) return; const v=S.ctx[q.k]; (Array.isArray(v)?v:[v]).forEach(x=>{ const h=q.hpo_if[x]; if(h && !yes[h]) ctxf.push({h, onset:'', src:'', note:'From the question: '+tk(q.q)}); }); }));
  S.extra.forEach(x=>present.push({h:x.h, onset:'', src:'', extra:x}));
  ctxf.forEach(c=>{ const ex=present.find(p=>p.h===c.h); if(ex){ ex.onset=ex.onset||c.onset; ex.note=c.note; ex.mod=c.mod; } else if(!implied.has(c.h) && !Object.keys(yes).some(y=>isAncestorIn(c.h,y))) present.push(c); });
  return {present, no, unsure, yes, implied};
}
function isAncestorIn(anc, h){ let p=(IDX[h]||{}).parent; while(p){ if(p===anc) return true; p=(IDX[p]||{}).parent; } return false; }
function nameOf(h){ const x=IDX[h]; if(x) return x.it.p; const e=S.extra.find(z=>z.h===h); if(e) return e.p; return LAB[h]||h; }
function clinOf(h){ if(LAB[h]) return LAB[h]; const e=S.extra.find(z=>z.h===h); return e?e.l:h; }
function sysOf(h){ const x=IDX[h]; if(x) return x.where[0]; return 'Added from search'; }
function phenopacket(){
  const F=features();
  const sexMap={F:'FEMALE',M:'MALE',I:'OTHER_SEX',U:'UNKNOWN_SEX',N:'UNKNOWN_SEX'};
  const subj={id:'participant-1', sex:sexMap[S.sex]||'UNKNOWN_SEX'};
  const ar=AGE_RANGE[S.age]; if(ar){ subj.timeAtLastEncounter={ageRange:{start:{iso8601duration:ar[0]}}}; if(ar[1]) subj.timeAtLastEncounter.ageRange.end={iso8601duration:ar[1]}; }
  const srcTxt={doctor:'Confirmed by a doctor',report:'From a test report',family:'Noticed at home'};
  const resp={self:'self-reported',parent:'reported by parent or guardian',care:'reported by family member or caregiver',bereaved:'reported by family member after death'}[S.resp]||'reported';
  const pf=[];
  F.present.forEach(p=>{
    const o={type:{id:p.h,label:clinOf(p.h)}};
    if(p.onset && p.onset!=='unsure') o.onset={ontologyClass:{id:p.onset,label:LAB[p.onset]}};
    if(p.mod) o.modifiers=[{id:p.mod,label:LAB[p.mod]}];
    const fq=(S.ans[p.h]||{}).freq;
    o.description=[resp, srcTxt[p.src], p.note, fq?'how often now: '+fq.toLowerCase():'', 'plain wording: '+nameOf(p.h)].filter(Boolean).join('; ');
    pf.push(o);
  });
  F.no.forEach(h=>pf.push({type:{id:h,label:clinOf(h)}, excluded:true, description:resp+'; plain wording: '+nameOf(h)}));
  const pp={id:'survey-record-1', subject:subj, phenotypicFeatures:pf,
    metaData:{created:new Date().toISOString(), createdBy:'Head-to-toe survey prototype', phenopacketSchemaVersion:'2.0',
      resources:[{id:'hp',name:'Human Phenotype Ontology',url:'http://purl.obolibrary.org/obo/hp.owl',version:B.hpo_version,namespacePrefix:'HP',iriPrefix:'http://purl.obolibrary.org/obo/HP_'}]}};
  const extras={respondent:S.resp, genderIdentity:S.gender||undefined, reasons:S.routes, diagnosisNamed:S.dxNamed, diagnosisName:S.dxName||undefined,
    geneticTesting:S.t, bodySystemScreen:S.screen, notSure:F.unsure.map(h=>({id:h,label:clinOf(h),plain:nameOf(h)})),
    contextFields:S.ctx, contextDetails:S.ctxd, consanguinity:S.consang, familyHistory:Object.fromEntries(Object.entries(S.fam).map(([k,v])=>[ (B.family.find(f=>f[0]===k)||[k,k])[1], v])),
    freeText:S.freeText||undefined, referral:S.referral, organizationMember:S.member};
  return {phenopacket:pp, surveyContext:extras};
}

function rReview(){
  const F=features();
  const by = list => { const g={}; list.forEach(x=>{ const h=x.h||x; const s=sysOf(h); (g[s]=g[s]||[]).push(x); }); return g; };
  const li = x => { const h=x.h||x; const extra=[]; if(x.onset && x.onset!=='unsure') extra.push('started '+onsetLabel(x.onset).toLowerCase()); if(x.note) extra.push(x.note.toLowerCase()); return '<li>'+esc(tk(nameOf(h)))+(extra.length?' <span class="muted small">('+esc(extra.join('; '))+')</span>':'')+' <span class="cv code muted">'+h+' '+esc(clinOf(h))+'</span></li>'; };
  const block = (title, list, empty) => { const g=by(list); const ks=Object.keys(g); return '<div class="card sum"><h3>'+title+'</h3>'+(ks.length? ks.map(k=>'<div class="small muted">'+esc(k)+'</div><ul class="list">'+g[k].map(li).join('')+'</ul>').join('') : '<p class="muted">'+empty+'</p>')+'</div>'; };
  let h = '<p>This is what the survey would send, in plain words first. Turn on <strong>Show clinical terms and funnel counts</strong> to see the HPO terms and the funnel check.</p>';
  h += '<div class="grid2">'+block('Findings present', F.present, 'None yet.')+block('Looked for and not present', F.no, 'None yet. Answering No to a feature records it here.')+'</div>';
  // could be more specific
  const vague = Object.keys(F.yes).filter(x=>IDX[x] && IDX[x].kids.length && !IDX[x].kids.some(k=>(S.ans[k]||{}).v==='yes'));
  h += '<div class="grid2">'+block('Not sure', F.unsure, 'None.');
  h += '<div class="card sum"><h3>Answers that could be more specific</h3>'+(vague.length?'<p class="small">These general findings have more specific choices that were left open. A coordinator could follow up on them, since a specific term narrows the candidate list more than a general one.</p><ul class="list">'+vague.map(v=>li(v)).join('')+'</ul>':'<p class="muted">None.</p>')+'</div></div>';
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
  // funnel check
  h += '<div class="card cv" id="funnelBox" style="display:none"></div>';
  // export
  const rec = JSON.stringify(phenopacket(), null, 2);
  h += '<h3>Export</h3><p class="small">The record is shaped like a GA4GH Phenopacket (schema version 2). Findings answered No are marked <span class="code">"excluded": true</span>. Answers that are not HPO terms, such as testing history and family history, travel beside it as survey context. Downloads are blocked in this viewer, so use Copy.</p>';
  h += '<div class="rowbtns"><button type="button" class="btn" data-copy="rec">Copy the record</button><span class="status" id="copyStatus"></span></div><pre class="out" id="rec">'+esc(rec)+'</pre>';
  return h;
}
function funnelBox(){
  const box=document.getElementById('funnelBox'); if(!box) return;
  box.style.display = document.body.classList.contains('coord') ? 'block' : 'none';
  if(!FUN){ box.innerHTML='<h3>Funnel check</h3><p class="muted">Loading the funnel data…</p>'; return; }
  if(FUN.error){ box.innerHTML='<h3>Funnel check</h3><p class="muted">The funnel data file could not be loaded here, so the gene check is unavailable. The rest of the survey works without it.</p>'; return; }
  const F=features(); const terms=F.present.map(p=>p.h);
  let h='<h3>Funnel check</h3><p class="small">For coordinators and reviewers, not for participants. A gene stays in the list when at least one disease record linked to it is annotated with every finding switched on below, the same rule the phenotype funnels use. This is a snapshot of public annotations, not a ranking or a probability, and a finding with no annotation in any record is set aside rather than used to empty the list.</p>';
  const uni=[]; if(epiOn()||!alsOn()) uni.push(['epi','Epilepsy funnel','genes linked to a disease record with any seizure term']); if(alsOn()) uni.push(['als','ALS funnel','genes linked to an ALS disease record; the records searched include every record linked to those genes']);
  uni.forEach(([u,title,rule])=>{
    const U=FUN[u]; const n=U.n;
    const used=[], setAside=[];
    terms.forEach(t=>{ if(S.fx[u+t]) return; if(U.bits[t]) used.push(t); else setAside.push(t); });
    const total=U.genes.length; const multi=new Set(U.multi); const KU=B.kept[u]||{};
    const counts=new Uint16Array(n), scores=new Float64Array(n);
    used.forEach(t=>{ const b=dec(U.bits[t],n); const w=Math.log(total/Math.max(1,KU[t]||1)); for(let d=0; d<n; d++) if(b[d>>3]&(1<<(d&7))){ counts[d]++; scores[d]+=w; } });
    const mode=S.fmode||'count';
    const gb=new Map();
    for(let d=0; d<n; d++){ if(!counts[d]) continue; U.dg[d].forEach(g=>{ const c=gb.get(g); const cand={c:counts[d], s:scores[d], single:!multi.has(d)};
      if(!c) gb.set(g,cand); else { const better = mode==='rare' ? (cand.s>c.s || (cand.s===c.s && cand.single)) : (cand.c>c.c || (cand.c===c.c && (cand.s>c.s || cand.single))); if(better) gb.set(g,cand); else if(cand.c===c.c && cand.single) c.single=true; } }); }
    const fullList=[...gb.entries()].filter(([g,v])=>v.c===used.length).sort((x,y)=>U.genes[x[0]].localeCompare(U.genes[y[0]]));
    const commonOn = terms.filter(t=>U.bits[t] && !S.fx[u+t] && (KU[t]||0)/total>0.5);
    h+='<h3>'+title+'</h3>';
    h+='<p class="small muted">Universe: '+fmt(total)+' '+rule+'. HPO release '+B.hpo_version+', annotations '+B.hpoa_version+'.</p>';
    h+='<div class="kids">'+terms.map(t=>{ const off=!!S.fx[u+t]; const has=!!U.bits[t]; return '<label class="kid'+(off||!has?'':' on')+'"><input type="checkbox" id="fx-'+u+t.replace(':','')+'" data-fx="'+u+t+'"'+(off?'':' checked')+(has?'':' disabled')+'> '+esc(tk(nameOf(t)))+(has?' <span class="muted small">'+fmt(KU[t]||0)+'</span>':' <span class="muted">(no annotation)</span>')+'</label>'; }).join('')+'</div>';
    h+='<div class="rowbtns">'+(commonOn.length?'<button type="button" class="btn quiet" data-fxcommon="'+u+'">Switch off findings that keep more than half of these genes</button>':'')+'<button type="button" class="btn quiet" data-fxall="'+u+'">Switch every finding back on</button></div>';
    if(!used.length) h+='<p class="muted small">Switch on at least one finding with an annotation to narrow the list.</p>';
    else if(fullList.length){
      h+='<p><strong>'+fmt(fullList.length)+' of '+fmt(total)+'</strong> genes have a disease record with every finding switched on.</p>';
      const show=fullList.slice(0,120);
      h+='<div class="genes">'+show.map(([g,v])=>'<span class="'+(v.single?'':'pooled')+'"'+(v.single?'':' title="Kept only through a disease record linked to more than three genes"')+'>'+esc(U.genes[g])+'</span>').join('')+(fullList.length>120?'<span>and '+fmt(fullList.length-120)+' more</span>':'')+'</div>';
      if(show.some(x=>!x[1].single)) h+='<p class="small muted">A dashed outline marks a gene kept only through a disease record linked to more than three genes, where a finding is credited to every gene on the record.</p>';
    } else {
      const ranked=[...gb.entries()].sort((x,y)=> mode==='rare' ? (y[1].s-x[1].s || y[1].c-x[1].c) : (y[1].c-x[1].c || y[1].s-x[1].s)).slice(0,12);
      h+='<p>No record has every finding switched on. These are the genes whose closest record matches the most findings'+(mode==='rare'?', with rarer findings counting more':'')+'.</p>';
      h+='<div class="meta"><label for="fmode-'+u+'">Rank the closest records by</label><select id="fmode-'+u+'" data-fmode="1"><option value="count"'+(mode==='count'?' selected':'')+'>Number of findings matched</option><option value="rare"'+(mode==='rare'?' selected':'')+'>Rarity-weighted (rarer findings count more)</option></select></div>';
      h+='<table style="margin-top:8px"><thead><tr><th>Gene</th><th>Findings matched by its closest record</th></tr></thead><tbody>'+ranked.map(([g,v])=>'<tr><td class="code">'+esc(U.genes[g])+(v.single?'':' <span class="muted" title="Closest record is linked to more than three genes">(pooled record)</span>')+'</td><td>'+v.c+' of '+used.length+'</td></tr>').join('')+'</tbody></table>';
      h+='<p class="small muted">The number beside each finding above is how many of these genes it keeps on its own. Findings that keep most genes do little to narrow the list.</p>';
    }
    if(setAside.length) h+='<p class="small muted">Set aside because no record in this universe is annotated with them: '+esc(setAside.map(t=>nameOf(t)).join(', '))+'. A term existing in HPO is not evidence, and a missing annotation is not evidence of absence.</p>';
  });
  box.innerHTML=h;
}
function dec(b64,n){ const s=atob(b64); const a=new Uint8Array(s.length); for(let i=0;i<s.length;i++) a[i]=s.charCodeAt(i); return a; }
function loadFunnel(){
  if(FUN){ funnelBox(); return; }
  funnelBox();
  fetch('funnel.json').then(r=>{ if(!r.ok) throw new Error(r.status); return r.json(); }).then(j=>{ FUN=j; funnelBox(); }).catch(()=>{ FUN={error:true}; funnelBox(); });
}
function loadSearch(){
  if(SEARCH) return;
  const st=document.getElementById('srchStatus'); if(st) st.textContent='Loading the term list…';
  fetch('search.json').then(r=>{ if(!r.ok) throw new Error(r.status); return r.json(); }).then(j=>{ SEARCH=j.map(([h,l,lay])=>({h,l,lay:lay?lay.split('|'):[],k:(l+' '+lay).toLowerCase()})); const s=document.getElementById('srchStatus'); if(s) s.textContent=''; runSearch(); })
   .catch(()=>{ SEARCH=[]; const s=document.getElementById('srchStatus'); if(s) s.textContent='The term list could not be loaded here; use the free-text box below.'; });
}
function runSearch(){
  const inp=document.getElementById('srch'); const out=document.getElementById('srchRes'); if(!inp||!out||!SEARCH) return;
  const qv=inp.value.trim().toLowerCase(); if(qv.length<3){ out.innerHTML=''; return; }
  const words=qv.split(/\s+/);
  const hits=SEARCH.filter(x=>words.every(w=>x.k.indexOf(w)>=0)).map(x=>{ const plain=(IDX[x.h]&&IDX[x.h].it.p)||x.lay[0]||x.l; const score=(plain.toLowerCase().startsWith(qv)?0:1)+(x.lay.some(s=>s.toLowerCase().indexOf(qv)>=0)?0:1)+plain.length/200; return {x,plain,score}; }).sort((a,b)=>a.score-b.score).slice(0,12);
  out.innerHTML = hits.length ? '<div class="items" style="margin-top:8px">'+hits.map(({x,plain})=>{ const added=S.extra.some(e=>e.h===x.h)||(S.ans[x.h]||{}).v==='yes'; return '<div class="item"><div><div class="lab">'+esc(plain)+'</div>'+(plain.toLowerCase()!==x.l.toLowerCase()?'<div class="dr">Doctors may call this: '+esc(x.l)+'</div>':'')+'<div class="cvb"><span class="code">'+x.h+'</span></div></div><div><button type="button" class="btn" data-addextra="'+x.h+'" data-plain="'+esc(plain)+'" data-l="'+esc(x.l)+'"'+(added?' disabled':'')+'>'+(added?'Added':'Add as present')+'</button></div></div>'; }).join('')+'</div>' : '<p class="muted">No match. Try other everyday words, or describe it in the box below.</p>';
}

/* ---------- design notes (from content/notes/design-notes.yaml) ---------- */
function rNotes(){
  const k=B.kept;
  const N=B.notes||{};
  let h='<p>'+esc(N.intro||'')+' <a href="compare.html">Before and after</a> sets each original question beside its redesign.</p>';
  h+='<details open id="changes"><summary>What changed, and the reason for each change</summary><div class="in"><table><thead><tr><th>Change</th><th>What it does</th></tr></thead><tbody>'+(N.changes||[]).map(c=>'<tr><td><strong>'+esc(c.name)+'</strong></td><td>'+esc(c.text)+'</td></tr>').join('')+'</tbody></table></div></details>';
  h+='<details id="fixes"><summary>Corrections to the original term mapping, checked against HPO release '+B.hpo_version+'</summary><div class="in"><p class="small">Many original labels have simply been renamed since 2018, which is expected; this survey stores identifiers and reads current labels from the release. The rows below are errors or retirements that would change what a record means.</p><table><thead><tr><th>Original answer</th><th>Original term</th><th>Problem</th><th>Term used here</th></tr></thead><tbody>'+(N.fixes||[]).map(r=>'<tr><td>'+esc(r.original)+'</td><td class="small">'+esc(r.printed_term)+'</td><td>'+esc(r.problem)+'</td><td class="small">'+esc(r.redesign)+'</td></tr>').join('')+'</tbody></table></div></details>';
  h+='<details id="method"><summary>How the funnel counts are computed</summary><div class="in">';
  h+='<p>The counts come from the HPO release '+B.hpo_version+' and its disease annotation file dated '+B.hpoa_version+', with genes from the genes_to_disease file in the same release. Annotations propagate up the ontology, so a record annotated with focal impaired awareness seizure also counts for seizure. Annotations marked NOT are ignored.</p>';
  h+='<ul class="list"><li><strong>ALS funnel.</strong> Known ALS genes are the genes linked to a disease record annotated with Amyotrophic lateral sclerosis (HP:0007354) or named as ALS: '+fmt(k.als_n)+' genes in this snapshot. The records searched are every record linked to one of those genes ('+fmt(k.als_corpus)+'), which includes the ataxias, neuropathies, myopathies, and dementias the same genes cause, because a gene\'s other disorders are often where its non-motor findings are described.</li>';
  h+='<li><strong>Epilepsy funnel.</strong> Seizure-associated genes are the genes linked to a disease record annotated with Seizure (HP:0001250) or any term beneath it: '+fmt(k.epi_n)+' genes and '+fmt(k.epi_corpus)+' records in this snapshot.</li>';
  h+='<li><strong>Genes kept by one finding.</strong> The count beside each item is the number of genes with at least one record annotated with that finding. The funnel check on the review page applies the same-record rule across all findings at once.</li>';
  h+='<li><strong>Limits.</strong> The counts describe public annotations, not diagnoses or probabilities. A missing annotation is not evidence that a feature never occurs, and a term can exist in HPO with no annotation at all; Burning eye sensation (HP:6000420) is one such term in this release. Records linked to many genes, such as some Orphanet groupings, credit a finding to every gene on the record.</li></ul>';
  h+='<p class="small">To reproduce: download hp.obo, phenotype.hpoa, and genes_to_disease.txt from the HPO release page, keep annotations with aspect P and no NOT qualifier, propagate each annotation to its ancestors through is_a links, and apply the rules above.</p></div></details>';
  // data dictionary
  let rows='';
  const addRows=(items, where, depth)=>items.forEach(it=>{ rows+='<tr><td>'+esc(where)+'</td><td>'+(depth?'&nbsp;&nbsp;↳ ':'')+esc(it.p)+'</td><td class="code">'+it.h+'</td><td>'+esc(LAB[it.h]||'')+'</td><td class="small">'+esc(({childhood:'All ages; reads "as a child" for adults',school:'Age 5 and older',teen:'Age 12 and older',adult:'Adults',female:'Female, intersex, or sex not known',male:'Male, intersex, or sex not known',femaleteen:'Female or sex not known, age 12 and older'})[it.when]||(depth?'When the item above is Yes':'Always'))+'</td><td class="code">'+fmt((k.als||{})[it.h]||0)+'</td><td class="code">'+fmt((k.epi||{})[it.h]||0)+'</td></tr>'; if(it.c) addRows(it.c, where, depth+1); });
  B.systems.forEach(s=>addRows(s.items, s.t, 0));
  B.epilepsy.forEach(m=>m.items&&addRows(m.items,'Epilepsy: '+m.t,0));
  B.als.forEach(m=>m.items&&addRows(m.items,'ALS: '+m.t,0));
  h+='<details id="dictionary"><summary>Item bank: every feature with its plain wording, HPO term, display rule, and funnel counts</summary><div class="in"><table><thead><tr><th>Where</th><th>Plain wording</th><th class="code">HPO ID</th><th>HPO label</th><th>Shown when</th><th>ALS genes kept</th><th>Epilepsy genes kept</th></tr></thead><tbody>'+rows+'</tbody></table></div></details>';
  h+='<details id="open"><summary>Open questions for a real deployment</summary><div class="in"><ul class="list">'+(N.open_questions||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div></details>';
  const repo=(B.config||{}).repo_url;
  if(repo){
    h+='<details id="contribute"><summary>How to suggest a change</summary><div class="in"><p>The survey content lives in plain text files in the <a href="'+esc(repo)+'">project repository</a>. Anyone can suggest a change:</p><ul class="list">'+
      '<li>Without a GitHub account or without editing files: <a href="'+esc(repo)+'/issues/new/choose">open a suggestion form</a> for wording, a new feature, or a term mapping.</li>'+
      '<li>With a GitHub account: edit a file under content/ and open a pull request. Checks run on every pull request and report any HPO term that is missing or obsolete, any wording rule that is broken, and any original survey row left without a mapping.</li></ul>'+
      '<p class="small">See CONTRIBUTING.md in the repository for every field and an example.</p></div></details>';
  }
  h+='<h3>Sources</h3><ul class="list small">'+(N.sources||[]).map(s=>'<li>'+(s.url?'<a href="'+esc(s.url)+'">'+esc(s.title)+'</a>':esc(s.title))+'</li>').join('')+'</ul>';
  return h;
}

/* ---------- examples (invented people, from content/examples) ---------- */
function loadExample(which){
  S = blank(); example='';
  const E = (B.examples||{})[which]; if(!E) return;
  example = E.title.toLowerCase();
  ['resp','age','sex','dxNamed','dxName','consang'].forEach(k=>{ if(E[k]) S[k]=E[k]; });
  S.routes = (E.routes||[]).slice();
  Object.assign(S.t, JSON.parse(JSON.stringify(E.t||{})));
  S.screen = Object.assign({}, E.screen||{});
  S.ctx = JSON.parse(JSON.stringify(E.ctx||{}));
  S.ctxd = JSON.parse(JSON.stringify(E.ctxd||{}));
  S.fam = JSON.parse(JSON.stringify(E.fam||{}));
  Object.entries(E.ans||{}).forEach(([h,a])=>{ S.ans[h]=Object.assign({where:(IDX[h]||{where:['']}).where[0]}, a); });
}

/* ---------- events ---------- */
document.addEventListener('click', e=>{
  const t=e.target.closest('button, a[data-go]'); if(!t) return;
  const d=t.dataset;
  if(d.goGroup!==undefined){ const L=stages(); const s=L.find(x=>x.g===d.goGroup); if(s) go(s.id); return; }
  if(d.go!==undefined){ e.preventDefault(); go(d.go); return; }
  if(d.example){ loadExample(d.example==='blank'?'':d.example); go(d.example==='blank'?'you':'review'); return; }
  if(d.ans){ const h=d.ans; const prev=(S.ans[h]||{}).v; if(prev===d.v){ delete S.ans[h]; (IDX[h]?IDX[h].kids:[]).forEach(k=>{ if((S.ans[k]||{}).v==='yes') delete S.ans[k]; }); } else { S.ans[h]=Object.assign(S.ans[h]||{}, {v:d.v, where:S.ans[h]&&S.ans[h].v?S.ans[h].where:d.where}); if(d.v!=='yes') (IDX[h]?IDX[h].kids:[]).forEach(k=>{ if((S.ans[k]||{}).v==='yes') delete S.ans[k]; }); } render(true); return; }
  if(d.screen){ S.screen[d.screen] = S.screen[d.screen]===d.v ? undefined : d.v; if(!S.screen[d.screen]) delete S.screen[d.screen]; render(true); return; }
  if(d.screenNone){ B.systems.forEach(s=>{ if(!S.screen[s.k]) S.screen[s.k]='no'; }); render(true); return; }
  if(d.none){ d.none.split(',').forEach(h=>{ const it=IDX[h]&&IDX[h].it; if(it && !shows(it.when)) return; if(!S.ans[h]||!S.ans[h].v) S.ans[h]={v:'no', where:d.where}; }); render(true); return; }
  if(d.fam){ const f=S.fam[d.fam]=S.fam[d.fam]||{}; f.v = f.v===d.v ? '' : d.v; render(true); return; }
  if(d.set){ const p=d.set; if(d.multi){ let arr=getPath(p); if(!Array.isArray(arr)){ arr=[]; setPath(p,arr); } toggleIn(arr,d.v); if(p==='routes'){ const nos='No symptoms; a family history or a known genetic variant'; if(arr.indexOf('alsfh')>=0 && arr.indexOf('als')<0 && !S.ctx.als_status) S.ctx.als_status=nos; if(arr.indexOf('alsfh')<0 && S.ctx.als_status===nos) delete S.ctx.als_status; } } else { setPath(p, getPath(p)===d.v ? '' : d.v); } render(true); return; }
  if(d.addroute){ if(!hasRoute(d.addroute)) S.routes.push(d.addroute); render(true); return; }
  if(d.addextra){ if(!S.extra.some(x=>x.h===d.addextra)) S.extra.push({h:d.addextra,p:d.plain,l:d.l}); render(true); setTimeout(runSearch,0); return; }
  if(d.fxcommon){ const u=d.fxcommon, U=FUN[u], KU=B.kept[u]||{}; features().present.forEach(p=>{ if(U.bits[p.h] && (KU[p.h]||0)/U.genes.length>0.5) S.fx[u+p.h]=true; }); funnelBox(); return; }
  if(d.fxall){ Object.keys(S.fx).forEach(k=>{ if(k.indexOf(d.fxall)===0) delete S.fx[k]; }); funnelBox(); return; }
  if(d.rmextra){ S.extra=S.extra.filter(x=>x.h!==d.rmextra); render(true); return; }
  if(d.copy){ const txt=document.getElementById(d.copy).textContent; const st=document.getElementById('copyStatus');
    (navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(()=>{ st.textContent='Copied.'; }).catch(()=>{ const r=document.createRange(); r.selectNodeContents(document.getElementById(d.copy)); const s=getSelection(); s.removeAllRanges(); s.addRange(r); st.textContent='Copy was blocked here; the record is selected, so press Ctrl+C or Command+C.'; }); return; }
});
document.addEventListener('change', e=>{
  const t=e.target, d=t.dataset;
  if(d.kid){ if(t.checked){ S.ans[d.kid]={v:'yes', where:d.where}; S.ans[d.parent]=Object.assign(S.ans[d.parent]||{}, {v:'yes'}); } else delete S.ans[d.kid]; render(true); return; }
  if(d.onset){ S.ans[d.onset].onset=t.value; return; }
  if(d.freq){ S.ans[d.freq].freq=t.value; return; }
  if(d.pc){ const a=S.ctxd[d.pc]=S.ctxd[d.pc]||{}; const b=a[d.po]=a[d.po]||{}; b[d.pk]=t.value; return; }
  if(d.src){ S.ans[d.src].src=t.value; return; }
  if(d.ctx){ S.ctx[d.ctx]=t.value; render(true); return; }
  if(d.fx){ S.fx[d.fx]=!t.checked; funnelBox(); return; }
  if(d.fmode){ S.fmode=t.value; funnelBox(); return; }
});
document.addEventListener('input', e=>{
  const t=e.target, d=t.dataset;
  if(d.text){ setPath(d.text, t.value); return; }
  if(d.search){ runSearch(); }
});
document.getElementById('prevBtn').onclick=()=>{ const L=stages(); const i=L.findIndex(s=>s.id===cur); if(i>0) go(L[i-1].id); };
document.getElementById('nextBtn').onclick=()=>{ const L=stages(); const i=L.findIndex(s=>s.id===cur); if(i<L.length-1) go(L[i+1].id); };
document.getElementById('toTop').onclick=e=>{ e.preventDefault(); window.scrollTo(0,0); const j=document.getElementById('jump').querySelector('button[aria-current="true"]'); if(j) j.focus(); };
const ct=document.getElementById('coordToggle');
ct.onchange=()=>{ document.body.classList.toggle('coord', ct.checked); try{ localStorage.setItem('h2t-coord', ct.checked?'1':''); }catch(e){} render(true); if(cur==='review') loadFunnel(); };
try{ if(localStorage.getItem('h2t-coord')==='1'){ ct.checked=true; document.body.classList.add('coord'); } }catch(e){}
window.addEventListener('hashchange', ()=>{ const id=location.hash.slice(1); if(id && id!==cur) go(id); });
window.addEventListener('beforeprint', ()=>document.querySelectorAll('details').forEach(x=>x.open=true));
(function(){ const r=(B.config||{}).repo_url; const a=document.getElementById('repoLink'); if(r&&a){ a.href=r+'/issues/new/choose'; a.hidden=false; } })();
loadExample('epi');
go(location.hash.slice(1) || 'about');
