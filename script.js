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

function isOnAir() {
    const now = new Date();
    const hours = now.getHours();
    // On air from 6 PM (18) to 6 AM (6)
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
        videoElement.pause();
    }
}

function syncVideo() {
    const nowUnix = Math.floor(Date.now() / 1000);
    const timeInCycle = nowUnix % totalDuration;
    
    let elapsedTime = 0;
    let currentVideo = null;
    let seekTime = 0;
    
    for (const video of playlist) {
        if (timeInCycle < elapsedTime + video.duration) {
            currentVideo = video;
            seekTime = timeInCycle - elapsedTime;
            break;
        }
        elapsedTime += video.duration;
    }
    
    if (currentVideo) {
        const currentSrc = videoElement.getAttribute('src');
        if (currentSrc !== currentVideo.url) {
            videoElement.src = currentVideo.url;
            videoElement.load();
            videoElement.currentTime = seekTime;
            videoElement.play().catch(e => {
                console.log("Autoplay blocked or error:", e);
                // Standard interaction required for sound/play
                const playOnInteract = () => {
                    videoElement.play();
                    document.removeEventListener('click', playOnInteract);
                };
                document.addEventListener('click', playOnInteract);
            });
        } else {
            // Correct drift if needed
            if (Math.abs(videoElement.currentTime - seekTime) > 2) {
                videoElement.currentTime = seekTime;
            }
        }
    }
}

// Initial check
updateStation();

// Check every minute for sign-on/sign-off
setInterval(updateStation, 60000);

// Keep sync accurate
setInterval(() => {
    if (isOnAir()) syncVideo();
}, 5000);
