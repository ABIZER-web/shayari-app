import { PlusSquare, Heart } from 'lucide-react';

const MobileTopHeader = ({ 
  view, 
  hasUnreadNotif, 
  showNotificationsDesktop,
  onPostClick, 
  onNotificationsClick 
}) => {
  return (
    <div className="md:hidden fixed top-0 left-0 w-full h-[60px] bg-[#222831]/95 backdrop-blur-md border-b border-[#393e46] z-[50] flex justify-between items-center px-4">
      <button 
        onClick={onPostClick} 
        className={`p-2 transition-all ${view === 'post' ? 'text-[#00adb5]' : 'text-gray-400'}`}
      >
        <PlusSquare size={26} />
      </button>
      
      <span className="font-bold text-lg font-serif text-[#00adb5]">ShayariGram</span>
      
      <button 
        onClick={onNotificationsClick} 
        className={`p-2 relative transition-all ${showNotificationsDesktop ? 'text-[#00adb5]' : 'text-gray-400'}`}
      >
        <Heart size={26} fill={showNotificationsDesktop ? "currentColor" : "none"} />
        {hasUnreadNotif && (
          <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#222831]"></span>
        )}
      </button>
    </div>
  );
};

export default MobileTopHeader;