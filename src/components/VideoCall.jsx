import React, { useEffect, useRef, useState } from 'react';
import SimplePeer from 'simple-peer';
import { db } from '../firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-react';
import { motion } from 'framer-motion';

const VideoCall = ({ callId, currentUser, isCaller, onEndCall }) => {
  const [stream, setStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callStatus, setCallStatus] = useState('connecting'); // connecting, connected, ended
  
  const myVideo = useRef();
  const userVideo = useRef();
  const connectionRef = useRef();

  useEffect(() => {
    // 1. Get User Media (Camera & Mic)
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((currentStream) => {
        setStream(currentStream);
        if (myVideo.current) myVideo.current.srcObject = currentStream;

        // 2. Initialize Peer
        const peer = new SimplePeer({
          initiator: isCaller,
          trickle: false,
          stream: currentStream,
        });

        // 3. LISTEN: When we get a signal (handshake data), save it to Firebase
        peer.on('signal', (data) => {
          if (isCaller) {
             // Caller saves 'offer'
             updateDoc(doc(db, "calls", callId), { offer: JSON.stringify(data) });
          } else {
             // Receiver saves 'answer'
             updateDoc(doc(db, "calls", callId), { answer: JSON.stringify(data) });
          }
        });

        // 4. LISTEN: When we get the other user's stream
        peer.on('stream', (currentRemoteStream) => {
          if (userVideo.current) {
            userVideo.current.srcObject = currentRemoteStream;
          }
        });

        // 5. LISTEN: Firebase updates for the Handshake
        const unsub = onSnapshot(doc(db, "calls", callId), (snapshot) => {
            const data = snapshot.data();
            
            // If call ended by other person
            if (data?.status === 'ended') {
                leaveCall();
            }

            // Connection Logic
            if (isCaller && data?.answer && !connectionRef.current.connected) {
                // As Caller: Wait for 'answer', then connect
                peer.signal(JSON.parse(data.answer));
                connectionRef.current.connected = true; // prevent loop
                setCallStatus('connected');
            } 
            else if (!isCaller && data?.offer && !connectionRef.current.connected) {
                // As Receiver: Wait for 'offer', then connect
                peer.signal(JSON.parse(data.offer));
                connectionRef.current.connected = true; // prevent loop
                setCallStatus('connected');
            }
        });

        connectionRef.current = peer;
        return () => unsub();
      })
      .catch(err => console.error("Failed to get stream:", err));

    return () => leaveCall();
  }, []); // Run once on mount

  const leaveCall = () => {
    setCallStatus('ended');
    if (connectionRef.current) connectionRef.current.destroy();
    if (stream) stream.getTracks().forEach(track => track.stop()); // Stop camera light
    
    // Update Firebase to let other know
    updateDoc(doc(db, "calls", callId), { status: 'ended' });
    onEndCall();
  };

  const toggleMute = () => {
    if(stream) {
        stream.getAudioTracks()[0].enabled = !stream.getAudioTracks()[0].enabled;
        setIsMuted(!stream.getAudioTracks()[0].enabled);
    }
  }

  const toggleVideo = () => {
      if(stream) {
          stream.getVideoTracks()[0].enabled = !stream.getVideoTracks()[0].enabled;
          setIsVideoOff(!stream.getVideoTracks()[0].enabled);
      }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-gray-900 flex flex-col items-center justify-center">
        {/* Remote Video (Full Screen) */}
        {callStatus === 'connected' ? (
             <video playsInline ref={userVideo} autoPlay className="absolute inset-0 w-full h-full object-cover" />
        ) : (
            <div className="flex flex-col items-center animate-pulse z-10">
                <div className="w-24 h-24 bg-gray-700 rounded-full mb-4"></div>
                <p className="text-white text-xl">Connecting...</p>
            </div>
        )}

        {/* My Video (Small Overlay) */}
        {stream && (
            <motion.div 
                drag 
                dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                className="absolute top-4 right-4 w-32 h-48 bg-black rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 z-20"
            >
                <video playsInline muted ref={myVideo} autoPlay className="w-full h-full object-cover" />
            </motion.div>
        )}

        {/* Controls */}
        <div className="absolute bottom-10 flex gap-6 z-30">
            <button onClick={toggleMute} className={`p-4 rounded-full ${isMuted ? 'bg-red-500' : 'bg-white/20 backdrop-blur-md'} text-white transition hover:scale-110`}>
                {isMuted ? <MicOff /> : <Mic />}
            </button>

            <button onClick={leaveCall} className="p-4 rounded-full bg-red-600 text-white shadow-lg transition hover:scale-110">
                <PhoneOff size={32} fill="currentColor" />
            </button>

            <button onClick={toggleVideo} className={`p-4 rounded-full ${isVideoOff ? 'bg-red-500' : 'bg-white/20 backdrop-blur-md'} text-white transition hover:scale-110`}>
                {isVideoOff ? <VideoOff /> : <Video />}
            </button>
        </div>
    </div>
  );
};

export default VideoCall;