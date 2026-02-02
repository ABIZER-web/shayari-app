import { useState, useEffect, useCallback } from 'react';
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

// --- COMPONENT IMPORTS ---
import MobileTopHeader from './components/MobileTopHeader';
import MobileBottomNav from './components/MobileBottomNav';
import DesktopSidebar from './components/DesktopSidebar';
import MenuDrawer from './components/MenuDrawer';
import NotificationsDrawer from './components/NotificationsDrawer';

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
  
  const [allHiddenUsers, setAllHiddenUsers] = useState([]); 
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
  const saveViewState = useCallback(() => {
    localStorage.setItem('saved_view', view);
    if (viewingProfile) localStorage.setItem('saved_profile', viewingProfile); 
    else localStorage.removeItem('saved_profile');
    
    if (activeChatId) localStorage.setItem('saved_chat_id', activeChatId); 
    else localStorage.removeItem('saved_chat_id');
    
    if (viewingPostId) localStorage.setItem('saved_post_id', viewingPostId); 
    else localStorage.removeItem('saved_post_id');
  }, [view, viewingProfile, activeChatId, viewingPostId]);

  useEffect(() => {
    saveViewState();
  }, [saveViewState]);

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
            await updateDoc(docRef, { 
              isOnline: true, 
              lastSeen: serverTimestamp() 
            });
        }
    };
    setOnline();

    const unsubUser = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            setUserPhotoURL(data.photoURL || null);
            setIsPrivateAccount(data.isPrivate || false);
            
            const blockedByMe = data.blocked || [];
            const blockedByOthers = data.blockedBy || [];
            
            setMyDirectBlocks(blockedByMe);
            setAllHiddenUsers([...new Set([...blockedByMe, ...blockedByOthers])]);
        }
    });

    return () => unsubUser();
  }, [currentUser]);

  // --- NOTIFICATIONS & MESSAGES ---
  useEffect(() => {
    if (!currentUser) return;
    
    const qNotif = query(
      collection(db, "notifications"), 
      where("toUser", "==", currentUser), 
      where("read", "==", false)
    );
    
    const unsubNotif = onSnapshot(qNotif, (snap) => {
      setHasUnreadNotif(!snap.empty);
    });
    
    const qChats = query(
      collection(db, "chats"), 
      where("participants", "array-contains", currentUser)
    );
    
    const unsubChats = onSnapshot(qChats, (snapshot) => {
      let unreadFound = false;
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.isRead === false && data.lastMessageSender !== currentUser) {
          unreadFound = true;
        }
      });
      setHasUnreadMsg(unreadFound);
    });
    
    return () => { 
      unsubNotif(); 
      unsubChats(); 
    };
  }, [currentUser]);

  const handleNav = useCallback((targetView, profileName = null, chatId = null, postId = null, postData = null) => {
    setShowNotificationsDesktop(false);
    setShowMenuDrawer(false); 
    setMenuStep('main'); 
    
    if (profileName) setViewingProfile(profileName);
    
    if (chatId !== undefined) {
      setActiveChatId(chatId);
    } else if (targetView === 'chat' && chatId === null) {
      setActiveChatId(null);
    }
    
    if (postId) setViewingPostId(postId);
    
    if (targetView === 'edit' && postData) {
      setEditPostData(postData);
    } else if (targetView === 'post') {
      setEditPostData(null);
    } 
    
    setView(targetView);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.clear();
      setCurrentUser(null);
      setView("home");
      setShowMenuDrawer(false);
      setShowNotificationsDesktop(false);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const fetchActivity = useCallback(async (type) => {
    setLoadingActivity(true);
    setActivityTab(type);
    // Implementation for fetching activity data
    setLoadingActivity(false);
  }, []);

  const fetchBlockList = useCallback(async () => {
    if (!currentUser || !myDirectBlocks.length) {
      setBlockedListDetails([]);
      return;
    }
    
    setLoadingBlockList(true);
    // Implementation for fetching blocked users details
    setLoadingBlockList(false);
  }, [currentUser, myDirectBlocks]);

  if (!currentUser) {
    return <Login onLogin={(user) => setCurrentUser(user)} />;
  }

  // Check if we're in full-screen chat mode
  const isFullScreenChat = view === 'chat' && activeChatId;

  return (
    <div className="flex h-screen bg-[#222831] text-[#eeeeee] font-sans overflow-hidden relative">
      {/* 🔥 MOBILE TOP HEADER - Only show when NOT in full-screen chat */}
      {!isFullScreenChat && (
        <MobileTopHeader
          view={view}
          isFullScreenMobile={isFullScreenChat}
          hasUnreadNotif={hasUnreadNotif}
          showNotificationsDesktop={showNotificationsDesktop}
          onPostClick={() => handleNav('post')}
          onNotificationsClick={() => {
            setShowNotificationsDesktop(true);
            setShowMenuDrawer(false);
          }}
        />
      )}

      {/* DESKTOP SIDEBAR */}
      <DesktopSidebar
        view={view}
        currentUser={currentUser}
        userPhotoURL={userPhotoURL}
        viewingProfile={viewingProfile}
        hasUnreadMsg={hasUnreadMsg}
        hasUnreadNotif={hasUnreadNotif}
        showNotificationsDesktop={showNotificationsDesktop}
        showMenuDrawer={showMenuDrawer}
        onNav={handleNav}
        onNotificationsClick={() => {
          setShowNotificationsDesktop(!showNotificationsDesktop);
          setShowMenuDrawer(false);
        }}
        onMenuClick={() => {
          setShowMenuDrawer(!showMenuDrawer);
          setShowNotificationsDesktop(false);
        }}
      />

      {/* 🔥 MOBILE BOTTOM NAVIGATION - Only show when NOT in full-screen chat */}
      {!isFullScreenChat && (
        <MobileBottomNav
          view={view}
          userPhotoURL={userPhotoURL}
          viewingProfile={viewingProfile}
          currentUser={currentUser}
          hasUnreadMsg={hasUnreadMsg}
          showMenuDrawer={showMenuDrawer}
          onHomeClick={() => handleNav("home")}
          onChatClick={() => handleNav("chat")}
          onExploreClick={() => handleNav("explore")}
          onProfileClick={() => handleNav("profile", currentUser)}
          onMenuClick={() => setShowMenuDrawer(true)}
        />
      )}

      {/* MAIN CONTENT AREA */}
      <main className={`flex-1 h-full overflow-y-auto relative bg-[#222831] ${isFullScreenChat ? 'p-0' : 'pt-[60px] pb-[65px] md:pt-0 md:pb-0'}`}>
        <div className="w-full min-h-full flex justify-center"> 
          <AnimatePresence mode="wait">
            {view === "home" && (
              <motion.div 
                key="home" 
                initial="initial" 
                animate="in" 
                exit="out" 
                variants={pageVariants} 
                transition={pageTransition} 
                className="w-full max-w-[600px] py-4 md:py-8 px-2 md:px-0"
              >
                <Dashboard />
                <div className="mt-6">
                  <ShayariFeed 
                    blockedUsers={allHiddenUsers} 
                    onProfileClick={(uid) => handleNav('profile', uid)} 
                    onPostClick={(id) => handleNav('singlePost', null, null, id)} 
                    onEditClick={(post) => handleNav('edit', null, null, null, post)} 
                  />
                </div>
              </motion.div>
            )}
            
            {view === "explore" && (
              <motion.div 
                key="explore" 
                variants={pageVariants} 
                className="md:py-6 px-2 w-full max-w-4xl"
              >
                <Explore 
                  blockedUsers={allHiddenUsers} 
                  onProfileClick={(uid) => handleNav('profile', uid)} 
                  onPostClick={(id) => handleNav('singlePost', null, null, id)} 
                />
              </motion.div>
            )}
            
            {view === "post" && (
              <motion.div 
                key="post" 
                variants={pageVariants} 
                className="md:py-10 px-4 w-full max-w-xl flex justify-center"
              >
                <div className="w-full">
                  <PostShayari 
                    username={currentUser} 
                    onBack={() => handleNav('home')} 
                  />
                </div>
              </motion.div>
            )}
            
            {view === "edit" && (
              <motion.div 
                key="edit" 
                variants={pageVariants} 
                className="md:py-10 px-4 w-full max-w-xl flex justify-center"
              >
                <div className="w-full">
                  <PostShayari 
                    username={currentUser} 
                    onBack={() => handleNav('home')} 
                    editData={editPostData} 
                  />
                </div>
              </motion.div>
            )}
            
            {view === "profile" && (
              <motion.div 
                key="profile" 
                variants={pageVariants} 
                className="md:py-8 px-0 w-full max-w-4xl"
              >
                <ProfilePage 
                  profileUser={viewingProfile} 
                  currentUser={currentUser} 
                  onPostClick={(id) => handleNav('singlePost', null, null, id)} 
                  onLogout={handleLogout} 
                  onBlockSuccess={() => handleNav('explore')} 
                />
              </motion.div>
            )}
            
            {view === "notifications" && (
              <motion.div 
                key="notifications" 
                variants={pageVariants} 
                className="md:hidden w-full"
              >
                <Notifications 
                  currentUser={currentUser} 
                  onPostClick={(id) => handleNav('singlePost', null, null, id)} 
                />
              </motion.div>
            )}
            
            {view === "chat" && (
              <motion.div 
                key="chat" 
                variants={pageVariants} 
                className="h-full w-full md:p-6 max-w-6xl"
              >
                <ChatPage 
                  blockedUsers={allHiddenUsers} 
                  currentUser={currentUser} 
                  initialChatId={activeChatId} 
                  onBack={() => handleNav('home')} 
                  onChatSelect={(id) => setActiveChatId(id)} 
                  onPostClick={(id) => handleNav('singlePost', null, null, id)} 
                />
              </motion.div>
            )}
            
            {view === "singlePost" && (
              <motion.div 
                key="singlePost" 
                variants={pageVariants} 
                className="md:py-10 px-4 w-full max-w-xl flex justify-center"
              >
                <div className="w-full">
                  <SinglePostView 
                    postId={viewingPostId} 
                    onBack={() => handleNav('home')} 
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* DRAWERS & MODALS */}
      <AnimatePresence>
        {showMenuDrawer && (
          <MenuDrawer
            menuStep={menuStep}
            onClose={() => setShowMenuDrawer(false)}
            onBack={() => setMenuStep('main')}
            onActivityClick={() => {
              fetchActivity('likes');
              setMenuStep('activity');
            }}
            onLogout={handleLogout}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNotificationsDesktop && (
          <NotificationsDrawer
            currentUser={currentUser}
            onClose={() => setShowNotificationsDesktop(false)}
            onPostClick={(id) => handleNav('singlePost', null, null, id)}
            onProfileClick={(uid) => handleNav('profile', uid)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;