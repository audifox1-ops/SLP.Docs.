import { db } from './src/firebase.js';
import { collection, getDocs } from 'firebase/firestore';

async function check() {
  const querySnapshot = await getDocs(collection(db, 'payment_records'));
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    if (data.studentName === '김서아') {
      console.log(data.transactionDate, data.transactionTime);
    }
  });
  process.exit(0);
}
check();
