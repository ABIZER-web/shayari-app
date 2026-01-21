import { db, auth } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  writeBatch, 
  doc,
  collectionGroup 
} from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';

export const updateUserProfileGlobally = async (currentUsername, newUsername, newFullName) => {
  const user = auth.currentUser;
  if (!user) return { success: false, error: "No user logged in" };

  console.log(`Starting update: ${currentUsername} -> ${newUsername}`);
  
  try {
    const batch = writeBatch(db);
    let operationCount = 0;

    // 1. Update Firebase Auth Profile
    await updateProfile(user, {
      displayName: newUsername
    });

    // 2. Update the Main 'users' Document
    const userRef = doc(db, "users", user.uid);
    batch.update(userRef, { 
        username: newUsername,
        fullName: newFullName 
    });
    operationCount++;

    // 3. Find and Update all SHAYARIS by this user
    const qPosts = query(collection(db, "shayaris"), where("author", "==", currentUsername));
    const postsSnap = await getDocs(qPosts);

    postsSnap.forEach((doc) => {
      batch.update(doc.ref, { author: newUsername });
      operationCount++;
    });

    // 4. Find and Update all COMMENTS by this user
    const qComments = query(collectionGroup(db, "comments"), where("username", "==", currentUsername));
    const commentsSnap = await getDocs(qComments);

    commentsSnap.forEach((doc) => {
      batch.update(doc.ref, { username: newUsername });
      operationCount++;
    });

    // 5. Commit all changes
    if (operationCount > 0) {
        await batch.commit();
        console.log(`Successfully updated ${operationCount} documents.`);
    }

    return { success: true };

  } catch (error) {
    console.error("Error updating profile globally:", error);
    return { success: false, error: error.message };
  }
};