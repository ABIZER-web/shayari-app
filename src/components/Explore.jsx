import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs, where, documentId } from 'firebase/firestore';
import { Search, TrendingUp, User, ArrowRight, Loader2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Explore = ({ onProfileClick }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [trendingPosts, setTrendingPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingTrending, setLoadingTrending] = useState(true);

  // --- 1. FETCH TRENDING POSTS (ON LOAD) ---
  useEffect(() => {
    const fetchTrending = async () => {
      try {
        const q = query(collection(db, "shayaris"), orderBy("likes", "desc"), limit(6));
        const snapshot = await getDocs(q);
        setTrendingPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error("Error fetching trending:", err);
      }
      setLoadingTrending(false);
    };
    fetchTrending();
  }, []);

  // --- 2. INSTANT SEARCH (LETTER BY LETTER) ---
  useEffect(() => {
    // If search is empty, clear results and stop
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setLoading(false);
      return;
    }

    // Debounce: Wait 300ms after user stops typing before searching DB
    const delaySearch = setTimeout(async () => {
      setLoading(true);
      try {
        const term = searchTerm.toLowerCase(); // Ensure consistency if needed
        
        // Search 'users' collection by Document ID (Username)
        // logic: starts with searchTerm
        const q = query(
          collection(db, "users"),
          where(documentId(), ">=", searchTerm),
          where(documentId(), "<=", searchTerm + '\uf8ff'),
          limit(10) // Limit to 10 for "suggestion" feel
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
    }, 300); // 300ms delay

    return () => clearTimeout(delaySearch); // Cleanup timer on new keystroke
  }, [searchTerm]);

  return (
    <div className="max-w-2xl mx-auto min-h-[80vh]">
      
      {/* SEARCH BAR */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md p-4 z-10 rounded-b-3xl mb-6 shadow-sm border-b border-gray-100">
        <div className="relative group">
            <input 
                type="text" 
                placeholder="Search" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-gray-100 border-none rounded-2xl py-3 pl-12 pr-10 text-gray-800 placeholder-gray-500 focus:ring-2 focus:ring-black/5 focus:bg-white transition-all shadow-inner outline-none font-medium"
            />
            <Search className="absolute left-4 top-3 text-gray-400 group-focus-within:text-black transition" size={20} />
            
            {/* Clear Button (Visible when typing) */}
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
      <div className="min-h-[300px]">
        {searchTerm ? (
            /* SEARCH RESULTS LIST */
            <div className="space-y-2 px-2">
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
                                className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl cursor-pointer transition active:scale-95"
                            >
                                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-gray-200 to-gray-300 flex items-center justify-center text-gray-600 font-bold text-lg">
                                    {user.avatar}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-gray-900 text-sm">@{user.username}</h4>
                                    <p className="text-xs text-gray-500 truncate">{user.bio || "ShayariGram User"}</p>
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
            <div className="px-2">
                <div className="flex items-center gap-2 mb-4 px-2">
                    <TrendingUp className="text-black" size={18} />
                    <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wide">Trending</h3>
                </div>

                {loadingTrending ? (
                    <div className="flex justify-center py-20"><Loader2 size={30} className="animate-spin text-gray-300"/></div>
                ) : (
                    <div className="grid grid-cols-3 gap-1 md:gap-4">
                        {trendingPosts.map((post) => (
                            <motion.div 
                                key={post.id}
                                whileHover={{ scale: 1.02 }}
                                className="bg-gray-100 aspect-square relative cursor-pointer group overflow-hidden"
                                onClick={() => onProfileClick(post.author)}
                            >
                                {post.image ? (
                                    <img src={post.image} alt="Post" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center p-2 text-center bg-white border border-gray-100">
                                        <p className="text-[8px] md:text-xs font-serif text-gray-400 line-clamp-3">"{post.content}"</p>
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
};

export default Explore;