import React, { useState, useEffect } from 'react';
import { db } from '../firebase'; 
import { 
  collection, query, where, doc, updateDoc, onSnapshot, 
  addDoc, serverTimestamp, getDocs, orderBy, limit, arrayUnion, arrayRemove, getDoc, setDoc
} from 'firebase/firestore';
import { 
  Grid, Bookmark, X, Heart, MessageCircle, Send, MoreVertical, 
  Loader2, Share2, Search, Check, Link as LinkIcon, UserPlus 
} from 'lucide-react'; 
import { motion, AnimatePresence } from 'framer-motion';
import EditProfileModal from './EditProfileModal'; 

const ProfilePage = ({ profileUser, currentUser, onBack, onPostClick, onBlockSuccess }) => {
  const [activeTab, setActiveTab] = useState("posts");
  const [userPosts, setUserPosts] = useState([]);
  const [savedPosts, setSavedPosts] = useState([]); 
  const [userData, setUserData] = useState(null); 
  const [targetUid, setTargetUid] = useState(null); 
  const [loading, setLoading] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);

  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  // Multi-Share States
  const [shareModalPostId, setShareModalPostId] = useState(null);
  const [shareRecentChats, setShareRecentChats] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [isSending, setIsSending] = useState(false);

  const isOwnProfile = profileUser === currentUser;

  // --- 1. DATA SYNC (User Info & Saved Posts) ---
  useEffect(() => {
    if (!profileUser) return;
    setLoading(true);

    const q = query(collection(db, "users"), where("username", "==", profileUser));
    const unsubUser = onSnapshot(q, async (snapshot) => {
      if (!snapshot.empty) {
        const userDoc = snapshot.docs[0];
        const data = userDoc.data();
        
        if (data.blocked?.includes(currentUser)) {
          setIsBlocked(true);
          setLoading(false);
          return;
        }

        setUserData(data);
        setTargetUid(userDoc.id);
        setFollowersCount(data.followers?.length || 0);
        setFollowingCount(data.following?.length || 0);
        setIsFollowing(data.followers?.includes(currentUser));

        if (isOwnProfile && data.saved?.length > 0) {
          const savedQ = query(collection(db, "shayaris"), where("__name__", "in", data.saved.slice(0, 10)));
          const savedSnap = await getDocs(savedQ);
          setSavedPosts(savedSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      }
      setLoading(false);
    });

    return () => unsubUser();
  }, [profileUser, currentUser, isOwnProfile]);

  // --- 2. SYNC POSTS (Stable Listener) ---
  useEffect(() => {
    if (!profileUser) return;
    const qPosts = query(
        collection(db, "shayaris"), 
        where("author", "==", profileUser), 
        orderBy("timestamp", "desc")
    );
    const unsubPosts = onSnapshot(qPosts, (snap) => {
      setUserPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsubPosts();
  }, [profileUser]);

  // --- 3. SHARE LOGIC (Chats Only) ---
  const openShareModal = async (postId) => {
    setShareModalPostId(postId);
    setSelectedRecipients([]);
    // Fetch ONLY users you have chatted with
    const chatQ = query(
        collection(db, "chats"), 
        where("participants", "array-contains", currentUser), 
        orderBy("timestamp", "desc"), 
        limit(20)
    );
    const chatSnap = await getDocs(chatQ);
    setShareRecentChats(chatSnap.docs.map(d => ({ 
        id: d.id, 
        username: d.data().participants.find(p => p !== currentUser) 
    })));
  };

  const handleFinalShare = async () => {
    if (selectedRecipients.length === 0) return;
    setIsSending(true);
    try {
      const promises = selectedRecipients.map(async (rec) => {
        const chatRef = doc(db, "chats", rec.id);
        await addDoc(collection(chatRef, "messages"), { 
          sender: currentUser, 
          timestamp: serverTimestamp(), 
          isPostShare: true, 
          postId: shareModalPostId, 
          text: 'Shared a post' 
        });
        await updateDoc(chatRef, { 
          timestamp: serverTimestamp(), 
          lastMessage: "Shared a post", 
          lastMessageSender: currentUser,
          isRead: false 
        });
      });
      await Promise.all(promises);
      setShareModalPostId(null);
    } catch (err) { console.error(err); }
    setIsSending(false);
  };

  const shareToWhatsApp = (postId) => {
    const post = [...userPosts, ...savedPosts].find(p => p.id === postId);
    if (!post) return;
    const text = `Check out this shayari by @${post.author}: "${post.content}"\n\nRead more on ShayariGram: ${window.location.origin}/post/${post.id}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  if (loading) return <div className="flex h-screen items-center justify-center bg-[#222831]"><Loader2 className="animate-spin text-[#00adb5]" /></div>;
  if (isBlocked) return <div className="bg-[#222831] h-screen flex flex-col items-center justify-center p-4"><h2 className="text-xl font-bold mb-4 text-white">User Unavailable</h2><button onClick={onBack} className="px-6 py-2 bg-[#393e46] text-white rounded-xl">Go Back</button></div>;

  return (
    <div className="bg-[#222831] min-h-screen pb-24 text-[#eeeeee]" onClick={() => setIsMenuOpen(false)}>
      {isEditOpen && userData && (
        <EditProfileModal 
          currentUser={currentUser} 
          currentFullName={userData.fullName} 
          currentBio={userData.bio} 
          currentPhoto={userData.photoURL} 
          onClose={() => setIsEditOpen(false)} 
        />
      )}

      <div className="w-full max-w-4xl mx-auto px-4 pt-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row items-center md:items-start gap-8 mb-10">
          <div className="w-24 h-24 md:w-36 md:h-36 rounded-full bg-gradient-to-tr from-[#00adb5] to-emerald-500 p-1 shadow-2xl shrink-0">
            <img src={userData?.photoURL || "/favicon.png"} className="w-full h-full object-cover rounded-full border-4 border-[#222831]" alt="" />
          </div>
          <div className="flex-1 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-4 mb-4">
              <h2 className="text-2xl font-bold">@{userData?.username}</h2>
              <div className="flex gap-2">
                {isOwnProfile ? (
                  <button onClick={() => setIsEditOpen(true)} className="px-4 py-1.5 bg-[#393e46] rounded-lg text-sm font-bold hover:bg-[#4e555f] transition">Edit Profile</button>
                ) : (
                  <button className={`px-6 py-1.5 rounded-lg text-sm font-bold ${isFollowing ? 'bg-[#393e46]' : 'bg-[#00adb5]'}`}>
                    {isFollowing ? "Following" : "Follow"}
                  </button>
                )}
              </div>
            </div>
            <div className="flex justify-center md:justify-start gap-8 mb-4">
              <StatBox count={userPosts.length} label="posts" />
              <StatBox count={followersCount} label="followers" />
              <StatBox count={followingCount} label="following" />
            </div>
            <p className="font-bold text-sm mb-1">{userData?.fullName}</p>
            <p className="text-gray-400 text-sm italic whitespace-pre-wrap">{userData?.bio}</p>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex justify-center gap-12 mb-6">
          <button onClick={() => setActiveTab("posts")} className={`flex items-center gap-2 pb-2 transition-all ${activeTab === 'posts' ? 'text-[#00adb5] border-b-2 border-[#00adb5]' : 'text-gray-500'}`}>
            <Grid size={18} /> <span className="text-xs font-bold uppercase tracking-widest">Shayaris</span>
          </button>
          {isOwnProfile && (
            <button onClick={() => setActiveTab("saved")} className={`flex items-center gap-2 pb-2 transition-all ${activeTab === 'saved' ? 'text-[#00adb5] border-b-2 border-[#00adb5]' : 'text-gray-500'}`}>
              <Bookmark size={18} /> <span className="text-xs font-bold uppercase tracking-widest">Saved</span>
            </button>
          )}
        </div>

        {/* Post Grid */}
        <div className="grid grid-cols-3 gap-1 md:gap-4">
          {(activeTab === 'posts' ? userPosts : savedPosts).map(p => (
            <motion.div 
              key={p.id} 
              whileHover={{ scale: 0.98 }}
              className="aspect-square relative cursor-pointer overflow-hidden rounded-lg shadow-lg group"
              style={{ background: p.bgColor || '#393e46' }}
              onClick={() => onPostClick(p.id)}
            >
              <div className="absolute inset-0 flex items-center justify-center p-3 text-center">
                <p className="font-serif text-[9px] md:text-sm line-clamp-4" style={{ color: p.textColor || '#eeeeee' }}>{p.content}</p>
              </div>
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                 <button 
                  onClick={(e) => { e.stopPropagation(); openShareModal(p.id); }} 
                  className="p-2 bg-[#00adb5] rounded-full text-white hover:scale-110 transition"
                 >
                   <Send size={16} />
                 </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* SHARE MODAL (REMOVED RANDOM USERS) */}
      <AnimatePresence>
        {shareModalPostId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShareModalPostId(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#222831] w-full max-w-sm rounded-[2rem] p-6 border border-gray-800 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-xl text-[#eeeeee]">Share Shayari</h3>
                <X className="text-gray-500 cursor-pointer hover:text-white transition" onClick={() => setShareModalPostId(null)} />
              </div>
              
              <div className="flex gap-3 mb-6">
                <button onClick={() => shareToWhatsApp(shareModalPostId)} className="flex-1 flex flex-col items-center gap-2 p-4 bg-[#25D366]/10 rounded-2xl group transition active:scale-95">
                  <div className="w-10 h-10 rounded-full bg-[#25D366] flex items-center justify-center text-white shadow-lg"><Share2 size={20} /></div>
                  <span className="text-[10px] font-bold text-white uppercase">WhatsApp</span>
                </button>
                <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/post/${shareModalPostId}`); alert("Link Copied!"); }} className="flex-1 flex flex-col items-center gap-2 p-4 bg-[#393e46] rounded-2xl group transition active:scale-95">
                  <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-white shadow-lg"><LinkIcon size={20} /></div>
                  <span className="text-[10px] font-bold text-white uppercase">Copy Link</span>
                </button>
              </div>

              <div className="relative mb-6">
                <Search size={16} className="absolute left-3 top-3 text-gray-500" />
                <input type="text" placeholder="Search chats..." className="w-full bg-[#393e46] rounded-xl py-2.5 pl-10 pr-4 text-sm text-white outline-none focus:ring-1 focus:ring-[#00adb5]" onChange={(e) => setSearchQuery(e.target.value.toLowerCase())} />
              </div>

              <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Your Chats</p>
                {shareRecentChats
                  .filter(chat => chat.username.includes(searchQuery))
                  .map(chat => (
                    <button key={chat.id} onClick={() => setSelectedRecipients(prev => prev.find(r => r.id === chat.id) ? prev.filter(r => r.id !== chat.id) : [...prev, chat])} className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all ${selectedRecipients.find(r => r.id === chat.id) ? 'bg-[#00adb5] shadow-lg' : 'bg-[#393e46] hover:bg-[#2d333b]'}`}>
                      <span className="text-sm font-bold text-white">@{chat.username}</span>
                      {selectedRecipients.find(r => r.id === chat.id) ? <Check size={16} /> : <Send size={14} className="opacity-40" />}
                    </button>
                ))}
                {shareRecentChats.length === 0 && <p className="text-center text-xs text-gray-600 py-10 italic">No active chats found.</p>}
              </div>

              {selectedRecipients.length > 0 && <button onClick={handleFinalShare} disabled={isSending} className="w-full mt-6 bg-[#00adb5] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl hover:bg-teal-600 active:scale-95 transition-all">{isSending ? <Loader2 className="animate-spin" size={20} /> : <Send size={18} />} Send to {selectedRecipients.length} People</button>}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const StatBox = ({ count, label, onClick }) => (
  <div onClick={onClick} className={`flex flex-col items-center ${onClick ? 'cursor-pointer' : ''}`}>
    <span className="font-bold text-lg">{count}</span>
    <span className="text-[10px] text-gray-500 uppercase tracking-widest">{label}</span>
  </div>
);

export default ProfilePage;