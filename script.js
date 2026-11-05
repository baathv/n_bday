(() => {
  'use strict';
  const defaults = {recipientName:'Nilima',senderName:'Velly',birthday:'2026-11-09',headline:'the world got luckier the day you arrived.',miniNote:'A little celebration, just for you.',letter:['Happy birthday! You deserve a wonderful day.'],gifts:[]};
  const cfg = {...defaults,...(window.BIRTHDAY_CONFIG || {})};
  const $ = (id) => document.getElementById(id);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const escapeName = String(cfg.recipientName || defaults.recipientName).trim();
  const fromName = String(cfg.senderName || defaults.senderName).trim();

  document.title = `Happy Birthday, ${escapeName}! ♡`;
  $('heroName').textContent = escapeName;
  $('heroHeadline').textContent = cfg.headline;
  $('heroMiniNote').textContent = cfg.miniNote;
  $('letterRecipient').textContent = escapeName;
  $('letterSender').textContent = fromName;
  const letterBody = $('letterText');
  for (const paragraph of (Array.isArray(cfg.letter) ? cfg.letter : defaults.letter)) {
    const p = document.createElement('p'); p.textContent = String(paragraph); letterBody.appendChild(p);
  }
  // All customizable content is injected as text, not HTML.
  let toastTimer;
  function toast(message) {
    const node = $('toast'); node.textContent = message; node.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 3100);
  }
  const rand = (min,max) => Math.random() * (max-min) + min;
  const confettiColors = ['#fa5798','#ffb4d0','#ffe8a2','#c8a3f0','#fb858e','#ffffff'];
  function confetti(amount=70){
    const layer = $('confettiLayer');
    const count = reducedMotion ? Math.min(amount,12) : amount;
    for(let i=0;i<count;i++){
      const el=document.createElement('i'); el.className='confetti-piece';
      el.style.setProperty('--x',rand(4,96)+'vw'); el.style.setProperty('--dx',rand(-150,150)+'px');
      el.style.setProperty('--rot',rand(0,360)+'deg');el.style.setProperty('--c',confettiColors[Math.floor(rand(0,confettiColors.length))]);
      el.style.setProperty('--duration',rand(3,5.3)+'s');
      el.style.animationDelay=rand(0,.6)+'s'; layer.appendChild(el);
      setTimeout(()=>el.remove(),6200);
    }
  }
  function ambientHearts(){
    if(reducedMotion)return;
    const layer=$('ambientHearts');
    for(let i=0;i<14;i++){
      const el=document.createElement('span'); el.className='ambient-heart';el.textContent=i%3===0?'♡':'♥';
      el.style.left=rand(0,100)+'%';el.style.fontSize=rand(11,26)+'px';
      el.style.setProperty('--dx',rand(-85,85)+'px');
      el.style.animationDuration=rand(12,24)+'s';el.style.animationDelay=-rand(0,22)+'s';layer.appendChild(el);
    }
  }
  ambientHearts();
  let lastTrail = 0;
  if(!reducedMotion && window.matchMedia('(pointer:fine)').matches){
    document.addEventListener('pointermove', (e)=>{
      if(Date.now()-lastTrail<80)return;lastTrail=Date.now();
      const el=document.createElement('span');el.className='cursor-heart';el.textContent=Math.random()>.5?'♥':'♡';
      el.style.setProperty('--x',e.clientX+'px');el.style.setProperty('--y',e.clientY+'px');$('cursorLayer').appendChild(el);
      setTimeout(()=>el.remove(),950);
    },{passive:true});
  }
  // Local calendar date; the greeting becomes celebratory on November 9, 2026.
  const parts = /^\d{4}-\d{2}-\d{2}$/.test(cfg.birthday) ? cfg.birthday.split('-').map(Number) : [2026,11,9];
  const birthday = new Date(parts[0],parts[1]-1,parts[2],0,0,0);
  const birthdayEnd = new Date(parts[0],parts[1]-1,parts[2]+1,0,0,0);
  function countdown(){
    const now=new Date();
    const remaining=Math.max(0,birthday-now);
    const labels=['days','hours','minutes','seconds'];
    const vals=[Math.floor(remaining/86400000),Math.floor(remaining/3600000)%24,Math.floor(remaining/60000)%60,Math.floor(remaining/1000)%60];
    labels.forEach((k,i)=> $(k).textContent=String(vals[i]).padStart(2,'0'));
    if(now>=birthday && now<birthdayEnd){$('countdownLabel').textContent="IT'S YOUR BIRTHDAY! 🥳";}
    else if(now>=birthdayEnd){$('countdownLabel').textContent='birthday magic never expires ♡';}
    else{$('countdownLabel').textContent=`counting down to ${birthday.toLocaleString('en-US',{month:'long',day:'numeric'}).toLowerCase()}`;}
  }
  countdown();setInterval(countdown,1000);

  $('headerHeart').addEventListener('click',()=>{confetti(33);toast('a little love, coming your way! ♥')});
  $('magicButton').addEventListener('click',()=>{confetti(100);toast('you make life sparkle ✨')});
  $('unwrapButton').addEventListener('click',()=>{
    $('letter').scrollIntoView({behavior:reducedMotion?'auto':'smooth'});
    setTimeout(()=>openEnvelope(),reducedMotion?0:600);
  });
  // Blow out the candle using microphone input; tapping is reserved for
  // enabling microphone access (once) and relighting an extinguished candle.
  const candleButton = $('candleButton');
  const cakeHint = $('cakeHint');
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  const MIN_BLOW_RMS = 0.075; // Lower to 0.025 if the microphone is less sensitive.
  const BLOW_HOLD_MS = 180;   // Require sustained airflow, not just a short noise.
  const CALIBRATION_MS = 550;
  let candleOut = false;
  let micStream = null;
  let micContext = null;
  let micAnalyser = null;
  let micSamples = null;
  let micFrame = null;
  let micStarting = false;
  let micRequestVersion = 0;
  let micStartedAt = 0;
  let micPreviousFrame = 0;
  let micNoiseFloor = 0.006;
  let micBlowDuration = 0;

  // A browser cannot turn on the microphone without the visitor's permission.
  cakeHint.textContent = 'tap the candle to enable your microphone, then blow ♡';
  candleButton.setAttribute('aria-label', 'Enable microphone to blow out the birthday candle');

  function stopCandleMic() {
    // Invalidates a pending permission request if the visitor leaves the page.
    micRequestVersion++;
    micStarting = false;
    if (micFrame !== null) cancelAnimationFrame(micFrame);
    micFrame = null;
    micAnalyser = null;
    micSamples = null;
    if (micStream) micStream.getTracks().forEach(track => track.stop());
    micStream = null;
    if (micContext) {
      micContext.close().catch(() => {});
      micContext = null;
    }
  }

  function extinguishCandle() {
    if (candleOut) return;
    candleOut = true;
    candleButton.classList.add('is-out');
    candleButton.setAttribute('aria-label', 'Relight the birthday candle');
    cakeHint.textContent = 'your wish is on its way! ♡ tap to relight';
    stopCandleMic();
    confetti(90);
    toast('wish granted (probably) 🎂');
  }

  function detectCandleBlow(now) {
    if (!micAnalyser || candleOut) return;
    micAnalyser.getFloatTimeDomainData(micSamples);
    let sumSquares = 0;
    for (let i = 0; i < micSamples.length; i++) {
      sumSquares += micSamples[i] * micSamples[i];
    }
    const rms = Math.sqrt(sumSquares / micSamples.length);
    const elapsed = now - micStartedAt;
    const frameMs = Math.min(50, now - micPreviousFrame);
    micPreviousFrame = now;

    if (elapsed < CALIBRATION_MS) {
      // Learn the normal room/microphone noise level before testing for a blow.
      micNoiseFloor = micNoiseFloor * 0.85 + rms * 0.15;
    } else {
      const threshold = Math.max(MIN_BLOW_RMS, micNoiseFloor * 3.2);
      micBlowDuration = rms > threshold ? micBlowDuration + frameMs : 0;
      if (micBlowDuration >= BLOW_HOLD_MS) {
        extinguishCandle();
        return;
      }
      if (rms < threshold * 0.8) {
        micNoiseFloor = micNoiseFloor * 0.985 + rms * 0.015;
      }
    }
    micFrame = requestAnimationFrame(detectCandleBlow);
  }

  async function startCandleMic() {
    if (candleOut || micStream || micStarting) return;
    if (!navigator.mediaDevices?.getUserMedia || !AudioContextType || !window.isSecureContext) {
      cakeHint.textContent = 'microphone needs a supported browser and HTTPS (or localhost) ♡';
      toast('microphone unavailable — open this page over HTTPS');
      return;
    }

    micStarting = true;
    const requestVersion = ++micRequestVersion;
    cakeHint.textContent = 'allow microphone access, then blow gently toward it ♡';
    let stream = null;
    try {
      // Starting AudioContext inside the tap supports browsers that require
      // a user gesture for audio activation, including many mobile browsers.
      const context = new AudioContextType();
      micContext = context;
      const resume = context.resume();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false
      });
      await resume;
      if (requestVersion !== micRequestVersion || candleOut) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      micStream = stream;
      const source = context.createMediaStreamSource(stream);
      const highPass = context.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = 250; // Reduce low-frequency hum and handling noise.
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.2;
      source.connect(highPass);
      highPass.connect(analyser);
      // Do not connect the microphone to the speakers (avoids feedback).
      micAnalyser = analyser;
      micSamples = new Float32Array(analyser.fftSize);
      micNoiseFloor = 0.006;
      micBlowDuration = 0;
      micStartedAt = performance.now();
      micPreviousFrame = micStartedAt;
      cakeHint.textContent = 'now blow toward your microphone to make a wish ♡';
      candleButton.setAttribute('aria-label', 'Birthday candle lit. Blow toward your microphone to extinguish it');
      toast('microphone ready — blow to make a wish! 🎂');
      micFrame = requestAnimationFrame(detectCandleBlow);
    } catch (error) {
      if (stream && stream !== micStream) stream.getTracks().forEach(track => track.stop());
      if (requestVersion === micRequestVersion) {
        stopCandleMic();
        cakeHint.textContent = 'tap the candle to allow microphone access ♡';
        toast(error?.name === 'NotAllowedError'
          ? 'please allow microphone access to blow out the candle'
          : 'microphone could not start — tap to try again');
      }
    } finally {
      if (requestVersion === micRequestVersion) micStarting = false;
    }
  }

  candleButton.addEventListener('click', () => {
    if (candleOut) {
      // Keep the original tap-to-relight interaction.
      candleOut = false;
      candleButton.classList.remove('is-out');
      candleButton.setAttribute('aria-label', 'Birthday candle lit. Blow toward your microphone to extinguish it');
      cakeHint.textContent = 'one more wish? blow toward your microphone ♡';
      toast('one more wish? absolutely!');
      startCandleMic();
    } else if (!micStream && !micStarting) {
      // Tapping a lit candle NEVER puts out the flame.
      startCandleMic();
    } else {
      toast('blow toward your microphone to put out the flame ♡');
    }
  });

  // Release the microphone if the page is closed or moved to the background.
  window.addEventListener('pagehide', stopCandleMic);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (micStream || micStarting)) stopCandleMic();
    if (!document.hidden && !candleOut && !micStream) {
      cakeHint.textContent = 'tap the candle to re-enable your microphone ♡';
      candleButton.setAttribute('aria-label', 'Enable microphone to blow out the birthday candle');
    }
  });
  let isLetterOpen=false;
  function openEnvelope(){
    if(isLetterOpen)return;
    isLetterOpen=true;
    $('envelopeButton').classList.add('open');$('envelopeButton').setAttribute('aria-expanded','true');
    $('envelopeHint').textContent='sealed with love, opened with a smile ♡';
    setTimeout(()=>{$('letterCard').hidden=false;$('letterCard').focus({preventScroll:true});},reducedMotion?0:500);
    confetti(30);
  }
  $('envelopeButton').addEventListener('click',()=>{
    if(isLetterOpen){$('letterCard').hidden=false;$('letterCard').scrollIntoView({behavior:reducedMotion?'auto':'smooth',block:'center'});}else openEnvelope();
  });
  $('closeLetter').addEventListener('click',()=>{
    $('letterCard').hidden=true;$('envelopeButton').classList.remove('open');$('envelopeButton').setAttribute('aria-expanded','false');
    $('envelopeHint').textContent='tap the envelope to open it again';isLetterOpen=false;
  });
  const giftButtons=[...document.querySelectorAll('[data-gift]')];
  giftButtons.forEach(button=>button.addEventListener('click',()=>{
    const gift=cfg.gifts[Number(button.dataset.gift)];if(!gift)return;
    $('giftRevealEmoji').textContent=gift.emoji||'💖';$('giftRevealTitle').textContent=gift.title||'A tiny surprise';$('giftRevealText').textContent=gift.text||'';
    $('giftReveal').hidden=false;confetti(28);
    $('giftReveal').scrollIntoView({behavior:reducedMotion?'auto':'smooth',block:'nearest'});
  }));
  $('closeGift').addEventListener('click',()=>{$('giftReveal').hidden=true});

  // Love Arcade / Heart Rush (v2): support touch, mouse and keyboard,
  // and let people start directly by tapping the arcade board.
  const board = $('gameBoard');
  const startButton = $('startGame');
  const boardMessage = $('boardMessage');
  const GAME_LENGTH_MS = 20000;
  const MAX_HEARTS = 6;
  let isGameActive = false;
  let score = 0;
  let gameDeadline = 0;
  let tickTimer = null;
  let spawnTimer = null;
  const bestKey = 'birthday-heart-rush-best-v1';
  let best = 0;
  try { best = Number(localStorage.getItem(bestKey)) || 0; } catch (error) { /* storage may be blocked */ }
  $('gameBest').textContent = String(best);
  const renderScore = () => { $('gameScore').textContent = String(score); };
  const removeHearts = () => board.querySelectorAll('.catch-heart').forEach(heart => heart.remove());

  function catchHeart(heart) {
    if (!isGameActive || !heart.isConnected) return;
    if (Date.now() >= gameDeadline) { endGame(); return; }
    heart.remove();
    score += 1;
    renderScore();
    spawnHeart();
    if (score % 5 === 0) confetti(9);
  }

  function spawnHeart() {
    if (!isGameActive || board.querySelectorAll('.catch-heart').length >= MAX_HEARTS) return;
    // Fixed-size hit targets and padding keep each heart tappable inside the board.
    const hitSize = 56;
    const edge = 12;
    const minY = 56;
    const maxX = Math.max(edge, board.clientWidth - hitSize - edge);
    const maxY = Math.max(minY, board.clientHeight - hitSize - 42);
    const heart = document.createElement('button');
    heart.type = 'button';
    heart.className = 'catch-heart';
    heart.textContent = Math.random() > .45 ? '♥' : '♡';
    heart.setAttribute('aria-label', 'Catch this heart');
    heart.style.left = rand(edge, maxX) + 'px';
    heart.style.top = rand(minY, maxY) + 'px';
    heart.addEventListener('click', (event) => {
      event.stopPropagation();
      catchHeart(heart);
    });
    board.appendChild(heart);
    setTimeout(() => { if (heart.isConnected) heart.remove(); }, 2300);
  }

  function endGame() {
    if (!isGameActive) return;
    isGameActive = false;
    clearInterval(tickTimer);
    clearInterval(spawnTimer);
    tickTimer = null;
    spawnTimer = null;
    removeHearts();
    $('gameTime').textContent = '0s';
    startButton.disabled = false;
    startButton.textContent = 'Play again ♡';
    board.setAttribute('aria-label', 'Love Arcade finished. Tap or press Enter to play again.');
    if (score > best) {
      best = score;
      $('gameBest').textContent = String(best);
      try { localStorage.setItem(bestKey, String(best)); } catch (error) { /* storage may be blocked */ }
    }
    boardMessage.hidden = false;
    boardMessage.querySelector('strong').textContent = score >= 25 ? 'HEART QUEEN! 👑' : score >= 12 ? 'LOVE LEGEND! ✨' : 'cute effort, angel!';
    boardMessage.querySelector('small').textContent = `you caught ${score} hearts! tap to play again ♡`;
    confetti(score >= 12 ? 110 : 48);
    toast(`you caught ${score} hearts! 💖`);
  }

  function startGame() {
    if (isGameActive) return;
    clearInterval(tickTimer);
    clearInterval(spawnTimer);
    score = 0;
    renderScore();
    $('gameTime').textContent = '20s';
    boardMessage.hidden = true;
    removeHearts();
    isGameActive = true;
    gameDeadline = Date.now() + GAME_LENGTH_MS;
    startButton.disabled = true;
    startButton.textContent = 'Catch those hearts! 💓';
    board.setAttribute('aria-label', 'Love Arcade running. Tap the floating hearts to collect points.');
    for (let i = 0; i < 3; i++) spawnHeart();
    tickTimer = setInterval(() => {
      const remaining = Math.max(0, gameDeadline - Date.now());
      $('gameTime').textContent = Math.ceil(remaining / 1000) + 's';
      if (remaining === 0) endGame();
    }, 100);
    spawnTimer = setInterval(() => {
      if (!isGameActive) return;
      if (Date.now() >= gameDeadline) { endGame(); return; }
      if (board.querySelectorAll('.catch-heart').length < MAX_HEARTS) spawnHeart();
    }, 550);
  }

  startButton.addEventListener('click', startGame);
  board.addEventListener('click', (event) => {
    // Also works when the visitor taps the arcade itself rather than the button.
    if (!isGameActive && !event.target.closest('.catch-heart')) startGame();
  });
  board.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target === board && !isGameActive) {
      event.preventDefault();
      startGame();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (isGameActive && Date.now() >= gameDeadline) endGame();
  });

  let lastFocusedElement=null;
  function openModal(){
    lastFocusedElement=document.activeElement;
    $('surpriseModal').hidden=false;document.body.style.overflow='hidden';$('modalClose').focus();confetti(100);
    $('modalMessage').textContent=`${escapeName}, this little corner of the internet exists for one reason: to remind you that you make life sweeter just by being in it. Happy birthday Motu! ♡ Abhi itna asha asha boldiya, aab toh party dedooooo!!!`;
  }
  function closeModal(){
    $('surpriseModal').hidden=true;document.body.style.overflow='';if(lastFocusedElement?.focus)lastFocusedElement.focus();
  }
  $('lastSurprise').addEventListener('click',openModal);
  $('modalClose').addEventListener('click',closeModal);
  $('surpriseModal').addEventListener('click',e=>{if(e.target.dataset.closeModal)closeModal()});
  $('modalMoreHearts').addEventListener('click',()=>{confetti(145);toast('so. much. LOVE. 💗')});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!$('surpriseModal').hidden)closeModal();
    if(e.key==='Tab'&&!$('surpriseModal').hidden){
      const focusables=[...$('surpriseModal').querySelectorAll('button')];
      const index=focusables.indexOf(document.activeElement);
      if(e.shiftKey&&index===0){e.preventDefault();focusables[focusables.length-1].focus()}
      else if(!e.shiftKey&&index===focusables.length-1){e.preventDefault();focusables[0].focus()}
    }
  });
})();
