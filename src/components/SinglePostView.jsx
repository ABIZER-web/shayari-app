import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase'; 
import { 
  doc, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, 
  updateDoc, arrayRemove, arrayUnion, where, getDocs, limit, increment 
} from 'firebase/firestore';
import { ArrowLeft, Heart, MessageCircle, Send, Bookmark, X, Loader2, Reply as ReplyIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SinglePostView = ({ postId, onBack }) => {
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('shayari_user'));
  const [commentText, setCommentText] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [isSaved, setIsSaved] = useState(false);
  const [authorBio, setAuthorBio] = useState("");
  
  const commentsEndRef = useRef(null);
  const inputRef = useRef(null);

  // --- 1. SMART FORMATTERS ---
  const formatCount = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num || 0;
  };

  const formatTimestamp = (ts) => {
    if (!ts) return "Just now";
    const date = ts.toDate();
    const diffInSeconds = Math.floor((new Date() - date) / 1000);
    
    if (diffInSeconds < 3600) return Math.floor(diffInSeconds / 60) + "m";
    if (diffInSeconds < 86400) return Math.floor(diffInSeconds / 3600) + "h";
    
    const days = Math.floor(diffInSeconds / 86400);
    if (days < 7) return days + "d";
    
    const weeks = Math.floor(days / 7);
    return weeks + "w ago";
  };

  // --- 2. DATA FETCHING ---
  useEffect(() => {
    if (!postId) return;
    
    const postRef = doc(db, "shayaris", postId);
    const unsubPost = onSnapshot(postRef, (docSnap) => {
      if (docSnap.exists()) {
        const postData = docSnap.data();
        setPost({ id: docSnap.id, ...postData });
        
        const userQ = query(collection(db, "users"), where("username", "==", postData.author));
        getDocs(userQ).then(snap => {
            if(!snap.empty) setAuthorBio(snap.docs[0].data().bio || "Poet at ShayariGram");
        });
      }
    });

    const checkSaved = async () => {
        if(!currentUser) return;
        const q = query(collection(db, "users"), where("username", "==", currentUser));
        const snap = await getDocs(q);
        if(!snap.empty) {
            const userData = snap.docs[0].data();
            setIsSaved(userData.saved?.includes(postId));
        }
    };
    checkSaved();

    return () => unsubPost();
  }, [postId, currentUser]);

  useEffect(() => {
    if (!postId) return;
    const qComments = query(collection(db, "shayaris", postId, "comments"), orderBy("timestamp", "asc"));
    
    const unsubComments = onSnapshot(qComments, (snap) => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      // Smooth scroll to bottom when new comment arrives
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 150);
    });

    return () => unsubComments();
  }, [postId]);

  // --- 3. HANDLERS ---
  const handlePostLike = async () => {
    if (!post || !currentUser) return;
    const postRef = doc(db, "shayaris", postId);
    const isLiked = post.likedBy?.includes(currentUser);
    
    await updateDoc(postRef, { 
      likes: increment(isLiked ? -1 : 1), 
      likedBy: isLiked ? arrayRemove(currentUser) : arrayUnion(currentUser) 
    });

    if (!isLiked && post.author !== currentUser) {
        await addDoc(collection(db, "notifications"), {
            toUser: post.author, fromUser: currentUser, type: "like", postId, timestamp: serverTimestamp(), read: false
        });
    }
  };

  const handleCommentLike = async (commentId, likedBy = []) => {
      if (!currentUser) return;
      const isLiked = likedBy.includes(currentUser);
      const commentRef = doc(db, "shayaris", postId, "comments", commentId);

      await updateDoc(commentRef, {
          likes: increment(isLiked ? -1 : 1),
          likedBy: isLiked ? arrayRemove(currentUser) : arrayUnion(currentUser)
      });
  };

  const handleSave = async () => {
      if(!currentUser) return;
      const q = query(collection(db, "users"), where("username", "==", currentUser));
      const snap = await getDocs(q);
      if(!snap.empty) {
          const userDoc = snap.docs[0];
          await updateDoc(userDoc.ref, { 
              saved: isSaved ? arrayRemove(postId) : arrayUnion(postId) 
          });
          setIsSaved(!isSaved);
      }
  };

  const submitComment = async () => {
    if (!commentText.trim() || !currentUser) return;
    const text = commentText;
    const replyData = replyingTo;
    setCommentText("");
    setReplyingTo(null);

    await addDoc(collection(db, "shayaris", postId, "comments"), {
      text, username: currentUser, timestamp: serverTimestamp(),
      isReply: !!replyData, replyToUser: replyData ? replyData.username : null,
      likes: 0, likedBy: []
    });

    await updateDoc(doc(db, "shayaris", postId), { commentCount: increment(1) });

    if (post.author !== currentUser) {
        await addDoc(collection(db, "notifications"), {
            toUser: post.author, fromUser: currentUser, type: "comment", text, postId, timestamp: serverTimestamp(), read: false
        });
    }
  };

  if (!post) return <div className="h-screen flex items-center justify-center bg-[#222831]"><Loader2 className="animate-spin text-[#00adb5]" /></div>;

  return (
    <div className="h-full flex flex-col bg-[#222831]">
      {/* HEADER */}
      <div className="flex items-center gap-4 p-4 shrink-0">
        <button onClick={onBack} className="p-2 hover:bg-[#393e46] rounded-full text-[#eeeeee] transition"><ArrowLeft size={24} /></button>
        <div>
            <h2 className="font-bold text-[#eeeeee]">@{post.author}</h2>
            <p className="text-[11px] text-gray-500 italic truncate w-48">{authorBio}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar scrollbar-hide">
        {/* POST CARD */}
        <div className="rounded-[2.5rem] shadow-2xl mb-8 min-h-[250px] flex items-center justify-center p-8 text-center" style={{ background: post.bgColor || '#393e46' }}>
            <p className="font-serif text-xl md:text-2xl leading-relaxed whitespace-pre-wrap" style={{ color: post.textColor || '#eeeeee' }}>{post.content}</p>
        </div>

        {/* ACTIONS */}
        <div className="flex items-center justify-between mb-8 px-2">
            <div className="flex gap-8">
                <button onClick={handlePostLike} className="flex flex-col items-center gap-1 group">
                    <Heart size={28} className={post.likedBy?.includes(currentUser) ? "fill-red-500 text-red-500 scale-110" : "text-gray-400 group-hover:text-red-400"} />
                    <span className="text-[10px] text-gray-500 font-bold">{formatCount(post.likes)}</span>
                </button>
                <div className="flex flex-col items-center gap-1">
                    <MessageCircle size={28} className="text-[#00adb5]" />
                    <span className="text-[10px] text-gray-500 font-bold">{formatCount(post.commentCount)}</span>
                </div>
                <Send size={28} className="text-gray-400 hover:text-[#00adb5] transition cursor-pointer" />
            </div>
            <button onClick={handleSave}>
                <Bookmark size={28} className={isSaved ? "fill-white text-white" : "text-gray-400 hover:text-white transition"} />
            </button>
        </div>

        {/* 🔥 FIXED 5-COMMENT SCROLLING BLOCK */}
        <div className="bg-[#1a1f26] rounded-[2.5rem] p-6 mb-10">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.3em] mb-6 px-2">Conversations</h3>
            
            {/* Restricted height container to show ~5 comments with smooth scroll */}
            <div className="h-[480px] overflow-y-auto pr-2 custom-scrollbar scroll-smooth flex flex-col gap-6">
                {comments.map(c => (
                    <div key={c.id} className={`flex gap-4 items-start ${c.isReply ? 'ml-8' : ''}`}>
                        <div className="w-10 h-10 rounded-full bg-[#393e46] flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-md border border-gray-700">
                            {c.username[0].toUpperCase()}
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between items-center mb-1">
                                <p className="text-xs font-bold text-[#00adb5]">@{c.username}</p>
                                <p className="text-[9px] text-gray-500 font-bold">{formatTimestamp(c.timestamp)}</p>
                            </div>
                            <div className={`bg-[#393e46] px-4 py-3 rounded-2xl rounded-tl-none shadow-sm ${c.isReply ? 'bg-[#2d333b]' : ''}`}>
                                <p className="text-sm text-[#eeeeee] leading-relaxed">
                                    {c.replyToUser && <span className="text-[#00adb5] font-bold mr-1">@{c.replyToUser}</span>}
                                    {c.text}
                                </p>
                            </div>
                            <div className="flex gap-4 mt-2 px-1">
                                <button 
                                    onClick={() => handleCommentLike(c.id, c.likedBy)}
                                    className={`text-[10px] font-bold flex items-center gap-1 transition-colors ${c.likedBy?.includes(currentUser) ? 'text-red-500' : 'text-gray-500 hover:text-red-400'}`}
                                >
                                    <Heart size={14} className={c.likedBy?.includes(currentUser) ? "fill-red-500" : ""} /> {formatCount(c.likes)}
                                </button>
                                <button 
                                    onClick={() => {setReplyingTo(c); setCommentText(`@${c.username} `); inputRef.current.focus();}} 
                                    className="text-[10px] font-bold text-gray-500 hover:text-[#00adb5] flex items-center gap-1 uppercase tracking-widest"
                                >
                                    <ReplyIcon size={12}/> Reply
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
                {/* Scroll Target */}
                <div ref={commentsEndRef} />

                {comments.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center opacity-20 py-20">
                        <MessageCircle size={48} className="mb-2" />
                        <p className="text-sm italic">No thoughts shared yet...</p>
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* INPUT AREA */}
      <div className="p-4 bg-[#222831] flex flex-col gap-2 z-20">
        <AnimatePresence>
            {replyingTo && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0 }} className="flex justify-between items-center px-4 py-1.5 bg-[#00adb5]/10 rounded-full mx-2">
                    <span className="text-[10px] text-[#00adb5] font-bold">Replying to @{replyingTo.username}</span>
                    <button onClick={() => {setReplyingTo(null); setCommentText("");}}><X size={12} className="text-gray-500"/></button>
                </motion.div>
            )}
        </AnimatePresence>
        <div className="flex gap-2">
            <input 
                ref={inputRef}
                value={commentText} 
                onChange={(e) => setCommentText(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && submitComment()}
                placeholder="Share your thoughts..." 
                className="flex-1 bg-[#393e46] text-[#eeeeee] p-4 rounded-2xl outline-none placeholder-gray-500 text-sm focus:ring-1 focus:ring-[#00adb5] transition-all" 
            />
            <button onClick={submitComment} className="bg-[#00adb5] text-white w-12 h-12 rounded-2xl flex items-center justify-center active:scale-90 transition shadow-lg"><Send size={20}/></button>
        </div>
      </div>
    </div>
  );
};

export default SinglePostView;