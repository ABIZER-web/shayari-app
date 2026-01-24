import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs, where, documentId } from 'firebase/firestore';
import { Search, TrendingUp, Loader2, X, Heart, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';

const Explore = ({ onProfileClick, onPostClick }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [trendingPosts, setTrendingPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingTrending, setLoadingTrending] = useState(true);

  // --- 1. FETCH TRENDING POSTS (ON LOAD) ---
  useEffect(() => {
    const fetchTrending = async () => {
      try {
        const q = query(collection(db, "shayaris"), orderBy("likes", "desc"), limit(18));
        const snapshot = await getDocs(q);
        setTrendingPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error("Error fetching trending:", err);
      }
      setLoadingTrending(false);
    };
    fetchTrending();
  }, []);

  // --- 2. INSTANT SEARCH ---
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setLoading(false);
      return;
    }

    const delaySearch = setTimeout(async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, "users"),
          where(documentId(), ">=", searchTerm),
          where(documentId(), "<=", searchTerm + '\uf8ff'),
          limit(10)
        );

        const snapshot = await getDocs(q);
        
        const usersFound = snapshot.docs.map(doc => ({
          username: doc.id,
          avatar: doc.id[0].toUpperCase(),
          ...doc.data()
        }));

        setSearchResults(usersFound);
      } catch (error) {
        console.error("Search error:", error);
      }
      setLoading(false);
    }, 300);

    return () => clearTimeout(delaySearch);
  }, [searchTerm]);

  return (
    <div className="max-w-4xl mx-auto min-h-[80vh]">
      
      {/* SEARCH BAR */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-md p-4 z-20 border-b border-gray-100">
        <div className="relative group max-w-lg mx-auto">
            <input 
                type="text" 
                placeholder="Search people..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-gray-100 border-none rounded-full py-3 pl-12 pr-10 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-black/5 focus:bg-white transition-all outline-none font-medium"
            />
            <Search className="absolute left-4 top-3 text-gray-400 group-focus-within:text-black transition" size={20} />
            
            {searchTerm && (
                <button 
                    onClick={() => { setSearchTerm(""); setSearchResults([]); }}
                    className="absolute right-3 top-3 text-gray-400 hover:text-black transition bg-gray-200 rounded-full p-0.5"
                >
                    <X size={14} />
                </button>
            )}
        </div>
      </div>

      {/* DYNAMIC CONTENT AREA */}
      <div className="min-h-[300px] p-2 md:p-4">
        {searchTerm ? (
            /* SEARCH RESULTS LIST */
            <div className="space-y-2 max-w-lg mx-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
                        <Loader2 size={20} className="animate-spin"/>
                        <span className="text-xs font-medium">Searching...</span>
                    </div>
                ) : searchResults.length > 0 ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-2">
                        {searchResults.map((user) => (
                            <div 
                                key={user.username}
                                onClick={() => onProfileClick(user.username)}
                                className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-2xl cursor-pointer transition active:scale-95 border border-transparent hover:border-gray-100"
                            >
                                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-gray-200 to-gray-300 flex items-center justify-center overflow-hidden shrink-0">
                                    <img 
                                        src={user.photoURL || "/favicon.png"} 
                                        alt={user.username} 
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-gray-900 text-sm">@{user.username}</h4>
                                    <p className="text-xs text-gray-500 truncate">{user.fullName || user.bio || "ShayariGram User"}</p>
                                </div>
                            </div>
                        ))}
                    </motion.div>
                ) : (
                    <div className="text-center py-10 opacity-50">
                        <p className="text-sm text-gray-400">No users found.</p>
                    </div>
                )}
            </div>
        ) : (
            /* TRENDING GRID (Default View) */
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center gap-2 mb-6 px-2">
                    <div className="p-1.5 bg-black rounded-lg text-white">
                        <TrendingUp size={16} />
                    </div>
                    <h3 className="font-bold text-gray-900 text-lg tracking-tight">Explore Trending</h3>
                </div>

                {loadingTrending ? (
                    <div className="flex justify-center py-20"><Loader2 size={30} className="animate-spin text-gray-300"/></div>
                ) : (
                    <div className="grid grid-cols-3 gap-1 md:gap-4">
                        {trendingPosts.map((post) => {
                            // Style Logic
                            const finalBg = post.bgColor || (post.background && (post.background.startsWith('#') || post.background.includes('gradient')) ? post.background : '#f3f4f6');
                            const finalText = post.textColor || '#000000';

                            return (
                                <motion.div 
                                    key={post.id}
                                    layout
                                    whileHover={{ scale: 1.02 }}
                                    className="aspect-square relative cursor-pointer group overflow-hidden rounded-md md:rounded-xl shadow-sm"
                                    style={{ background: finalBg }}
                                    onClick={() => onPostClick(post.id)} 
                                >
                                    <div className="absolute inset-0 flex items-center justify-center p-3 text-center">
                                        <p 
                                            className="font-serif font-medium text-[10px] md:text-sm line-clamp-5 leading-tight pointer-events-none"
                                            style={{ color: finalText }}
                                        >
                                            {post.content}
                                        </p>
                                    </div>

                                    {/* ⚡ HOVER OVERLAY: Show Likes/Comments (Respects Privacy) */}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-4 text-white font-bold backdrop-blur-[1px]">
                                        
                                        {/* Show Likes if NOT hidden */}
                                        {!post.hideLikes && (
                                            <span className="flex items-center gap-1 text-xs md:text-sm">
                                                <Heart size={16} fill="white" /> {post.likes || 0}
                                            </span>
                                        )}

                                        {/* Show Comments if NOT turned off */}
                                        {!post.turnOffCommenting && (
                                            <span className="flex items-center gap-1 text-xs md:text-sm">
                                                <MessageCircle size={16} fill="white" /> {post.commentCount || 0}
                                            </span>
                                        )}

                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
};

export default Explore;