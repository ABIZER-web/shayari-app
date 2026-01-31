import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, storage } from '../firebase'; 
import { 
    collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, 
    doc, getDoc, setDoc, updateDoc, getDocs, limit, deleteDoc, arrayUnion, arrayRemove, writeBatch 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
    ArrowLeft, Edit, MessageCircle, X, Image as ImageIcon, Mic, Trash2, Copy, Forward, StopCircle, Reply, AlertCircle, Search, User, Download, VolumeX, Volume2, CheckSquare, Check, UserPlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- SUB-COMPONENT: SHARED POST BUBBLE (Memoized) ---
const SharedPostBubble = React.memo(({ postId, onPostClick }) => {
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

  if (loading) return <div className="w-48 h-32 bg-[#393e46] rounded-2xl animate-pulse" />;
  
  if (!post) return (
    <div className="w-48 h-24 bg-[#393e46] rounded-2xl flex flex-col items-center justify-center text-gray-400 p-2">
        <AlertCircle size={16} className="mb-1"/>
        <span className="text-[10px]">Post unavailable</span>
    </div>
  );

  const finalBg = post.bgColor || (post.background && (post.background.startsWith('#') || post.background.includes('gradient')) ? post.background : '#393e46');
  const finalText = post.textColor || '#eeeeee';

  return (
    <div 
        onClick={(e) => { e.stopPropagation(); if (onPostClick) onPostClick(postId); }} 
        className="w-52 rounded-xl shadow-lg overflow-hidden cursor-pointer hover:opacity-95 transition-opacity relative group"
        style={{ background: finalBg }}
    >
        <div className="flex items-center gap-2 p-3">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm" style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: finalText }}>
                {post.author ? post.author[0].toUpperCase() : "?"}
            </div>
            <span className="text-xs font-bold truncate" style={{ color: finalText }}>{post.author}</span>
        </div>
        <div className="px-4 pb-6 text-center">
            <p className="font-serif text-xs font-medium leading-relaxed line-clamp-4 pointer-events-none" style={{ color: finalText }}>{post.content}</p>
        </div>
    </div>
  );
});

// --- SUB-COMPONENT: CHAT LIST ITEM (Memoized) ---
const ChatListItem = React.memo(({ chat, activeChatId, currentUser, isSelectionMode, isSelected, onClick, onContextMenu }) => {
    const [photoURL, setPhotoURL] = useState(null);
    const isMuted = chat.mutedBy && chat.mutedBy.includes(currentUser);

    useEffect(() => {
        const q = query(collection(db, "users"), where("username", "==", chat.otherUser));
        const unsub = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                setPhotoURL(snapshot.docs[0].data().photoURL);
            }
        });
        return unsub;
    }, [chat.otherUser]);

    const isActive = activeChatId === chat.id;

    return (
        <div 
            onClick={onClick} 
            onContextMenu={onContextMenu}
            className={`p-4 flex items-center gap-4 cursor-pointer transition-all duration-200 group relative 
            ${isActive && !isSelectionMode ? 'bg-[#00adb5]' : 'hover:bg-[#393e46]'}
            ${isSelected ? 'bg-[#00adb5]/20' : ''}`}
        >
            {/* CHECKBOX */}
            {isSelectionMode && (
                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${isSelected ? 'bg-[#00adb5] border-[#00adb5]' : 'border-gray-500'}`}>
                    {isSelected && <Check size={14} className="text-white" />}
                </div>
            )}

            <div className={`w-14 h-14 rounded-full p-0.5 flex items-center justify-center shrink-0 overflow-hidden ${isActive && !isSelectionMode ? 'bg-white' : 'bg-gradient-to-tr from-[#393e46] to-gray-600'}`}>
                {photoURL ? (
                    <img src={photoURL} alt={chat.otherUser} className="w-full h-full object-cover rounded-full bg-[#222831]" />
                ) : (
                    <div className="w-full h-full rounded-full bg-[#222831] flex items-center justify-center text-[#eeeeee] font-bold text-xl">
                        {chat.otherUser ? chat.otherUser[0].toUpperCase() : "?"}
                    </div>
                )}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-0.5">
                    <h4 className={`text-base font-bold flex items-center gap-2 ${isActive && !isSelectionMode ? 'text-white' : 'text-[#eeeeee]'}`}>
                        {chat.otherUser || "Unknown"}
                        {isMuted && <VolumeX size={14} className={isActive && !isSelectionMode ? "text-white" : "text-gray-400"} />}
                    </h4>
                    {chat.isUnread && !isActive && <div className="w-2.5 h-2.5 bg-[#00adb5] rounded-full animate-pulse shadow-sm"></div>}
                </div>
                <p className={`text-sm truncate ${isActive && !isSelectionMode ? 'text-teal-50' : chat.isUnread ? 'font-bold text-white' : 'text-gray-400'}`}>
                    {chat.lastMessageSender === "You" ? `You: ${chat.lastMessage}` : chat.lastMessage || "Start conversation"}
                </p>
            </div>
        </div>
    );
});

// --- MAIN COMPONENT: CHAT PAGE ---
const ChatPage = ({ currentUser, initialChatId, onBack, onChatSelect, onPostClick, blockedUsers = [] }) => {
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(initialChatId || null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  
  // Search / Forward
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isForwardMode, setIsForwardMode] = useState(false); 
  const [messageToForward, setMessageToForward] = useState(null);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [userSearchQuery, setUserSearchQuery] = useState(""); 
  const [searchResults, setSearchResults] = useState([]); 
  const [sentFeedback, setSentFeedback] = useState(null);
  
  // Multi-Select
  const [selectedUsernames, setSelectedUsernames] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState(new Set());

  // User Info & Bio
  const [activeChatUser, setActiveChatUser] = useState(null);
  const [activeChatUserPhoto, setActiveChatUserPhoto] = useState(null);
  const [activeChatUserBio, setActiveChatUserBio] = useState(null); // 🔥 BIO STATE
  const [otherUserStatus, setOtherUserStatus] = useState("offline");
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // UI States
  const [selectedMessage, setSelectedMessage] = useState(null); 
  const [selectedChat, setSelectedChat] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [highlightedId, setHighlightedId] = useState(null); 

  const messagesEndRef = useRef(null);
  const messageRefs = useRef({}); 
  const fileInputRef = useRef(null);
  const textInputRef = useRef(null); 
  const typingTimeoutRef = useRef(null);

  const getDayLabel = (date) => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (date.toDateString() === today.toDateString()) return "Today";
      if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
      return date.toLocaleDateString(); 
  };

  const formatTime = (timestamp) => {
      if (!timestamp) return "";
      return timestamp.toDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  };

  // 1. FETCH CHATS
  useEffect(() => {
    if (!currentUser) { setLoading(false); return; }
    const q = query(
        collection(db, "chats"), 
        where("participants", "array-contains", currentUser),
        orderBy("timestamp", "desc"),
        limit(50)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatList = snapshot.docs.map(doc => {
        const data = doc.data();
        const otherUser = data.participants.find(p => p && p !== currentUser) || "Unknown";
        return { id: doc.id, ...data, otherUser, isUnread: data.isRead === false && data.lastMessageSender !== currentUser };
      });
      setChats(chatList);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // 2. ACTIVE CHAT SETUP & BIO FETCH
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
                if(s.exists()) {
                    const d = s.data();
                    setOtherUserStatus(d.isOnline ? "online" : "offline");
                    setActiveChatUserPhoto(d.photoURL || null);
                    setActiveChatUserBio(d.bio || null); // 🔥 SET BIO
                }
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
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
      if (snapshot.docChanges().some(c => c.type === 'added')) {
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    });
    return () => unsubscribe();
  }, [activeChatId]);

  // 4. SEARCH
  useEffect(() => {
    if (!isSearchOpen) return;
    const searchUsers = async () => {
        const term = userSearchQuery.trim();
        if (term === "") { setSearchResults([]); return; }
        const q = query(collection(db, "users"), where("username", ">=", term), where("username", "<=", term + '\uf8ff'), limit(10));
        try {
            const snapshot = await getDocs(q);
            const usersFound = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
            setSearchResults(usersFound.filter(u => u.username !== currentUser && !blockedUsers.includes(u.username)));
        } catch (error) { console.error("Search failed:", error); }
    };
    const timer = setTimeout(searchUsers, 300);
    return () => clearTimeout(timer);
  }, [userSearchQuery, isSearchOpen, currentUser, blockedUsers]);

  // --- HANDLERS ---
  const toggleSelectionMode = () => { setIsSelectionMode(!isSelectionMode); setSelectedChatIds(new Set()); };
  const toggleChatSelection = (chatId) => { const newSelection = new Set(selectedChatIds); if (newSelection.has(chatId)) newSelection.delete(chatId); else newSelection.add(chatId); setSelectedChatIds(newSelection); };
  
  const handleBulkDelete = async () => {
      if (selectedChatIds.size === 0) return;
      if (!window.confirm(`Permanently delete ${selectedChatIds.size} chats?`)) return;
      setChats(prev => prev.filter(c => !selectedChatIds.has(c.id)));
      if (selectedChatIds.has(activeChatId)) { setActiveChatId(null); if (onChatSelect) onChatSelect(null); }
      const chatsToDelete = Array.from(selectedChatIds);
      setIsSelectionMode(false); 
      try {
          const deletePromises = chatsToDelete.map(async (chatId) => {
              const messagesRef = collection(db, "chats", chatId, "messages");
              const snapshot = await getDocs(messagesRef);
              let batch = writeBatch(db); let count = 0; const batches = [];
              snapshot.docs.forEach((doc) => { batch.delete(doc.ref); count++; if (count >= 499) { batches.push(batch.commit()); batch = writeBatch(db); count = 0; } });
              batch.delete(doc(db, "chats", chatId)); batches.push(batch.commit());
              return Promise.all(batches);
          });
          await Promise.all(deletePromises);
          setSelectedChatIds(new Set());
      } catch (err) { console.error("Error bulk deleting:", err); }
  };

  const handleDeleteChat = async () => {
      if(!selectedChat) return;
      if(window.confirm(`Delete chat with @${selectedChat.otherUser}?`)) {
          const id = selectedChat.id; setChats(p => p.filter(c => c.id !== id));
          if(activeChatId === id) { setActiveChatId(null); if(onChatSelect) onChatSelect(null); }
          setSelectedChat(null);
          const ref = collection(db, "chats", id, "messages");
          const snap = await getDocs(ref); const batch = writeBatch(db);
          snap.docs.forEach(d => batch.delete(d.ref)); batch.delete(doc(db,"chats",id)); await batch.commit();
      }
  };

  const handleToggleMute = async () => {
      if(!selectedChat) return;
      const freshChat = chats.find(c => c.id === selectedChat.id) || selectedChat;
      const chatId = freshChat.id;
      const isCurrentlyMuted = freshChat.mutedBy?.includes(currentUser);
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, mutedBy: isCurrentlyMuted ? (c.mutedBy || []).filter(u => u !== currentUser) : [...(c.mutedBy || []), currentUser] } : c));
      setSelectedChat(null);
      const chatRef = doc(db, "chats", chatId);
      try { if (isCurrentlyMuted) { await updateDoc(chatRef, { mutedBy: arrayRemove(currentUser) }); } else { await updateDoc(chatRef, { mutedBy: arrayUnion(currentUser) }); } } catch (err) { console.error("Mute error:", err); }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChatId) return;
    const text = newMessage;
    const currentReply = replyingTo ? { id: replyingTo.id, text: replyingTo.text, sender: replyingTo.sender, type: replyingTo.type } : null;
    setNewMessage(""); setReplyingTo(null); 
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    const chatRef = doc(db, "chats", activeChatId);
    await updateDoc(chatRef, { [`typing.${currentUser}`]: false });
    await addDoc(collection(chatRef, "messages"), { text, sender: currentUser, timestamp: serverTimestamp(), type: 'text', replyTo: currentReply });
    await setDoc(chatRef, { lastMessage: text, lastMessageSender: currentUser, isRead: false, timestamp: serverTimestamp(), participants: (await getDoc(chatRef)).data().participants || activeChatId.split('_') }, { merge: true });
  };

  const handleDeleteMessage = async () => { if(!selectedMessage || !activeChatId) return; await deleteDoc(doc(db, "chats", activeChatId, "messages", selectedMessage.id)); setSelectedMessage(null); };
  const handleSaveImage = (imageUrl) => { const link = document.createElement('a'); link.href = imageUrl; link.download = `image_${Date.now()}.jpg`; link.target = '_blank'; document.body.appendChild(link); link.click(); document.body.removeChild(link); setSelectedMessage(null); };
  const handleForwardSend = async (targetUser) => { if(!messageToForward || !currentUser) return; setSentFeedback(targetUser); const chatId = [currentUser, targetUser].sort().join("_"); const chatRef = doc(db, "chats", chatId); if (!(await getDoc(chatRef)).exists()) { await setDoc(chatRef, { participants: [currentUser, targetUser].sort(), lastMessage: "Forwarded message", lastMessageSender: currentUser, timestamp: serverTimestamp(), isRead: false, typing: {} }); } let msgData = { sender: currentUser, timestamp: serverTimestamp(), isForwarded: true, type: messageToForward.type || 'text' }; if(messageToForward.isPostShare) { msgData.isPostShare = true; msgData.postId = messageToForward.postId; } else { msgData.text = messageToForward.text || ""; msgData.image = messageToForward.image || null; msgData.audio = messageToForward.audio || null; } await addDoc(collection(chatRef, "messages"), msgData); await updateDoc(chatRef, { lastMessage: messageToForward.isPostShare ? "Shared a post" : "Forwarded message", lastMessageSender: currentUser, timestamp: serverTimestamp(), isRead: false }); setTimeout(() => { setIsSearchOpen(false); setIsForwardMode(false); setMessageToForward(null); setSentFeedback(null); setActiveChatId(chatId); if(onChatSelect) onChatSelect(chatId); }, 1000); };
  const handleImageUpload = async (e) => { const file = e.target.files[0]; if (!file || !activeChatId) return; const currentReply = replyingTo ? { id: replyingTo.id, text: replyingTo.text, sender: replyingTo.sender, type: replyingTo.type } : null; setReplyingTo(null); const storageRef = ref(storage, `chat_images/${activeChatId}/${Date.now()}_${file.name}`); const snapshot = await uploadBytes(storageRef, file); const downloadURL = await getDownloadURL(snapshot.ref); const chatRef = doc(db, "chats", activeChatId); await addDoc(collection(chatRef, "messages"), { image: downloadURL, sender: currentUser, timestamp: serverTimestamp(), type: 'image', replyTo: currentReply }); await setDoc(chatRef, { lastMessage: "Sent an image", lastMessageSender: currentUser, isRead: false, timestamp: serverTimestamp() }, { merge: true }); };
  const toggleRecording = async () => { if (isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); } else { try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); mediaRecorderRef.current = new MediaRecorder(stream); audioChunksRef.current = []; mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); }; mediaRecorderRef.current.onstop = async () => { const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' }); const fileName = `${Date.now()}_voice.webm`; const storageRef = ref(storage, `chat_audio/${activeChatId}/${fileName}`); const snapshot = await uploadBytes(storageRef, audioBlob); const url = await getDownloadURL(snapshot.ref); const chatRef = doc(db, "chats", activeChatId); await addDoc(collection(chatRef, "messages"), { audio: url, sender: currentUser, timestamp: serverTimestamp(), type: 'audio', replyTo: replyingTo ? { id: replyingTo.id, text: replyingTo.text, sender: replyingTo.sender, type: replyingTo.type } : null }); await setDoc(chatRef, { lastMessage: "🎤 Voice Message", lastMessageSender: currentUser, isRead: false, timestamp: serverTimestamp() }, { merge: true }); stream.getTracks().forEach(t => t.stop()); }; mediaRecorderRef.current.start(); setIsRecording(true); } catch (err) { alert("Microphone error."); } } };
  
  const handleStartChat = async (targetUser) => {
      if(isForwardMode) { handleForwardSend(targetUser); return; }
      if (selectedUsernames.has(targetUser)) { const newSet = new Set(selectedUsernames); newSet.delete(targetUser); setSelectedUsernames(newSet); } 
      else { if (selectedUsernames.size > 0) { const newSet = new Set(selectedUsernames); newSet.add(targetUser); setSelectedUsernames(newSet); } else { createAndOpenChat(targetUser); } }
  };

  const createAndOpenChat = async (targetUser) => {
      setIsSearchOpen(false); setUserSearchQuery(""); setSearchResults([]); setSelectedUsernames(new Set()); 
      const chatId = [currentUser, targetUser].sort().join("_");
      const chatRef = doc(db, "chats", chatId);
      if (!(await getDoc(chatRef)).exists()) { await setDoc(chatRef, { participants: [currentUser, targetUser].sort(), lastMessage: "", lastMessageSender: "", timestamp: serverTimestamp(), isRead: true, typing: {} }); }
      setActiveChatId(chatId); if(onChatSelect) onChatSelect(chatId);
  };

  const handleBulkAddChats = async () => {
      const usersToAdd = Array.from(selectedUsernames);
      setIsSearchOpen(false); setUserSearchQuery(""); setSearchResults([]); setSelectedUsernames(new Set());
      for (const user of usersToAdd) {
          const chatId = [currentUser, user].sort().join("_");
          const chatRef = doc(db, "chats", chatId);
          const snap = await getDoc(chatRef);
          if (!snap.exists()) { await setDoc(chatRef, { participants: [currentUser, user].sort(), lastMessage: "", lastMessageSender: "", timestamp: serverTimestamp(), isRead: true, typing: {} }); }
      }
      if (usersToAdd.length > 0) { const firstId = [currentUser, usersToAdd[0]].sort().join("_"); setActiveChatId(firstId); if(onChatSelect) onChatSelect(firstId); }
  };

  const handleForwardStart = () => { setMessageToForward(selectedMessage); setSelectedMessage(null); setIsForwardMode(true); setIsSearchOpen(true); };
  
  // 🔥 SCROLL TO MESSAGE & HIGHLIGHT ROW
  const handleJumpToMessage = (messageId) => {
      if (!messageId) return;
      const el = messageRefs.current[messageId];
      if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedId(messageId);
          setTimeout(() => setHighlightedId(null), 1500); 
      }
  };

  const handleReplyClick = (msg) => {
      let previewText = msg.text;
      if (msg.type === 'image') previewText = "📷 Photo";
      if (msg.type === 'audio') previewText = "🎤 Voice Message";
      if (msg.isPostShare) previewText = "Shared a Post";
      setReplyingTo({ id: msg.id, text: previewText, sender: msg.sender, type: msg.type });
      setSelectedMessage(null);
      if (textInputRef.current) textInputRef.current.focus();
  };

  const filteredChats = React.useMemo(() => {
      const q = chatSearchQuery.toLowerCase();
      return chats.filter(chat => {
          const matchesUser = chat.otherUser.toLowerCase().includes(q);
          const matchesMessage = chat.lastMessage && chat.lastMessage.toLowerCase().includes(q);
          const isNotBlocked = !blockedUsers.includes(chat.otherUser);
          return (matchesUser || matchesMessage) && isNotBlocked;
      });
  }, [chats, chatSearchQuery, blockedUsers]);

  const getSelectedChatMuteStatus = () => {
      if (!selectedChat) return false;
      const freshChat = chats.find(c => c.id === selectedChat.id);
      return freshChat?.mutedBy?.includes(currentUser);
  };

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] md:h-[85vh] bg-[#222831] md:rounded-2xl md:shadow-xl overflow-hidden max-w-6xl mx-auto md:mt-0 relative" onClick={() => {setSelectedMessage(null); setSelectedChat(null);}}>
      
      {/* LEFT: CHAT LIST */}
      <div className={`w-full md:w-1/3 bg-[#222831] flex-col h-full ${activeChatId ? 'hidden md:flex' : 'flex'}`}>
        
        {/* Header */}
        <div className="px-4 h-16 flex justify-between items-center bg-[#222831] shrink-0 sticky top-0 z-10">
            {isSelectionMode ? (
                <div className="flex items-center justify-between w-full animate-in fade-in duration-200">
                    <button onClick={toggleSelectionMode} className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-700"><X size={20} /></button>
                    <span className="font-bold text-[#eeeeee]">{selectedChatIds.size} Selected</span>
                    <button onClick={handleBulkDelete} className="text-red-500 p-2 rounded-full hover:bg-red-500/10"><Trash2 size={20} /></button>
                </div>
            ) : (
                <>
                    <div className="flex items-center gap-2">
                        <span className="text-xl font-bold font-sans text-[#eeeeee] ml-2">{currentUser}</span>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={toggleSelectionMode} className="p-2 rounded-full hover:bg-[#393e46] text-gray-400 hover:text-white transition" title="Select Chats"><CheckSquare size={20} /></button>
                        <button onClick={() => { setIsForwardMode(false); setIsSearchOpen(true); }} className="p-2 rounded-full hover:bg-[#393e46] text-[#eeeeee] transition"><Edit size={24} /></button>
                    </div>
                </>
            )}
        </div>

        {/* SEARCH BAR */}
        <div className="px-4 py-2 bg-[#222831]">
            <div className="flex items-center bg-[#393e46] rounded-xl px-3 py-2">
                <Search size={18} className="text-gray-400 mr-2" />
                <input 
                    placeholder="Search messages..." 
                    className="bg-transparent border-none outline-none text-sm w-full placeholder-gray-400 text-[#eeeeee]"
                    value={chatSearchQuery}
                    onChange={(e) => setChatSearchQuery(e.target.value)}
                />
            </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-20 custom-scrollbar">
            {loading ? <div className="p-6 text-center text-gray-400">Loading...</div> : filteredChats.length === 0 ? (
                <div className="p-10 text-center flex flex-col items-center text-gray-500 mt-10"><MessageCircle size={48} className="mb-4 opacity-20"/><p className="mb-4">No messages found.</p></div>
            ) : (
                filteredChats.map(chat => (
                    <React.Fragment key={chat.id}>
                        <ChatListItem 
                            chat={chat} 
                            activeChatId={activeChatId} 
                            currentUser={currentUser}
                            isSelectionMode={isSelectionMode}
                            isSelected={selectedChatIds.has(chat.id)}
                            onClick={() => {
                                if (isSelectionMode) {
                                    toggleChatSelection(chat.id);
                                } else {
                                    setActiveChatId(chat.id);
                                    if(onChatSelect) onChatSelect(chat.id);
                                    setChatSearchQuery(""); 
                                }
                            }}
                            onContextMenu={(e) => { e.preventDefault(); setSelectedChat(chat); }} 
                        />
                    </React.Fragment>
                ))
            )}
        </div>
      </div>

      {/* RIGHT: ACTIVE CHAT */}
      <div className={`w-full md:w-2/3 flex flex-col bg-[#222831] h-full relative ${!activeChatId ? 'hidden md:flex' : 'flex'}`}>
        {activeChatId ? (
            <>
                {/* Header */}
                <div className="h-16 bg-[#222831]/95 backdrop-blur-sm px-4 flex items-center justify-between shadow-sm shrink-0 z-10">
                    <div className="flex items-center gap-3">
                        <button onClick={() => { setActiveChatId(null); if(onChatSelect) onChatSelect(null); }} className="md:hidden p-2 -ml-2 text-[#eeeeee] rounded-full hover:bg-[#393e46] transition"><ArrowLeft size={24} /></button>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#00adb5] to-teal-700 flex items-center justify-center text-white font-bold overflow-hidden">
                            {activeChatUserPhoto ? <img src={activeChatUserPhoto} alt="User" className="w-full h-full object-cover"/> : (activeChatUser ? activeChatUser[0].toUpperCase() : "?")}
                        </div>
                        <div><h3 className="font-bold text-[#eeeeee] text-sm leading-tight">{activeChatUser || "Unknown"}</h3><span className={`text-[10px] ${otherUserStatus === 'online' ? 'text-[#00adb5] font-bold' : 'text-gray-500'}`}>{isOtherTyping ? "Typing..." : (otherUserStatus === 'online' ? "Active now" : "Offline")}</span></div>
                    </div>
                    {/* View Profile Button */}
                    <button className="p-2 text-[#00adb5] hover:bg-[#393e46] rounded-full transition"><User size={24}/></button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 bg-[#222831] scrollbar-hide py-4">
                    <div className="flex flex-col items-center justify-center py-8">
                        <div className="w-24 h-24 bg-[#393e46] rounded-full flex items-center justify-center mb-3 overflow-hidden shadow-lg border-2 border-[#00adb5]">
                            {activeChatUserPhoto ? <img src={activeChatUserPhoto} className="w-full h-full object-cover"/> : <div className="text-[#eeeeee] text-3xl font-bold">{activeChatUser ? activeChatUser[0].toUpperCase() : "?"}</div>}
                        </div>
                        <h3 className="font-bold text-xl text-[#eeeeee]">{activeChatUser}</h3>
                        {/* 🔥 SHOW BIO */}
                        <p className="text-sm text-gray-500 mb-4">{activeChatUserBio || "ShayariGram User"}</p>
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
                                <React.Fragment key={msg.id}>
                                    {/* 🔥 DATE IS SEPARATE */}
                                    {showDate && (
                                        <div className="flex justify-center my-6">
                                            <span className="text-[10px] font-bold text-gray-400 bg-[#393e46] px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
                                                {getDayLabel(msg.timestamp.toDate())}
                                            </span>
                                        </div>
                                    )}
                                    
                                    {/* 🔥 ROW CONTAINER FOR HIGHLIGHT */}
                                    <div 
                                        ref={(el) => (messageRefs.current[msg.id] = el)}
                                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} mb-2 p-2 rounded-xl transition-all duration-1000 ${highlightedId === msg.id ? 'bg-[#00adb5]/20' : ''}`}
                                    >
                                        <motion.div 
                                            initial={{ opacity: 0, y: 5 }} 
                                            animate={{ opacity: 1, y: 0 }} 
                                            className="relative max-w-[75%]"
                                            onClick={(e) => {if(!e.target.closest('button')) setSelectedMessage(msg)}} 
                                            onContextMenu={(e) => {e.preventDefault(); setSelectedMessage(msg)}}
                                        >
                                            {/* Reply Bubble */}
                                            {msg.replyTo && (
                                                <div 
                                                    onClick={() => handleJumpToMessage(msg.replyTo.id)} 
                                                    className={`text-[10px] mb-1 p-2 rounded-lg border-l-2 border-[#00adb5] cursor-pointer hover:opacity-80 transition ${isMe ? 'bg-[#00adb5]/20 text-[#00adb5]' : 'bg-[#393e46] text-gray-400'}`}
                                                >
                                                    <p className="font-bold">{msg.replyTo.sender}</p>
                                                    <p className="truncate w-32 flex items-center gap-1">
                                                        {msg.replyTo.type === 'image' && <ImageIcon size={10}/>}
                                                        {msg.replyTo.type === 'audio' && <Mic size={10}/>}
                                                        {msg.replyTo.text}
                                                    </p>
                                                </div>
                                            )}
                                            
                                            {/* Content */}
                                            {msg.isPostShare ? (
                                                <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                                    <SharedPostBubble postId={msg.postId} onPostClick={onPostClick} />
                                                    {msg.text && !msg.text.includes("Shared a post") && <div className={`mt-1 p-2 rounded-xl text-xs shadow-sm ${isMe ? 'bg-[#00adb5] text-white' : 'bg-[#393e46] text-[#eeeeee]'}`}>{msg.text}</div>}
                                                </div>
                                            ) : (
                                                <div className={`px-4 py-2.5 text-[15px] leading-relaxed shadow-sm cursor-pointer ${isMe ? 'bg-[#00adb5] text-white rounded-2xl rounded-br-sm' : 'bg-[#393e46] text-[#eeeeee] rounded-2xl rounded-bl-sm'}`}>
                                                    {msg.isForwarded && <p className="text-[10px] opacity-70 mb-1 flex items-center gap-1 italic"><Forward size={10}/> Forwarded</p>}
                                                    {msg.type === 'image' ? <img src={msg.image} alt="Sent" className="rounded-lg max-w-full max-h-60 object-cover" /> : msg.type === 'audio' ? <audio controls src={msg.audio} className="h-8 w-48" /> : msg.text}
                                                </div>
                                            )}
                                            <p className={`text-[9px] mt-1 ${isMe ? 'text-right text-gray-500' : 'text-left text-gray-500'}`}>{msg.timestamp ? formatTime(msg.timestamp) : "Sending..."}</p>
                                        </motion.div>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {/* Input Area */}
                <div className="bg-[#222831] p-3 z-40 shrink-0">
                    {replyingTo && <div className="flex justify-between items-center bg-[#393e46] p-2 rounded-lg mb-2 text-xs text-gray-400 border-l-4 border-[#00adb5]"><div><p className="font-bold text-[#00adb5]">Replying to {replyingTo.sender}</p><p className="truncate w-48">{replyingTo.text}</p></div><button onClick={() => setReplyingTo(null)}><X size={16}/></button></div>}
                    
                    <form onSubmit={handleSendMessage} className="flex items-center gap-2 bg-[#393e46] rounded-full px-2 py-2">
                        <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" hidden />
                        <div className="p-2 bg-gray-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-500 transition text-[#eeeeee]" onClick={() => fileInputRef.current.click()}><ImageIcon size={20} /></div>
                        
                        <input 
                            ref={textInputRef}
                            value={newMessage} 
                            onChange={(e) => setNewMessage(e.target.value)} 
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(e)} 
                            placeholder="Message..." 
                            className="flex-1 bg-transparent text-[#eeeeee] placeholder-gray-400 text-sm focus:outline-none px-2 h-8"
                        />
                        
                        {newMessage.trim() ? (
                            <button type="submit" className="text-[#00adb5] font-bold text-sm px-3 hover:text-white">Send</button>
                        ) : (
                            <button type="button" onClick={toggleRecording} className={`transition-all mr-2 ${isRecording ? 'text-red-500 scale-110 animate-pulse' : 'text-gray-400 hover:text-gray-200'}`}>{isRecording ? <StopCircle size={22} fill="currentColor"/> : <Mic size={22} />}</button>
                        )}
                    </form>
                </div>
            </>
        ) : (
            <div className="hidden md:flex flex-col items-center justify-center h-full text-gray-500"><div className="w-24 h-24 rounded-full border-2 border-[#393e46] flex items-center justify-center mb-4"><MessageCircle size={48} className="opacity-20 text-[#eeeeee]"/></div><h3 className="text-xl font-bold text-[#eeeeee] mb-2">Your Messages</h3><p className="text-gray-500">Select a chat to start messaging</p><button onClick={() => { setIsForwardMode(false); setIsSearchOpen(true); }} className="mt-6 px-6 py-2 bg-[#00adb5] text-white rounded-lg text-sm font-bold shadow-md">Send Message</button></div>
        )}
      </div>

      {/* MESSAGE CONTEXT MENU */}
      <AnimatePresence>
        {selectedMessage && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]" onClick={() => setSelectedMessage(null)}>
                <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} onClick={e => e.stopPropagation()} className="bg-[#393e46] text-[#eeeeee] rounded-2xl shadow-2xl p-4 flex flex-col gap-2 min-w-[200px]">
                    <button onClick={() => handleReplyClick(selectedMessage)} className="flex items-center gap-3 p-3 hover:bg-[#222831] rounded-xl font-medium text-sm"><Reply size={18} /> Reply</button>
                    {selectedMessage.type === 'text' && <button onClick={() => {navigator.clipboard.writeText(selectedMessage.text); setSelectedMessage(null)}} className="flex items-center gap-3 p-3 hover:bg-[#222831] rounded-xl font-medium text-sm"><Copy size={18} /> Copy Text</button>}
                    {selectedMessage.type === 'image' && <button onClick={() => handleSaveImage(selectedMessage.image)} className="flex items-center gap-3 p-3 hover:bg-[#222831] rounded-xl font-medium text-sm"><Download size={18} /> Save Image</button>}
                    <button onClick={handleForwardStart} className="flex items-center gap-3 p-3 hover:bg-[#222831] rounded-xl font-medium text-sm"><Forward size={18} /> Forward</button>
                    {selectedMessage.sender === currentUser && <button onClick={handleDeleteMessage} className="flex items-center gap-3 p-3 hover:bg-red-500/10 rounded-xl font-bold text-red-500 text-sm"><Trash2 size={18} /> Delete</button>}
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* CHAT CONTEXT MENU */}
      <AnimatePresence>
        {selectedChat && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]" onClick={() => setSelectedChat(null)}>
                <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} onClick={e => e.stopPropagation()} className="bg-[#393e46] text-[#eeeeee] rounded-2xl shadow-2xl p-4 flex flex-col gap-2 min-w-[200px]">
                    <h3 className="text-center font-bold mb-2 text-sm text-gray-400">@{selectedChat.otherUser}</h3>
                    {/* 🔥 TOGGLE MUTE */}
                    <button onClick={handleToggleMute} className="flex items-center gap-3 p-3 hover:bg-[#222831] rounded-xl font-medium text-sm">
                        {getSelectedChatMuteStatus() ? <><Volume2 size={18} /> Unmute Chat</> : <><VolumeX size={18} /> Mute Chat</>}
                    </button>
                    {/* 🔥 DELETE CHAT */}
                    <button onClick={handleDeleteChat} className="flex items-center gap-3 p-3 hover:bg-red-500/10 rounded-xl font-bold text-red-500 text-sm"><Trash2 size={18} /> Delete Chat</button>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* Search/New Chat Modal */}
      <AnimatePresence>
        {isSearchOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => setIsSearchOpen(false)}>
                <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()} className="bg-[#393e46] w-full max-w-md rounded-2xl overflow-hidden shadow-2xl h-[500px] flex flex-col">
                    <div className="p-4 flex justify-between items-center">
                        <h3 className="font-bold text-lg text-[#eeeeee]">
                            {isForwardMode ? "Forward to..." : `New Message ${selectedUsernames.size > 0 ? `(${selectedUsernames.size})` : ''}`}
                        </h3>
                        <button onClick={() => setIsSearchOpen(false)}><X size={20} className="text-gray-400"/></button>
                    </div>
                    
                    {/* 🔥 MULTI-ADD BUTTON */}
                    {!isForwardMode && selectedUsernames.size > 0 && (
                        <div className="px-4 pb-2">
                            <button onClick={handleBulkAddChats} className="w-full bg-[#00adb5] text-white py-2 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                                <UserPlus size={18} /> Add {selectedUsernames.size} Chats
                            </button>
                        </div>
                    )}

                    <div className="p-3 flex items-center gap-2"><span className="text-gray-400 font-bold text-sm pl-2">To:</span><input autoFocus placeholder="Search user..." value={userSearchQuery} onChange={(e) => setUserSearchQuery(e.target.value)} className="flex-1 p-2 outline-none text-sm placeholder-gray-500 bg-transparent text-[#eeeeee]"/></div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {(userSearchQuery ? searchResults : []).length > 0 ? (userSearchQuery ? searchResults : []).map(user => (
                            <div 
                                key={user.uid} 
                                onClick={() => handleStartChat(user.username)} 
                                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition ${selectedUsernames.has(user.username) ? 'bg-[#00adb5]/20' : 'hover:bg-[#222831]'}`}
                            >
                                <div className="relative">
                                    <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-sm font-bold text-white overflow-hidden">
                                        {user.photoURL ? <img src={user.photoURL} alt={user.username} className="w-full h-full object-cover"/> : user.username[0].toUpperCase()}
                                    </div>
                                    {selectedUsernames.has(user.username) && (
                                        <div className="absolute -bottom-1 -right-1 bg-[#00adb5] rounded-full p-0.5 border border-[#222831]">
                                            <Check size={10} className="text-white"/>
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1"><h4 className="font-bold text-sm text-[#eeeeee]">@{user.username}</h4><p className="text-xs text-gray-400">ShayariGram User</p></div>
                                
                                {isForwardMode && (
                                    <button 
                                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${sentFeedback === user.username ? 'bg-green-500 text-white' : 'bg-[#00adb5] text-white'}`}
                                    >
                                        {sentFeedback === user.username ? <span className="flex items-center gap-1"><Check size={12}/> Sent</span> : "Send"}
                                    </button>
                                )}
                            </div>
                        )) : <div className="text-center py-10 text-gray-500 text-sm">No users found.</div>}
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChatPage;