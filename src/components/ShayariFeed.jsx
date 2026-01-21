import { useEffect, useState } from 'react';
import { db } from '../firebase'; 
import { 
    collection, query, orderBy, limit, onSnapshot, doc, updateDoc, 
    arrayUnion, arrayRemove, getDoc, addDoc, serverTimestamp, getDocs 
} from 'firebase/firestore'; 
import { 
    Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, Trophy, 
    X, Send, Download, Copy, Instagram 
} from 'lucide-react'; 
import { motion, AnimatePresence } from 'framer-motion';

const ShayariFeed = ({ onProfileClick, onPostClick }) => {
  const [posts, setPosts] = useState([]);
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('shayari_user'));
  const [loading, setLoading] = useState(true);
  
  // User Data
  const [followingList, setFollowingList] = useState([]); 
  const [savedPosts, setSavedPosts] = useState([]); 

  // Modals State
  const [activeModal, setActiveModal] = useState(null); // 'likes', 'comments', 'share'
  const [selectedPost, setSelectedPost] = useState(null);
  
  // Data for Modals
  const [modalUsers, setModalUsers] = useState([]); // For Likes List
  const [postComments, setPostComments] = useState([]); // For Comments List
  const [newComment, setNewComment] = useState("");

  // 1. FETCH CURRENT USER DATA
  useEffect(() => {
      if(!currentUser) return;
      const userRef = doc(db, "users", currentUser);
      const unsubscribe = onSnapshot(userRef, (docSnap) => {
          if(docSnap.exists()) {
              const data = docSnap.data();
              setFollowingList(data.following || []);
              setSavedPosts(data.saved || []);
          }
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
            // Optional: Send Notification
            if (post.author !== currentUser) {
                await addDoc(collection(db, "notifications"), {
                    type: "like",
                    fromUser: currentUser,
                    toUser: post.author,
                    postId: post.id,
                    contentSnippet: post.content.substring(0, 30),
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
          if (isSaved) {
              await updateDoc(userRef, { saved: arrayRemove(postId) });
          } else {
              await updateDoc(userRef, { saved: arrayUnion(postId) });
          }
      } catch(err) { console.error("Save failed:", err); }
  };

  // --- MODAL OPENERS ---

  const openLikesModal = async (post) => {
      setSelectedPost(post);
      setActiveModal('likes');
      setModalUsers([]); // Reset
      
      // Fetch user details for everyone who liked
      if (post.likedBy && post.likedBy.length > 0) {
          const promises = post.likedBy.map(async (username) => {
              // Try to find user doc
              const q = query(collection(db, "users"), orderBy("username"), limit(1)); 
              // Simplification: In real app, query by username field
              // For now, we just display the usernames from the array
              return { username }; 
          });
          // In a real app, you'd fetch profile pics here
          setModalUsers(post.likedBy.map(u => ({ username: u }))); 
      }
  };

  const openCommentsModal = (post) => {
      setSelectedPost(post);
      setActiveModal('comments');
      // Subscribe to comments subcollection
      const q = query(collection(db, "shayaris", post.id, "comments"), orderBy("timestamp", "asc"));
      const unsub = onSnapshot(q, (snap) => {
          setPostComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      // Store unsub function to cleanup if needed (React handles simple unmounts)
  };

  const openShareModal = (post) => {
      setSelectedPost(post);
      setActiveModal('share');
  };

  // --- MODAL ACTIONS ---

  const postComment = async () => {
      if(!newComment.trim() || !selectedPost) return;
      const text = newComment;
      setNewComment("");

      try {
          // 1. Add comment to subcollection
          await addDoc(collection(db, "shayaris", selectedPost.id, "comments"), {
              username: currentUser,
              text: text,
              timestamp: serverTimestamp()
          });

          // 2. Update comment count on post
          const postRef = doc(db, "shayaris", selectedPost.id);
          await updateDoc(postRef, { commentCount: (selectedPost.commentCount || 0) + 1 });

          // 3. Send Notification
          if(selectedPost.author !== currentUser) {
              await addDoc(collection(db, "notifications"), {
                  type: "comment",
                  fromUser: currentUser,
                  toUser: selectedPost.author,
                  postId: selectedPost.id,
                  contentSnippet: text,
                  timestamp: serverTimestamp(),
                  read: false
              });
          }
      } catch(err) { console.error("Comment failed:", err); }
  };

  const handleShareAction = async (platform) => {
      if(!selectedPost) return;
      
      const shareText = encodeURIComponent(`Check out this shayari by @${selectedPost.author}:\n\n"${selectedPost.content}"\n\nSent from ShayariGram`);
      const url = window.location.href; // Or specific post link

      // 1. Increment Share Count in DB
      const postRef = doc(db, "shayaris", selectedPost.id);
      await updateDoc(postRef, { shares: (selectedPost.shares || 0) + 1 });

      // 2. Perform Action
      if (platform === 'whatsapp') {
          window.open(`https://wa.me/?text=${shareText} ${url}`, '_blank');
      } else if (platform === 'instagram') {
          // Insta doesn't allow direct web sharing, usually just copy link
          navigator.clipboard.writeText(`${selectedPost.content} - @${selectedPost.author}`);
          alert("Text copied! Open Instagram to paste.");
          window.open('https://instagram.com', '_blank');
      } else if (platform === 'copy') {
          navigator.clipboard.writeText(`${selectedPost.content}\n\n- @${selectedPost.author}`);
          alert("Copied to clipboard!");
      } else if (platform === 'save_device') {
          // Download Image Logic
          if(selectedPost.image) {
              const link = document.createElement('a');
              link.href = selectedPost.image;
              link.download = `shayari_${selectedPost.id}.jpg`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
          } else {
              alert("No image to save (Text only)");
          }
      }
      
      setActiveModal(null);
  };

  const closeModal = () => {
      setActiveModal(null);
      setSelectedPost(null);
  };

  // Identify Top Post
  const topPostId = posts.length > 0 ? [...posts].sort((a, b) => (b.likes || 0) - (a.likes || 0))[0].id : null;

  if (loading) return <div className="text-center py-10 text-gray-400">Loading Feed...</div>;

  return (
    <div className="space-y-8 pb-20">
      
      {/* --- POSTS FEED --- */}
      {posts.map((post) => {
        const isTopPick = post.id === topPostId && post.likes > 0;
        const displayUser = post.author || "Unknown";
        const isLikedByMe = post.likedBy?.includes(currentUser);
        const isSavedByMe = savedPosts.includes(post.id);
        const friendWhoLiked = post.likedBy?.find(user => followingList.includes(user));
        
        let likedByText = "";
        if (post.likes > 0) {
            if (friendWhoLiked) {
                likedByText = (
                    <>Liked by <span className="font-bold text-gray-900">{friendWhoLiked}</span> {post.likes > 1 && <span> and <span className="font-bold text-gray-900">{post.likes - 1} others</span></span>}</>
                );
            } else {
                likedByText = <><span className="font-bold text-gray-900">{post.likes}</span> likes</>;
            }
        }

        return (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} key={post.id} className={`bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow relative ${isTopPick ? 'ring-2 ring-yellow-400' : ''}`}>
                {isTopPick && <div className="absolute top-0 right-0 bg-yellow-400 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl flex items-center gap-1 shadow-sm z-10"><Trophy size={12} fill="currentColor" /> TRENDING</div>}

                <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => onProfileClick(displayUser)}>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 p-[2px]"><div className="w-full h-full bg-white rounded-full flex items-center justify-center"><span className="font-bold text-sm text-gray-700">{displayUser[0]?.toUpperCase()}</span></div></div>
                        <div><h3 className="font-bold text-sm text-gray-900 flex items-center gap-1">{displayUser} {isTopPick && <span className="text-yellow-500 text-[10px]">★</span>}</h3><p className="text-xs text-gray-500">{post.timestamp ? new Date(post.timestamp.toDate()).toDateString() : ""}</p></div>
                    </div>
                    <button className="text-gray-400 hover:text-gray-600"><MoreHorizontal size={20}/></button>
                </div>

                <div className="px-6 py-8 bg-gray-50 min-h-[200px] flex items-center justify-center text-center cursor-pointer" onClick={() => onPostClick && onPostClick(post.id)}>
                    {post.image ? <img src={post.image} alt="Post" className="w-full h-full object-cover rounded-lg" /> : <p className={`font-serif text-gray-800 leading-relaxed whitespace-pre-wrap ${post.content.length < 50 ? 'text-2xl' : 'text-lg'}`}>"{post.content}"</p>}
                </div>

                <div className="px-4 py-3 flex items-center justify-between border-t border-gray-100">
                    <div className="flex items-center gap-6">
                        <button className="flex items-center gap-2 group" onClick={() => handleLike(post)}><Heart size={24} className={`transition-transform group-hover:scale-110 ${isLikedByMe ? 'fill-red-500 text-red-500' : 'text-gray-600'}`} /></button>
                        <button className="flex items-center gap-2 group" onClick={() => openCommentsModal(post)}><MessageCircle size={24} className="text-gray-600 group-hover:text-blue-500 transition" /></button>
                        <button className="flex items-center gap-2 group" onClick={() => openShareModal(post)}><Share2 size={24} className="text-gray-600 group-hover:text-green-500 transition" /></button>
                    </div>
                    <button onClick={() => handleSave(post.id)}><Bookmark size={24} className={`${isSavedByMe ? 'fill-black text-black' : 'text-gray-600 hover:text-gray-900'}`} /></button>
                </div>

                {post.likes > 0 && (
                    <div className="px-4 pb-4 cursor-pointer" onClick={() => openLikesModal(post)}>
                        <p className="text-xs text-gray-500 font-medium">{likedByText}</p>
                    </div>
                )}
            </motion.div>
        );
      })}

      {/* --- ALL MODALS --- */}
      <AnimatePresence>
        {activeModal && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" onClick={closeModal}>
                <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} onClick={e => e.stopPropagation()} className="bg-white w-full md:max-w-sm rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl max-h-[80vh] flex flex-col">
                    
                    {/* MODAL HEADER */}
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                        <h3 className="font-bold text-center flex-1">
                            {activeModal === 'likes' && 'Likes'}
                            {activeModal === 'comments' && 'Comments'}
                            {activeModal === 'share' && 'Share to...'}
                        </h3>
                        <button onClick={closeModal}><X size={20}/></button>
                    </div>

                    {/* 1. LIKES LIST */}
                    {activeModal === 'likes' && (
                        <div className="flex-1 overflow-y-auto p-2">
                            {modalUsers.map((u, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl" onClick={() => { closeModal(); onProfileClick(u.username); }}>
                                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center font-bold text-gray-600">{u.username[0].toUpperCase()}</div>
                                    <span className="font-bold text-sm text-gray-900">{u.username}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 2. COMMENTS LIST */}
                    {activeModal === 'comments' && (
                        <>
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {postComments.length === 0 ? <p className="text-center text-gray-400 text-sm mt-10">No comments yet.</p> : (
                                    postComments.map(c => (
                                        <div key={c.id} className="flex gap-3">
                                            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center font-bold text-xs text-gray-600 shrink-0">{c.username[0].toUpperCase()}</div>
                                            <div>
                                                <p className="text-sm"><span className="font-bold mr-2">{c.username}</span>{c.text}</p>
                                                <p className="text-[10px] text-gray-400 mt-1">{c.timestamp ? new Date(c.timestamp.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Just now'}</p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                            <div className="p-3 border-t border-gray-100 flex gap-2 items-center bg-white">
                                <input 
                                    value={newComment} 
                                    onChange={e => setNewComment(e.target.value)} 
                                    placeholder="Add a comment..." 
                                    className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    onKeyDown={e => e.key === 'Enter' && postComment()}
                                />
                                <button onClick={postComment} disabled={!newComment.trim()} className="text-blue-500 font-bold text-sm disabled:opacity-50">Post</button>
                            </div>
                        </>
                    )}

                    {/* 3. SHARE OPTIONS */}
                    {activeModal === 'share' && (
                        <div className="p-4 grid grid-cols-4 gap-4">
                            <ShareOption icon={MessageCircle} color="bg-green-500" label="WhatsApp" onClick={() => handleShareAction('whatsapp')} />
                            <ShareOption icon={Instagram} color="bg-pink-500" label="Instagram" onClick={() => handleShareAction('instagram')} />
                            <ShareOption icon={Download} color="bg-gray-700" label="Save" onClick={() => handleShareAction('save_device')} />
                            <ShareOption icon={Copy} color="bg-blue-500" label="Copy Link" onClick={() => handleShareAction('copy')} />
                        </div>
                    )}

                </motion.div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ShareOption = ({ icon: Icon, color, label, onClick }) => (
    <div className="flex flex-col items-center gap-2 cursor-pointer group" onClick={onClick}>
        <div className={`w-12 h-12 rounded-full ${color} flex items-center justify-center text-white shadow-md group-hover:scale-110 transition`}>
            <Icon size={24} />
        </div>
        <span className="text-xs text-gray-600">{label}</span>
    </div>
);

export default ShayariFeed;