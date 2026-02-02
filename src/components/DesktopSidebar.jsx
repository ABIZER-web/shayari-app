import { Home, Search, MessageCircle, Heart, PlusSquare, Menu, User } from 'lucide-react';
import { motion } from 'framer-motion';

const SidebarItem = ({ icon: Icon, label, isActive, onClick, alert, imgSrc }) => (
  <motion.button 
    onClick={onClick} 
    animate={{ x: isActive ? 12 : 0 }} 
    whileHover={{ x: isActive ? 12 : 6 }} 
    transition={{ type: "spring", stiffness: 300, damping: 20 }} 
    className={`flex items-center gap-4 p-3 rounded-xl w-full transition-colors duration-200 group ${isActive ? 'bg-[#00adb5] text-white font-bold shadow-md' : 'hover:bg-[#393e46] hover:text-white text-gray-400 font-normal'}`}
  >
    <div className="relative flex items-center justify-center w-7 h-7 shrink-0">
      {label === 'Profile' ? (
        <img 
          src={imgSrc || "/favicon.png"} 
          alt="Profile" 
          className={`w-7 h-7 rounded-full object-cover border transition-transform group-hover:scale-110 ${isActive ? 'border-white border-2' : 'border-gray-500'}`} 
        />
      ) : (
        <Icon 
          size={26} 
          strokeWidth={isActive ? 2.8 : 2} 
          className={`transition-transform group-hover:scale-110 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}`} 
        />
      )}
      {alert && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#222831]"></span>}
    </div>
    <span className="hidden xl:block text-base">{label}</span>
  </motion.button>
);

const DesktopSidebar = ({
  view,
  currentUser,
  userPhotoURL,
  viewingProfile, // Make sure this prop is included
  hasUnreadMsg,
  hasUnreadNotif,
  showNotificationsDesktop,
  showMenuDrawer,
  onNav,
  onNotificationsClick,
  onMenuClick
}) => {
  // Add default value for viewingProfile if not provided
  const currentViewingProfile = viewingProfile || currentUser;
  
  return (
    <aside className="hidden md:flex flex-col w-[80px] xl:w-[250px] border-r border-[#393e46] h-full bg-[#222831] z-50 relative shrink-0">
      <div className="flex flex-col justify-between h-full py-8 px-3 xl:px-6">
        <div className="space-y-6">
          <div 
            className="flex items-center gap-3 pl-2 cursor-pointer mb-8" 
            onClick={() => onNav('home')}
          >
            <img src="/logo.png" alt="Logo" className="h-8 w-8 object-contain" />
            <span className="hidden xl:block font-bold text-xl text-[#eeeeee]">ShayariGram</span>
          </div>
          
          <SidebarItem 
            icon={Home} 
            label="Home" 
            isActive={view === 'home'} 
            onClick={() => onNav('home')} 
          />
          
          <SidebarItem 
            icon={Search} 
            label="Search" 
            isActive={view === 'explore'} 
            onClick={() => onNav('explore')} 
          />
          
          <SidebarItem 
            icon={MessageCircle} 
            label="Messages" 
            isActive={view === 'chat'} 
            onClick={() => onNav('chat', null, null)} 
            alert={hasUnreadMsg}
          />
          
          <SidebarItem 
            icon={Heart} 
            label="Notifications" 
            isActive={showNotificationsDesktop} 
            onClick={onNotificationsClick} 
            alert={hasUnreadNotif}
          />
          
          <SidebarItem 
            icon={PlusSquare} 
            label="Create" 
            isActive={view === 'post'} 
            onClick={() => onNav('post')} 
          />
          
          <SidebarItem 
            icon={User} 
            label="Profile" 
            isActive={view === 'profile' && currentViewingProfile === currentUser} 
            onClick={() => onNav('profile', currentUser)} 
            imgSrc={userPhotoURL}
          />
        </div>
        
        <div className="space-y-2">
          <SidebarItem 
            icon={Menu} 
            label="More" 
            isActive={showMenuDrawer} 
            onClick={onMenuClick} 
          />
        </div>
      </div>
    </aside>
  );
};

export default DesktopSidebar;