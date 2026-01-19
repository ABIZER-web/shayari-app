// File: src/components/SettingsModal.jsx
import { useState, useEffect } from 'react';
import { 
  X, Lock, Activity, Heart, Image as ImageIcon, ExternalLink, 
  Loader2, Mail, ShieldAlert, ChevronRight, Settings, Bookmark, 
  MessageSquare, Repeat, LogOut, ArrowLeft, Eye, EyeOff 
} from 'lucide-react';
import { db, auth } from '../firebase'; 
import { collection, query, where, getDocs, doc, getDoc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { sendPasswordResetEmail, deleteUser, signOut } from 'firebase/auth'; 
import { isAdmin } from '../adminConfig'; 

const SettingsModal = ({ isOpen, onClose, currentUser, onPostClick }) => {
  const [currentView, setCurrentView] = useState('menu');
  const [likedPosts, setLikedPosts] = useState([]);
  const [savedPosts, setSavedPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [allowUserDelete, setAllowUserDelete] = useState(true);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  
  const isSystemAdmin = isAdmin(currentUser);

  useEffect(() => {
    if (isOpen) {
        setCurrentView('menu'); 
        setResetMessage("");
        fetchGlobalSettings();
        fetchUserSettings();
    }
  }, [isOpen, currentUser]);

  const fetchUserSettings = async () => {
      const userRef = doc(db, "users", currentUser);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
          setIsPrivate(snap.data().isPrivate || false);
      }
  };

  const handleTogglePrivacy = async () => {
      const newState = !isPrivate;
      setIsPrivate(newState);
      try {
          await updateDoc(doc(db, "users", currentUser), { isPrivate: newState });
      } catch (err) {
          console.error("Error updating privacy:", err);
          setIsPrivate(!newState);
      }
  };

  const fetchGlobalSettings = async () => {
    const docRef = doc(db, "app_settings", "config");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        setAllowUserDelete(docSnap.data().allowUserDelete);
    } else {
        await setDoc(docRef, { allowUserDelete: true });
    }
  };

  const fetchLikedPosts = async () => {
    setLoading(true);
    try {
        const q = query(collection(db, "notifications"), where("fromUser", "==", currentUser), where("type", "==", "like"));
        const snapshot = await getDocs(q);
        const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const uniquePostsMap = new Map();
        history.forEach(item => { if(item.postId) uniquePostsMap.set(item.postId, item); });
        const uniquePosts = Array.from(uniquePostsMap.values());
        uniquePosts.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        setLikedPosts(uniquePosts);
    } catch (error) { console.error(error); }
    setLoading(false);
  };

  const fetchSavedPosts = () => {
      const SAVE_STORAGE_KEY = `saved_posts_${currentUser}`;
      const localSaved = JSON.parse(localStorage.getItem(SAVE_STORAGE_KEY) || '[]');
      setSavedPosts(localSaved);
  };

  const handlePasswordReset = async () => {
    if (!auth.currentUser || !auth.currentUser.email) {
        setResetMessage("Error: No email linked.");
        return;
    }
    try {
        await sendPasswordResetEmail(auth, auth.currentUser.email);
        setResetMessage(`Link sent to ${auth.currentUser.email}. Please check your spam folder.`);
    } catch (error) {
        setResetMessage("Error sending email.");
    }
  };

  const toggleDeletePermission = async () => {
    const newValue = !allowUserDelete;
    setAllowUserDelete(newValue);
    await setDoc(doc(db, "app_settings", "config"), { allowUserDelete: newValue }, { merge: true });
  };

  const handleDeleteMyAccount = async () => {
    if (!window.confirm("Permanent Action: Are you sure you want to delete your account?")) return;
    setLoadingDelete(true);
    try {
        await deleteDoc(doc(db, "users", currentUser));
        if (auth.currentUser) await deleteUser(auth.currentUser);
        window.location.reload(); 
    } catch (err) {
        alert("Please logout and login again to verify identity before deleting.");
    } finally { setLoadingDelete(false); }
  };

  const handleLogout = async () => {
      if(window.confirm("Log out?")) {
          await signOut(auth);
          window.location.reload();
      }
  };

  const MenuItem = ({ icon: Icon, label, onClick, isDestructive = false }) => (
      <button onClick={onClick} className={`w-full flex items-center justify-between p-4 hover:bg-gray-50 transition border-b border-gray-50 last:border-0 ${isDestructive ? 'text-red-500' : 'text-gray-800'}`}>
          <div className="flex items-center gap-4"><Icon size={22} strokeWidth={1.5} /><span className="text-[15px] font-medium">{label}</span></div>
          {!isDestructive && <ChevronRight size={18} className="text-gray-400" />}
      </button>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in text-left">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden relative z-10 flex flex-col h-[600px] max-h-[85vh]">
        
        {/* --- HEADER --- */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center bg-white sticky top-0 z-20">
            {currentView !== 'menu' && (<button onClick={() => setCurrentView('menu')} className="mr-3 p-1 rounded-full hover:bg-gray-100 transition"><ArrowLeft size={22} className="text-gray-800" /></button>)}
            <h2 className="text-lg font-bold font-serif text-gray-800 flex-1 text-center pr-8">
                {currentView === 'menu' ? 'Settings' : currentView === 'security' ? 'Security' : currentView === 'activity' ? 'Your Activity' : 'Saved'}
            </h2>
            {currentView === 'menu' && (<button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100"><X size={22} className="text-gray-800" /></button>)}
        </div>

        {/* --- CONTENT --- */}
        <div className="flex-1 overflow-y-auto bg-white">
            
            {currentView === 'menu' && (
                <div className="flex flex-col">
                    <div className="py-2">
                        <MenuItem icon={Settings} label="Settings & Security" onClick={() => setCurrentView('security')} />
                        <MenuItem icon={Activity} label="Your Activity" onClick={() => { fetchLikedPosts(); setCurrentView('activity'); }} />
                        <MenuItem icon={Bookmark} label="Saved" onClick={() => { fetchSavedPosts(); setCurrentView('saved'); }} />
                        <MenuItem icon={MessageSquare} label="Report a problem" onClick={() => alert("Reporting coming soon!")} />
                    </div>
                    <div className="h-2 bg-gray-50 border-t border-b border-gray-100"></div>
                    <div className="py-2">
                        <MenuItem icon={Repeat} label="Switch accounts" onClick={() => alert("Multi-account support coming soon!")} />
                        <MenuItem icon={LogOut} label="Log out" isDestructive onClick={handleLogout} />
                    </div>
                </div>
            )}

            {currentView === 'security' && (
                <div className="p-6 space-y-6">
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${isPrivate ? 'bg-black text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>{isPrivate ? <Lock size={20} /> : <Eye size={20} />}</div>
                            <div><h3 className="font-bold text-gray-900 text-sm">Private Account</h3><p className="text-xs text-gray-500">Only followers can see your photos.</p></div>
                        </div>
                        <button onClick={handleTogglePrivacy} className={`w-11 h-6 rounded-full p-1 transition-colors duration-300 ${isPrivate ? 'bg-black' : 'bg-gray-300'}`}><div className={`w-4 h-4 bg-white rounded-full shadow transition-transform duration-300 ${isPrivate ? 'translate-x-5' : 'translate-x-0'}`} /></button>
                    </div>
                    {/* Security Reset */}
                    <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 text-center">
                        <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3"><Lock size={24} /></div>
                        <h3 className="font-bold text-gray-900 mb-1">Login Security</h3>
                        <p className="text-sm text-gray-500 mb-4">{auth.currentUser?.email}</p>
                        <button onClick={handlePasswordReset} className="w-full py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold hover:bg-gray-50 transition">Reset Password</button>
                        {resetMessage && <p className="text-xs text-green-600 mt-2 font-medium">{resetMessage}</p>}
                    </div>
                    {isSystemAdmin && (
                        <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                            <span className="text-sm font-bold text-indigo-900">Admin: Allow Deletion</span>
                            <button onClick={toggleDeletePermission} className={`w-10 h-6 rounded-full p-1 transition-colors ${allowUserDelete ? 'bg-green-500' : 'bg-gray-300'}`}><div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${allowUserDelete ? 'translate-x-4' : ''}`} /></button>
                        </div>
                    )}
                    <div className="pt-4 border-t border-gray-100 text-center">
                        {allowUserDelete || isSystemAdmin ? (
                            <button onClick={handleDeleteMyAccount} disabled={loadingDelete} className="text-red-500 text-sm font-bold flex items-center justify-center gap-2 w-full py-3 hover:bg-red-50 rounded-xl transition"><ShieldAlert size={18} /> Delete Account</button>
                        ) : <p className="text-xs text-gray-400">Account deletion disabled by admin.</p>}
                    </div>
                </div>
            )}

            {currentView === 'activity' && (
                <div className="p-4">
                    {loading ? <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-gray-400"/></div> : likedPosts.length > 0 ? (
                        <div className="grid grid-cols-1 gap-2">
                            {likedPosts.map((post) => (
                                <div key={post.id} onClick={() => { onClose(); if(onPostClick) onPostClick(post.postId); }} className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition">
                                    <div className="w-10 h-10 bg-white rounded-lg overflow-hidden shrink-0 border border-gray-200 flex items-center justify-center">{post.image ? <img src={post.image} className="w-full h-full object-cover"/> : <ImageIcon size={16} className="text-gray-300"/>}</div>
                                    <div className="flex-1 min-w-0"><p className="text-xs font-bold text-gray-900">@{post.toUser}</p><p className="text-xs text-gray-500 truncate">{post.contentSnippet || "Liked post"}</p></div>
                                    <Heart size={14} className="text-red-500 fill-red-500"/>
                                </div>
                            ))}
                        </div>
                    ) : <div className="text-center py-20 text-gray-400"><Activity size={40} className="mx-auto mb-2 opacity-20"/><p className="text-sm">No recent activity.</p></div>}
                </div>
            )}

            {currentView === 'saved' && (
                <div className="p-4">
                    {savedPosts.length > 0 ? (
                        <div className="grid grid-cols-3 gap-2">
                            {savedPosts.map((post) => (
                                <div key={post.id} onClick={() => { onClose(); if(onPostClick) onPostClick(post.id); }} className="aspect-square bg-gray-100 rounded-lg overflow-hidden relative cursor-pointer border border-gray-200 hover:opacity-90 transition">
                                    {post.image ? <img src={post.image} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-[8px] p-1 text-center text-gray-500">{post.content?.slice(0,20)}...</div>}
                                </div>
                            ))}
                        </div>
                    ) : <div className="text-center py-20 text-gray-400"><Bookmark size={40} className="mx-auto mb-2 opacity-20"/><p className="text-sm">No saved posts.</p></div>}
                </div>
            )}

        </div>
      </div>
    </div>
  );
};

export default SettingsModal;