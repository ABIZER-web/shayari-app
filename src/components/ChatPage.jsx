import { useState, useEffect, useRef } from 'react';
import { db, storage } from '../firebase';
import { 
    collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, 
    doc, getDoc, setDoc, updateDoc, getDocs, limit, deleteDoc 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
    ArrowLeft, Edit, MessageCircle, X, Phone, Video, Camera, Info, 
    Image as ImageIcon, Mic, MoreVertical, Trash2, Copy, Forward, StopCircle, Download, Reply 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ChatPage = ({ currentUser, initialChatId, onBack, onCallStart, onChatSelect }) => {
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(initialChatId || null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  
  // Search / Forward State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isForwardMode, setIsForwardMode] = useState(false); 
  const [messageToForward, setMessageToForward] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]); 

  // Active Chat Info
  const [activeChatUser, setActiveChatUser] = useState(null);
  const [otherUserStatus, setOtherUserStatus] = useState("offline");
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  
  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Message Actions State
  const [selectedMessage, setSelectedMessage] = useState(null); 
  const [replyingTo, setReplyingTo] = useState(null);

  const currentChat = chats.find(c => c.id === activeChatId);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // --- DATE & TIME HELPERS ---
  const getDayLabel = (date) => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (date.toDateString() === today.toDateString()) return "Today";
      if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
      
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      if (today.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000) {
          return days[date.getDay()];
      }
      return date.toLocaleDateString(); 
  };

  const formatTime = (timestamp) => {
      if (!timestamp) return "";
      const date = timestamp.toDate();
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  };

  // 1. FETCH CHAT LIST
  useEffect(() => {
    if (!currentUser) { setLoading(false); return; }

    const q = query(collection(db, "chats"), where("participants", "array-contains", currentUser));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatList = snapshot.docs.map(doc => {
        const data = doc.data();
        const participants = data.participants || [];
        const otherUser = participants.find(p => p && p !== currentUser) || "Unknown";
        return { 
            id: doc.id, 
            ...data, 
            otherUser, 
            isUnread: data.isRead === false && data.lastMessageSender !== currentUser 
        };
      });

      chatList.sort((a, b) => {
          const tA = a.timestamp?.seconds || 0;
          const tB = b.timestamp?.seconds || 0;
          return tB - tA;
      });

      setChats(chatList);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // 2. HEADER & TYPING LISTENER
  useEffect(() => {
    if (!activeChatId || !currentUser) return;

    const chat = chats.find(c => c.id === activeChatId);
    let otherUser = "Unknown";
    if (chat) {
        otherUser = chat.otherUser;
        if (chat.isUnread) updateDoc(doc(db, "chats", activeChatId), { isRead: true });
    } else {
        const parts = activeChatId.split('_');
        otherUser = parts.find(p => p !== currentUser) || "Unknown";
    }
    setActiveChatUser(otherUser);

    const unsubChat = onSnapshot(doc(db, "chats", activeChatId), (docSnap) => {
        if(docSnap.exists()) {
            const data = docSnap.data();
            if(data.typing && data.typing[otherUser]) setIsOtherTyping(true);
            else setIsOtherTyping(false);
        }
    });

    let unsubUser = () => {};
    const fetchStatus = async () => {
        const q = query(collection(db, "users"), where("username", "==", otherUser));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            unsubUser = onSnapshot(querySnapshot.docs[0].ref, (snap) => {
                if(snap.exists()) {
                    const data = snap.data();
                    setOtherUserStatus(data.isOnline ? "online" : "offline");
                }
            });
        }
    };
    fetchStatus();

    return () => { unsubChat(); unsubUser(); };
  }, [activeChatId, chats, currentUser]);

  // 3. MESSAGES LISTENER
  useEffect(() => {
    if (!activeChatId) return;
    const q = query(collection(db, "chats", activeChatId, "messages"), orderBy("timestamp", "asc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      
      const wasMessageAdded = snapshot.docChanges().some(change => change.type === 'added');
      if (wasMessageAdded) {
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    });
    return () => unsubscribe();
  }, [activeChatId]);

  // 4. GLOBAL SEARCH
  useEffect(() => {
    if (!isSearchOpen) return;
    const searchUsers = async () => {
        try {
            if (searchQuery.trim() === "") {
                setSearchResults([]); // Empty search clears specific results
                return;
            }
            let q = query(collection(db, "users"), where("username", ">=", searchQuery), where("username", "<=", searchQuery + '\uf8ff'), limit(10));

            const snapshot = await getDocs(q);
            const users = snapshot.docs.map(doc => doc.data().username).filter(u => u && u !== currentUser); 
            setSearchResults(users);
        } catch (error) { console.error(error); }
    };
    const timer = setTimeout(searchUsers, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, isSearchOpen, currentUser]);

  // --- HANDLERS ---

  const handleMessageClick = (e, msg) => {
      if(e.target.closest('button')) return; // Ignore button clicks
      setSelectedMessage(msg); 
  };

  const handleRightClick = (e, msg) => {
      e.preventDefault(); 
      setSelectedMessage(msg); 
  };

  const handleDeleteMessage = async () => {
      if(!selectedMessage || !activeChatId) return;
      try {
          await deleteDoc(doc(db, "chats", activeChatId, "messages", selectedMessage.id));
          setSelectedMessage(null);
      } catch(err) { console.error("Error deleting message:", err); }
  };

  const handleCopyText = () => {
      if(selectedMessage && selectedMessage.text) {
          navigator.clipboard.writeText(selectedMessage.text);
      }
      setSelectedMessage(null);
  };

  const handleReply = () => {
      setReplyingTo(selectedMessage);
      setSelectedMessage(null);
  };

  const handleDownloadImage = async () => {
      if(selectedMessage && selectedMessage.image) {
          try {
              const response = await fetch(selectedMessage.image);
              const blob = await response.blob();
              const url = window.URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `chat_image_${Date.now()}.jpg`;
              document.body.appendChild(link);
              link.click();
              window.URL.revokeObjectURL(url);
              document.body.removeChild(link);
          } catch (error) { window.open(selectedMessage.image, '_blank'); }
      }
      setSelectedMessage(null);
  };

  const handleForwardStart = () => {
      if(selectedMessage) {
          setMessageToForward(selectedMessage);
          setIsForwardMode(true);
          setIsSearchOpen(true); 
          setSelectedMessage(null);
      }
  };

  const handleForwardSend = async (targetUser) => {
      if(!messageToForward || !currentUser) return;
      
      const chatId = [currentUser, targetUser].sort().join("_");
      try {
          const chatRef = doc(db, "chats", chatId);
          const chatSnap = await getDoc(chatRef);
          
          if (!chatSnap.exists()) {
            await setDoc(chatRef, {
                participants: [currentUser, targetUser].sort(),
                lastMessage: "Forwarded message",
                lastMessageSender: currentUser,
                timestamp: serverTimestamp(),
                isRead: false,
                typing: {}
            });
          }

          await addDoc(collection(chatRef, "messages"), {
              text: messageToForward.text || "",
              image: messageToForward.image || null,
              audio: messageToForward.audio || null,
              sender: currentUser,
              timestamp: serverTimestamp(),
              type: messageToForward.type || 'text',
              isForwarded: true
          });

          await updateDoc(chatRef, {
              lastMessage: "Forwarded message",
              lastMessageSender: currentUser,
              timestamp: serverTimestamp(),
              isRead: false
          });

          setIsSearchOpen(false);
          setIsForwardMode(false);
          setMessageToForward(null);
          setActiveChatId(chatId); 
          if(onChatSelect) onChatSelect(chatId);

      } catch(err) { console.error(err); }
  };

  const handleInputChange = async (e) => {
    setNewMessage(e.target.value);
    if(!activeChatId) return;
    const chatRef = doc(db, "chats", activeChatId);
    await updateDoc(chatRef, { [`typing.${currentUser}`]: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(async () => {
        await updateDoc(chatRef, { [`typing.${currentUser}`]: false });
    }, 2000);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChatId) return;
    const text = newMessage;
    setNewMessage(""); 
    setReplyingTo(null);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    const chatRef = doc(db, "chats", activeChatId);
    try {
        await updateDoc(chatRef, { [`typing.${currentUser}`]: false });
        await addDoc(collection(chatRef, "messages"), {
            text: text,
            sender: currentUser,
            timestamp: serverTimestamp(),
            type: 'text',
            replyTo: replyingTo ? { text: replyingTo.text, sender: replyingTo.sender } : null
        });
        
        await setDoc(chatRef, {
            lastMessage: text,
            lastMessageSender: currentUser,
            isRead: false,
            timestamp: serverTimestamp(),
            participants: (await getDoc(chatRef)).data().participants || activeChatId.split('_')
        }, { merge: true });

    } catch (err) { console.error("Error sending message:", err); }
  };

  const handleImageUpload = async (e) => {
      const file = e.target.files[0];
      if (!file || !activeChatId) return;
      try {
          const storageRef = ref(storage, `chat_images/${activeChatId}/${Date.now()}_${file.name}`);
          const snapshot = await uploadBytes(storageRef, file);
          const downloadURL = await getDownloadURL(snapshot.ref);
          const chatRef = doc(db, "chats", activeChatId);
          await addDoc(collection(chatRef, "messages"), {
              image: downloadURL,
              sender: currentUser,
              timestamp: serverTimestamp(),
              type: 'image'
          });
          await setDoc(chatRef, {
              lastMessage: "Sent an image",
              lastMessageSender: currentUser,
              isRead: false,
              timestamp: serverTimestamp()
          }, { merge: true });
      } catch (err) { console.error(err); }
  };

  const toggleRecording = async () => {
      if (isRecording) {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
      } else {
          try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              mediaRecorderRef.current = new MediaRecorder(stream);
              audioChunksRef.current = [];
              mediaRecorderRef.current.ondataavailable = (event) => {
                  if (event.data.size > 0) audioChunksRef.current.push(event.data);
              };
              mediaRecorderRef.current.onstop = async () => {
                  const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                  await uploadAudio(audioBlob);
                  stream.getTracks().forEach(track => track.stop());
              };
              mediaRecorderRef.current.start();
              setIsRecording(true);
          } catch (err) { alert("Microphone error."); }
      }
  };

  const uploadAudio = async (audioBlob) => {
      if (!activeChatId) return;
      try {
          const fileName = `${Date.now()}_voice.webm`;
          const storageRef = ref(storage, `chat_audio/${activeChatId}/${fileName}`);
          const snapshot = await uploadBytes(storageRef, audioBlob);
          const downloadURL = await getDownloadURL(snapshot.ref);
          const chatRef = doc(db, "chats", activeChatId);
          await addDoc(collection(chatRef, "messages"), {
              audio: downloadURL,
              sender: currentUser,
              timestamp: serverTimestamp(),
              type: 'audio'
          });
          await setDoc(chatRef, {
              lastMessage: "🎤 Voice Message",
              lastMessageSender: currentUser,
              isRead: false,
              timestamp: serverTimestamp()
          }, { merge: true });
      } catch (err) { console.error(err); }
  };

  const startCall = async (type) => {
      const docRef = await addDoc(collection(db, "calls"), {
          caller: currentUser,
          receiver: activeChatUser,
          type: type,
          status: 'ringing',
          offer: null, answer: null, timestamp: serverTimestamp()
      });
      onCallStart(docRef.id);
  };

  const handleStartChat = async (targetUser) => {
      if(isForwardMode) { handleForwardSend(targetUser); return; }
      setIsSearchOpen(false);
      const chatId = [currentUser, targetUser].sort().join("_");
      const chatRef = doc(db, "chats", chatId);
      if (!(await getDoc(chatRef)).exists()) {
        await setDoc(chatRef, {
            participants: [currentUser, targetUser].sort(),
            lastMessage: "",
            lastMessageSender: "",
            timestamp: serverTimestamp(),
            isRead: true,
            typing: {} 
        });
      }
      setActiveChatId(chatId);
      if(onChatSelect) onChatSelect(chatId);
  };

  const triggerFileInput = () => {
      fileInputRef.current.click();
  };

  // Helper to determine list to show
  const displayList = searchQuery ? searchResults : chats.map(c => c.otherUser).filter(u => u !== "Unknown");

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] md:h-[85vh] bg-white md:rounded-2xl md:shadow-xl md:border border-gray-100 overflow-hidden max-w-6xl mx-auto md:mt-0 relative" onClick={() => setSelectedMessage(null)}>
      
      {/* --- LEFT SIDE: CHAT LIST --- */}
      <div className={`w-full md:w-1/3 bg-white flex-col h-full border-r border-gray-100 ${activeChatId ? 'hidden md:flex' : 'flex'}`}>
        <div className="px-4 h-16 flex justify-between items-center bg-white border-b border-gray-100 shrink-0 sticky top-0 z-10">
            <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold font-serif text-gray-900">Messages</h2>
            </div>
            <button onClick={() => { setIsForwardMode(false); setIsSearchOpen(true); }} className="p-2 rounded-full hover:bg-gray-50 text-gray-900"><Edit size={22} /></button>
        </div>

        <div className="flex-1 overflow-y-auto pb-20 custom-scrollbar">
            {loading ? <div className="p-6 text-center text-gray-400">Loading...</div> : chats.length === 0 ? (
                <div className="p-10 text-center flex flex-col items-center text-gray-400 mt-10">
                    <MessageCircle size={48} className="mb-4 opacity-20"/><p className="mb-4">No messages yet.</p>
                    <button onClick={() => { setIsForwardMode(false); setIsSearchOpen(true); }} className="px-6 py-2 bg-black text-white rounded-lg text-sm font-bold shadow-md">Start Chat</button>
                </div>
            ) : (
                chats.map(chat => (
                    <div key={chat.id} onClick={() => { setActiveChatId(chat.id); if(onChatSelect) onChatSelect(chat.id); }} className={`p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition border-b border-gray-50 group relative ${activeChatId === chat.id ? 'bg-gray-50' : ''}`}>
                        <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-gray-200 to-gray-300 flex items-center justify-center text-gray-700 font-bold text-xl shrink-0">{chat.otherUser ? chat.otherUser[0].toUpperCase() : "?"}</div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center mb-0.5">
                                <h4 className={`text-base ${chat.isUnread ? 'font-bold text-black' : 'font-normal text-gray-900'}`}>{chat.otherUser || "Unknown"}</h4>
                                {chat.isUnread && <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse shadow-sm"></div>}
                            </div>
                            <p className={`text-sm truncate ${chat.isUnread ? 'font-bold text-black' : 'text-gray-500'}`}>{chat.lastMessageSender === currentUser ? `You: ${chat.lastMessage}` : chat.lastMessage || "Start conversation"}</p>
                        </div>
                        <button onClick={(e) => {e.stopPropagation(); handleDeleteChat(e, chat.id);}} className="absolute right-4 opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-red-500 transition"><Trash2 size={18} /></button>
                    </div>
                ))
            )}
        </div>
      </div>

      {/* --- RIGHT SIDE: ACTIVE CHAT --- */}
      <div className={`w-full md:w-2/3 flex flex-col bg-white h-full relative ${!activeChatId ? 'hidden md:flex' : 'flex'}`}>
        {activeChatId ? (
            <>
                <div className="h-16 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 flex items-center gap-3 shadow-sm shrink-0 z-10">
                    <button onClick={() => { setActiveChatId(null); if(onChatSelect) onChatSelect(null); }} className="md:hidden p-2 -ml-2 text-gray-900 rounded-full hover:bg-gray-50 transition"><ArrowLeft size={24} /></button>
                    <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center font-bold text-xs">{activeChatUser ? activeChatUser[0].toUpperCase() : "?"}</div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 text-sm leading-tight">{activeChatUser || "Unknown"}</h3>
                        <span className={`text-[10px] ${otherUserStatus === 'online' ? 'text-green-600 font-bold' : 'text-gray-500'}`}>{isOtherTyping ? "Typing..." : (otherUserStatus === 'online' ? "Active now" : "Offline")}</span>
                    </div>
                    <div className="flex gap-3 text-gray-900">
                        <button onClick={() => startCall('audio')}><Phone size={24} strokeWidth={1.5} /></button>
                        <button onClick={() => startCall('video')}><Video size={26} strokeWidth={1.5} /></button>
                        <Info size={24} strokeWidth={1.5} />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 bg-white scrollbar-hide py-4">
                    <div className="flex flex-col items-center justify-center py-8">
                        <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                             <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center text-white font-bold text-2xl">{activeChatUser ? activeChatUser[0].toUpperCase() : "?"}</div>
                        </div>
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
                                    {showDate && (
                                        <div className="flex justify-center my-4">
                                            <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-full uppercase tracking-wider">
                                                {getDayLabel(msg.timestamp.toDate())}
                                            </span>
                                        </div>
                                    )}

                                    <motion.div 
                                        initial={{ opacity: 0, y: 5 }} 
                                        animate={{ opacity: 1, y: 0 }} 
                                        className={`flex ${isMe ? 'justify-end' : 'justify-start'} group relative mb-1`} 
                                        onClick={(e) => handleMessageClick(e, msg)}
                                        onContextMenu={(e) => handleRightClick(e, msg)}
                                    >
                                        <div className={`max-w-[75%] relative`}>
                                            
                                            {msg.replyTo && (
                                                <div className={`text-[10px] mb-1 p-2 rounded-lg border-l-2 border-white/50 ${isMe ? 'bg-blue-700/30 text-blue-100' : 'bg-gray-200 text-gray-600'}`}>
                                                    <p className="font-bold">{msg.replyTo.sender}</p>
                                                    <p className="truncate opacity-80">{msg.replyTo.text}</p>
                                                </div>
                                            )}

                                            <div className={`px-4 py-2.5 text-[15px] leading-relaxed shadow-sm cursor-pointer ${isMe ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm' : 'bg-gray-100 text-gray-900 rounded-2xl rounded-bl-sm'}`}>
                                                {msg.isForwarded && <p className="text-[10px] opacity-70 mb-1 flex items-center gap-1 italic"><Forward size={10}/> Forwarded</p>}
                                                {msg.type === 'image' ? <img src={msg.image} alt="Sent" className="rounded-lg max-w-full max-h-60 object-cover" /> 
                                                : msg.type === 'audio' ? <audio controls src={msg.audio} className="h-8 w-48" /> 
                                                : msg.text}
                                            </div>
                                            
                                            <p className={`text-[9px] mt-1 ${isMe ? 'text-right text-gray-400' : 'text-left text-gray-400'}`}>
                                                {msg.timestamp ? formatTime(msg.timestamp) : "Sending..."}
                                            </p>
                                        </div>
                                    </motion.div>
                                </div>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                <div className="bg-white p-3 border-t border-gray-100 z-40 shrink-0">
                    {replyingTo && (
                        <div className="flex justify-between items-center bg-gray-50 p-2 rounded-lg mb-2 text-xs text-gray-500 border-l-4 border-blue-500">
                            <div><p className="font-bold text-blue-600">Replying to {replyingTo.sender}</p><p className="truncate w-48">{replyingTo.text || "Media"}</p></div>
                            <button onClick={() => setReplyingTo(null)}><X size={16}/></button>
                        </div>
                    )}
                    <form onSubmit={handleSendMessage} className="flex items-center gap-2 bg-gray-100 rounded-full px-2 py-2">
                        <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" hidden />
                        <div className="p-2 bg-blue-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-600 transition text-white" onClick={() => fileInputRef.current.click()}><Camera size={18} /></div>
                        <input value={newMessage} onChange={handleInputChange} placeholder="Message..." className="flex-1 bg-transparent text-gray-900 placeholder-gray-500 text-sm focus:outline-none px-2 h-8"/>
                        {newMessage.trim() ? (
                            <button type="submit" className="text-blue-600 font-bold text-sm px-3 hover:text-blue-700">Send</button>
                        ) : (
                            <div className="flex gap-3 px-3 text-gray-500 items-center">
                                <ImageIcon size={22} onClick={triggerFileInput} />
                                <button type="button" onClick={toggleRecording} className={`transition-all ${isRecording ? 'text-red-500 scale-110 animate-pulse' : 'text-gray-500 hover:text-gray-700'}`}>{isRecording ? <StopCircle size={22} fill="currentColor"/> : <Mic size={22} />}</button>
                            </div>
                        )}
                    </form>
                </div>
            </>
        ) : (
            <div className="hidden md:flex flex-col items-center justify-center h-full text-gray-300">
                <div className="w-24 h-24 rounded-full border-2 border-gray-200 flex items-center justify-center mb-4"><MessageCircle size={48} className="opacity-20 text-black"/></div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">Your Messages</h3>
                <p className="text-gray-400">Send private messages to anyone.</p>
                <button onClick={() => { setIsForwardMode(false); setIsSearchOpen(true); }} className="mt-6 px-6 py-2 bg-blue-500 text-white rounded-lg text-sm font-bold shadow-md">Send Message</button>
            </div>
        )}
      </div>

      {/* --- MESSAGE OPTIONS POPUP (FLOATING BUBBLE) --- */}
      <AnimatePresence>
        {selectedMessage && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/10 backdrop-blur-[2px]" onClick={() => setSelectedMessage(null)}>
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl p-4 flex flex-col gap-2 min-w-[200px]">
                    <h3 className="text-center font-bold text-gray-300 text-xs mb-2 uppercase tracking-widest">Options</h3>
                    <button onClick={handleReply} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl font-medium text-gray-700 text-sm"><Reply size={18} /> Reply</button>
                    {selectedMessage.type === 'text' && <button onClick={handleCopyText} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl font-medium text-gray-700 text-sm"><Copy size={18} /> Copy Text</button>}
                    {selectedMessage.image && <button onClick={handleDownloadImage} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl font-medium text-gray-700 text-sm"><Download size={18} /> Save Image</button>}
                    <button onClick={handleForwardStart} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl font-medium text-gray-700 text-sm"><Forward size={18} /> Forward</button>
                    {selectedMessage.sender === currentUser && <button onClick={handleDeleteMessage} className="flex items-center gap-3 p-3 hover:bg-red-50 rounded-xl font-bold text-red-500 text-sm"><Trash2 size={18} /> Delete</button>}
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* --- SEARCH / FORWARD MODAL --- */}
      <AnimatePresence>
        {isSearchOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => setIsSearchOpen(false)}>
                <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()} className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl h-[500px] flex flex-col">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                        <h3 className="font-bold text-lg">{isForwardMode ? "Forward to..." : "New Message"}</h3>
                        <button onClick={() => setIsSearchOpen(false)}><X size={20}/></button>
                    </div>
                    <div className="p-3 border-b border-gray-100 flex items-center gap-2">
                        <span className="text-gray-400 font-bold text-sm pl-2">To:</span>
                        <input autoFocus placeholder="Search user..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="flex-1 p-2 outline-none text-sm placeholder-gray-400 bg-transparent"/>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        <p className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">{searchQuery ? "Results" : "Recent Chats"}</p>
                        
                        {/* ⚡ UPDATED: Show Recent Chats if Search is Empty */}
                        {(searchQuery ? searchResults : displayList).length > 0 ? (
                            (searchQuery ? searchResults : displayList).map(user => (
                                <div key={user} onClick={() => handleStartChat(user)} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl cursor-pointer transition">
                                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">{user ? user[0].toUpperCase() : "?"}</div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-sm text-gray-900">@{user}</h4>
                                        <p className="text-xs text-gray-500">ShayariGram User</p>
                                    </div>
                                    {isForwardMode && <button className="px-3 py-1 bg-blue-500 text-white rounded-md text-xs font-bold">Send</button>}
                                </div>
                            ))
                        ) : <div className="text-center py-10 text-gray-400 text-sm">No users found.</div>}
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChatPage;