import { useState, useEffect } from 'react';
import { Home, PlusSquare, Search, User, Bell, LogOut, MessageCircle } from 'lucide-react'; 
import { db, auth } from './firebase'; 
import { collection, query, where, onSnapshot } from 'firebase/firestore'; 
import { signOut } from 'firebase/auth';
import { motion, AnimatePresence } from 'framer-motion'; 

// Import Components
import Dashboard from './components/Dashboard';
import ShayariFeed from './components/ShayariFeed';
import PostShayari from './components/PostShayari';
import Explore from './components/Explore';
import Login from './components/Login';
import ProfilePage from './components/ProfilePage';
import Notifications from './components/Notifications'; // <--- IMPORTED NOTIFICATIONS
import SinglePostView from './components/SinglePostView'; 
import SettingsModal from './components/SettingsModal';
import ChatPage from './components/ChatPage'; 

// --- ANIMATION VARIANTS ---
const pageVariants = {
  initial: { opacity: 0, y: 10, scale: 0.99 },
  in: { opacity: 1, y: 0, scale: 1 },
  out: { opacity: 0, y: -10, scale: 0.99 }
};

const pageTransition = {
  type: "tween",
  ease: "easeInOut",
  duration: 0.3
};

function App() {
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('shayari_user') || null);
  const [view, setView] = useState(localStorage.getItem('shayari_current_view') || "home");
  
  // Navigation State
  const [viewingProfile, setViewingProfile] = useState(localStorage.getItem('shayari_last_profile') || null); 
  const [viewingPostId, setViewingPostId] = useState(null);
  const [activeChatId, setActiveChatId] = useState(null); 
  
  // History Stack
  const [history, setHistory] = useState([]);
  const [hasUnread, setHasUnread] = useState(false);

  // Settings Modal State
  const [showSettings, setShowSettings] = useState(false);

  // --- PERSISTENCE ---
  useEffect(() => {
    localStorage.setItem('shayari_current_view', view);
    if (viewingProfile) localStorage.setItem('shayari_last_profile', viewingProfile);
  }, [view, viewingProfile]);

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  // --- NOTIFICATIONS CHECKER ---
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, "notifications"),
      where("toUser", "==", currentUser),
      where("read", "==", false) 
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHasUnread(!snapshot.empty);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // --- HANDLERS ---
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

  const handleOpenProfile = (username) => {
    if (view === 'profile' && viewingProfile === username) return; 
    pushToHistory(); 
    setViewingProfile(username);
    setView("profile");
    window.scrollTo(0, 0);
  };

  const handleOpenPost = (postId) => {
    pushToHistory(); 
    setViewingPostId(postId);
    setView("singlePost");
    window.scrollTo(0, 0);
  };

  const handleOpenChat = (chatId = null) => {
    pushToHistory();
    setActiveChatId(chatId);
    setView("chat");
    window.scrollTo(0, 0);
  };

  // --- NEW: HANDLE OPEN NOTIFICATIONS ---
  const handleOpenNotifications = () => {
    if (view === 'notifications') return;
    pushToHistory();
    setView("notifications");
    window.scrollTo(0, 0);
  };

  const handleTabChange = (newView) => {
    if (view === newView) return;
    setHistory([]); 
    setView(newView);
    window.scrollTo(0, 0);
  };

  const handleLogin = (username) => {
    setCurrentUser(username);
    localStorage.setItem('shayari_user', username);
  };

  const handleLogout = async () => {
    if (window.confirm("Log out?")) {
      try { await signOut(auth); } catch (e) { console.error(e); }
      localStorage.clear(); 
      setCurrentUser(null);
      setHistory([]);
      setView("home");
    }
  };

  if (!currentUser) return <Login onLogin={handleLogin} />;

  return (
    <div className="min-h-screen bg-gray-50/50 font-sans text-gray-900 relative overflow-x-hidden">
      
      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal 
          isOpen={showSettings} 
          onClose={() => setShowSettings(false)} 
          currentUser={currentUser}
          onPostClick={handleOpenPost}
        />
      )}

      {/* BACKGROUND SHAPES */}
      <div className="fixed inset-0 w-full h-full -z-10 pointer-events-none overflow-hidden">
        <motion.div 
          animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-0 -left-10 w-72 h-72 md:w-96 md:h-96 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50"
        ></motion.div>
        <motion.div 
          animate={{ scale: [1, 1.2, 1], x: [0, 20, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute top-0 -right-10 w-72 h-72 md:w-96 md:h-96 bg-yellow-200 rounded-full mix-blend-multiply filter blur-3xl opacity-50"
        ></motion.div>
        <motion.div 
           animate={{ scale: [1, 1.1, 1], y: [0, -20, 0] }}
           transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute -bottom-10 left-10 w-72 h-72 md:w-96 md:h-96 bg-pink-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50"
        ></motion.div>
      </div>

      {/* --- HEADER (FULL WIDTH) --- */}
      {view !== 'singlePost' && view !== 'chat' && (
        <motion.div 
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100 shadow-sm transition-all"
        >
          {/* Main Navbar Container */}
          <div className="w-full px-6 md:px-10 py-2 flex justify-between items-center">
            
            {/* 1. Left: Logo Image Only */}
            <div className="flex items-center cursor-pointer" onClick={() => handleTabChange('home')}>
                <motion.img 
                  whileHover={{ scale: 1.05 }}
                  src="/logo.png" 
                  alt="Logo" 
                  className="h-16 md:h-20 w-auto object-contain drop-shadow-sm" 
                />
            </div>
            
            {/* 2. Center: Desktop Navigation */}
            <div className="hidden md:flex items-center gap-6">
               <DesktopNavLink icon={Home} label="Home" isActive={view === 'home'} onClick={() => handleTabChange("home")} />
               <DesktopNavLink icon={Search} label="Explore" isActive={view === 'explore'} onClick={() => handleTabChange("explore")} />
               <DesktopNavLink icon={PlusSquare} label="Create" isActive={view === 'post'} onClick={() => handleTabChange("post")} />
               <DesktopNavLink icon={MessageCircle} label="Messages" isActive={view === 'chat'} onClick={() => handleOpenChat(null)} />
            </div>

            {/* 3. Right: Bell, Avatar, Logout */}
            <div className="flex gap-4 items-center">
              
              {/* Mobile Message Icon */}
              <motion.button 
                whileTap={{ scale: 0.9 }}
                onClick={() => handleOpenChat(null)}
                className="md:hidden p-2.5 rounded-full hover:bg-gray-100 text-gray-600"
              >
                 <MessageCircle size={22} />
              </motion.button>

              {/* Notification Bell (NOW OPENS NOTIFICATIONS PAGE) */}
              <motion.button 
                whileTap={{ scale: 0.9 }}
                onClick={handleOpenNotifications} 
                className={`p-2.5 rounded-full transition relative hover:bg-gray-100 ${view === 'notifications' ? 'bg-gray-100 text-black' : 'text-gray-600'} border border-transparent hover:border-gray-200`}
              >
                <Bell size={22} />
                {hasUnread && <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 rounded-full border border-white animate-pulse"></span>}
              </motion.button>

              {/* Profile Avatar */}
              <motion.button 
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => handleOpenProfile(currentUser)}
                className="relative"
              >
                <div className="w-9 h-9 bg-gradient-to-tr from-indigo-500 to-pink-500 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md">
                  {currentUser[0].toUpperCase()}
                </div>
              </motion.button>
              
              {/* Logout Button */}
              <button onClick={handleLogout} className="hidden md:block text-gray-400 hover:text-red-500 transition p-2 hover:bg-red-50 rounded-full">
                  <LogOut size={22} />
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* --- MAIN CONTENT CONTAINER --- */}
      <div 
        className={`mx-auto pt-24 md:pb-8 min-h-screen relative z-0 transition-all duration-300 ease-in-out
          ${(view === 'explore' || view === 'profile' || view === 'chat' || view === 'notifications') 
            ? 'w-full px-2 md:px-6' 
            : 'w-full max-w-lg md:max-w-2xl lg:max-w-4xl px-4'
          }`}
      > 
        <AnimatePresence mode="wait">
            
            {view === "home" && (
              <motion.div key="home" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition} className="space-y-6 pt-6">
                <Dashboard />
                <div className="flex gap-6">
                    <div className="flex-1"><ShayariFeed onProfileClick={handleOpenProfile} /></div>
                    <div className="hidden lg:block w-80 shrink-0">
                        <div className="sticky top-28 bg-white/50 backdrop-blur-sm p-4 rounded-3xl border border-white/50 shadow-sm">
                            <h3 className="font-bold text-gray-500 text-xs uppercase tracking-wider mb-4">Suggested for you</h3>
                            <p className="text-sm text-gray-400 italic">Coming soon...</p>
                        </div>
                    </div>
                </div>
              </motion.div>
            )}

            {view === "explore" && (
              <motion.div key="explore" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition} className="pt-6">
                <Explore onProfileClick={handleOpenProfile} />
              </motion.div>
            )}

            {view === "post" && (
              <motion.div key="post" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition} className="pt-8 max-w-2xl mx-auto">
                <h2 className="text-2xl md:text-3xl font-bold font-serif mb-6 text-gray-800 md:block hidden text-center">Create New Post</h2>
                <PostShayari username={currentUser} />
              </motion.div>
            )}

            {view === "profile" && (
              <motion.div key="profile" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition} className="pt-0 md:pt-4">
                <ProfilePage 
                  profileUser={viewingProfile} 
                  currentUser={currentUser} 
                  onBack={handleBack} 
                  onLogout={handleLogout}
                  onPostClick={handleOpenPost}
                  onNavigateToChat={handleOpenChat} 
                  onProfileClick={handleOpenProfile}
                />
              </motion.div>
            )}

            {/* --- NOTIFICATIONS VIEW --- */}
            {view === "notifications" && (
              <motion.div key="notifications" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition} className="pt-0 md:pt-4">
                  <Notifications 
                    currentUser={currentUser} 
                    onPostClick={handleOpenPost}
                    onProfileClick={handleOpenProfile} 
                  />
              </motion.div>
            )}

            {view === "chat" && (
              <motion.div key="chat" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition} className="pt-0 md:pt-2 h-full">
                  <ChatPage 
                    currentUser={currentUser} 
                    initialChatId={activeChatId} 
                    onBack={handleBack} 
                  />
              </motion.div>
            )}

            {view === "singlePost" && (
              <motion.div key="singlePost" initial="initial" animate="in" exit="out" variants={pageVariants} transition={pageTransition} className="pt-6 max-w-2xl mx-auto">
                  <SinglePostView postId={viewingPostId} onBack={handleBack} onProfileClick={handleOpenProfile} />
              </motion.div>
            )}
        </AnimatePresence>
      </div>

      {/* MOBILE BOTTOM NAV */}
      <motion.div 
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 100 }}
        className="md:hidden fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-xl border-t border-gray-200 py-3 pb-safe z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]"
      >
        <div className="flex justify-around items-center max-w-md mx-auto">
          <NavButton icon={Home} label="Home" isActive={view === 'home'} onClick={() => handleTabChange("home")} />
          <NavButton icon={Search} label="Explore" isActive={view === 'explore'} onClick={() => handleTabChange("explore")} />
          <NavButton icon={PlusSquare} label="Post" isActive={view === 'post'} onClick={() => handleTabChange("post")} />
          <NavButton icon={User} label="Profile" isActive={view === 'profile' && viewingProfile === currentUser} onClick={() => handleOpenProfile(currentUser)} />
        </div>
      </motion.div>
    </div>
  );
}

// --- SUB-COMPONENTS ---
const NavButton = ({ icon: Icon, label, isActive, onClick }) => (
  <motion.button whileTap={{ scale: 0.8 }} onClick={onClick} className={`flex flex-col items-center gap-1 transition-all duration-300 ${isActive ? 'text-black scale-110' : 'text-gray-400 hover:text-gray-600'}`}>
    <Icon size={26} strokeWidth={isActive ? 2.5 : 2} />
  </motion.button>
);

const DesktopNavLink = ({ icon: Icon, label, isActive, onClick }) => (
    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={onClick} className={`flex items-center gap-2 px-5 py-2.5 rounded-full transition-all duration-300 font-medium text-sm lg:text-base ${isActive ? 'bg-black text-white shadow-lg shadow-black/20' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}>
      <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
      {label}
    </motion.button>
);

export default App;