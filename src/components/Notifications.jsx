import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, writeBatch, getDocs, doc, updateDoc, arrayUnion, setDoc, addDoc, serverTimestamp } from 'firebase/firestore'; 
import { Heart, Bell, MessageCircle, User, UserPlus } from 'lucide-react'; 

const Notifications = ({ currentUser, onPostClick, onProfileClick }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myFollowing, setMyFollowing] = useState([]); // Store users I am following

  // 1. MARK AS READ (Runs once on mount)
  useEffect(() => {
    const markAllRead = async () => {
      if (!currentUser) return;
      
      const q = query(
        collection(db, "notifications"),
        where("toUser", "==", currentUser),
        where("read", "==", false)
      );
      
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const batch = writeBatch(db);
        snapshot.docs.forEach((doc) => {
          batch.update(doc.ref, { read: true });
        });
        await batch.commit();
      }
    };
    markAllRead();
  }, [currentUser]);

  // 2. FETCH DATA (Notifications + My Following List)
  useEffect(() => {
    if (!currentUser) return;

    // A. Listen to "My" profile to know who I follow (for the Follow Back button status)
    const userRef = doc(db, "users", currentUser);
    const unsubUser = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            setMyFollowing(docSnap.data().following || []);
        }
    });

    // B. Listen to Notifications
    const q = query(
      collection(db, "notifications"),
      where("toUser", "==", currentUser)
    );

    const unsubNotes = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Filter out notifications from self
      const othersNotifications = list.filter(n => n.fromUser !== currentUser);

      // Sort by Time (Newest First)
      othersNotifications.sort((a, b) => {
          const timeA = a.timestamp?.seconds || 0;
          const timeB = b.timestamp?.seconds || 0;
          return timeB - timeA; 
      });

      setNotifications(othersNotifications);
      setLoading(false);
    });

    return () => {
        unsubUser();
        unsubNotes();
    };
  }, [currentUser]);

  // --- HANDLE FOLLOW BACK ---
  const handleFollowBack = async (targetUser) => {
      try {
          const myRef = doc(db, "users", currentUser);
          const targetRef = doc(db, "users", targetUser);

          // 1. Ensure docs exist (safe-guard)
          await setDoc(myRef, { uid: currentUser }, { merge: true });
          await setDoc(targetRef, { uid: targetUser }, { merge: true });

          // 2. Update Firestore (Follow action)
          await updateDoc(myRef, { following: arrayUnion(targetUser) });
          await updateDoc(targetRef, { followers: arrayUnion(currentUser) });

          // 3. Send Notification to them
          await addDoc(collection(db, "notifications"), {
              type: "follow",
              fromUser: currentUser,
              toUser: targetUser,
              timestamp: serverTimestamp(),
              read: false
          });

      } catch (error) {
          console.error("Error following back:", error);
          alert("Failed to follow back.");
      }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp.seconds * 1000);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000); // seconds

    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  if (loading) return <div className="text-center py-20 text-gray-400">Loading alerts...</div>;

  return (
    <div className="p-2 space-y-2 min-h-screen pb-20">
      <h2 className="text-xl font-bold font-serif flex items-center gap-2 mb-4 px-2">
        <Bell className="fill-black" size={20} /> Notifications
      </h2>

      {notifications.length === 0 ? (
        <div className="text-center py-20 flex flex-col items-center text-gray-400">
            <Bell size={40} className="mb-2 opacity-20"/>
            <p>No new notifications.</p>
        </div>
      ) : (
        notifications.map((note) => (
          <div 
            key={note.id} 
            // Logic: If it has a postId, go to post. Otherwise (like 'follow'), do nothing on card click.
            onClick={() => note.postId && onPostClick && onPostClick(note.postId)}
            className={`bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 transition ${note.postId ? 'cursor-pointer hover:bg-gray-50' : ''}`}
          >
            
            {/* AVATAR SECTION */}
            <div className="relative shrink-0">
                <div 
                    className="w-12 h-12 rounded-full bg-gradient-to-tr from-gray-200 to-gray-100 flex items-center justify-center text-gray-600 font-bold text-lg border border-gray-200 cursor-pointer hover:border-indigo-300 transition"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (onProfileClick) onProfileClick(note.fromUser);
                    }}
                >
                    {note.fromUser ? note.fromUser[0].toUpperCase() : <User size={20}/>}
                </div>

                {/* Badge Icon */}
                <div className={`absolute -bottom-1 -right-1 p-1 rounded-full border-2 border-white ${
                    note.type === 'like' ? 'bg-pink-100 text-pink-500' : 
                    note.type === 'follow' ? 'bg-blue-100 text-blue-500' : 
                    'bg-indigo-100 text-indigo-500'
                }`}>
                    {note.type === 'like' && <Heart size={12} fill="currentColor" />}
                    {note.type === 'comment' && <MessageCircle size={12} fill="currentColor" />}
                    {note.type === 'follow' && <UserPlus size={12} fill="currentColor" />}
                </div>
            </div>
            
            <div className="flex-1 min-w-0">
              {/* TEXT CONTENT */}
              <p className="text-sm text-gray-800 leading-snug">
                <span 
                    className="font-bold text-black hover:underline cursor-pointer mr-1"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (onProfileClick) onProfileClick(note.fromUser);
                    }}
                >
                    @{note.fromUser}
                </span> 
                <span className="text-gray-600">
                    {note.type === 'like' && 'liked your post.'}
                    {note.type === 'follow' && 'started following you.'}
                    {note.type === 'comment' && 'commented on your post:'}
                </span>
                
                {/* Comment Snippet */}
                {note.type === 'comment' && (
                    <span className="text-gray-800 font-medium block truncate mt-0.5 border-l-2 border-gray-200 pl-2 text-xs">
                        "{note.contentSnippet}"
                    </span>
                )}
              </p>
              
              <div className="flex justify-between items-center mt-1.5">
                {/* Like Snippet (Show text of post liked) */}
                {note.type === 'like' && note.contentSnippet && (
                    <p className="text-[10px] text-gray-400 italic line-clamp-1 max-w-[150px]">
                        "{note.contentSnippet}"
                    </p>
                )}

                {/* --- FOLLOW BACK BUTTON (Only for follow notifications) --- */}
                {note.type === 'follow' && (
                    <div className="ml-auto mr-2">
                        {!myFollowing.includes(note.fromUser) ? (
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation(); // Prevent card click
                                    handleFollowBack(note.fromUser);
                                }}
                                className="bg-blue-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg hover:bg-blue-700 transition shadow-sm"
                            >
                                Follow Back
                            </button>
                        ) : (
                            <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-md border border-gray-200">
                                Following
                            </span>
                        )}
                    </div>
                )}
                
                {/* Timestamp */}
                <span className={`text-[10px] text-gray-400 font-medium tracking-wide ${note.type !== 'follow' ? 'ml-auto' : ''}`}>
                    {formatTime(note.timestamp)}
                </span>
              </div>
            </div>
            
            {/* THUMBNAIL IMAGE (If post has one and it's not a follow) */}
            {note.image && note.type !== 'follow' && (
                <img src={note.image} alt="Post" className="w-10 h-10 rounded-lg object-cover border border-gray-100 shadow-sm shrink-0" />
            )}
          </div>
        ))
      )}
    </div>
  );
};

export default Notifications;