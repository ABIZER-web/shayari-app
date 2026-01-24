import React, { useState, useRef, useEffect } from 'react';
import { db } from '../firebase'; 
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore'; 
import { Send, Loader2, Palette, Type, Plus, ChevronLeft } from 'lucide-react'; 
import { motion } from 'framer-motion';

const COLORS = ['#ffffff', '#000000', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899', '#64748b'];
const GRADIENTS = ['linear-gradient(to right, #ff7e5f, #feb47b)', 'linear-gradient(to right, #6a11cb, #2575fc)', 'linear-gradient(to right, #43cea2, #185a9d)', 'linear-gradient(to right, #ff416c, #ff4b2b)', 'linear-gradient(to top, #4481eb 0%, #04befe 100%)'];

const PostShayari = ({ username, onBack, editData }) => {
  const [content, setContent] = useState('');
  const [caption, setCaption] = useState('');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [textColor, setTextColor] = useState('#000000');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Refs
  const bgInputRef = useRef(null);
  const textInputRef = useRef(null);

  // ⚡ Load Data if Editing
  useEffect(() => {
      if (editData) {
          setContent(editData.content || '');
          setCaption(editData.caption || '');
          setBgColor(editData.bgColor || editData.background || '#ffffff');
          setTextColor(editData.textColor || '#000000');
      }
  }, [editData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    try {
      if (editData) {
          // ⚡ Update Existing Post
          const postRef = doc(db, "shayaris", editData.id);
          await updateDoc(postRef, {
              content: content,
              caption: caption,
              bgColor: bgColor,
              textColor: textColor,
              isEdited: true 
          });
          alert("Post updated!");
      } else {
          // ⚡ Create New Post
          await addDoc(collection(db, "shayaris"), {
            content: content, 
            caption: caption,
            author: username || "Anonymous", 
            timestamp: serverTimestamp(),
            bgColor: bgColor,      
            textColor: textColor,
            likes: 0,
            shares: 0,
            commentCount: 0,
            likedBy: [], 
          });
          alert("Shayari posted!");
      }
      
      if(onBack) onBack(); 
      
    } catch (err) {
      console.error("Error:", err);
      alert("Failed.");
    }
    setIsSubmitting(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white md:border md:border-gray-100 md:shadow-lg md:rounded-3xl w-full max-w-xl mx-auto min-h-screen md:min-h-0 flex flex-col pb-20 md:pb-6">
      <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
         <div className="flex items-center gap-3">
             {onBack && <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100"><ChevronLeft className="text-gray-600"/></button>}
             <h2 className="text-lg font-bold text-gray-900">{editData ? 'Edit Post' : 'New Post'}</h2>
         </div>
         <button onClick={handleSubmit} disabled={isSubmitting || !content.trim()} className="text-blue-600 font-bold text-sm disabled:opacity-50">
            {isSubmitting ? (editData ? 'Updating...' : 'Posting...') : (editData ? 'Save' : 'Post')}
         </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
          <form className="flex flex-col gap-6 p-4">
            <div className="space-y-4">
                <div className="w-full rounded-2xl shadow-sm border border-gray-200 flex items-center justify-center min-h-[300px] p-6 transition-all duration-300" style={{ background: bgColor }}>
                  <textarea placeholder="Write your shayari here..." className="w-full h-full bg-transparent border-none text-center text-2xl font-serif font-medium placeholder-gray-400 focus:ring-0 resize-none outline-none leading-relaxed" style={{ color: textColor }} rows="6" value={content} onChange={(e) => setContent(e.target.value)} maxLength={500} required />
                </div>

                <div className="space-y-4 px-2">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase">Background</label>
                        <div className="flex gap-3 overflow-x-auto py-1 px-1 no-scrollbar items-center">
                            <div className="relative group shrink-0"><input ref={bgInputRef} type="color" onChange={(e) => setBgColor(e.target.value)} className="absolute opacity-0 inset-0 w-full h-full cursor-pointer z-10" /><button type="button" className="w-9 h-9 rounded-full border-2 border-gray-200 flex items-center justify-center bg-gradient-to-tr from-pink-500 to-yellow-500 shadow-sm"><Plus size={16} className="text-white" /></button></div>
                            {[...GRADIENTS, ...COLORS].map((c, i) => <button key={i} type="button" onClick={() => setBgColor(c)} className={`w-9 h-9 rounded-full shrink-0 border-2 transition-transform shadow-sm ${bgColor === c ? 'border-black scale-110' : 'border-transparent'}`} style={{ background: c }} />)}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-400 uppercase">Text Color</label>
                        <div className="flex gap-3 overflow-x-auto py-1 px-1 no-scrollbar items-center">
                            <div className="relative group shrink-0"><input ref={textInputRef} type="color" onChange={(e) => setTextColor(e.target.value)} className="absolute opacity-0 inset-0 w-full h-full cursor-pointer z-10" /><button type="button" className="w-9 h-9 rounded-full border-2 border-gray-200 flex items-center justify-center bg-black shadow-sm"><Type size={16} className="text-white" /></button></div>
                            {COLORS.map((c, i) => <button key={i} type="button" onClick={() => setTextColor(c)} className={`w-9 h-9 rounded-full shrink-0 border-2 transition-transform shadow-sm ${textColor === c ? 'border-gray-900 scale-110' : 'border-gray-100'}`} style={{ backgroundColor: c }} />)}
                        </div>
                    </div>
                </div>
            </div>
            <div className="h-2 bg-gray-50 -mx-4"></div>
            <div className="flex gap-3">
                <textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write a caption..." className="w-full text-sm border-none focus:ring-0 p-0 resize-none h-24 placeholder-gray-400 leading-relaxed" />
            </div>
          </form>
      </div>
    </motion.div>
  );
};

export default PostShayari;