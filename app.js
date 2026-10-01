const PUB='https://docs.google.com/spreadsheets/d/e/2PACX-1vTFeOPTzASKdYE5f7KWeMXNwN8wGvoPKWgtekpHVuhbp7MGIzB43-dvwiP7oZwqPof7peerLWq_cJ-D';
const $=s=>document.querySelector(s);
let duties=[], rowsByWeek={1:[],2:[]}, holidays=[];

function csvUrl(sheet){return `${PUB}/pub?output=csv&sheet=${encodeURIComponent(sheet)}`}
function parseCSV(text){
 let rows=[],row=[],v='',q=false;
 for(let i=0;i<text.length;i++){let c=text[i],n=text[i+1];
  if(q){if(c=='"'&&n=='"'){v+='"';i++}else if(c=='"')q=false;else v+=c}
  else if(c=='"')q=true;else if(c==','){row.push(v);v=''}else if(c=='\n'){row.push(v.replace(/\r$/,''));rows.push(row);row=[];v=''}else v+=c}
 row.push(v.replace(/\r$/,''));if(row.some(x=>x!==''))rows.push(row);return rows
}
async function getSheet(name){let r=await fetch(csvUrl(name),{cache:'no-store'});if(!r.ok)throw Error(name);return parseCSV(await r.text())}
function norm(s){return String(s||'').trim().replace(/\s+/g,' ')}
function people(cell){return String(cell||'').split(/\n|,|;/).map(norm).filter(Boolean)}
function iso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function addDays(d,n){let x=new Date(d);x.setDate(x.getDate()+n);return x}
function parseDate(s){s=norm(s);let m=s.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);if(!m)return null;let y=+m[3];if(y<100)y+=2000;return new Date(y,+m[2]-1,+m[1])}
const dayOffset={'שני':0,'שלישי':1,'רביעי':2,'חמישי':3,'ראשון':6};
function readWeek(rows){
 // supports table whose day names are column headers and locations are first column
 let hi=rows.findIndex(r=>r.some(x=>dayOffset[norm(x)]!==undefined)); if(hi<0)throw Error('מבנה שבוע');
 let h=rows[hi], out=[];
 for(let r=hi+1;r<rows.length;r++){let location=norm(rows[r][0]);if(!location)continue;
  h.forEach((day,c)=>{day=norm(day);if(dayOffset[day]!==undefined)people(rows[r][c]).forEach(teacher=>out.push({day,location,teacher}))})
 } return out
}
function readHolidays(rows){let out=[];for(let r of rows){let ds=r.map(parseDate).filter(Boolean);if(ds.length>=2)out.push([ds[0],ds[1]]);else if(ds.length==1)out.push([ds[0],ds[0]])}return out}
function holiday(d){return holidays.some(([a,b])=>d>=a&&d<=b)}
function fullHolidayWeek(mon){return [0,1,2,3].every(n=>holiday(addDays(mon,n)))}
function buildDates(){
 let start=new Date(2026,9,5), end=new Date(2027,0,28), week=1, result=[];
 for(let mon=new Date(start);mon<=end;mon=addDays(mon,7)){
   if(fullHolidayWeek(mon))continue;
   for(let [day,off] of Object.entries(dayOffset)){let d=addDays(mon,off);if(d>=start&&d<=end&&!holiday(d))result.push({date:d,day,week})}
   week=week===1?2:1;
 } return result
}
function fmt(d){return new Intl.DateTimeFormat('he-IL',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(d)}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function init(){
 try{
  let [w1,w2,h]=await Promise.all([getSheet('שבוע 1'),getSheet('שבוע 2'),getSheet('חופשות')]);
  rowsByWeek[1]=readWeek(w1);rowsByWeek[2]=readWeek(w2);holidays=readHolidays(h);
  let names=[...new Set([...rowsByWeek[1],...rowsByWeek[2]].map(x=>x.teacher))].sort((a,b)=>a.localeCompare(b,'he'));
  let s=$('#teacher');s.innerHTML='<option value="">בחירת מורה</option>';names.forEach(n=>s.add(new Option(n,n)));
 }catch(e){console.error(e);$('#teacher').innerHTML='<option>שגיאה בטעינה</option>';$('#msg').textContent='לא הצלחתי לקרוא את הטבלה שפורסמה. ודאו שהלשוניות שבוע 1, שבוע 2 וחופשות מפורסמות.'}
}
$('#teacher').onchange=e=>{
 let t=e.target.value; duties=[]; $('#add').disabled=true;if(!t){$('#duties').innerHTML='<div class="empty">בחרו מורה</div>';return}
 for(let x of buildDates()) for(let a of rowsByWeek[x.week]) if(a.day===x.day&&a.teacher===t)duties.push({...a,date:x.date,week:x.week});
 $('#add').disabled=!duties.length;
 $('#duties').innerHTML=duties.length?duties.map(d=>`<article class="card"><div class="date">${fmt(d.date)}</div><div class="loc">${esc(d.location)}</div><div class="meta">שבוע ${d.week} · 10:20 וגם 12:10</div></article>`).join(''):'<div class="empty">לא נמצאו תורנויות</div>';
};
function stamp(date,time){return iso(date).replaceAll('-','')+'T'+time.replace(':','')+'00'}
function clean(s){return String(s).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;')}
function ve(d,start,end,title,desc,alarm,uid){return `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z')}\r\nDTSTART;TZID=Asia/Jerusalem:${stamp(d,start)}\r\nDTEND;TZID=Asia/Jerusalem:${stamp(d,end)}\r\nSUMMARY:${clean(title)}\r\nDESCRIPTION:${clean(desc)}\r\nBEGIN:VALARM\r\nTRIGGER:${alarm===0?'PT0M':'-PT'+alarm+'M'}\r\nACTION:DISPLAY\r\nDESCRIPTION:${clean(title)}\r\nEND:VALARM\r\nEND:VEVENT\r\n`}
$('#add').onclick=()=>{
 let t=$('#teacher').value,b='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//School Duty//HE\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n';
 duties.forEach((d,i)=>{let id=`${iso(d.date)}-${i}-${encodeURIComponent(t)}@duty`;b+=ve(d.date,'08:00','08:05','היום יש לך תורנות',`מיקום: ${d.location}`,0,id+'m');b+=ve(d.date,'10:20','10:35',`תורנות – ${d.location}`,'הפסקה קטנה',10,id+'s');b+=ve(d.date,'12:10','12:35',`תורנות – ${d.location}`,'הפסקה גדולה',10,id+'l')});b+='END:VCALENDAR\r\n';
 let u=URL.createObjectURL(new Blob([b],{type:'text/calendar;charset=utf-8'})),a=document.createElement('a');a.href=u;a.download=`תורנויות-${t}.ics`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)
};
init();
