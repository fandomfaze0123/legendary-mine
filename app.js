// Simple slot machine logic
const symbols = ['🍒','🍋','🍊','🍉','⭐','7️⃣'];

// start with 5 credits (you pay per spin) — wins don't add credits
let credits = 5;

// score system: gain points on matches
let score = 0;
// luck increases chance of matching; starts at 0
let luck = 0;

const reels = [
	document.getElementById('reel0'),
	document.getElementById('reel1'),
	document.getElementById('reel2')
];
const creditsEl = document.getElementById('credits');
const scoreEl = document.getElementById('score');
const messageEl = document.getElementById('message');
const highScoreEl = document.getElementById('highScore');
const lever = document.getElementById('lever');
const tradeBtn = document.getElementById('tradeBtn');
const musicToggle = document.getElementById('musicToggle');
const buyLuckBtn = document.getElementById('buyLuckBtn');
const soundToggle = document.getElementById('soundToggle');
const difficultyEl = document.getElementById('difficulty');
const instructionsBtn = document.getElementById('instructionsBtn');
const instructionsEl = document.getElementById('instructions');
const closeInstructionsBtn = document.getElementById('closeInstructions');
const feedbackBtn = document.getElementById('feedbackBtn');
const feedbackModal = document.getElementById('feedbackModal');
const closeFeedbackBtn = document.getElementById('closeFeedback');
const submitFeedbackBtn = document.getElementById('submitFeedback');
const feedbackText = document.getElementById('feedbackText');
const feedbackList = document.getElementById('feedbackList');
const gameOverEl = document.getElementById('gameOver');
let isGameOver = false;
let spinning = false;
let ytIframe = null;
let ytPlayer = null;
let ytLosePlayer = null;
let ytApiReady = false;
let ytScriptLoading = false;
// sound effects enabled flag (persisted)
let sfxEnabled = true;
try{ const s = localStorage.getItem('sfxEnabled'); if(s !== null) sfxEnabled = s === '1'; }catch(e){}
// difficulty setting (easy/medium/hard/insane)
let difficulty = 'medium';
try{ const d = localStorage.getItem('difficulty'); if(d) difficulty = d; }catch(e){}
// high score (persisted)
let highScore = 0;
try{ const h = localStorage.getItem('highScore'); if(h) highScore = parseInt(h,10) || 0; }catch(e){}
// feedbacks (simple local comment store)
let feedbacks = [];
try{ const f = localStorage.getItem('feedbacks'); if(f) feedbacks = JSON.parse(f) || []; }catch(e){ feedbacks = []; }
// once the player starts playing, lock difficulty until reload
let difficultyLocked = false;

function updateTradeButton(){
	if(!tradeBtn) return;
	// enable only when credits are 0 (or less) and player has enough score
	if(credits <= 0 && score >= 15){
		tradeBtn.disabled = false;
		tradeBtn.title = 'Trade 15 score for 5 credits';
	} else {
		tradeBtn.disabled = true;
	}
}

function updateBuyLuckButton(){
	if(!buyLuckBtn) return;
	// enable when player has at least 50 score
	if(score >= 50){
		buyLuckBtn.disabled = false;
	} else {
		buyLuckBtn.disabled = true;
	}
}

function randSymbol(){
	return symbols[Math.floor(Math.random()*symbols.length)];
}

function setReelSymbol(reelIndex, symbol){
	const symEl = reels[reelIndex].querySelector('.symbol');
	symEl.textContent = symbol;
}

// Play a quick "cha-ching" chime using WebAudio
function playChaChing(){
	try{
		const AudioCtx = window.AudioContext || window.webkitAudioContext;
		if(!AudioCtx) return;
		const ctx = new AudioCtx();
		const now = ctx.currentTime;

		// two oscillators for a bright metallic chime
		const o1 = ctx.createOscillator();
		const o2 = ctx.createOscillator();
		const gain = ctx.createGain();
		const filter = ctx.createBiquadFilter();

		o1.type = 'triangle'; o1.frequency.value = 880;
		o2.type = 'sine'; o2.frequency.value = 1320;

		filter.type = 'highpass';
		filter.frequency.value = 600;

		gain.gain.setValueAtTime(0.0001, now);
		gain.gain.exponentialRampToValueAtTime(0.6, now + 0.01);
		gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

		o1.connect(gain);
		o2.connect(gain);
		gain.connect(filter);
		filter.connect(ctx.destination);

		o1.start(now);
		o2.start(now + 0.005);
		o1.stop(now + 0.9);
		o2.stop(now + 0.9);

		// close context shortly after to free resources
		setTimeout(()=>{ try{ ctx.close(); }catch(e){} }, 1200);
	}catch(e){
		// ignore if audio cannot be created
		console.warn('Audio unavailable', e);
	}
}

// Generic SFX router — gate by sfxEnabled
function playSFX(name){
	if(!sfxEnabled) return;
	if(name === 'cha') return playChaChing();
	if(name === 'lose'){
		// play the lose sound via a dedicated hidden YouTube player
		try{
			if(window.YT && ytLosePlayer){
				try{ ytLosePlayer.seekTo(0); ytLosePlayer.playVideo(); }catch(e){}
				return;
			}
			// create and play once API is ready
			loadYouTubeAPI().then(()=>{
				let container = document.getElementById('ytLose');
				if(!container){
					container = document.createElement('div');
					container.id = 'ytLose';
					container.style.position = 'fixed';
					container.style.left = '-9999px';
					container.style.width = '1px';
					container.style.height = '1px';
					container.style.overflow = 'hidden';
					document.body.appendChild(container);
				}
				ytLosePlayer = new YT.Player(container, {
					height: '1', width: '1', videoId: 'b3FJgIZVW4g',
					playerVars: { autoplay: 0, controls: 0, rel: 0, modestbranding: 1, iv_load_policy: 3 },
					events: {
						onReady: (e)=>{ try{ e.target.playVideo(); }catch(e){} }
					}
				});
			}).catch(()=>{});
		}catch(e){/* ignore */}
		return;
	}
	try{
		const AudioCtx = window.AudioContext || window.webkitAudioContext;
		if(!AudioCtx) return;
		const ctx = new AudioCtx();
		const now = ctx.currentTime;

		const o = ctx.createOscillator();
		const g = ctx.createGain();
		o.type = name === 'gameover' ? 'sine' : 'square';
		// different pitches / durations per event
		if(name === 'trade') o.frequency.value = 880, g.gain.setValueAtTime(0.0001, now), g.gain.exponentialRampToValueAtTime(0.25, now + 0.01), g.gain.exponentialRampToValueAtTime(0.001, now + 0.18), o.start(now), o.stop(now + 0.18);
		else if(name === 'buy') o.frequency.value = 1200, g.gain.setValueAtTime(0.0001, now), g.gain.exponentialRampToValueAtTime(0.35, now + 0.01), g.gain.exponentialRampToValueAtTime(0.001, now + 0.22), o.start(now), o.stop(now + 0.22);
		else if(name === 'gameover') o.frequency.value = 220, g.gain.setValueAtTime(0.0001, now), g.gain.exponentialRampToValueAtTime(0.6, now + 0.02), g.gain.exponentialRampToValueAtTime(0.001, now + 0.9), o.start(now), o.stop(now + 0.9);
		else o.frequency.value = 1000, g.gain.setValueAtTime(0.0001, now), g.gain.exponentialRampToValueAtTime(0.3, now + 0.01), g.gain.exponentialRampToValueAtTime(0.001, now + 0.18), o.start(now), o.stop(now + 0.18);

		o.connect(g); g.connect(ctx.destination);
		setTimeout(()=>{ try{ ctx.close(); }catch(e){} }, 1200);
	}catch(e){console.warn('SFX failed', e)}
}

function spinOnce(){
	if(spinning) return;
	if(isGameOver) return;
	if(credits <= 0){ messageEl.textContent = 'No credits — press R to refresh.'; updateTradeButton(); checkGameOver(); return; }

	spinning = true;
	credits -= 1; // cost per spin
	creditsEl.textContent = credits;
	messageEl.textContent = 'Spinning...';

		// lock the difficulty once the first spin happens
		if(!difficultyLocked){
			difficultyLocked = true;
			try{ if(difficultyEl) { difficultyEl.disabled = true; difficultyEl.title = 'Restart the page to change difficulty'; difficultyEl.classList.add('locked'); } }catch(e){}
		}

	// update trade availability after spending a credit
	updateTradeButton();

	// prepare luck bias for this spin: pick a favored symbol and compute probability
	const FAV_BASE = 0.12; // base chance any reel will match favored
	const PER_LUCK = 0.08; // per luck level increase
	// difficulty multiplier reduces/increases match probability
	const DIFFICULTY_MOD = { easy: 1.3, medium: 1.0, hard: 0.7, insane: 0.45 };
	const favoredSymbol = randSymbol();
	const baseProb = Math.min(0.95, FAV_BASE + PER_LUCK * luck);
	const diffMod = DIFFICULTY_MOD[difficulty] || 1.0;
	const matchProb = Math.min(0.95, baseProb * diffMod);

	// quick randomizing intervals per reel
	const intervals = [];
	for(let i=0;i<3;i++){
		intervals[i] = setInterval(()=>{
			setReelSymbol(i, randSymbol());
		}, 80 + i*20);
	}

	// stop each reel with a staggered timeout
	const stopTimes = [900, 1400, 1900];
	const finalSymbols = [];

	stopTimes.forEach((t, i) => {
		setTimeout(()=>{
			clearInterval(intervals[i]);
			// pick final (biased towards favoredSymbol based on luck)
			finalSymbols[i] = (Math.random() < matchProb) ? favoredSymbol : randSymbol();
			setReelSymbol(i, finalSymbols[i]);
			// small pop animation
			const symEl = reels[i].querySelector('.symbol');
			symEl.style.transform = 'scale(1.12)';
			setTimeout(()=> symEl.style.transform = 'scale(1)', 220);

			// when last reel stops, evaluate
			if(i===2){
				setTimeout(()=>{
					evaluate(finalSymbols);
					spinning = false;
				}, 260);
			}
		}, t);
	});
}

function evaluate(finalSymbols){
	const [a,b,c] = finalSymbols;
	if(!a || !b || !c){ messageEl.textContent = 'Try again'; return; }

	// Score reward: 15 points for any two- or three-match
	const MATCH_SCORE = 15;

	if(a===b && b===c){
		// three match
		score += MATCH_SCORE;
		scoreEl.textContent = score;
		// update high score if needed
		try{ if(score > highScore){ highScore = score; if(highScoreEl) highScoreEl.textContent = highScore; localStorage.setItem('highScore', String(highScore)); } }catch(e){}
		// buying availability might change
		updateBuyLuckButton();
		messageEl.textContent = `Jackpot! +${MATCH_SCORE} score.`;
		reels.forEach(r => r.classList.add('win'));
		setTimeout(()=> reels.forEach(r => r.classList.remove('win')), 1200);
	} else if (a===b || b===c || a===c){
		// two match
		score += MATCH_SCORE;
		scoreEl.textContent = score;
		// update high score if needed
		try{ if(score > highScore){ highScore = score; if(highScoreEl) highScoreEl.textContent = highScore; localStorage.setItem('highScore', String(highScore)); } }catch(e){}
		updateBuyLuckButton();
		messageEl.textContent = `Nice! Two match — +${MATCH_SCORE} score.`;
		reels.forEach(r => r.classList.remove('win'));
		setTimeout(()=>{
			if(a===b) { reels[0].classList.add('win'); reels[1].classList.add('win'); }
			else if(b===c) { reels[1].classList.add('win'); reels[2].classList.add('win'); }
			else { reels[0].classList.add('win'); reels[2].classList.add('win'); }
			setTimeout(()=> reels.forEach(r => r.classList.remove('win')), 1200);
		}, 50);
	} else {
		messageEl.textContent = 'No match — try again.';
		// play lose SFX (YouTube clip)
		playSFX('lose');
	}

	// If player has run out of credits after this spin, prompt them to refresh with R
	if (credits <= 0) {
		messageEl.textContent = 'No credits — press R to refresh.';
		// after credits reached zero, allow trading if score sufficient
		updateTradeButton();
		checkGameOver();
	}
}

function showGameOver(){
  isGameOver = true;
  if(gameOverEl){
    gameOverEl.setAttribute('aria-hidden','false');
  }
  // disable controls
  if(tradeBtn) tradeBtn.disabled = true;
  messageEl.textContent = 'Game Over — press R to restart.';
	playSFX('gameover');
}

function checkGameOver(){
  if(credits <= 0 && score <= 0){
    showGameOver();
  }
}

lever.addEventListener('click', ()=>{
	// fun lever animation + sound
	playSFX('cha');
	lever.animate([
		{ transform: 'rotate(0deg)' },
		{ transform: 'rotate(20deg)' },
		{ transform: 'rotate(0deg)' }
	], { duration: 350, easing: 'ease-out' });
	spinOnce();
});

// allow spacebar to spin and R to refresh
window.addEventListener('keydown', (e)=>{
	if(e.code === 'Space'){
		e.preventDefault();
		lever.click();
	} else if (e.key === 'r' || e.key === 'R' || e.code === 'KeyR') {
		// reload the page to reset the credits (simple refresh)
		location.reload();
	}
});

// initialize symbols
for(let i=0;i<3;i++) setReelSymbol(i, randSymbol());
creditsEl.textContent = credits;
scoreEl.textContent = score;
const luckEl = document.getElementById('luck');
if(luckEl) luckEl.textContent = luck;
// initialize high score display
if(highScoreEl) highScoreEl.textContent = highScore;

// trade button handler: spend 15 score for 5 credits
if (tradeBtn) {
	tradeBtn.addEventListener('click', ()=>{
		if(credits > 0) return; // only trade when out of credits
		if(score < 15) {
			messageEl.textContent = 'Not enough score to trade.';
			updateTradeButton();
			return;
		}
		score -= 15;
		credits += 5;
		scoreEl.textContent = score;
		creditsEl.textContent = credits;
		messageEl.textContent = 'Traded 15 score for 5 credits! Good luck.';
		updateTradeButton();
		updateBuyLuckButton();
		playSFX('trade');
	});
}

// buy luck handler: spend 50 score for +1 luck
if (buyLuckBtn){
	buyLuckBtn.addEventListener('click', ()=>{
		if(score < 50){
			messageEl.textContent = 'Not enough score to buy luck.';
			updateBuyLuckButton();
			return;
		}
		score -= 50;
		luck += 1;
		scoreEl.textContent = score;
		const luckEl = document.getElementById('luck');
		if(luckEl) luckEl.textContent = luck;
		messageEl.textContent = `Purchased +1 luck! Luck is now ${luck}.`;
		updateBuyLuckButton();
		updateTradeButton();
		playSFX('buy');
	});
}

// ensure trade button initial state
updateTradeButton();
// ensure buy luck button initial state
updateBuyLuckButton();

// music toggle using YouTube IFrame Player API for reliable play/pause
function loadYouTubeAPI(){
	return new Promise((resolve)=>{
		if(ytApiReady) return resolve();
		if(ytScriptLoading){
			// poll until ready
			const t = setInterval(()=>{ if(ytApiReady){ clearInterval(t); resolve(); } }, 100);
			return;
		}
		ytScriptLoading = true;
		const tag = document.createElement('script');
		tag.src = 'https://www.youtube.com/iframe_api';
		document.head.appendChild(tag);
		// YouTube API will call this global when ready
		window.onYouTubeIframeAPIReady = function(){ ytApiReady = true; resolve(); };
	});
}

function createHiddenPlayer(){
	// create a hidden container for the player
	let container = document.getElementById('ytHidden');
	if(!container){
		container = document.createElement('div');
		container.id = 'ytHidden';
		container.style.position = 'fixed';
		container.style.left = '-9999px';
		container.style.width = '1px';
		container.style.height = '1px';
		container.style.overflow = 'hidden';
		document.body.appendChild(container);
	}
	// create the player
	ytPlayer = new YT.Player(container, {
		height: '1',
		width: '1',
		videoId: 'byGNyKgjIrc',
		playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, iv_load_policy: 3 },
		events: {
			onReady: (e)=>{
				// attempt to play
				try{ e.target.playVideo(); }catch(e){}
			}
		}
	});
}

async function toggleMusic(){
	if(!ytPlayer){
		await loadYouTubeAPI();
		createHiddenPlayer();
		musicToggle.classList.add('playing');
		musicToggle.setAttribute('aria-pressed','true');
		musicToggle.textContent = 'Music: On';
		return;
	}
	const state = ytPlayer.getPlayerState();
	// 1 = playing, 2 = paused
	if(state === YT.PlayerState.PLAYING){
		ytPlayer.pauseVideo();
		musicToggle.classList.remove('playing');
		musicToggle.setAttribute('aria-pressed','false');
		musicToggle.textContent = 'Music: Off';
	} else {
		ytPlayer.playVideo();
		musicToggle.classList.add('playing');
		musicToggle.setAttribute('aria-pressed','true');
		musicToggle.textContent = 'Music: On';
	}
}

if(musicToggle){
	musicToggle.addEventListener('click', ()=>{ toggleMusic().catch(()=>{}); });
}

// sound toggle wiring and initial state
if(soundToggle){
	// reflect current state in UI
	if(!sfxEnabled){ soundToggle.classList.add('off'); soundToggle.setAttribute('aria-pressed','false'); soundToggle.textContent = 'SFX: Off'; }
	soundToggle.addEventListener('click', ()=>{
		sfxEnabled = !sfxEnabled;
		try{ localStorage.setItem('sfxEnabled', sfxEnabled ? '1' : '0'); }catch(e){}
		if(sfxEnabled){ soundToggle.classList.remove('off'); soundToggle.setAttribute('aria-pressed','true'); soundToggle.textContent = 'SFX: On'; }
		else { soundToggle.classList.add('off'); soundToggle.setAttribute('aria-pressed','false'); soundToggle.textContent = 'SFX: Off'; }
	});
}

// wire difficulty selector (persisted)
if(difficultyEl){
	// set initial UI value
	try{ difficultyEl.value = difficulty; }catch(e){}
	difficultyEl.addEventListener('change', ()=>{
		difficulty = difficultyEl.value || 'medium';
		try{ localStorage.setItem('difficulty', difficulty); }catch(e){}
		messageEl.textContent = `Difficulty set to ${difficulty}.`;
	});
}

// Instructions button/modal behavior
if(instructionsBtn && instructionsEl){
	instructionsBtn.addEventListener('click', ()=>{
		try{ instructionsEl.setAttribute('aria-hidden','false'); }catch(e){}
	});
	// close button inside modal
	if(closeInstructionsBtn){
		closeInstructionsBtn.addEventListener('click', ()=>{
			try{ instructionsEl.setAttribute('aria-hidden','true'); }catch(e){}
		});
	}
	// allow closing with Escape and clicking the overlay background
	instructionsEl.addEventListener('click', (ev)=>{
		if(ev.target === instructionsEl){ instructionsEl.setAttribute('aria-hidden','true'); }
	});
	window.addEventListener('keydown', (ev)=>{
		if((ev.key === 'Escape' || ev.key === 'Esc') && instructionsEl.getAttribute('aria-hidden') === 'false'){
			instructionsEl.setAttribute('aria-hidden','true');
		}
	});
}

// Feedback modal and handling
function renderFeedbacks(){
	if(!feedbackList) return;
	feedbackList.innerHTML = '';
	if(feedbacks.length === 0){ feedbackList.textContent = 'No feedback yet — be the first!'; return; }
	// show newest first
	const items = feedbacks.slice().reverse();
	for(const fb of items){
		const d = document.createElement('div');
		d.className = 'feedback-item';
		const ts = new Date(fb.ts).toLocaleString();
		d.innerHTML = `<div class="feedback-text">${escapeHtml(fb.text)}</div><div class="feedback-meta">${ts}</div>`;
		feedbackList.appendChild(d);
	}
}

function escapeHtml(s){
	return String(s).replace(/[&<>\"]/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

if(feedbackBtn && feedbackModal){
	feedbackBtn.addEventListener('click', ()=>{ try{ feedbackModal.setAttribute('aria-hidden','false'); if(feedbackText) feedbackText.focus(); }catch(e){} });
	if(closeFeedbackBtn) closeFeedbackBtn.addEventListener('click', ()=>{ try{ feedbackModal.setAttribute('aria-hidden','true'); }catch(e){} });
	if(feedbackModal){
		feedbackModal.addEventListener('click', (ev)=>{ if(ev.target === feedbackModal) feedbackModal.setAttribute('aria-hidden','true'); });
	}
	// submit handler
	if(submitFeedbackBtn && feedbackText){
		submitFeedbackBtn.addEventListener('click', ()=>{
			const text = (feedbackText.value || '').trim();
			if(!text) { messageEl.textContent = 'Please enter feedback before submitting.'; return; }
			const entry = { text, ts: Date.now() };
			feedbacks.push(entry);
			try{ localStorage.setItem('feedbacks', JSON.stringify(feedbacks)); }catch(e){}
			renderFeedbacks();
			try{ feedbackText.value = ''; feedbackModal.setAttribute('aria-hidden','true'); messageEl.textContent = 'Thanks for your feedback!'; }catch(e){}
		});
	}
	// allow Escape to close
	window.addEventListener('keydown', (ev)=>{ if((ev.key === 'Escape' || ev.key === 'Esc') && feedbackModal.getAttribute('aria-hidden') === 'false'){ feedbackModal.setAttribute('aria-hidden','true'); } });
}

// render existing feedbacks initially
renderFeedbacks();

