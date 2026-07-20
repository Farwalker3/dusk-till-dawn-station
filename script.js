const playlist = [
    {
        title: "The Skeleton Dance (1929)",
        url: "https://archive.org/download/the-skeleton-dance_1929/The%20Skeleton%20Dance%20%281929%29.mp4",
        duration: 353 // 5:53
    },
    {
        title: "Steamboat Willie (1928)",
        url: "https://archive.org/download/schoolproject2_20200406/1928%20-%20Mickey%20Mouse%20-%20Steamboat%20Willie.mp4",
        duration: 462 // 7:42
    },
    {
        title: "The Haunted House (1929)",
        url: "https://archive.org/download/disneyanimatedshorts/Disney%20Animated%20Shorts%20-%20The%20Haunted%20House%20%281929%29.mp4",
        duration: 400 // approx 6:40
    },
    {
        title: "The Fox Chase (1928)",
        url: "https://archive.org/download/WDKODHSWD/01%20012%20The%20Fox%20Chase%20%281928%29.mp4",
        duration: 315 // approx 5:15
    },
    {
        title: "Fox Pop (1942)",
        url: "https://archive.org/download/donald-mickey-pantry-panic/Fox%20Pop%20%281942%29.mp4",
        duration: 480 // approx 8:00
    }
];

const totalDuration = playlist.reduce((acc, video) => acc + video.duration, 0);

const videoElement = document.getElementById('broadcast-video');
const offAirElement = document.getElementById('off-air');
const powerLed = document.getElementById('power-led');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const tvFrame = document.getElementById('main-tv-frame');

// New Bumper Elements
const bumperOverlay = document.getElementById('bumper-overlay');
const nextTitleEl = document.getElementById('next-title');
const afterTitleEl = document.getElementById('after-title');

function isOnAir() {
    const now = new Date();
    const hours = now.getHours();
    return hours >= 18 || hours < 6;
}

function updateStation() {
    const active = isOnAir();
    
    if (active) {
        offAirElement.classList.add('hidden');
        videoElement.classList.remove('hidden');
        powerLed.classList.add('on');
        syncVideo();
    } else {
        offAirElement.classList.remove('hidden');
        videoElement.classList.add('hidden');
        powerLed.classList.remove('on');
        bumperOverlay.classList.add('hidden');
        videoElement.pause();
    }
}

function syncVideo() {
    const nowUnix = Math.floor(Date.now() / 1000);
    const timeInCycle = nowUnix % totalDuration;
    
    let elapsedTime = 0;
    let currentVideo = null;
    let currentIndex = -1;
    let seekTime = 0;
    
    for (let i = 0; i < playlist.length; i++) {
        const video = playlist[i];
        if (timeInCycle < elapsedTime + video.duration) {
            currentVideo = video;
            currentIndex = i;
            seekTime = timeInCycle - elapsedTime;
            break;
        }
        elapsedTime += video.duration;
    }
    
    if (currentVideo) {
        // Handle Bumper Logic
        const remainingTime = currentVideo.duration - seekTime;
        // Show bumper for the last 15 seconds
        if (remainingTime <= 15) {
            const nextIndex = (currentIndex + 1) % playlist.length;
            const afterIndex = (currentIndex + 2) % playlist.length;
            
            nextTitleEl.innerText = playlist[nextIndex].title;
            afterTitleEl.innerText = playlist[afterIndex].title;
            bumperOverlay.classList.remove('hidden');
        } else {
            bumperOverlay.classList.add('hidden');
        }

        const currentSrc = videoElement.getAttribute('src');
        if (currentSrc !== currentVideo.url) {
            videoElement.src = currentVideo.url;
            videoElement.load();
            videoElement.currentTime = seekTime;
            
            // Critical fix: force unmute and attempt play
            videoElement.muted = true; // Start muted to guarantee autoplay
            videoElement.play().then(() => {
                console.log("Autoplay started muted.");
                // Provide a UI hint or wait for first click to unmute
                const unmuteOnFirstClick = () => {
                    videoElement.muted = false;
                    document.removeEventListener('click', unmuteOnFirstClick);
                    console.log("Audio unmuted via user interaction.");
                };
                document.addEventListener('click', unmuteOnFirstClick);
            }).catch(e => {
                console.log("Autoplay blocked even when muted:", e);
                const playOnInteract = () => {
                    videoElement.muted = false;
                    videoElement.play();
                    document.removeEventListener('click', playOnInteract);
                };
                document.addEventListener('click', playOnInteract);
            });
        } else {
            if (Math.abs(videoElement.currentTime - seekTime) > 2) {
                videoElement.currentTime = seekTime;
            }
        }
    }
}

// Fullscreen logic
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        if (tvFrame.requestFullscreen) {
            tvFrame.requestFullscreen();
        } else if (tvFrame.webkitRequestFullscreen) {
            tvFrame.webkitRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    }
}

fullscreenBtn.addEventListener('click', toggleFullscreen);
videoElement.addEventListener('dblclick', toggleFullscreen);

updateStation();
setInterval(updateStation, 60000);
setInterval(() => {
    if (isOnAir()) syncVideo();
}, 1000); // More frequent check for bumpers
