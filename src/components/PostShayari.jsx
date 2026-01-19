import { useState, useRef, useEffect } from 'react';
import { db, storage } from '../firebase'; // Ensure storage is imported
import { collection, addDoc, serverTimestamp, getDocs, writeBatch } from 'firebase/firestore'; 
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  Send, 
  Image as ImageIcon, 
  X, 
  Wand2, 
  RefreshCw, 
  Type, 
  AlertTriangle, 
  Loader2,
  Square, 
  Smartphone, 
  Monitor, 
  LayoutTemplate, 
  Crop 
} from 'lucide-react'; 
import { motion, AnimatePresence } from 'framer-motion';

// --- ASPECT RATIO OPTIONS ---
const ASPECT_RATIOS = [
  { id: '1/1', label: 'Square', icon: Square, desc: 'Insta/Feed' },
  { id: '4/5', label: 'Portrait', icon: LayoutTemplate, desc: 'Ads/Port' },
  { id: '1.91/1', label: 'Landscp', icon: Crop, desc: 'Ads/Land' },
  { id: '9/16', label: 'Story', icon: Smartphone, desc: 'Reels/Shorts' },
  { id: '16/9', label: 'Wide', icon: Monitor, desc: 'YouTube' },
];

const CATEGORIES = ["General", "Love", "Sad", "Poetry", "Quotes", "Motivation", "Life", "Friendship"];

// --- BulkSeeder Placeholder (Admin Only) ---
const BulkSeeder = () => <div className="p-4 bg-gray-50 rounded-xl text-center text-xs text-gray-400 border border-dashed border-gray-300">Bulk Seeder Component Placeholder</div>;

const PostShayari = ({ username }) => {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('General');
  const [aspectRatio, setAspectRatio] = useState('1/1'); // Default Square
  
  const [selectedFile, setSelectedFile] = useState(null); // Actual File Object
  const [previewImage, setPreviewImage] = useState(null); // Data URL for preview
  const [originalImagePreview, setOriginalImagePreview] = useState(null); // Backup for "Remove Text"

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTextOnImage, setIsTextOnImage] = useState(false); 
  const [textChanged, setTextChanged] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false); 
  
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!isTextOnImage) setTextChanged(false);
  }, [isTextOnImage]);

  // --- IMAGE HANDLER ---
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB Limit
        alert("Image is too large (Max 5MB)");
        return; 
      }
      setSelectedFile(file); // Save file for upload
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result);
        setOriginalImagePreview(reader.result); // Save backup
        setIsTextOnImage(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTextChange = (e) => {
    setContent(e.target.value);
    if (isTextOnImage) setTextChanged(true);
  };

  // --- ADMIN: DELETE ALL ---
  const handleDeleteAll = async () => {
    if (!window.confirm("⚠️ Are you sure you want to DELETE ALL Shayaris?")) return;

    setIsDeleting(true);
    try {
      const querySnapshot = await getDocs(collection(db, "shayaris"));
      const batch = writeBatch(db);
      querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      alert("All posts deleted.");
    } catch (error) {
      console.error("Error deleting all:", error);
    }
    setIsDeleting(false);
  };

  // --- CANVAS: TEXT ON IMAGE GENERATOR ---
  const generateCompositeImage = () => {
    if (!originalImagePreview || !content.trim()) return;
    setIsGenerating(true);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw Image
      ctx.drawImage(img, 0, 0);
      
      // Overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Text Settings
      const fontSize = Math.max(32, canvas.width / 22); 
      ctx.font = `italic bold ${fontSize}px serif`; 
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;

      // Text Wrapping Logic
      const padding = 40; 
      const maxWidth = canvas.width - (padding * 2);
      const paragraphs = content.split('\n'); 
      let finalLines = [];

      paragraphs.forEach((para) => {
        if (para.trim() === '') { finalLines.push(' '); return; }
        const words = para.split(' ');
        let line = '';
        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && n > 0) {
            finalLines.push(line);
            line = words[n] + ' ';
          } else {
            line = testLine;
          }
        }
        finalLines.push(line);
      });
      
      const lineHeight = fontSize * 1.5;
      const totalTextHeight = finalLines.length * lineHeight;
      let startY = (canvas.height - totalTextHeight) / 2 + (lineHeight / 2); 

      finalLines.forEach((l, i) => {
        ctx.fillText(l.trim(), canvas.width / 2, startY + (i * lineHeight));
      });
      
      // Save Result
      setPreviewImage(canvas.toDataURL('image/jpeg', 0.85));
      setIsGenerating(false);
      setIsTextOnImage(true);
      setTextChanged(false);
    };
    img.src = originalImagePreview;
  };

  const removeTextFromImage = () => {
    setPreviewImage(originalImagePreview); 
    setIsTextOnImage(false);
  };

  const clearAll = () => {
    setSelectedFile(null);
    setPreviewImage(null);
    setOriginalImagePreview(null);
    setIsTextOnImage(false);
    setContent('');
    setAspectRatio('1/1');
  };

  // --- SUBMIT HANDLER ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim() && !selectedFile) return;

    setIsSubmitting(true);
    try {
      let finalImageUrl = null;

      if (previewImage) {
        // 1. Determine which image to upload (Original File OR Canvas Result)
        let blobToUpload = null;

        if (isTextOnImage) {
            // Convert Data URL (Canvas) to Blob
            const response = await fetch(previewImage);
            blobToUpload = await response.blob();
        } else {
            // Use Original File
            blobToUpload = selectedFile;
        }

        // 2. Upload to Firebase Storage
        const fileName = `${Date.now()}_post.jpg`;
        const storageRef = ref(storage, `posts/${username}/${fileName}`);
        const snapshot = await uploadBytes(storageRef, blobToUpload);
        finalImageUrl = await getDownloadURL(snapshot.ref);
      }

      // 3. Save Metadata to Firestore
      await addDoc(collection(db, "shayaris"), {
        content: content, 
        author: username || "Anonymous",
        category: category,
        image: finalImageUrl, 
        isTextOnImage: isTextOnImage,
        aspectRatio: aspectRatio, // Save the selected ratio
        likes: 0,
        saveCount: 0,
        timestamp: serverTimestamp()
      });
      
      clearAll();
      setCategory('General');
      alert("Post created successfully!");
      
    } catch (err) {
      console.error(err);
      alert("Failed to create post. Try again.");
    }
    setIsSubmitting(false);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-purple-100 relative font-sans w-full"
    >
      <canvas ref={canvasRef} className="hidden"></canvas>
      
      <form onSubmit={handleSubmit} className="space-y-5">
        
        {/* 1. Category Selector */}
        <div>
          <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wide">Select Category</label>
          <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-4 py-2 rounded-full text-sm font-bold border transition-all whitespace-nowrap ${category === cat ? 'bg-black text-white border-black shadow-md scale-105' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Ratio Selector (NEW) */}
        <div>
          <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wide">Select Post Format</label>
          <div className="grid grid-cols-5 gap-2">
            {ASPECT_RATIOS.map((ratio) => (
                <button
                    key={ratio.id}
                    type="button"
                    onClick={() => setAspectRatio(ratio.id)}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all border ${
                        aspectRatio === ratio.id 
                        ? 'bg-black text-white border-black shadow-lg scale-105' 
                        : 'bg-gray-50 text-gray-500 border-transparent hover:bg-gray-100'
                    }`}
                >
                    <ratio.icon size={18} className="mb-1" />
                    <span className="text-[10px] font-bold">{ratio.label}</span>
                </button>
            ))}
          </div>
        </div>

        {/* 3. Text Area */}
        <textarea
          placeholder={`Write something beautiful in ${category}...`}
          className="w-full p-4 border border-gray-200 rounded-2xl h-32 md:h-40 focus:outline-none focus:border-purple-500 bg-gray-50/50 resize-none font-serif text-lg transition placeholder:text-gray-400"
          value={content}
          onChange={handleTextChange}
          maxLength={500}
        />

        {/* 4. Image Preview Area */}
        <AnimatePresence>
        {previewImage && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }} 
            animate={{ opacity: 1, scale: 1 }} 
            exit={{ opacity: 0, scale: 0.9 }} 
            className="relative w-full bg-gray-100 rounded-2xl overflow-hidden shadow-inner group border border-gray-200 flex items-center justify-center"
            style={{ aspectRatio: aspectRatio }} // Apply selected ratio to container
          >
            <img 
                src={previewImage} 
                alt="Preview" 
                className="w-full h-full object-cover" 
            />
            
            <button type="button" onClick={clearAll} className="absolute top-3 right-3 bg-black/60 text-white p-2 rounded-full hover:bg-red-600 backdrop-blur-sm transition z-10"><X size={18} /></button>
            
            <div className="absolute bottom-3 right-3 flex flex-wrap justify-end gap-2 items-end z-10 p-2 w-full">
              {isTextOnImage && textChanged && !isGenerating && (
                <button type="button" onClick={generateCompositeImage} className="bg-yellow-500 text-white px-4 py-2 rounded-full font-bold text-xs flex items-center gap-2 shadow-xl hover:bg-yellow-600 transition animate-bounce">
                  <RefreshCw size={14}/> Update Text
                </button>
              )}
              {selectedFile && content.trim() && !isTextOnImage && !isGenerating && (
                  <button type="button" onClick={generateCompositeImage} className="bg-indigo-600 text-white px-4 py-2 rounded-full font-bold text-xs flex items-center gap-2 shadow-xl hover:bg-indigo-700 transition">
                    <Wand2 size={14}/> Add Text to Image
                  </button>
              )}
              {isTextOnImage && !isGenerating && (
                <button type="button" onClick={removeTextFromImage} className="bg-white/90 text-red-600 border border-red-100 px-4 py-2 rounded-full font-bold text-xs flex items-center gap-2 shadow-xl hover:bg-red-50 transition">
                  <Type size={14}/> Remove Text
                </button>
              )}
              {isGenerating && (
                  <div className="bg-black/70 text-white px-4 py-2 rounded-full font-bold text-xs backdrop-blur-sm">
                    Processing...
                  </div>
              )}
            </div>
          </motion.div>
        )}
        </AnimatePresence>

        {/* Bottom Toolbar */}
        <div className="flex justify-between items-center pt-2">
          <label className="cursor-pointer flex items-center gap-2 text-gray-600 hover:text-purple-600 transition bg-gray-100 px-5 py-2.5 rounded-full font-semibold hover:bg-gray-200">
            <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            <ImageIcon size={20} />
            <span className="text-sm hidden md:inline">Add Photo</span>
          </label>

          <motion.button 
            whileHover={{ scale: 1.05 }} 
            whileTap={{ scale: 0.95 }}
            disabled={isSubmitting || isGenerating}
            className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-2.5 rounded-full font-bold flex items-center gap-2 hover:opacity-90 transition disabled:opacity-50 shadow-md text-base"
          >
            {isSubmitting ? <><Loader2 size={18} className="animate-spin"/> Posting...</> : <>Post <Send size={18} className="ml-1" /></>}
          </motion.button>
        </div>
      </form>
      
      {/* Admin Panel */}
      {username === 'admin' && (
        <div className="mt-8 pt-6 border-t border-gray-200 space-y-4">
          <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest text-center mb-4">Admin Zone</h4>
          <BulkSeeder />
          <button 
            onClick={handleDeleteAll}
            disabled={isDeleting}
            className="w-full border-2 border-red-100 bg-red-50 text-red-600 px-4 py-3 rounded-xl font-bold shadow-sm hover:bg-red-600 hover:text-white transition flex items-center justify-center gap-2"
          >
            {isDeleting ? "Deleting..." : <><AlertTriangle size={20} /> DELETE ALL SHAYARIS</>}
          </button>
        </div>
      )}
    </motion.div>
  );
};

export default PostShayari;