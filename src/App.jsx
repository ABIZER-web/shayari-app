import { useState, useEffect } from 'react';
import { Home, PlusSquare, Search, User, MessageCircle, Heart, Menu, Instagram, Send, Phone, PhoneOff, Video, X } from 'lucide-react'; 
import { db, auth } from './firebase'; 
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, getDocs } from 'firebase/firestore'; 
import { signOut } from 'firebase/auth';
import { motion, AnimatePresence } from 'framer-motion'; 

// Import Components
import Dashboard from './components/Dashboard';
import ShayariFeed from './components/ShayariFeed';
import PostShayari from './components/PostShayari';
import Explore from './components/Explore';
import Login from './components/Login';
import ProfilePage from './components/ProfilePage';
import Notifications from './components/Notifications';
import SinglePostView from './components/SinglePostView'; 
import SettingsModal from './components/SettingsModal';
import ChatPage from './components/ChatPage'; 
import VideoCall from './components/VideoCall'; 

const pageVariants = {
  initial: { opacity: 0 },
  in: { opacity: 1 },
  out: { opacity: 0 }
};

const pageTransition = { type: "tween", ease: "easeInOut", duration: 0.2 };

function App() {
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('shayari_user') || null);
  const [userPhotoURL, setUserPhotoURL] = useState(null); 
  const [view, setView] = useState(localStorage.getItem('shayari_current_view') || "home");
  
  // ⚡ New State for Account Switching Feature
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);

  // Navigation State
  const [viewingProfile, setViewingProfile] = useState(localStorage.getItem('shayari_last_profile') || null); 
  const [viewingPostId, setViewingPostId] = useState(null);
  const [activeChatId, setActiveChatId] = useState(null);
  
  const [history, setHistory] = useState([]);
  const [hasUnreadMsg, setHasUnreadMsg] = useState(false);
  const [hasUnreadNotif, setHasUnreadNotif] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNotificationsDesktop, setShowNotificationsDesktop] = useState(false);

  // --- CALL STATES ---
  const [incomingCall, setIncomingCall] = useState(null); 
  const [activeCallSession, setActiveCallSession] = useState(null);

  // --- PERSISTENCE ---
  useEffect(() => {
    localStorage.setItem('shayari_current_view', view);
    if (viewingProfile) localStorage.setItem('shayari_last_profile', viewingProfile);
  }, [view, viewingProfile]);

  useEffect(() => {
    document.documentElement.classList.remove('dark'); 
    localStorage.removeItem('theme');
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);

  // --- ONLINE PRESENCE & PROFILE DATA ---
  useEffect(() => {
    if (!currentUser) return;

    const setOnlineStatus = async (status) => {
        try {
            const q = query(collection(db, "users"), where("username", "==", currentUser));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
                const userDocRef = doc(db, "users", snapshot.docs[0].id);
                await updateDoc(userDocRef, { isOnline: status, lastSeen: serverTimestamp() });
            }
        } catch (error) { console.error("Error setting online status:", error); }
    };

    setOnlineStatus(true);

    // ⚡ Fetch Profile Pic (Defaults to null if missing)
    const userDocRef = doc(db, "users", currentUser);
    const unsubUser = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            setUserPhotoURL(data.photoURL || null);
        }
    });

    const handleTabClose = () => setOnlineStatus(false);
    window.addEventListener('beforeunload', handleTabClose);
    return () => {
       window.removeEventListener('beforeunload', handleTabClose);
       setOnlineStatus(false);
       unsubUser();
    };
  }, [currentUser]);

  // --- LISTENERS ---
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

    const qCalls = query(collection(db, "calls"), where("receiver", "==", currentUser), where("status", "==", "ringing"));
    const unsubCalls = onSnapshot(qCalls, (snapshot) => {
        if (!snapshot.empty && !activeCallSession) {
            const callDoc = snapshot.docs[0];
            setIncomingCall({ id: callDoc.id, ...callDoc.data() });
        } else {
            setIncomingCall(null);
        }
    });

    return () => { unsubNotif(); unsubChats(); unsubCalls(); };
  }, [currentUser, activeCallSession]);

  // --- HANDLERS ---
  const handleAcceptCall = async () => {
      if (!incomingCall) return;
      await updateDoc(doc(db, "calls", incomingCall.id), { status: 'connected' });
      setActiveCallSession({ 
          id: incomingCall.id, 
          isCaller: false, 
          type: incomingCall.type 
      });
      setIncomingCall(null);
  };

  const handleDeclineCall = async () => {
      if (!incomingCall) return;
      await updateDoc(doc(db, "calls", incomingCall.id), { status: 'ended' });
      setIncomingCall(null);
  };

  const pushToHistory = () => {
    setHistory(prev => [...prev, { view, viewingProfile, viewingPostId, activeChatId }]);
  };

  const handleBack = () => {
    if (history.length > 0) {
      const lastState = history[history.length - 1];
      setViewingProfile(lastState.viewingProfile);
      setViewingPostId(lastState.viewingPostId);
      setActiveChatId(lastState.activeChatId);
      setView(lastState.view);
      setHistory(prev => prev.slice(0, -1));
    } else {
      setView("home");
    }
  };

  const handleNav = (targetView, profileName = null, chatId = null, postId = null) => {
    if (view === targetView && targetView !== 'profile' && targetView !== 'chat') return;
    setShowNotificationsDesktop(false);
    pushToHistory();
    if (profileName) setViewingProfile(profileName);
    
    if (chatId !== undefined) {
        setActiveChatId(chatId);
    } else if (targetView === 'chat' && chatId === null) {
        setActiveChatId(null); 
    }

    if (postId) setViewingPostId(postId);
    setView(targetView);
    window.scrollTo(0, 0);
  };

  const handleLogin = (username) => {
    setCurrentUser(username);
    localStorage.setItem('shayari_user', username);
    setIsSwitchingAccount(false); // ⚡ Close switch mode on successful login
  };

  const handleLogout = async () => {
    try { await signOut(auth); } catch (e) { console.error(e); }
    try {
        const q = query(collection(db, "users"), where("username", "==", currentUser));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const userDocRef = doc(db, "users", snapshot.docs[0].id);
            await updateDoc(userDocRef, { isOnline: false, lastSeen: serverTimestamp() });
        }
    } catch(e) { console.error(e); }

    localStorage.removeItem('shayari_user'); 
    localStorage.removeItem('shayari_current_view');
    localStorage.removeItem('shayari_last_profile');
    
    setCurrentUser(null);
    setHistory([]);
    setView("home");
  };

  const SidebarItem = ({ icon: Icon, label, isActive, onClick, alert, imgSrc }) => (
    <button onClick={onClick} className={`flex items-center p-3 rounded-xl w-full transition-all duration-300 group/item ${isActive ? 'font-bold' : 'hover:bg-gray-50 font-normal'}`}>
      <div className="relative flex items-center justify-center w-8 h-8 shrink-0">
        {/* ⚡ Updated Logic: Show Image if imgSrc exists OR label is Profile (defaults to favicon) */}
        {label === 'Profile' ? (
            <img 
                src={imgSrc || "/favicon.png"} 
                alt="Profile" 
                className={`w-7 h-7 rounded-full object-cover border transition-transform group-hover/item:scale-110 ${isActive ? 'border-black border-2' : 'border-transparent'}`} 
            />
        ) : (
            <Icon size={26} strokeWidth={isActive ? 2.8 : 2} className={`transition-transform group-hover/item:scale-110 ${isActive ? 'text-black' : 'text-gray-800'}`} />
        )}
        {alert && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>}
      </div>
      <span className={`whitespace-nowrap overflow-hidden opacity-0 w-0 group-hover/sidebar:w-auto group-hover/sidebar:opacity-100 group-hover/sidebar:pl-4 transition-all duration-300 ease-in-out text-base ${isActive ? 'text-black' : 'text-gray-800'}`}>
        {label}
      </span>
    </button>
  );

  // ⚡ Updated Login Render Logic: Shows login if no user OR if switching account
  if (!currentUser || isSwitchingAccount) {
      return (
        <Login 
            onLogin={handleLogin} 
            onBack={isSwitchingAccount ? () => setIsSwitchingAccount(false) : null} 
        />
      );
  }

  const isFullScreenMobile = view === 'chat' && activeChatId;

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans flex flex-col md:flex-row">
      
      {showSettings && <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} currentUser={currentUser} onPostClick={(id) => handleNav('singlePost', null, null, id)} onLogout={handleLogout} />}
      
      {activeCallSession && (
        <VideoCall 
            callId={activeCallSession.id} 
            currentUser={currentUser} 
            isCaller={activeCallSession.isCaller} 
            callType={activeCallSession.type}
            onEndCall={() => setActiveCallSession(null)} 
        />
      )}

      <AnimatePresence>
        {incomingCall && !activeCallSession && (
            <motion.div initial={{ y: -100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -100, opacity: 0 }} className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-white border border-gray-200 shadow-2xl rounded-2xl p-4 w-[350px] flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-lg animate-pulse">{incomingCall.caller[0].toUpperCase()}</div>
                    <div><h3 className="font-bold text-gray-900">{incomingCall.caller}</h3><p className="text-xs text-gray-500">Incoming {incomingCall.type} call...</p></div>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleDeclineCall} className="p-3 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-md transition"><PhoneOff size={20}/></button>
                    <button onClick={handleAcceptCall} className="p-3 bg-green-500 text-white rounded-full hover:bg-green-600 shadow-md transition animate-bounce"><Phone size={20}/></button>
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* --- DESKTOP SIDEBAR --- */}
      <div className="hidden md:flex flex-col h-screen fixed left-0 top-0 z-50 bg-white px-3 py-8 justify-between w-[80px] hover:w-[260px] transition-all duration-300 ease-in-out group/sidebar">
        <div className="space-y-2">
            {/* LOGO */}
            <div className="flex items-center p-3 mb-8 cursor-pointer w-full group/item" onClick={() => handleNav('home')}>
                <div className="relative flex items-center justify-center w-8 h-8 shrink-0">
                    <img src="/logo.png" alt="ShayariGram" className="h-8 w-8 object-contain" />
                </div>
            </div>
            
            <SidebarItem icon={Home} label="Home" isActive={view === 'home'} onClick={() => handleNav('home')} />
            <SidebarItem icon={MessageCircle} label="Messages" isActive={view === 'chat'} onClick={() => handleNav('chat', null, null)} alert={hasUnreadMsg} />
            <SidebarItem icon={Search} label="Search" isActive={view === 'explore'} onClick={() => handleNav('explore')} />
            <SidebarItem icon={Heart} label="Notifications" isActive={showNotificationsDesktop} onClick={() => setShowNotificationsDesktop(!showNotificationsDesktop)} alert={hasUnreadNotif} />
            <SidebarItem icon={PlusSquare} label="Create" isActive={view === 'post'} onClick={() => handleNav('post')} />
            
            {/* ⚡ Profile Item with Default Favicon */}
            <SidebarItem 
                icon={User} 
                label="Profile" 
                isActive={view === 'profile' && viewingProfile === currentUser} 
                onClick={() => handleNav('profile', currentUser)} 
                imgSrc={userPhotoURL || "/favicon.png"} 
            />
        </div>
        
        <div><SidebarItem icon={Menu} label="More" onClick={() => setShowSettings(true)} /></div>
      </div>

      {/* --- 📱 MOBILE TOP HEADER --- */}
      {!isFullScreenMobile && view !== 'chat' && view !== 'post' && view !== 'notifications' && (
        <div className="md:hidden fixed top-0 w-full h-[60px] border-b border-gray-200 bg-white z-40 px-4 shadow-sm grid grid-cols-3 items-center">
            <div className="flex justify-start">
                <img src="/logo.png" alt="ShayariGram" className="h-8 w-auto" />
            </div>
            <div></div>
            <div className="flex items-center justify-end gap-5">
                <button onClick={() => handleNav('notifications')} className="relative">
                    <Heart size={26} className="text-gray-800" />
                    {hasUnreadNotif && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>}
                </button>
                <button onClick={() => handleNav('chat', null, null)} className="relative">
                    <MessageCircle size={26} className="text-gray-800" />
                    {hasUnreadMsg && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">1</span>}
                </button>
            </div>
        </div>
      )}

      <AnimatePresence>
        {showNotificationsDesktop && (
            <motion.div initial={{ x: -400, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -400, opacity: 0 }} className="hidden md:block fixed left-[80px] lg:left-[245px] top-0 h-screen w-[400px] bg-white border-r border-gray-200 z-40 shadow-2xl overflow-hidden rounded-r-3xl">
                <div className="p-6">
                    <h2 className="text-2xl font-bold font-serif mb-6">Notifications</h2>
                    <div className="h-[80vh] overflow-y-auto scrollbar-hide">
                        <Notifications currentUser={currentUser} onPostClick={(id) => handleNav('singlePost', null, null, id)} onProfileClick={(uid) => handleNav('profile', uid)} />
                    </div>
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* --- MAIN CONTENT AREA --- */}
      <div className={`flex-1 md:ml-[80px] lg:ml-[245px] bg-white min-h-screen transition-all duration-300 ${isFullScreenMobile || view === 'post' || view === 'notifications' ? 'pt-0 pb-0' : 'pt-[65px] pb-[65px] md:pt-0 md:pb-0'}`}>
        <div className="w-full h-full flex justify-center"> 
            <AnimatePresence mode="wait">
                {view === "home" && (
                  <motion.div key="home" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition} className="w-full max-w-[600px] py-4 md:py-8 px-2 md:px-0">
                    <Dashboard />
                    <div className="mt-6">
                        <ShayariFeed onProfileClick={(uid) => handleNav('profile', uid)} onPostClick={(id) => handleNav('singlePost', null, null, id)} />
                    </div>
                  </motion.div>
                )}

                {view === "explore" && <motion.div key="explore" initial="initial" animate="in" exit="out" variants={pageVariants} className="md:py-6 px-2 w-full max-w-4xl"><Explore onProfileClick={(uid) => handleNav('profile', uid)} /></motion.div>}
                
                {view === "post" && <motion.div key="post" initial="initial" animate="in" exit="out" variants={pageVariants} className="md:py-10 px-4 w-full max-w-xl flex justify-center"><div className="w-full"><PostShayari username={currentUser} onBack={handleBack} /></div></motion.div>}
                
                {view === "profile" && <motion.div key="profile" initial="initial" animate="in" exit="out" variants={pageVariants} className="md:py-8 px-0 w-full max-w-4xl"><ProfilePage profileUser={viewingProfile} currentUser={currentUser} onBack={handleBack} onPostClick={(id) => handleNav('singlePost', null, null, id)} onNavigateToChat={(chatId) => handleNav('chat', null, chatId)} onProfileClick={(uid) => handleNav('profile', uid)} onLogout={handleLogout} /></motion.div>}
                
                {view === "notifications" && <motion.div key="notifications" initial="initial" animate="in" exit="out" variants={pageVariants} className="md:hidden w-full"><Notifications currentUser={currentUser} onPostClick={(id) => handleNav('singlePost', null, null, id)} onProfileClick={(uid) => handleNav('profile', uid)} onBack={handleBack} /></motion.div>}
                
                {/* ⚡ Pass onSwitchAccount trigger to ChatPage */}
                {view === "chat" && (
                    <motion.div key="chat" initial="initial" animate="in" exit="out" variants={pageVariants} className="h-full w-full md:p-6 max-w-6xl">
                        <ChatPage 
                            currentUser={currentUser} 
                            initialChatId={activeChatId} 
                            onBack={handleBack} 
                            onChatSelect={(id) => setActiveChatId(id)}
                            onCallStart={(callId, type) => setActiveCallSession({ id: callId, isCaller: true, type: type })} 
                            onSwitchAccount={() => setIsSwitchingAccount(true)}
                        />
                    </motion.div>
                )}
                
                {view === "singlePost" && <motion.div key="singlePost" initial="initial" animate="in" exit="out" variants={pageVariants} className="md:py-10 px-4 w-full max-w-xl flex justify-center"><div className="w-full"><SinglePostView postId={viewingPostId} onBack={handleBack} onProfileClick={(uid) => handleNav('profile', uid)} /></div></motion.div>}
            </AnimatePresence>
        </div>
      </div>

      {/* --- MOBILE BOTTOM NAV --- */}
      {!isFullScreenMobile && (
        <div className="md:hidden fixed bottom-0 w-full h-[60px] border-t border-gray-200 bg-white z-40 flex justify-around items-center pb-safe">
          <NavButton icon={Home} isActive={view === 'home'} onClick={() => handleNav("home")} />
          <NavButton icon={Search} isActive={view === 'explore'} onClick={() => handleNav("explore")} />
          <NavButton icon={PlusSquare} isActive={view === 'post'} onClick={() => handleNav("post")} />
          
          <button onClick={() => handleNav("profile", currentUser)} className={`rounded-full p-0.5 border-2 ${view === 'profile' && viewingProfile === currentUser ? 'border-black' : 'border-transparent'}`}>
             {/* ⚡ Mobile Fallback to Favicon */}
             <img 
                src={userPhotoURL || "/favicon.png"} 
                alt="Profile" 
                className="w-7 h-7 rounded-full object-cover border border-gray-200" 
             />
          </button>
        </div>
      )}

      {/* --- DESKTOP FLOATING MSG BTN --- */}
      {!isFullScreenMobile && view !== 'chat' && (
        <div className="hidden md:flex fixed bottom-10 right-10 z-[60]">
            <button onClick={() => handleNav('chat', null, null)} className="flex items-center gap-3 bg-white text-black px-6 py-3.5 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 hover:shadow-xl hover:scale-105 transition duration-300 group">
                <div className="relative"><Send size={22} strokeWidth={2} className="group-hover:text-blue-600 transition-colors"/></div><span className="font-bold text-base tracking-wide">Messages</span>
            </button>
        </div>
      )}
    </div>
  );
}

const NavButton = ({ icon: Icon, isActive, onClick }) => (
  <button onClick={onClick} className={`p-2 transition-transform ${isActive ? 'scale-110' : ''}`}>
    <Icon size={26} strokeWidth={isActive ? 2.8 : 2} className={isActive ? 'text-black' : 'text-gray-500'} />
  </button>
);

export default App;