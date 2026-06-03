import { db } from './src/firebase.js';
import { collection, getDocs, limit, query } from 'firebase/firestore';

async function check() {
  const querySnapshot = await getDocs(query(collection(db, 'payment_records'), limit(5)));
  querySnapshot.forEach((doc) => {
    console.log(doc.data());
  });
  process.exit(0);
}
check();
