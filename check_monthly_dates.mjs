/**
 * monthly_journals 컬렉션의 날짜 데이터 점검
 * - 저장된 날짜 vs payment_records 날짜 비교
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

const app = initializeApp({
  projectId: 'slp-docs',
  apiKey: 'AIzaSyDNGoHSmqnrV7Gpe2vyQq3fkg-Jbi1n_aQ',
  authDomain: 'slp-docs.firebaseapp.com',
});
const db = getFirestore(app);

async function main() {
  // 1. payment_records에서 5월 기록 확인
  const paySnap = await getDocs(collection(db, 'payment_records'));
  const pay5 = paySnap.docs.map(d => d.data())
    .filter(r => r.transactionDate?.startsWith('2026-05'))
    .sort((a,b) => `${a.studentName}${a.transactionDate}`.localeCompare(`${b.studentName}${b.transactionDate}`));

  console.log('\n=== payment_records 2026년 5월 전체 ===');
  const payByStudent = {};
  pay5.forEach(r => {
    if (!payByStudent[r.studentName]) payByStudent[r.studentName] = [];
    payByStudent[r.studentName].push(r.transactionDate);
  });
  Object.entries(payByStudent).forEach(([name, dates]) => {
    console.log(`[${name}] ${dates.join(', ')}`);
  });

  // 2. monthly_journals에 저장된 5월 일지 확인
  const mSnap = await getDocs(collection(db, 'monthly_journals'));
  const may2026 = mSnap.docs.filter(d => d.id.endsWith('_2026_5'));

  console.log('\n=== monthly_journals 저장된 2026년 5월 일지 ===');
  may2026.forEach(d => {
    const data = d.data();
    const dates = data.sessions?.map(s => s.date) || [];
    console.log(`\n[${d.id}]`);
    dates.forEach(dt => console.log(`  날짜: ${dt}`));
  });

  // 3. 불일치 감지
  console.log('\n=== 불일치 감지 ===');
  may2026.forEach(d => {
    const studentName = d.id.replace('_2026_5', '');
    const savedDates = d.data().sessions?.map(s => {
      // "5/7(목)\n..." → 월/일 추출
      const m = s.date.match(/(\d{1,2})\/(\d{1,2})/);
      return m ? { mo: parseInt(m[1]), da: parseInt(m[2]) } : null;
    }).filter(Boolean) || [];

    const payDates = (payByStudent[studentName] || []).map(pd => {
      const m = pd.match(/\d{4}-(\d{2})-(\d{2})/);
      return m ? { mo: parseInt(m[1]), da: parseInt(m[2]) } : null;
    }).filter(Boolean);

    const savedStr = savedDates.map(d => `${d.mo}/${d.da}`).join(', ');
    const payStr = payDates.map(d => `${d.mo}/${d.da}`).join(', ');

    if (savedStr !== payStr) {
      console.log(`❌ [${studentName}]`);
      console.log(`   저장된 날짜: ${savedStr || '없음'}`);
      console.log(`   결제 날짜:   ${payStr || '없음'}`);
    } else if (payStr) {
      console.log(`✅ [${studentName}] 일치: ${payStr}`);
    }
  });

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
