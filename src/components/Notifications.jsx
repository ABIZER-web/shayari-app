import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { 
  collection, query, where, onSnapshot, writeBatch, getDocs, doc, 
  updateDoc, arrayUnion, addDoc, serverTimestamp, orderBy, deleteDoc 
} from 'firebase/firestore'; 
import { Heart, Bell, MessageCircle, User, UserPlus, Check, Loader2, ArrowRight, Trash2 } from 'lucide-react'; 
import { motion, AnimatePresence } from 'framer-motion'; 

const Notifications = ({ currentUser, onPostClick, onProfileClick }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myFollowing, setMyFollowing] = useState([]); 

  // 1. Mark all notifications as READ when the component mounts
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
        snapshot.docs.forEach((d) => batch.update(d.ref, { read: true }));
        await batch.commit();
      }
    };
    markAllRead();
  }, [currentUser]);

  // 2. Real-time Listeners
  useEffect(() => {
    if (!currentUser) return;

    // Listen to my following list
    const qUser = query(collection(db, "users"), where("username", "==", currentUser));
    const unsubUser = onSnapshot(qUser, (snap) => {
        if (!snap.empty) {
            setMyFollowing(snap.docs[0].data().following || []);
        }
    });

    // Listen to notifications intended for me
    const qNotes = query(
        collection(db, "notifications"), 
        where("toUser", "==", currentUser),
        orderBy("timestamp", "desc")
    );
    
    const unsubNotes = onSnapshot(qNotes, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      // Filter out self-notifications
      setNotifications(list.filter(n => n.fromUser !== currentUser));
      setLoading(false);
    });

    return () => { unsubUser(); unsubNotes(); };
  }, [currentUser]);

  // 3. Delete Notification Logic
  const handleDelete = async (noteId) => {
      try {
          await deleteDoc(doc(db, "notifications", noteId));
      } catch (error) {
          console.error("Error deleting notification:", error);
      }
  };

  // 4. Follow Back Logic
  const handleFollowBack = async (targetUsername) => {
      try {
          const myQ = query(collection(db, "users"), where("username", "==", currentUser));
          const targetQ = query(collection(db, "users"), where("username", "==", targetUsername));
          const [mySnap, targetSnap] = await Promise.all([getDocs(myQ), getDocs(targetQ)]);

          if(!mySnap.empty && !targetSnap.empty) {
              const batch = writeBatch(db);
              batch.update(mySnap.docs[0].ref, { following: arrayUnion(targetUsername) });
              batch.update(targetSnap.docs[0].ref, { followers: arrayUnion(currentUser) });
              await batch.commit();

              // Send a new follow notification to the other person
              await addDoc(collection(db, "notifications"), { 
                  type: "follow", 
                  fromUser: currentUser, 
                  toUser: targetUsername, 
                  timestamp: serverTimestamp(), 
                  read: false 
              });
          }
      } catch (error) { console.error("Follow back error:", error); }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return "Just now";
    const date = timestamp.toDate();
    const diff = Math.floor((new Date() - date) / 1000); 
    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-gray-500">
        <Loader2 className="animate-spin text-[#00adb5] mb-2" size={30} />
        <p className="text-sm">Fetching your activity...</p>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-3 bg-[#222831] min-h-screen pb-24 overflow-x-hidden">
      <div className="flex items-center justify-between mb-6 px-2">
          <h2 className="text-xl font-bold text-[#eeeeee]">Activity Feed</h2>
          <span className="bg-[#00adb5] text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
            {notifications.length} Total
          </span>
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-20 flex flex-col items-center text-gray-600">
            <Bell size={40} className="mb-2 opacity-10"/>
            <p>No activity yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {notifications.map((note) => (
              <div key={note.id} className="relative group">
                {/* Background Delete Action (visible during swipe) */}
                <div className="absolute inset-0 bg-red-600 rounded-[1.8rem] flex items-center justify-end px-8 text-white">
                    <div className="flex flex-col items-center gap-1">
                        <Trash2 size={18} />
                        <span className="text-[8px] font-bold uppercase">Delete</span>
                    </div>
                </div>

                {/* Draggable Card */}
                <motion.div 
                  drag="x"
                  dragConstraints={{ left: -100, right: 0 }}
                  dragElastic={0.1}
                  onDragEnd={(e, info) => {
                      // Trigger delete if swiped significantly to the left
                      if (info.offset.x < -80) {
                          handleDelete(note.id);
                      }
                  }}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className={`bg-[#393e46] p-4 rounded-[1.8rem] shadow-lg flex items-center gap-4 relative z-10 cursor-grab active:cursor-grabbing border border-transparent transition-colors ${note.read ? 'bg-[#393e46]/40' : 'ring-1 ring-[#00adb5]/20 shadow-xl'}`}
                  onClick={() => {
                      if (note.type === 'follow') onProfileClick(note.fromUser);
                      else if (note.postId) onPostClick(note.postId);
                  }}
                >
                  {/* Avatar Section */}
                  <div className="relative shrink-0" onClick={(e) => { e.stopPropagation(); onProfileClick(note.fromUser); }}>
                    <div className="w-12 h-12 rounded-full bg-[#222831] flex items-center justify-center text-[#00adb5] font-bold text-lg border border-gray-700 overflow-hidden">
                        {note.fromUser ? note.fromUser[0].toUpperCase() : <User size={20}/>}
                    </div>
                    <div className={`absolute -bottom-1 -right-1 p-1.5 rounded-full shadow-lg ${
                        note.type === 'like' || note.type === 'comment_like' ? 'bg-red-500' : 
                        note.type === 'follow' ? 'bg-[#00adb5]' : 'bg-blue-500'
                    } text-white`}>
                        {note.type.includes('like') ? <Heart size={10} fill="currentColor" /> : 
                         note.type === 'comment' ? <MessageCircle size={10} fill="currentColor" /> : 
                         <UserPlus size={10} />}
                    </div>
                  </div>
                  
                  {/* Text Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col">
                        <p className="text-sm text-[#eeeeee] leading-tight">
                          <span className="font-bold">@{note.fromUser}</span> 
                          <span className="text-gray-400 ml-1">
                              {note.type === 'like' && 'liked your shayari.'}
                              {note.type === 'comment_like' && 'loved your comment.'}
                              {note.type === 'follow' && 'started following you.'}
                              {note.type === 'comment' && 'commented on your post.'}
                          </span>
                        </p>
                        {note.text && (
                            <p className="text-[11px] text-gray-500 italic mt-1 line-clamp-1 opacity-80">
                                "{note.text}"
                            </p>
                        )}
                        <span className="text-[9px] text-gray-600 mt-1 font-medium">{formatTime(note.timestamp)}</span>
                    </div>
                  </div>

                  {/* Actions Area */}
                  <div className="shrink-0 flex items-center gap-2">
                      {note.type === 'follow' ? (
                          <div onClick={(e) => e.stopPropagation()}>
                              {myFollowing.includes(note.fromUser) ? (
                                  <div className="bg-[#222831] text-gray-500 text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1 border border-gray-800">
                                      <Check size={12} /> Friends
                                  </div>
                              ) : (
                                  <button 
                                      onClick={() => handleFollowBack(note.fromUser)} 
                                      className="bg-[#00adb5] text-white text-[10px] font-bold px-4 py-1.5 rounded-full hover:bg-teal-600 transition shadow-sm active:scale-95"
                                  >
                                      Follow
                                  </button>
                              )}
                          </div>
                      ) : (
                          <ArrowRight size={16} className="text-gray-700" />
                      )}
                  </div>
                </motion.div>
              </div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default Notifications;