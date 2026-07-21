/* ============================================================
   NIGHTSTATION ENGINE — Core JavaScript
   ============================================================ */

// ---- CHANNEL REGISTRY ----
// Channels that block iframe embedding (X-Frame-Options: SAMEORIGIN)
// must be loaded via Flutter WebView URL swap (native navigation).
const CHANNEL_REGISTRY = {
    ns:       { name: 'NIGHTSTATION', num: '001', type: 'native' },
    retro50:  { name: '50s TV',       num: '002', type: 'webview', url: 'https://50s.myretrotvs.com/' },
    retro60:  { name: '60s TV',       num: '003', type: 'webview', url: 'https://60s.myretrotvs.com/' },
    retro70:  { name: '70s TV',       num: '004', type: 'webview', url: 'https://70s.myretrotvs.com/' },
    retro80:  { name: '80s TV',       num: '005', type: 'webview', url: 'https://80s.myretrotvs.com/' },
    retro90:  { name: '90s TV',       num: '006', type: 'webview', url: 'https://90s.myretrotvs.com/' },
    retro00:  { name: '2000s TV',     num: '007', type: 'webview', url: 'https://00s.myretrotvs.com/' },
    chill:    { name: 'CHILLHOP',     num: '008', type: 'webview', url: 'https://www.youtube.com/embed/videoseries?list=PLt7bG0K25iXjjrfjMxkI6ClvebydMpT4b&autoplay=1&controls=0' },
    twitch:   { name: 'FARWALKER LIVE', num: '009', type: 'iframe', url: 'https://player.twitch.tv/?channel=farwalker3&parent=tv.kodair.us&autoplay=true' },
    ytfar:    { name: 'FARWALKER TV',   num: '010', type: 'webview', url: 'https://www.youtube.com/embed/videoseries?list=UUmGuFTo3xeeGQ9lOpaa5Qjg&autoplay=1&controls=0' },
};

// ---- STATE ----
const NS = {
    catalog: [],
    schedule: [],
    overrides: [],
    currentChannel: 'ns',
    currentIndex: 0,
    ytPlayer: null,
    ytReady: false,
    epgVisible: false,
    epgFocusIndex: 0,
    infoBarTimer: null,
    weatherData: null,
    dusk: null,
    dawn: null,
    isOnAir: false,
    recentlyPlayed: JSON.parse(localStorage.getItem('ns_recent') || '[]'),
    channels: Object.keys(CHANNEL_REGISTRY),
};

// ---- CSV PARSER ----
function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        const vals = [];
        let cur = '', inQuote = false;
        for (const ch of line) {
            if (ch === '"') { inQuote = !inQuote; }
            else if (ch === ',' && !inQuote) { vals.push(cur.trim()); cur = ''; }
            else { cur += ch; }
        }
        vals.push(cur.trim());
        const obj = {};
        headers.forEach((h, i) => obj[h] = vals[i] || '');
        return obj;
    });
}

// ---- DATA LOADING ----
async function loadCSV(url) {
    try {
        const res = await fetch(url + '?t=' + Date.now());
        if (!res.ok) return [];
        return parseCSV(await res.text());
    } catch (e) { console.warn('CSV load failed:', url, e); return []; }
}

async function loadAllData() {
    const [catalog, overrides] = await Promise.all([
        loadCSV('data/content_catalog.csv'),
        loadCSV('data/schedule_overrides.csv'),
    ]);
    NS.catalog = catalog;
    NS.overrides = overrides;
    console.log(`Loaded: ${catalog.length} catalog, ${overrides.length} overrides`);
}

// ---- DUSK / DAWN ----
async function fetchDuskDawn(lat, lng) {
    try {
        const res = await fetch(`https://api.sunrisesunset.io/json?lat=${lat}&lng=${lng}`);
        const data = await res.json();
        if (data.status === 'OK') {
            NS.dusk = parseTimeStr(data.results.dusk);
            NS.dawn = parseTimeStr(data.results.dawn);
            console.log('Dusk:', NS.dusk, 'Dawn:', NS.dawn);
        }
    } catch (e) {
        console.warn('Dusk/dawn API failed, using defaults');
        NS.dusk = new Date(); NS.dusk.setHours(20, 0, 0);
        NS.dawn = new Date(); NS.dawn.setHours(6, 0, 0);
    }
}

function parseTimeStr(str) {
    const parts = str.match(/(\d+):(\d+):(\d+)\s*(AM|PM)/i);
    if (!parts) return null;
    let h = parseInt(parts[1]), m = parseInt(parts[2]);
    if (parts[4].toUpperCase() === 'PM' && h !== 12) h += 12;
    if (parts[4].toUpperCase() === 'AM' && h === 12) h = 0;
    const d = new Date(); d.setHours(h, m, 0, 0);
    return d;
}

function checkOnAir() {
    if (!NS.dusk || !NS.dawn) return true;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const duskMin = NS.dusk.getHours() * 60 + NS.dusk.getMinutes();
    const dawnMin = NS.dawn.getHours() * 60 + NS.dawn.getMinutes();
    if (duskMin > dawnMin) {
        return nowMin >= duskMin || nowMin < dawnMin;
    }
    return nowMin >= duskMin && nowMin < dawnMin;
}

// ---- WEATHER ----
async function fetchWeather(lat, lng) {
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`);
        const data = await res.json();
        NS.weatherData = {
            temp: Math.round(data.current.temperature_2m),
            code: data.current.weather_code,
        };
        updateWeatherUI();
    } catch (e) { console.warn('Weather failed:', e); }
}

function weatherIcon(code) {
    if (code <= 1) return '🌙';
    if (code <= 3) return '☁️';
    if (code <= 48) return '🌫️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '❄️';
    if (code <= 82) return '🌧️';
    if (code <= 86) return '❄️';
    return '⛈️';
}

function updateWeatherUI() {
    if (!NS.weatherData) return;
    const icon = weatherIcon(NS.weatherData.code);
    const temp = NS.weatherData.temp + '°F';
    document.getElementById('weather-icon').textContent = icon;
    document.getElementById('weather-temp').textContent = temp;
    document.getElementById('info-weather-icon').textContent = icon;
    document.getElementById('info-weather-temp').textContent = temp;
}

// ---- SCHEDULE ENGINE ----
function buildSchedule() {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const todayOverrides = NS.overrides.filter(o => o.date === today || o.date === '*');
    const timeline = [];
    const duskH = NS.dusk ? NS.dusk.getHours() : 20;

    todayOverrides.forEach(o => {
        if (o.content_id && o.time) {
            const item = NS.catalog.find(c => c.id === o.content_id);
            if (item) {
                const [h, m] = o.time.split(':').map(Number);
                const startTime = new Date(now);
                startTime.setHours(h, m, 0, 0);
                timeline.push({
                    time: o.time,
                    startTime: startTime,
                    item: item,
                    block: o.block_name || '',
                    isOverride: true,
                });
            }
        }
    });

    if (timeline.length === 0 && NS.catalog.length > 0) {
        let startTime = NS.dusk || new Date();
        if (!NS.dusk) startTime.setHours(20, 0, 0, 0);
        
        let currentTime = new Date(startTime);
        for (let i = 0; i < 20; i++) {
            const item = NS.catalog[i % NS.catalog.length];
            const timeStr = currentTime.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
            timeline.push({
                time: timeStr,
                startTime: new Date(currentTime),
                item: item,
                block: '',
                isOverride: false,
            });
            const dur = parseFloat(item.duration_min || 30);
            currentTime.setMinutes(currentTime.getMinutes() + dur);
        }
    }

    timeline.sort((a, b) => a.startTime - b.startTime);
    NS.schedule = timeline;
    
    // Find what's playing now
    const nowTs = now.getTime();
    let currentIdx = 0;
    for (let i = 0; i < NS.schedule.length; i++) {
        if (NS.schedule[i].startTime.getTime() <= nowTs) {
            currentIdx = i;
        } else {
            break;
        }
    }
    NS.currentIndex = currentIdx;
    
    renderSchedule();
}

function renderSchedule() {
    const list = document.getElementById('schedule-list');
    if (!list) return;

    list.innerHTML = NS.schedule.map((s, i) => {
        const isNow = i === NS.currentIndex;
        const dur = (s.item && s.item.duration_min) ? Math.round(parseFloat(s.item.duration_min)) + 'min' : '';
        return `<div class="schedule-item ${isNow ? 'now-playing' : ''}" data-idx="${i}">
            <span class="sched-time">${s.time}</span>
            <span class="sched-title">${(s.item && s.item.title) || 'TBD'}</span>
            <span class="sched-type">${(s.item && s.item.content_type || '').replace('_',' ')}</span>
            <span class="sched-dur">${dur}</span>
        </div>`;
    }).join('');
    
    const activeItem = list.querySelector('.now-playing');
    if (activeItem) activeItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// ---- PLAYER ENGINE ----
function showPlayer(type) {
    document.getElementById('youtube-player-wrap').style.display = type === 'youtube' ? 'block' : 'none';
    document.getElementById('mp4-player').style.display = type === 'mp4' ? 'block' : 'none';
    document.getElementById('iframe-player').style.display = type === 'iframe' ? 'block' : 'none';
}

function playYouTube(videoId) {
    showPlayer('youtube');
    if (NS.ytPlayer && NS.ytReady) {
        NS.ytPlayer.loadVideoById(videoId);
    } else {
        NS._pendingVideoId = videoId;
    }
}

function playMP4(url) {
    showPlayer('mp4');
    const vid = document.getElementById('mp4-player');
    vid.src = url;
    vid.play().catch(e => console.warn('MP4 play failed:', e));
    vid.onended = () => playNext();
}

function playIframe(url) {
    showPlayer('iframe');
    document.getElementById('iframe-player').src = url;
}

function playContent(item) {
    if (!item || !item.source_id) return;
    const type = (item.source_type || 'youtube').toLowerCase();
    if (type === 'youtube') {
        playYouTube(item.source_id);
    } else if (type === 'mp4') {
        playMP4(item.source_id);
    } else if (type === 'vimeo') {
        playIframe(`https://player.vimeo.com/video/${item.source_id}?autoplay=1`);
    } else if (type === 'iframe') {
        playIframe(item.source_id);
    }

    document.getElementById('info-now').textContent = item.title || 'Now Playing';
    const nextItem = NS.schedule[NS.currentIndex + 1];
    document.getElementById('info-next').textContent =
        nextItem ? `UP NEXT: ${nextItem.item.title}` : 'UP NEXT: --';

    if (item.id && !NS.recentlyPlayed.includes(item.id)) {
        NS.recentlyPlayed.push(item.id);
        if (NS.recentlyPlayed.length > 100) NS.recentlyPlayed.shift();
        localStorage.setItem('ns_recent', JSON.stringify(NS.recentlyPlayed));
    }
}

function playNext() {
    if (NS.currentChannel !== 'ns') return;
    NS.currentIndex++;
    if (NS.currentIndex >= NS.schedule.length) NS.currentIndex = 0;
    const entry = NS.schedule[NS.currentIndex];
    if (entry) {
        playContent(entry.item);
        renderSchedule();
    }
}

// ---- FLUTTER BRIDGE ----
function requestNativeNavigation(url) {
    console.log('Requesting native navigation to:', url);
    localStorage.setItem('ns_lastChannel', NS.currentChannel);
    if (window.NightstationBridge) {
        window.NightstationBridge.postMessage(JSON.stringify({
            action: 'navigate',
            url: url,
            channel: NS.currentChannel,
        }));
    } else {
        window.open(url, '_blank');
    }
}

// ---- CHANNEL SWITCHING ----
function switchChannel(ch) {
    const reg = CHANNEL_REGISTRY[ch];
    if (!reg) return;

    NS.currentChannel = ch;
    document.querySelectorAll('.epg-channel').forEach(el => {
        el.classList.toggle('active', el.dataset.ch === ch);
    });
    document.getElementById('off-air-screen').classList.add('hidden');

    if (reg.type === 'webview') {
        requestNativeNavigation(reg.url);
        return;
    }

    if (ch === 'ns') {
        if (NS.isOnAir && NS.schedule.length > 0) {
            const entry = NS.schedule[NS.currentIndex];
            if (entry) playContent(entry.item);
        } else {
            document.getElementById('off-air-screen').classList.remove('hidden');
            stopAllPlayers();
        }
    } else if (reg.type === 'youtube') {
        playYouTube(reg.videoId);
        document.getElementById('info-now').textContent = reg.name;
        document.getElementById('info-next').textContent = '24/7 streaming';
    }
}

function stopAllPlayers() {
    showPlayer('none');
    if (NS.ytPlayer && NS.ytReady) {
        try { NS.ytPlayer.stopVideo(); } catch(e) {}
    }
    const mp4 = document.getElementById('mp4-player');
    if (mp4) { try { mp4.pause(); } catch(e) {} }
    document.getElementById('iframe-player').src = '';
}

function channelUp() {
    const idx = NS.channels.indexOf(NS.currentChannel);
    const next = NS.channels[(idx + 1) % NS.channels.length];
    switchChannel(next);
}

function channelDown() {
    const idx = NS.channels.indexOf(NS.currentChannel);
    const prev = NS.channels[(idx - 1 + NS.channels.length) % NS.channels.length];
    switchChannel(prev);
}

// ---- EPG GUIDE ----
function toggleEPG() {
    NS.epgVisible = !NS.epgVisible;
    document.getElementById('epg-overlay').classList.toggle('hidden', !NS.epgVisible);
    if (NS.epgVisible) {
        NS.epgFocusIndex = NS.channels.indexOf(NS.currentChannel);
        if (NS.epgFocusIndex < 0) NS.epgFocusIndex = 0;
        updateEPGFocus();
        renderSchedule();
    }
}

function updateEPGFocus() {
    document.querySelectorAll('.epg-channel').forEach((el, i) => {
        el.classList.toggle('focused', i === NS.epgFocusIndex);
    });
}

// ---- INFO BAR ----
function showInfoBar() {
    const bar = document.getElementById('info-bar');
    bar.classList.remove('dim');
    clearTimeout(NS.infoBarTimer);
    NS.infoBarTimer = setTimeout(() => bar.classList.add('dim'), 5000);
}

function updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const date = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    document.getElementById('info-time').textContent = time;
    document.getElementById('epg-time').textContent = time;
    document.getElementById('epg-date').textContent = date.toUpperCase();

    const onAirText = NS.isOnAir ? '🟢 ON AIR' : '🔴 OFF AIR';
    const weatherText = NS.weatherData ? `${NS.weatherData.temp}°F` : '';
    const chName = CHANNEL_REGISTRY[NS.currentChannel]?.name || '';
    document.getElementById('epg-ticker').textContent =
        `★ NIGHTSTATION ★ ${date.toUpperCase()} ★ ${time} ★ ${onAirText} ★ ${weatherText} ★ PRESS SELECT FOR GUIDE ★ ▲▼ CHANNELS ★ ${chName} ★`;
        
    // Check if we need to switch content based on time
    if (NS.currentChannel === 'ns' && NS.isOnAir && NS.schedule.length > 0) {
        const nextEntry = NS.schedule[NS.currentIndex + 1];
        if (nextEntry && now >= nextEntry.startTime) {
            playNext();
        }
    }
}

// ---- KEYBOARD / REMOTE CONTROLS ----
document.addEventListener('keydown', (e) => {
    showInfoBar();

    if (NS.epgVisible) {
        if (e.key === 'ArrowUp') {
            NS.epgFocusIndex = Math.max(0, NS.epgFocusIndex - 1);
            updateEPGFocus();
            e.preventDefault();
        } else if (e.key === 'ArrowDown') {
            NS.epgFocusIndex = Math.min(NS.channels.length - 1, NS.epgFocusIndex + 1);
            updateEPGFocus();
            e.preventDefault();
        } else if (e.key === 'Enter' || e.key === ' ') {
            switchChannel(NS.channels[NS.epgFocusIndex]);
            toggleEPG();
            e.preventDefault();
        } else if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'g' || e.key === 'G') {
            toggleEPG();
            e.preventDefault();
        }
        return;
    }

    switch (e.key) {
        case 'g': case 'G': case 'Enter':
            toggleEPG(); e.preventDefault(); break;
        case 'ArrowUp':
        case 'ArrowRight':
            channelUp(); e.preventDefault(); break;
        case 'ArrowDown':
        case 'ArrowLeft':
            channelDown(); e.preventDefault(); break;
        case 'm': case 'M':
            if (NS.ytPlayer && NS.ytReady) {
                NS.ytPlayer.isMuted() ? NS.ytPlayer.unMute() : NS.ytPlayer.mute();
            }
            e.preventDefault();
            break;
    }
});

function bindEpgClicks() {
    document.querySelectorAll('.epg-channel').forEach(el => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => { switchChannel(el.dataset.ch); if (NS.epgVisible) toggleEPG(); });
    });
}
if (document.readyState !== 'loading') bindEpgClicks();
else document.addEventListener('DOMContentLoaded', bindEpgClicks);

// ---- YOUTUBE API CALLBACK ----
function onYouTubeIframeAPIReady() {
    NS.ytPlayer = new YT.Player('yt-player', {
        width: '100%',
        height: '100%',
        playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            rel: 0,
            iv_load_policy: 3,
            playsinline: 1,
        },
        events: {
            onReady: () => {
                NS.ytReady = true;
                console.log('YouTube player ready');
                if (NS._pendingVideoId) {
                    NS.ytPlayer.loadVideoById(NS._pendingVideoId);
                    NS._pendingVideoId = null;
                }
            },
            onStateChange: (event) => {
                if (event.data === YT.PlayerState.ENDED) {
                    playNext();
                }
            },
            onError: (event) => {
                console.warn('YT error:', event.data);
                if (NS.currentChannel === 'chill') {
                    console.log('Retrying Chillhop via iframe embed');
                    playIframe('https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1&controls=0&rel=0');
                } else {
                    setTimeout(playNext, 2000);
                }
            }
        }
    });
}

// ---- GEOLOCATION ----
function getLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve({ lat: 39.8283, lng: -98.5795 });
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve({ lat: 39.8283, lng: -98.5795 }),
            { timeout: 5000 }
        );
    });
}

// ---- INIT ----
async function init() {
    console.log('Nightstation initializing...');

    await loadAllData();

    const loc = await getLocation();
    await Promise.all([
        fetchDuskDawn(loc.lat, loc.lng),
        fetchWeather(loc.lat, loc.lng),
    ]);

    NS.isOnAir = checkOnAir();
    console.log('On air:', NS.isOnAir);

    buildSchedule();
    updateClock();
    setInterval(updateClock, 1000);
    setInterval(() => fetchWeather(loc.lat, loc.lng), 15 * 60 * 1000);

    setInterval(() => {
        const wasOnAir = NS.isOnAir;
        NS.isOnAir = checkOnAir();
        if (wasOnAir !== NS.isOnAir) {
            console.log('On-air status changed:', NS.isOnAir);
            if (NS.currentChannel === 'ns') {
                switchChannel('ns');
            }
        }
    }, 60 * 1000);

    setTimeout(() => {
        document.getElementById('loading-screen').classList.add('hidden');
        const returnCh = localStorage.getItem('ns_returnFromChannel');
        if (returnCh) {
            localStorage.removeItem('ns_returnFromChannel');
            NS.currentChannel = 'ns';
        }
        if (NS.currentChannel === 'ns') {
            if (NS.isOnAir && NS.schedule.length > 0) {
                playContent(NS.schedule[NS.currentIndex].item);
            } else {
                document.getElementById('off-air-screen').classList.remove('hidden');
                stopAllPlayers();
            }
        }
        showInfoBar();
    }, 2000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
