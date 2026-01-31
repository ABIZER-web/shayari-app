import { motion } from 'framer-motion';
import { LogOut, Bookmark, User, Moon, Sun, Monitor } from 'lucide-react';

const SettingsModal = ({ isOpen, onClose, currentUser, onPostClick, onLogout }) => {
  if (!isOpen) return null;

  return (
    <>
        {/* Backdrop (Click to Close) */}
        <div 
            className="fixed inset-0 z-20 hidden md:block" 
            onClick={onClose}
        ></div>

        {/* Drawer Panel (Slides from Left) */}
        <motion.div 
            initial={{ x: "-100%" }} 
            animate={{ x: 0 }}       
            exit={{ x: "-100%" }}    
            transition={{ type: "tween", ease: "easeInOut", duration: 0.3 }}
            className="fixed top-0 left-[80px] xl:left-[250px] h-full w-[300px] bg-[#222831] border-r border-[#393e46] z-30 shadow-2xl p-6 flex flex-col"
        >
            <h2 className="text-2xl font-bold font-serif mb-8 text-[#eeeeee]">Settings</h2>
            
            <div className="space-y-2 flex-1">
                <button className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-[#393e46] text-[#eeeeee] transition">
                    <User size={20} className="text-[#00adb5]" /> <span>Edit Profile</span>
                </button>
                <button className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-[#393e46] text-[#eeeeee] transition">
                    <Bookmark size={20} className="text-[#00adb5]" /> <span>Saved</span>
                </button>
                
                <div className="h-px bg-[#393e46] my-4 mx-2"></div>
                
                <p className="text-xs font-bold text-gray-500 px-3 uppercase tracking-wider mb-2">Appearance</p>
                <div className="flex gap-2 px-2">
                    <button className="p-2 rounded-lg bg-[#393e46] text-[#00adb5]"><Moon size={18}/></button>
                    <button className="p-2 rounded-lg hover:bg-[#393e46] text-gray-500"><Sun size={18}/></button>
                    <button className="p-2 rounded-lg hover:bg-[#393e46] text-gray-500"><Monitor size={18}/></button>
                </div>
            </div>

            <div className="mt-auto">
                <button onClick={onLogout} className="w-full flex items-center gap-4 p-3 rounded-xl text-red-500 hover:bg-red-500/10 transition font-bold">
                    <LogOut size={20} /> <span>Log Out</span>
                </button>
            </div>
        </motion.div>
    </>
  );
};

export default SettingsModal;