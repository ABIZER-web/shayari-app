import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import Notifications from './Notifications';

const NotificationsDrawer = ({
  currentUser,
  onClose,
  onPostClick,
  onProfileClick
}) => {
  return (
    <>
      <div 
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[1px]" 
        onClick={onClose}
      ></div>
      
      <motion.div 
        initial={{ x: "100%" }} 
        animate={{ x: 0 }} 
        exit={{ x: "100%" }} 
        transition={{ type: "tween", ease: "easeInOut", duration: 0.3 }} 
        className="fixed top-0 right-0 h-full w-full md:w-[400px] bg-[#222831] border-l border-[#393e46] z-[70] shadow-2xl overflow-hidden"
      >
        <div className="p-6 h-full flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold font-serif text-[#eeeeee]">Notifications</h2>
            <button 
              onClick={onClose} 
              className="p-1 hover:bg-[#393e46] rounded-full"
            >
              <X size={20} className="text-gray-400"/>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            <Notifications 
              currentUser={currentUser} 
              onPostClick={onPostClick} 
              onProfileClick={onProfileClick} 
            />
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default NotificationsDrawer;