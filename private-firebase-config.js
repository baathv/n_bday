/*
 * PUBLIC Firebase client configuration. Paste values from Firebase Console >
 * Project settings > Your apps > Web app. These values are NOT private keys.
 * Real privacy comes from Firebase Authentication + deployed firestore.rules.
 * This single file is read by both the web page and the push service worker.
 */
globalThis.PRIVATE_UPDATES_CONFIG = {
  firebase: {
    apiKey: "AIzaSyCDOJ7DI1IQKmW_g6KpobkhKW-mmRqdZG4",
    authDomain: "n-bday.firebaseapp.com",
    projectId: "n-bday",
    messagingSenderId: "546637359397",
    appId: "1:546637359397:web:2fc500b31cf1ac092ad2cc"
  },
  // Firebase Console > Project settings > Cloud Messaging > Web Push certificates
  vapidKey: "BOEfDdl-MU8XG8Wt1xYZ4IkzcJ5F2F-8x171TW2-1qD6Bn1DbwK0IWWrmy0HrSncM28HqemP7laKQO2Q6Rjx6eM"
};
