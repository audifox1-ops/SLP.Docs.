import { db } from './src/firebase.js';
import { collection, getDocs } from 'firebase/firestore';

async function check() {
  const querySnapshot = await getDocs(collection(db, 'monthly_journals'));
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    if (data.studentId === '김서아') {
      console.log(data);
    }
  });
  process.exit(0);
}
check();
