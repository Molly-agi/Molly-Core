const admin = require('firebase-admin');
const serviceAccount = require('./molly-auth.json');

const app = admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'termai-molly-55988354-f7535'
});

const db = admin.firestore(app);
db.settings({ databaseId: 'mollydb' });

(async () => {
  try {
    const userId = '1Bdrjcx35VVnKxahqq71AuZVMx32';
    
    // Check identity crystals
    console.log('\n=== IDENTITY CRYSTALS ===');
    const identityCrystals = await db.collection(`users/${userId}/identity-crystals`).limit(10).get();
    console.log('Found:', identityCrystals.size);
    identityCrystals.docs.forEach(doc => {
      const data = doc.data();
      console.log('\n---');
      console.log('ID:', doc.id);
      console.log('Preview:', data.contentPreview ? data.contentPreview.substring(0, 80) : 'NONE');
      console.log('Encrypted:', !!data.encrypted);
      console.log('Compression:', data.compression ? data.compression.technique : 'NONE');
      console.log('Timestamp:', data.timestamp);
      console.log('Importance:', data.importance);
    });

    // Check knowledge crystals
    console.log('\n=== KNOWLEDGE CRYSTALS ===');
    const knowledgeCrystals = await db.collection(`users/${userId}/knowledge-crystals`).limit(10).get();
    console.log('Found:', knowledgeCrystals.size);
    
    // Check raw aiResponses (pre-partition data)
    console.log('\n=== PRE-PARTITION RESPONSES (aiResponses) ===');
    const oldResponses = await db.collection(`users/${userId}/aiResponses`).orderBy('_createdAt', 'desc').limit(5).get();
    console.log('Found:', oldResponses.size);
    oldResponses.docs.forEach(doc => {
      const data = doc.data();
      const text = (data.responseText || '').substring(0, 100);
      console.log('---');
      console.log('Date:', data._createdAt);
      console.log('Text:', text);
    });

    console.log('\n=== MEMORY CHECKPOINTS ===');
    const checkpoints = await db.collection('memory-checkpoints').where('userId', '==', userId).limit(5).get();
    console.log('Checkpoints found:', checkpoints.size);
    checkpoints.docs.forEach(doc => {
      const data = doc.data();
      console.log('---');
      console.log('Checkpoint ID:', doc.id);
      console.log('Status:', data.status);
      console.log('Created:', data.createdAt);
      console.log('Document path:', data.documentPath);
    });

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  }
  process.exit(0);
})();
