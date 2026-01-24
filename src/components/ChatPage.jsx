import React, { useState, useEffect, useRef } from 'react';
import { db, storage, auth } from '../firebase'; 
import { signInWithEmailAndPassword } from 'firebase/auth'; 
import { 
    collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, 
    doc, getDoc, setDoc, updateDoc, getDocs, limit, deleteDoc 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
    ArrowLeft, Edit, MessageCircle, X, Info, 
    Image as ImageIcon, Mic, Trash2, Copy, Forward, StopCircle, Download, Reply, ChevronDown, LogIn, AlertCircle, ExternalLink, Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ⚡ SHARED POST BUBBLE
const SharedPostBubble = ({ postId, onPostClick }) => {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if(!postId) return;
    const unsub = onSnapshot(doc(db, "shayaris", postId), (docSnap) => {
      if (docSnap.exists()) setPost(docSnap.data());
      else setPost(null);
      setLoading(false);
    });
    return unsub;
  }, [postId]);

  if (loading) return <div className="w-48 h-32 bg-gray-100 rounded-2xl animate-pulse" />;
  
  if (!post) return (
    <div className="w-48 h-24 bg-gray-50 rounded-2xl flex flex-col items-center justify-center text-gray-400 p-2 border border-gray-200">
        <AlertCircle size={16} className="mb-1"/>
        <span className="text-[10px]">Post unavailable</span>
    </div>
  );

  const finalBg = post.bgColor || (post.background && (post.background.startsWith('#') || post.background.includes('gradient')) ? post.background : '#ffffff');
  const finalText = post.textColor || '#000000';

  return (
    <div 
        onClick={(e) => { 
            e.stopPropagation(); 
            if (onPostClick) onPostClick(postId); 
        }} 
        className="w-52 rounded-xl shadow-sm overflow-hidden cursor-pointer hover:opacity-95 transition-opacity relative border border-black/5 group"
        style={{ background: finalBg }}
    >
        <div className="flex items-center gap-2 p-3">
            <div 
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm"
                style={{ backgroundColor: finalText === '#ffffff' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)', color: finalText }}
            >
                {post.author ? post.author[0].toUpperCase() : "?"}
            </div>
            <span className="text-xs font-bold truncate" style={{ color: finalText }}>{post.author}</span>
        </div>
        <div className="px-4 pb-6 text-center">
            <p className="font-serif text-xs font-medium leading-relaxed line-clamp-4 pointer-events-none" style={{ color: finalText }}>{post.content}</p>
        </div>
    </div>
  );
};

const ChatPage = ({ currentUser, initialChatId, onBack, onChatSelect, onSwitchAccount, onPostClick }) => {
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(initialChatId || null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  
  // Search / Forward
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isForwardMode, setIsForwardMode] = useState(false); 
  const [messageToForward, setMessageToForward] = useState(null);
  
  // ⚡ 1. NEW: Chat List Search State
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [userSearchQuery, setUserSearchQuery] = useState(""); // For "New Message" modal
  const [searchResults, setSearchResults] = useState([]); 

  // User Menu
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState([]); 

  // Active Chat Info
  const [activeChatUser, setActiveChatUser] = useState(null);
  const [otherUserStatus, setOtherUserStatus] = useState("offline");
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  
  // Audio
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Actions
  const [selectedMessage, setSelectedMessage] = useState(null); 
  const [replyingTo, setReplyingTo] = useState(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // --- HELPERS ---
  const getDayLabel = (date) => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (date.toDateString() === today.toDateString()) return "Today";
      if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      if (today.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000) return days[date.getDay()];
      return date.toLocaleDateString(); 
  };

  const formatTime = (timestamp) => {
      if (!timestamp) return "";
      return timestamp.toDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  };

  useEffect(() => {
      const accounts = JSON.parse(localStorage.getItem('shayari_saved_accounts') || "[]");
      const others = accounts.filter(acc => acc.username !== currentUser);
      setSavedAccounts(others);
  }, [currentUser]);

  const handleQuickSwitch = async (account) => {
      if (!account.password) { alert("Login required."); if (onSwitchAccount) onSwitchAccount(); return; }
      try {
          const savedPass = atob(account.password);
          await signInWithEmailAndPassword(auth, account.email, savedPass);
          localStorage.setItem('shayari_user', account.username);
          window.location.reload();
      } catch (error) { console.error("Switch failed", error); alert("Login manually."); if (onSwitchAccount) onSwitchAccount(); }
  };

  // 1. FETCH CHATS (Sorted by Last Message)
  useEffect(() => {
    if (!currentUser) { setLoading(false); return; }
    
    // We order by timestamp descending to get the latest active chats first
    const q = query(
        collection(db, "chats"), 
        where("participants", "array-contains", currentUser),
        orderBy("timestamp", "desc") // ⚡ 2. Sort by timestamp from Firestore
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatList = snapshot.docs.map(doc => {
        const data = doc.data();
        const otherUser = data.participants.find(p => p && p !== currentUser) || "Unknown";
        return { 
            id: doc.id, 
            ...data, 
            otherUser, 
            isUnread: data.isRead === false && data.lastMessageSender !== currentUser 
        };
      });

      // ⚡ FIX: Client-side sorting with optimistic update fallback
      // If timestamp is null (local pending write), use Date.now() to push it to top immediately
      chatList.sort((a, b) => {
          const tA = a.timestamp ? a.timestamp.toMillis() : Date.now();
          const tB = b.timestamp ? b.timestamp.toMillis() : Date.now();
          return tB - tA;
      });

      setChats(chatList);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // 2. ACTIVE CHAT SETUP
  useEffect(() => {
    if (!activeChatId || !currentUser) return;
    const chat = chats.find(c => c.id === activeChatId);
    let otherUser = chat ? chat.otherUser : (activeChatId.split('_').find(p => p !== currentUser) || "Unknown");
    if (chat?.isUnread) updateDoc(doc(db, "chats", activeChatId), { isRead: true });
    setActiveChatUser(otherUser);

    const unsubChat = onSnapshot(doc(db, "chats", activeChatId), (docSnap) => {
        if(docSnap.exists()) setIsOtherTyping(docSnap.data().typing?.[otherUser] || false);
    });

    let unsubUser = () => {};
    const fetchStatus = async () => {
        const q = query(collection(db, "users"), where("username", "==", otherUser));
        const snap = await getDocs(q);
        if (!snap.empty) {
            unsubUser = onSnapshot(snap.docs[0].ref, (s) => {
                if(s.exists()) setOtherUserStatus(s.data().isOnline ? "online" : "offline");
            });
        }
    };
    fetchStatus();
    return () => { unsubChat(); unsubUser(); };
  }, [activeChatId, chats, currentUser]);

  // 3. MESSAGES
  useEffect(() => {
    if (!activeChatId) return;
    const q = query(collection(db, "chats", activeChatId, "messages"), orderBy("timestamp", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      if (snapshot.docChanges().some(c => c.type === 'added')) {
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    });
    return () => unsubscribe();
  }, [activeChatId]);

  // 4. USER SEARCH (For New Chat Modal)
  useEffect(() => {
    if (!isSearchOpen) return;
    const searchUsers = async () => {
        if (userSearchQuery.trim() === "") { setSearchResults([]); return; }
        const q = query(collection(db, "users"), where("username", ">=", userSearchQuery), where("username", "<=", userSearchQuery + '\uf8ff'), limit(10));
        const snapshot = await getDocs(q);
        setSearchResults(snapshot.docs.map(d => d.data().username).filter(u => u && u !== currentUser));
    };
    const timer = setTimeout(searchUsers, 300);
    return () => clearTimeout(timer);
  }, [userSearchQuery, isSearchOpen, currentUser]);

  // --- HANDLERS ---
  const handleDeleteMessage = async () => {
      if(!selectedMessage || !activeChatId) return;
      await deleteDoc(doc(db, "chats", activeChatId, "messages", selectedMessage.id));
      setSelectedMessage(null);
  };

  const handleForwardSend = async (targetUser) => {
      if(!messageToForward || !currentUser) return;
      const chatId = [currentUser, targetUser].sort().join("_");
      const chatRef = doc(db, "chats", chatId);
      
      if (!(await getDoc(chatRef)).exists()) {
        await setDoc(chatRef, { participants: [currentUser, targetUser].sort(), lastMessage: "Forwarded message", lastMessageSender: currentUser, timestamp: serverTimestamp(), isRead: false, typing: {} });
      }
      
      let msgData = {
          sender: currentUser, timestamp: serverTimestamp(), isForwarded: true,
          type: messageToForward.type || 'text'
      };

      if(messageToForward.isPostShare) {
          msgData.isPostShare = true;
          msgData.postId = messageToForward.postId;
      } else {
          msgData.text = messageToForward.text || "";
          msgData.image = messageToForward.image || null;
          msgData.audio = messageToForward.audio || null;
      }

      await addDoc(collection(chatRef, "messages"), msgData);
      
      // ⚡ 3. Update Chat Last Message & Timestamp
      await updateDoc(chatRef, { 
          lastMessage: messageToForward.isPostShare ? "Shared a post" : "Forwarded message", 
          lastMessageSender: currentUser, 
          timestamp: serverTimestamp(), // Pushes chat to top
          isRead: false 
      });
      
      setIsSearchOpen(false); setIsForwardMode(false); setMessageToForward(null); setActiveChatId(chatId); 
      if(onChatSelect) onChatSelect(chatId);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChatId) return;
    const text = newMessage; setNewMessage(""); setReplyingTo(null);
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    const chatRef = doc(db, "chats", activeChatId);
    
    await updateDoc(chatRef, { [`typing.${currentUser}`]: false });
    
    await addDoc(collection(chatRef, "messages"), { 
        text, 
        sender: currentUser, 
        timestamp: serverTimestamp(), 
        type: 'text', 
        replyTo: replyingTo ? { text: replyingTo.text, sender: replyingTo.sender } : null 
    });
    
    // ⚡ Update Chat Metadata (Triggers Re-order)
    await setDoc(chatRef, { 
        lastMessage: text, 
        lastMessageSender: currentUser, 
        isRead: false, 
        timestamp: serverTimestamp(), // Pushes chat to top
        participants: (await getDoc(chatRef)).data().participants || activeChatId.split('_')
    }, { merge: true });
  };

  const handleImageUpload = async (e) => {
      const file = e.target.files[0];
      if (!file || !activeChatId) return;
      const storageRef = ref(storage, `chat_images/${activeChatId}/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      const chatRef = doc(db, "chats", activeChatId);
      await addDoc(collection(chatRef, "messages"), { image: downloadURL, sender: currentUser, timestamp: serverTimestamp(), type: 'image' });
      
      await setDoc(chatRef, { 
          lastMessage: "Sent an image", 
          lastMessageSender: currentUser, 
          isRead: false, 
          timestamp: serverTimestamp() 
      }, { merge: true });
  };

  const toggleRecording = async () => {
      if (isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); } 
      else {
          try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              mediaRecorderRef.current = new MediaRecorder(stream);
              audioChunksRef.current = [];
              mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
              mediaRecorderRef.current.onstop = async () => {
                  const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                  const fileName = `${Date.now()}_voice.webm`;
                  const storageRef = ref(storage, `chat_audio/${activeChatId}/${fileName}`);
                  const snapshot = await uploadBytes(storageRef, audioBlob);
                  const url = await getDownloadURL(snapshot.ref);
                  const chatRef = doc(db, "chats", activeChatId);
                  
                  await addDoc(collection(chatRef, "messages"), { audio: url, sender: currentUser, timestamp: serverTimestamp(), type: 'audio' });
                  
                  await setDoc(chatRef, { 
                      lastMessage: "🎤 Voice Message", 
                      lastMessageSender: currentUser, 
                      isRead: false, 
                      timestamp: serverTimestamp() 
                  }, { merge: true });
                  
                  stream.getTracks().forEach(t => t.stop());
              };
              mediaRecorderRef.current.start(); setIsRecording(true);
          } catch (err) { alert("Microphone error."); }
      }
  };

  const handleStartChat = async (targetUser) => {
      if(isForwardMode) { handleForwardSend(targetUser); return; }
      setIsSearchOpen(false);
      const chatId = [currentUser, targetUser].sort().join("_");
      const chatRef = doc(db, "chats", chatId);
      if (!(await getDoc(chatRef)).exists()) { await setDoc(chatRef, { participants: [currentUser, targetUser].sort(), lastMessage: "", lastMessageSender: "", timestamp: serverTimestamp(), isRead: true, typing: {} }); }
      setActiveChatId(chatId); if(onChatSelect) onChatSelect(chatId);
  };

  const triggerFileInput = () => {
      fileInputRef.current.click();
  };

  // ⚡ 4. FILTER CHATS FOR SEARCH
  const filteredChats = chats.filter(chat => 
      chat.otherUser.toLowerCase().includes(chatSearchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] md:h-[85vh] bg-white md:rounded-2xl md:shadow-xl md:border border-gray-100 overflow-hidden max-w-6xl mx-auto md:mt-0 relative" onClick={() => {setSelectedMessage(null); setIsUserMenuOpen(false);}}>
      
      {/* LEFT: CHAT LIST */}
      <div className={`w-full md:w-1/3 bg-white flex-col h-full border-r border-gray-100 ${activeChatId ? 'hidden md:flex' : 'flex'}`}>
        
        {/* Header */}
        <div className="px-4 h-16 flex justify-between items-center bg-white border-b border-gray-100 shrink-0 sticky top-0 z-10">
            <div className="relative">
                <button onClick={(e) => { e.stopPropagation(); setIsUserMenuOpen(!isUserMenuOpen); }} className="flex items-center gap-1 text-xl font-bold font-sans text-gray-900 hover:opacity-70 transition group">
                    {currentUser} <ChevronDown size={20} className={`transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                    {isUserMenuOpen && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                            <div className="p-2">
                                <p className="text-[10px] font-bold text-gray-400 px-2 py-1 uppercase tracking-wide">Current</p>
                                <div className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg cursor-default mb-1">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-xs">{currentUser[0].toUpperCase()}</div>
                                    <span className="font-bold text-sm text-gray-900 truncate">{currentUser}</span>
                                    <div className="ml-auto w-2 h-2 bg-blue-500 rounded-full"></div>
                                </div>
                                {savedAccounts.length > 0 && (
                                    <>
                                        <div className="h-px bg-gray-100 my-2"></div>
                                        <p className="text-[10px] font-bold text-gray-400 px-2 py-1 uppercase tracking-wide">Switch to</p>
                                        {savedAccounts.map(acc => (
                                            <div key={acc.uid} onClick={() => handleQuickSwitch(acc)} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition">
                                                {acc.photoURL ? <img src={acc.photoURL} alt={acc.username} className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold text-xs">{acc.username[0].toUpperCase()}</div>}
                                                <span className="font-bold text-sm text-gray-700 truncate">{acc.username}</span>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                            <div className="h-px bg-gray-100"></div>
                            <button onClick={() => { setIsUserMenuOpen(false); if(onSwitchAccount) onSwitchAccount(); }} className="w-full text-left p-3 text-sm font-bold text-blue-500 hover:bg-gray-50 flex items-center gap-2"><LogIn size={16} /> Log into an existing account</button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            <button onClick={() => { setIsForwardMode(false); setIsSearchOpen(true); }} className="p-2 rounded-full hover:bg-gray-50 text-gray-900 transition"><Edit size={24} /></button>
        </div>

        {/* ⚡ SEARCH BAR */}
        <div className="px-4 py-2 bg-white">
            <div className="flex items-center bg-gray-100 rounded-xl px-3 py-2">
                <Search size={18} className="text-gray-400 mr-2" />
                <input 
                    placeholder="Search messages..." 
                    className="bg-transparent border-none outline-none text-sm w-full placeholder-gray-500"
                    value={chatSearchQuery}
                    onChange={(e) => setChatSearchQuery(e.target.value)}
                />
            </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-20 custom-scrollbar">
            {loading ? <div className="p-6 text-center text-gray-400">Loading...</div> : filteredChats.length === 0 ? (
                <div className="p-10 text-center flex flex-col items-center text-gray-400 mt-10"><MessageCircle size={48} className="mb-4 opacity-20"/><p className="mb-4">No messages found.</p></div>
            ) : (
                filteredChats.map(chat => (
                    <div key={chat.id} onClick={() => { setActiveChatId(chat.id); if(onChatSelect) onChatSelect(chat.id); }} className={`p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition border-b border-gray-50 group relative ${activeChatId === chat.id ? 'bg-gray-50' : ''}`}>
                        <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-gray-200 to-gray-300 flex items-center justify-center text-gray-700 font-bold text-xl shrink-0">{chat.otherUser ? chat.otherUser[0].toUpperCase() : "?"}</div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center mb-0.5"><h4 className={`text-base ${chat.isUnread ? 'font-bold text-black' : 'font-normal text-gray-900'}`}>{chat.otherUser || "Unknown"}</h4>{chat.isUnread && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse shadow-sm"></div>}</div>
                            <p className={`text-sm truncate ${chat.isUnread ? 'font-bold text-black' : 'text-gray-500'}`}>{chat.lastMessageSender === currentUser ? `You: ${chat.lastMessage}` : chat.lastMessage || "Start conversation"}</p>
                        </div>
                    </div>
                ))
            )}
        </div>
      </div>

      {/* RIGHT: ACTIVE CHAT */}
      <div className={`w-full md:w-2/3 flex flex-col bg-white h-full relative ${!activeChatId ? 'hidden md:flex' : 'flex'}`}>
        {activeChatId ? (
            <>
                {/* Header */}
                <div className="h-16 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 flex items-center gap-3 shadow-sm shrink-0 z-10">
                    <button onClick={() => { setActiveChatId(null); if(onChatSelect) onChatSelect(null); }} className="md:hidden p-2 -ml-2 text-gray-900 rounded-full hover:bg-gray-50 transition"><ArrowLeft size={24} /></button>
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold">{activeChatUser ? activeChatUser[0].toUpperCase() : "?"}</div>
                        <div><h3 className="font-bold text-gray-900 text-sm leading-tight">{activeChatUser || "Unknown"}</h3><span className={`text-[10px] ${otherUserStatus === 'online' ? 'text-green-600 font-bold' : 'text-gray-500'}`}>{isOtherTyping ? "Typing..." : (otherUserStatus === 'online' ? "Active now" : "Offline")}</span></div>
                    </div>
                    <div className="ml-auto"><Info size={24} strokeWidth={1.5} className="text-gray-400"/></div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 bg-white scrollbar-hide py-4">
                    <div className="flex flex-col items-center justify-center py-8">
                        <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-3"><div className="w-12 h-12 bg-black rounded-full flex items-center justify-center text-white font-bold text-2xl">{activeChatUser ? activeChatUser[0].toUpperCase() : "?"}</div></div>
                        <h3 className="font-bold text-xl text-gray-900">{activeChatUser}</h3>
                        <p className="text-sm text-gray-500 mb-4">ShayariGram User</p>
                    </div>

                    <div className="space-y-4">
                        {messages.map((msg, index) => {
                            const isMe = msg.sender === currentUser;
                            const prevMsg = messages[index - 1];
                            let showDate = false;
                            if (msg.timestamp) {
                                const currentDate = getDayLabel(msg.timestamp.toDate());
                                const prevDate = prevMsg?.timestamp ? getDayLabel(prevMsg.timestamp.toDate()) : null;
                                if (currentDate !== prevDate) showDate = true;
                            }

                            return (
                                <div key={msg.id}>
                                    {showDate && <div className="flex justify-center my-4"><span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-full uppercase tracking-wider">{getDayLabel(msg.timestamp.toDate())}</span></div>}
                                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group relative mb-1`} onClick={(e) => {if(!e.target.closest('button')) setSelectedMessage(msg)}} onContextMenu={(e) => {e.preventDefault(); setSelectedMessage(msg)}}>
                                        <div className={`max-w-[75%] relative`}>
                                            {msg.replyTo && <div className={`text-[10px] mb-1 p-2 rounded-lg border-l-2 border-white/50 ${isMe ? 'bg-blue-700/30 text-blue-100' : 'bg-gray-200 text-gray-600'}`}><p className="font-bold">{msg.replyTo.sender}</p><p className="truncate w-32">{msg.replyTo.text}</p></div>}
                                            
                                            {msg.isPostShare ? (
                                                <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                                    <SharedPostBubble postId={msg.postId} onPostClick={onPostClick} />
                                                    {msg.text && !msg.text.includes("Shared a post") && <div className={`mt-1 p-2 rounded-xl text-xs shadow-sm ${isMe ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}>{msg.text}</div>}
                                                </div>
                                            ) : (
                                                <div className={`px-4 py-2.5 text-[15px] leading-relaxed shadow-sm cursor-pointer ${isMe ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm' : 'bg-gray-100 text-gray-900 rounded-2xl rounded-bl-sm'}`}>
                                                    {msg.isForwarded && <p className="text-[10px] opacity-70 mb-1 flex items-center gap-1 italic"><Forward size={10}/> Forwarded</p>}
                                                    {msg.type === 'image' ? <img src={msg.image} alt="Sent" className="rounded-lg max-w-full max-h-60 object-cover" /> : msg.type === 'audio' ? <audio controls src={msg.audio} className="h-8 w-48" /> : msg.text}
                                                </div>
                                            )}
                                            
                                            <p className={`text-[9px] mt-1 ${isMe ? 'text-right text-gray-400' : 'text-left text-gray-400'}`}>{msg.timestamp ? formatTime(msg.timestamp) : "Sending..."}</p>
                                        </div>
                                    </motion.div>
                                </div>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {/* Input Area */}
                <div className="bg-white p-3 border-t border-gray-100 z-40 shrink-0">
                    {replyingTo && <div className="flex justify-between items-center bg-gray-50 p-2 rounded-lg mb-2 text-xs text-gray-500 border-l-4 border-blue-500"><div><p className="font-bold text-blue-600">Replying to {replyingTo.sender}</p><p className="truncate w-48">{replyingTo.text || "Media"}</p></div><button onClick={() => setReplyingTo(null)}><X size={16}/></button></div>}
                    
                    <form onSubmit={handleSendMessage} className="flex items-center gap-2 bg-gray-100 rounded-full px-2 py-2">
                        <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" hidden />
                        <div className="p-2 bg-gray-200 rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-300 transition text-gray-600" onClick={() => fileInputRef.current.click()}><ImageIcon size={20} /></div>
                        
                        {/* ⚡ ON ENTER TO SEND */}
                        <input 
                            value={newMessage} 
                            onChange={(e) => setNewMessage(e.target.value)} 
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(e)} 
                            placeholder="Message..." 
                            className="flex-1 bg-transparent text-gray-900 placeholder-gray-500 text-sm focus:outline-none px-2 h-8"
                        />
                        
                        {newMessage.trim() ? (
                            <button type="submit" className="text-blue-600 font-bold text-sm px-3 hover:text-blue-700">Send</button>
                        ) : (
                            <button type="button" onClick={toggleRecording} className={`transition-all mr-2 ${isRecording ? 'text-red-500 scale-110 animate-pulse' : 'text-gray-500 hover:text-gray-700'}`}>{isRecording ? <StopCircle size={22} fill="currentColor"/> : <Mic size={22} />}</button>
                        )}
                    </form>
                </div>
            </>
        ) : (
            <div className="hidden md:flex flex-col items-center justify-center h-full text-gray-300"><div className="w-24 h-24 rounded-full border-2 border-gray-200 flex items-center justify-center mb-4"><MessageCircle size={48} className="opacity-20 text-black"/></div><h3 className="text-xl font-bold text-gray-800 mb-2">Your Messages</h3><p className="text-gray-400">Select a chat to start messaging</p><button onClick={() => { setIsForwardMode(false); setIsSearchOpen(true); }} className="mt-6 px-6 py-2 bg-blue-500 text-white rounded-lg text-sm font-bold shadow-md">Send Message</button></div>
        )}
      </div>

      {/* Message Options */}
      <AnimatePresence>
        {selectedMessage && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/10 backdrop-blur-[2px]" onClick={() => setSelectedMessage(null)}>
                <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl p-4 flex flex-col gap-2 min-w-[200px]">
                    <button onClick={() => {setReplyingTo(selectedMessage); setSelectedMessage(null)}} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl font-medium text-gray-700 text-sm"><Reply size={18} /> Reply</button>
                    {selectedMessage.type === 'text' && <button onClick={() => {navigator.clipboard.writeText(selectedMessage.text); setSelectedMessage(null)}} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl font-medium text-gray-700 text-sm"><Copy size={18} /> Copy Text</button>}
                    <button onClick={handleForwardStart} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl font-medium text-gray-700 text-sm"><Forward size={18} /> Forward</button>
                    {selectedMessage.sender === currentUser && <button onClick={handleDeleteMessage} className="flex items-center gap-3 p-3 hover:bg-red-50 rounded-xl font-bold text-red-500 text-sm"><Trash2 size={18} /> Delete</button>}
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* Search Modal */}
      <AnimatePresence>
        {isSearchOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => setIsSearchOpen(false)}>
                <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()} className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl h-[500px] flex flex-col">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center"><h3 className="font-bold text-lg">{isForwardMode ? "Forward to..." : "New Message"}</h3><button onClick={() => setIsSearchOpen(false)}><X size={20}/></button></div>
                    <div className="p-3 border-b border-gray-100 flex items-center gap-2"><span className="text-gray-400 font-bold text-sm pl-2">To:</span><input autoFocus placeholder="Search user..." value={userSearchQuery} onChange={(e) => setUserSearchQuery(e.target.value)} className="flex-1 p-2 outline-none text-sm placeholder-gray-400 bg-transparent"/></div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {(userSearchQuery ? searchResults : []).length > 0 ? (userSearchQuery ? searchResults : []).map(user => (
                            <div key={user} onClick={() => handleStartChat(user)} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl cursor-pointer transition">
                                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">{user ? user[0].toUpperCase() : "?"}</div>
                                <div className="flex-1"><h4 className="font-bold text-sm text-gray-900">@{user}</h4><p className="text-xs text-gray-500">ShayariGram User</p></div>
                                {isForwardMode && <button className="px-3 py-1 bg-blue-500 text-white rounded-md text-xs font-bold">Send</button>}
                            </div>
                        )) : <div className="text-center py-10 text-gray-400 text-sm">No users found.</div>}
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChatPage;