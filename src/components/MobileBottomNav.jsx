import { Home, MessageCircle, Search, Menu } from 'lucide-react';

const MobileBottomNav = ({
  view,
  userPhotoURL,
  viewingProfile,
  currentUser,
  hasUnreadMsg,
  showMenuDrawer,
  onHomeClick,
  onChatClick,
  onExploreClick,
  onProfileClick,
  onMenuClick
}) => {
  return (
    <div className="md:hidden fixed bottom-0 left-0 w-full h-[65px] border-t border-[#393e46] bg-[#222831]/95 backdrop-blur-md z-[50] flex justify-around items-center pb-safe">
      <button 
        onClick={onHomeClick} 
        className={`flex flex-col items-center p-2 ${view === 'home' ? 'text-[#00adb5]' : 'text-gray-400'}`}
      >
        <Home size={26} />
      </button>
      
      <button 
        onClick={onChatClick} 
        className={`flex flex-col items-center p-2 relative ${view === 'chat' ? 'text-[#00adb5]' : 'text-gray-400'}`}
      >
        <MessageCircle size={26} />
        {hasUnreadMsg && (
          <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#222831]"></span>
        )}
      </button>

      <button 
        onClick={onExploreClick} 
        className={`flex flex-col items-center p-2 ${view === 'explore' ? 'text-[#00adb5]' : 'text-gray-400'}`}
      >
        <Search size={26} />
      </button>

      <button 
        onClick={onProfileClick} 
        className="p-1"
      >
        <div className={`w-8 h-8 rounded-full overflow-hidden border-2 ${view === 'profile' && viewingProfile === currentUser ? 'border-[#00adb5]' : 'border-gray-500'}`}>
          <img 
            src={userPhotoURL || "/favicon.png"} 
            alt="Profile" 
            className="w-full h-full object-cover" 
          />
        </div>
      </button>

      <button 
        onClick={onMenuClick} 
        className={`flex flex-col items-center p-2 ${showMenuDrawer ? 'text-[#00adb5]' : 'text-gray-400'}`}
      >
        <Menu size={26} />
      </button>
    </div>
  );
};

export default MobileBottomNav;