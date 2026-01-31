import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase'; 
import { 
  collection, query, orderBy, onSnapshot, doc, updateDoc, arrayUnion, 
  arrayRemove, addDoc, serverTimestamp, getDocs, where, limit, increment 
} from 'firebase/firestore';
import { 
  Heart, MessageCircle, Send, Bookmark, X, Loader2, Share2, 
  MoreVertical, Reply as ReplyIcon, Search, Check, Link as LinkIcon, Bell
} from 'lucide-react'; 
import { motion, AnimatePresence } from 'framer-motion';

const ShayariFeed = ({ onProfileClick, onPostClick, blockedUsers = [] }) => {
  const [posts, setPosts] = useState([]);
  const [currentUser] = useState(localStorage.getItem('shayari_user'));
  const [loading, setLoading] = useState(true);
  const [unreadNotifications, setUnreadNotifications] = useState(0); 
  const [savedPosts, setSavedPosts] = useState([]); // Tracks saved state locally

  // Modal & Comment States
  const [activeCommentPostId, setActiveCommentPostId] = useState(null); 
  const [shareModalPostId, setShareModalPostId] = useState(null);
  const [commentText, setCommentText] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [comments, setComments] = useState([]);

  // Share Modal States
  const [shareRecentChats, setShareRecentChats] = useState([]);
  const [randomUsers, setRandomUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [isSending, setIsSending] = useState(false);

  const commentsEndRef = useRef(null);
  const inputRef = useRef(null);

  // --- 1. REAL-TIME LISTENERS (Notifications & User Data) ---
  useEffect(() => {
    if (!currentUser) return;
    
    // Notification listener
    const qNote = query(
      collection(db, "notifications"),
      where("toUser", "==", currentUser),
      where("read", "==", false)
    );
    const unsubNote = onSnapshot(qNote, (snapshot) => {
      setUnreadNotifications(snapshot.size); 
    });

    // Saved posts listener
    const qUser = query(collection(db, "users"), where("username", "==", currentUser));
    const unsubUser = onSnapshot(qUser, (snap) => {
      if (!snap.empty) setSavedPosts(snap.docs[0].data().saved || []);
    });

    return () => { unsubNote(); unsubUser(); };
  }, [currentUser]);

  // --- 2. FORMATTERS ---
  const formatCount = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num || 0;
  };

  const formatTimestamp = (ts) => {
    if (!ts) return "Just now";
    const date = ts.toDate();
    const diff = Math.floor((new Date() - date) / 1000);
    if (diff < 3600) return Math.floor(diff / 60) + "m";
    if (diff < 86400) return Math.floor(diff / 3600) + "h";
    const days = Math.floor(diff / 86400);
    if (days < 7) return days + "d";
    return Math.floor(days / 7) + "w";
  };

  // --- 3. DATA FETCHING (Posts & Comments) ---
  useEffect(() => {
    const q = query(collection(db, "shayaris"), orderBy("timestamp", "desc"));
    return onSnapshot(q, (snapshot) => {
      setPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(p => !blockedUsers.includes(p.author)));
      setLoading(false);
    });
  }, [blockedUsers]);

  useEffect(() => {
    if (!activeCommentPostId) return;
    const q = query(collection(db, "shayaris", activeCommentPostId, "comments"), orderBy("timestamp", "asc"));
    return onSnapshot(q, (snap) => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 150);
    });
  }, [activeCommentPostId]);

  // --- 4. TOGGLE & SHARE LOGIC ---
  const toggleCommentPopup = (postId) => {
    if (activeCommentPostId === postId) {
      setActiveCommentPostId(null);
      setReplyingTo(null);
    } else {
      setActiveCommentPostId(postId);
    }
  };

  const openShareModal = async (postId) => {
    setShareModalPostId(postId);
    setSelectedRecipients([]);
    const chatQ = query(collection(db, "chats"), where("participants", "array-contains", currentUser), orderBy("timestamp", "desc"), limit(3));
    const chatSnap = await getDocs(chatQ);
    setShareRecentChats(chatSnap.docs.map(d => ({ id: d.id, username: d.data().participants.find(p => p !== currentUser) })));

    const userQ = query(collection(db, "users"), limit(10));
    const userSnap = await getDocs(userQ);
    setRandomUsers(userSnap.docs.map(d => ({ id: d.id, username: d.data().username })).filter(u => u.username !== currentUser).sort(() => 0.5 - Math.random()).slice(0, 5));
  };

  const handleFinalShare = async () => {
    setIsSending(true);
    const promises = selectedRecipients.map(async (rec) => {
      const chatRef = doc(db, "chats", rec.id);
      await addDoc(collection(chatRef, "messages"), { sender: currentUser, timestamp: serverTimestamp(), isPostShare: true, postId: shareModalPostId, text: 'Shared a post' });
      await updateDoc(chatRef, { timestamp: serverTimestamp(), lastMessage: "Shared a post", isRead: false });
    });
    await Promise.all(promises);
    setShareModalPostId(null);
    setIsSending(false);
  };

  const shareToWhatsApp = (post) => {
    const text = `Check out this shayari by @${post.author}: "${post.content}"\n\nRead more on ShayariGram: ${window.location.origin}/post/${post.id}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  // --- 5. ENGAGEMENT HANDLERS ---
  const handleLike = async (postId, likedBy) => {
    const isLiked = likedBy.includes(currentUser);
    await updateDoc(doc(db, "shayaris", postId), { likes: increment(isLiked ? -1 : 1), likedBy: isLiked ? arrayRemove(currentUser) : arrayUnion(currentUser) });
  };

  const handleSave = async (postId) => {
    const userQ = query(collection(db, "users"), where("username", "==", currentUser));
    const userSnap = await getDocs(userQ);
    if (!userSnap.empty) {
      const isAlreadySaved = savedPosts.includes(postId);
      await updateDoc(userSnap.docs[0].ref, {
        saved: isAlreadySaved ? arrayRemove(postId) : arrayUnion(postId)
      });
    }
  };

  const handleCommentLike = async (commentId, likedBy = []) => {
    const isLiked = likedBy.includes(currentUser);
    await updateDoc(doc(db, "shayaris", activeCommentPostId, "comments", commentId), { likes: increment(isLiked ? -1 : 1), likedBy: isLiked ? arrayRemove(currentUser) : arrayUnion(currentUser) });
  };

  const submitComment = async () => {
    if (!commentText.trim()) return;
    const targetId = activeCommentPostId;
    const replyData = replyingTo;
    setCommentText(""); setReplyingTo(null);

    await addDoc(collection(db, "shayaris", targetId, "comments"), {
      text: commentText, username: currentUser, timestamp: serverTimestamp(),
      isReply: !!replyData, replyToUser: replyData ? replyData.username : null,
      likes: 0, likedBy: []
    });
    await updateDoc(doc(db, "shayaris", targetId), { commentCount: increment(1) });
  };

  if (loading) return <div className="flex h-screen items-center justify-center bg-[#222831]"><Loader2 className="animate-spin text-[#00adb5]" size={40}/></div>;

  return (
    <div className="max-w-2xl mx-auto pb-20 px-4 pt-4">
      {/* Notification Banner */}
      <AnimatePresence>
        {unreadNotifications > 0 && (
          <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-[#00adb5] text-white p-3 rounded-2xl mb-6 flex justify-between items-center shadow-lg">
            <div className="flex items-center gap-2"><Bell size={18} fill="white"/><span className="text-xs font-bold">{unreadNotifications} new activities waiting!</span></div>
          </motion.div>
        )}
      </AnimatePresence>

      {posts.map(post => (
        <motion.div key={post.id} className="mb-8 rounded-[2rem] bg-[#393e46] shadow-2xl overflow-hidden relative">
            <div className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => onProfileClick(post.author)}>
                <div className="w-10 h-10 rounded-full bg-[#00adb5] flex items-center justify-center font-bold text-white uppercase">{post.author[0]}</div>
                <span className="font-bold text-[#eeeeee]">@{post.author}</span>
              </div>
              <MoreVertical size={18} className="text-gray-500" />
            </div>

            <div className="px-8 py-12 text-center min-h-[200px] cursor-pointer" style={{ background: post.bgColor }} onClick={() => onPostClick(post.id)}>
              <p className="font-serif text-lg md:text-xl leading-relaxed whitespace-pre-wrap" style={{ color: post.textColor }}>{post.content}</p>
            </div>

            <div className="p-5 flex items-center justify-between bg-black/10">
              <div className="flex items-center gap-8">
                <button onClick={(e) => { e.stopPropagation(); handleLike(post.id, post.likedBy || []) }} className="flex flex-col items-center gap-1 group">
                  <Heart size={26} className={post.likedBy?.includes(currentUser) ? "fill-red-500 text-red-500 scale-110" : "text-gray-400 group-hover:text-red-400"} />
                  <span className="text-[10px] text-gray-500 font-bold">{formatCount(post.likes)}</span>
                </button>
                
                {/* 🔥 Toggle Comments Popup FIXED */}
                <button onClick={(e) => { e.stopPropagation(); toggleCommentPopup(post.id) }} className="flex flex-col items-center gap-1 group">
                  <MessageCircle size={26} className={activeCommentPostId === post.id ? "text-[#00adb5]" : "text-gray-400 group-hover:text-[#00adb5]"} />
                  <span className="text-[10px] text-gray-500 font-bold">{formatCount(post.commentCount)}</span>
                </button>

                {/* 🔥 Share Modal FIXED */}
                <button onClick={(e) => { e.stopPropagation(); openShareModal(post.id) }} className="flex flex-col items-center gap-1">
                  <Send size={26} className="text-gray-400 hover:text-[#00adb5]" />
                </button>
              </div>
              <button onClick={(e) => { e.stopPropagation(); handleSave(post.id) }}>
                <Bookmark size={26} className={savedPosts.includes(post.id) ? "fill-white text-white" : "text-gray-400"} />
              </button>
            </div>
        </motion.div>
      ))}

      {/* COMMENT POPUP (Centered 5-Comment Block Design) */}
      <AnimatePresence>
        {activeCommentPostId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4" onClick={() => setActiveCommentPostId(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-[#222831] w-full max-w-lg h-[600px] rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl border border-gray-800" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-[#222831]">
                <h3 className="font-bold text-xl text-[#eeeeee]">Comments</h3>
                <button onClick={() => setActiveCommentPostId(null)}><X size={24} className="text-gray-400"/></button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar scroll-smooth">
                {comments.map(c => (
                  <div key={c.id} className={`flex gap-4 items-start ${c.isReply ? 'ml-8' : ''}`}>
                    <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-md">
                        {c.username[0].toUpperCase()}
                    </div>
                    <div className="flex-1">
                        <div className="flex justify-between items-baseline mb-1">
                          <span className="text-sm font-bold text-[#00adb5]">@{c.username}</span>
                          <span className="text-[9px] text-gray-500 font-bold">{formatTimestamp(c.timestamp)}</span>
                        </div>
                        <div className={`p-4 rounded-2xl rounded-tl-none shadow-sm ${c.isReply ? 'bg-[#2d333b]' : 'bg-[#393e46]'}`}>
                            <p className="text-sm text-gray-200">{c.replyToUser && <span className="text-[#00adb5] font-bold mr-1">@{c.replyToUser}</span>}{c.text}</p>
                        </div>
                        <div className="flex gap-4 mt-2 px-1">
                            <button onClick={() => handleCommentLike(c.id, c.likedBy)} className={`flex items-center gap-1 text-[10px] font-bold ${c.likedBy?.includes(currentUser) ? 'text-red-500' : 'text-gray-500'}`}>
                                <Heart size={14} className={c.likedBy?.includes(currentUser) ? "fill-red-500" : ""} /> {formatCount(c.likes)}
                            </button>
                            <button onClick={() => {setReplyingTo(c); setCommentText(`@${c.username} `); if(inputRef.current) inputRef.current.focus();}} className="text-[10px] font-bold text-gray-500 flex items-center gap-1 hover:text-[#00adb5] uppercase tracking-widest"><ReplyIcon size={12}/> Reply</button>
                        </div>
                    </div>
                  </div>
                ))}
                <div ref={commentsEndRef} />
              </div>
              <div className="p-5 bg-[#1a1f26] flex flex-col gap-2">
                {replyingTo && <div className="flex justify-between px-4 py-1 bg-[#00adb5]/10 rounded-full"><p className="text-[10px] text-[#00adb5] font-bold">Replying to @{replyingTo.username}</p><button onClick={() => setReplyingTo(null)}><X size={12} className="text-gray-500"/></button></div>}
                <div className="flex gap-3 items-center">
                    <input ref={inputRef} value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitComment()} placeholder="Share thoughts..." className="flex-1 bg-[#393e46] text-white p-4 rounded-2xl outline-none text-sm placeholder-gray-500 focus:ring-1 focus:ring-[#00adb5]" />
                    <button onClick={submitComment} className="bg-[#00adb5] text-white w-12 h-12 rounded-2xl flex items-center justify-center shadow-xl active:scale-95 transition-all"><Send size={20} /></button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SHARE MODAL */}
      <AnimatePresence>
        {shareModalPostId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShareModalPostId(null)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-[#222831] w-full max-w-sm rounded-[2rem] p-6 border border-gray-800 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-xl text-[#eeeeee]">Share Shayari</h3><X className="text-gray-500 cursor-pointer hover:text-white transition" onClick={() => setShareModalPostId(null)} /></div>
              
              <div className="flex gap-3 mb-6">
                <button onClick={() => shareToWhatsApp(posts.find(p => p.id === shareModalPostId))} className="flex-1 flex flex-col items-center gap-2 p-4 bg-[#25D366]/10 rounded-2xl group transition-all active:scale-95">
                    <div className="w-10 h-10 rounded-full bg-[#25D366] flex items-center justify-center text-white shadow-lg"><Share2 size={20} /></div>
                    <span className="text-[10px] font-bold text-white uppercase">WhatsApp</span>
                </button>
                <button onClick={() => {navigator.clipboard.writeText(`${window.location.origin}/post/${shareModalPostId}`); alert("Link Copied!");}} className="flex-1 flex flex-col items-center gap-2 p-4 bg-[#393e46] rounded-2xl group transition-all active:scale-95">
                    <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-white shadow-lg"><LinkIcon size={20} /></div>
                    <span className="text-[10px] font-bold text-white uppercase">Copy Link</span>
                </button>
              </div>

              <div className="relative mb-6">
                <Search size={16} className="absolute left-3 top-3 text-gray-500" />
                <input type="text" placeholder="Search people..." className="w-full bg-[#393e46] rounded-xl py-2.5 pl-10 pr-4 text-sm text-white outline-none focus:ring-1 focus:ring-[#00adb5]" onChange={(e) => setSearchQuery(e.target.value)}/>
              </div>

              <div className="space-y-6 max-h-[300px] overflow-y-auto custom-scrollbar">
                <div><p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Recent Chats</p>
                    {shareRecentChats.map(chat => (
                        <button key={chat.id} onClick={() => setSelectedRecipients(prev => prev.find(r => r.id === chat.id) ? prev.filter(r => r.id !== chat.id) : [...prev, chat])} className={`w-full flex items-center justify-between p-3 rounded-2xl mb-2 transition-all ${selectedRecipients.find(r => r.id === chat.id) ? 'bg-[#00adb5]' : 'bg-[#393e46]'}`}><span className="text-sm font-bold text-white">@{chat.username}</span>{selectedRecipients.find(r => r.id === chat.id) ? <Check size={16} /> : <Send size={14} className="opacity-40" />}</button>
                    ))}
                </div>
              </div>

              {selectedRecipients.length > 0 && <button onClick={handleFinalShare} disabled={isSending} className="w-full mt-6 bg-[#00adb5] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl hover:bg-teal-600 transition-all">{isSending ? <Loader2 className="animate-spin" size={20} /> : <Send size={18} />} Send to {selectedRecipients.length} People</button>}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ShayariFeed;