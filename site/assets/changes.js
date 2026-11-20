"use strict";
/* Summary of changes page. Content comes from content/notes/proposed-changes.yaml and the crosswalk files,
   embedded by scripts/build.py. */
const D = JSON.parse(document.getElementById('changes').textContent);
const esc = s => String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const BASIS = {source:'Published source or standard', analysis:'Analysis of HPO data', judgment:'Design judgment, to be tested'};
/* number the sources in the order they are first cited */
const order = [];
D.sections.forEach(s=>s.changes.forEach(c=>(c.sources||[]).forEach(k=>{ if(order.indexOf(k)<0) order.push(k); })));
const num = k => order.indexOf(k)+1;
const cite = c => (c.sources||[]).map(k=>'<a href="#ref-'+k+'">['+num(k)+']</a>').join(' ');

let h = '<p>'+esc(D.intro)+'</p><p class="small"><span class="basis source">'+BASIS.source+'</span> <span class="basis analysis">'+BASIS.analysis+'</span> <span class="basis judgment">'+BASIS.judgment+'</span> Built with HPO release '+esc(D.hpo_version)+'.</p>';
D.sections.forEach(s=>{
  h += '<section class="sec" id="'+slug(s.title)+'"><h2>'+esc(s.title)+'</h2><div class="tablewrap"><table class="chg"><thead><tr><th>Change</th><th>Original</th><th>Proposed</th><th>Rationale</th><th>Rests on</th></tr></thead><tbody>'+
    s.changes.map(c=>'<tr><td class="c">'+esc(c.change)+'</td><td class="o">'+esc(c.original)+'</td><td class="p">'+esc(c.proposed)+'</td><td class="r">'+esc(c.rationale)+'</td><td class="b"><span class="basis '+esc(c.basis)+'">'+esc(BASIS[c.basis]||c.basis)+'</span><div>'+cite(c)+'</div></td></tr>').join('')+'</tbody></table></div>';
  if(s.title==='HPO terms' && D.term_rows.length) h += '<details id="term-list"><summary>Every Health Survey answer whose HPO term was corrected or replaced</summary><div class="in"><table><thead><tr><th>Section</th><th>Original answer</th><th>Term as printed</th><th>Proposed term</th><th>Reason</th></tr></thead><tbody>'+D.term_rows.map(r=>'<tr><td>'+esc(r.section)+'</td><td>'+esc(r.original)+'</td><td class="small">'+esc(r.printed)+'</td><td class="small">'+esc(r.proposed)+'</td><td>'+esc(r.note)+'</td></tr>').join('')+'</tbody></table></div></details>';
  if(s.title==='Seizure follow-up' && D.seizure_rows.length) h += '<details id="seizure-list"><summary>Every Seizure Survey question that was corrected, split, or merged</summary><div class="in"><table><thead><tr><th>Page</th><th>Original question or option</th><th>Change</th><th>Reason</th></tr></thead><tbody>'+D.seizure_rows.map(r=>'<tr><td>'+esc(r.page)+'</td><td>'+esc(r.original)+'</td><td>'+esc(r.label)+'</td><td>'+esc(r.note)+'</td></tr>').join('')+'</tbody></table></div></details>';
  h += '<a class="totop" href="#top">Back to top</a></section>';
});
h += '<section class="sec" id="sources"><h2>Sources</h2><ol class="refs">'+order.map(k=>{ const s=D.sources[k]; return '<li id="ref-'+k+'">'+esc(s.title)+(s.url?' <a href="'+esc(s.url)+'">'+esc(s.url)+'</a>':'')+'</li>'; }).join('')+'</ol><a class="totop" href="#top">Back to top</a></section>';
document.getElementById('main').innerHTML = h;
document.getElementById('jump').innerHTML = D.sections.map(s=>'<button type="button" data-to="'+slug(s.title)+'">'+esc(s.title)+'</button>').join('')+'<button type="button" data-to="sources">Sources</button>';
function openFor(id){ const el=document.getElementById(id); if(!el) return; const d=el.closest('details')||(el.tagName==='DETAILS'?el:null); if(d) d.open=true; el.scrollIntoView(); }
document.getElementById('jump').addEventListener('click', e=>{ const b=e.target.closest('button'); if(b){ history.replaceState(null,'','#'+b.dataset.to); openFor(b.dataset.to); } });
window.addEventListener('beforeprint', ()=>document.querySelectorAll('details').forEach(x=>x.open=true));
window.addEventListener('hashchange', ()=>openFor(location.hash.slice(1)));
if(location.hash) openFor(location.hash.slice(1));
