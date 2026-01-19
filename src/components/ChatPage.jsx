import { useState, useEffect, useRef } from 'react';
import { db, storage } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, doc, getDoc, setDoc, updateDoc, getDocs, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ArrowLeft, Edit, MessageCircle, X, Phone, Video, Camera, Info, Image as ImageIcon, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ChatPage = ({ currentUser, initialChatId, onBack, onCallStart }) => {
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(initialChatId || null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  
  // Search State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]); 

  // Active Chat Header
  const [activeChatUser, setActiveChatUser] = useState(null);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // 1. FETCH CHAT LIST (ROBUST MODE)
  useEffect(() => {
    if (!currentUser) {
        setLoading(false);
        return;
    }

    console.log("Fetching chats for user:", currentUser);
    
    // ⚡ FIX: Removed 'orderBy' to prevent hidden chats (missing timestamp)
    // We will sort them in Javascript instead.
    const q = query(
      collection(db, "chats"), 
      where("participants", "array-contains", currentUser)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log(`Found ${snapshot.docs.length} chat documents.`);
      
      const chatList = snapshot.docs.map(doc => {
        const data = doc.data();
        const participants = data.participants || [];
        const otherUser = participants.find(p => p && p !== currentUser) || "Unknown User";
        
        return { 
            id: doc.id, 
            ...data, 
            otherUser, 
            isUnread: data.isRead === false && data.lastMessageSender !== currentUser 
        };
      });

      // ⚡ SORT HERE INSTEAD (Handles missing timestamps gracefully)
      chatList.sort((a, b) => {
          const tA = a.timestamp?.seconds || 0;
          const tB = b.timestamp?.seconds || 0;
          return tB - tA; // Newest first
      });

      setChats(chatList);
      setLoading(false);
    }, (error) => {
        console.error("🔥 Chat List Error:", error);
        setLoading(false);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // 2. UPDATE HEADER
  useEffect(() => {
    if (!activeChatId || !currentUser) return;

    const chat = chats.find(c => c.id === activeChatId);
    
    if (chat) {
        setActiveChatUser(chat.otherUser);
        if (chat.isUnread) {
            updateDoc(doc(db, "chats", activeChatId), { isRead: true });
        }
    } else {
        const parts = activeChatId.split('_');
        const other = parts.find(p => p !== currentUser) || "Unknown";
        setActiveChatUser(other);
    }
  }, [activeChatId, chats, currentUser]);

  // 3. MESSAGES LISTENER
  useEffect(() => {
    if (!activeChatId) return;

    const q = query(
      collection(db, "chats", activeChatId, "messages"),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });

    return () => unsubscribe();
  }, [activeChatId]);

  // 4. GLOBAL SEARCH
  useEffect(() => {
    if (!isSearchOpen) return;

    const searchUsers = async () => {
        try {
            let q;
            if (searchQuery.trim() === "") {
                q = query(collection(db, "users"), limit(10));
            } else {
                q = query(
                    collection(db, "users"), 
                    where("username", ">=", searchQuery),
                    where("username", "<=", searchQuery + '\uf8ff'),
                    limit(10)
                );
            }

            const snapshot = await getDocs(q);
            const users = snapshot.docs
                .map(doc => doc.data().username)
                .filter(u => u && u !== currentUser); 
            
            setSearchResults(users);
        } catch (error) {
            console.error("Search Error:", error);
        }
    };

    const timer = setTimeout(() => {
        searchUsers();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, isSearchOpen, currentUser]);

  // --- HANDLERS ---
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChatId) return;

    const text = newMessage;
    setNewMessage(""); 

    try {
        const chatRef = doc(db, "chats", activeChatId);
        
        await addDoc(collection(chatRef, "messages"), {
            text: text,
            sender: currentUser,
            timestamp: serverTimestamp(),
            type: 'text'
        });

        const chatSnap = await getDoc(chatRef);
        if (!chatSnap.exists()) {
             await setDoc(chatRef, {
                participants: activeChatId.split('_'),
                lastMessage: text,
                lastMessageSender: currentUser,
                isRead: false,
                timestamp: serverTimestamp(),
            });
        } else {
             await setDoc(chatRef, {
                lastMessage: text,
                lastMessageSender: currentUser,
                isRead: false,
                timestamp: serverTimestamp(),
                participants: chatSnap.data().participants 
            }, { merge: true });
        }
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
      } catch (err) { console.error("Error uploading image:", err); }
  };

  const startCall = async (type) => {
      const docRef = await addDoc(collection(db, "calls"), {
          caller: currentUser,
          receiver: activeChatUser,
          type: type,
          status: 'ringing',
          offer: null, 
          answer: null,
          timestamp: serverTimestamp()
      });
      onCallStart(docRef.id);
  };

  const handleStartChat = async (targetUser) => {
      setIsSearchOpen(false);
      const chatId = [currentUser, targetUser].sort().join("_");
      
      const chatRef = doc(db, "chats", chatId);
      const chatSnap = await getDoc(chatRef);
      
      if (!chatSnap.exists()) {
        await setDoc(chatRef, {
            participants: [currentUser, targetUser].sort(),
            lastMessage: "",
            lastMessageSender: "",
            timestamp: serverTimestamp(),
            isRead: true
        });
      }
      setActiveChatId(chatId);
  };

  const triggerFileInput = () => {
      fileInputRef.current.click();
  };

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] md:h-[85vh] bg-white md:rounded-2xl md:shadow-xl md:border border-gray-100 overflow-hidden max-w-6xl mx-auto md:mt-0 relative">
      
      {/* --- LEFT SIDE: CHAT LIST --- */}
      <div className={`w-full md:w-1/3 bg-white flex-col h-full border-r border-gray-100 ${activeChatId ? 'hidden md:flex' : 'flex'}`}>
        <div className="px-4 h-16 flex justify-between items-center bg-white border-b border-gray-100 shrink-0 sticky top-0 z-10">
            <div className="flex items-center gap-3">
                <button onClick={onBack} className="md:hidden p-2 -ml-2 rounded-full hover:bg-gray-50 text-gray-900 transition">
                    <ArrowLeft size={24} />
                </button>
                <h2 className="text-xl font-bold font-serif text-gray-900">Messages</h2>
            </div>
            <button onClick={() => setIsSearchOpen(true)} className="p-2 rounded-full hover:bg-gray-50 text-gray-900">
                <Edit size={22} />
            </button>
        </div>

        <div className="flex-1 overflow-y-auto pb-20 custom-scrollbar">
            {loading ? (
                <div className="p-6 text-center text-gray-400">Loading...</div>
            ) : chats.length === 0 ? (
                <div className="p-10 text-center flex flex-col items-center text-gray-400 mt-10">
                    <MessageCircle size={48} className="mb-4 opacity-20"/>
                    <p className="mb-4">No messages yet.</p>
                    <button onClick={() => setIsSearchOpen(true)} className="px-6 py-2 bg-black text-white rounded-lg text-sm font-bold shadow-md">Start Chat</button>
                </div>
            ) : (
                chats.map(chat => (
                    <div 
                        key={chat.id} 
                        onClick={() => setActiveChatId(chat.id)}
                        className={`p-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition border-b border-gray-50 ${activeChatId === chat.id ? 'bg-gray-50' : ''}`}
                    >
                        <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-gray-200 to-gray-300 flex items-center justify-center text-gray-700 font-bold text-xl shrink-0">
                            {chat.otherUser ? chat.otherUser[0].toUpperCase() : "?"}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center mb-0.5">
                                <h4 className={`text-base ${chat.isUnread ? 'font-bold text-black' : 'font-normal text-gray-900'}`}>
                                    {chat.otherUser || "Unknown"}
                                </h4>
                                {chat.isUnread && (
                                    <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse shadow-sm"></div>
                                )}
                            </div>
                            <p className={`text-sm truncate ${chat.isUnread ? 'font-bold text-black' : 'text-gray-500'}`}>
                                {chat.lastMessageSender === currentUser ? `You: ${chat.lastMessage}` : chat.lastMessage || "Start a conversation"}
                            </p>
                        </div>
                    </div>
                ))
            )}
        </div>
      </div>

      {/* --- RIGHT SIDE: ACTIVE CHAT --- */}
      <div className={`w-full md:w-2/3 flex flex-col bg-white h-full relative ${!activeChatId ? 'hidden md:flex' : 'flex'}`}>
        {activeChatId ? (
            <>
                <div className="absolute top-0 left-0 right-0 z-50 h-16 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 flex items-center gap-3 shadow-sm">
                    <button onClick={() => setActiveChatId(null)} className="md:hidden p-2 -ml-2 text-gray-900 rounded-full hover:bg-gray-50 transition">
                        <ArrowLeft size={24} />
                    </button>
                    <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center font-bold text-xs">
                        {activeChatUser ? activeChatUser[0].toUpperCase() : "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 text-sm leading-tight">{activeChatUser || "Unknown"}</h3>
                        <span className="text-[10px] text-gray-500">Active now</span>
                    </div>
                    <div className="flex gap-3 text-gray-900">
                        <button onClick={() => startCall('audio')} className="hover:text-blue-500 transition"><Phone size={24} strokeWidth={1.5} /></button>
                        <button onClick={() => startCall('video')} className="hover:text-blue-500 transition"><Video size={26} strokeWidth={1.5} /></button>
                        <Info size={24} strokeWidth={1.5} />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 bg-white scrollbar-hide pt-20 pb-32">
                    <div className="flex flex-col items-center justify-center py-8">
                        <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                             <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center text-white font-bold text-2xl">
                                {activeChatUser ? activeChatUser[0].toUpperCase() : "?"}
                             </div>
                        </div>
                        <h3 className="font-bold text-xl text-gray-900">{activeChatUser}</h3>
                        <p className="text-sm text-gray-500 mb-4">ShayariGram User</p>
                    </div>

                    <div className="space-y-1">
                        {messages.map((msg) => {
                            const isMe = msg.sender === currentUser;
                            return (
                                <motion.div 
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    key={msg.id} 
                                    className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`max-w-[75%] px-4 py-2.5 text-[15px] leading-relaxed break-words shadow-sm ${
                                        isMe 
                                        ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm' 
                                        : 'bg-gray-100 text-gray-900 rounded-2xl rounded-bl-sm'
                                    }`}>
                                        {msg.type === 'image' ? (
                                            <img src={msg.image} alt="Sent" className="rounded-lg max-w-full max-h-60 object-cover" />
                                        ) : msg.text}
                                    </div>
                                </motion.div>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                <div className="absolute bottom-[56px] md:bottom-0 left-0 right-0 bg-white p-3 border-t border-gray-100 z-40">
                    <form onSubmit={handleSendMessage} className="flex items-center gap-2 bg-gray-100 rounded-full px-2 py-2">
                        <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" hidden />
                        <div 
                            className="p-2 bg-blue-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-600 transition text-white"
                            onClick={() => fileInputRef.current.click()} 
                        >
                            <Camera size={18} />
                        </div>
                        <input 
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="Message..."
                            className="flex-1 bg-transparent text-gray-900 placeholder-gray-500 text-sm focus:outline-none px-2 h-8"
                        />
                        {newMessage.trim() ? (
                            <button type="submit" className="text-blue-600 font-bold text-sm px-3 hover:text-blue-700">Send</button>
                        ) : (
                            <div className="flex gap-3 px-3 text-gray-500 items-center">
                                <ImageIcon size={22} className="cursor-pointer hover:text-gray-700" onClick={triggerFileInput} />
                                <Heart size={22} className="cursor-pointer hover:text-gray-700" />
                            </div>
                        )}
                    </form>
                </div>
            </>
        ) : (
            <div className="hidden md:flex flex-col items-center justify-center h-full text-gray-300">
                <div className="w-24 h-24 rounded-full border-2 border-gray-200 flex items-center justify-center mb-4">
                    <MessageCircle size={48} className="opacity-20 text-black"/>
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">Your Messages</h3>
                <p className="text-gray-400">Send private messages to anyone.</p>
                <button onClick={() => setIsSearchOpen(true)} className="mt-6 px-6 py-2 bg-blue-500 text-white rounded-lg text-sm font-bold shadow-md">Send Message</button>
            </div>
        )}
      </div>

      {/* --- SEARCH MODAL --- */}
      <AnimatePresence>
        {isSearchOpen && (
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
                onClick={() => setIsSearchOpen(false)}
            >
                <motion.div 
                    initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                    onClick={e => e.stopPropagation()}
                    className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl h-[500px] flex flex-col"
                >
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                        <h3 className="font-bold text-lg">New Message</h3>
                        <button onClick={() => setIsSearchOpen(false)}><X size={20}/></button>
                    </div>
                    
                    <div className="p-3 border-b border-gray-100 flex items-center gap-2">
                        <span className="text-gray-400 font-bold text-sm pl-2">To:</span>
                        <input 
                            autoFocus
                            placeholder="Search user..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="flex-1 p-2 outline-none text-sm placeholder-gray-400 bg-transparent"
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto p-2">
                        <p className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Suggested</p>
                        {searchResults.length > 0 ? (
                            searchResults.map(user => (
                                <div 
                                    key={user} 
                                    onClick={() => handleStartChat(user)}
                                    className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl cursor-pointer transition"
                                >
                                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">
                                        {/* SAFETY FIX */}
                                        {user ? user[0].toUpperCase() : "?"}
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-sm text-gray-900">@{user}</h4>
                                        <p className="text-xs text-gray-500">ShayariGram User</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-10 text-gray-400 text-sm">
                                No users found.
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default ChatPage;