import { useState, useEffect } from 'react';
import { auth, db, googleProvider } from '../firebase';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, getDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, LogIn, ChevronRight } from 'lucide-react';

const Login = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true); // Toggle Login/Signup
  const [emailOrUser, setEmailOrUser] = useState(""); // Can be email OR username
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Saved Accounts State
  const [savedAccounts, setSavedAccounts] = useState([]);
  const [showSavedAccounts, setShowSavedAccounts] = useState(true);

  // 1. Load Saved Accounts on Mount
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('shayari_saved_accounts') || "[]");
    setSavedAccounts(saved);
    if (saved.length === 0) setShowSavedAccounts(false);
  }, []);

  // 2. HELPER: Save Account to LocalStorage (for Switch Account)
  const saveAccountLocally = (user) => {
    const newAccount = {
        uid: user.uid,
        username: user.displayName || "User",
        photoURL: user.photoURL,
        email: user.email // Needed for quick login pre-fill
    };

    const existing = JSON.parse(localStorage.getItem('shayari_saved_accounts') || "[]");
    // Remove if already exists to update it to the top
    const filtered = existing.filter(acc => acc.uid !== user.uid);
    const updated = [newAccount, ...filtered];
    
    localStorage.setItem('shayari_saved_accounts', JSON.stringify(updated));
  };

  // 3. LOGIN LOGIC (Username OR Email)
  const handleAuth = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isLogin) {
        // --- LOGIN MODE ---
        let targetEmail = emailOrUser;

        // A. Check if input is NOT an email (assume it's a username)
        if (!emailOrUser.includes('@')) {
            const q = query(collection(db, "users"), where("username", "==", emailOrUser));
            const querySnapshot = await getDocs(q);
            
            if (querySnapshot.empty) {
                throw new Error("Username not found.");
            }
            // Get the email associated with this username
            targetEmail = querySnapshot.docs[0].data().email;
        }

        // B. Sign In
        const userCredential = await signInWithEmailAndPassword(auth, targetEmail, password);
        const user = userCredential.user;
        
        // C. Fetch Username from DB if missing in Auth
        let finalUsername = user.displayName;
        if (!finalUsername) {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) finalUsername = userDoc.data().username;
        }

        saveAccountLocally({ ...user, displayName: finalUsername });
        onLogin(finalUsername);
      
      } else {
        // --- SIGNUP MODE ---
        // 1. Check Username Availability
        const q = query(collection(db, "users"), where("username", "==", username));
        const usernameCheck = await getDocs(q);
        if (!usernameCheck.empty) throw new Error("Username is already taken.");

        // 2. Create Auth User
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 3. Update Profile
        await updateProfile(user, { displayName: username });

        // 4. Create User Document
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          username: username,
          email: email,
          fullName: fullName,
          photoURL: "",
          bio: "",
          followers: [],
          following: [],
          saved: [],
          createdAt: serverTimestamp()
        });

        saveAccountLocally({ ...user, displayName: username });
        onLogin(username);
      }
    } catch (err) {
      console.error(err);
      setError(err.message.replace("Firebase: ", ""));
    } finally {
      setLoading(false);
    }
  };

  // 4. GOOGLE LOGIN
  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // Check if user exists
      const userDoc = await getDoc(doc(db, "users", user.uid));
      let finalUsername = user.displayName.replace(/\s+/g, '').toLowerCase();

      if (!userDoc.exists()) {
        // Create new doc if first time
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          username: finalUsername,
          email: user.email,
          fullName: user.displayName,
          photoURL: user.photoURL,
          bio: "",
          followers: [],
          following: [],
          saved: [],
          createdAt: serverTimestamp()
        });
      } else {
          finalUsername = userDoc.data().username;
      }
      
      saveAccountLocally({ ...user, displayName: finalUsername });
      onLogin(finalUsername);
    } catch (err) {
      setError("Google Login Failed");
    }
  };

  // 5. CLICK SAVED ACCOUNT
  const handleSavedAccountClick = (acc) => {
      // Pre-fill and switch to login view
      setShowSavedAccounts(false);
      setIsLogin(true);
      setEmailOrUser(acc.username); // Or acc.email, but username looks nicer
  };

  const removeAccount = (e, uid) => {
      e.stopPropagation();
      const updated = savedAccounts.filter(acc => acc.uid !== uid);
      setSavedAccounts(updated);
      localStorage.setItem('shayari_saved_accounts', JSON.stringify(updated));
      if (updated.length === 0) setShowSavedAccounts(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      
      {/* --- SAVED ACCOUNTS VIEW --- */}
      {showSavedAccounts && savedAccounts.length > 0 ? (
          <div className="bg-white w-full max-w-sm p-8 rounded-lg border border-gray-300 shadow-sm text-center">
             <img src="/logo.png" alt="ShayariGram" className="h-12 mx-auto mb-8" />
             
             <div className="space-y-4 mb-8">
                {savedAccounts.map(acc => (
                    <div 
                        key={acc.uid} 
                        onClick={() => handleSavedAccountClick(acc)}
                        className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition shadow-sm group"
                    >
                        <div className="flex items-center gap-3">
                            {acc.photoURL ? (
                                <img src={acc.photoURL} alt={acc.username} className="w-12 h-12 rounded-full object-cover" />
                            ) : (
                                <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center font-bold text-gray-500">
                                    {acc.username[0].toUpperCase()}
                                </div>
                            )}
                            <div className="text-left">
                                <h3 className="font-bold text-sm text-gray-900">{acc.username}</h3>
                                <p className="text-xs text-gray-400">Saved</p>
                            </div>
                        </div>
                        
                        {/* Remove Button */}
                        <button onClick={(e) => removeAccount(e, acc.uid)} className="p-2 text-gray-400 hover:text-red-500">
                            <X size={18} />
                        </button>
                    </div>
                ))}
             </div>

             <button 
                onClick={() => setShowSavedAccounts(false)} 
                className="text-blue-500 font-bold text-sm mb-4 block w-full"
             >
                Switch Accounts
             </button>
             
             <button 
                onClick={() => setShowSavedAccounts(false)} 
                className="text-blue-900 font-bold text-sm"
             >
                Sign Up
             </button>
          </div>
      ) : (

      /* --- REGULAR LOGIN FORM --- */
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white w-full max-w-sm border border-gray-300 shadow-sm rounded-none sm:rounded-lg overflow-hidden"
      >
        <div className="p-8 pb-4">
            <div className="flex justify-center mb-8">
                <img src="/logo.png" alt="ShayariGram" className="h-12 object-contain" />
            </div>

            <form onSubmit={handleAuth} className="flex flex-col gap-3">
                
                {/* Email / Username Input */}
                <input 
                    type={isLogin ? "text" : "email"}
                    placeholder={isLogin ? "Phone number, username, or email" : "Mobile Number or Email"}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-sm focus:ring-1 focus:ring-gray-400 focus:outline-none block w-full p-2.5"
                    value={isLogin ? emailOrUser : email}
                    onChange={(e) => isLogin ? setEmailOrUser(e.target.value) : setEmail(e.target.value)}
                    required 
                />

                {!isLogin && (
                    <>
                        <input 
                            type="text" 
                            placeholder="Full Name" 
                            className="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-sm focus:ring-1 focus:ring-gray-400 focus:outline-none block w-full p-2.5"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            required 
                        />
                        <input 
                            type="text" 
                            placeholder="Username" 
                            className="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-sm focus:ring-1 focus:ring-gray-400 focus:outline-none block w-full p-2.5"
                            value={username}
                            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                            required 
                        />
                    </>
                )}

                <input 
                    type="password" 
                    placeholder="Password" 
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-sm focus:ring-1 focus:ring-gray-400 focus:outline-none block w-full p-2.5"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required 
                />

                <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full text-white bg-blue-500 hover:bg-blue-600 focus:ring-4 focus:ring-blue-300 font-bold rounded-lg text-sm px-5 py-1.5 mt-2 focus:outline-none transition disabled:opacity-50"
                >
                    {loading ? "Processing..." : (isLogin ? "Log in" : "Sign up")}
                </button>

                {error && <p className="text-red-500 text-xs text-center mt-2">{error}</p>}

                {/* Divider */}
                <div className="flex items-center my-4">
                    <div className="flex-1 h-px bg-gray-300"></div>
                    <span className="px-4 text-xs font-bold text-gray-500">OR</span>
                    <div className="flex-1 h-px bg-gray-300"></div>
                </div>

                <button 
                    type="button"
                    onClick={handleGoogleLogin}
                    className="flex items-center justify-center gap-2 text-blue-900 font-bold text-sm"
                >
                    <span className="text-lg">G</span> Log in with Google
                </button>
            </form>
        </div>

        {/* Bottom Box */}
        <div className="p-6 border-t border-gray-300 bg-gray-50 text-center">
            <p className="text-sm">
                {isLogin ? "Don't have an account? " : "Have an account? "}
                <button onClick={() => setIsLogin(!isLogin)} className="text-blue-500 font-bold">
                    {isLogin ? "Sign up" : "Log in"}
                </button>
            </p>
        </div>
      </motion.div>
      )}
    </div>
  );
};

export default Login;