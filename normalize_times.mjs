/**
 * Firebase payment_records의 transactionTime을 HH:MM 형식으로 정규화하는 스크립트
 * HH:MM:SS → HH:MM
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore';

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

async function main() {
  console.log('🔍 Firebase payment_records 조회 중...');
  const snap = await getDocs(collection(db, 'payment_records'));
  console.log(`총 ${snap.docs.length}건`);

  // HH:MM:SS 형식이거나 5자리 초과인 레코드 필터링
  const toFix = snap.docs.filter(d => {
    const t = d.data().transactionTime;
    return t && t.length > 5; // HH:MM 이상의 길이
  });

  console.log(`⚠️  HH:MM 초과 형식: ${toFix.length}건`);
  if (toFix.length === 0) {
    console.log('✅ 모든 레코드가 이미 HH:MM 형식입니다.');
    process.exit(0);
  }

  // 샘플 출력
  console.log('\n샘플:');
  toFix.slice(0, 5).forEach(d => {
    const data = d.data();
    console.log(`  ${data.studentName} ${data.transactionDate} ${data.transactionTime} → ${String(data.transactionTime).substring(0, 5)}`);
  });

  // 배치 수정
  const BATCH_SIZE = 499;
  let batch = writeBatch(db);
  let count = 0, total = 0;

  for (const docSnap of toFix) {
    const oldTime = docSnap.data().transactionTime;
    const newTime = String(oldTime).substring(0, 5);
    batch.update(doc(db, 'payment_records', docSnap.id), { transactionTime: newTime });
    count++;
    total++;

    if (count >= BATCH_SIZE) {
      await batch.commit();
      console.log(`   배치 커밋 (${total}건 완료)`);
      batch = writeBatch(db);
      count = 0;
    }
  }

  if (count > 0) await batch.commit();

  console.log(`\n🎉 완료! ${total}건 정규화됨`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
