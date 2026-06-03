/**
 * Firebase payment_records 조회 및 수업시간 역산 검증
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

// 수업시간 역산 함수 (App.tsx의 getSessionTime과 동일 로직)
function estimateSessionTime(txTimeStr) {
  if (!txTimeStr) return '(시간정보없음)';
  const parts = String(txTimeStr).split(':');
  if (parts.length < 2) return '(파싱불가)';
  const txMin = parseInt(parts[0]) * 60 + parseInt(parts[1]);

  let bestSlot = null, minDiff = 9999;
  // 9:00 ~ 18:30까지 10분 단위
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
  const fmt = (m) => `${Math.floor(m/60).toString().padStart(2,'0')}:${(m%60).toString().padStart(2,'0')}`;
  return `${fmt(bestSlot)}~${fmt(bestSlot+40)}`;
}

async function main() {
  console.log('🔍 Firebase 데이터 조회 중...');
  const snap = await getDocs(collection(db, 'payment_records'));
  const records = snap.docs.map(d => d.data());
  console.log(`총 ${records.length}건\n`);

  // transactionTime이 있는 레코드만
  const withTime = records.filter(r => r.transactionTime);
  console.log(`거래시간 보유: ${withTime.length}건`);
  const noTime = records.filter(r => !r.transactionTime);
  console.log(`거래시간 없음: ${noTime.length}건\n`);

  // 주요 학생 샘플 출력
  const targets = ['윤휘', '주하준', '차윤우', '이태훈'];
  for (const name of targets) {
    const studentRecords = records
      .filter(r => r.studentName === name && r.transactionDate?.startsWith('2026-05'))
      .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
    
    console.log(`\n[${name}] 2026년 5월 기록:`);
    studentRecords.forEach(r => {
      const sessionTime = estimateSessionTime(r.transactionTime);
      console.log(`  ${r.transactionDate} 결제:${r.transactionTime || 'N/A'} → 수업:${sessionTime}`);
    });
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
