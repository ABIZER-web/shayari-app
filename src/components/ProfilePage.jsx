import { useState, useEffect } from 'react';
import { db, storage } from '../firebase'; 
import { collection, query, where, doc, getDoc, updateDoc, onSnapshot, arrayUnion, arrayRemove, setDoc, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'; 
import { Grid, Bookmark, ArrowLeft, LogOut, MapPin, Settings, Camera, MessageCircle, X, CheckCircle, XCircle, Loader2 } from 'lucide-react'; 
import { motion, AnimatePresence } from 'framer-motion';
import ShayariCard from './ShayariCard';
import SettingsModal from './SettingsModal'; 

const ProfilePage = ({ profileUser, currentUser, onBack, onLogout, onPostClick, onNavigateToChat, onProfileClick }) => {
  const [activeTab, setActiveTab] = useState("posts");
  const [userPosts, setUserPosts] = useState([]);
  const [savedPosts, setSavedPosts] = useState([]);
  
  // Profile Data
  const [userData, setUserData] = useState({ bio: "", location: "", photoURL: null, followers: [], following: [], username: "" });
  const [loading, setLoading] = useState(true);

  // Social State
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowedBy, setIsFollowedBy] = useState(false); // <--- NEW: Tracks if they follow you
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [mutuals, setMutuals] = useState([]);
  
  // Settings & Edit State
  const [showSettings, setShowSettings] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Edit Fields
  const [editBio, setEditBio] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editUsername, setEditUsername] = useState(""); 
  const [usernameStatus, setUsernameStatus] = useState("current"); 
  
  // Image Upload State
  const [imageFile, setImageFile] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // Follow List Modal State
  const [followModal, setFollowModal] = useState({ isOpen: false, type: null, users: [], loading: false });

  const isOwnProfile = profileUser === currentUser;

  // --- 1. FETCH PROFILE DATA ---
  useEffect(() => {
    setLoading(true);

    const userRef = doc(db, "users", profileUser);
    const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            setUserData(data);
            
            if (!isEditing) {
                setEditBio(data.bio || "");
                setEditLocation(data.location || "");
                setEditUsername(data.username || profileUser);
                setPreviewImage(data.photoURL || null); 
            }

            setFollowersCount(data.followers?.length || 0);
            setFollowingCount(data.following?.length || 0);

            // Check if *I* follow *Them*
            if (data.followers && data.followers.includes(currentUser)) {
                setIsFollowing(true);
            } else {
                setIsFollowing(false);
            }

            // Check if *Them* follows *Me* (Follow Back Logic)
            if (data.following && data.following.includes(currentUser)) {
                setIsFollowedBy(true);
            } else {
                setIsFollowedBy(false);
            }

            if (!isOwnProfile) {
                checkMutuals(profileUser);
            }
        } else {
            setUserData({ bio: "", photoURL: null, followers: [], following: [] });
        }
        setLoading(false);
    });

    const q = query(collection(db, "shayaris"), where("author", "==", profileUser));
    const unsubscribePosts = onSnapshot(q, (snapshot) => {
      const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      posts.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      setUserPosts(posts);
    });

    const fetchSaved = async () => {
      if (isOwnProfile && currentUser) {
        const SAVE_STORAGE_KEY = `saved_posts_${currentUser}`;
        const localSaved = JSON.parse(localStorage.getItem(SAVE_STORAGE_KEY) || '[]');
        setSavedPosts(localSaved);
      }
    };
    fetchSaved();

    return () => { unsubscribeUser(); unsubscribePosts(); };
  }, [profileUser, isOwnProfile, currentUser]); 

  // --- 2. REAL-TIME USERNAME CHECK ---
  useEffect(() => {
    const currentName = userData.username || profileUser;
    if (!isEditing || editUsername === currentName) {
        setUsernameStatus("current");
        return;
    }

    const checkAvailability = async () => {
        const term = editUsername.trim().toLowerCase().replace(/\s/g, '');
        if (term.length < 3) { setUsernameStatus("invalid"); return; }

        setUsernameStatus("checking");
        await new Promise(r => setTimeout(r, 500)); 

        try {
            const q = query(collection(db, "users"), where("username", "==", term));
            const querySnapshot = await getDocs(q);
            const docRef = doc(db, "users", term);
            const docSnap = await getDoc(docRef);

            if (!querySnapshot.empty || docSnap.exists()) {
                setUsernameStatus("taken");
            } else {
                setUsernameStatus("available");
            }
        } catch (e) { console.error(e); setUsernameStatus("invalid"); }
    };

    const timer = setTimeout(checkAvailability, 500);
    return () => clearTimeout(timer);
  }, [editUsername, isEditing, userData.username, profileUser]);

  // --- 3. SOCIAL LOGIC ---
  const checkMutuals = async (targetUser) => {
    try {
        const myDoc = await getDoc(doc(db, "users", currentUser));
        const myFollowing = myDoc.data()?.following || [];
        const targetDoc = await getDoc(doc(db, "users", targetUser));
        const targetFollowers = targetDoc.data()?.followers || [];
        const mutualList = myFollowing.filter(user => targetFollowers.includes(user));
        setMutuals(mutualList.slice(0, 3)); 
    } catch (e) { console.error(e); }
  };

  const handleFollowToggle = async () => {
    const myRef = doc(db, "users", currentUser);
    const targetRef = doc(db, "users", profileUser);

    try {
        if (isFollowing) {
            // UNFOLLOW
            await updateDoc(myRef, { following: arrayRemove(profileUser) });
            await updateDoc(targetRef, { followers: arrayRemove(currentUser) });
        } else {
            // FOLLOW
            await setDoc(myRef, { uid: currentUser }, { merge: true });
            await setDoc(targetRef, { uid: profileUser }, { merge: true });
            await updateDoc(myRef, { following: arrayUnion(profileUser) });
            await updateDoc(targetRef, { followers: arrayUnion(currentUser) });

            // SEND NOTIFICATION
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

  // --- 4. FOLLOW LIST LOGIC ---
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

  const handleRemoveUserFromList = async (targetUid) => {
      setFollowModal(prev => ({ ...prev, users: prev.users.filter(u => u.uid !== targetUid) }));
      try {
          const myRef = doc(db, "users", currentUser);
          const targetRef = doc(db, "users", targetUid);

          if (followModal.type === "Following") {
              await updateDoc(myRef, { following: arrayRemove(targetUid) });
              await updateDoc(targetRef, { followers: arrayRemove(currentUser) });
          } else {
              await updateDoc(myRef, { followers: arrayRemove(targetUid) });
              await updateDoc(targetRef, { following: arrayRemove(currentUser) });
          }
      } catch (error) { console.error("Error updating relationship:", error); }
  };

  const closeFollowModal = () => {
    setFollowModal({ isOpen: false, type: null, users: [], loading: false });
  };

  // --- 5. PROFILE SAVE ---
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 1024 * 1024) { alert("Image size must be less than 1MB."); return; }
      setImageFile(file);
      setPreviewImage(URL.createObjectURL(file));
    }
  };

  const handleSaveProfile = async () => {
    setIsUploading(true);
    try {
      let photoURL = userData.photoURL || null; 
      if (imageFile) {
        const imageRef = ref(storage, `profile_images/${currentUser}/${Date.now()}_${imageFile.name}`);
        const snapshot = await uploadBytes(imageRef, imageFile);
        photoURL = await getDownloadURL(snapshot.ref);
      }

      const newUsername = editUsername.trim().toLowerCase().replace(/\s/g, '');
      const currentName = userData.username || currentUser;

      if (newUsername !== currentName) {
          if (usernameStatus !== "available") {
              alert("Please choose an available username.");
              setIsUploading(false);
              return;
          }
      }

      await updateDoc(doc(db, "users", currentUser), { bio: editBio || "", location: editLocation || "", photoURL: photoURL, username: newUsername });
      setUserData({ ...userData, bio: editBio, location: editLocation, photoURL: photoURL, username: newUsername });
      setIsEditing(false);
      setImageFile(null); 
    } catch (err) { console.error("Error updating profile:", err); alert("Failed to update profile."); } finally { setIsUploading(false); }
  };

  return (
    <div className="bg-white min-h-screen pb-20 font-sans text-gray-900 relative">
      {showSettings && <SettingsModal currentUser={currentUser} isOpen={showSettings} onClose={() => setShowSettings(false)} onPostClick={onPostClick} />}

      {/* --- FOLLOW LIST MODAL --- */}
      <AnimatePresence>
        {followModal.isOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeFollowModal}>
                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="bg-white w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl h-[450px] flex flex-col">
                    <div className="p-4 border-b border-gray-100 flex items-center justify-between"><h3 className="font-bold text-lg">{followModal.type}</h3><button onClick={closeFollowModal}><X size={20} className="text-gray-500 hover:text-black"/></button></div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {followModal.loading ? <div className="flex justify-center py-10 text-gray-400">Loading...</div> : followModal.users.length > 0 ? (
                            <div className="space-y-1">
                                {followModal.users.map(u => (
                                    <div 
                                      key={u.uid} 
                                      className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl transition cursor-pointer group"
                                      onClick={() => {
                                          closeFollowModal();
                                          if (onProfileClick) onProfileClick(u.uid); 
                                      }}
                                    >
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-gray-200 to-gray-300 flex items-center justify-center overflow-hidden flex-shrink-0">{u.photoURL ? <img src={u.photoURL} alt={u.username} className="w-full h-full object-cover"/> : <span className="font-bold text-gray-600 text-sm">{u.username[0].toUpperCase()}</span>}</div>
                                        <div className="flex-1 min-w-0"><h4 className="font-bold text-sm text-gray-900">@{u.username}</h4><p className="text-xs text-gray-500 truncate">{u.bio || "No bio"}</p></div>
                                        {isOwnProfile && (
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation(); 
                                                    handleRemoveUserFromList(u.uid);
                                                }}
                                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition z-10 ${followModal.type === "Following" ? "bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-600" : "bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-600"}`}
                                            >
                                                {followModal.type === "Following" ? "Unfollow" : "Remove"}
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : <div className="text-center py-10 text-gray-400 text-sm">No users found.</div>}
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* HEADER (Mobile) */}
      <div className="md:hidden sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center justify-between transition-all">
        <div className="flex items-center gap-4"><button onClick={onBack} className="p-2 rounded-full hover:bg-gray-100 transition"><ArrowLeft size={22} /></button><h2 className="text-lg font-bold tracking-wide">@{userData.username || profileUser}</h2></div>
        {isOwnProfile && <button onClick={() => setShowSettings(true)} className="p-2 rounded-full hover:bg-gray-100 transition text-gray-600"><Settings size={22} /></button>}
      </div>

      <div className="w-full px-6 pt-8 pb-8">
        <div className="hidden md:flex items-center mb-6"><button onClick={onBack} className="flex items-center gap-2 text-gray-500 hover:text-black transition font-medium px-3 py-2 hover:bg-gray-100 rounded-lg"><ArrowLeft size={20} /> Back</button></div>

        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-12 mb-8">
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative group">
            <div className="w-24 h-24 md:w-40 md:h-40 rounded-full bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 p-[3px] shadow-lg flex-shrink-0">
              <div className="w-full h-full bg-white rounded-full overflow-hidden flex items-center justify-center">
                {previewImage || userData.photoURL ? <img src={previewImage || userData.photoURL} alt={profileUser} className="w-full h-full object-cover"/> : <span className="text-gray-800 text-4xl md:text-6xl font-bold">{(userData.username || profileUser)[0].toUpperCase()}</span>}
              </div>
            </div>
            {isEditing && (
              <label htmlFor="profile-image-upload" className="absolute inset-0 bg-black/40 rounded-full flex flex-col items-center justify-center text-white cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera size={24} /><span className="text-xs font-bold mt-1">Change</span><input id="profile-image-upload" type="file" accept="image/*" className="hidden" onChange={handleImageChange}/>
              </label>
            )}
          </motion.div>

          <div className="flex-1 w-full text-center md:text-left">
            <div className="flex flex-col md:flex-row md:items-center gap-4 mb-4">
                <h3 className="font-bold text-2xl md:text-3xl text-gray-800">@{userData.username || profileUser}</h3>
                <div className="hidden md:flex gap-2">
                    {isOwnProfile && !isEditing ? (
                        <>
                            <button onClick={() => setIsEditing(true)} className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-semibold transition">Edit Profile</button>
                            <button onClick={() => setShowSettings(true)} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-full"><Settings size={20}/></button>
                        </>
                    ) : !isOwnProfile && (
                        <>
                            {/* --- FOLLOW BUTTON WITH FOLLOW BACK LOGIC --- */}
                            <button 
                                onClick={handleFollowToggle} 
                                className={`px-6 py-1.5 rounded-lg text-sm font-bold transition flex items-center gap-2 ${
                                    isFollowing ? 'bg-gray-100 text-gray-900' : 'bg-black text-white'
                                }`}
                            >
                                {isFollowing ? "Following" : isFollowedBy ? "Follow Back" : "Follow"}
                            </button>
                            
                            <button onClick={handleMessage} className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-semibold transition">Message</button>
                        </>
                    )}
                </div>
            </div>

            <div className="flex justify-center md:justify-start gap-8 md:gap-12 mb-5 text-base">
                <StatBox count={userPosts.length} label="posts" />
                <StatBox count={followersCount} label="followers" onClick={() => openFollowList("Followers")} />
                <StatBox count={followingCount} label="following" onClick={() => openFollowList("Following")} />
            </div>

            <div className="space-y-2">
                {isEditing ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 bg-gray-50 p-5 rounded-3xl border border-gray-200 text-left shadow-inner">
                      <div><label className="text-xs font-bold text-gray-500 uppercase ml-1 mb-1 block">Username</label><div className="relative"><span className="absolute left-3 top-2.5 text-gray-400 font-bold">@</span><input value={editUsername} onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/\s/g, ''))} className={`w-full pl-7 pr-10 p-2.5 bg-white border rounded-xl text-sm outline-none font-bold transition ${usernameStatus === 'available' ? 'border-green-400 ring-2 ring-green-100' : usernameStatus === 'taken' ? 'border-red-400 ring-2 ring-red-100' : 'border-gray-200 focus:ring-2 focus:ring-black/5'}`}/><div className="absolute right-3 top-2.5">{usernameStatus === 'checking' && <Loader2 size={16} className="animate-spin text-gray-400" />}{usernameStatus === 'available' && <CheckCircle size={18} className="text-green-500" />}{usernameStatus === 'taken' && <XCircle size={18} className="text-red-500" />}</div></div><div className="mt-1.5 ml-1 flex items-center gap-1.5 text-xs font-medium">{usernameStatus === 'available' && <span className="text-green-600">Username available!</span>}{usernameStatus === 'taken' && <span className="text-red-500">Username already taken.</span>}{usernameStatus === 'invalid' && <span className="text-red-500">Min 3 chars, no spaces.</span>}</div></div>
                      <div><label className="text-xs font-bold text-gray-500 uppercase ml-1 mb-1 block">Location</label><input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} placeholder="e.g. Mumbai, India" className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-black/5" /></div>
                      <div><label className="text-xs font-bold text-gray-500 uppercase ml-1 mb-1 block">Bio</label><textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} placeholder="Write something about yourself..." className="w-full p-2.5 bg-white border border-gray-200 rounded-xl h-24 resize-none text-sm outline-none focus:ring-2 focus:ring-black/5" /></div>
                      <div className="flex gap-2 pt-2">
                          <button onClick={handleSaveProfile} disabled={isUploading || usernameStatus === 'taken' || usernameStatus === 'invalid'} className="flex-1 bg-black text-white py-3 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-800 transition">{isUploading ? "Saving..." : "Save Changes"}</button>
                          <button onClick={() => { setIsEditing(false); setPreviewImage(userData.photoURL); setImageFile(null); setEditUsername(userData.username || currentUser); }} disabled={isUploading} className="flex-1 bg-white border border-gray-200 text-gray-700 py-3 rounded-xl text-sm font-bold hover:bg-gray-50 transition">Cancel</button>
                      </div>
                    </motion.div>
                ) : (
                    <>
                        <p className="text-gray-800 whitespace-pre-wrap leading-relaxed text-sm md:text-base">{userData.bio || "✨ Just a poet sharing thoughts."}</p>
                        {userData.location && <p className="text-sm text-gray-500 font-medium flex items-center justify-center md:justify-start gap-1"><MapPin size={16}/> {userData.location}</p>}
                        {!isOwnProfile && mutuals.length > 0 && (
                            <div className="flex items-center justify-center md:justify-start gap-2 mt-3 text-xs text-gray-500">
                                <div className="flex -space-x-2">{mutuals.map(m => <div key={m} className="w-5 h-5 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-[8px] font-bold text-gray-600">{m[0].toUpperCase()}</div>)}</div>
                                <span>Followed by <span className="font-semibold text-gray-700">{mutuals[0]}</span> {mutuals.length > 1 && `+ ${mutuals.length - 1} others`}</span>
                            </div>
                        )}
                    </>
                )}
            </div>

            {!isEditing && (
                <div className="flex md:hidden gap-2 mt-6">
                    {isOwnProfile ? (
                        <>
                            <button onClick={() => setIsEditing(true)} className="flex-1 py-2 bg-gray-100 rounded-lg text-sm font-semibold text-gray-900 hover:bg-gray-200 transition">Edit Profile</button>
                            <button onClick={onLogout} className="py-2 px-4 bg-gray-100 rounded-lg hover:bg-red-50 hover:text-red-600 transition"><LogOut size={18}/></button>
                        </>
                    ) : (
                        <><button onClick={handleFollowToggle} className={`flex-1 py-2 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${isFollowing ? 'bg-gray-100 text-gray-900' : 'bg-black text-white'}`}>{isFollowing ? "Following" : isFollowedBy ? "Follow Back" : "Follow"}</button><button onClick={handleMessage} className="flex-1 bg-gray-100 text-gray-900 py-2 rounded-lg font-bold text-sm hover:bg-gray-200 transition flex items-center justify-center gap-2"><MessageCircle size={18}/> Message</button></>
                    )}
                </div>
            )}
          </div>
        </div>

        <div className="flex border-t border-gray-200 sticky top-[60px] md:top-0 bg-white z-10">
            <TabButton icon={Grid} label="POSTS" active={activeTab === 'posts'} onClick={() => setActiveTab("posts")} />
            {isOwnProfile && <TabButton icon={Bookmark} label="SAVED" active={activeTab === 'saved'} onClick={() => setActiveTab("saved")} />}
        </div>

        <div className="py-6 min-h-[300px]">
            {loading ? <div className="text-center py-20 text-gray-400">Loading...</div> : (
                <AnimatePresence mode="wait">
                    <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1 md:gap-6">
                        {(activeTab === 'posts' ? userPosts : savedPosts).length > 0 ? (
                            (activeTab === 'posts' ? userPosts : savedPosts).map(p => (
                                <div key={p.id}>
                                    <div className="md:hidden"><ShayariCard shayari={p} /></div>
                                    <div className="hidden md:block aspect-square group relative cursor-pointer bg-gray-100 overflow-hidden rounded-lg border border-gray-100" onClick={() => onPostClick && onPostClick(p.id)} >
                                        {p.image ? <img src={p.image} alt="Post" className="w-full h-full object-cover group-hover:scale-110 transition duration-500" /> : <div className="w-full h-full flex items-center justify-center p-6 text-center font-serif text-gray-700 bg-white"><span className="line-clamp-4 leading-relaxed">"{p.content}"</span></div>}
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-4 text-white font-bold"><span>♥ {p.likes || 0}</span></div>
                                     </div>
                                </div>
                            ))
                        ) : (<div className="col-span-full"><EmptyState text={activeTab === 'posts' ? "No posts yet." : "No saved items."} /></div>)}
                    </motion.div>
                </AnimatePresence>
            )}
        </div>
      </div>
    </div>
  );
};

// Sub-components
const StatBox = ({ count, label, onClick }) => (
  <div onClick={onClick} className={`flex flex-col md:flex-row md:gap-1 items-center md:items-baseline transition ${onClick ? 'cursor-pointer hover:opacity-70' : ''}`}>
    <span className="font-bold text-lg md:text-xl text-gray-900">{count}</span>
    <span className="text-xs md:text-base text-gray-500">{label}</span>
  </div>
);

const TabButton = ({ icon: Icon, label, active, onClick }) => (
  <button onClick={onClick} className={`flex-1 flex justify-center items-center gap-2 py-3 border-t-2 md:border-t-0 md:border-b-2 transition uppercase text-xs font-bold tracking-widest ${active ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
    <Icon size={16} />
    <span className="hidden md:inline">{label}</span>
  </button>
);

const EmptyState = ({ text }) => (
  <div className="text-center py-20 flex flex-col items-center text-gray-400">
    <Grid size={40} className="mb-3 opacity-20"/>
    <p>{text}</p>
  </div>
);

export default ProfilePage;