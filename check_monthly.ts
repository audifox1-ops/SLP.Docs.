import { db } from './src/firebase.js';
import { collection, getDocs } from 'firebase/firestore';

async function check() {
  const querySnapshot = await getDocs(collection(db, 'monthly_journals'));
  querySnapshot.forEach((doc) => {
    console.log(`Student: ${doc.data().studentId}, Month: ${doc.id}`);
    doc.data().sessions.forEach((s: any) => console.log(`Date: ${JSON.stringify(s.date)}`));
  });
  process.exit(0);
}
check();
