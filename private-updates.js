/* Secure two-person notes: Firestore is the shared source of truth. */
// Load Firebase only when configured, so the secret entrance and original
// birthday site work even before Firebase setup or when offline.
let initializeApp, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut;
let getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc;
let deleteDoc, updateDoc, onSnapshot, orderBy, query, limit, serverTimestamp;
let getMessaging, getToken, deleteToken, messagingSupported, onMessage;

const $ = id => document.getElementById(id);
const overlay = $('privateOverlay');
const dialog = overlay.querySelector('.private-dialog');
const setup = $('privateSetup');
const loading = $('privateLoading');
const authView = $('privateAuth');
const appView = $('privateApp');
const errorBox = $('privateError');
const timeline = $('privateTimeline');
const config = globalThis.PRIVATE_UPDATES_CONFIG || {};
let app, auth, db;
let user = null;
let myName = '';
let memberNames = new Map();
let stopUpdates = null;
let observer = null;
let currentPostIds = new Map();
let firstSnapshot = true;
let messaging = null;
let pushReady = false;
let lastFocused = null;
let oldOverflow = '';

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}
function clearError() {
  errorBox.textContent = '';
  errorBox.hidden = true;
}
function showView(view) {
  loading.hidden = view !== 'loading';
  authView.hidden = view !== 'auth';
  appView.hidden = view !== 'app';
  setup.hidden = view !== 'setup';
}
function isConfigured() {
  const c = config.firebase;
  return !!(c && c.apiKey && c.projectId && c.authDomain && c.appId && c.messagingSenderId &&
    !Object.values(c).some(value => typeof value === 'string' && value.includes('PASTE_')));
}
function openRoom() {
  if (!overlay.hidden) return;
  lastFocused = document.activeElement;
  oldOverflow = document.body.style.overflow;
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  dialog.focus();
  if (user) observeVisiblePosts();
}
function closeRoom() {
  overlay.hidden = true;
  document.body.style.overflow = oldOverflow;
  if (observer) observer.disconnect();
  if (lastFocused?.focus) lastFocused.focus();
}
$('privateClose').addEventListener('click', closeRoom);
$('privateBackdrop').addEventListener('click', closeRoom);
document.addEventListener('keydown', event => {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'u') {
    event.preventDefault();
    openRoom();
  }
  if (event.key === 'Escape' && !overlay.hidden) closeRoom();
  if (event.key === 'Tab' && !overlay.hidden) {
    const active = [...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),a[href]')]
      .filter(el => el.getClientRects().length && !el.closest('[hidden]'));
    if (!active.length) return;
    const first = active[0], last = active[active.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }
});
// Undocumented entry: tap the small heart in the footer five times quickly.
let tapCount = 0;
let tapStart = 0;
$('privateEntry').addEventListener('click', () => {
  if (Date.now() - tapStart > 3500) { tapCount = 0; tapStart = Date.now(); }
  if (++tapCount >= 5) { tapCount = 0; openRoom(); }
});
if (new URLSearchParams(location.search).get('private') === '1') {
  openRoom();
  const url = new URL(location.href);
  url.searchParams.delete('private');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
}

function displayName(uid) { return memberNames.get(uid) || 'Someone special'; }
function formattedDate(timestamp) {
  const date = timestamp?.toDate?.();
  return date ? date.toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : 'just now';
}
function notifyInPage(message) {
  // Reuse the site's existing toast, without injecting HTML or disturbing the birthday page.
  const node = $('toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(notifyInPage.timer);
  notifyInPage.timer = setTimeout(() => node.classList.remove('show'), 4500);
  if (document.visibilityState === 'hidden' && !pushReady && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification('Our little corner ♡', { body:message, tag:'private-update' }); } catch (_) { /* Unsupported on some mobile browsers. */ }
  }
}
function makePostElement(id, post) {
  const mine = post.authorUid === user.uid;
  const article = document.createElement('article');
  article.className = `private-post${mine ? ' is-mine' : ''}`;
  article.dataset.postId = id;
  article.setAttribute('aria-label', mine ? 'Your update' : `${displayName(post.authorUid)}'s update`);
  const header = document.createElement('div');
  header.className = 'private-post-header';
  const author = document.createElement('span');
  author.className = 'private-post-author';
  author.textContent = mine ? 'You ♡' : `${displayName(post.authorUid)} ♡`;
  const date = document.createElement('time');
  date.className = 'private-post-date';
  date.textContent = formattedDate(post.createdAt);
  header.append(author, date);
  const message = document.createElement('p');
  message.className = 'private-post-body';
  message.textContent = post.body; // Never inject another person's HTML.
  article.append(header, message);
  if (mine) {
    const receipt = document.createElement('p');
    receipt.className = `private-post-receipt${post.readAt ? ' seen' : ''}`;
    receipt.textContent = post.readAt
      ? `✓✓ Read by ${otherName()} · ${formattedDate(post.readAt)}`
      : '✓ Sent · not read yet';
    article.append(receipt);
  }
  return article;
}
function otherName() {
  for (const [uid, name] of memberNames) if (uid !== user?.uid) return name;
  return 'the other person';
}
function observeVisiblePosts() {
  if (observer) observer.disconnect();
  if (!user || overlay.hidden || appView.hidden || !('IntersectionObserver' in window)) return;
  observer = new IntersectionObserver(entries => {
    if (overlay.hidden || document.visibilityState !== 'visible') return;
    for (const entry of entries) {
      if (!entry.isIntersecting || entry.intersectionRect.height < Math.min(105, entry.boundingClientRect.height * .6)) continue;
      const id = entry.target.dataset.postId;
      const post = currentPostIds.get(id);
      if (!post || post.authorUid === user.uid || post.readAt || entry.target.dataset.marking) continue;
      entry.target.dataset.marking = 'true';
      updateDoc(doc(db, 'updates', id), { readAt: serverTimestamp() }).catch(() => {
        // A second tab may have marked the same item read; refresh handles this.
        delete entry.target.dataset.marking;
      });
    }
  }, { root: timeline, threshold: [0, .1, .25, .5, .6, 1] });
  timeline.querySelectorAll('.private-post:not(.is-mine)').forEach(el => observer.observe(el));
}
function clearListening() {
  if (stopUpdates) { stopUpdates(); stopUpdates = null; }
  if (observer) { observer.disconnect(); observer = null; }
  currentPostIds.clear();
  firstSnapshot = true;
}
function subscribeToUpdates() {
  clearListening();
  const ownerUid = user.uid;
  stopUpdates = onSnapshot(query(collection(db, 'updates'), orderBy('createdAt','desc'), limit(100)), snapshot => {
    if (!user || user.uid !== ownerUid) return;
    const old = currentPostIds;
    const next = new Map();
    for (const item of snapshot.docs) {
      const post = item.data({ serverTimestamps:'estimate' });
      next.set(item.id, post);
      if (!firstSnapshot && !snapshot.metadata.fromCache) {
        const prior = old.get(item.id);
        if (!prior && post.authorUid !== user.uid) notifyInPage(`💌 ${displayName(post.authorUid)} posted a new update!`);
        if (prior && !prior.readAt && post.readAt && post.authorUid === user.uid) {
          notifyInPage(`💗 ${otherName()} read your update!`);
        }
      }
    }
    firstSnapshot = false;
    currentPostIds = next;
    timeline.replaceChildren();
    if (!next.size) {
      const empty = document.createElement('div');
      empty.className = 'private-empty';
      empty.textContent = 'No updates yet. Make the first one ♡';
      timeline.append(empty);
    } else {
      for (const [id,post] of next) timeline.append(makePostElement(id, post));
    }
    $('privateSyncStatus').textContent = snapshot.metadata.fromCache
      ? 'Showing saved updates · connecting…' : 'Live updates and read receipts ♡';
    observeVisiblePosts();
  }, err => {
    showError(err.code === 'permission-denied'
      ? 'This account is not allowed to read the private updates. Check Firebase membership and rules.'
      : `Updates could not sync: ${err.message}`);
    $('privateSyncStatus').textContent = 'Sync unavailable';
  });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !overlay.hidden) observeVisiblePosts();
});

$('privateMessage').addEventListener('input', () => {
  $('privateCount').textContent = `${$('privateMessage').value.length} / 1800`;
});
$('privatePostForm').addEventListener('submit', async e => {
  e.preventDefault();
  const body = $('privateMessage').value.trim();
  if (!user || body.length < 1 || body.length > 1800) return;
  clearError();
  const btn = $('privatePostButton');
  btn.disabled = true; btn.textContent = 'Posting… ♡';
  try {
    await addDoc(collection(db, 'updates'), {
      authorUid: user.uid, body, createdAt: serverTimestamp(), readAt: null
    });
    $('privateMessage').value = '';
    $('privateCount').textContent = '0 / 1800';
    notifyInPage('Update posted ♡');
  } catch (err) { showError(`Couldn't post: ${err.message}`); }
  finally { btn.disabled = false; btn.textContent = 'Post update ♡'; }
});
$('privateLoginForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!auth) return;
  clearError();
  const button = $('privateLoginButton');
  button.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, $('privateEmail').value.trim(), $('privatePassword').value);
    $('privatePassword').value = '';
  } catch (err) {
    showError(['auth/invalid-credential','auth/wrong-password','auth/user-not-found','auth/invalid-email']
      .includes(err.code) ? 'Email or password is incorrect.' : `Sign in failed: ${err.message}`);
  } finally { button.disabled = false; }
});
$('privateSignOut').addEventListener('click', async () => {
  try {
    await unregisterPushDevice();
    await signOut(auth);
    clearError();
    notifyInPage('Signed out of our corner ♡');
  } catch (err) { showError(`Sign out failed: ${err.message}`); }
});

function deviceId() {
  const key = 'birthday-corner-device-id';
  let id = null;
  try { id = localStorage.getItem(key); } catch (_) {}
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `d-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try { localStorage.setItem(key,id); } catch (_) {}
  }
  return id;
}
async function unregisterPushDevice() {
  if (user && db) {
    try { await deleteDoc(doc(db, 'pushTokens', user.uid, 'devices', deviceId())); } catch (_) {}
  }
  if (messaging) { try { await deleteToken(messaging); } catch (_) {} }
  pushReady = false;
}
async function enablePush() {
  const status = $('privateNotifyStatus');
  clearError();
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !window.isSecureContext) {
    status.textContent = 'Push notifications require a supported browser and HTTPS.';
    return;
  }
  if (!config.vapidKey || config.vapidKey.includes('PASTE_')) {
    status.textContent = 'The owner needs to set the Firebase Web Push VAPID key first. Live in-page alerts still work.';
    return;
  }
  if (!(await messagingSupported())) {
    status.textContent = 'This browser does not support Firebase web push. Live in-page alerts still work.';
    return;
  }
  const btn = $('privateEnableNotifications');
  btn.disabled = true;
  status.textContent = 'Setting up browser notifications…';
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      status.textContent = 'Notifications not permitted. You can allow them in your browser site settings.';
      return;
    }
    const sw = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
    messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey:config.vapidKey, serviceWorkerRegistration:sw });
    if (!token || !user) throw new Error('Unable to register this device.');
    await setDoc(doc(db,'pushTokens',user.uid,'devices',deviceId()), {
      token, updatedAt:serverTimestamp()
    });
    pushReady = true;
    status.textContent = '🔔 Alerts enabled on this device, even when the site is closed (where supported).';
    btn.textContent = '✓ Alerts enabled';
    // Firestore already gives us foreground alerts; don't show duplicates from FCM.
    onMessage(messaging, () => {});
  } catch (err) {
    status.textContent = `Push setup failed: ${err.message}. Live in-page alerts still work.`;
  } finally { btn.disabled = false; }
}
$('privateEnableNotifications').addEventListener('click', enablePush);

async function establishMemberSession(signedInUser) {
  const me = await getDoc(doc(db,'members',signedInUser.uid));
  if (!me.exists()) {
    await signOut(auth);
    showView('auth');
    showError('This account has not been invited. Ask the site owner to add your Firebase UID as a member.');
    return;
  }
  if (!auth.currentUser || auth.currentUser.uid !== signedInUser.uid) return;
  const members = await getDocs(collection(db,'members'));
  memberNames = new Map(members.docs.map(item => [item.id, String(item.data().displayName || 'Someone special')]));
  myName = memberNames.get(signedInUser.uid) || 'you';
  user = signedInUser;
  $('privateWelcome').textContent = `Hi ${myName} ♡`;
  $('privateNotifyStatus').textContent = 'Enable browser alerts to hear about new posts and read receipts even when away.';
  $('privateEnableNotifications').textContent = '🔔 Enable alerts';
  showView('app');
  subscribeToUpdates();
  // Renew a previously approved device subscription after reloading the site.
  // This does NOT ask for notification permission without a user's click.
  if ('Notification' in window && Notification.permission === 'granted' &&
      config.vapidKey && !config.vapidKey.includes('PASTE_')) {
    enablePush();
  }
}

async function start() {
  if (!isConfigured()) { showView('setup'); return; }
  showView('loading');
  try {
    const [appSdk, authSdk, firestoreSdk, messagingSdk] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js'),
      import('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging.js')
    ]);
    ({ initializeApp } = appSdk);
    ({ getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } = authSdk);
    ({ getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc,
       updateDoc, onSnapshot, orderBy, query, limit, serverTimestamp } = firestoreSdk);
    ({ getMessaging, getToken, deleteToken, onMessage } = messagingSdk);
    messagingSupported = messagingSdk.isSupported;
    app = initializeApp(config.firebase, 'birthday-private-updates');
    auth = getAuth(app);
    db = getFirestore(app);
    onAuthStateChanged(auth, async signedInUser => {
      clearListening();
      user = null;
      pushReady = false;
      $('privatePassword').value = '';
      if (!signedInUser) {
        showView('auth');
        return;
      }
      showView('loading');
      clearError();
      try { await establishMemberSession(signedInUser); }
      catch (err) {
        showView('auth');
        showError(err.code === 'permission-denied'
          ? 'Account not approved, or security rules are not deployed correctly.'
          : `Unable to open the room: ${err.message}`);
      }
    }, err => { showView('auth'); showError(`Authentication unavailable: ${err.message}`); });
  } catch (err) { showView('setup'); showError(`Firebase could not start: ${err.message}`); }
}
start();
