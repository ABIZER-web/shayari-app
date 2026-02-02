import { motion } from 'framer-motion';
import { X, Settings, Activity, AlertCircle, LogOut, ChevronLeft } from 'lucide-react';

const MenuDrawer = ({
  menuStep,
  onClose,
  onBack,
  onActivityClick,
  onLogout
}) => {
  return (
    <>
      <div 
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[1px]" 
        onClick={onClose}
      ></div>
      
      <motion.div 
        initial={{ x: "-100%" }} 
        animate={{ x: 0 }} 
        exit={{ x: "-100%" }} 
        transition={{ type: "tween", ease: "easeInOut", duration: 0.3 }} 
        className="fixed top-0 left-0 h-full w-[300px] md:left-[80px] xl:left-[250px] bg-[#222831] border-r border-[#393e46] z-[70] shadow-2xl p-6 flex flex-col"
      >
        <div className="flex justify-between items-center mb-6">
          {menuStep === 'main' ? (
            <>
              <h2 className="text-2xl font-bold font-serif text-[#eeeeee]">Menu</h2>
              <button 
                onClick={onClose} 
                className="p-1 hover:bg-[#393e46] rounded-full"
              >
                <X size={20} className="text-gray-400"/>
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={onBack} 
                className="p-1 hover:bg-[#393e46] rounded-full"
              >
                <ChevronLeft size={20} className="text-gray-400"/>
              </button>
              <h2 className="text-2xl font-bold font-serif text-[#eeeeee]">Activity</h2>
              <div className="w-10"></div>
            </>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {menuStep === 'main' ? (
            <div className="space-y-1">
              <button className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-[#393e46] text-[#eeeeee] transition text-left">
                <Settings size={22} /> 
                <span className="text-sm font-medium">Settings</span>
              </button>
              
              <button 
                onClick={onActivityClick}
                className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-[#393e46] text-[#eeeeee] transition text-left"
              >
                <Activity size={22} /> 
                <span className="text-sm font-medium">Your Activity</span>
              </button>
              
              <button className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-[#393e46] text-[#eeeeee] transition text-left">
                <AlertCircle size={22} /> 
                <span className="text-sm font-medium">Report a problem</span>
              </button>
              
              <div className="mt-6 pt-4 border-t border-[#393e46]">
                <button 
                  onClick={onLogout}
                  className="w-full flex items-center gap-4 p-3 rounded-xl text-red-500 hover:bg-red-500/10 transition font-bold"
                >
                  <LogOut size={22} /> 
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-400 text-sm">Activity content will go here...</p>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
};

export default MenuDrawer;