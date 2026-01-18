import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ArrowLeft, Edit, MoreVertical, MessageCircle, Send, X, Phone, Video, Camera, Info, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ChatPage = ({ currentUser, initialChatId, onBack }) => {
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(initialChatId || null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  
  // Search / New Chat State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mutualUsers, setMutualUsers] = useState([]); 
  const [filteredUsers, setFilteredUsers] = useState([]);

  // Data for the active chat header
  const [activeChatUser, setActiveChatUser] = useState(null);
  const messagesEndRef = useRef(null);

  // 1. FETCH CHAT LIST (Inbox)
  useEffect(() => {
    if (!currentUser) return;
    
    // NOTE: If chats don't load, CHECK CONSOLE (F12). Click the link from Firebase to create the Index.
    const q = query(
      collection(db, "chats"), 
      where("participants", "array-contains", currentUser),
      orderBy("timestamp", "desc")
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatList = snapshot.docs.map(doc => {
        const data = doc.data();
        const otherUser = data.participants.find(p => p !== currentUser);
        return { id: doc.id, ...data, otherUser };
      });
      setChats(chatList);
      setLoading(false);
    }, (error) => {
        console.error("Firebase Index Error: Check Console for link", error);
        setLoading(false);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // 2. FETCH MESSAGES & ACTIVE USER
  useEffect(() => {
    if (!activeChatId) return;

    const chat = chats.find(c => c.id === activeChatId);
    if (chat) {
        setActiveChatUser(chat.otherUser);
    } else {
        const parts = activeChatId.split('_');
        const other = parts.find(p => p !== currentUser);
        setActiveChatUser(other);
    }

    const q = query(
      collection(db, "chats", activeChatId, "messages"),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      // Scroll to bottom
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "auto" }), 100);
    });

    return () => unsubscribe();
  }, [activeChatId, chats, currentUser]);

  // 3. FETCH MUTUALS (For Search)
  useEffect(() => {
    if (isSearchOpen) {
        const fetchMutuals = async () => {
            const userDoc = await getDoc(doc(db, "users", currentUser));
            if (userDoc.exists()) {
                const data = userDoc.data();
                const following = data.following || [];
                const followers = data.followers || [];
                const mutualIds = following.filter(id => followers.includes(id));
                setMutualUsers(mutualIds);
                setFilteredUsers(mutualIds);
            }
        };
        fetchMutuals();
    }
  }, [isSearchOpen, currentUser]);

  useEffect(() => {
      if (!searchQuery) {
          setFilteredUsers(mutualUsers);
      } else {
          setFilteredUsers(mutualUsers.filter(u => u.toLowerCase().includes(searchQuery.toLowerCase())));
      }
  }, [searchQuery, mutualUsers]);

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
            timestamp: serverTimestamp()
        });
        await setDoc(chatRef, {
            lastMessage: text,
            timestamp: serverTimestamp(),
            participants: [currentUser, activeChatUser].sort()
        }, { merge: true });
    } catch (err) { console.error("Error sending message:", err); }
  };

  const handleStartChat = async (targetUser) => {
      setIsSearchOpen(false);
      const chatId = [currentUser, targetUser].sort().join("_");
      setActiveChatId(chatId);
  };

  const handleBackNavigation = () => {
      if (activeChatId) {
          // If in a chat, go back to list
          setActiveChatId(null);
      } else {
          // If in list, go back to previous screen (Home/Profile)
          onBack();
      }
  };

  return (
    // MAIN WRAPPER
    <div className="flex flex-col md:flex-row h-[100dvh] md:h-[85vh] bg-white md:rounded-2xl md:shadow-xl md:border border-gray-100 overflow-hidden max-w-6xl mx-auto md:mt-0 relative">
      
      {/* --- LEFT SIDE: CHAT LIST --- */}
      <div className={`w-full md:w-1/3 bg-white flex-col h-full border-r border-gray-100 ${activeChatId ? 'hidden md:flex' : 'flex'}`}>
        
        {/* Header */}
        <div className="px-4 h-16 flex justify-between items-center bg-white border-b border-gray-100 shrink-0 sticky top-0 z-10">
            <div className="flex items-center gap-3">
                <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-50 text-gray-900 transition">
                    <ArrowLeft size={24} />
                </button>
                <h2 className="text-xl font-bold font-serif">Messages</h2>
            </div>
            <button onClick={() => setIsSearchOpen(true)} className="p-2 rounded-full hover:bg-gray-50 text-gray-900">
                <Edit size={22} />
            </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto pb-20">
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
                            <h4 className="font-bold text-gray-900 text-base">{chat.otherUser}</h4>
                            <p className={`text-sm truncate mt-0.5 ${!chat.lastMessage ? 'text-gray-400' : 'text-gray-500'}`}>
                                {chat.lastMessage || "Start a conversation"}
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
                {/* 1. HEADER (Fixed Top) */}
                <div className="absolute top-0 left-0 right-0 z-50 h-16 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 flex items-center gap-3 shadow-sm">
                    {/* BACK BUTTON: Goes back to Chat List on mobile */}
                    <button onClick={() => setActiveChatId(null)} className="md:hidden p-2 -ml-2 text-gray-900 rounded-full hover:bg-gray-50">
                        <ArrowLeft size={24} />
                    </button>
                    
                    <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center font-bold text-xs">
                        {activeChatUser ? activeChatUser[0].toUpperCase() : "?"}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 text-sm leading-tight">{activeChatUser}</h3>
                        <span className="text-[10px] text-gray-500">Active now</span>
                    </div>
                    
                    <div className="flex gap-3 text-gray-900">
                        <Phone size={22} strokeWidth={1.5} />
                        <Video size={22} strokeWidth={1.5} />
                        <Info size={22} strokeWidth={1.5} />
                    </div>
                </div>

                {/* 2. MESSAGES (Scrollable Middle) */}
                {/* pt-20 clears header, pb-32 clears input + mobile nav */}
                <div className="flex-1 overflow-y-auto px-4 bg-white scrollbar-hide pt-20 pb-32">
                    
                    {/* Profile Intro */}
                    <div className="flex flex-col items-center justify-center py-8">
                        <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                             <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center text-white font-bold text-2xl">
                                {activeChatUser ? activeChatUser[0].toUpperCase() : "?"}
                             </div>
                        </div>
                        <h3 className="font-bold text-xl text-gray-900">{activeChatUser}</h3>
                        <p className="text-sm text-gray-500 mb-4">ShayariGram User • You follow each other</p>
                        <button className="px-4 py-1.5 bg-gray-100 rounded-lg text-sm font-semibold text-gray-900">View Profile</button>
                    </div>

                    {/* Bubbles */}
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
                                        {msg.text}
                                    </div>
                                </motion.div>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {/* 3. INPUT (Fixed Bottom - Above Nav) */}
                <div className="absolute bottom-[56px] md:bottom-0 left-0 right-0 bg-white p-3 border-t border-gray-100 z-40">
                    <form onSubmit={handleSendMessage} className="flex items-center gap-2 bg-gray-100 rounded-full px-2 py-2">
                        <div className="p-2 bg-blue-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-600 transition text-white">
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
                            <div className="flex gap-3 px-3 text-gray-500">
                                <MessageCircle size={22} />
                                <ImageIcon size={22} />
                            </div>
                        )}
                    </form>
                </div>
            </>
        ) : (
            // Desktop Placeholder
            <div className="hidden md:flex flex-col items-center justify-center h-full text-gray-300">
                <div className="w-24 h-24 rounded-full border-2 border-gray-200 flex items-center justify-center mb-4">
                    <MessageCircle size={48} className="opacity-20 text-black"/>
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">Your Messages</h3>
                <p className="text-gray-400">Send private messages to a friend.</p>
                <button onClick={() => setIsSearchOpen(true)} className="mt-6 px-6 py-2 bg-blue-500 text-white rounded-lg text-sm font-bold shadow-md">Send Message</button>
            </div>
        )}
      </div>

      {/* --- NEW CHAT MODAL --- */}
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
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="flex-1 p-2 outline-none text-sm placeholder-gray-400"
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto p-2">
                        <p className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Suggested</p>
                        {filteredUsers.length > 0 ? (
                            filteredUsers.map(user => (
                                <div 
                                    key={user} 
                                    onClick={() => handleStartChat(user)}
                                    className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl cursor-pointer transition"
                                >
                                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-bold text-gray-600">
                                        {user[0].toUpperCase()}
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-sm text-gray-900">@{user}</h4>
                                        <p className="text-xs text-gray-500">Mutual Follower</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-10 text-gray-400 text-sm">
                                No mutual followers found.<br/>
                                <span className="text-xs opacity-70">(You can only message people who follow you back)</span>
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