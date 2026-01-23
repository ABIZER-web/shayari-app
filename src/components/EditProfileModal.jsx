import { useState, useRef } from 'react';
import { db, storage } from '../firebase';
import { doc, updateDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { X, Loader2 } from 'lucide-react';

const EditProfileModal = ({ currentUser, currentFullName, currentBio, currentPhoto, onClose }) => {
  const [fullName, setFullName] = useState(currentFullName || "");
  const [username, setUsername] = useState(currentUser || "");
  const [bio, setBio] = useState(currentBio || "");
  
  // ⚡ Default to favicon.png if currentPhoto is null/empty
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(currentPhoto || "/favicon.png"); 
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isPhotoMenuOpen, setIsPhotoMenuOpen] = useState(false); // State for the Photo Popup
  
  const fileInputRef = useRef(null);

  // --- Handlers ---

  const handlePhotoSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
      setIsPhotoMenuOpen(false); // Close popup after selection
    }
  };

  const handleRemovePhoto = () => {
      setPhoto(null);
      setPhotoPreview("/favicon.png"); // ⚡ Revert to favicon
      setIsPhotoMenuOpen(false); // Close popup
  };

  const handleUsernameChange = (e) => {
    const val = e.target.value.toLowerCase();
    if (/^[a-z0-9_.]*$/.test(val)) {
        setUsername(val);
        setError("");
    } else {
        setError("Username can only contain letters, numbers, _ and .");
    }
  };

  const handleSave = async () => {
    if (!username.trim()) {
        setError("Username is required.");
        return;
    }

    setLoading(true);
    try {
        // 1. Check if username is taken (only if changed)
        if (username !== currentUser) {
            const q = query(collection(db, "users"), where("username", "==", username));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                setError("Username is already taken.");
                setLoading(false);
                return;
            }
        }

        let finalPhotoURL = photoPreview;

        // 2. Logic to determine what to save to DB
        if (photoPreview === "/favicon.png") {
            finalPhotoURL = null; // If it looks like favicon, save as null (default)
        } else if (photo) {
            // New photo file exists, upload it
            const storageRef = ref(storage, `profile_pics/${currentUser}_${Date.now()}`);
            const snapshot = await uploadBytes(storageRef, photo);
            finalPhotoURL = await getDownloadURL(snapshot.ref);
        } else {
            // No new file, keeping existing non-favicon URL
            finalPhotoURL = currentPhoto; 
        }

        // 3. Update Firestore
        const userRef = doc(db, "users", currentUser);
        await updateDoc(userRef, {
            username: username, 
            fullName: fullName,
            bio: bio,
            photoURL: finalPhotoURL
        });

        // 4. Update Local Storage if username changed
        if (username !== currentUser) {
            localStorage.setItem('shayari_user', username);
            window.location.reload(); 
        } else {
            onClose();
        }

    } catch (err) {
        console.error("Error updating profile:", err);
        setError("Failed to update profile.");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 relative">
        
        {/* --- ⚡ PHOTO OPTIONS POPUP OVERLAY --- */}
        {isPhotoMenuOpen && (
            <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center animate-in fade-in duration-200">
                <div className="bg-white w-[280px] rounded-xl overflow-hidden shadow-2xl text-center">
                    <div className="py-6 border-b border-gray-100">
                        <div className="w-16 h-16 mx-auto rounded-full overflow-hidden border border-gray-200 mb-3">
                             <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">profile photo</h3>
                        <p className="text-xs text-gray-400">Shayarigram</p>
                    </div>
                    
                    <button 
                        onClick={() => fileInputRef.current.click()}
                        className="w-full py-3.5 text-sm font-bold text-blue-500 border-b border-gray-100 hover:bg-gray-50 transition"
                    >
                        Upload Photo
                    </button>
                    
                    <button 
                        onClick={handleRemovePhoto}
                        className="w-full py-3.5 text-sm font-bold text-red-500 border-b border-gray-100 hover:bg-gray-50 transition"
                    >
                        Remove current photo
                    </button>
                    
                    <button 
                        onClick={() => setIsPhotoMenuOpen(false)}
                        className="w-full py-3.5 text-sm text-gray-800 hover:bg-gray-50 transition"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        )}

        {/* --- MAIN EDIT MODAL CONTENT --- */}
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">Edit Profile</h2>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition">
                <X size={24} className="text-gray-900" />
            </button>
        </div>

        <div className="p-6 space-y-6">
            {/* Profile Picture Trigger */}
            <div className="flex flex-col items-center gap-2">
                <div 
                    onClick={() => setIsPhotoMenuOpen(true)}
                    className="w-20 h-20 rounded-full overflow-hidden border border-gray-200 cursor-pointer group relative"
                >
                    <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/10 group-hover:bg-black/20 transition" />
                </div>
                
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={handlePhotoSelect} 
                    accept="image/*" 
                />
                
                <button 
                    onClick={() => setIsPhotoMenuOpen(true)}
                    className="text-blue-500 font-bold text-sm hover:text-blue-700 transition"
                >
                    Edit Photo
                </button>
            </div>

            {/* Inputs */}
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Username</label>
                    <input 
                        value={username} 
                        onChange={handleUsernameChange}
                        className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-black bg-gray-50 transition"
                        placeholder="username"
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Full Name</label>
                    <input 
                        value={fullName} 
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-black bg-gray-50 transition"
                        placeholder="e.g. Abizer Saify"
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Bio</label>
                    <textarea 
                        value={bio} 
                        onChange={(e) => setBio(e.target.value)}
                        className="w-full p-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-black bg-gray-50 resize-none h-20 transition"
                        placeholder="Write something about you..."
                    />
                </div>
            </div>

            {error && <p className="text-red-500 text-xs text-center font-medium">{error}</p>}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
                <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold text-sm bg-gray-100 text-gray-600 hover:bg-gray-200 transition">Cancel</button>
                <button 
                    onClick={handleSave} 
                    disabled={loading}
                    className="flex-1 py-3 rounded-xl font-bold text-sm bg-black text-white flex justify-center items-center gap-2 hover:opacity-90 transition disabled:opacity-50"
                >
                    {loading && <Loader2 size={16} className="animate-spin" />} Save
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default EditProfileModal;