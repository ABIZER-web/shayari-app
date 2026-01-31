import React, { useState, useEffect } from 'react';
import { db } from '../firebase'; 
import { 
  collection, query, orderBy, limit, getDocs, where, 
  addDoc, serverTimestamp, doc, updateDoc 
} from 'firebase/firestore';
import { 
  Search, TrendingUp, Loader2, X, Heart, MessageCircle, 
  Send, Share2, Check, Link as LinkIcon, UserPlus, User 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Explore = ({ onProfileClick, onPostClick, blockedUsers = [] }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [userResults, setUserResults] = useState([]);
  const [postResults, setPostResults] = useState([]);
  const [trendingPosts, setTrendingPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [currentUser] = useState(localStorage.getItem('shayari_user'));

  // Multi-Share States
  const [shareModalPostId, setShareModalPostId] = useState(null);
  const [shareRecentChats, setShareRecentChats] = useState([]);
  const [randomUsers, setRandomUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [isSending, setIsSending] = useState(false);

  // --- 1. FETCH TRENDING POSTS ---
  useEffect(() => {
    const fetchTrending = async () => {
      try {
        const q = query(collection(db, "shayaris"), orderBy("likes", "desc"), limit(60));
        const snapshot = await getDocs(q);
        const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const filteredPosts = posts.filter(post => !blockedUsers.includes(post.author));

        const rankedPosts = filteredPosts.sort((a, b) => {
            const scoreA = (a.likes || 0) + (a.commentCount || 0);
            const scoreB = (b.likes || 0) + (b.commentCount || 0);
            return scoreB - scoreA;
        });

        setTrendingPosts(rankedPosts.slice(0, 27)); 
      } catch (err) { console.error("Trending fetch error:", err); }
      setLoadingTrending(false);
    };
    fetchTrending();
  }, [blockedUsers]);

  // --- 2. SEARCH LOGIC ---
  useEffect(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) { 
        setUserResults([]); 
        setPostResults([]); 
        setLoading(false); 
        return; 
    }

    const delaySearch = setTimeout(async () => {
      setLoading(true);
      try {
        const userQ = query(
            collection(db, "users"), 
            where("username", ">=", term), 
            where("username", "<=", term + '\uf8ff'), 
            limit(10)
        );
        const userSnap = await getDocs(userQ);
        const usersFound = userSnap.docs
            .map(doc => ({ uid: doc.id, ...doc.data() }))
            .filter(u => !blockedUsers.includes(u.username));

        const rankedUsers = usersFound.sort((a, b) => (b.followers?.length || 0) - (a.followers?.length || 0));

        const postsFound = trendingPosts.filter(p => 
            p.content.toLowerCase().includes(term) || 
            p.author.toLowerCase().includes(term)
        );

        setUserResults(rankedUsers);
        setPostResults(postsFound);
      } catch (e) { console.error("Search error:", e); }
      setLoading(false);
    }, 400);

    return () => clearTimeout(delaySearch);
  }, [searchTerm, blockedUsers, trendingPosts]);

  // --- 3. SHARE MODAL LOGIC (SEND TO FUNCTION) ---
  const openShareModal = async (postId) => {
    setShareModalPostId(postId);
    setSelectedRecipients([]);
    
    const chatQ = query(
        collection(db, "chats"), 
        where("participants", "array-contains", currentUser), 
        orderBy("timestamp", "desc"), 
        limit(3)
    );
    const chatSnap = await getDocs(chatQ);
    setShareRecentChats(chatSnap.docs.map(d => ({ 
        id: d.id, 
        username: d.data().participants.find(p => p !== currentUser) 
    })));

    const userQ = query(collection(db, "users"), limit(10));
    const userSnap = await getDocs(userQ);
    setRandomUsers(userSnap.docs.map(d => ({ 
        id: d.id, 
        username: d.data().username 
    })).filter(u => u.username !== currentUser).sort(() => 0.5 - Math.random()).slice(0, 5));
  };

  const handleFinalShare = async () => {
    setIsSending(true);
    const promises = selectedRecipients.map(async (rec) => {
      const chatRef = doc(db, "chats", rec.id);
      await addDoc(collection(chatRef, "messages"), { 
          sender: currentUser, 
          timestamp: serverTimestamp(), 
          isPostShare: true, 
          postId: shareModalPostId, 
          text: 'Shared a post' 
      });
      await updateDoc(chatRef, { 
          timestamp: serverTimestamp(), 
          lastMessage: "Shared a post", 
          isRead: false 
      });
    });
    await Promise.all(promises);
    setShareModalPostId(null);
    setIsSending(false);
  };

  const shareToWhatsApp = (post) => {
    const text = `Check out this shayari by @${post.author}: "${post.content}"\n\nRead more on ShayariGram: ${window.location.origin}/post/${post.id}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="max-w-4xl mx-auto min-h-screen bg-[#222831] text-[#eeeeee] pb-24">
      {/* SEARCH HEADER */}
      <div className="sticky top-0 bg-[#222831]/95 backdrop-blur-md p-4 z-20 border-b border-[#393e46]">
        <div className="relative group max-w-lg mx-auto">
            <input 
                type="text" 
                placeholder="Search people or shayaris..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                className="w-full bg-[#393e46] border-none rounded-2xl py-3.5 pl-12 pr-10 text-[#eeeeee] placeholder-gray-500 focus:ring-2 focus:ring-[#00adb5] outline-none font-medium shadow-sm" 
            />
            <Search className="absolute left-4 top-4 text-[#00adb5]" size={20} />
            {searchTerm && (
                <button onClick={() => setSearchTerm("")} className="absolute right-3 top-3.5 text-gray-400 hover:text-white transition bg-gray-600 rounded-full p-1">
                    <X size={14}/>
                </button>
            )}
        </div>
      </div>

      <div className="p-3">
        {searchTerm ? (
            /* SEARCH RESULTS VIEW */
            <div className="space-y-8 max-w-lg mx-auto">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                        <Loader2 size={30} className="animate-spin text-[#00adb5]"/>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Searching</p>
                    </div>
                ) : (
                    <>
                        {userResults.length > 0 && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <h3 className="text-[#00adb5] font-bold text-[10px] uppercase tracking-widest mb-4 px-1 flex items-center gap-2"><User size={14}/> People</h3>
                                <div className="space-y-2">
                                    {userResults.map(user => (
                                        <div key={user.uid} onClick={() => onProfileClick(user.username)} className="flex items-center gap-4 p-4 bg-[#393e46] hover:bg-[#00adb5]/10 rounded-2xl cursor-pointer transition">
                                            <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-white font-bold">{user.username[0].toUpperCase()}</div>
                                            <div>
                                                <h4 className="font-bold text-sm">@{user.username}</h4>
                                                <p className="text-xs text-gray-500">{user.fullName}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                        {postResults.length > 0 && (
                            <div className="grid grid-cols-2 gap-3 mt-4">
                                {postResults.map(post => (
                                    <div key={post.id} onClick={() => onPostClick(post.id)} className="aspect-square rounded-2xl p-4 flex items-center justify-center text-center cursor-pointer shadow-lg relative" style={{ background: post.bgColor || '#393e46' }}>
                                        <p className="text-[11px] font-serif line-clamp-4" style={{ color: post.textColor }}>{post.content}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        ) : (
            /* TRENDING GRID */
            <div className="max-w-4xl mx-auto mt-2">
                <div className="flex items-center justify-between mb-6 px-2">
                    <div className="flex items-center gap-2"><TrendingUp size={20} className="text-[#00adb5]"/><h3 className="font-bold text-[#eeeeee] text-xl">Hot Today</h3></div>
                </div>

                {loadingTrending ? (
                    <div className="flex justify-center py-20"><Loader2 size={35} className="animate-spin text-[#00adb5]"/></div>
                ) : (
                    <div className="grid grid-cols-3 gap-1 md:gap-4">
                        {trendingPosts.map((post, index) => (
                            <motion.div key={post.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: index * 0.02 }} className="aspect-square relative group overflow-hidden rounded-md md:rounded-2xl shadow-xl transition-all" style={{ background: post.bgColor || '#393e46' }} onClick={() => onPostClick(post.id)}>
                                <div className="absolute inset-0 flex items-center justify-center p-3 text-center">
                                    <p className="font-serif font-medium text-[10px] md:text-sm line-clamp-5" style={{ color: post.textColor || '#eeeeee' }}>{post.content}</p>
                                </div>
                                
                                {/* 🔥 UPDATED HOVER OVERLAY: Removed Share Icon, Added Counts + Send To Button */}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-4 text-white">
                                    <div className="flex items-center gap-6">
                                        <div className="flex flex-col items-center gap-1">
                                            <Heart size={20} fill="white" className="text-white"/>
                                            <span className="text-[10px] font-bold">{(post.likes || 0)}</span>
                                        </div>
                                        <div className="flex flex-col items-center gap-1">
                                            <MessageCircle size={20} fill="white" className="text-white"/>
                                            <span className="text-[10px] font-bold">{(post.commentCount || 0)}</span>
                                        </div>
                                    </div>
                                    
                                    {/* 🔥 FUNCTIONAL SEND TO BUTTON */}
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); openShareModal(post.id); }} 
                                      className="flex items-center gap-2 bg-[#00adb5] px-4 py-1.5 rounded-full hover:scale-105 transition active:scale-95 shadow-md"
                                    >
                                        <Send size={14} fill="white" />                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        )}
      </div>

      {/* SHARE MODAL */}
      <AnimatePresence>
        {shareModalPostId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShareModalPostId(null)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-[#222831] w-full max-w-sm rounded-[2rem] p-6 border border-gray-800 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-xl text-[#eeeeee]">Share Shayari</h3>
                <X className="text-gray-500 cursor-pointer hover:text-white" onClick={() => setShareModalPostId(null)} />
              </div>
              
              <div className="flex gap-3 mb-6">
                <button onClick={() => shareToWhatsApp(trendingPosts.find(p => p.id === shareModalPostId))} className="flex-1 flex flex-col items-center gap-2 p-4 bg-[#25D366]/10 rounded-2xl transition active:scale-95 group">
                    <div className="w-10 h-10 rounded-full bg-[#25D366] flex items-center justify-center text-white shadow-lg"><Share2 size={20} /></div>
                    <span className="text-[10px] font-bold text-white uppercase tracking-tighter">WhatsApp</span>
                </button>
                <button onClick={() => {navigator.clipboard.writeText(`${window.location.origin}/post/${shareModalPostId}`); alert("Link Copied!");}} className="flex-1 flex flex-col items-center gap-2 p-4 bg-[#393e46] rounded-2xl transition active:scale-95 group">
                    <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-white shadow-lg"><LinkIcon size={20} /></div>
                    <span className="text-[10px] font-bold text-white uppercase tracking-tighter">Copy Link</span>
                </button>
              </div>

              <div className="relative mb-6">
                <Search size={16} className="absolute left-3 top-3 text-gray-500" />
                <input type="text" placeholder="Search people..." className="w-full bg-[#393e46] rounded-xl py-2.5 pl-10 pr-4 text-sm text-white outline-none focus:ring-1 focus:ring-[#00adb5]" onChange={(e) => setSearchQuery(e.target.value)}/>
              </div>

              <div className="space-y-6 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                {shareRecentChats.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Recent Chats</p>
                    {shareRecentChats.map(chat => (
                        <button key={chat.id} onClick={() => setSelectedRecipients(prev => prev.find(r => r.id === chat.id) ? prev.filter(r => r.id !== chat.id) : [...prev, chat])} className={`w-full flex items-center justify-between p-3 rounded-2xl mb-2 transition ${selectedRecipients.find(r => r.id === chat.id) ? 'bg-[#00adb5]' : 'bg-[#393e46] hover:bg-[#2d333b]'}`}>
                          <span className="text-sm font-bold text-white">@{chat.username}</span>
                          {selectedRecipients.find(r => r.id === chat.id) ? <Check size={16} /> : <Send size={14} className="opacity-40" />}
                        </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedRecipients.length > 0 && (
                <button onClick={handleFinalShare} disabled={isSending} className="w-full mt-6 bg-[#00adb5] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl hover:bg-teal-600 transition-all">
                  {isSending ? <Loader2 className="animate-spin" size={20} /> : <Send size={18} />} 
                  Send to {selectedRecipients.length} People
                </button>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Explore;