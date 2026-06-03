/**
 * 월간일지 날짜-수업시간 매핑 전체 검증 스크립트
 * 
 * 검증 항목:
 * 1. Firebase payment_records의 transactionDate vs transactionTime 정합성
 * 2. getSessionTime 로직으로 역산된 수업시간 정확도
 * 3. formatSessionDate 최종 출력 형태 시뮬레이션
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

// ─── App.tsx의 getSessionTime 함수 완전히 동일하게 포팅 ───
function getSessionTime(scheduleTime, scheduleTimeHistory, dateStr, txTime) {
  if (!txTime) return scheduleTime || '';

  const parts = String(txTime).split(':');
  if (parts.length < 2) return '';
  const txMin = parseInt(parts[0]) * 60 + parseInt(parts[1]);

  // 1순위: scheduleTimeHistory 또는 scheduleTime 검증
  let fixedTime = '';
  if (scheduleTimeHistory?.length > 0) {
    const m = String(dateStr).match(/(\d{4})[-./\s년]+(\d{1,2})[-./\s월]+(\d{1,2})/);
    if (m) {
      const y = parseInt(m[1]);
      const mo = parseInt(m[2]);
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

  if (fixedTime && fixedTime !== '정보 없음') {
    const [start] = fixedTime.split('~');
    if (start) {
      const sParts = start.split(':');
      if (sParts.length >= 2) {
        const startMin = parseInt(sParts[0]) * 60 + parseInt(sParts[1]);
        // 수업종료(시작+40분) ~ 종료 후 20분 사이가 결제시각
        if (txMin >= startMin + 38 && txMin <= startMin + 70) {
          return fixedTime;
        }
      }
    }
  }

  // 2순위: 역산 (10분 단위 슬롯)
  const fmt = (m) => `${Math.floor(m/60).toString().padStart(2,'0')}:${(m%60).toString().padStart(2,'0')}`;
  let bestSlot = null, minDiff = 9999;
  for (let slot = 9 * 60; slot <= 18 * 60 + 30; slot += 10) {
    const sessionEnd = slot + 40;
    if (txMin >= sessionEnd && txMin <= sessionEnd + 20) {
      const diff = txMin - sessionEnd;
      if (diff < minDiff) { minDiff = diff; bestSlot = slot; }
    }
  }
  if (bestSlot === null) {
    for (let slot = 9 * 60; slot <= 18 * 60 + 30; slot += 10) {
      const sessionEnd = slot + 40;
      const diff = Math.abs(txMin - sessionEnd);
      if (diff < minDiff) { minDiff = diff; bestSlot = slot; }
    }
  }
  if (bestSlot === null) return '';
  return `${fmt(bestSlot)}~${fmt(bestSlot + 40)}`;
}

// formatSessionDate 시뮬레이션
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
function formatSessionDate(dateStr, txTime, scheduleTime, scheduleTimeHistory) {
  const match = dateStr.match(/(\d{4})[-./\s년]+(\d{1,2})[-./\s월]+(\d{1,2})/);
  if (!match) return dateStr;
  const month = parseInt(match[2]);
  const day = parseInt(match[3]);
  const dayName = DAY_NAMES[new Date(parseInt(match[1]), month - 1, day).getDay()];
  const base = `${month}/${day}(${dayName})`;
  const time = getSessionTime(scheduleTime, scheduleTimeHistory, dateStr, txTime || '');
  return time && time !== '정보 없음' ? `${base}\n${time}` : base;
}

async function main() {
  const paySnap = await getDocs(collection(db, 'payment_records'));
  const records = paySnap.docs.map(d => d.data());

  const stuSnap = await getDocs(collection(db, 'students'));
  const students = {};
  stuSnap.docs.forEach(d => { students[d.id] = d.data(); });

  console.log(`\n=== 날짜-수업시간 매핑 검증 (2026년 5-6월) ===\n`);

  // 2026년 5~6월 기록만
  const recent = records.filter(r => 
    r.transactionDate?.startsWith('2026-0') || r.transactionDate?.startsWith('2026-1')
  ).sort((a, b) => `${a.studentName}${a.transactionDate}`.localeCompare(`${b.studentName}${b.transactionDate}`));

  let issues = 0;
  const studentGroups = {};
  recent.forEach(r => {
    if (!studentGroups[r.studentName]) studentGroups[r.studentName] = [];
    studentGroups[r.studentName].push(r);
  });

  Object.entries(studentGroups).forEach(([name, recs]) => {
    const info = students[name];
    const scheduleTime = info?.scheduleTime || '';
    const scheduleTimeHistory = info?.scheduleTimeHistory || [];
    
    console.log(`\n[${name}] 등록 수업시간: ${scheduleTime || '없음'}`);
    if (scheduleTimeHistory.length > 0) {
      scheduleTimeHistory.forEach(h => {
        console.log(`  이력: ${h.fromYear}/${h.fromMonth}~ → ${h.time}`);
      });
    }
    
    recs.forEach(r => {
      const txTime = r.transactionTime || '';
      const sessionDate = formatSessionDate(r.transactionDate, txTime, scheduleTime, scheduleTimeHistory);
      const timeOnly = sessionDate.includes('\n') ? sessionDate.split('\n')[1] : '(시간없음)';
      
      // transactionTime이 없으면 문제
      if (!txTime) {
        console.log(`  ⚠️  ${r.transactionDate} - transactionTime 없음!`);
        issues++;
      } else {
        console.log(`  ${r.transactionDate} 결제:${txTime} → 일지표시: ${sessionDate.replace('\n', ' | ')}`);
        
        // 수업시간이 올바른지 검증: 결제시간은 수업종료 후 0~20분 이내여야 함
        const [startStr] = timeOnly.split('~');
        if (startStr && startStr !== '(시간없음)') {
          const sParts = startStr.split(':');
          const txParts = txTime.split(':');
          if (sParts.length >= 2 && txParts.length >= 2) {
            const startMin = parseInt(sParts[0]) * 60 + parseInt(sParts[1]);
            const txMin = parseInt(txParts[0]) * 60 + parseInt(txParts[1]);
            const endMin = startMin + 40;
            const diff = txMin - endMin;
            if (diff < -5 || diff > 25) {
              console.log(`    ❌ 불일치! 결제(${txTime}) - 수업종료(${Math.floor(endMin/60)}:${String(endMin%60).padStart(2,'0')}) = ${diff}분 차이`);
              issues++;
            }
          }
        }
      }
    });
  });

  console.log(`\n=== 검증 완료: 문제 ${issues}건 ===`);
  
  // transactionTime 없는 레코드 확인
  const noTime = records.filter(r => !r.transactionTime);
  if (noTime.length > 0) {
    console.log(`\n⚠️  transactionTime 없는 레코드 ${noTime.length}건:`);
    noTime.forEach(r => console.log(`  ${r.studentName} ${r.transactionDate}`));
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
