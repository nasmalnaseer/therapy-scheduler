import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

// ops: { type: 'add' | 'update' | 'delete', col, id?, data? }
// Firestore allows 500 writes per batch, so big jobs are split into chunks.
export async function commitOps(ops, chunk = 400) {
  for (let i = 0; i < ops.length; i += chunk) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + chunk)) {
      if (op.type === 'add') batch.set(doc(collection(db, op.col)), op.data);
      else if (op.type === 'update') batch.update(doc(db, op.col, op.id), op.data);
      else batch.delete(doc(db, op.col, op.id));
    }
    await batch.commit();
  }
}
