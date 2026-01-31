import React, { useState, useRef, useEffect } from 'react';
import { db } from '../firebase'; 
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore'; 
import { Plus, ChevronLeft, Type } from 'lucide-react'; 
import { motion } from 'framer-motion';

const COLORS = ['#222831', '#393e46', '#00adb5', '#eeeeee', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
const GRADIENTS = ['linear-gradient(to right, #00adb5, #eeeeee)', 'linear-gradient(to right, #222831, #393e46)'];

const PostShayari = ({ username, onBack, editData }) => {
  const [content, setContent] = useState('');
  const [caption, setCaption] = useState('');
  const [bgColor, setBgColor] = useState('#393e46');
  const [textColor, setTextColor] = useState('#eeeeee');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const bgInputRef = useRef(null);
  const textInputRef = useRef(null);

  useEffect(() => {
      if (editData) {
          setContent(editData.content || '');
          setCaption(editData.caption || '');
          setBgColor(editData.bgColor || editData.background || '#393e46');
          setTextColor(editData.textColor || '#eeeeee');
      }
  }, [editData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    try {
      if (editData) {
          await updateDoc(doc(db, "shayaris", editData.id), {
              content, caption, bgColor, textColor, isEdited: true 
          });
          alert("Post updated!");
      } else {
          await addDoc(collection(db, "shayaris"), {
            content, caption, author: username || "Anonymous", timestamp: serverTimestamp(),
            bgColor, textColor, likes: 0, shares: 0, commentCount: 0, likedBy: [], 
          });
          alert("Shayari posted!");
      }
      if(onBack) onBack(); 
    } catch (err) { console.error(err); alert("Failed."); }
    setIsSubmitting(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-[#222831] w-full max-w-xl mx-auto min-h-screen md:min-h-0 flex flex-col pb-20 md:pb-6 text-[#eeeeee]">
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 sticky top-0 bg-[#222831] z-10">
         <div className="flex items-center gap-3">
             {onBack && <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-[#393e46] text-[#eeeeee]"><ChevronLeft/></button>}
             <h2 className="text-lg font-bold">{editData ? 'Edit Post' : 'New Post'}</h2>
         </div>
         <button onClick={handleSubmit} disabled={isSubmitting || !content.trim()} className="text-[#00adb5] font-bold text-sm disabled:opacity-50 hover:text-teal-400">
            {isSubmitting ? (editData ? 'Updating...' : 'Posting...') : (editData ? 'Save' : 'Post')}
         </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
          <form className="flex flex-col gap-6 p-4">
            <div className="space-y-4">
                {/* Editor Card */}
                <div className="w-full rounded-2xl shadow-lg flex items-center justify-center min-h-[300px] p-6 transition-all duration-300" style={{ background: bgColor }}>
                  <textarea 
                    placeholder="Write your shayari here..." 
                    className="w-full h-full bg-transparent border-none text-center text-2xl font-serif font-medium placeholder-white/50 focus:ring-0 resize-none outline-none leading-relaxed" 
                    style={{ color: textColor }} 
                    rows="6" 
                    value={content} 
                    onChange={(e) => setContent(e.target.value)} 
                    maxLength={500} 
                    required 
                  />
                </div>

                {/* Controls */}
                <div className="space-y-4 px-2">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase">Background</label>
                        <div className="flex gap-3 overflow-x-auto py-2 px-1 no-scrollbar items-center">
                            <div className="relative group shrink-0">
                                <input ref={bgInputRef} type="color" onChange={(e) => setBgColor(e.target.value)} className="absolute opacity-0 inset-0 w-full h-full cursor-pointer z-10" />
                                <button type="button" className="w-9 h-9 rounded-full bg-[#393e46] flex items-center justify-center text-[#eeeeee]"><Plus size={16} /></button>
                            </div>
                            {[...GRADIENTS, ...COLORS].map((c, i) => (
                                <button key={i} type="button" onClick={() => setBgColor(c)} className={`w-9 h-9 rounded-full shrink-0 transition-transform shadow-sm ${bgColor === c ? 'scale-125 ring-2 ring-[#00adb5]' : ''}`} style={{ background: c }} />
                            ))}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase">Text Color</label>
                        <div className="flex gap-3 overflow-x-auto py-2 px-1 no-scrollbar items-center">
                            <div className="relative group shrink-0">
                                <input ref={textInputRef} type="color" onChange={(e) => setTextColor(e.target.value)} className="absolute opacity-0 inset-0 w-full h-full cursor-pointer z-10" />
                                <button type="button" className="w-9 h-9 rounded-full bg-[#393e46] flex items-center justify-center text-[#eeeeee]"><Type size={16} /></button>
                            </div>
                            {COLORS.map((c, i) => (
                                <button key={i} type="button" onClick={() => setTextColor(c)} className={`w-9 h-9 rounded-full shrink-0 transition-transform shadow-sm ${textColor === c ? 'scale-125 ring-2 ring-[#00adb5]' : ''}`} style={{ backgroundColor: c }} />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="h-px bg-[#393e46] -mx-4"></div>
            
            <div className="flex gap-3">
                <textarea 
                    value={caption} 
                    onChange={(e) => setCaption(e.target.value)} 
                    placeholder="Write a caption (optional)..." 
                    className="w-full text-sm bg-[#393e46] text-[#eeeeee] rounded-xl p-3 border-none focus:ring-1 focus:ring-[#00adb5] resize-none h-24 placeholder-gray-500" 
                />
            </div>
          </form>
      </div>
    </motion.div>
  );
};

export default PostShayari;