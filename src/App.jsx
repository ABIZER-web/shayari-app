import { useState, useEffect } from 'react';
import { 
  Home, PlusSquare, Search, User, MessageCircle, Heart, Menu, 
  LogOut, Settings, Activity, AlertCircle, X, ChevronLeft, Lock, Shield, Users, Ban
} from 'lucide-react'; 
import { db, auth } from './firebase'; 
import { 
  collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, 
  getDocs, collectionGroup, getDoc, arrayRemove 
} from 'firebase/firestore'; 
import { signOut, onAuthStateChanged } from 'firebase/auth'; 
import { motion, AnimatePresence } from 'framer-motion'; 

// --- COMPONENTS ---
import Dashboard from './components/Dashboard';
import ShayariFeed from './components/ShayariFeed';
import PostShayari from './components/PostShayari';
import Explore from './components/Explore';
import Login from './components/Login';
import ProfilePage from './components/ProfilePage';
import Notifications from './components/Notifications';
import SinglePostView from './components/SinglePostView'; 
import ChatPage from './components/ChatPage'; 

const pageVariants = {
  initial: { opacity: 0 },
  in: { opacity: 1 },
  out: { opacity: 0 }
};

const pageTransition = { type: "tween", ease: "easeInOut", duration: 0.2 };

function App() {
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('shayari_user') || null);
  const [currentUid, setCurrentUid] = useState(null); 
  const [userPhotoURL, setUserPhotoURL] = useState(null); 
  const [isPrivateAccount, setIsPrivateAccount] = useState(false);
  
  // 🔥 COMBINED HIDDEN LIST (My Blocked + Who Blocked Me)
  const [allHiddenUsers, setAllHiddenUsers] = useState([]); 
  // Keep track of just who I blocked for the Settings list
  const [myDirectBlocks, setMyDirectBlocks] = useState([]);

  // Navigation State
  const [view, setView] = useState(localStorage.getItem('saved_view') || "home");
  const [viewingProfile, setViewingProfile] = useState(localStorage.getItem('saved_profile') || null); 
  const [viewingPostId, setViewingPostId] = useState(localStorage.getItem('saved_post_id') || null);
  const [activeChatId, setActiveChatId] = useState(localStorage.getItem('saved_chat_id') || null);
  const [editPostData, setEditPostData] = useState(null); 
  
  // Drawer States
  const [showMenuDrawer, setShowMenuDrawer] = useState(false);
  const [menuStep, setMenuStep] = useState('main'); 
  const [showNotificationsDesktop, setShowNotificationsDesktop] = useState(false);

  // Data State
  const [hasUnreadMsg, setHasUnreadMsg] = useState(false);
  const [hasUnreadNotif, setHasUnreadNotif] = useState(false);
  
  // Activity Data
  const [activityPosts, setActivityPosts] = useState([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [activityTab, setActivityTab] = useState('likes'); 
  
  // Settings Block List (For Unblocking UI)
  const [blockedListDetails, setBlockedListDetails] = useState([]); 
  const [loadingBlockList, setLoadingBlockList] = useState(false);

  // --- SAVE VIEW STATE ---
  useEffect(() => {
    localStorage.setItem('saved_view', view);
    if (viewingProfile) localStorage.setItem('saved_profile', viewingProfile); else localStorage.removeItem('saved_profile');
    if (activeChatId) localStorage.setItem('saved_chat_id', activeChatId); else localStorage.removeItem('saved_chat_id');
    if (viewingPostId) localStorage.setItem('saved_post_id', viewingPostId); else localStorage.removeItem('saved_post_id');
  }, [view, viewingProfile, activeChatId, viewingPostId]);

  // --- AUTH LISTENER ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUid(user.uid);
        if (!currentUser) {
            const name = user.displayName || user.email.split('@')[0];
            setCurrentUser(name);
            localStorage.setItem('shayari_user', name);
        }
      } else {
        setCurrentUser(null);
        setCurrentUid(null);
        localStorage.removeItem('shayari_user');
      }
    });
    return () => unsubscribe();
  }, [currentUser]);

  // --- FETCH USER DETAILS & SYNC BLOCKS ---
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, "users"), where("username", "==", currentUser));
    
    const setOnline = async () => {
        const snap = await getDocs(q);
        if (!snap.empty) {
            const docRef = doc(db, "users", snap.docs[0].id);
            await updateDoc(docRef, { isOnline: true, lastSeen: serverTimestamp() });
        }
    };
    setOnline();

    // Listen to Profile Changes
    const unsubUser = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            setUserPhotoURL(data.photoURL || null);
            setIsPrivateAccount(data.isPrivate || false);
            
            const blockedByMe = data.blocked || [];
            const blockedByOthers = data.blockedBy || [];
            
            setMyDirectBlocks(blockedByMe);
            // 🔥 Combine lists so both sides become invisible
            setAllHiddenUsers([...new Set([...blockedByMe, ...blockedByOthers])]);
        }
    });

    return () => unsubUser();
  }, [currentUser]);

  // --- NOTIFICATIONS & MESSAGES ---
  useEffect(() => {
    if (!currentUser) return;
    const qNotif = query(collection(db, "notifications"), where("toUser", "==", currentUser), where("read", "==", false));
    const unsubNotif = onSnapshot(qNotif, (snap) => setHasUnreadNotif(!snap.empty));
    const qChats = query(collection(db, "chats"), where("participants", "array-contains", currentUser));
    const unsubChats = onSnapshot(qChats, (snapshot) => {
      let unreadFound = false;
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.isRead === false && data.lastMessageSender !== currentUser) unreadFound = true;
      });
      setHasUnreadMsg(unreadFound);
    });
    return () => { unsubNotif(); unsubChats(); };
  }, [currentUser]);

  // --- FETCH BLOCKED LIST DETAILS (Settings) ---
  const fetchBlockedDetails = async () => {
      if (!myDirectBlocks.length) {
          setBlockedListDetails([]);
          return;
      }
      setLoadingBlockList(true);
      try {
          const users = [];
          for (const username of myDirectBlocks) {
              const q = query(collection(db, "users"), where("username", "==", username));
              const snap = await getDocs(q);
              if (!snap.empty) {
                  users.push({ id: snap.docs[0].id, ...snap.docs[0].data() });
              } else {
                  users.push({ username: username, photoURL: null }); 
              }
          }
          setBlockedListDetails(users);
      } catch (err) { console.error(err); }
      setLoadingBlockList(false);
  };

  // --- UNBLOCK USER (MUTUAL RESET) ---
  const handleUnblockUser = async (targetUsername) => {
      if (!currentUid) return;
      try {
          // 1. Remove from MY 'blocked' list
          await updateDoc(doc(db, "users", currentUid), {
              blocked: arrayRemove(targetUsername)
          });

          // 2. Remove ME from THEIR 'blockedBy' list (so they can see me again)
          const q = query(collection(db, "users"), where("username", "==", targetUsername));
          const snap = await getDocs(q);
          if(!snap.empty) {
              const targetDoc = snap.docs[0];
              await updateDoc(targetDoc.ref, {
                  blockedBy: arrayRemove(currentUser)
              });
          }

          // UI Update
          setBlockedListDetails(prev => prev.filter(u => u.username !== targetUsername));
          alert(`Unblocked ${targetUsername}. You can now follow each other again.`);
      } catch (err) { console.error("Unblock error", err); }
  };

  const fetchActivity = async (type = 'likes') => {
      setLoadingActivity(true);
      setActivityTab(type);
      setActivityPosts([]); 
      try {
          let posts = [];
          if (type === 'likes') {
              const q = query(collection(db, "shayaris"), where("likedBy", "array-contains", currentUser));
              const snap = await getDocs(q);
              posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          } else {
              const q = query(collectionGroup(db, "comments"), where("username", "==", currentUser));
              const snap = await getDocs(q);
              const postIds = new Set();
              snap.docs.forEach(d => { if (d.ref.parent.parent) postIds.add(d.ref.parent.parent.id); });
              const promises = Array.from(postIds).map(id => getDoc(doc(db, "shayaris", id)));
              const docs = await Promise.all(promises);
              posts = docs.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() }));
          }
          posts.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
          setActivityPosts(posts);
      } catch (err) { console.error(err); }
      setLoadingActivity(false);
  };

  const handleNav = (targetView, profileName = null, chatId = null, postId = null, postData = null) => {
    setShowNotificationsDesktop(false);
    setShowMenuDrawer(false); 
    setMenuStep('main'); 
    if (profileName) setViewingProfile(profileName);
    if (chatId !== undefined) setActiveChatId(chatId); else if (targetView === 'chat' && chatId === null) setActiveChatId(null); 
    if (postId) setViewingPostId(postId);
    if (targetView === 'edit' && postData) setEditPostData(postData); else if (targetView === 'post') setEditPostData(null); 
    setView(targetView);
  };

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.clear();
    setCurrentUser(null);
    setView("home");
  };

  const togglePrivacy = async () => {
      if(!currentUid) return;
      try { await updateDoc(doc(db, "users", currentUid), { isPrivate: !isPrivateAccount }); } 
      catch (err) { console.error(err); }
  };

  const SidebarItem = ({ icon: Icon, label, isActive, onClick, alert, imgSrc }) => (
    <motion.button onClick={onClick} animate={{ x: isActive ? 12 : 0 }} whileHover={{ x: isActive ? 12 : 6 }} transition={{ type: "spring", stiffness: 300, damping: 20 }} className={`flex items-center gap-4 p-3 rounded-xl w-full transition-colors duration-200 group ${isActive ? 'bg-[#00adb5] text-white font-bold shadow-md' : 'hover:bg-[#393e46] hover:text-white text-gray-400 font-normal'}`}>
      <div className="relative flex items-center justify-center w-7 h-7 shrink-0">
        {label === 'Profile' ? <img src={imgSrc || "/favicon.png"} alt="Profile" className={`w-7 h-7 rounded-full object-cover border transition-transform group-hover:scale-110 ${isActive ? 'border-white border-2' : 'border-gray-500'}`} /> : <Icon size={26} strokeWidth={isActive ? 2.8 : 2} className={`transition-transform group-hover:scale-110 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}`} />}
        {alert && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#222831]"></span>}
      </div>
      <span className="hidden xl:block text-base">{label}</span>
    </motion.button>
  );

  if (!currentUser) return <Login onLogin={(user) => setCurrentUser(user)} />;

  const isFullScreenMobile = view === 'chat' && activeChatId;

  return (
    <div className="flex h-screen bg-[#222831] text-[#eeeeee] font-sans overflow-hidden relative">
      
      <AnimatePresence>
        {showMenuDrawer && (
            <>
                <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={() => setShowMenuDrawer(false)}></div>
                <motion.div initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "tween", ease: "easeInOut", duration: 0.3 }} className="fixed top-0 left-[80px] xl:left-[250px] h-full w-[350px] bg-[#222831] border-r border-[#393e46] z-50 shadow-2xl p-6 flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        {menuStep === 'main' ? <h2 className="text-2xl font-bold font-serif text-[#eeeeee]">Menu</h2> : <button onClick={() => setMenuStep('main')} className="flex items-center gap-2 text-gray-400 hover:text-[#eeeeee]"><ChevronLeft size={20}/> <span className="text-sm font-bold">Back</span></button>}
                        <button onClick={() => setShowMenuDrawer(false)} className="p-1 hover:bg-[#393e46] rounded-full"><X size={20} className="text-gray-400"/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {menuStep === 'main' && (
                            <div className="space-y-1">
                                <button onClick={() => setMenuStep('settings')} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-[#393e46] text-[#eeeeee] transition text-left"><Settings size={22} /> <span className="text-sm font-medium">Settings</span></button>
                                <button onClick={() => { setMenuStep('activity'); fetchActivity('likes'); }} className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-[#393e46] text-[#eeeeee] transition text-left"><Activity size={22} /> <span className="text-sm font-medium">Your Activity</span></button>
                                <button className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-[#393e46] text-[#eeeeee] transition text-left"><AlertCircle size={22} /> <span className="text-sm font-medium">Report a problem</span></button>
                                <div className="mt-6 pt-4 border-t border-[#393e46]"><button onClick={handleLogout} className="w-full flex items-center gap-4 p-3 rounded-xl text-red-500 hover:bg-red-500/10 transition font-bold"><LogOut size={22} /> <span>Log Out</span></button></div>
                            </div>
                        )}
                        {menuStep === 'settings' && (
                            <div className="space-y-6 animate-in slide-in-from-right duration-200">
                                <h3 className="text-xl font-bold text-[#00adb5]">Account Privacy</h3>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-3 bg-[#393e46] rounded-xl">
                                        <div className="flex items-center gap-3"><Lock size={20} className="text-gray-400"/><div><p className="text-sm font-bold text-[#eeeeee]">Private Account</p><p className="text-[10px] text-gray-400">Only followers can see your posts</p></div></div>
                                        <button onClick={togglePrivacy} className={`w-12 h-6 rounded-full p-1 transition-colors ${isPrivateAccount ? 'bg-[#00adb5]' : 'bg-gray-600'}`}><div className={`w-4 h-4 bg-white rounded-full shadow-md transition-transform ${isPrivateAccount ? 'translate-x-6' : 'translate-x-0'}`}></div></button>
                                    </div>
                                    <button onClick={() => { setMenuStep('blocked'); fetchBlockedDetails(); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#393e46] text-[#eeeeee] transition text-left"><Ban size={20} className="text-gray-400" /> <span className="text-sm font-medium">Blocked Accounts</span></button>
                                    <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#393e46] text-[#eeeeee] transition text-left"><Users size={20} className="text-gray-400" /> <span className="text-sm font-medium">Restricted Accounts</span></button>
                                </div>
                            </div>
                        )}
                        {menuStep === 'blocked' && (
                            <div className="animate-in slide-in-from-right duration-200 h-full flex flex-col">
                                <h3 className="text-xl font-bold text-red-500 mb-4 flex items-center gap-2"><Ban size={20}/> Blocked Users</h3>
                                <div className="flex-1 overflow-y-auto">
                                    {loadingBlockList ? <div className="text-center text-gray-500 py-10">Loading...</div> : blockedListDetails.length === 0 ? <div className="text-center text-gray-500 py-10 text-sm">No blocked users.</div> : (
                                        <div className="space-y-2">
                                            {blockedListDetails.map(u => (
                                                <div key={u.username} className="flex items-center justify-between p-2 bg-[#393e46] rounded-lg">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-full bg-gray-600 overflow-hidden">{u.photoURL ? <img src={u.photoURL} className="w-full h-full object-cover"/> : <span className="flex items-center justify-center h-full font-bold text-white text-xs">{u.username[0].toUpperCase()}</span>}</div>
                                                        <span className="text-sm font-bold">{u.username}</span>
                                                    </div>
                                                    <button onClick={() => handleUnblockUser(u.username)} className="bg-[#00adb5] px-3 py-1 rounded text-[10px] font-bold text-white hover:bg-teal-600">Unblock</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        {menuStep === 'activity' && (
                            <div className="animate-in slide-in-from-right duration-200">
                                <h3 className="text-xl font-bold text-[#00adb5] mb-2">Interactions</h3>
                                <div className="flex bg-[#393e46] rounded-xl p-1 mb-4">
                                    <button onClick={() => fetchActivity('likes')} className={`flex-1 flex justify-center py-2 rounded-lg transition ${activityTab === 'likes' ? 'bg-[#00adb5] text-white' : 'text-gray-400 hover:text-white'}`}><Heart size={20} fill={activityTab === 'likes' ? "currentColor" : "none"} /></button>
                                    <button onClick={() => fetchActivity('comments')} className={`flex-1 flex justify-center py-2 rounded-lg transition ${activityTab === 'comments' ? 'bg-[#00adb5] text-white' : 'text-gray-400 hover:text-white'}`}><MessageCircle size={20} fill={activityTab === 'comments' ? "currentColor" : "none"} /></button>
                                </div>
                                {loadingActivity ? <div className="text-center py-10 text-gray-500">Loading...</div> : activityPosts.length === 0 ? <div className="text-center py-10 text-gray-500 text-sm">No {activityTab} yet.</div> : (
                                    <div className="grid grid-cols-3 gap-1">
                                        {activityPosts.map(p => (
                                            <div key={p.id} onClick={() => handleNav('singlePost', null, null, p.id)} className="aspect-square bg-[#393e46] cursor-pointer relative overflow-hidden rounded-md" style={{ background: p.bgColor || '#393e46' }}>
                                                <div className="absolute inset-0 flex items-center justify-center p-1"><p className="text-[8px] text-white line-clamp-3 text-center pointer-events-none">{p.content}</p></div>
                                                <div className="absolute top-1 right-1">{activityTab === 'likes' ? <Heart size={10} className="text-white" fill="white"/> : <MessageCircle size={10} className="text-white" fill="white"/>}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </motion.div>
            </>
        )}
      </AnimatePresence>

      <AnimatePresence>{showNotificationsDesktop && (<><div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={() => setShowNotificationsDesktop(false)}></div><motion.div initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "tween", ease: "easeInOut", duration: 0.3 }} className="fixed top-0 left-[80px] xl:left-[250px] h-full w-[400px] bg-[#222831] border-r border-[#393e46] z-50 shadow-2xl overflow-hidden"><div className="p-6 h-full flex flex-col"><div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-bold font-serif text-[#eeeeee]">Notifications</h2><button onClick={() => setShowNotificationsDesktop(false)} className="p-1 hover:bg-[#393e46] rounded-full"><X size={20} className="text-gray-400"/></button></div><div className="flex-1 overflow-y-auto scrollbar-hide"><Notifications currentUser={currentUser} onPostClick={(id) => handleNav('singlePost', null, null, id)} onProfileClick={(uid) => handleNav('profile', uid)} /></div></div></motion.div></>)}</AnimatePresence>
      
      <aside className="hidden md:flex flex-col w-[80px] xl:w-[250px] border-r border-[#393e46] h-full bg-[#222831] z-50 relative shrink-0">
        <div className="flex flex-col justify-between h-full py-8 px-3 xl:px-6">
            <div className="space-y-6">
                <div className="flex items-center gap-3 pl-2 cursor-pointer mb-8" onClick={() => handleNav('home')}><img src="/logo.png" alt="Logo" className="h-8 w-8 object-contain" /><span className="hidden xl:block font-bold text-xl text-[#eeeeee]">ShayariGram</span></div>
                <SidebarItem icon={Home} label="Home" isActive={view === 'home'} onClick={() => handleNav('home')} />
                <SidebarItem icon={Search} label="Search" isActive={view === 'explore'} onClick={() => handleNav('explore')} />
                <SidebarItem icon={MessageCircle} label="Messages" isActive={view === 'chat'} onClick={() => handleNav('chat', null, null)} alert={hasUnreadMsg} />
                <SidebarItem icon={Heart} label="Notifications" isActive={showNotificationsDesktop} onClick={() => { setShowNotificationsDesktop(!showNotificationsDesktop); setShowMenuDrawer(false); }} alert={hasUnreadNotif} />
                <SidebarItem icon={PlusSquare} label="Create" isActive={view === 'post'} onClick={() => handleNav('post')} />
                <SidebarItem icon={User} label="Profile" isActive={view === 'profile' && viewingProfile === currentUser} onClick={() => handleNav('profile', currentUser)} imgSrc={userPhotoURL} />
            </div>
            <div className="space-y-2"><SidebarItem icon={Menu} label="More" isActive={showMenuDrawer} onClick={() => { setShowMenuDrawer(!showMenuDrawer); setShowNotificationsDesktop(false); }} /></div>
        </div>
      </aside>

      {!isFullScreenMobile && (<div className="md:hidden fixed bottom-0 w-full h-[60px] border-t border-[#393e46] bg-[#222831] z-40 flex justify-around items-center pb-safe"><SidebarItem icon={Home} isActive={view === 'home'} onClick={() => handleNav("home")} /><SidebarItem icon={Search} isActive={view === 'explore'} onClick={() => handleNav("explore")} /><SidebarItem icon={PlusSquare} isActive={view === 'post'} onClick={() => handleNav("post")} /><button onClick={() => handleNav("profile", currentUser)} className={`rounded-full p-0.5 border-2 ${view === 'profile' && viewingProfile === currentUser ? 'border-[#00adb5]' : 'border-transparent'}`}><img src={userPhotoURL || "/favicon.png"} alt="Profile" className="w-7 h-7 rounded-full object-cover border border-[#393e46]" /></button></div>)}

      <main className={`flex-1 h-full overflow-y-auto relative bg-[#222831] ${isFullScreenMobile ? 'p-0' : 'pt-[60px] pb-[60px] md:pt-0 md:pb-0'}`}>
        <div className="w-full min-h-full flex justify-center"> 
            <AnimatePresence mode="wait">
                {view === "home" && <motion.div key="home" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition} className="w-full max-w-[600px] py-4 md:py-8 px-2 md:px-0"><Dashboard /><div className="mt-6"><ShayariFeed blockedUsers={allHiddenUsers} onProfileClick={(uid) => handleNav('profile', uid)} onPostClick={(id) => handleNav('singlePost', null, null, id)} onEditClick={(post) => handleNav('edit', null, null, null, post)} /></div></motion.div>}
                {view === "explore" && <motion.div key="explore" variants={pageVariants} className="md:py-6 px-2 w-full max-w-4xl"><Explore blockedUsers={allHiddenUsers} onProfileClick={(uid) => handleNav('profile', uid)} onPostClick={(id) => handleNav('singlePost', null, null, id)} /></motion.div>}
                {view === "post" && <motion.div key="post" variants={pageVariants} className="md:py-10 px-4 w-full max-w-xl flex justify-center"><div className="w-full"><PostShayari username={currentUser} onBack={() => handleNav('home')} /></div></motion.div>}
                {view === "edit" && <motion.div key="edit" variants={pageVariants} className="md:py-10 px-4 w-full max-w-xl flex justify-center"><div className="w-full"><PostShayari username={currentUser} onBack={() => handleNav('home')} editData={editPostData} /></div></motion.div>}
                
                {/* 🔥 PROFILE: Handle Block Success -> Navigate to Explore */}
                {view === "profile" && (
                    <motion.div key="profile" variants={pageVariants} className="md:py-8 px-0 w-full max-w-4xl">
                        <ProfilePage 
                            profileUser={viewingProfile} 
                            currentUser={currentUser} 
                            onPostClick={(id) => handleNav('singlePost', null, null, id)} 
                            onLogout={handleLogout} 
                            onBlockSuccess={() => handleNav('explore')} // Navigate to Explore on block
                        />
                    </motion.div>
                )}
                
                {view === "notifications" && <motion.div key="notifications" variants={pageVariants} className="md:hidden w-full"><Notifications currentUser={currentUser} onPostClick={(id) => handleNav('singlePost', null, null, id)} /></motion.div>}
                {view === "chat" && <motion.div key="chat" variants={pageVariants} className="h-full w-full md:p-6 max-w-6xl"><ChatPage blockedUsers={allHiddenUsers} currentUser={currentUser} initialChatId={activeChatId} onBack={() => handleNav('home')} onChatSelect={(id) => setActiveChatId(id)} onPostClick={(id) => handleNav('singlePost', null, null, id)} /></motion.div>}
                {view === "singlePost" && <motion.div key="singlePost" variants={pageVariants} className="md:py-10 px-4 w-full max-w-xl flex justify-center"><div className="w-full"><SinglePostView postId={viewingPostId} onBack={() => handleNav('home')} /></div></motion.div>}
            </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

export default App;