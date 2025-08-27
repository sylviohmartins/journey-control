// script.js — lógica do Validador de Jornadas


const $ = (s)=>document.querySelector(s);
const rows = $('#rows');
const overlay = $('#overlay');
const toast = $('#toast');

/* ======= Util ======= */
const p2 = (n)=>String(n).padStart(2,'0');
const fmt = (dt)=>`${dt.getFullYear()}-${p2(dt.getMonth()+1)}-${p2(dt.getDate())} ${p2(dt.getHours())}:${p2(dt.getMinutes())}`;
const fmtH = (ms)=>{ const m=Math.round(ms/60000); const h=Math.floor(m/60), mm=m%60; return `${h}h${p2(mm)}`; };
function notify(msg, ms=2200){ const el=document.createElement('div'); el.className='msg'; el.textContent=msg; toast.appendChild(el); setTimeout(()=>el.remove(), ms); }

// helper: badge — cria selo com UM único ícone de ajuda e tooltip descritivo
function badge(label, bodyHtml, kind='status'){
  const cls = kind==='ok' ? 'status ok' : (kind==='err' ? 'status err' : 'status');
  return `<span class="${cls} tooltip" tabindex="0">${label}<span class="tooltip-content">${bodyHtml}</span></span>`;
}

/* ======= Tema ======= */
function getThemePreference(){
  const stored=localStorage.getItem('themePreference');
  if(stored==='dark' || stored==='light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark':'light';
}
function setTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('themePreference', theme);
  const btn=$('#toggleTheme'); const label = btn ? btn.querySelector('.label') : null;
  if(label){ label.textContent = theme==='dark' ? 'Tema claro' : 'Tema escuro'; }
}
function toggleTheme(){ const cur=document.documentElement.getAttribute('data-theme')||getThemePreference(); setTheme(cur==='dark'?'light':'dark'); }
setTheme(getThemePreference());
$('#toggleTheme').addEventListener('click', toggleTheme);

/* ======= Linhas ======= */
function newRow(vIn='', vOut=''){
  const div=document.createElement('div'); div.className='row';
  div.innerHTML=`
    <input type="datetime-local" placeholder="Entrada" value="${vIn}">
    <input type="datetime-local" placeholder="Saída" value="${vOut}">
    <button class="btn secondary" title="Remover" type="button">Remover</button>`;
  div.querySelector('button').onclick=()=>div.remove();
  rows.appendChild(div);
}
function clearRows(){ rows.innerHTML=''; }
function parseRows(){
  const data=[];
  for(const r of rows.querySelectorAll('.row')){
    const [i1,i2]=r.querySelectorAll('input');
    if(!i1.value || !i2.value) continue;
    const start=new Date(i1.value), end=new Date(i2.value);
    if(isNaN(start) || isNaN(end)) continue;
    if(end<=start){ notify('Há intervalo com fim <= início.'); return null; }
    data.push({start, end});
  }
  data.sort((a,b)=>a.start-b.start);
  return data;
}

/* ======= Regras ======= */
const FIVE = 5*3600000, ELEVEN = 11*3600000, TEN = 10*3600000;
function analyzeNow(data){
  const jornadas=[]; let cur=null;
  for(const seg of data){
    if(!cur){
      cur={ idx:1, start:seg.start, end:seg.end, work: seg.end-seg.start, lastEnd: seg.end,
            segs:[{...seg, balizadoPrevDia:false}], flags:[], interjornadaOK:true, interGap:null, crossDayBaliza:false };
      continue;
    }
    const gap=seg.start - cur.lastEnd;
    if(gap < FIVE){
      const isPrevDay = seg.start.toDateString() !== cur.start.toDateString();
      const balPrev = isPrevDay;
      cur.work += (seg.end-seg.start);
      cur.end = seg.end;
      cur.lastEnd = seg.end;
      cur.segs.push({...seg, balizadoPrevDia: balPrev});
      if(balPrev) cur.crossDayBaliza = true;
    }else{
      cur.flags.push(cur.work > TEN ? 'Excedeu 10h de trabalho' : 'Dentro do limite de 10h');
      jornadas.push(cur);
      const interOK = gap >= ELEVEN;
      cur={ idx:jornadas.length+1, start:seg.start, end:seg.end, work: seg.end-seg.start, lastEnd: seg.end,
            segs:[{...seg, balizadoPrevDia:false}], flags:[], interjornadaOK: interOK, interGap: gap, crossDayBaliza:false };
    }
  }
  if(cur){
    cur.flags.push(cur.work > TEN ? 'Excedeu 10h de trabalho' : 'Dentro do limite de 10h');
    jornadas.push(cur);
  }
  return jornadas;
}

/* ======= Render ======= */
function render(jornadas){
  $('#output').style.display='block';
  $('#tz').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || '—';
  const tb=$('#tbl tbody'); tb.innerHTML='';
  let totalWork=0;
  let prevEnd=null;
  for(const j of jornadas){
    totalWork += j.work;
    const tr=document.createElement('tr');
    const within = j.flags.includes('Dentro do limite de 10h');
    const valid=[];
    // Descanso entre jornadas realizado
    const interGapLocal = prevEnd ? (j.start - prevEnd) : null;
    // Carga de trabalho — limite 10h
    if (j.flags.includes('Dentro do limite de 10h')) {
      const saldo = (10*3600000) - j.work;
      valid.push(badge('≤ 10h', `<div><b>Carga na jornada:</b> ${fmtH(j.work)}</div><div><b>Limite:</b> 10h00</div><div><b>Saldo restante:</b> ${fmtH(saldo)}</div>`, 'ok'));
    } else {
      const exced = j.work - (10*3600000);
      valid.push(badge('Excedeu 10h', `<div><b>Carga na jornada:</b> ${fmtH(j.work)}</div><div><b>Limite:</b> 10h00</div><div><b>Excedente:</b> ${fmtH(exced)}</div>`, 'err'));
    }
    // Interjornada — a partir da 2ª jornada
    if (j.idx > 1 && interGapLocal!==null) {
      if (j.interjornadaOK) {
        valid.push(badge('Interjornada ≥ 11h', `<div><b>Fim anterior:</b> ${fmt(prevEnd)}</div><div><b>Início atual:</b> ${fmt(j.start)}</div><hr><div><b>Descanso realizado:</b> ${fmtH(interGapLocal)}</div><div><b>Exigido:</b> 11h00</div><div><b>Próx. entrada permitida:</b> ${fmt(new Date(prevEnd.getTime() + (11*3600000)))}</div>`, 'ok'));
      } else {
        const falta = (11*3600000) - interGapLocal;
        valid.push(badge('Interjornada insuficiente', `<div><b>Fim anterior:</b> ${fmt(prevEnd)}</div><div><b>Início atual:</b> ${fmt(j.start)}</div><hr><div><b>Descanso realizado (gap):</b> ${fmtH(interGapLocal)}</div><div><b>Exigido:</b> 11h00</div><div><b>Faltaram:</b> ${fmtH(falta)}</div><div><b>Próx. entrada permitida:</b> ${fmt(new Date(prevEnd.getTime() + (11*3600000)))}</div>`, 'err'));
      }
    }
    // Baliza — atravessou dia
    if (j.crossDayBaliza) {
      valid.push(badge('Baliza', `<div>Segmentos com início em <b>outro dia</b> (ex.: dia seguinte) foram <b>ancorados</b> nesta jornada porque o gap entre eles foi &lt; 5h (baliza).</div><div></div>`));
    }
    const balizaTxt = `${p2(j.start.getHours())}:${p2(j.start.getMinutes())} → ${p2(j.end.getHours())}:${p2(j.end.getMinutes())}`;
    const janelaTxt = `${fmt(j.start)} → ${fmt(j.end)}`;


    const restTxt = prevEnd ? `${fmtH(j.start - prevEnd)}/11h00` : '—/11h00';
    const nextAllowed = prevEnd ? fmt(new Date(prevEnd.getTime() + ELEVEN)) : '—';
    tr.innerHTML = `
      <td>${j.idx}</td>
      <td>${balizaTxt}</td>
      <td>${janelaTxt}</td>
      <td class="col-rest">${restTxt}</td>
      <td class="col-next">${nextAllowed}</td>
      <td class="right">${fmtH(j.work)}</td>
      <td>${valid.join(' ')}</td>`;
    tb.appendChild(tr);
    prevEnd = j.end;

    const tr2=document.createElement('tr');
    const td=document.createElement('td'); td.colSpan=5;
    const det=document.createElement('details');
    const sum=document.createElement('summary'); sum.textContent='Detalhes';
    const list=document.createElement('div'); list.className='seglist';
    list.innerHTML = j.segs.map((s,i)=>{
      const tag = s.balizadoPrevDia ? ' <span class="status" title="Segmento incluído na jornada do dia anterior pela regra de baliza (gap &lt; 5h). A jornada é ancorada no primeiro intervalo.">balizado para o dia anterior</span>' : '';
      return `#${i+1} ${fmt(s.start)} → ${fmt(s.end)} (${fmtH(s.end-s.start)})${tag}`;
    }).join('<br>');
    det.appendChild(sum);
    det.appendChild(list);
    td.appendChild(det); tr2.appendChild(td);
    tb.appendChild(tr2);
  }

  const sumChips = $('#summary');
  sumChips.innerHTML = `
    <span class="chip">Jornadas: <b>${jornadas.length}</b></span>
    <span class="chip">Total trabalhado: <b>${fmtH(totalWork)}</b></span>`;
}

/* ======= Export/Import ======= */
function toCSV(rows, headers){
  const esc=v=>`"${String(v).replace(/"/g,'""')}"`;
  return [headers.join(',')].concat(rows.map(r=>headers.map(h=>esc(r[h]??'')).join(','))).join('\n');
}
function exportJornadasCSV(jornadas){
  const rows=jornadas.map(j=>({
    jornada:j.idx, baliza: new Date(j.start).toLocaleDateString(),
    inicio: fmt(j.start), fim: fmt(j.end), horas: fmtH(j.work),
    limite10h: j.flags.includes('Dentro do limite de 10h')?'OK':'EXCEDEU',
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

$('#exportJ').onclick=()=>{ const data=parseRows(); if(!data) return; download('jornadas.csv', exportJornadasCSV(analyzeNow(data)), 'text/csv'); };
$('#exportS').onclick=()=>{ const data=parseRows(); if(!data) return; download('segmentos.csv', exportSegmentosCSV(analyzeNow(data)), 'text/csv'); };
$('#exportJSON').onclick=()=>{ const data=parseRows(); if(!data) return; download('intervalos.json', JSON.stringify(data.map(d=>({start:d.start.toISOString(), end:d.end.toISOString()})), null, 2), 'application/json'); };

const fileJSON = $('#fileJSON');
$('#importBtn').addEventListener('click', ()=> fileJSON.click());
fileJSON.addEventListener('change', (ev)=>{
  const file=ev.target.files?.[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const arr=JSON.parse(String(reader.result));
      if(!Array.isArray(arr)) throw new Error('JSON deve ser um array de objetos {{start, end}}.');
      clearRows();
      arr.forEach(d=> newRow(String(d.start).slice(0,16), String(d.end).slice(0,16)));
      notify('JSON importado.');
    }catch(e){ notify('JSON inválido.'); }
    finally { fileJSON.value=''; }
  };
  reader.readAsText(file);
});

/* ======= Ações ======= */
$('#add').onclick=()=>newRow();
$('#clear').onclick=()=>{ clearRows(); notify('Linhas limpas.'); };
$('#demo').onclick=()=>{
  clearRows();
  const data = [
    // Jornada 1 – baliza (gaps < 5h)
    ['2025-08-24T22:00','2025-08-24T23:59'],
    ['2025-08-25T00:10','2025-08-25T02:30'],
    ['2025-08-25T04:30','2025-08-25T05:30'],
    ['2025-08-25T07:00','2025-08-25T08:00'],
    // Jornada 2 – interjornada insuficiente (gap ≥ 5h e < 11h)
    ['2025-08-25T13:30','2025-08-25T15:00'],
    ['2025-08-25T16:00','2025-08-25T16:30'],
    ['2025-08-25T20:00','2025-08-25T23:00'],
    // Jornada 3 – descanso ≥ 11h e > 10h trabalhadas (excede)
    ['2025-08-26T10:30','2025-08-26T15:30'],
    ['2025-08-26T18:30','2025-08-26T22:00'],
    ['2025-08-26T22:30','2025-08-27T01:00'],
    // Jornada 4 – gap exato de 5h (nova jornada, descanso < 11h)
    ['2025-08-27T06:00','2025-08-27T08:00'],
    ['2025-08-27T09:00','2025-08-27T10:00'],
  ];
  data.forEach(([a,b])=>newRow(a,b));
  notify('Exemplo carregado.');
};
$('#analyze').onclick=()=>{
  const data=parseRows(); if(!data || !data.length){ notify('Adicione ao menos um intervalo completo.'); return; }
  overlay.style.display='flex';
  setTimeout(()=>{
    const jornadas=analyzeNow(data);
    render(jornadas);
    localStorage.setItem('jornada:data', JSON.stringify(data.map(d=>({start:d.start.toISOString(), end:d.end.toISOString()}))));
    overlay.style.display='none';
    notify('Análise concluída.');
  }, 1200); // tempo levemente maior para visualizar o loading
};
$('#save').onclick=()=>{
  const data=parseRows(); if(!data) return;
  localStorage.setItem('jornada:data', JSON.stringify(data.map(d=>({start:d.start.toISOString(), end:d.end.toISOString()}))));
  notify('Salvo localmente.');
};
$('#load').onclick=()=>{
  const raw=localStorage.getItem('jornada:data'); if(!raw){ notify('Nada salvo.'); return; }
  try{
    const arr=JSON.parse(raw); clearRows();
    arr.forEach(d=> newRow(String(d.start).slice(0,16), String(d.end).slice(0,16)));
    notify('Carregado do navegador.');
  }catch(e){ notify('Erro ao carregar.'); }
};

/* ======= Boot ======= */
for(let i=0;i<3;i++) newRow();
