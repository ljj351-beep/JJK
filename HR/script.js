const YEAR = 2026;
const TODAY = new Date(2026, 6, 24); // Jul 24 2026, matches "current date"

/* ---------- deterministic pseudo-random helpers ---------- */
function hashSeed(str){
  let h = 1779033703 ^ str.length;
  for(let i=0;i<str.length;i++){
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function(){
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
function pick(rng, arr){ return arr[Math.floor(rng()*arr.length)]; }
function dateKey(d){ return d.toISOString().slice(0,10); }
function isWeekend(d){ const w=d.getDay(); return w===0||w===6; }

function randomWeekdaysInYear(rng, count, avoidSet, maxDate){
  const dates = [];
  let guard = 0;
  while(dates.length < count && guard < 4000){
    guard++;
    const month = Math.floor(rng()*12);
    const day = 1 + Math.floor(rng()*28);
    const d = new Date(YEAR, month, day);
    if(isWeekend(d)) continue;
    if(maxDate && d > maxDate) continue;
    const key = dateKey(d);
    if(avoidSet.has(key)) continue;
    avoidSet.add(key);
    dates.push(key);
  }
  return dates;
}

/* ---------- employee dataset ---------- */
const rawEmployees = [
  { id:'EMP-1042', name:'Jerome Tan', role:'Data Analyst, Ops', stress:'mediocre', annualUsed:5, medicalUsed:2, schedule:'Mon–Fri · 9:00–17:00' },
  { id:'EMP-1017', name:'Priya Nair', role:'Product Designer', stress:'low', annualUsed:8, medicalUsed:1, schedule:'Mon–Fri · 9:00–17:00' },
  { id:'EMP-1088', name:'Marcus Lim', role:'Backend Engineer', stress:'high', annualUsed:2, medicalUsed:4, schedule:'Mon–Fri · 9:30–18:00' },
  { id:'EMP-1023', name:'Farah Aziz', role:'Finance Executive', stress:'mediocre', annualUsed:6, medicalUsed:0, schedule:'Mon–Fri · 9:00–17:00' },
  { id:'EMP-1055', name:'Wei Ling Ho', role:'Customer Success', stress:'low', annualUsed:9, medicalUsed:2, schedule:'Mon–Fri · 8:30–17:30' },
  { id:'EMP-1071', name:'Daniel Cruz', role:'IT Support', stress:'high', annualUsed:3, medicalUsed:5, schedule:'Mon–Fri · 9:00–17:00' },
];

const ANNUAL_ENTITLEMENT = 14;
const MEDICAL_ENTITLEMENT = 14;

const STRESS_META = {
  low: { label:'Low Stress', desc:'Workload, leave usage and rest patterns are well within a sustainable range.' },
  mediocre: { label:'Mediocre Stress', desc:'Workload is moderate. Some sustained busy stretches, but recovery time looks adequate.' },
  high: { label:'High Stress', desc:'Sustained high workload with limited recovery. Consider checking in on capacity and upcoming leave.' },
};

const employees = rawEmployees.map(e => {
  const rng = hashSeed(e.id + '-leave');
  const used = new Set();
  const annualLeave = randomWeekdaysInYear(rng, e.annualUsed, used);
  const medicalLeave = randomWeekdaysInYear(rng, e.medicalUsed, used, TODAY);
  return { ...e, annualEntitlement: ANNUAL_ENTITLEMENT, medicalEntitlement: MEDICAL_ENTITLEMENT, annualLeave, medicalLeave };
});

const RISK_META = {
  low: { label:'Low Risk', desc:'After-hours activity, absence patterns and leave usage all look sustainable right now.' },
  moderate: { label:'Moderate Risk', desc:'A few early indicators — worth a light-touch check-in, no cause for alarm yet.' },
  high: { label:'High Risk', desc:'Multiple indicators trending the wrong way at once. Consider a supportive 1:1 and a look at upcoming workload.' },
  critical: { label:'Critical Risk', desc:'Strong, compounding signal across after-hours work, absences and unused leave. Recommend a check-in this week.' },
};

/* ---------- burnout early-warning score ----------
   Combines three inputs HR teams commonly track for burnout early-warning:
   1) overtime / after-hours & weekend digital activity
   2) absenteeism trend (recent medical leave vs the prior period)
   3) PTO utilization (unused annual leave is itself a risk signal, not a positive)
   This is a simulated, illustrative score for the prototype — see the disclosure
   note in the employee page for how this would work with real data. */
function countLeaveInWindow(leaveDates, start, end){
  return leaveDates.filter(k => {
    const d = new Date(k);
    return d > start && d <= end;
  }).length;
}

function daysInRange(startExclusive, endInclusive){
  const days = [];
  const d = new Date(startExclusive.getTime());
  d.setDate(d.getDate()+1);
  while(d <= endInclusive){
    days.push(new Date(d));
    d.setDate(d.getDate()+1);
  }
  return days;
}

function formatTime(hour, minute){
  const h12 = ((hour + 11) % 12) + 1;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h12}:${String(minute).padStart(2,'0')} ${ampm}`;
}

function sampleDateKeys(rng, pool, count){
  const arr = pool.slice();
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(rng()*(i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
  return arr.slice(0, Math.min(count, arr.length)).map(dateKey);
}

function computeBurnoutRisk(emp){
  const rng = hashSeed(emp.id + '-overtime');
  const day = 24*60*60*1000;
  const leaveSet = new Set([...emp.annualLeave, ...emp.medicalLeave]);

  // target counts, sampled first so the rng sequence stays deterministic per employee
  const afterHoursTarget = Math.round(rng() * 22); // late-evening activity events, last 30 days
  const weekendLoginsTarget = Math.round(rng() * 9); // logins, last 8 weekends

  const last30Start = new Date(TODAY.getTime() - 30*day);
  const weekdayPool = daysInRange(last30Start, TODAY).filter(d => !isWeekend(d) && !leaveSet.has(dateKey(d)));
  const last56Start = new Date(TODAY.getTime() - 56*day);
  const weekendPool = daysInRange(last56Start, TODAY).filter(d => isWeekend(d));

  const afterHoursDates = sampleDateKeys(rng, weekdayPool, afterHoursTarget);
  const weekendLoginDates = sampleDateKeys(rng, weekendPool, weekendLoginsTarget);
  const afterHoursEvents = afterHoursDates.length;
  const weekendLogins = weekendLoginDates.length;

  // deterministic clock time for each flagged event, drawn from the same rng
  // sequence so re-renders stay stable per employee
  const afterHoursTimes = {};
  afterHoursDates.forEach(k => {
    const hour = 18 + Math.floor(rng()*6); // 6:00 PM – 11:59 PM
    const minute = Math.floor(rng()*60);
    afterHoursTimes[k] = formatTime(hour, minute);
  });
  const weekendLoginTimes = {};
  weekendLoginDates.forEach(k => {
    const hour = 9 + Math.floor(rng()*12); // 9:00 AM – 8:59 PM
    const minute = Math.floor(rng()*60);
    weekendLoginTimes[k] = formatTime(hour, minute);
  });

  const last60Start = new Date(TODAY.getTime() - 60*day);
  const prior60Start = new Date(TODAY.getTime() - 120*day);
  const recentSick = countLeaveInWindow(emp.medicalLeave, last60Start, TODAY);
  const priorSick = countLeaveInWindow(emp.medicalLeave, prior60Start, last60Start);
  const sickTrendDelta = recentSick - priorSick;

  const ptoUtilizationPct = emp.annualUsed / emp.annualEntitlement;

  const overtimeScore = Math.min(40, Math.round(afterHoursEvents*1.3 + weekendLogins*2.2));
  const absenteeismScore = Math.min(30, Math.round(recentSick*8 + Math.max(0, sickTrendDelta)*6));
  const ptoScore = Math.round(Math.max(0, 0.5 - ptoUtilizationPct) * 60);

  const total = Math.min(100, overtimeScore + absenteeismScore + ptoScore);
  const level = total >= 75 ? 'critical' : total >= 55 ? 'high' : total >= 30 ? 'moderate' : 'low';

  return {
    score: total, level,
    overtimeScore, absenteeismScore, ptoScore,
    afterHoursEvents, weekendLogins,
    afterHoursDates, weekendLoginDates,
    afterHoursTimes, weekendLoginTimes,
    recentSick, priorSick, sickTrendDelta,
    ptoUtilizationPct,
  };
}

employees.forEach(emp => { emp.risk = computeBurnoutRisk(emp); });

function initials(name){ return name.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase(); }

/* ---------- HOME PAGE render ---------- */
const rosterGrid = document.getElementById('rosterGrid');
employees.forEach(emp => {
  const card = document.createElement('div');
  card.className = 'emp-card';
  card.tabIndex = 0;
  card.setAttribute('data-stress', emp.stress);
  card.innerHTML = `
    <div class="emp-top">
      <div class="avatar">${initials(emp.name)}</div>
      <div>
        <div class="emp-name">${emp.name}</div>
        <div class="emp-role">${emp.role}</div>
        <div class="emp-id">${emp.id}</div>
      </div>
    </div>
    <div class="emp-stats">
      <div class="stat">
        <div class="stat-label">Annual leave</div>
        <div class="stat-value">${emp.annualUsed} <small>/ ${emp.annualEntitlement} days used</small></div>
      </div>
      <div class="stat">
        <div class="stat-label">Medical leave</div>
        <div class="stat-value">${emp.medicalUsed} <small>/ ${emp.medicalEntitlement} days used</small></div>
      </div>
    </div>
    <div class="pill-row">
      <div class="stress-pill" data-stress="${emp.stress}"><span class="p-dot"></span>${STRESS_META[emp.stress].label}</div>
      <div class="risk-pill" data-risk="${emp.risk.level}"><span class="p-dot"></span>${RISK_META[emp.risk.level].label} · ${emp.risk.score}</div>
    </div>
  `;
  card.addEventListener('click', () => openEmployee(emp.id));
  card.addEventListener('keydown', e => { if(e.key==='Enter' || e.key===' ') openEmployee(emp.id); });
  rosterGrid.appendChild(card);
});

/* ---------- EMPLOYEE PAGE logic ---------- */
const homePage = document.getElementById('homePage');
const employeePage = document.getElementById('employeePage');
const backBtn = document.getElementById('backBtn');

backBtn.addEventListener('click', () => {
  employeePage.classList.add('hidden');
  homePage.classList.remove('hidden');
  backBtn.classList.remove('show');
  window.scrollTo({top:0});
});

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function buildPulsePath(stress){
  // baseline sine with amplitude depending on stress level
  const amp = stress==='low' ? 6 : stress==='mediocre' ? 16 : 26;
  const jitter = stress==='high' ? 10 : stress==='mediocre' ? 4 : 1;
  let d = 'M0,30';
  const pts = 24;
  for(let i=1;i<=pts;i++){
    const x = (380/pts)*i;
    const spike = (i % 4 === 0) ? amp + (Math.sin(i)*jitter) : amp*0.25*Math.sin(i*1.7);
    const y = 30 - spike;
    d += ` L${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return d;
}

function openEmployee(empId){
  const emp = employees.find(e => e.id === empId);
  if(!emp) return;

  document.getElementById('empAvatar').textContent = initials(emp.name);
  document.getElementById('empName').textContent = emp.name;
  document.getElementById('empId').textContent = emp.id;
  document.getElementById('empRole').textContent = emp.role;
  document.getElementById('empSchedule').textContent = emp.schedule;

  const strip = document.getElementById('stressStrip');
  strip.setAttribute('data-stress', emp.stress);
  document.getElementById('stressLabel').textContent = STRESS_META[emp.stress].label;
  document.getElementById('stressDesc').textContent = STRESS_META[emp.stress].desc;

  const svg = document.getElementById('pulseSvg');
  svg.innerHTML = `<path d="${buildPulsePath(emp.stress)}" fill="none" stroke="currentColor" stroke-width="2.5"
    style="color:${emp.stress==='low' ? 'var(--stress-low)' : emp.stress==='mediocre' ? 'var(--stress-med)' : 'var(--stress-high)'}" stroke-linecap="round" stroke-linejoin="round"/>`;

  renderRiskCard(emp);
  buildCalendar(emp);
  resetSidePanel();

  homePage.classList.add('hidden');
  employeePage.classList.remove('hidden');
  backBtn.classList.add('show');
  window.scrollTo({top:0});

  // scroll to current date once rendered
  setTimeout(() => {
    const todayEl = document.getElementById('day-' + dateKey(TODAY));
    if(todayEl) todayEl.scrollIntoView({ behavior:'smooth', block:'center' });
  }, 80);
}

function renderRiskCard(emp){
  const r = emp.risk;
  const meta = RISK_META[r.level];
  document.getElementById('riskCard').setAttribute('data-risk', r.level);
  document.getElementById('riskScoreVal').textContent = r.score;
  document.getElementById('riskLabel').textContent = meta.label;
  document.getElementById('riskDesc').textContent = meta.desc;

  const trendWord = r.sickTrendDelta > 0 ? `up from ${r.priorSick}` : r.sickTrendDelta < 0 ? `down from ${r.priorSick}` : 'flat vs prior period';
  const ptoPct = Math.round(r.ptoUtilizationPct*100);

  document.getElementById('riskFactors').innerHTML = `
    <div class="rf-row">
      <div class="rf-top"><span class="rf-name">Overtime &amp; after-hours activity</span><span class="rf-val">${r.overtimeScore} / 40</span></div>
      <div class="bar-bg"><div class="bar-fill risk-fill" style="width:${r.overtimeScore/40*100}%"></div></div>
      <div class="rf-note">${r.afterHoursEvents} after-hours events, ${r.weekendLogins} weekend logins in the last 30 days</div>
    </div>
    <div class="rf-row">
      <div class="rf-top"><span class="rf-name">Absenteeism trend</span><span class="rf-val">${r.absenteeismScore} / 30</span></div>
      <div class="bar-bg"><div class="bar-fill risk-fill" style="width:${r.absenteeismScore/30*100}%"></div></div>
      <div class="rf-note">${r.recentSick} medical leave day(s) in the last 60 days, ${trendWord}</div>
    </div>
    <div class="rf-row">
      <div class="rf-top"><span class="rf-name">PTO utilization</span><span class="rf-val">${r.ptoScore} / 30</span></div>
      <div class="bar-bg"><div class="bar-fill risk-fill" style="width:${r.ptoScore/30*100}%"></div></div>
      <div class="rf-note">${ptoPct}% of annual leave entitlement used this year</div>
    </div>
  `;
}

function buildCalendar(emp){
  const col = document.getElementById('calendarCol');
  col.innerHTML = '';
  const annualSet = new Set(emp.annualLeave);
  const medicalSet = new Set(emp.medicalLeave);
  const afterHoursSet = new Set(emp.risk.afterHoursDates);
  const weekendLoginSet = new Set(emp.risk.weekendLoginDates);

  for(let m=0; m<12; m++){
    const block = document.createElement('div');
    block.className = 'month-block';

    const tab = document.createElement('div');
    tab.className = 'month-tab';
    tab.textContent = MONTH_NAMES[m] + ' ' + YEAR;
    block.appendChild(tab);

    const grid = document.createElement('div');
    grid.className = 'month-grid';

    const dowRow = document.createElement('div');
    dowRow.className = 'dow-row';
    DOW.forEach(d => { const c = document.createElement('div'); c.textContent = d; dowRow.appendChild(c); });
    grid.appendChild(dowRow);

    const dayGrid = document.createElement('div');
    dayGrid.className = 'day-grid';

    const firstDay = new Date(YEAR, m, 1);
    const startOffset = (firstDay.getDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(YEAR, m+1, 0).getDate();

    for(let i=0; i<startOffset; i++){
      const empty = document.createElement('div');
      empty.className = 'day-cell empty';
      dayGrid.appendChild(empty);
    }

    for(let d=1; d<=daysInMonth; d++){
      const date = new Date(YEAR, m, d);
      const key = dateKey(date);
      const weekend = isWeekend(date);
      const isAnnual = annualSet.has(key);
      const isMedical = medicalSet.has(key);
      const isWorkday = !weekend && !isAnnual && !isMedical;
      const isToday = key === dateKey(TODAY);
      const isFuture = date > TODAY;
      const hasWorkloadData = isWorkday && !isFuture;

      const cell = document.createElement('div');
      cell.className = 'day-cell'
        + (weekend ? ' weekend' : '')
        + (isWorkday ? ' workday' : '')
        + (isToday ? ' today' : '')
        + (isWorkday && isFuture ? ' future' : '');
      cell.id = 'day-' + key;

      let tagHtml = '';
      if(isAnnual) tagHtml = '<span class="leave-tag al">AL</span>';
      else if(isMedical) tagHtml = '<span class="leave-tag ml">ML</span>';
      else if(isWorkday){
        const loadLevel = hasWorkloadData ? generateWorkload(emp, date).level.toLowerCase() : '';
        tagHtml = `<span class="sched-tag" data-load="${loadLevel}">` + emp.schedule.split('·')[1].trim() + '</span>';
      }

      const hasAfterHours = afterHoursSet.has(key);
      const hasWeekendLogin = weekend && weekendLoginSet.has(key);
      const afterHoursTime = hasAfterHours ? emp.risk.afterHoursTimes[key] : null;
      const weekendLoginTime = hasWeekendLogin ? emp.risk.weekendLoginTimes[key] : null;

      let flagHtml = '';
      if(hasAfterHours) flagHtml += `<span class="ot-dot" title="After-hours activity — ${afterHoursTime}"></span>`;
      if(hasWeekendLogin) flagHtml += `<span class="wk-dot" title="Weekend login — ${weekendLoginTime}"></span>`;

      let timeHtml = '';
      if(hasAfterHours) timeHtml += `<span class="event-time ot-time">${afterHoursTime}</span>`;
      if(hasWeekendLogin) timeHtml += `<span class="event-time wk-time">${weekendLoginTime}</span>`;

      cell.innerHTML = `<div class="d-num">${d}</div>${tagHtml}${flagHtml}${timeHtml}`;

      if(hasWorkloadData){
        cell.tabIndex = 0;
        cell.title = hasAfterHours ? `View workload — after-hours activity at ${afterHoursTime}` : 'View workload for this day';
        cell.addEventListener('click', () => selectDay(emp, date, cell));
        cell.addEventListener('keydown', e => { if(e.key==='Enter' || e.key===' ') selectDay(emp, date, cell); });
      } else if(isWorkday && isFuture){
        cell.title = 'Upcoming day — no workload data yet';
      } else if(hasWeekendLogin){
        cell.classList.add('has-login');
        cell.tabIndex = 0;
        cell.title = `Weekend login logged at ${weekendLoginTime}`;
        cell.addEventListener('click', () => selectLoginDay(emp, date, cell));
        cell.addEventListener('keydown', e => { if(e.key==='Enter' || e.key===' ') selectLoginDay(emp, date, cell); });
      }
      dayGrid.appendChild(cell);
    }

    grid.appendChild(dayGrid);
    block.appendChild(grid);
    col.appendChild(block);
  }
}

let lastSelectedCell = null;

function resetSidePanel(){
  document.getElementById('spEmpty').classList.remove('hidden');
  document.getElementById('spContent').classList.add('hidden');
  if(lastSelectedCell){ lastSelectedCell.classList.remove('selected'); lastSelectedCell = null; }
}

function generateWorkload(emp, date){
  const rng = hashSeed(emp.id + '-' + dateKey(date));
  const baseByStress = { low: 0.35, mediocre: 0.55, high: 0.78 };
  const base = baseByStress[emp.stress];
  const variance = (rng() - 0.5) * 0.3;
  const score = Math.min(0.97, Math.max(0.12, base + variance));

  const activeHours = (5 + score*3.2).toFixed(1);
  const idleMinutes = Math.round(90 - score*70);
  const keystrokes = Math.round(3200 + score*9000);
  const emails = Math.round(8 + score*40);
  const meetings = Math.round(1 + score*5);
  const meetingHours = (meetings * (0.4 + rng()*0.4)).toFixed(1);

  const level = score > 0.7 ? 'Heavy' : score > 0.42 ? 'Mediocre' : 'Light';

  const appsRaw = [
    { name:'Outlook', w: 0.15 + rng()*0.25 },
    { name:'Excel', w: 0.1 + rng()*0.3 },
    { name:'Word', w: 0.05 + rng()*0.2 },
    { name:'Browser', w: 0.1 + rng()*0.3 },
    { name:'Teams', w: 0.05 + rng()*0.2 },
  ];
  const totalW = appsRaw.reduce((s,a)=>s+a.w,0);
  const apps = appsRaw.map(a => ({ name:a.name, pct: Math.round((a.w/totalW)*100) }))
    .sort((a,b)=>b.pct-a.pct);

  return { score, level, activeHours, idleMinutes, keystrokes, emails, meetings, meetingHours, apps };
}

function generateLoginActivity(emp, key){
  const rng = hashSeed(emp.id + '-login-' + key);
  const apps = ['Outlook','Teams','Excel','Word','Browser'];
  const app = pick(rng, apps);
  const durationMinutes = 10 + Math.floor(rng()*70);
  return { app, durationMinutes };
}

function otFactorHtml(emp, key){
  const hasOT = emp.risk.afterHoursDates.includes(key);
  if(!hasOT) return '';
  const time = emp.risk.afterHoursTimes[key];
  const la = generateLoginActivity(emp, key);
  return `
    <div class="sp-flag-block ot">
      <div class="sp-flag-top"><span class="sp-flag-dot ot"></span>After-hours activity logged</div>
      <div class="sp-flag-detail">Activity at <strong>${time}</strong> · ~${la.durationMinutes} min in ${la.app}</div>
    </div>
  `;
}

function selectLoginDay(emp, date, cell){
  if(lastSelectedCell) lastSelectedCell.classList.remove('selected');
  cell.classList.add('selected');
  lastSelectedCell = cell;

  const key = dateKey(date);
  const time = emp.risk.weekendLoginTimes[key];
  const la = generateLoginActivity(emp, key);
  const dateStr = date.toLocaleDateString('en-SG', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  document.getElementById('spEmpty').classList.add('hidden');
  const content = document.getElementById('spContent');
  content.classList.remove('hidden');

  content.innerHTML = `
    <div class="sp-date">Weekend activity · ${dateStr.split(',')[0]}</div>
    <div class="sp-title">${dateStr.split(', ').slice(1).join(', ')}</div>
    <div class="sp-sub">${emp.name} · ${emp.schedule}</div>

    <div class="sp-flag-block wk">
      <div class="sp-flag-top"><span class="sp-flag-dot wk"></span>Weekend login logged</div>
      <div class="sp-flag-detail">Activity at <strong>${time}</strong> · ~${la.durationMinutes} min in ${la.app}</div>
    </div>

    <p class="sp-note">No scheduled work day falls on a weekend, so no workload breakdown is generated — this is standalone login activity outside working hours.</p>
  `;
}

function selectDay(emp, date, cell){
  if(lastSelectedCell) lastSelectedCell.classList.remove('selected');
  cell.classList.add('selected');
  lastSelectedCell = cell;

  const key = dateKey(date);
  const wl = generateWorkload(emp, date);
  const dateStr = date.toLocaleDateString('en-SG', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  document.getElementById('spEmpty').classList.add('hidden');
  const content = document.getElementById('spContent');
  content.classList.remove('hidden');

  const scoreColor = wl.level==='Heavy' ? 'var(--stress-high)' : wl.level==='Mediocre' ? 'var(--stress-med)' : 'var(--stress-low)';

  content.innerHTML = `
    <div class="sp-date">Workload · ${dateStr.split(',')[0]}</div>
    <div class="sp-title">${dateStr.split(', ').slice(1).join(', ')}</div>
    <div class="sp-sub">${emp.name} · ${emp.schedule}</div>
    ${otFactorHtml(emp, key)}

    <div class="sp-score">
      <span class="lab">Day workload</span>
      <span class="val" style="color:${scoreColor}">${wl.level}</span>
    </div>

    <div class="sp-metric">
      <div class="m-top"><span class="m-name">Active screen time</span><span class="m-val">${wl.activeHours} hrs</span></div>
      <div class="bar-bg"><div class="bar-fill" style="width:${Math.min(100, wl.activeHours/9*100)}%"></div></div>
    </div>
    <div class="sp-metric">
      <div class="m-top"><span class="m-name">Idle time</span><span class="m-val">${wl.idleMinutes} min</span></div>
      <div class="bar-bg"><div class="bar-fill" style="width:${Math.min(100, wl.idleMinutes/90*100)}%"></div></div>
    </div>
    <div class="sp-metric">
      <div class="m-top"><span class="m-name">Keystrokes logged</span><span class="m-val">${wl.keystrokes.toLocaleString()}</span></div>
      <div class="bar-bg"><div class="bar-fill" style="width:${Math.min(100, wl.keystrokes/12000*100)}%"></div></div>
    </div>
    <div class="sp-metric">
      <div class="m-top"><span class="m-name">Emails sent</span><span class="m-val">${wl.emails}</span></div>
      <div class="bar-bg"><div class="bar-fill" style="width:${Math.min(100, wl.emails/50*100)}%"></div></div>
    </div>
    <div class="sp-metric">
      <div class="m-top"><span class="m-name">Meetings</span><span class="m-val">${wl.meetings} (${wl.meetingHours} hrs)</span></div>
      <div class="bar-bg"><div class="bar-fill" style="width:${Math.min(100, wl.meetings/7*100)}%"></div></div>
    </div>

    <div class="sp-apps">
      <h4>Time by application</h4>
      ${wl.apps.map(a => `
        <div class="app-row">
          <span class="app-name">${a.name}</span>
          <div class="bar-bg"><div class="bar-fill" style="width:${a.pct}%"></div></div>
          <span class="app-pct">${a.pct}%</span>
        </div>
      `).join('')}
    </div>
  `;
}
