import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getCountFromServer } from 'firebase/firestore';
import { Feather, Users, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

const Dashboard = () => {
  const [totalPosts, setTotalPosts] = useState(0);
  const [activeUsers, setActiveUsers] = useState("Live");

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const postSnap = await getCountFromServer(collection(db, "shayaris"));
        setTotalPosts(postSnap.data().count);
      } catch (err) {
        console.error(err);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="mb-4">
        {/* Responsive Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Stats Card */}
            <motion.div 
                whileHover={{ y: -2 }}
                className="bg-[#393e46] p-5 rounded-3xl shadow-lg relative overflow-hidden"
            >
                <div className="absolute -right-4 -top-4 bg-[#00adb5] w-24 h-24 rounded-full opacity-20"></div>
                <div className="flex items-center gap-2 mb-3 text-[#00adb5]">
                    <TrendingUp size={18} />
                    <h3 className="font-bold text-sm uppercase tracking-wider">Platform Stats</h3>
                </div>
                <div className="flex gap-4">
                    <div className="flex-1 bg-[#222831] p-3 rounded-2xl flex items-center justify-between shadow-inner">
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 mb-1">TOTAL SHAYARIS</p>
                            <p className="text-2xl font-bold text-[#eeeeee]">{totalPosts}</p>
                        </div>
                        <Feather className="text-[#00adb5]" size={24} />
                    </div>
                    <div className="flex-1 bg-[#222831] p-3 rounded-2xl flex items-center justify-between shadow-inner">
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 mb-1">ACTIVE USERS</p>
                            <p className="text-2xl font-bold text-[#eeeeee]">{activeUsers}</p>
                        </div>
                        <Users className="text-[#00adb5]" size={24} />
                    </div>
                </div>
            </motion.div>

            {/* Welcome Card */}
            <motion.div 
                whileHover={{ y: -2 }}
                className="bg-gradient-to-br from-[#00adb5] to-teal-800 p-5 rounded-3xl shadow-lg flex flex-col justify-center relative overflow-hidden"
            >   
                <div className="absolute top-0 right-0 bg-[#222831] text-[#00adb5] text-[10px] font-bold px-3 py-1 rounded-bl-xl shadow-md">
                    #1 TRENDING
                </div>
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-[#eeeeee] flex items-center justify-center text-xs font-bold text-[#222831]">
                        A
                    </div>
                    <span className="text-sm font-bold text-[#eeeeee]">admin</span>
                </div>
                <p className="text-[#eeeeee] font-serif text-lg leading-relaxed text-center px-4 py-2 italic drop-shadow-md">
                    "Welcome to ShayariGram! Share your heart out."
                </p>
            </motion.div>
        </div>
    </div>
  );
};

export default Dashboard;