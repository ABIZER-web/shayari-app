import { useEffect, useState } from 'react';
import { db } from '../firebase'; 
import { 
    collection, query, orderBy, limit, onSnapshot, doc, updateDoc, 
    arrayUnion, arrayRemove, addDoc, serverTimestamp, where, getDocs, deleteDoc 
} from 'firebase/firestore'; 
import { 
    Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, Trophy, 
    X, Copy, Instagram, Link, Facebook, Send, CheckCircle, Circle, Trash2, MapPin, Edit 
} from 'lucide-react'; 
import { motion, AnimatePresence } from 'framer-motion';

const ShayariFeed = ({ onProfileClick, onPostClick, onEditClick }) => {
  const [posts, setPosts] = useState([]);
  const [currentUser] = useState(localStorage.getItem('shayari_user'));
  const [loading, setLoading] = useState(true);
  const [savedPosts, setSavedPosts] = useState([]); 

  // Modals
  const [activeModal, setActiveModal] = useState(null); 
  const [selectedPost, setSelectedPost] = useState(null);
  const [modalUsers, setModalUsers] = useState([]); 
  const [postComments, setPostComments] = useState([]); 
  const [newComment, setNewComment] = useState("");
  const [showOptionsId, setShowOptionsId] = useState(null); // For Three Dots Menu

  // Share Data
  const [recentChats, setRecentChats] = useState([]);
  const [selectedChatIds, setSelectedChatIds] = useState([]);
  const [isSending, setIsSending] = useState(false);

  // 1. FETCH USER DATA
  useEffect(() => {
      if(!currentUser) return;
      const userRef = doc(db, "users", currentUser);
      const unsubscribe = onSnapshot(userRef, (docSnap) => {
          if(docSnap.exists()) setSavedPosts(docSnap.data().saved || []);
      });
      return () => unsubscribe();
  }, [currentUser]);

  // 2. FETCH POSTS
  useEffect(() => {
    const q = query(collection(db, "shayaris"), orderBy("timestamp", "desc"), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const postsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPosts(postsData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- ACTIONS ---

  const handleLike = async (post) => {
    const postRef = doc(db, "shayaris", post.id);
    const isLiked = post.likedBy?.includes(currentUser);
    try {
        if (isLiked) {
            await updateDoc(postRef, { 
                likedBy: arrayRemove(currentUser),
                likes: Math.max(0, (post.likes || 0) - 1)
            });
        } else {
            await updateDoc(postRef, { 
                likedBy: arrayUnion(currentUser),
                likes: (post.likes || 0) + 1
            });
            if (post.author !== currentUser) {
               await addDoc(collection(db, "notifications"), {
                   type: "like",
                   fromUser: currentUser,
                   toUser: post.author,
                   postId: post.id,
                   contentSnippet: post.content ? post.content.substring(0, 30) : "Shayari",
                   timestamp: serverTimestamp(),
                   read: false
               });
            }
        }
    } catch(err) { console.error("Like failed:", err); }
  };

  const handleSave = async (postId) => {
      const userRef = doc(db, "users", currentUser);
      const isSaved = savedPosts.includes(postId);
      try {
          if (isSaved) await updateDoc(userRef, { saved: arrayRemove(postId) });
          else await updateDoc(userRef, { saved: arrayUnion(postId) });
      } catch(err) { console.error("Save failed:", err); }
  };

  const handleCopyText = (content) => {
      navigator.clipboard.writeText(content);
      alert("Text copied!");
  };

  const handleDeletePost = async (postId) => {
      if(!window.confirm("Are you sure you want to delete this post?")) return;
      try {
          await deleteDoc(doc(db, "shayaris", postId));
          setShowOptionsId(null);
      } catch (e) { console.error("Delete failed:", e); }
  };

  // --- MODALS ---

  const openLikesModal = (post) => {
      setSelectedPost(post);
      setActiveModal('likes');
      setModalUsers(post.likedBy ? post.likedBy.map(u => ({ username: u })) : []);
  };

  const openCommentsModal = (post) => {
      setSelectedPost(post);
      setActiveModal('comments');
      // Simple query for comments
      const q = query(collection(db, "shayaris", post.id, "comments"), orderBy("timestamp", "asc"));
      onSnapshot(q, (snap) => {
          setPostComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
  };

  const postComment = async () => {
      if(!newComment.trim() || !selectedPost) return;
      const text = newComment;
      setNewComment("");
      try {
          await addDoc(collection(db, "shayaris", selectedPost.id, "comments"), {
              username: currentUser,
              text: text,
              timestamp: serverTimestamp()
          });
          const postRef = doc(db, "shayaris", selectedPost.id);
          await updateDoc(postRef, { commentCount: (selectedPost.commentCount || 0) + 1 });
      } catch(err) { console.error("Comment failed:", err); }
  };

  // --- SHARE LOGIC (FIXED: Client Side Sort) ---

  const openShareModal = async (post) => {
      setSelectedPost(post);
      setActiveModal('share');
      setSelectedChatIds([]);
      
      // 1. Get all chats user is in
      const q = query(collection(db, "chats"), where("participants", "array-contains", currentUser));
      const snapshot = await getDocs(q);
      
      // 2. Sort in JS
      const chats = snapshot.docs.map(doc => {
          const data = doc.data();
          const otherUser = data.participants.find(p => p !== currentUser) || "Unknown";
          // Safe access to timestamp
          const ts = data.lastMessageTimestamp?.seconds || 0;
          return { id: doc.id, ...data, otherUser, ts };
      });
      
      // Sort Descending
      chats.sort((a, b) => b.ts - a.ts);
      
      // Take Top 4
      setRecentChats(chats.slice(0, 4));
  };

  const toggleChatSelection = (chatId) => {
      if (selectedChatIds.includes(chatId)) {
          setSelectedChatIds(prev => prev.filter(id => id !== chatId));
      } else {
          setSelectedChatIds(prev => [...prev, chatId]);
      }
  };

  const sendPost = async () => {
      if (selectedChatIds.length === 0) return;
      setIsSending(true);
      
      const content = `Shared a post:\n\n"${selectedPost.content}"\n- ${selectedPost.author}`;

      try {
          await Promise.all(selectedChatIds.map(async (chatId) => {
              // 1. Send Message
              await addDoc(collection(db, "chats", chatId, "messages"), {
                  text: content,
                  sender: currentUser,
                  timestamp: serverTimestamp(),
                  isPostShare: true,
                  postId: selectedPost.id
              });
              // 2. Update Chat Metadata
              await updateDoc(doc(db, "chats", chatId), {
                  lastMessage: `Shared a post`,
                  lastMessageSender: currentUser,
                  lastMessageTimestamp: serverTimestamp(),
                  isRead: false
              });
          }));
          
          // 3. Update Share Count
          await updateDoc(doc(db, "shayaris", selectedPost.id), { shares: (selectedPost.shares || 0) + selectedChatIds.length });

          alert("Sent!");
          setActiveModal(null);
      } catch (e) { console.error(e); }
      setIsSending(false);
  };

  const handleExternalShare = (platform) => {
      if(!selectedPost) return;
      const shareUrl = window.location.href; 
      const text = encodeURIComponent(`"${selectedPost.content}"\n- ${selectedPost.author}`);
      
      if (platform === 'wa') window.open(`https://wa.me/?text=${text}`, '_blank');
      else if (platform === 'fb') window.open(`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}&quote=${text}`, '_blank');
      else if (platform === 'insta') { navigator.clipboard.writeText(selectedPost.content); window.open('https://instagram.com', '_blank'); }
      else if (platform === 'link') { navigator.clipboard.writeText(shareUrl); alert("Link Copied!"); }
  };

  const topPostId = posts.length > 0 ? [...posts].sort((a, b) => (b.likes || 0) - (a.likes || 0))[0].id : null;

  if (loading) return <div className="text-center py-10 text-gray-400">Loading Feed...</div>;

  return (
    <div className="space-y-8 pb-20 max-w-2xl mx-auto" onClick={() => setShowOptionsId(null)}>
      {posts.map((post) => {
        const isTopPick = post.id === topPostId && post.likes > 0;
        const isLikedByMe = post.likedBy?.includes(currentUser);
        const isSavedByMe = savedPosts.includes(post.id);
        const isMyPost = post.author === currentUser;
        
        // Style Logic
        const finalBg = post.bgColor || (post.background && (post.background.startsWith('#') || post.background.includes('gradient')) ? post.background : '#ffffff');
        const finalText = post.textColor || '#000000';

        return (
            <motion.div 
                key={post.id} 
                initial={{ opacity: 0, y: 20 }} 
                animate={{ opacity: 1, y: 0 }}
                className={`border border-gray-100 rounded-3xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 relative bg-white ${isTopPick ? 'ring-2 ring-yellow-400' : ''}`}
            >
                {isTopPick && <div className="absolute top-0 right-0 bg-yellow-400 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl flex items-center gap-1 shadow-sm z-10"><Trophy size={12} fill="currentColor" /> TRENDING</div>}

                {/* Header */}
                <div className="p-4 flex items-center justify-between bg-white border-b border-gray-50">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => onProfileClick && onProfileClick(post.author)}>
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
                    
                    {/* MORE OPTIONS (Edit/Delete) */}
                    <div className="relative">
                        <button onClick={(e) => { e.stopPropagation(); setShowOptionsId(showOptionsId === post.id ? null : post.id); }} className="text-gray-400 hover:text-gray-600"><MoreHorizontal size={20}/></button>
                        
                        {showOptionsId === post.id && isMyPost && (
                            <div className="absolute right-0 top-8 bg-white border border-gray-100 shadow-xl rounded-xl z-20 w-32 overflow-hidden">
                                {/* ⚡ EDIT BUTTON */}
                                <button onClick={() => onEditClick(post)} className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-b border-gray-50 transition"><Edit size={16}/> Edit</button>
                                {/* DELETE BUTTON */}
                                <button onClick={() => handleDeletePost(post.id)} className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition"><Trash2 size={16}/> Delete</button>
                            </div>
                        )}
                    </div>
                </div>

                {/* CONTENT CARD */}
                <div 
                    className="px-8 py-12 flex items-center justify-center text-center cursor-pointer min-h-[300px] transition-colors"
                    style={{ background: finalBg }}
                    onClick={() => onPostClick && onPostClick(post.id)}
                >
                    <p 
                        className={`font-serif leading-relaxed whitespace-pre-wrap font-medium drop-shadow-sm ${post.content.length < 50 ? 'text-3xl' : 'text-xl'}`}
                        style={{ color: finalText }}
                    >
                        {post.content}
                    </p>
                </div>

                {/* ACTIONS */}
                <div className="px-4 py-3 border-t border-gray-50 bg-white">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6">
                            {/* Like */}
                            <button className="flex items-center gap-2 group" onClick={() => handleLike(post)}>
                                <Heart size={24} className={`transition-transform group-hover:scale-110 ${isLikedByMe ? 'fill-red-500 text-red-500' : 'text-gray-800'}`} />
                            </button>
                            
                            {/* Comment */}
                            {!post.turnOffCommenting && (
                                <button className="flex items-center gap-2 group" onClick={() => openCommentsModal(post)}>
                                    <MessageCircle size={24} className="text-gray-800 group-hover:text-blue-500 transition" />
                                </button>
                            )}

                            {/* Share */}
                            {!post.hideShare && (
                                <button className="flex items-center gap-2 group" onClick={() => openShareModal(post)}>
                                    <Share2 size={24} className="text-gray-800 group-hover:text-green-500 transition" />
                                </button>
                            )}
                            
                            {/* Copy Text */}
                            <button className="flex items-center gap-2 group" onClick={() => handleCopyText(post.content)}>
                                <Copy size={24} className="text-gray-800 group-hover:text-purple-500 transition" />
                            </button>
                        </div>

                        {/* Save */}
                        <button onClick={() => handleSave(post.id)}>
                            <Bookmark size={24} className={`${isSavedByMe ? 'fill-black text-black' : 'text-gray-400 hover:text-gray-900'}`} />
                        </button>
                    </div>

                    {/* Like Count */}
                    {!post.hideLikes && post.likes > 0 && (
                        <div className="mt-2 cursor-pointer" onClick={() => openLikesModal(post)}>
                            <p className="text-xs text-gray-900 font-bold">{post.likes} likes</p>
                        </div>
                    )}

                    {/* Caption */}
                    {(post.caption || (post.taggedPeople && post.taggedPeople.length > 0)) && (
                        <div className="mt-2 text-sm leading-tight">
                            <span className="font-bold mr-2 text-gray-900">{post.author}</span>
                            <span className="text-gray-800">{post.caption}</span>
                        </div>
                    )}
                </div>
            </motion.div>
        );
      })}

      {/* MODALS */}
      <AnimatePresence>
        {activeModal && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setActiveModal(null)}>
                <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} onClick={e => e.stopPropagation()} className="bg-white w-full md:max-w-sm rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl h-[500px] flex flex-col">
                    
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                        <h3 className="font-bold flex-1 text-center capitalize">{activeModal}</h3>
                        <button onClick={() => setActiveModal(null)}><X size={20}/></button>
                    </div>

                    {/* SHARE MODAL */}
                    {activeModal === 'share' && (
                        <div className="flex flex-col h-full">
                            <div className="p-4 flex-1 overflow-y-auto">
                                <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">Send to (Recent)</h4>
                                <div className="space-y-2">
                                    {recentChats.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No recent chats found.</p>}
                                    {recentChats.map(chat => {
                                        const isSelected = selectedChatIds.includes(chat.id);
                                        return (
                                            <div key={chat.id} onClick={() => toggleChatSelection(chat.id)} className="flex items-center justify-between p-2 rounded-xl hover:bg-gray-50 cursor-pointer border border-transparent hover:border-gray-100 transition">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center font-bold text-gray-600">{chat.otherUser[0]}</div>
                                                    <div>
                                                        <p className="font-bold text-sm text-gray-900">{chat.otherUser}</p>
                                                        <p className="text-xs text-gray-500">Tap to select</p>
                                                    </div>
                                                </div>
                                                {isSelected ? <CheckCircle size={22} className="text-blue-500 fill-blue-50" /> : <Circle size={22} className="text-gray-300" />}
                                            </div>
                                        );
                                    })}
                                </div>
                                
                                <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 mt-6">Share externally</h4>
                                <div className="grid grid-cols-4 gap-4 text-center">
                                    <button onClick={() => handleExternalShare('wa')} className="flex flex-col items-center gap-1 text-green-600 hover:bg-green-50 rounded-xl p-2 transition"><MessageCircle size={24}/><span className="text-[10px] font-bold">WA</span></button>
                                    <button onClick={() => handleExternalShare('insta')} className="flex flex-col items-center gap-1 text-pink-600 hover:bg-pink-50 rounded-xl p-2 transition"><Instagram size={24}/><span className="text-[10px] font-bold">Insta</span></button>
                                    <button onClick={() => handleExternalShare('fb')} className="flex flex-col items-center gap-1 text-blue-600 hover:bg-blue-50 rounded-xl p-2 transition"><Facebook size={24}/><span className="text-[10px] font-bold">FB</span></button>
                                    <button onClick={() => handleExternalShare('link')} className="flex flex-col items-center gap-1 text-gray-600 hover:bg-gray-100 rounded-xl p-2 transition"><Link size={24}/><span className="text-[10px] font-bold">Link</span></button>
                                </div>
                            </div>
                            
                            <div className="p-4 border-t border-gray-100">
                                <button 
                                    onClick={sendPost} 
                                    disabled={selectedChatIds.length === 0 || isSending}
                                    className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition hover:bg-blue-700"
                                >
                                    {isSending ? 'Sending...' : <>Send <Send size={18}/></>}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* LIKES MODAL */}
                    {activeModal === 'likes' && (
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {modalUsers.map((u, i) => (
                                <div key={i} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-xl cursor-pointer" onClick={() => { setActiveModal(null); onProfileClick(u.username); }}>
                                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold">{u.username[0]}</div>
                                    <span className="font-bold text-sm">{u.username}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* COMMENTS MODAL */}
                    {activeModal === 'comments' && (
                        <>
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {postComments.length === 0 ? <p className="text-center text-gray-400 text-sm mt-10">No comments yet.</p> : postComments.map(c => (
                                    <div key={c.id} className="text-sm bg-gray-50 p-3 rounded-xl">
                                        <span className="font-bold block text-xs text-gray-500 mb-1">{c.username}</span>
                                        {c.text}
                                    </div>
                                ))}
                            </div>
                            <div className="p-3 bg-white border-t flex gap-2 items-center">
                                <input 
                                    value={newComment} 
                                    onChange={e => setNewComment(e.target.value)} 
                                    placeholder="Add a comment..." 
                                    className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500 transition" 
                                    onKeyDown={e => e.key === 'Enter' && postComment()}
                                />
                                <button onClick={postComment} disabled={!newComment.trim()} className="text-blue-500 font-bold text-sm px-2 disabled:opacity-50">Post</button>
                            </div>
                        </>
                    )}

                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ShayariFeed;