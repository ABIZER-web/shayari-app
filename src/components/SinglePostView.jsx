import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase'; 
import { 
    doc, onSnapshot, updateDoc, arrayUnion, arrayRemove, addDoc, collection, serverTimestamp, query, where, orderBy, limit, getDocs, deleteDoc, getDoc
} from 'firebase/firestore'; 
import { 
    Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, ChevronLeft, Copy, Instagram, Link, Facebook, Send, CheckCircle, Circle, Trash2, X, MapPin, Edit 
} from 'lucide-react'; 
import { motion, AnimatePresence } from 'framer-motion';

const SinglePostView = ({ postId, onBack, onProfileClick, onEditClick }) => {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const currentUser = localStorage.getItem('shayari_user');
  
  // Interaction States
  const [isLiked, setIsLiked] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // Modals & Menus
  const [activeModal, setActiveModal] = useState(null); 
  const [modalUsers, setModalUsers] = useState([]); 
  const [postComments, setPostComments] = useState([]); 
  const [newComment, setNewComment] = useState("");
  const [showOptions, setShowOptions] = useState(false);

  // Share Logic
  const [recentChats, setRecentChats] = useState([]);
  const [selectedChatIds, setSelectedChatIds] = useState([]);
  const [isSending, setIsSending] = useState(false);

  // Scroll ref for comments
  const commentsEndRef = useRef(null);

  // 1. FETCH POST DATA
  useEffect(() => {
    const fetchPost = async () => {
        setLoading(true);
        const unsubscribe = onSnapshot(doc(db, "shayaris", postId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setPost({ id: docSnap.id, ...data });
                setIsLiked(data.likedBy?.includes(currentUser));
            } else {
                setPost(null); // Post deleted
            }
            setLoading(false);
        });

        // Check if saved
        const userSnap = await getDoc(doc(db, "users", currentUser));
        if(userSnap.exists()) {
            const savedArr = userSnap.data().saved || [];
            setIsSaved(savedArr.includes(postId));
        }
        return unsubscribe;
    };
    fetchPost();
  }, [postId, currentUser]);

  // --- ACTIONS ---

  const handleLike = async () => {
    if(!post) return;
    const postRef = doc(db, "shayaris", postId);
    try {
        if (isLiked) {
            await updateDoc(postRef, { likedBy: arrayRemove(currentUser), likes: Math.max(0, (post.likes || 0) - 1) });
        } else {
            await updateDoc(postRef, { likedBy: arrayUnion(currentUser), likes: (post.likes || 0) + 1 });
            if (post.author !== currentUser) {
                await addDoc(collection(db, "notifications"), {
                    type: "like", fromUser: currentUser, toUser: post.author, postId: postId, 
                    contentSnippet: post.content.substring(0, 30), timestamp: serverTimestamp(), read: false 
                });
            }
        }
    } catch(err) { console.error(err); }
  };

  const handleSave = async () => {
      const userRef = doc(db, "users", currentUser);
      try {
          if (isSaved) { await updateDoc(userRef, { saved: arrayRemove(postId) }); setIsSaved(false); } 
          else { await updateDoc(userRef, { saved: arrayUnion(postId) }); setIsSaved(true); }
      } catch(err) { console.error(err); }
  };

  const handleDelete = async () => {
      if(window.confirm("Are you sure you want to delete this post?")) {
          try {
              await deleteDoc(doc(db, "shayaris", postId));
              onBack(); // Go back after delete
          } catch(e) { console.error(e); }
      }
  };

  // --- MODAL OPENERS ---

  const openLikesModal = () => {
      setActiveModal('likes');
      setModalUsers(post.likedBy ? post.likedBy.map(u => ({ username: u })) : []);
  };

  const openCommentsModal = () => {
      setActiveModal('comments');
      // Fetch comments
      const q = query(collection(db, "shayaris", postId, "comments"), orderBy("timestamp", "asc"));
      onSnapshot(q, (snap) => {
          setPostComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
  };

  const postComment = async () => {
      if(!newComment.trim()) return;
      try {
          await addDoc(collection(db, "shayaris", postId, "comments"), {
              username: currentUser, text: newComment, timestamp: serverTimestamp()
          });
          await updateDoc(doc(db, "shayaris", postId), { commentCount: (post.commentCount || 0) + 1 });
          setNewComment("");
          // Auto scroll to bottom
          setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      } catch(err) { console.error(err); }
  };

  // ⚡ FIXED SHARE LOGIC (Client-Side Sort)
  const openShareModal = async () => {
      setActiveModal('share');
      setSelectedChatIds([]);
      
      // 1. Fetch all chats involving user
      const q = query(collection(db, "chats"), where("participants", "array-contains", currentUser));
      const snapshot = await getDocs(q);
      
      // 2. Map & Sort manually in JS
      const chats = snapshot.docs.map(doc => {
          const data = doc.data();
          const otherUser = data.participants.find(p => p !== currentUser) || "Unknown";
          // Use 0 if timestamp missing to prevent crash
          const ts = data.lastMessageTimestamp?.seconds || 0; 
          return { id: doc.id, ...data, otherUser, ts };
      });

      // 3. Sort Descending
      chats.sort((a, b) => b.ts - a.ts);
      
      // 4. Take Top 4
      setRecentChats(chats.slice(0, 4));
  };

  const sendPost = async () => {
      if (selectedChatIds.length === 0) return;
      setIsSending(true);
      const content = `Shared a post:\n\n"${post.content}"\n- ${post.author}`;
      try {
          await Promise.all(selectedChatIds.map(async (chatId) => {
              await addDoc(collection(db, "chats", chatId, "messages"), { 
                  text: content, sender: currentUser, timestamp: serverTimestamp(), isPostShare: true, postId: postId 
              });
              await updateDoc(doc(db, "chats", chatId), { 
                  lastMessage: `Shared a post`, lastMessageSender: currentUser, lastMessageTimestamp: serverTimestamp(), isRead: false 
              });
          }));
          
          await updateDoc(doc(db, "shayaris", postId), { shares: (post.shares || 0) + selectedChatIds.length });
          
          setActiveModal(null);
          alert("Sent!");
      } catch (e) { console.error(e); }
      setIsSending(false);
  };

  const handleExternalShare = (platform) => {
      const url = window.location.href;
      const text = encodeURIComponent(`"${post.content}"\n- ${post.author}`);
      
      if (platform === 'wa') window.open(`https://wa.me/?text=${text}`, '_blank');
      else if (platform === 'fb') window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
      else if (platform === 'insta') { navigator.clipboard.writeText(post.content); window.open('https://instagram.com', '_blank'); }
      else { navigator.clipboard.writeText(url); alert("Link Copied!"); }
  };

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>;
  if (!post) return <div className="flex items-center justify-center h-screen text-gray-400">Post not found.</div>;

  // --- STYLE LOGIC ---
  const finalBg = post.bgColor || (post.background && (post.background.startsWith('#') || post.background.includes('gradient')) ? post.background : '#ffffff');
  const finalText = post.textColor || '#000000';

  return (
    <div className="bg-white min-h-screen pb-20" onClick={() => setShowOptions(false)}>
      
      {/* Navbar */}
      <div className="sticky top-0 bg-white z-10 border-b border-gray-100 p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
              <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100"><ChevronLeft/></button>
              <h2 className="font-bold text-lg">Post</h2>
          </div>
      </div>

      <div className="max-w-xl mx-auto p-4">
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="border border-gray-100 rounded-3xl overflow-hidden shadow-lg bg-white relative"
          >
            {/* Header */}
            <div className="p-4 flex items-center justify-between border-b border-gray-50">
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => onProfileClick(post.author)}>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-gray-200 to-gray-300 flex items-center justify-center">
                        <span className="font-bold text-gray-600 text-sm">{post.author?.[0]?.toUpperCase()}</span>
                    </div>
                    <div>
                        <h3 className="font-bold text-sm text-gray-900">{post.author}</h3>
                        {post.location ? (
                            <p className="text-[10px] text-gray-500 flex items-center gap-1"><MapPin size={10} /> {post.location}</p>
                        ) : (
                            <p className="text-xs text-gray-400">{post.timestamp ? new Date(post.timestamp.toDate()).toDateString() : ""}</p>
                        )}
                    </div>
                </div>
                
                {/* ⚡ THREE DOTS MENU (Delete & Edit) */}
                <div className="relative">
                    <button onClick={(e) => { e.stopPropagation(); setShowOptions(!showOptions); }} className="text-gray-400 hover:text-black transition"><MoreHorizontal size={20}/></button>
                    
                    {showOptions && post.author === currentUser && (
                        <div className="absolute right-0 top-8 bg-white border border-gray-100 shadow-xl rounded-xl z-20 w-36 overflow-hidden">
                            <button onClick={() => onEditClick(post)} className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-b border-gray-50 transition">
                                <Edit size={16}/> Edit
                            </button>
                            <button onClick={handleDelete} className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition">
                                <Trash2 size={16}/> Delete
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Content */}
            <div 
                className="px-8 py-16 flex items-center justify-center text-center min-h-[350px] transition-colors"
                style={{ background: finalBg }}
            >
                <p 
                    className={`font-serif leading-relaxed whitespace-pre-wrap font-medium drop-shadow-sm ${post.content.length < 50 ? 'text-3xl' : 'text-xl'}`}
                    style={{ color: finalText }}
                >
                    {post.content}
                </p>
            </div>

            {/* Actions */}
            <div className="px-4 py-4 bg-white border-t border-gray-50">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-6">
                        <button onClick={handleLike}><Heart size={26} className={isLiked ? 'fill-red-500 text-red-500' : 'text-gray-800'} /></button>
                        
                        {!post.turnOffCommenting && (
                            <button onClick={openCommentsModal}><MessageCircle size={26} className="text-gray-800 hover:text-blue-500" /></button>
                        )}
                        
                        {!post.hideShare && (
                            <button onClick={openShareModal}><Share2 size={26} className="text-gray-800 hover:text-green-500" /></button>
                        )}
                        
                        <button onClick={() => {navigator.clipboard.writeText(post.content); alert("Text Copied!")}}>
                            <Copy size={26} className="text-gray-800 hover:text-purple-500" />
                        </button>
                    </div>
                    <button onClick={handleSave}>
                        <Bookmark size={26} className={isSaved ? 'fill-black' : 'text-gray-800'} />
                    </button>
                </div>

                {!post.hideLikes && post.likes > 0 && (
                    <div className="cursor-pointer font-bold text-sm text-gray-900 mb-2" onClick={openLikesModal}>
                        {post.likes} likes
                    </div>
                )}

                {(post.caption) && (
                    <div className="text-sm leading-snug">
                        <span className="font-bold mr-2">{post.author}</span>{post.caption}
                    </div>
                )}
            </div>
          </motion.div>
      </div>

      {/* --- MODALS --- */}
      <AnimatePresence>
        {activeModal && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setActiveModal(null)}>
                <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} onClick={e => e.stopPropagation()} className="bg-white w-full md:max-w-sm rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl h-[500px] flex flex-col">
                    
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                        <h3 className="font-bold flex-1 text-center capitalize">{activeModal}</h3>
                        <button onClick={() => setActiveModal(null)}><X size={20}/></button>
                    </div>

                    {/* ⚡ SHARE MODAL (Matches Feed) */}
                    {activeModal === 'share' && (
                        <div className="flex flex-col h-full">
                            <div className="p-4 flex-1 overflow-y-auto">
                                <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">Send to</h4>
                                <div className="space-y-2">
                                    {recentChats.length === 0 && <p className="text-center text-gray-400 text-sm py-4">No recent chats.</p>}
                                    {recentChats.map(chat => {
                                        const isSelected = selectedChatIds.includes(chat.id);
                                        return (
                                            <div key={chat.id} onClick={() => setSelectedChatIds(p => p.includes(chat.id) ? p.filter(i => i!==chat.id) : [...p, chat.id])} className="flex items-center justify-between p-2 rounded-xl hover:bg-gray-50 cursor-pointer transition border border-transparent hover:border-gray-100">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center font-bold text-blue-600">{chat.otherUser[0]}</div>
                                                    <span className="font-bold text-sm">{chat.otherUser}</span>
                                                </div>
                                                {isSelected ? <CheckCircle size={22} className="text-blue-500 fill-blue-50"/> : <Circle size={22} className="text-gray-300"/>}
                                            </div>
                                        );
                                    })}
                                </div>
                                
                                <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 mt-6">Share externally</h4>
                                <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-50 text-center">
                                    <button onClick={() => handleExternalShare('wa')} className="flex flex-col items-center gap-1 text-green-600 hover:bg-green-50 rounded-xl p-2 transition"><MessageCircle size={24}/><span className="text-[10px] font-bold">WA</span></button>
                                    <button onClick={() => handleExternalShare('insta')} className="flex flex-col items-center gap-1 text-pink-600 hover:bg-pink-50 rounded-xl p-2 transition"><Instagram size={24}/><span className="text-[10px] font-bold">Insta</span></button>
                                    <button onClick={() => handleExternalShare('fb')} className="flex flex-col items-center gap-1 text-blue-600 hover:bg-blue-50 rounded-xl p-2 transition"><Facebook size={24}/><span className="text-[10px] font-bold">FB</span></button>
                                    <button onClick={() => handleExternalShare('link')} className="flex flex-col items-center gap-1 text-gray-600 hover:bg-gray-100 rounded-xl p-2 transition"><Link size={24}/><span className="text-[10px] font-bold">Link</span></button>
                                </div>
                            </div>
                            <div className="p-4 border-t border-gray-100">
                                <button onClick={sendPost} disabled={selectedChatIds.length===0 || isSending} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold disabled:opacity-50 transition hover:bg-blue-700">
                                    {isSending ? 'Sending...' : 'Send'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ⚡ COMMENTS MODAL (With Animation) */}
                    {activeModal === 'comments' && (
                        <>
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {postComments.length === 0 ? <p className="text-center text-gray-400 text-sm mt-10">No comments yet.</p> : (
                                    <AnimatePresence>
                                        {postComments.map(c => (
                                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} key={c.id} className="text-sm bg-gray-50 p-3 rounded-xl">
                                                <span className="font-bold block text-xs text-gray-500 mb-1">{c.username}</span>{c.text}
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                )}
                                <div ref={commentsEndRef} />
                            </div>
                            <div className="p-3 bg-white border-t flex gap-2 items-center">
                                <input 
                                    value={newComment} 
                                    onChange={e => setNewComment(e.target.value)} 
                                    placeholder="Add comment..." 
                                    className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 transition" 
                                    onKeyDown={e => e.key === 'Enter' && postComment()} 
                                />
                                <button onClick={postComment} disabled={!newComment.trim()} className="text-blue-500 font-bold text-sm px-2 disabled:opacity-50">Post</button>
                            </div>
                        </>
                    )}

                    {/* LIKES MODAL */}
                    {activeModal === 'likes' && (
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {modalUsers.map(u => (
                                <div key={u.username} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer" onClick={() => { setActiveModal(null); onProfileClick(u.username); }}>
                                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold">{u.username[0]}</div>
                                    <span className="font-bold text-sm">{u.username}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SinglePostView;