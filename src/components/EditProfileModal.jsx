import { useState, useRef, useEffect } from 'react';
import { db, storage, auth } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore'; 
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth'; 
import { X, Loader2, Camera, Trash2, Image as ImageIcon, Lock } from 'lucide-react';

const EditProfileModal = ({ currentUser, currentFullName, currentBio, currentPhoto, onClose }) => {
  const [fullName, setFullName] = useState(currentFullName || "");
  const [bio, setBio] = useState(currentBio || "");
  
  // Photo State
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(currentPhoto || "/favicon.png"); 
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isPhotoMenuOpen, setIsPhotoMenuOpen] = useState(false);
  
  const fileInputRef = useRef(null);

  // Sync state if props change (e.g. reopening modal)
  useEffect(() => {
      setFullName(currentFullName || "");
      setBio(currentBio || "");
      setPhotoPreview(currentPhoto || "/favicon.png");
  }, [currentFullName, currentBio, currentPhoto]);

  // --- HANDLE KEY DOWN (Enter vs Shift+Enter) ---
  const handleKeyDown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault(); // Prevent default new line
          handleSave();       // Trigger Save
      }
  };

  const handlePhotoSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 1024 * 1024) { 
          setError("Image must be less than 1MB");
          setIsPhotoMenuOpen(false);
          return;
      }
      setPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
      setError(""); 
      setIsPhotoMenuOpen(false);
    }
    e.target.value = null; 
  };

  const handleRemovePhoto = () => {
      setPhoto(null);
      setPhotoPreview("/favicon.png");
      setIsPhotoMenuOpen(false);
  };

  const handleSave = async () => {
    setLoading(true);
    setError("");

    try {
        const user = auth.currentUser;
        if (!user) throw new Error("No user found.");

        let finalPhotoURL = currentPhoto; 

        // 1. IMAGE UPLOAD
        if (photo) {
            const storageRef = ref(storage, `profile_pics/${user.uid}_${Date.now()}`);
            const snapshot = await uploadBytes(storageRef, photo);
            finalPhotoURL = await getDownloadURL(snapshot.ref);
        } else if (photoPreview === "/favicon.png") {
            finalPhotoURL = null; 
        }

        // 2. UPDATE FIRESTORE
        const userDocRef = doc(db, "users", user.uid);
        await updateDoc(userDocRef, {
            fullName: fullName,
            bio: bio,
            photoURL: finalPhotoURL
        });

        // 3. UPDATE AUTH PROFILE
        await updateProfile(user, {
            photoURL: finalPhotoURL
        });

        // 4. UPDATE LOCAL STORAGE
        const saved = JSON.parse(localStorage.getItem('shayari_saved_accounts') || "[]");
        const updatedSaved = saved.map(acc => 
            acc.uid === user.uid ? { ...acc, photoURL: finalPhotoURL } : acc
        );
        localStorage.setItem('shayari_saved_accounts', JSON.stringify(updatedSaved));

        window.location.reload(); 

    } catch (err) {
        console.error("Update Error:", err);
        setError("Failed to update profile.");
    } finally {
        setLoading(false);
    }
  };

  return (
    <div 
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        onClick={onClose}
    >
      <div 
        className="bg-[#393e46] w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 relative"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* PHOTO MENU POPUP */}
        {isPhotoMenuOpen && (
            <div 
                className="absolute inset-0 z-50 bg-[#222831]/95 flex items-center justify-center animate-in fade-in duration-200"
                onClick={() => setIsPhotoMenuOpen(false)}
            >
                <div 
                    className="bg-[#393e46] w-[280px] rounded-2xl overflow-hidden shadow-2xl text-center p-2 border-none"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="py-6 border-b border-[#222831]">
                        <div className="w-20 h-20 mx-auto rounded-full overflow-hidden bg-[#222831] mb-3 shadow-inner ring-2 ring-[#00adb5]">
                             <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                        <h3 className="text-lg font-bold text-[#eeeeee]">Change Photo</h3>
                    </div>
                    <button onClick={() => fileInputRef.current.click()} className="w-full py-4 text-sm font-bold text-[#00adb5] border-b border-[#222831] hover:bg-[#222831] transition flex items-center justify-center gap-2">
                        <ImageIcon size={18}/> Upload Photo
                    </button>
                    <button onClick={handleRemovePhoto} className="w-full py-4 text-sm font-bold text-red-500 border-b border-[#222831] hover:bg-[#222831] transition flex items-center justify-center gap-2">
                        <Trash2 size={18}/> Remove Current
                    </button>
                    <button onClick={() => setIsPhotoMenuOpen(false)} className="w-full py-4 text-sm text-gray-400 hover:bg-[#222831] transition">Cancel</button>
                </div>
            </div>
        )}

        {/* HEADER */}
        <div className="flex justify-between items-center p-5 bg-[#393e46]">
            <h2 className="text-xl font-bold text-[#eeeeee]">Edit Profile</h2>
            <button onClick={onClose} className="p-2 hover:bg-[#222831] rounded-full transition"><X size={20} className="text-[#eeeeee]" /></button>
        </div>

        {/* FORM */}
        <div className="p-6 space-y-6 bg-[#393e46]">
            
            {/* Photo Section */}
            <div className="flex flex-col items-center gap-3">
                <div onClick={() => setIsPhotoMenuOpen(true)} className="w-24 h-24 rounded-full overflow-hidden bg-[#222831] cursor-pointer group relative shadow-lg ring-2 ring-[#00adb5]/50 hover:ring-[#00adb5] transition-all">
                    <img src={photoPreview} alt="Profile" className="w-full h-full object-cover opacity-90 group-hover:opacity-60 transition" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Camera className="text-[#00adb5] opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all duration-300" size={32} />
                    </div>
                </div>
                <input type="file" ref={fileInputRef} className="hidden" onChange={handlePhotoSelect} accept="image/*" />
                <button onClick={() => setIsPhotoMenuOpen(true)} className="text-[#00adb5] font-bold text-sm hover:text-teal-400 transition">Change Photo</button>
            </div>

            {/* Inputs */}
            <div className="space-y-5">
                <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Username</label>
                    <div className="relative">
                        <input value={currentUser} disabled className="w-full p-3 bg-[#222831] rounded-xl text-sm text-gray-500 cursor-not-allowed border border-transparent" />
                        <Lock size={16} className="absolute right-3 top-3.5 text-gray-500" />
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1 ml-1">*Username cannot be changed.</p>
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Full Name</label>
                    <input 
                        value={fullName} 
                        onChange={(e) => setFullName(e.target.value)} 
                        onKeyDown={handleKeyDown}
                        className="w-full p-3 bg-[#222831] rounded-xl text-sm text-[#eeeeee] focus:outline-none border border-transparent focus:border-[#00adb5] transition placeholder-gray-600" 
                        placeholder="e.g. Abizer Saify" 
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Bio</label>
                    <textarea 
                        value={bio} 
                        onChange={(e) => setBio(e.target.value)} 
                        onKeyDown={handleKeyDown} 
                        className="w-full p-3 bg-[#222831] rounded-xl text-sm text-[#eeeeee] focus:outline-none border border-transparent focus:border-[#00adb5] resize-none h-24 transition placeholder-gray-600 custom-scrollbar" 
                        placeholder="Write something about you..." 
                    />
                    <p className="text-[10px] text-gray-500 mt-1 text-right">Shift+Enter for new line</p>
                </div>
            </div>

            {error && <p className="text-red-400 text-xs text-center font-medium bg-red-500/10 p-2 rounded-lg">{error}</p>}

            <div className="flex gap-3 pt-2">
                <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold text-sm bg-[#222831] text-gray-400 hover:text-[#eeeeee] hover:bg-black/40 transition">Cancel</button>
                <button onClick={handleSave} disabled={loading} className="flex-1 py-3 rounded-xl font-bold text-sm bg-[#00adb5] text-white flex justify-center items-center gap-2 hover:bg-teal-600 transition disabled:opacity-50 shadow-lg shadow-teal-900/20">
                    {loading && <Loader2 size={16} className="animate-spin" />} Save Changes
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default EditProfileModal;