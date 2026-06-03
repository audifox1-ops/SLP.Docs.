/**
 * 잘못 저장된 monthly_journals의 날짜를 payment_records 기준으로 재설정
 * - 세션 내용(content, reaction, consultation)은 유지
 * - 날짜만 결제 날짜로 교체
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';

const app = initializeApp({
  projectId: 'slp-docs',
  apiKey: 'AIzaSyDNGoHSmqnrV7Gpe2vyQq3fkg-Jbi1n_aQ',
  authDomain: 'slp-docs.firebaseapp.com',
});
const db = getFirestore(app);

const DAY_NAMES = ['일','월','화','수','목','금','토'];

function normalizeDateStr(dStr) {
  const str = String(dStr).trim();
  if (/^\d{5}$/.test(str)) {
    const serial = parseInt(str, 10);
    const dateObj = new Date((serial - 25569) * 86400 * 1000);
    const y = dateObj.getUTCFullYear();
    const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return str;
}

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

function formatSessionDate(dateStr, txTime, scheduleTime, scheduleTimeHistory) {
  const normDateStr = normalizeDateStr(dateStr);
  const match = normDateStr.match(/(\d{4})[-./\s년]+(\d{1,2})[-./\s월]+(\d{1,2})/);
  if (!match) return dateStr;
  const month = parseInt(match[2]);
  const day = parseInt(match[3]);
  const dayName = DAY_NAMES[new Date(parseInt(match[1]), month - 1, day).getDay()];
  const base = `${month}/${day}(${dayName})`;
  const time = getSessionTime(scheduleTime, scheduleTimeHistory, normDateStr, txTime || '');
  return time && time !== '정보 없음' ? `${base}\n${time}` : base;
}

async function main() {
  const paySnap = await getDocs(collection(db, 'payment_records'));
  const allPay = paySnap.docs.map(d => d.data());

  const stuSnap = await getDocs(collection(db, 'students'));
  const students = {};
  stuSnap.docs.forEach(d => { students[d.id] = d.data(); });

  const mSnap = await getDocs(collection(db, 'monthly_journals'));
  
  let fixed = 0, skipped = 0;

  for (const mDoc of mSnap.docs) {
    const docId = mDoc.id; // 예: 김서아_2026_5
    const parts = docId.match(/^(.+)_(\d{4})_(\d{1,2})$/);
    if (!parts) continue;
    const [, studentName, yearStr, monthStr] = parts;
    const year = parseInt(yearStr), month = parseInt(monthStr);

    // 해당 학생의 해당 월 결제 기록
    const payRecords = allPay
      .filter(r => {
        if (r.studentName !== studentName) return false;
        const dStr = normalizeDateStr(String(r.transactionDate));
        const m = dStr.match(/(\d{4})[-./\s년]+(\d{1,2})/);
        if (m) return parseInt(m[1]) === year && parseInt(m[2]) === month;
        return false;
      })
      .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));

    if (payRecords.length === 0) { skipped++; continue; }

    const info = students[studentName];
    const scheduleTime = info?.scheduleTime || '';
    const scheduleTimeHistory = info?.scheduleTimeHistory || [];

    // 올바른 날짜로 세션 재구성
    const correctDates = payRecords.map(r =>
      formatSessionDate(r.transactionDate, r.transactionTime || '', scheduleTime, scheduleTimeHistory)
    );

    // 현재 저장된 세션
    const savedSessions = mDoc.data().sessions || [];

    // 날짜 추출해서 비교
    const savedDateKeys = savedSessions.map(s => {
      const m = s.date.match(/(\d{1,2})\/(\d{1,2})/);
      return m ? `${m[1]}/${m[2]}` : '';
    });
    const correctDateKeys = correctDates.map(d => {
      const m = d.match(/(\d{1,2})\/(\d{1,2})/);
      return m ? `${m[1]}/${m[2]}` : '';
    });

    const isMismatch = savedDateKeys.join(',') !== correctDateKeys.join(',');

    if (isMismatch) {
      // 날짜만 교체, 내용은 최대한 유지
      const newSessions = correctDates.map((newDate, i) => ({
        date: newDate,
        content: savedSessions[i]?.content || '',
        reaction: savedSessions[i]?.reaction || '',
        consultation: savedSessions[i]?.consultation || ''
      }));

      await updateDoc(doc(db, 'monthly_journals', docId), { sessions: newSessions });
      console.log(`✅ 수정: [${docId}]`);
      console.log(`   변경 전: ${savedDateKeys.join(', ')}`);
      console.log(`   변경 후: ${correctDateKeys.join(', ')}`);
      fixed++;
    } else {
      console.log(`  OK: [${docId}] (일치)`);
    }
  }

  console.log(`\n총 ${fixed}건 수정 완료, ${skipped}건 건너뜀 (결제 기록 없음)`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
