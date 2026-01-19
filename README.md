# ShayariGram 📸

A full-featured social media web application built with **React.js** and **Firebase**, designed to replicate core Instagram functionalities. It focuses on social networking, real-time messaging, media sharing, and video/audio calling capabilities within a clean, light-themed interface.

## 🚀 Key Features

### 1. 🔐 Authentication & Security
* **User Login/Logout:** Secure authentication powered by Firebase Auth.
* **Private Accounts:** Users can toggle their account privacy in Settings.
    * **Public:** Posts are visible to everyone.
    * **Private:** Only followers can see content; new followers must request access.
* **Security:** Password reset and account deletion capabilities.

### 2. 💬 Real-Time Messaging (Instagram Direct Style)
* **Instant Messaging:** Real-time chat powered by Firestore listeners.
* **Mutuals Filter:** You can only start new conversations with users who follow you back (Mutuals).
* **Typing Indicators:** Shows "Typing..." status in real-time when the other user is typing.
* **Read Receipts:** Displays "Seen" below the last message when the recipient opens the chat.
* **Media Sharing:** Send images directly from the device gallery or camera.
* **Unread Indicators:**
    * **Sidebar:** Red notification badge for unread messages.
    * **Chat List:** Blue dot indicator and bold text for unread conversations.
    * **Top Banner:** A notification banner appears at the top of the screen if a message arrives while browsing other pages.

### 3. 📞 Video & Audio Calling
* **Integrated Calling:** Initiate Audio or Video calls directly from the chat header.
* **Global Incoming Call:** A popup modal appears anywhere in the app when receiving a call.
* **Call Status:** Real-time updates for "Ringing", "Connected" (with timer), and "Ended".
* **Interactive UI:** Full-screen overlay for active calls with Mute, Video Toggle, and End Call controls.

### 4. 👤 Profile & Social Graph
* **Follow System:** Follow, Unfollow, and Remove Followers.
* **Follow Requests:** Manage incoming follow requests (Accept/Delete) for private accounts.
* **Profile Editing:** Update Bio, Location, Username, and Profile Picture.
* **Stats:** View counts for Posts, Followers, and Following.

### 5. 🔔 Notifications & Activity
* **Activity Feed:** specific notifications for Likes, Comments, New Followers, and Follow Requests.
* **Interactive Alerts:** Accept follow requests or follow back directly from the notification list.

## 🛠️ Tech Stack

* **Frontend Library:** [React.js](https://react.dev/)
* **Backend as a Service:** [Firebase](https://firebase.google.com/)
    * **Firestore:** Real-time NoSQL database for chats, users, posts, and notifications.
    * **Storage:** Cloud storage for profile pictures and chat media.
    * **Authentication:** User identity management.
* **Styling:** [Tailwind CSS](https://tailwindcss.com/) (Enforced Light Mode).
* **Icons:** [Lucide React](https://lucide.dev/).
* **Animations:** [Framer Motion](https://www.framer.com/motion/) (for transitions, modals, and call overlays).

## 📂 Project Structure

```bash
src/
├── App.jsx                 # Main Layout, Global Listeners (Calls/Notifications), Routing
├── firebase.js             # Firebase configuration and initialization
├── components/
│   ├── ChatPage.jsx        # Full Chat logic, History, Real-time messaging, Calling UI
│   ├── SettingsModal.jsx   # Settings, Privacy Toggle, Account Security
│   ├── ProfilePage.jsx     # User Profile, Edit Profile, Follow Logic
│   ├── Notifications.jsx   # Activity Feed
│   ├── PostShayari.jsx     # Create new post
│   ├── ShayariFeed.jsx     # Home feed
│   ├── Explore.jsx         # Search & Explore users
│   ├── Login.jsx           # Authentication screen
│   └── ...                 # Other utility components

```

## 💾 Database Schema (Firestore)

### `users` (Collection)

* `uid`: string
* `username`: string
* `photoURL`: string
* `bio`: string
* `followers`: array[uid]
* `following`: array[uid]
* `isPrivate`: boolean
* `pendingRequests`: array[uid]

### `chats` (Collection)

* `participants`: array[uid]
* `lastMessage`: string
* `lastMessageSender`: uid
* `isRead`: boolean
* `timestamp`: serverTimestamp
* `typing`: map { uid: boolean }
* **Sub-collection:** `messages`
* `text`: string
* `image`: string (URL)
* `sender`: uid
* `timestamp`: serverTimestamp
* `type`: 'text' | 'image'





### `calls` (Collection)

* `caller`: uid (username)
* `receiver`: uid (username)
* `status`: 'ringing' | 'connected' | 'ended'
* `type`: 'audio' | 'video'
* `timestamp`: serverTimestamp

### `notifications` (Collection)

* `fromUser`: uid
* `toUser`: uid
* `type`: 'like' | 'comment' | 'follow' | 'follow_request'
* `read`: boolean
* `timestamp`: serverTimestamp

## ⚙️ Installation & Setup

1. **Clone the repository**
```bash
git clone [https://github.com/your-username/shayarigram.git](https://github.com/your-username/shayarigram.git)
cd shayarigram

```


2. **Install Dependencies**
```bash
npm install
# or
yarn install

```


3. **Configure Firebase**
* Create a project in the [Firebase Console](https://console.firebase.google.com/).
* Enable **Authentication**, **Firestore**, and **Storage**.
* Create a file named `src/firebase.js` and paste your config:


```javascript
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

```


4. **Indexes (Important!)**
* The app uses complex Firestore queries (sorting by timestamp while filtering participants).
* When you first run the app and open the chat, check the browser console.
* Click the **link provided in the console error** to automatically generate the required composite indexes in Firestore.


5. **Run the App**
```bash
npm run dev

```



## 🤝 Contributing

Contributions are welcome! Please fork the repository and create a pull request for any new features or bug fixes.

## 📄 License

This project is open-source and available under the [MIT License](https://www.google.com/search?q=LICENSE).

```

```