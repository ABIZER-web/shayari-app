import { useState } from 'react';
import { updateUserProfileGlobally } from '../utils/updateProfile'; // Make sure this path is correct

const EditProfileModal = ({ currentUser, currentFullName, onClose }) => {
  const [newUsername, setNewUsername] = useState(currentUser);
  const [newFullName, setNewFullName] = useState(currentFullName || "");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if(!newUsername.trim()) return alert("Username cannot be empty");
    
    setLoading(true);

    // Call the global update function
    const result = await updateUserProfileGlobally(currentUser, newUsername, newFullName);

    if (result.success) {
        alert("Profile updated! Your new name is visible everywhere.");
        
        // Update local storage so the app doesn't need a refresh
        localStorage.setItem('shayari_user', newUsername);
        
        onClose(); // Close modal
        window.location.reload(); // Reload to see changes immediately
    } else {
        alert("Error updating profile: " + result.error);
    }
    
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
        <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-sm relative">
            <h2 className="font-bold text-xl mb-6 text-center">Edit Profile</h2>
            
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Username</label>
                    <input 
                        value={newUsername} 
                        onChange={(e) => setNewUsername(e.target.value)} 
                        placeholder="Username"
                        className="w-full border border-gray-300 p-3 rounded-xl focus:outline-none focus:border-black transition"
                    />
                </div>
                
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name</label>
                    <input 
                        value={newFullName} 
                        onChange={(e) => setNewFullName(e.target.value)} 
                        placeholder="Full Name"
                        className="w-full border border-gray-300 p-3 rounded-xl focus:outline-none focus:border-black transition"
                    />
                </div>

                <div className="flex gap-3 pt-2">
                    <button 
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSave} 
                        disabled={loading}
                        className="flex-1 bg-black text-white py-3 rounded-xl font-bold hover:opacity-90 transition disabled:opacity-50"
                    >
                        {loading ? "Saving..." : "Save"}
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};

export default EditProfileModal;