/*
 * PUBLIC Firebase client configuration. Paste values from Firebase Console >
 * Project settings > Your apps > Web app. These values are NOT private keys.
 * Real privacy comes from Firebase Authentication + deployed firestore.rules.
 * This single file is read by both the web page and the push service worker.
 */
globalThis.PRIVATE_UPDATES_CONFIG = {
  firebase: {
    apiKey: "PASTE_API_KEY",
    authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
    projectId: "PASTE_PROJECT_ID",
    messagingSenderId: "PASTE_SENDER_ID",
    appId: "PASTE_APP_ID"
  },
  // Firebase Console > Project settings > Cloud Messaging > Web Push certificates
  vapidKey: "PASTE_PUBLIC_VAPID_KEY"
};
