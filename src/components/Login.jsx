import { useState, useEffect, useRef } from 'react';
import { auth, db, storage } from '../firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile, 
  sendPasswordResetEmail 
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Loader2, ArrowLeft, CheckCircle, XCircle, AlertTriangle, Camera, Image as ImageIcon } from 'lucide-react';

const Login = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  
  // Photo State (For Sign Up)
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  
  // Validation States
  const [isCheckingUser, setIsCheckingUser] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(null); 
  const [usernameSuggestions, setUsernameSuggestions] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const fileInputRef = useRef(null);

  // --- HANDLE PHOTO SELECTION ---
  const handlePhotoSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 1024 * 1024) { 
            setError("Image size must be under 1MB.");
            return;
        }
        setPhoto(file);
        setPhotoPreview(URL.createObjectURL(file));
        setError(""); 
    }
  };

  // --- CHECK USERNAME AVAILABILITY ---
  useEffect(() => {
    if (isLogin || !username) {
        setUsernameAvailable(null);
        setUsernameSuggestions([]);
        return;
    }

    const checkTimer = setTimeout(async () => {
        if (username.length < 3) return;
        setIsCheckingUser(true);
        try {
            const q = query(collection(db, "users"), where("username", "==", username));
            const snapshot = await getDocs(q);
            
            if (snapshot.empty) {
                setUsernameAvailable(true);
                setUsernameSuggestions([]);
            } else {
                setUsernameAvailable(false);
                const suffix = Math.floor(Math.random() * 1000);
                setUsernameSuggestions([`${username}${suffix}`, `${username}_official`, `real_${username}`]);
            }
        } catch (err) { console.error(err); }
        setIsCheckingUser(false);
    }, 500);

    return () => clearTimeout(checkTimer);
  }, [username, isLogin]);

  const handleUsernameInput = (e) => {
      const val = e.target.value.toLowerCase();
      if (val.includes(" ")) return; 
      setUsername(val);
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!isLogin && !usernameAvailable) {
        setError("Please choose a valid username.");
        return;
    }

    setLoading(true); setError(""); setSuccessMsg("");
    
    try {
      let finalUsername = username;

      if (isLogin) {
        // --- LOGIN LOGIC ---
        // 1. Sign in with Firebase Auth
        const userCred = await signInWithEmailAndPassword(auth, email, password);
        const user = userCred.user;

        // 2. 🔥 FETCH ACTUAL USERNAME FROM FIRESTORE
        // This fixes the issue where username was null or generic on login
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            finalUsername = userDocSnap.data().username;
        } else {
            // Fallback (Rare case: User exists in Auth but not DB)
            finalUsername = user.displayName || email.split('@')[0];
        }

      } else {
        // --- SIGN UP LOGIC ---
        const res = await createUserWithEmailAndPassword(auth, email, password);
        let photoURL = null;

        if (photo) {
            const storageRef = ref(storage, `profile_pics/${res.user.uid}_${Date.now()}`);
            const snapshot = await uploadBytes(storageRef, photo);
            photoURL = await getDownloadURL(snapshot.ref);
        }

        await updateProfile(res.user, { 
            displayName: username,
            photoURL: photoURL 
        });
        
        await setDoc(doc(db, "users", res.user.uid), {
          uid: res.user.uid, 
          username, 
          email, 
          photoURL: photoURL, 
          followers: [], 
          following: [], 
          isPrivate: false,
          createdAt: serverTimestamp()
        });
        
        finalUsername = username;
      }

      // 3. Pass the CORRECT username to App
      if(onLogin) onLogin(finalUsername); 

    } catch (err) { 
      setError(err.message.replace("Firebase: ", "")); 
    }
    setLoading(false);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if(!email) { setError("Enter your email first."); return; }
    setLoading(true); setError(""); 
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccessMsg("Reset link sent! Check your email.");
      setTimeout(() => { setIsResetting(false); setSuccessMsg(""); }, 4000);
    } catch (err) { setError(err.message.replace("Firebase: ", "")); }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#222831] p-4">
      <div className="bg-[#393e46] p-8 rounded-3xl shadow-2xl w-full max-w-sm border-none">
        
        <h2 className="text-2xl font-bold text-[#00adb5] mb-2 text-center">ShayariGram</h2>
        <p className="text-gray-400 text-center mb-6 text-sm">
          {isResetting ? "Reset your password" : (isLogin ? "Welcome back!" : "Join our community")}
        </p>

        <form onSubmit={isResetting ? handleResetPassword : handleAuth} className="space-y-4">
          
          {/* PHOTO UPLOAD (Sign Up Only) */}
          {!isLogin && !isResetting && (
            <div className="flex justify-center mb-4">
                <div 
                    onClick={() => fileInputRef.current.click()}
                    className="w-24 h-24 rounded-full bg-[#222831] border-2 border-[#00adb5] border-dashed flex items-center justify-center cursor-pointer hover:bg-black/20 transition overflow-hidden relative group"
                >
                    {photoPreview ? (
                        <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                        <Camera className="text-[#00adb5]" size={24} />
                    )}
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                        <ImageIcon className="text-white" size={20}/>
                    </div>
                </div>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handlePhotoSelect} 
                    accept="image/*" 
                    hidden 
                />
            </div>
          )}

          {/* USERNAME FIELD (Sign Up Only) */}
          {!isLogin && !isResetting && (
            <div className="space-y-2">
                <div className="relative">
                    <input 
                      className={`w-full p-3 bg-[#222831] rounded-xl text-[#eeeeee] outline-none border-2 transition-all ${usernameAvailable === false ? 'border-red-500' : usernameAvailable === true ? 'border-green-500' : 'border-transparent focus:border-[#00adb5]'}`} 
                      placeholder="Username (no spaces)" 
                      value={username} 
                      onChange={handleUsernameInput} 
                      required 
                    />
                    <div className="absolute right-3 top-3.5">
                        {isCheckingUser ? <Loader2 className="animate-spin text-[#00adb5]" size={18}/> : 
                         usernameAvailable === true ? <CheckCircle className="text-green-500" size={18}/> :
                         usernameAvailable === false ? <XCircle className="text-red-500" size={18}/> : null}
                    </div>
                </div>
                
                <div className="flex items-center gap-1.5 text-[10px] text-yellow-500 bg-yellow-500/10 p-2 rounded-lg">
                    <AlertTriangle size={12} />
                    <span>Username is final and cannot be changed later.</span>
                </div>

                {usernameAvailable === false && (
                    <div className="text-xs">
                        <p className="text-red-400 mb-1">Username taken. Try:</p>
                        <div className="flex flex-wrap gap-2">
                            {usernameSuggestions.map(s => (
                                <button type="button" key={s} onClick={() => setUsername(s)} className="bg-[#222831] px-2 py-1 rounded-md text-[#00adb5] hover:bg-black/20">
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
          )}

          <input 
            className="w-full p-3 bg-[#222831] rounded-xl text-[#eeeeee] outline-none border-2 border-transparent focus:border-[#00adb5] transition-all"
            type="email" 
            placeholder="Email Address" 
            value={email} 
            onChange={e=>setEmail(e.target.value)} 
            required 
          />

          {!isResetting && (
            <div>
                <input 
                  className="w-full p-3 bg-[#222831] rounded-xl text-[#eeeeee] outline-none border-2 border-transparent focus:border-[#00adb5] transition-all"
                  type="password" 
                  placeholder="Password" 
                  value={password} 
                  onChange={e=>setPassword(e.target.value)} 
                  required 
                />
                {isLogin && (
                    <div className="text-right mt-2">
                        <button type="button" onClick={() => {setIsResetting(true); setError("");}} className="text-xs text-[#00adb5] hover:text-white transition">
                            Forgot Password?
                        </button>
                    </div>
                )}
            </div>
          )}

          <button disabled={loading || (!isLogin && !usernameAvailable && !isResetting)} className="w-full py-3 bg-[#00adb5] text-white font-bold rounded-xl hover:bg-teal-600 transition flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-teal-900/20">
            {loading && <Loader2 className="animate-spin" size={18}/>}
            {isResetting ? "Send Reset Link" : (isLogin ? "Log In" : "Sign Up")}
          </button>

          {isResetting && (
            <button type="button" onClick={() => {setIsResetting(false); setError("");}} className="w-full py-2 text-gray-400 hover:text-white text-sm flex items-center justify-center gap-2">
                <ArrowLeft size={14}/> Back to Login
            </button>
          )}
        </form>

        {error && <p className="text-red-400 text-xs text-center mt-4 bg-red-500/10 p-2 rounded-lg">{error}</p>}
        {successMsg && <p className="text-green-400 text-xs text-center mt-4 bg-green-500/10 p-2 rounded-lg">{successMsg}</p>}

        {!isResetting && (
            <div className="mt-6 text-center pt-4 border-t border-[#222831]">
                <p className="text-gray-400 text-sm">
                    {isLogin ? "Don't have an account? " : "Already have an account? "}
                    <button 
                        type="button"
                        onClick={() => {setIsLogin(!isLogin); setError(""); setUsername(""); setPhoto(null); setPhotoPreview(null);}} 
                        className="text-[#00adb5] font-bold hover:text-white transition ml-1"
                    >
                        {isLogin ? "Sign Up" : "Log In"}
                    </button>
                </p>
            </div>
        )}
      </div>
    </div>
  );
};

export default Login;