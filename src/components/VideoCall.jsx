import React, { useEffect, useRef, useState } from 'react';
import SimplePeer from 'simple-peer'; // Ensure you have: npm install simple-peer
import { db } from '../firebase';
import { doc, onSnapshot, updateDoc, getDoc } from 'firebase/firestore';
import { Mic, MicOff, Video, VideoOff, PhoneOff, User } from 'lucide-react';
import { motion } from 'framer-motion';

const VideoCall = ({ callId, currentUser, isCaller, callType, onEndCall }) => {
  const [stream, setStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(callType === 'audio'); // Default off for audio calls
  const [callStatus, setCallStatus] = useState('connecting'); 
  const [otherUserName, setOtherUserName] = useState("User");
  const [seconds, setSeconds] = useState(0);
  
  const myVideo = useRef();
  const userVideo = useRef();
  const connectionRef = useRef();

  // --- 1. CALL TIMER ---
  useEffect(() => {
    let interval = null;
    if (callStatus === 'connected') {
        interval = setInterval(() => {
            setSeconds(prev => prev + 1);
        }, 1000);
    }
    return () => clearInterval(interval);
  }, [callStatus]);

  // Format Time (MM:SS)
  const formatTime = (totalSeconds) => {
      const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
      const secs = (totalSeconds % 60).toString().padStart(2, '0');
      return `${mins}:${secs}`;
  };

  // --- 2. INITIALIZE CALL ---
  useEffect(() => {
    // Determine constraints based on call type
    const constraints = {
        video: callType === 'video', // Only ask for video if it's a video call
        audio: true
    };

    navigator.mediaDevices.getUserMedia(constraints)
      .then((currentStream) => {
        setStream(currentStream);
        if (myVideo.current && callType === 'video') {
            myVideo.current.srcObject = currentStream;
        }

        const peer = new SimplePeer({
          initiator: isCaller,
          trickle: false,
          stream: currentStream,
        });

        // Send Signal
        peer.on('signal', (data) => {
          if (isCaller) {
             updateDoc(doc(db, "calls", callId), { offer: JSON.stringify(data) });
          } else {
             updateDoc(doc(db, "calls", callId), { answer: JSON.stringify(data) });
          }
        });

        // Receive Stream
        peer.on('stream', (currentRemoteStream) => {
          if (userVideo.current) {
            userVideo.current.srcObject = currentRemoteStream;
          }
        });

        // Firebase Listener
        const unsub = onSnapshot(doc(db, "calls", callId), async (snapshot) => {
            const data = snapshot.data();
            
            // Fetch Other User Name for UI
            if (data) {
                const otherUser = isCaller ? data.receiver : data.caller;
                setOtherUserName(otherUser);
            }

            if (data?.status === 'ended') {
                leaveCall();
            }

            if (isCaller && data?.answer && !connectionRef.current.connected) {
                peer.signal(JSON.parse(data.answer));
                connectionRef.current.connected = true;
                setCallStatus('connected');
            } 
            else if (!isCaller && data?.offer && !connectionRef.current.connected) {
                peer.signal(JSON.parse(data.offer));
                connectionRef.current.connected = true;
                setCallStatus('connected');
            }
        });

        connectionRef.current = peer;
        return () => unsub();
      })
      .catch(err => {
          console.error("Media Error:", err);
          alert("Could not access camera/microphone. Please allow permissions.");
          onEndCall();
      });

    return () => leaveCall();
  }, []);

  const leaveCall = () => {
    setCallStatus('ended');
    if (connectionRef.current) connectionRef.current.destroy();
    if (stream) stream.getTracks().forEach(track => track.stop());
    updateDoc(doc(db, "calls", callId), { status: 'ended' });
    onEndCall();
  };

  const toggleMute = () => {
    if(stream) {
        const audioTrack = stream.getAudioTracks()[0];
        if(audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            setIsMuted(!audioTrack.enabled);
        }
    }
  }

  const toggleVideo = () => {
      // Only allow toggling video if it was a video call initially
      if(callType === 'audio') return; 

      if(stream) {
          const videoTrack = stream.getVideoTracks()[0];
          if(videoTrack) {
              videoTrack.enabled = !videoTrack.enabled;
              setIsVideoOff(!videoTrack.enabled);
          }
      }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-gray-900 flex flex-col items-center justify-center overflow-hidden">
        
        {/* --- REMOTE VIDEO / AVATAR AREA --- */}
        {callType === 'video' && callStatus === 'connected' ? (
             <video playsInline ref={userVideo} autoPlay className="absolute inset-0 w-full h-full object-cover" />
        ) : (
            // Audio Call UI
            <div className="flex flex-col items-center z-10 animate-pulse">
                <div className="w-32 h-32 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-2xl mb-6">
                    <span className="text-5xl font-bold text-white">{otherUserName[0]?.toUpperCase()}</span>
                </div>
                <h2 className="text-3xl font-bold text-white mb-2">{otherUserName}</h2>
                <p className="text-gray-300 text-lg">
                    {callStatus === 'connected' ? formatTime(seconds) : "Connecting..."}
                </p>
            </div>
        )}

        {/* --- LOCAL VIDEO (Video Call Only) --- */}
        {callType === 'video' && stream && (
            <motion.div 
                drag 
                dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                className="absolute top-4 right-4 w-32 h-48 bg-black rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 z-20"
            >
                <video playsInline muted ref={myVideo} autoPlay className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : 'block'}`} />
                {isVideoOff && (
                    <div className="w-full h-full flex items-center justify-center bg-gray-800 text-white">
                        <VideoOff />
                    </div>
                )}
            </motion.div>
        )}

        {/* --- CONTROLS --- */}
        <div className="absolute bottom-10 flex gap-6 z-30">
            {/* Mute */}
            <button onClick={toggleMute} className={`p-4 rounded-full ${isMuted ? 'bg-white text-gray-900' : 'bg-white/20 backdrop-blur-md text-white'} transition hover:scale-110`}>
                {isMuted ? <MicOff /> : <Mic />}
            </button>

            {/* End Call */}
            <button onClick={leaveCall} className="p-4 rounded-full bg-red-600 text-white shadow-lg transition hover:scale-110">
                <PhoneOff size={32} fill="currentColor" />
            </button>

            {/* Video Toggle (Only for Video Calls) */}
            {callType === 'video' && (
                <button onClick={toggleVideo} className={`p-4 rounded-full ${isVideoOff ? 'bg-white text-gray-900' : 'bg-white/20 backdrop-blur-md text-white'} transition hover:scale-110`}>
                    {isVideoOff ? <VideoOff /> : <Video />}
                </button>
            )}
        </div>
    </div>
  );
};

export default VideoCall;