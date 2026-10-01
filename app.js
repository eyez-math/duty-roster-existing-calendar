const PUB='https://docs.google.com/spreadsheets/d/e/2PACX-1vTFeOPTzASKdYE5f7KWeMXNwN8wGvoPKWgtekpHVuhbp7MGIzB43-dvwiP7oZwqPof7peerLWq_cJ-D';
const $=s=>document.querySelector(s);

const GIDS={
  'הגדרות':'1667977560',
  'שבוע 1':'371077633',
  'שבוע 2':'849710887',
  'חופשות':'726984650'
};

let duties=[], rowsByWeek={1:[],2:[]}, holidays=[];
let cfg={
  start:new Date(2026,9,5), end:new Date(2027,0,28),
  smallStart:'10:20', smallEnd:'10:35',
  largeStart:'12:10', largeEnd:'12:35',
  morning:'08:00'
};

function norm(s){return String(s??'').trim().replace(/\s+/g,' ')}
function addDays(d,n){let x=new Date(d);x.setDate(x.getDate()+n);return x}
function iso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function parseDate(v){
 if(v instanceof Date && !isNaN(v)) return new Date(v.getFullYear(),v.getMonth(),v.getDate());
 let s=norm(v),m=s.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
 if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])
}
function parseTime(v){
 let s=norm(v),m=s.match(/(\d{1,2}):(\d{2})/);
 return m?`${String(+m[1]).padStart(2,'0')}:${m[2]}`:null
}
function people(cell){return String(cell??'').split(/\n|,|;/).map(norm).filter(Boolean)}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function gvizValue(cell){
 if(!cell)return '';
 if(cell.f!==undefined && cell.f!==null)return cell.f;
 if(cell.v===null||cell.v===undefined)return '';
 if(typeof cell.v==='string'){
   let m=cell.v.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/);
   if(m){
     let d=new Date(+m[1],+m[2],+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0));
     return m[4]!==undefined?`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`:
       `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
   }
 }
 return cell.v;
}
function tableToRows(table){
 let rows=[];
 if(table.cols?.some(c=>norm(c.label))) rows.push(table.cols.map(c=>norm(c.label)));
 for(let r of (table.rows||[])) rows.push((r.c||[]).map(gvizValue));
 return rows;
}

// JSONP / script injection: no browser CORS fetch is used.
function getSheet(name){
 const data=window.DUTY_DATA?.[name];
 if(!data) return Promise.reject(new Error(`נתונים חסרים: ${name}`));
 return Promise.resolve(data);
}

const dayOffset={'שני':0,'שלישי':1,'רביעי':2,'חמישי':3,'ראשון':6};

function readWeek(rows){
 let hi=rows.findIndex(r=>r.some(x=>dayOffset[norm(x)]!==undefined));
 if(hi<0) throw Error('לא נמצאה שורת כותרות עם ימי השבוע');
 let h=rows[hi],out=[];
 for(let r=hi+1;r<rows.length;r++){
   let location=norm(rows[r][0]); if(!location)continue;
   h.forEach((day,c)=>{
     day=norm(day);
     if(dayOffset[day]!==undefined)
       people(rows[r][c]).forEach(teacher=>out.push({day,location,teacher}));
   });
 }
 if(!out.length)throw Error('לא נמצאו שיבוצים');
 return out;
}

function readHolidays(rows){
 let out=[];
 for(let r of rows){
   let ds=r.map(parseDate).filter(Boolean);
   if(ds.length>=2)out.push([ds[0],ds[1]]);
   else if(ds.length===1)out.push([ds[0],ds[0]]);
 }
 return out;
}

function findSetting(rows, words, parser){
 for(let r of rows){
   let joined=r.map(norm).join(' ');
   if(words.every(w=>joined.includes(w))){
     for(let i=1;i<r.length;i++){let v=parser(r[i]);if(v)return v}
     for(let v of r){let p=parser(v);if(p)return p}
   }
 }
 return null;
}
function readSettings(rows){
 cfg.start=findSetting(rows,['תחילת','מחצית'],parseDate)||findSetting(rows,['תאריך','התחלה'],parseDate)||cfg.start;
 cfg.end=findSetting(rows,['סיום','מחצית'],parseDate)||findSetting(rows,['תאריך','סיום'],parseDate)||cfg.end;
 cfg.smallStart=findSetting(rows,['קטנה','התחלה'],parseTime)||findSetting(rows,['הפסקה','קטנה'],parseTime)||cfg.smallStart;
 cfg.smallEnd=findSetting(rows,['קטנה','סיום'],parseTime)||cfg.smallEnd;
 cfg.largeStart=findSetting(rows,['גדולה','התחלה'],parseTime)||findSetting(rows,['הפסקה','גדולה'],parseTime)||cfg.largeStart;
 cfg.largeEnd=findSetting(rows,['גדולה','סיום'],parseTime)||cfg.largeEnd;
 cfg.morning=findSetting(rows,['בוקר'],parseTime)||cfg.morning;
}

function holiday(d){return holidays.some(([a,b])=>d>=a&&d<=b)}
function fullHolidayWeek(mon){return [0,1,2,3].every(n=>holiday(addDays(mon,n)))}
function buildDates(){
 let week=1,result=[];
 for(let mon=new Date(cfg.start);mon<=cfg.end;mon=addDays(mon,7)){
   if(fullHolidayWeek(mon))continue; // freeze Week 1/2 cycle during full holiday week
   for(let [day,off] of Object.entries(dayOffset)){
     let d=addDays(mon,off);
     if(d>=cfg.start&&d<=cfg.end&&!holiday(d))result.push({date:d,day,week});
   }
   week=week===1?2:1;
 }
 return result;
}
function fmt(d){return new Intl.DateTimeFormat('he-IL',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(d)}

async function init(){
 const select=$('#teacher');
 select.innerHTML='<option value="">טוען רשימת מורים…</option>';
 $('#msg').textContent='';
 try{
   // Settings is intentionally loaded too; safe defaults remain if a label differs.
   const [settings,w1,w2,h]=await Promise.all([
     getSheet('הגדרות'),getSheet('שבוע 1'),getSheet('שבוע 2'),getSheet('חופשות')
   ]);
   readSettings(settings);
   rowsByWeek[1]=readWeek(w1);
   rowsByWeek[2]=readWeek(w2);
   holidays=readHolidays(h);
   let names=[...new Set([...rowsByWeek[1],...rowsByWeek[2]].map(x=>x.teacher))]
     .sort((a,b)=>a.localeCompare(b,'he'));
   select.innerHTML='<option value="">בחירת מורה</option>';
   names.forEach(n=>select.add(new Option(n,n)));
   $('#msg').textContent=`נטענו ${names.length} מורים מהטבלה המעודכנת.`;
 }catch(e){
   console.error(e);
   select.innerHTML='<option value="">שגיאה בטעינה</option>';
   $('#msg').textContent=`שגיאה: ${e.message}`;
 }
}

$('#teacher').onchange=e=>{
 let t=e.target.value;duties=[];$('#add').disabled=true;
 if(!t){$('#duties').innerHTML='<div class="empty">בחרו מורה</div>';return}
 for(let x of buildDates())
   for(let a of rowsByWeek[x.week])
     if(a.day===x.day&&a.teacher===t)duties.push({...a,date:x.date,week:x.week});
 $('#add').disabled=!duties.length;
 $('#duties').innerHTML=duties.length?duties.map(d=>
   `<article class="card"><div class="date">${fmt(d.date)}</div><div class="loc">${esc(d.location)}</div><div class="meta">שבוע ${d.week} · ${cfg.smallStart} וגם ${cfg.largeStart}</div></article>`
 ).join(''):'<div class="empty">לא נמצאו תורנויות</div>';
};

function stamp(date,time){return iso(date).replaceAll('-','')+'T'+time.replace(':','')+'00'}
function clean(s){return String(s).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;')}
function ve(d,start,end,title,desc,alarm,uid){
 return `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z')}\r\nDTSTART;TZID=Asia/Jerusalem:${stamp(d,start)}\r\nDTEND;TZID=Asia/Jerusalem:${stamp(d,end)}\r\nSUMMARY:${clean(title)}\r\nDESCRIPTION:${clean(desc)}\r\nBEGIN:VALARM\r\nTRIGGER:${alarm===0?'PT0M':'-PT'+alarm+'M'}\r\nACTION:DISPLAY\r\nDESCRIPTION:${clean(title)}\r\nEND:VALARM\r\nEND:VEVENT\r\n`
}
$('#add').onclick=()=>{
 let t=$('#teacher').value;
 let b='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//School Duty//HE\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n';
 duties.forEach((d,i)=>{
   let id=`${iso(d.date)}-${i}-${encodeURIComponent(t)}@duty`;
   b+=ve(d.date,cfg.morning,'08:05','היום יש לך תורנות',`מיקום: ${d.location}`,0,id+'m');
   b+=ve(d.date,cfg.smallStart,cfg.smallEnd,`תורנות – ${d.location}`,'הפסקה קטנה',10,id+'s');
   b+=ve(d.date,cfg.largeStart,cfg.largeEnd,`תורנות – ${d.location}`,'הפסקה גדולה',10,id+'l');
 });
 b+='END:VCALENDAR\r\n';
 let u=URL.createObjectURL(new Blob([b],{type:'text/calendar;charset=utf-8'}));
 let a=document.createElement('a');a.href=u;a.download=`תורנויות-${t}.ics`;a.click();
 setTimeout(()=>URL.revokeObjectURL(u),1000);
};

init();
