import { useState, useEffect } from 'react';
import { db } from '../firebase'; 
import { collection, query, where, doc, getDoc, updateDoc, onSnapshot, arrayUnion, arrayRemove, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { Grid, Bookmark, ArrowLeft, MapPin, X } from 'lucide-react'; 
import { motion, AnimatePresence } from 'framer-motion';
import SettingsModal from './SettingsModal'; 
import EditProfileModal from './EditProfileModal'; 

const ProfilePage = ({ profileUser, currentUser, onBack, onPostClick, onNavigateToChat, onProfileClick }) => {
  const [activeTab, setActiveTab] = useState("posts");
  const [userPosts, setUserPosts] = useState([]);
  const [savedPosts, setSavedPosts] = useState([]); // Stores the actual post data
  
  // Profile Data
  const [userData, setUserData] = useState({ bio: "", location: "", photoURL: null, followers: [], following: [], username: "", saved: [] });
  const [loading, setLoading] = useState(true);
  
  // Modals
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [followModal, setFollowModal] = useState({ isOpen: false, type: null, users: [], loading: false });

  // Social State
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowedBy, setIsFollowedBy] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  const isOwnProfile = profileUser === currentUser;

  // --- 1. FETCH PROFILE DATA & SAVED POSTS ---
  useEffect(() => {
    setLoading(true);

    const userRef = doc(db, "users", profileUser);
    
    // Listen to User Document
    const unsubscribeUser = onSnapshot(userRef, async (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            setUserData(data);
            
            setFollowersCount(data.followers?.length || 0);
            setFollowingCount(data.following?.length || 0);

            if (data.followers && data.followers.includes(currentUser)) setIsFollowing(true);
            else setIsFollowing(false);

            if (data.following && data.following.includes(currentUser)) setIsFollowedBy(true);
            else setIsFollowedBy(false);

            // ⚡ FIXED: FETCH SAVED POSTS FROM FIREBASE
            // Only fetch if looking at own profile and there are saved IDs
            if (isOwnProfile && data.saved && data.saved.length > 0) {
                try {
                    // Fetch all saved posts in parallel
                    const promises = data.saved.map(id => getDoc(doc(db, "shayaris", id)));
                    const docs = await Promise.all(promises);
                    const fetchedSaved = docs
                        .filter(d => d.exists())
                        .map(d => ({ id: d.id, ...d.data() }));
                    
                    setSavedPosts(fetchedSaved);
                } catch (error) {
                    console.error("Error fetching saved posts:", error);
                }
            } else {
                setSavedPosts([]);
            }

        } else {
            setUserData({ bio: "", photoURL: null, followers: [], following: [], saved: [] });
            setSavedPosts([]);
        }
        setLoading(false);
    });

    // Fetch User's Created Posts
    const q = query(collection(db, "shayaris"), where("author", "==", profileUser));
    const unsubscribePosts = onSnapshot(q, (snapshot) => {
      const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      posts.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      setUserPosts(posts);
    });

    return () => { unsubscribeUser(); unsubscribePosts(); };
  }, [profileUser, isOwnProfile, currentUser]); 

  // --- 2. SOCIAL ACTIONS ---
  const handleFollowToggle = async () => {
    const myRef = doc(db, "users", currentUser);
    const targetRef = doc(db, "users", profileUser);

    try {
        if (isFollowing) {
            await updateDoc(myRef, { following: arrayRemove(profileUser) });
            await updateDoc(targetRef, { followers: arrayRemove(currentUser) });
        } else {
            await setDoc(myRef, { uid: currentUser }, { merge: true });
            await setDoc(targetRef, { uid: profileUser }, { merge: true });
            await updateDoc(myRef, { following: arrayUnion(profileUser) });
            await updateDoc(targetRef, { followers: arrayUnion(currentUser) });

            await addDoc(collection(db, "notifications"), {
                type: "follow",
                fromUser: currentUser,
                toUser: profileUser,
                timestamp: serverTimestamp(),
                read: false
            });
        }
    } catch (err) { console.error("Follow error:", err); }
  };

  const handleMessage = async () => {
    const chatId = [currentUser, profileUser].sort().join("_");
    const chatRef = doc(db, "chats", chatId);
    const chatSnap = await getDoc(chatRef);
    if (!chatSnap.exists()) {
        await setDoc(chatRef, { participants: [currentUser, profileUser], lastMessage: "", timestamp: serverTimestamp() });
    }
    if (onNavigateToChat) onNavigateToChat(chatId);
  };

  // --- 3. FOLLOW LIST LOGIC ---
  const openFollowList = async (type) => {
    setFollowModal({ isOpen: true, type, users: [], loading: true });
    try {
        const userIds = type === "Followers" ? (userData.followers || []) : (userData.following || []);
        if (userIds.length === 0) {
            setFollowModal(prev => ({ ...prev, loading: false }));
            return;
        }
        const userPromises = userIds.map(async (uid) => {
            const docSnap = await getDoc(doc(db, "users", uid));
            if (docSnap.exists()) {
                const d = docSnap.data();
                return { uid: uid, username: d.username || uid, photoURL: d.photoURL, bio: d.bio, exists: true };
            }
            return { uid: uid, username: "Deleted User", photoURL: null, exists: false };
        });
        const fetchedResults = await Promise.all(userPromises);
        const validUsers = fetchedResults.filter(u => u.exists);
        setFollowModal({ isOpen: true, type, users: validUsers, loading: false });
    } catch (error) {
        console.error("Error fetching list:", error);
        setFollowModal(prev => ({ ...prev, loading: false }));
    }
  };

  const closeFollowModal = () => setFollowModal({ isOpen: false, type: null, users: [], loading: false });

  return (
    <div className="bg-white min-h-screen pb-20 font-sans text-gray-900 relative">
      
      {/* --- MODALS --- */}
      {showSettings && <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} currentUser={currentUser} onPostClick={onPostClick} />}
      
      {isEditOpen && (
        <EditProfileModal 
            currentUser={currentUser}
            currentFullName={userData.fullName}
            onClose={() => setIsEditOpen(false)}
        />
      )}

      {/* --- FOLLOW LIST MODAL --- */}
      <AnimatePresence>
        {followModal.isOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeFollowModal}>
                <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={(e) => e.stopPropagation()} className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl h-[450px] flex flex-col">
                    <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="font-bold text-lg">{followModal.type}</h3>
                        <button onClick={closeFollowModal}><X size={20} className="text-gray-500 hover:text-black"/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {followModal.loading ? <div className="flex justify-center py-10 text-gray-400">Loading...</div> : followModal.users.length > 0 ? (
                            <div className="space-y-1">
                                {followModal.users.map(u => (
                                    <div key={u.uid} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl transition cursor-pointer" onClick={() => { closeFollowModal(); if (onProfileClick) onProfileClick(u.uid); }}>
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-gray-200 to-gray-300 flex items-center justify-center overflow-hidden flex-shrink-0">{u.photoURL ? <img src={u.photoURL} alt={u.username} className="w-full h-full object-cover"/> : <span className="font-bold text-gray-600 text-sm">{u.username[0].toUpperCase()}</span>}</div>
                                        <div className="flex-1 min-w-0"><h4 className="font-bold text-sm text-gray-900">@{u.username}</h4><p className="text-xs text-gray-500 truncate">{u.bio || "No bio"}</p></div>
                                    </div>
                                ))}
                            </div>
                        ) : <div className="text-center py-10 text-gray-400 text-sm">No users found.</div>}
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* HEADER (Mobile Only) */}
      <div className="md:hidden sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center justify-between transition-all">
        <div className="flex items-center gap-4"><button onClick={onBack} className="p-2 rounded-full hover:bg-gray-100 transition"><ArrowLeft size={22} /></button><h2 className="text-lg font-bold tracking-wide">@{userData.username || profileUser}</h2></div>
      </div>

      <div className="w-full max-w-4xl mx-auto px-4 md:px-10 pt-6 pb-20">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-8 mb-10">
          
          {/* Avatar */}
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative group shrink-0">
            <div className="w-24 h-24 md:w-40 md:h-40 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 p-[3px] shadow-sm">
              <div className="w-full h-full bg-white rounded-full overflow-hidden flex items-center justify-center p-[2px]">
                {userData.photoURL ? <img src={userData.photoURL} alt={profileUser} className="w-full h-full object-cover rounded-full"/> : <span className="text-gray-800 text-4xl md:text-6xl font-bold">{(userData.username || profileUser)[0].toUpperCase()}</span>}
              </div>
            </div>
          </motion.div>

          {/* Info */}
          <div className="flex-1 flex flex-col items-center md:items-start gap-4 text-center md:text-left">
            <div className="flex flex-col md:flex-row items-center gap-4">
                <h2 className="text-2xl font-light text-gray-800">@{userData.username || profileUser}</h2>
                <div className="flex gap-2">
                    {isOwnProfile ? (
                        <button onClick={() => setIsEditOpen(true)} className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-semibold transition">Edit Profile</button>
                    ) : (
                        <>
                            <button onClick={handleFollowToggle} className={`px-6 py-1.5 rounded-lg text-sm font-bold transition ${isFollowing ? 'bg-gray-100 text-gray-900' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>{isFollowing ? "Following" : isFollowedBy ? "Follow Back" : "Follow"}</button>
                            <button onClick={handleMessage} className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-semibold transition">Message</button>
                        </>
                    )}
                </div>
            </div>

            <div className="flex gap-8 md:gap-12 text-base">
                <StatBox count={userPosts.length} label="posts" />
                <StatBox count={followersCount} label="followers" onClick={() => openFollowList("Followers")} />
                <StatBox count={followingCount} label="following" onClick={() => openFollowList("Following")} />
            </div>

            <div className="space-y-1">
                <p className="font-semibold text-gray-900">{userData.fullName || userData.username || profileUser}</p>
                <p className="text-gray-800 whitespace-pre-wrap text-sm leading-snug">{userData.bio || "✨ Just a poet sharing thoughts."}</p>
                {userData.location && <p className="text-xs text-gray-500 flex items-center justify-center md:justify-start gap-1 pt-1"><MapPin size={12}/> {userData.location}</p>}
            </div>
          </div>
        </div>

        {/* TABS */}
        <div className="flex border-t border-gray-200 justify-center gap-12 mb-4">
            <TabButton icon={Grid} label="POSTS" active={activeTab === 'posts'} onClick={() => setActiveTab("posts")} />
            {isOwnProfile && <TabButton icon={Bookmark} label="SAVED" active={activeTab === 'saved'} onClick={() => setActiveTab("saved")} />}
        </div>

        {/* CONTENT GRID */}
        <div className="min-h-[300px]">
            {loading ? <div className="text-center py-20 text-gray-400">Loading...</div> : (
                <div className="grid grid-cols-3 gap-0.5 md:gap-6">
                    {(activeTab === 'posts' ? userPosts : savedPosts).length > 0 ? (
                        (activeTab === 'posts' ? userPosts : savedPosts).map(p => (
                            <div key={p.id} className="aspect-square relative group cursor-pointer bg-gray-100 overflow-hidden" onClick={() => onPostClick && onPostClick(p.id)}>
                                {p.image ? (
                                    <img src={p.image} alt="Post" className="w-full h-full object-cover group-hover:scale-105 transition duration-300"/>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center p-4 text-center font-serif text-gray-500 bg-white border border-gray-100">
                                        <span className="text-[10px] md:text-sm line-clamp-3">"{p.content}"</span>
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2 text-white font-bold">
                                    <span className="flex items-center gap-1"><Grid size={16} /></span>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="col-span-3 py-20 flex flex-col items-center justify-center text-gray-400">
                            <Grid size={40} className="mb-2 opacity-20"/>
                            <p className="text-sm">No posts yet.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

const TabButton = ({ icon: Icon, label, active, onClick }) => (
  <button onClick={onClick} className={`flex items-center gap-2 py-4 border-t-2 transition text-xs font-bold tracking-widest ${active ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
    <Icon size={12} /><span>{label}</span>
  </button>
);

const StatBox = ({ count, label, onClick }) => (
  <div onClick={onClick} className={`flex flex-col md:flex-row md:gap-1 items-center md:items-baseline transition ${onClick ? 'cursor-pointer hover:opacity-70' : ''}`}>
    <span className="font-bold text-lg md:text-xl text-gray-900">{count}</span>
    <span className="text-xs md:text-base text-gray-500">{label}</span>
  </div>
);

export default ProfilePage;