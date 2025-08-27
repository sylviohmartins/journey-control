// script.js — extraído e refatorado do basic.html

const $ = sel => document.querySelector(sel);
const rows = $('#rows');
const overlay = $('#overlay');
const toast = $('#toast');

function notify(msg, ms = 2500) {
  const el = document.createElement('div');
  el.className = 'msg';
  el.textContent = msg;
  toast.appendChild(el);
  setTimeout(() => { el.remove(); }, ms);
}

function newRow(vIn = '', vOut = '') {
  const div = document.createElement('div');
  div.className = 'row';
  div.innerHTML = `
    <input type="datetime-local" placeholder="Início" value="${vIn}">
    <input type="datetime-local" placeholder="Fim" value="${vOut}">
    <button class="btn secondary" title="Remover">Remover</button>`;
  div.querySelector('button').onclick = () => div.remove();
  rows.appendChild(div);
}
function clearRows(){ rows.innerHTML=''; }

function parseRows() {
  const data = [];
  for (const r of rows.querySelectorAll('.row')) {
    const [i1, i2] = r.querySelectorAll('input');
    if (!i1.value || !i2.value) continue;
    const start = new Date(i1.value);
    const end = new Date(i2.value);
    if (isNaN(start) || isNaN(end)) continue;
    if (end <= start) { notify('Existe intervalo com fim <= início. Verifique.'); return null; }
    data.push({ start, end });
  }
  data.sort((a,b) => a.start - b.start);
  return data;
}
const p2 = n => String(n).padStart(2,'0');
function fmt(dt){ return `${dt.getFullYear()}-${p2(dt.getMonth()+1)}-${p2(dt.getDate())} ${p2(dt.getHours())}:${p2(dt.getMinutes())}`; }
function fmtH(ms){ const m=Math.round(ms/60000); const h=Math.floor(m/60), mm=m%60; return `${h}h${p2(mm)}`; }

function analyzeNow(data){
  const FIVE=5*3600000, ELEVEN=11*3600000, TEN=10*3600000;
  const jornadas=[]; let cur=null;
  for(const seg of data){
    if(!cur){
      cur = { idx:1, start:seg.start, end:seg.end, work: seg.end-seg.start, lastEnd: seg.end, segs:[{...seg}], flags:[], interjornadaOK:true, interGap:null };
      continue;
    }
    const gap = seg.start - cur.lastEnd;
    if(gap < FIVE){
      cur.work += (seg.end-seg.start);
      cur.end = seg.end;
      cur.lastEnd = seg.end;
      cur.segs.push({...seg});
    } else {
      cur.flags.push(cur.work > TEN ? 'Excedeu 10h00 de trabalho' : 'Dentro do limite de 10h00');
      jornadas.push(cur);
      const interOK = gap >= ELEVEN;
      cur = { idx:jornadas.length+1, start:seg.start, end:seg.end, work: seg.end-seg.start, lastEnd: seg.end, segs:[{...seg}], flags:[], interjornadaOK: interOK, interGap: gap };
    }
  }
  if(cur){
    cur.flags.push(cur.work > TEN ? 'Excedeu 10h00 de trabalho' : 'Dentro do limite de 10h00');
    jornadas.push(cur);
  }
  return jornadas;
}

function render(jornadas){
  $('#output').style.display='block';
  $('#tz').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tb = $('#tbl tbody'); tb.innerHTML='';
  let totalWork=0;

  for(const j of jornadas){
    totalWork += j.work;
    const tr = document.createElement('tr');
    const val=[];
    const within = j.flags.includes('Dentro do limite de 10h00');
    val.push(within ? `<span class="status ok">≤ 10h00</span>` : `<span class="status err">Excedeu 10h00</span>`);
    if(j.idx>1){
      if(!j.interjornadaOK){
        const falta = (11*3600000 - j.interGap);
        val.push(`<span class="status err">Interjornada insuficiente (faltaram ${fmtH(falta)})</span>`);
      } else {
        val.push(`<span class="status ok">Interjornada ≥ 11h00</span>`);
      }
    }
    tr.innerHTML = `
      <td>${j.idx}</td>
      <td>${new Date(j.start).toLocaleDateString()}</td>
      <td>${fmt(j.start)} → ${fmt(j.end)}</td>
      <td class="right">${fmtH(j.work)}</td>
      <td>${val.join(' ')}</td>`;
    tb.appendChild(tr);

    const tr2 = document.createElement('tr');
    const td = document.createElement('td'); td.colSpan=5;
    const det = document.createElement('details');
    const sum = document.createElement('summary'); sum.textContent='Detalhes';
    const ul = document.createElement('div'); ul.className='seglist';
    ul.innerHTML = j.segs.map((s,i)=>`#${i+1} ${fmt(s.start)} → ${fmt(s.end)} (${fmtH(s.end-s.start)})`).join('<br>');
    det.appendChild(sum); det.appendChild(ul);
    td.appendChild(det); tr2.appendChild(td);
    tb.appendChild(tr2);
  }
  const sumChips = $('#summary');
  sumChips.innerHTML = `
    <span class="chip">Jornadas: <b>${jornadas.length}</b></span>
    <span class="chip">Total trabalhado: <b>${fmtH(totalWork)}</b></span>`;
}

function analyze(){
  const data=parseRows();
  if(!data || data.length===0){ notify('Adicione ao menos um intervalo completo.'); return; }
  overlay.style.display='flex';
  setTimeout(()=>{
    const jornadas=analyzeNow(data);
    render(jornadas);
    localStorage.setItem('jornada:data', JSON.stringify(data.map(d=>({start:d.start.toISOString(), end:d.end.toISOString()}))));
    overlay.style.display='none';
    notify('Análise concluída.');
  }, 80);
}

/* CSV helpers + download */
function toCSV(rows, headers){
  const esc=v=>`"${String(v).replace(/"/g,'""')}"`;
  return [headers.join(',')].concat(rows.map(r=>headers.map(h=>esc(r[h]??'')).join(','))).join('\n');
}
function exportJornadasCSV(jornadas){
  const rows=jornadas.map(j=>({
    jornada:j.idx, baliza: new Date(j.start).toLocaleDateString(),
    inicio: fmt(j.start), fim: fmt(j.end), horas: fmtH(j.work),
    limite10h: j.flags.includes('Dentro do limite de 10h00')?'OK':'EXCEDEU',
    interjornada: j.idx>1 ? (j.interjornadaOK?'OK':`INSUFICIENTE (${fmtH(j.interGap)})`) : '—'
  }));
  return toCSV(rows, ['jornada','baliza','inicio','fim','horas','limite10h','interjornada']);
}
function exportSegmentosCSV(jornadas){
  const out=[];
  for(const j of jornadas){
    j.segs.forEach((s,i)=>out.push({ jornada:j.idx, segmento:i+1, inicio:fmt(s.start), fim:fmt(s.end), horas:fmtH(s.end-s.start) }));
  }
  return toCSV(out, ['jornada','segmento','inicio','fim','horas']);
}
function download(name, content, mime='text/plain'){
  const blob=new Blob([content], {type:mime+';charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href);
}

/* Export/Import wiring */
document.getElementById('exportJ').onclick = ()=>{
  const data=parseRows(); if(!data) return;
  const js=analyzeNow(data);
  download('jornadas.csv', exportJornadasCSV(js), 'text/csv');
};
document.getElementById('exportS').onclick = ()=>{
  const data=parseRows(); if(!data) return;
  const js=analyzeNow(data);
  download('segmentos.csv', exportSegmentosCSV(js), 'text/csv');
};
document.getElementById('exportJSON').onclick = ()=>{
  const data=parseRows(); if(!data) return;
  const out = data.map(d=>({ start:d.start.toISOString(), end:d.end.toISOString() }));
  download('intervalos.json', JSON.stringify(out, null, 2), 'application/json');
};

/* REFATORAÇÃO: Import JSON como BOTÃO + input oculto */
const fileJSON = document.getElementById('fileJSON');
document.getElementById('importBtn').addEventListener('click', ()=> fileJSON.click());
fileJSON.addEventListener('change', (ev)=>{
  const file = ev.target.files?.[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload = ()=>{
    try{
      const arr = JSON.parse(String(reader.result));
      if(!Array.isArray(arr)) throw new Error('JSON deve ser um array de objetos {start, end}.');
      clearRows();
      arr.forEach(d=> newRow(String(d.start).slice(0,16), String(d.end).slice(0,16)));
      notify('JSON importado.');
    }catch(e){
      notify('JSON inválido.');
    } finally {
      fileJSON.value=''; // permite reimportar o mesmo arquivo
    }
  };
  reader.readAsText(file);
});

/* Ações principais */
document.getElementById('add').onclick = ()=> newRow();
document.getElementById('demo').onclick = ()=>{
  clearRows();
  /*
   * Este conjunto cobre todos os cenários:
   * 1) Jornada 1 (baliza): todos os gaps < 5h.
   * 2) Jornada 2: gap ≥ 5h e < 11h00 → interjornada insuficiente.
   * 3) Jornada 3: descanso ≥ 11h00 e >10h00 de trabalho (excede limite).
   * 4) Jornada 4: gap exato de 5h → nova jornada e descanso < 11h00.
   */
  const data = [
    // Jornada 1 – baliza
    ['2025-08-24T22:00', '2025-08-24T23:59'],
    ['2025-08-25T00:10', '2025-08-25T02:30'],
    ['2025-08-25T04:30', '2025-08-25T05:30'],
    ['2025-08-25T07:00', '2025-08-25T08:00'],
    // Jornada 2 – interjornada insuficiente
    ['2025-08-25T13:30', '2025-08-25T15:00'],
    ['2025-08-25T16:00', '2025-08-25T16:30'],
    ['2025-08-25T20:00', '2025-08-25T23:00'],
    // Jornada 3 – descanso ≥ 11h00, mas excede 10h00 trabalhadas
    ['2025-08-26T10:30', '2025-08-26T15:30'],
    ['2025-08-26T18:30', '2025-08-26T22:00'],
    ['2025-08-26T22:30', '2025-08-27T01:00'],
    // Jornada 4 – gap de 5h (nova jornada com descanso insuficiente)
    ['2025-08-27T06:00', '2025-08-27T08:00'],
    ['2025-08-27T09:00', '2025-08-27T10:00'],
  ];
  for(const [a,b] of data) newRow(a,b);
  notify('Exemplo carregado.');
};
document.getElementById('clear').onclick = ()=> { clearRows(); notify('Limpo.'); };
document.getElementById('analyze').onclick = analyze;

document.getElementById('save').onclick = ()=>{
  const data=parseRows(); if(!data) return;
  localStorage.setItem('jornada:data', JSON.stringify(data.map(d=>({start:d.start.toISOString(), end:d.end.toISOString()}))));
  notify('Salvo no navegador.');
};
document.getElementById('load').onclick = ()=>{
  const raw=localStorage.getItem('jornada:data'); if(!raw){ notify('Nada salvo.'); return; }
  try{
    const arr=JSON.parse(raw); clearRows();
    arr.forEach(d=> newRow(d.start.slice(0,16), d.end.slice(0,16)));
    notify('Carregado do navegador.');
  }catch(e){ notify('Erro ao carregar.'); }
};

/* Boot */
for(let i=0;i<3;i++) newRow();

/* Tema (data-theme no :root) */
function getThemePreference(){
  const stored=localStorage.getItem('themePreference');
  if(stored==='dark' || stored==='light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark':'light';
}
function setTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('themePreference', theme);
  const btn=document.getElementById('toggleTheme');
  const label = btn ? btn.querySelector('.label') : null;
  if(label){ label.textContent = theme==='dark' ? 'Tema claro' : 'Tema escuro'; }
}
function toggleTheme(){
  const current=document.documentElement.getAttribute('data-theme') || getThemePreference();
  setTheme(current==='dark'?'light':'dark');
}
setTheme(getThemePreference());
document.getElementById('toggleTheme').addEventListener('click', toggleTheme);
