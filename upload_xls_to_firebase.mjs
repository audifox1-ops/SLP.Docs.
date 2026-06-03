/**
 * MerchantTradeListExcel (2).xls → Firebase Firestore payment_records 업로드 스크립트
 * 
 * - 취소 거래(취소여부=Y) 자동 제외
 * - 중복 방지: studentName + transactionDate + amount + treatmentArea 기준
 * - transactionTime (거래시간 HH:MM) 함께 저장
 */

import { readFileSync } from 'fs';
import { read, utils } from 'xlsx';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, writeBatch, doc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  projectId: 'slp-docs',
  appId: '1:862154104562:web:0687ba549edf04dfccfa6b',
  apiKey: 'AIzaSyAjgLJsTQP31vQzzhx33u-hUOcxld-CwzI',
  authDomain: 'slp-docs.firebaseapp.com',
  storageBucket: 'slp-docs.firebasestorage.app',
  messagingSenderId: '862154104562',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const XLS_PATH = '/Users/audifox/Downloads/MerchantTradeListExcel (2).xls';

async function main() {
  console.log('📂 XLS 파일 로딩 중...');
  const buf = readFileSync(XLS_PATH);
  const wb = read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = utils.sheet_to_json(ws, { header: 1, raw: false });

  // 헤더 행 탐색 (학생이름 + 거래일자가 있는 행)
  const nameKeys = ['학생이름', '학생 이름', '이름', '성명'];
  const dateKeys = ['거래일자', '거래 일자', '날짜', '결제일'];
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;
    const hasName = row.some(c => nameKeys.includes(String(c || '').trim()));
    const hasDate = row.some(c => dateKeys.includes(String(c || '').trim()));
    if (hasName && hasDate) { headerIdx = i; break; }
  }
  if (headerIdx === -1) { console.error('❌ 헤더 행을 찾을 수 없습니다.'); process.exit(1); }

  const headers = rows[headerIdx].map(h => String(h || '').trim());
  console.log('📋 헤더:', headers.filter(Boolean).join(' | '));

  const dataRows = rows.slice(headerIdx + 1)
    .filter(r => Array.isArray(r) && r.some(c => c !== null && c !== undefined && c !== ''))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { if (h) obj[h] = r[i]; });
      return obj;
    });

  console.log(`📊 전체 데이터: ${dataRows.length}건`);

  // 취소 거래 필터링
  const cancelKeys = ['취소여부', '취소', 'cancel'];
  const validRows = dataRows.filter(r => {
    const v = cancelKeys.map(k => String(r[k] || '')).find(v => v !== '');
    return v !== 'Y' && v !== 'y';
  });
  const canceledCount = dataRows.length - validRows.length;
  console.log(`🚫 취소 제외: ${canceledCount}건`);
  console.log(`✅ 업로드 대상: ${validRows.length}건`);

  // 기존 Firestore 데이터 조회 (중복 방지)
  console.log('\n🔍 기존 Firebase 데이터 조회 중...');
  const existingSnap = await getDocs(collection(db, 'payment_records'));
  const existingRecords = existingSnap.docs.map(d => d.data());
  console.log(`   기존 레코드: ${existingRecords.length}건`);

  // 배치 업로드
  let addedCount = 0, dupCount = 0, skipCount = 0;
  const BATCH_SIZE = 499; // Firestore 배치 최대 500
  let batch = writeBatch(db);
  let batchCount = 0;

  for (const r of validRows) {
    const name = String(r['학생이름'] || r['학생 이름'] || r['이름'] || r['성명'] || '').trim();
    const date = String(r['거래일자'] || r['거래 일자'] || r['날짜'] || r['결제일'] || '').trim();
    const timeRaw = String(r['거래시간'] || r['시간'] || '').trim();
    const time = timeRaw.substring(0, 5); // HH:MM
    const amount = r['금액'] || 0;
    const area = String(r['지원영역'] || r['지원 영역'] || r['치료영역'] || '언어치료').trim();

    if (!name || !date) { skipCount++; continue; }

    // 중복 체크
    const isDup = existingRecords.some(e =>
      e.studentName === name &&
      e.transactionDate === date &&
      String(e.amount) === String(amount) &&
      e.treatmentArea === area
    );

    if (isDup) { dupCount++; continue; }

    const newRef = doc(collection(db, 'payment_records'));
    const data = {
      studentName: name,
      transactionDate: date,
      amount,
      treatmentArea: area,
      createdAt: serverTimestamp(),
    };
    if (time) data.transactionTime = time;

    batch.set(newRef, data);
    batchCount++;
    addedCount++;

    // 배치 커밋
    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      console.log(`   배치 커밋 (${addedCount}건 완료)`);
      batch = writeBatch(db);
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`\n🎉 완료!`);
  console.log(`   신규 추가: ${addedCount}건`);
  console.log(`   중복 제외: ${dupCount}건`);
  console.log(`   취소 제외: ${canceledCount}건`);
  console.log(`   빈 행 제외: ${skipCount}건`);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ 오류:', err);
  process.exit(1);
});
