/**
 * 개선된 getSessionTime 로직으로 재검증
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  projectId: 'slp-docs',
  apiKey: 'AIzaSyAjgLJsTQP31vQzzhx33u-hUOcxld-CwzI',
  authDomain: 'slp-docs.firebaseapp.com',
  storageBucket: 'slp-docs.firebasestorage.app',
  messagingSenderId: '862154104562',
  appId: '1:862154104562:web:0687ba549edf04dfccfa6b',
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ─── 개선된 getSessionTime (App.tsx와 동일) ───
function getSessionTime(scheduleTime, scheduleTimeHistory, dateStr, txTime) {
  if (!txTime) return scheduleTime || '';
  const parts = String(txTime).split(':');
  if (parts.length < 2) return '';
  const txMin = parseInt(parts[0]) * 60 + parseInt(parts[1]);

  let fixedTime = '';
  if (scheduleTimeHistory?.length > 0) {
    const m = String(dateStr).match(/(\d{4})[-./\s년]+(\d{1,2})[-./\s월]+(\d{1,2})/);
    if (m) {
      const y = parseInt(m[1]), mo = parseInt(m[2]);
      const matched = scheduleTimeHistory.find(h => {
        const from = h.fromYear * 100 + h.fromMonth;
        const cur = y * 100 + mo;
        if (h.toYear && h.toMonth) return cur >= from && cur <= (h.toYear * 100 + h.toMonth);
        return cur >= from;
      });
      if (matched) fixedTime = matched.time;
    }
  }
  if (!fixedTime) fixedTime = scheduleTime || '';

  // 수업시작 후 20~70분 사이에 결제 (개선된 범위)
  if (fixedTime && fixedTime !== '정보 없음') {
    const [start] = fixedTime.split('~');
    if (start) {
      const sParts = start.split(':');
      if (sParts.length >= 2) {
        const startMin = parseInt(sParts[0]) * 60 + parseInt(sParts[1]);
        if (txMin >= startMin + 20 && txMin <= startMin + 70) return fixedTime;
      }
    }
  }

  // 역산: 10분 단위 슬롯, 종료 후 0~25분 이내
  const fmt = m => `${Math.floor(m/60).toString().padStart(2,'0')}:${(m%60).toString().padStart(2,'0')}`;
  let bestSlot = null, minDiff = 9999;
  for (let slot = 9*60; slot <= 18*60+30; slot += 10) {
    const end = slot + 40;
    if (txMin >= end && txMin <= end + 25) {
      const diff = txMin - end;
      if (diff < minDiff) { minDiff = diff; bestSlot = slot; }
    }
  }
  if (bestSlot === null) {
    for (let slot = 9*60; slot <= 18*60+30; slot += 10) {
      const diff = Math.abs(txMin - (slot + 40));
      if (diff < minDiff) { minDiff = diff; bestSlot = slot; }
    }
  }
  return bestSlot ? `${fmt(bestSlot)}~${fmt(bestSlot+40)}` : '';
}

const DAY_NAMES = ['일','월','화','수','목','금','토'];
function formatSessionDate(dateStr, txTime, scheduleTime, scheduleTimeHistory) {
  const match = dateStr.match(/(\d{4})[-./\s년]+(\d{1,2})[-./\s월]+(\d{1,2})/);
  if (!match) return dateStr;
  const [,y,m,d] = match;
  const dayName = DAY_NAMES[new Date(parseInt(y), parseInt(m)-1, parseInt(d)).getDay()];
  const base = `${parseInt(m)}/${parseInt(d)}(${dayName})`;
  const time = getSessionTime(scheduleTime, scheduleTimeHistory, dateStr, txTime||'');
  return time && time !== '정보 없음' ? `${base}\n${time}` : base;
}

async function main() {
  const paySnap = await getDocs(collection(db, 'payment_records'));
  const records = paySnap.docs.map(d => d.data());
  const stuSnap = await getDocs(collection(db, 'students'));
  const students = {};
  stuSnap.docs.forEach(d => { students[d.id] = d.data(); });

  console.log('\n=== 개선된 로직 검증 결과 ===\n');
  
  // 2026년 전체 기록
  const recent2026 = records.filter(r => r.transactionDate?.startsWith('2026')).sort((a,b) => `${a.studentName}${a.transactionDate}`.localeCompare(`${b.studentName}${b.transactionDate}`));
  
  const groups = {};
  recent2026.forEach(r => { if (!groups[r.studentName]) groups[r.studentName] = []; groups[r.studentName].push(r); });

  let totalIssues = 0;
  Object.entries(groups).forEach(([name, recs]) => {
    const info = students[name];
    const scheduleTime = info?.scheduleTime || '';
    const scheduleTimeHistory = info?.scheduleTimeHistory || [];
    const issues = [];
    
    recs.forEach(r => {
      const txTime = r.transactionTime || '';
      const sessionDate = formatSessionDate(r.transactionDate, txTime, scheduleTime, scheduleTimeHistory);
      const timeOnly = sessionDate.includes('\n') ? sessionDate.split('\n')[1] : '';
      
      if (!txTime) { issues.push(`⚠️  ${r.transactionDate}: transactionTime 없음`); return; }
      if (!timeOnly) { issues.push(`⚠️  ${r.transactionDate}: 수업시간 역산 실패`); return; }
      
      // 역산된 시간이 scheduleTime과 크게 다를 때만 경고
      if (scheduleTime && scheduleTime !== '정보 없음' && timeOnly !== scheduleTime) {
        const [sStart] = scheduleTime.split('~');
        const [tStart] = timeOnly.split('~');
        if (sStart && tStart) {
          const p1 = sStart.split(':'), p2 = tStart.split(':');
          if (p1.length >= 2 && p2.length >= 2) {
            const diff = Math.abs((parseInt(p1[0])*60+parseInt(p1[1])) - (parseInt(p2[0])*60+parseInt(p2[1])));
            if (diff > 30) {
              issues.push(`  📌 ${r.transactionDate} 결제:${txTime} → ${timeOnly} (등록:${scheduleTime})`);
            }
          }
        }
      }
    });
    
    if (issues.length > 0) {
      console.log(`[${name}] 등록:${scheduleTime || '없음'}`);
      issues.forEach(i => console.log(i));
      totalIssues += issues.length;
    }
  });
  
  if (totalIssues === 0) {
    console.log('✅ 모든 레코드가 정상 매핑됩니다!');
  } else {
    console.log(`\n총 ${totalIssues}건의 주의 항목 (불규칙 수업 날짜일 수 있음)`);
  }
  
  // 주요 학생 5월 상세 출력
  console.log('\n\n=== 주요 학생 2026년 5월 상세 ===');
  ['윤휘','주하준','석윤우','이태훈','차윤우'].forEach(name => {
    const info = students[name];
    const recs = (groups[name] || []).filter(r => r.transactionDate?.includes('2026-05'));
    if (recs.length === 0) return;
    console.log(`\n[${name}] 등록 수업시간: ${info?.scheduleTime || '없음'}`);
    recs.sort((a,b) => a.transactionDate.localeCompare(b.transactionDate)).forEach(r => {
      const sd = formatSessionDate(r.transactionDate, r.transactionTime, info?.scheduleTime, info?.scheduleTimeHistory);
      console.log(`  ${r.transactionDate} 결제:${r.transactionTime} → 일지: ${sd.replace('\n',' | ')}`);
    });
  });
  
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
