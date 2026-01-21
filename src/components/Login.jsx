import { useState, useEffect } from 'react';
import { auth, db, googleProvider } from '../firebase';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, getDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { motion } from 'framer-motion';
import { X, ChevronLeft } from 'lucide-react';

const Login = ({ onLogin }) => {
  // State for toggling Login vs Signup
  const [isLogin, setIsLogin] = useState(true);
  
  const [emailOrUser, setEmailOrUser] = useState(""); // For Login
  const [email, setEmail] = useState("");             // For Signup
  const [username, setUsername] = useState("");       // For Signup
  const [password, setPassword] = useState("");
  
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Saved Accounts State
  const [savedAccounts, setSavedAccounts] = useState([]);
  const [showSavedAccounts, setShowSavedAccounts] = useState(true);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('shayari_saved_accounts') || "[]");
    setSavedAccounts(saved);
    if (saved.length === 0) setShowSavedAccounts(false);
  }, []);

  // --- 1. SAVE ACCOUNT HELPER ---
  const saveAccountLocally = (user, savedPassword = null) => {
    const existing = JSON.parse(localStorage.getItem('shayari_saved_accounts') || "[]");
    
    const newAccount = {
        uid: user.uid,
        username: user.displayName || "User",
        photoURL: user.photoURL,
        email: user.email,
        password: savedPassword ? btoa(savedPassword) : null 
    };

    const filtered = existing.filter(acc => acc.uid !== user.uid);
    const updated = [newAccount, ...filtered];
    
    localStorage.setItem('shayari_saved_accounts', JSON.stringify(updated));
    setSavedAccounts(updated);
  };

  // --- 2. AUTH HANDLER ---
  const handleAuth = async (e) => {
    if (e) e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isLogin) {
        // --- LOGIN LOGIC ---
        let targetEmail = emailOrUser;

        // If input is username (no @), find the email
        if (!emailOrUser.includes('@')) {
            const q = query(collection(db, "users"), where("username", "==", emailOrUser));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) throw new Error("Username not found.");
            targetEmail = querySnapshot.docs[0].data().email;
        }

        const userCredential = await signInWithEmailAndPassword(auth, targetEmail, password);
        const user = userCredential.user;
        
        let finalUsername = user.displayName;
        if (!finalUsername) {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) finalUsername = userDoc.data().username;
        }

        // Ask to save if new
        const isAlreadySaved = savedAccounts.some(acc => acc.uid === user.uid && acc.password);
        if (!isAlreadySaved) {
            setTimeout(() => {
                if(window.confirm("Save login info on this device?\n\nNext time you can log in directly without entering your password.")) {
                    saveAccountLocally({ ...user, displayName: finalUsername }, password);
                } else {
                    saveAccountLocally({ ...user, displayName: finalUsername }, null);
                }
            }, 500);
        }
        onLogin(finalUsername);

      } else {
        // --- SIGNUP LOGIC (Restored) ---
        
        // 1. Check Username
        const q = query(collection(db, "users"), where("username", "==", username));
        const usernameCheck = await getDocs(q);
        if (!usernameCheck.empty) throw new Error("Username is already taken.");

        // 2. Create Auth User
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 3. Update Profile
        await updateProfile(user, { displayName: username });

        // 4. Save to Firestore
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          username: username,
          email: email,
          fullName: "", 
          photoURL: "",
          bio: "",
          followers: [],
          following: [],
          saved: [],
          createdAt: serverTimestamp()
        });

        // 5. Save Locally
        if(window.confirm("Save login info for this new account?")) {
            saveAccountLocally({ ...user, displayName: username }, password);
        } else {
            saveAccountLocally({ ...user, displayName: username }, null);
        }
        onLogin(username);
      }
    } catch (err) {
      console.error(err);
      setError(err.message.replace("Firebase: ", ""));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      const userDoc = await getDoc(doc(db, "users", user.uid));
      let finalUsername = user.displayName ? user.displayName.replace(/\s+/g, '').toLowerCase() : "user";

      if (!userDoc.exists()) {
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
      
      saveAccountLocally({ ...user, displayName: finalUsername }, null);
      onLogin(finalUsername);
    } catch (err) {
      setError("Google Login Failed");
    }
  };

  // Handle clicking a saved account tile
  const handleSavedAccountClick = async (acc) => {
      if (acc.password) {
          setLoading(true);
          try {
             const savedPass = atob(acc.password);
             setIsLogin(true);
             setEmailOrUser(acc.username);
             setPassword(savedPass);
             await signInWithEmailAndPassword(auth, acc.email, savedPass);
             onLogin(acc.username);
          } catch (e) {
             console.error("Auto login failed", e);
             setError("Session expired. Please log in again.");
             setShowSavedAccounts(false);
             setIsLogin(true);
             setEmailOrUser(acc.username);
          } finally {
             setLoading(false);
          }
      } else {
          // No password, just fill username and go to login
          setShowSavedAccounts(false);
          setIsLogin(true);
          setEmailOrUser(acc.username);
      }
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
      
      {showSavedAccounts && savedAccounts.length > 0 ? (
          <div className="bg-white w-full max-w-sm p-8 rounded-lg border border-gray-300 shadow-sm text-center">
             <img src="/logo.png" alt="ShayariGram" className="h-24 mx-auto mb-8" />
             
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
                                <p className="text-xs text-gray-400">
                                    {acc.password ? "Saved • Tap to login" : "Saved"}
                                </p>
                            </div>
                        </div>
                        
                        <button onClick={(e) => removeAccount(e, acc.uid)} className="p-2 text-gray-400 hover:text-red-500">
                            <X size={18} />
                        </button>
                    </div>
                ))}
             </div>

             {/* SWITCH ACCOUNTS -> GO TO LOGIN */}
             <button 
                onClick={() => { setShowSavedAccounts(false); setIsLogin(true); }} 
                className="text-blue-500 font-bold text-sm mb-4 block w-full"
             >
                Switch Accounts
             </button>
             
             {/* SIGN UP -> GO TO SIGN UP */}
             <button 
                onClick={() => { setShowSavedAccounts(false); setIsLogin(false); }} 
                className="text-blue-900 font-bold text-sm"
             >
                Sign Up
             </button>
          </div>
      ) : (

      /* --- AUTH FORM (LOGIN OR SIGNUP) --- */
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white w-full max-w-sm border border-gray-300 shadow-sm rounded-none sm:rounded-lg overflow-hidden"
      >
        <div className="p-8 pb-4">
            <div className="flex justify-center mb-8">
                <img src="/logo.png" alt="ShayariGram" className="h-24 object-contain" />
            </div>

            <form onSubmit={handleAuth} className="flex flex-col gap-3">
                
                {/* LOGIN: Phone/User/Email */}
                {isLogin && (
                    <input 
                        type="text"
                        placeholder="Phone number, username, or email"
                        className="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-sm focus:ring-1 focus:ring-gray-400 focus:outline-none block w-full p-2.5"
                        value={emailOrUser}
                        onChange={(e) => setEmailOrUser(e.target.value)}
                        required 
                    />
                )}

                {/* SIGNUP: Username -> Email */}
                {!isLogin && (
                    <>
                        <input 
                            type="text" 
                            placeholder="Username" 
                            className="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-sm focus:ring-1 focus:ring-gray-400 focus:outline-none block w-full p-2.5"
                            value={username}
                            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                            required 
                        />
                         <input 
                            type="email"
                            placeholder="Mobile Number or Email"
                            className="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-sm focus:ring-1 focus:ring-gray-400 focus:outline-none block w-full p-2.5"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
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
            
            {savedAccounts.length > 0 && (
                <button 
                    onClick={() => setShowSavedAccounts(true)}
                    className="w-full mt-6 text-xs text-gray-500 flex items-center justify-center gap-1 hover:text-black transition"
                >
                    <ChevronLeft size={14} /> Back to Saved Accounts
                </button>
            )}

        </div>

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