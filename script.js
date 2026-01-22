/**
 * System Dashboard Controller
 */

function updateTime() {
    const timeElement = document.getElementById('system-time');
    if (!timeElement) return;

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    timeElement.textContent = `${hours}:${minutes}:${seconds}`;
}

async function measurePing() {
    const pingElement = document.getElementById('network-ping');
    if (!pingElement) return;

    const start = performance.now();
    try {
        // Fetch the current page header to measure round-trip time (latency)
        // cache: "no-store" ensures we hit the server
        await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
        const end = performance.now();
        const ping = Math.round(end - start);
        pingElement.textContent = `${ping}ms`;
    } catch (e) {
        // Fallback or error state
        pingElement.textContent = 'ERR';
    }
}

/**
 * Simple access gate: require code 1324 on every visit
 * Blocks interaction until the correct code is entered.
 */
/**
 * On-page Access Code UI
 * Shows a modal with the access code (1324) and an entry field; unlocks the UI when correct.
 */
(function setupAccessModal() {
    const ACCESS_CODE = '1324';
    const modal = document.getElementById('access-modal');
    const input = document.getElementById('access-input');
    const submit = document.getElementById('access-submit');
    const resetBtn = document.getElementById('access-reset');
    const error = document.getElementById('access-error');

    const warningPage = document.getElementById('warning-page');
    const leaveBtn = document.getElementById('leave-site-btn');
    const startScanBtn = document.getElementById('start-scan-btn');
    const scanArea = document.getElementById('scan-area');
    const scanVideo = document.getElementById('scan-video');
    const scanCanvas = document.getElementById('scan-canvas');
    const attemptScanBtn = document.getElementById('attempt-scan-btn');
    const stopScanBtn = document.getElementById('stop-scan-btn');
    const scanStatus = document.getElementById('scan-status');
    const scanResult = document.getElementById('scan-result');

    if (!modal || !input || !submit) return;

    // Face tracking state
    let scanning = false;
    let scanInterval = null;
    let faceMesh = null;
    let camera = null;
    let lastFaceSeen = false;
    let lastFrameTime = performance.now();

    function unlock() {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        if (warningPage) {
            warningPage.classList.add('hidden');
            warningPage.style.display = 'none';
        }
        input.blur();
        stopCamera();
    }

    function stopCamera() {
        scanning = false;
        if (scanInterval) {
            clearInterval(scanInterval);
            scanInterval = null;
        }
        if (camera && typeof camera.stop === 'function') {
            camera.stop();
        }
        const stream = scanVideo && scanVideo.srcObject;
        if (stream && stream.getTracks) {
            stream.getTracks().forEach(t => t.stop());
        }
        if (scanVideo) scanVideo.srcObject = null;
        if (scanCanvas) {
            const ctx = scanCanvas.getContext('2d');
            ctx.clearRect(0, 0, scanCanvas.width, scanCanvas.height);
        }
    }

    function showWarningPage() {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        if (!warningPage) return;
        warningPage.classList.remove('hidden');
        warningPage.style.display = 'flex';
    }


    function drawFaceOverlay(landmarks) {
        if (!scanCanvas || !scanVideo) return;
        const ctx = scanCanvas.getContext('2d');

        const w = scanCanvas.width = scanVideo.videoWidth || scanVideo.clientWidth;
        const h = scanCanvas.height = scanVideo.videoHeight || scanVideo.clientHeight;
        if (!w || !h) return;

        ctx.clearRect(0, 0, w, h);

        // Scale normalized landmarks to canvas size
        const scaled = landmarks.map(pt => ({
            x: pt.x * w,
            y: pt.y * h,
            z: pt.z
        }));

        // Simple mesh connections (subset)
        const connections = [
            [10, 338], [338, 297], [297, 332], [332, 284], [284, 251], [251, 389],
            [389, 356], [356, 454], [454, 323], [323, 361], [361, 288], [288, 397],
            [397, 365], [365, 379], [379, 378], [378, 400], [400, 377], [377, 152],
            [152, 148], [148, 176], [176, 149], [149, 150], [150, 136], [136, 172],
            [172, 58], [58, 132], [132, 93], [93, 234], [234, 127], [127, 162]
        ];

        // Lines
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -performance.now() / 50;

        connections.forEach(([a, b]) => {
            const p1 = scaled[a];
            const p2 = scaled[b];
            if (!p1 || !p2) return;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        });

        ctx.setLineDash([]);

        // Points
        ctx.fillStyle = '#00fff2';
        ctx.shadowColor = '#00fff2';
        ctx.shadowBlur = 8;
        const pulse = 2 + Math.sin(performance.now() / 500) * 0.8;

        scaled.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, pulse, 0, Math.PI * 2);
            ctx.fill();
        });

        // Tracking box
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(w * 0.25, h * 0.15, w * 0.5, h * 0.7);
        ctx.setLineDash([]);
    }

    function handleFaceResults(results) {
        const now = performance.now();
        const delta = now - lastFrameTime;
        lastFrameTime = now;

        if (!scanStatus) return;

        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            lastFaceSeen = true;
            const landmarks = results.multiFaceLandmarks[0];
            scanStatus.classList.remove('text-red-500');
            if (!scanning) {
                scanStatus.textContent = 'Face detected. System ready.';
            }

            drawFaceOverlay(landmarks);
        } else {
            lastFaceSeen = false;
            if (!scanning) {
                scanStatus.textContent = 'Face not seen. Please put your face in the view.';
                scanStatus.classList.add('text-red-500');
            }
            if (scanCanvas) {
                const ctx = scanCanvas.getContext('2d');
                ctx.clearRect(0, 0, scanCanvas.width, scanCanvas.height);
            }
        }
    }

    function ensureFaceMesh() {
        if (faceMesh) return;
        if (typeof FaceMesh === 'undefined') {
            if (scanStatus) scanStatus.textContent = 'Face tracking library not available.';
            return;
        }
        faceMesh = new FaceMesh({
            locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });
        faceMesh.setOptions({
            maxNumFaces: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.5,
            refineLandmarks: true
        });
        faceMesh.onResults(handleFaceResults);
    }

    function startCamera() {
        ensureFaceMesh();
        if (!faceMesh) return;

        if (!scanVideo) {
            if (scanStatus) scanStatus.textContent = 'Video element not found.';
            return;
        }

        if (typeof Camera === 'undefined') {
            if (scanStatus) scanStatus.textContent = 'Camera utils not available.';
            return;
        }

        try {
            camera = new Camera(scanVideo, {
                onFrame: async () => {
                    if (!faceMesh) return;
                    try {
                        await faceMesh.send({ image: scanVideo });
                    } catch (e) {
                        // fail silently for individual frames
                    }
                },
                width: 1280,
                height: 720
            });

            camera.start().then(() => {
                if (scanStatus) scanStatus.textContent = 'Initializing camera...';
            }).catch(() => {
                if (scanStatus) scanStatus.textContent = 'Unable to access camera.';
            });
        } catch (e) {
            if (scanStatus) scanStatus.textContent = 'Camera initialization failed.';
        }
    }

    function performScan() {
        if (!scanVideo || !scanCanvas) return;

        // Start scanning regardless, but keep live face feedback handled by handleFaceResults
        if (scanStatus) {
            scanStatus.classList.remove('text-red-500');
            scanStatus.textContent = 'Analyzing biometric data... 0%';
        }
        if (scanResult) {
            scanResult.classList.add('hidden');
        }

        scanning = true;
        let progress = 0;
        const DURATION_MS = 3000;
        const startTime = performance.now();

        if (scanInterval) clearInterval(scanInterval);

        scanInterval = setInterval(() => {
            const now = performance.now();
            const elapsed = now - startTime;
            progress = Math.min(100, Math.round((elapsed / DURATION_MS) * 100));

            if (scanStatus) {
                scanStatus.textContent = `Analyzing biometric data... ${progress}%`;
            }

            if (elapsed >= DURATION_MS) {
                clearInterval(scanInterval);
                scanInterval = null;
                scanning = false;

                if (scanStatus) {
                    scanStatus.textContent = 'VERIFIED';
                    scanStatus.classList.remove('text-red-500');
                    scanStatus.classList.add('text-green-400', 'font-bold', 'animate-pulse');
                }
                if (scanResult) {
                    scanResult.classList.remove('hidden');
                    scanResult.className = 'mt-3 text-[12px] text-green-400 font-bold uppercase tracking-widest animate-pulse';
                    scanResult.textContent = 'ACCESS VERIFIED — UNLOCKING...';
                }
                setTimeout(() => {
                    if (scanStatus) {
                        scanStatus.classList.remove('animate-pulse');
                    }
                    if (scanResult) {
                        scanResult.classList.remove('animate-pulse');
                    }
                    unlock();
                }, 1200);
            }
        }, 100);
    }

    function showErrorAndWarning() {
        showWarningPage();
    }

    submit.addEventListener('click', () => {
        const val = (input.value || '').trim();
        if (val === ACCESS_CODE) {
            unlock();
        } else {
            showErrorAndWarning();
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submit.click();
        }
    });

    resetBtn.addEventListener('click', () => {
        input.value = '';
        input.focus();
    });

    // Warning page actions
    if (leaveBtn) {
        leaveBtn.addEventListener('click', () => {
            // Try to close the window; if blocked, navigate away
            try {
                window.close();
                // fallback
                setTimeout(() => {
                    window.location.href = 'about:blank';
                }, 200);
            } catch (e) {
                window.location.href = 'about:blank';
            }
        });
    }

    if (startScanBtn) {
        startScanBtn.addEventListener('click', () => {
            if (!scanArea) return;
            scanArea.classList.remove('hidden');
            startCamera();
        });
    }

    if (attemptScanBtn) {
        attemptScanBtn.addEventListener('click', () => {
            if (scanning) return;
            performScan();
        });
    }

    if (stopScanBtn) {
        stopScanBtn.addEventListener('click', () => {
            stopCamera();
            if (scanArea) scanArea.classList.add('hidden');
            if (scanStatus) scanStatus.textContent = 'Scan canceled.';
            if (scanResult) scanResult.classList.add('hidden');
        });
    }

    // Ensure focus on load
    window.addEventListener('load', () => {
        input.focus();
    });

    // cleanup when navigating away / unload
    window.addEventListener('beforeunload', () => {
        stopCamera();
    });

})();

// Initial calls
updateTime();
measurePing();

 // Intervals
setInterval(updateTime, 1000);
setInterval(measurePing, 5000); // Ping every 5 seconds to avoid spamming

// Dynamic terminal system info
function populateTerminalInfo() {
    const container = document.getElementById('terminal-system-info');
    if (!container) return;

    const platform = navigator.platform || 'Unknown';
    const userAgent = navigator.userAgent || 'Unknown';
    const vendor = navigator.vendor || 'Unknown';
    const language = navigator.language || 'Unknown';
    const online = navigator.onLine ? 'Online' : 'Offline';
    const width = window.screen?.width;
    const height = window.screen?.height;
    const resolution = (width && height) ? `${width}x${height}` : 'Unknown';
    const colorDepth = window.screen?.colorDepth ? `${window.screen.colorDepth}-bit` : 'Unknown';
    const memory = navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'Unknown';
    const hardwareConcurrency = navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} threads` : 'Unknown';

    // Very simple browser detection for display only
    let browser = 'Unknown';
    if (/Edg\//.test(userAgent)) browser = 'Microsoft Edge';
    else if (/OPR\//.test(userAgent)) browser = 'Opera';
    else if (/Firefox\//.test(userAgent)) browser = 'Firefox';
    else if (/Chrome\//.test(userAgent)) browser = 'Chrome';
    else if (/Safari\//.test(userAgent)) browser = 'Safari';

    // Create a place for a live-updating uptime field
    const startTime = performance.now();

    container.innerHTML = `
        <!-- ASCII Logo -->
        <pre class="text-[#d70a53] font-bold leading-none select-none text-[10px] sm:text-xs">       _,met$$$$$gg.
    ,g$$$$$$$$$$$$$$$P.
  ,g$$P"     """Y$$.".
 ,$$P'              \`$$$.
',$$P       ,ggs.     \`$$b:
\`d$$'     ,$P"'   .    $$$
 $$P      d$'     ,    $$P
 $$:      $$.   -    ,d$$'
 $$;      Y$b._   _,d$P'
 Y$$.    \`.\`"Y$$$$P"'
 \`$$b      "-.__
  \`Y$$
   \`Y$$.
     \`$$b.
       \`Y$$b.
          \`"Y$b._
              \`"""
                        </pre>
        <!-- System Info -->
        <div class="text-xs space-y-1">
            <div class="flex"><span class="text-[#d70a53] font-bold mr-2">user@squared</span></div>
            <div class="w-full h-px bg-gray-600 mb-2"></div>
            <div class="flex"><span class="text-cyber-primary w-24">Platform</span><span>${platform}</span></div>
            <div class="flex"><span class="text-cyber-primary w-24">Browser</span><span>${browser}</span></div>
            <div class="flex"><span class="text-cyber-primary w-24">Vendor</span><span>${vendor}</span></div>
            <div class="flex"><span class="text-cyber-primary w-24">User Agent</span><span class="break-all">${userAgent}</span></div>
            <div class="flex"><span class="text-cyber-primary w-24">Resolution</span><span>${resolution} @ ${colorDepth}</span></div>
            <div class="flex"><span class="text-cyber-primary w-24">CPU Threads</span><span>${hardwareConcurrency}</span></div>
            <div class="flex"><span class="text-cyber-primary w-24">Device Memory</span><span>${memory}</span></div>
            <div class="flex"><span class="text-cyber-primary w-24">Language</span><span>${language}</span></div>
            <div class="flex"><span class="text-cyber-primary w-24">Network</span><span>${online}</span></div>
            <div class="flex"><span class="text-cyber-primary w-24">Session Uptime</span><span id="terminal-uptime">0h 0m 0s</span></div>
        </div>
    `;

    // Live uptime updater (updates every second)
    const uptimeEl = document.getElementById('terminal-uptime');
    if (!uptimeEl) return;

    function updateUptime() {
        const uptimeSeconds = Math.round((performance.now() - startTime) / 1000);
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = uptimeSeconds % 60;
        uptimeEl.textContent = `${hours}h ${minutes}m ${seconds}s`;
    }

    // Initialize immediately and then tick
    updateUptime();
    // Clear any previous interval handle to avoid duplicates
    if (window.__AXL_uptimeInterval) clearInterval(window.__AXL_uptimeInterval);
    window.__AXL_uptimeInterval = setInterval(updateUptime, 1000);
}

// Populate terminal info once DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', populateTerminalInfo);
} else {
    populateTerminalInfo();
}

// Network & CPU Traffic Simulation
const upTrafficData = new Array(21).fill(80);
const downTrafficData = new Array(21).fill(90);
const cpu1Data = new Array(21).fill(80);
const cpu2Data = new Array(21).fill(90);

function updateVisuals() {
    updateNetworkVisuals();
    updateCpuVisuals();
}

function updateCpuVisuals() {
    const poly1 = document.getElementById('cpu-poly-1');
    const poly2 = document.getElementById('cpu-poly-2');
    
    if (!poly1 || !poly2) return;

    cpu1Data.shift();
    cpu1Data.push(20 + Math.random() * 70);
    
    cpu2Data.shift();
    cpu2Data.push(10 + Math.random() * 80);

    const step = 5; // 100 / 20 steps
    
    poly1.setAttribute('points', cpu1Data.map((y, i) => `${i * step},${y}`).join(' '));
    poly2.setAttribute('points', cpu2Data.map((y, i) => `${i * step},${y}`).join(' '));
}

function updateNetworkVisuals() {
    const upPoly = document.getElementById('net-up-poly');
    const upFill = document.getElementById('net-up-fill');
    const downPoly = document.getElementById('net-down-poly');
    
    if (!upPoly || !downPoly) return;

    // Shift data and add new random point
    upTrafficData.shift();
    upTrafficData.push(60 + Math.random() * 30);
    
    downTrafficData.shift();
    downTrafficData.push(75 + Math.random() * 20);

    const step = 10; // 200 / 20 steps
    
    let upPoints = upTrafficData.map((y, i) => `${i * step},${y}`).join(' ');
    upPoly.setAttribute('points', upPoints);
    if (upFill) {
        upFill.setAttribute('d', `M0,100 ${upPoints} L200,100 Z`);
    }

    let downPoints = downTrafficData.map((y, i) => `${i * step},${y}`).join(' ');
    downPoly.setAttribute('points', downPoints);
}

// Optional: Dynamic CPU and Memory simulation updates
function simulateStats() {
    const memoryGrid = document.querySelector('[data-purpose="memory-grid"]');
    if (memoryGrid) {
        const dots = memoryGrid.children;
        const activeCount = Math.floor(Math.random() * 20) + 15; // 15 to 35 dots active
        for (let i = 0; i < dots.length; i++) {
            if (i < activeCount) {
                dots[i].className = 'h-1 w-1 bg-cyber-primary shadow-[0_0_2px_#00ffff]';
            } else {
                dots[i].className = 'h-1 w-1 bg-gray-700/50';
            }
        }
    }
}

setInterval(simulateStats, 3000);
setInterval(updateVisuals, 200);

/**
 * Window Management System
 */

function setupDraggable(header, container) {
    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialX = 0;
    let initialY = 0;
    let xOffset = 0;
    let yOffset = 0;

    const dragStart = (e) => {
        const clientX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;

        initialX = clientX - xOffset;
        initialY = clientY - yOffset;

        if (e.target === header || header.contains(e.target)) {
            if (e.target.tagName === 'BUTTON') return;
            isDragging = true;
        }
    };

    const dragEnd = () => {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
    };

    const drag = (e) => {
        if (isDragging) {
            e.preventDefault();
            const clientX = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
            const clientY = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;

            currentX = clientX - initialX;
            currentY = clientY - initialY;

            xOffset = currentX;
            yOffset = currentY;

            container.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
        }
    };

    header.addEventListener("touchstart", dragStart, { passive: false });
    header.addEventListener("mousedown", dragStart, false);
    
    window.addEventListener("touchend", dragEnd, false);
    window.addEventListener("mouseup", dragEnd, false);
    
    window.addEventListener("touchmove", drag, { passive: false });
    window.addEventListener("mousemove", drag, false);

    // Provide a reset function
    return {
        reset: () => {
            currentX = 0;
            currentY = 0;
            xOffset = 0;
            yOffset = 0;
            container.style.transform = 'translate3d(0, 0, 0)';
        }
    };
}

/**
 * File System & Window Management System
 */

const VIRTUAL_FS = {
    '/root': {
        type: 'folder',
        name: 'classified_records',
        contents: [
            {
                type: 'file',
                subtype: 'pdf',
                name: 'EC-121 Shootdown Report',
                path: 'EC-121.pdf',
                icon: 'pdf_icon.png'
            },
            {
                type: 'file',
                subtype: 'pdf',
                name: 'CIA RDP78-04718A002200130007-8',
                path: 'cia-rdp78-04718a002200130007-8.pdf',
                icon: 'pdf_icon.png'
            },
            {
                type: 'file',
                subtype: 'pdf',
                name: 'CIA RDP69B00369R000200290014-8',
                path: 'CIA-RDP69B00369R000200290014-8.pdf',
                icon: 'pdf_icon.png'
            },
            {
                type: 'file',
                subtype: 'pdf',
                name: 'Greg Silvermaster TS Report (26 Dec 1944)',
                path: '1944_26dec_greg_silvermaster_ts_report.pdf',
                icon: 'pdf_icon.png'
            },
            {
                type: 'file',
                subtype: 'pdf',
                name: 'KGB Secret Meeting — Mexico (14 Jun 1944)',
                path: '1944_14jun_kgb_secret_mtg_mexico.pdf',
                icon: 'pdf_icon.png'
            },
            {
                type: 'file',
                subtype: 'pdf',
                name: 'CIA RDP63-00313A000600040024-6',
                path: 'CIA-RDP63-00313A000600040024-6.pdf',
                icon: 'pdf_icon.png'
            },
            {
                type: 'folder',
                name: 'Epstein Files',
                path: '/root/epstein',
                icon: 'folder_icon.png'
            }
        ]
    },
    '/root/epstein': {
        type: 'folder',
        name: 'Epstein Files',
        contents: [
            {
                type: 'folder',
                name: 'photos',
                path: '/root/epstein/photos',
                icon: 'folder_icon.png'
            },
            {
                type: 'folder',
                name: 'PDFs',
                path: '/root/epstein/pdfs',
                icon: 'folder_icon.png'
            }
        ]
    },
    '/root/epstein/photos': {
        type: 'folder',
        name: 'photos',
        contents: [
            { type: 'file', subtype: 'image', name: 'epstein_trump_photo', path: 'gettyimages-681946574-1024x1024.webp' },
            { type: 'file', subtype: 'image', name: 'trump_kara_epstein', path: 'gettyimages-2078474569-1024x1024.webp' },
            { type: 'file', subtype: 'image', name: 'epstein_smiling', path: 'gettyimages-591529968-1024x1024.webp' },
            { type: 'file', subtype: 'image', name: 'trump_melania_epstein_maxwell', path: 'gettyimages-1192977790-1024x1024.webp' },
            { type: 'file', subtype: 'image', name: 'luxury_estate_cliffside', path: 'gettyimages-1913168382-1024x1024.webp' },
            { type: 'file', subtype: 'image', name: 'secret_service_boat', path: 'gettyimages-2252159204-1024x1024.webp' },
            { type: 'file', subtype: 'image', name: 'mj_clinton_ross', path: 'gettyimages-2252148362-1024x1024.webp' }
        ]
    },
    '/root/epstein/pdfs': {
        type: 'folder',
        name: 'PDFs',
        contents: [
            {
                type: 'file',
                subtype: 'pdf',
                name: '2nd Amended Complaint - Doe 1 v Epstein',
                path: '2ND AMENDED COMPLAINT Doe 1 v Epstein.pdf',
                icon: 'pdf_icon.png'
            },
            {
                type: 'file',
                subtype: 'pdf',
                name: 'Jeffrey Epstein Documents (Full)',
                path: 'jeffrey-epstein-documents-full.pdf',
                icon: 'pdf_icon.png'
            },
            {
                type: 'file',
                subtype: 'pdf',
                name: 'Jeffrey Epstein records 02',
                path: 'Jeffrey Epstein records 02.pdf',
                icon: 'pdf_icon.png'
            },
            {
                type: 'file',
                subtype: 'pdf',
                name: 'EFTA00008744',
                path: 'EFTA00008744.pdf',
                icon: 'pdf_icon.png'
            }
        ]
    }
};

let currentPath = '/root';
let pathHistory = [];

const secretWindow = document.getElementById('secret-window');
const secretWindowHeader = document.getElementById('secret-window-header');
const secretContent = document.getElementById('secret-window-content');
const secretPathDisplay = document.getElementById('secret-path-display');
const secretBackBtn = document.getElementById('secret-back-btn');
const secretDraggable = setupDraggable(secretWindowHeader, secretWindow);

const pdfViewerWindow = document.getElementById('pdf-viewer-window');
const pdfWindowHeader = document.getElementById('pdf-window-header');
const pdfIframe = document.getElementById('pdf-iframe');
const pdfLoader = document.getElementById('pdf-loader');
const pdfDraggable = setupDraggable(pdfWindowHeader, pdfViewerWindow);

const imageViewerWindow = document.getElementById('image-viewer-window');
const imageWindowHeader = document.getElementById('image-window-header');
const imageViewerTitle = document.getElementById('image-viewer-title');
const viewerImageElement = document.getElementById('viewer-image-element');
const imageCounterDisplay = document.getElementById('image-counter');
const imageFilenameDisplay = document.getElementById('image-filename-display');
const prevImageBtn = document.getElementById('prev-image-btn');
const nextImageBtn = document.getElementById('next-image-btn');
const imageDraggable = setupDraggable(imageWindowHeader, imageViewerWindow);

const moviesWindow = document.getElementById('movies-window');
const moviesWindowHeader = document.getElementById('movies-window-header');
const moviesIframe = document.getElementById('movies-iframe');
const moviesDraggable = setupDraggable(moviesWindowHeader, moviesWindow);

const idsWindow = document.getElementById('ids-window');
const idsWindowHeader = document.getElementById('ids-window-header');
const idsContent = document.getElementById('ids-window-content');
const idsDraggable = idsWindowHeader ? setupDraggable(idsWindowHeader, idsWindow) : null;

const settingsWindow = document.getElementById('settings-window');
const settingsWindowHeader = document.getElementById('settings-window-header');
const settingsDraggable = setupDraggable(settingsWindowHeader, settingsWindow);
const languageSelect = document.getElementById('language-select');
const languageStatusLabel = document.getElementById('language-status-label');
const languagePreview = document.getElementById('language-preview');

const adminsWindow = document.getElementById('admins-window');
const adminsWindowHeader = document.getElementById('admins-window-header');
const adminsDraggable = adminsWindowHeader ? setupDraggable(adminsWindowHeader, adminsWindow) : null;

// Walkie Talkie Scanner elements
const walkieWindow = document.getElementById('walkie-window');
const walkieWindowHeader = document.getElementById('walkie-window-header');
const walkieDraggable = walkieWindowHeader ? setupDraggable(walkieWindowHeader, walkieWindow) : null;

// Legacy single-channel elements removed in favor of channel list; we still expose status and controls
const walkieStatus = document.getElementById('walkie-status');

// Audio element (will be reused for channels)
let walkieAudio = new Audio('citywide1_20250109_200000.mp3');
walkieAudio.preload = 'auto';
walkieAudio.crossOrigin = "anonymous"; // allow analyser in some contexts

// Audio visualizer setup
let audioCtx = null;
let analyser = null;
let sourceNode = null;
let dataArray = null;
let bufferLength = 0;
let vizCanvas = document.getElementById('walkie-viz-canvas');
let vizCtx = vizCanvas ? vizCanvas.getContext('2d') : null;
let vizAnimationId = null;
let currentChannelSrc = walkieAudio.src;

// Resize canvas to CSS size
function resizeVizCanvas() {
    if (!vizCanvas) return;
    const rect = vizCanvas.getBoundingClientRect();
    vizCanvas.width = Math.max(256, Math.floor(rect.width * devicePixelRatio));
    vizCanvas.height = Math.max(64, Math.floor(rect.height * devicePixelRatio));
}
window.addEventListener('resize', resizeVizCanvas);
setTimeout(resizeVizCanvas, 150);

// Initialize audio context and analyser when needed
function ensureAudioAnalyser() {
    if (analyser && audioCtx) return;
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioCtx();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        bufferLength = analyser.fftSize;
        dataArray = new Uint8Array(bufferLength);
    } catch (e) {
        analyser = null;
        audioCtx = null;
        console.warn('AudioContext not available:', e);
    }
}

// Connect current audio element to analyser
function connectAudioToAnalyser() {
    if (!audioCtx || !analyser) return;
    try {
        if (sourceNode) {
            try { sourceNode.disconnect(); } catch (_) {}
        }
        sourceNode = audioCtx.createMediaElementSource(walkieAudio);
        sourceNode.connect(analyser);
        analyser.connect(audioCtx.destination);
    } catch (e) {
        // cross-origin or other restrictions may prevent reuse; fallback to simple visual pulse
        console.warn('connectAudioToAnalyser failed:', e);
        sourceNode = null;
    }
}

// Draw waveform / line visualizer
function drawVisualizer() {
    if (!vizCtx || (!analyser && !walkieAudio)) return;

    resizeVizCanvas();

    const w = vizCanvas.width;
    const h = vizCanvas.height;

    vizCtx.clearRect(0, 0, w, h);
    vizCtx.fillStyle = 'rgba(0,0,0,0.0)';
    vizCtx.fillRect(0, 0, w, h);

    vizCtx.lineWidth = Math.max(2, Math.floor(2 * devicePixelRatio));
    vizCtx.strokeStyle = 'rgba(0,255,255,0.9)';
    vizCtx.beginPath();

    if (analyser) {
        analyser.getByteTimeDomainData(dataArray);
        const sliceWidth = w / bufferLength;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0; // 0..2
            const y = (v * h) / 2;
            if (i === 0) {
                vizCtx.moveTo(x, y);
            } else {
                vizCtx.lineTo(x, y);
            }
            x += sliceWidth;
        }
        vizCtx.stroke();

        // draw RMS level as a filled bar
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            const dv = (dataArray[i] - 128) / 128;
            sum += dv * dv;
        }
        const rms = Math.sqrt(sum / bufferLength);
        const level = Math.min(1, rms * 5);
        vizCtx.fillStyle = 'rgba(0,255,255,0.06)';
        vizCtx.fillRect(0, h - Math.round(level * h), w, Math.round(level * h));
    } else {
        // fallback pulse based on playback state
        const t = (performance.now() / 300) % (Math.PI * 2);
        const y = (Math.sin(t) + 1) / 2 * h;
        vizCtx.moveTo(0, h/2);
        vizCtx.lineTo(w, y);
        vizCtx.stroke();
    }

    vizAnimationId = requestAnimationFrame(drawVisualizer);
}

function startVisualizer() {
    if (vizAnimationId) return;
    ensureAudioAnalyser();
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(()=>{});
    }
    if (analyser) {
        connectAudioToAnalyser();
    }
    drawVisualizer();
}

function stopVisualizer() {
    if (vizAnimationId) {
        cancelAnimationFrame(vizAnimationId);
        vizAnimationId = null;
    }
    if (vizCtx && vizCanvas) {
        vizCtx.clearRect(0, 0, vizCanvas.width, vizCanvas.height);
    }
}

// Utility to set channel source (handles mp4/mp3)
function setWalkieSource(src) {
    try {
        // If same as current, do nothing
        if (currentChannelSrc === src) return;
        currentChannelSrc = src;
        // tear down any existing audio element nodes to avoid policy issues
        try { if (sourceNode) sourceNode.disconnect(); } catch (_) {}
        // create new audio element if using audio file; for mp4 we still use audio element to extract audio
        const wasPlaying = !walkieAudio.paused && !walkieAudio.ended;
        try { walkieAudio.pause(); } catch(_) {}
        walkieAudio = new Audio(src);
        walkieAudio.preload = 'auto';
        walkieAudio.crossOrigin = "anonymous";
        walkieAudio.loop = true;
        walkieAudio.addEventListener('play', () => {
            startVisualizer();
            if (walkieStatus) walkieStatus.textContent = 'Playing';
        });
        walkieAudio.addEventListener('pause', () => {
            if (walkieStatus) walkieStatus.textContent = 'Paused';
        });
        // Reconnect analyser to the new element if analyser exists
        if (audioCtx && analyser) {
            // small timeout to allow element to be set up
            setTimeout(() => {
                try { connectAudioToAnalyser(); } catch(_) {}
            }, 100);
        }
        if (wasPlaying) {
            walkieAudio.play().catch(()=>{});
        }
    } catch (e) {
        console.warn('setWalkieSource failed:', e);
    }
}

 // Hook up UI channel buttons and controls (delegated)
 function initWalkieUI() {
     // Define pools of possible station sources for randomization
     const STATION_POOLS = {
         // group by logical channel key; include available audio/mp4 assets
         'citywide': [
             'citywide1_20250109_200000.mp3',
             'MULTI-summary-20061101200112.mp3',
             'MULTI-summary-20070501200537.mp3'
         ],
         'police': [
             'MULTI-summary-20070501150647.mp3',
             'MULTI-summary-20070501060419.mp3',
             'MULTI-summary-20070501030810.mp3',
             'MULTI-summary-20070501011003.mp3'
         ],
         'mixed': [
             'citywide1_20250109_200000.mp3',
             'MULTI-summary-20061101200112.mp3',
             'MULTI-summary-20070501200537.mp3',
             'MULTI-summary-20070501150647.mp3'
         ]
     };

     function pickRandomFromPool(pool) {
         if (!pool || pool.length === 0) return null;
         return pool[Math.floor(Math.random() * pool.length)];
     }

     // Determine pool key heuristically from button attributes or text
     function resolvePoolKey(btn) {
         const attr = (btn.getAttribute('data-src') || '').toLowerCase();
         const txt = (btn.textContent || '').toLowerCase();
         if (attr.includes('citywide') || txt.includes('citywide')) return 'citywide';
         if (txt.includes('police') || attr.includes('multi-summary')) return 'police';
         return 'mixed';
     }

     // Inject wifi-loader CSS into the document for the searching animation
     (function injectWifiLoaderStyles(){
         if (document.getElementById('axl-wifi-loader-styles')) return;
         const css = `
/* wifi-loader styles (injected) */
#wifi-loader {
  --background: #62abff;
  --front-color: #4f29f0;
  --back-color: #c3c8de;
  --text-color: #414856;
  width: 64px;
  height: 64px;
  border-radius: 50px;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
}

#wifi-loader svg {
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: center;
}

#wifi-loader svg circle {
  position: absolute;
  fill: none;
  stroke-width: 6px;
  stroke-linecap: round;
  stroke-linejoin: round;
  transform: rotate(-100deg);
  transform-origin: center;
}

#wifi-loader svg circle.back {
  stroke: var(--back-color);
}

#wifi-loader svg circle.front {
  stroke: var(--front-color);
}

#wifi-loader svg.circle-outer {
  height: 86px;
  width: 86px;
}

#wifi-loader svg.circle-outer circle {
  stroke-dasharray: 62.75 188.25;
}

#wifi-loader svg.circle-outer circle.back {
  animation: circle-outer135 1.8s ease infinite 0.3s;
}

#wifi-loader svg.circle-outer circle.front {
  animation: circle-outer135 1.8s ease infinite 0.15s;
}

#wifi-loader svg.circle-middle {
  height: 60px;
  width: 60px;
}

#wifi-loader svg.circle-middle circle {
  stroke-dasharray: 42.5 127.5;
}

#wifi-loader svg.circle-middle circle.back {
  animation: circle-middle6123 1.8s ease infinite 0.25s;
}

#wifi-loader svg.circle-middle circle.front {
  animation: circle-middle6123 1.8s ease infinite 0.1s;
}

#wifi-loader svg.circle-inner {
  height: 34px;
  width: 34px;
}

#wifi-loader svg.circle-inner circle {
  stroke-dasharray: 22 66;
}

#wifi-loader svg.circle-inner circle.back {
  animation: circle-inner162 1.8s ease infinite 0.2s;
}

#wifi-loader svg.circle-inner circle.front {
  animation: circle-inner162 1.8s ease infinite 0.05s;
}

#wifi-loader .text {
  position: absolute;
  bottom: -40px;
  display: flex;
  justify-content: center;
  align-items: center;
  text-transform: lowercase;
  font-weight: 500;
  font-size: 14px;
  letter-spacing: 0.2px;
}

#wifi-loader .text::before, #wifi-loader .text::after {
  content: attr(data-text);
}

#wifi-loader .text::before {
  color: var(--text-color);
}

#wifi-loader .text::after {
  color: var(--front-color);
  animation: text-animation76 3.6s ease infinite;
  position: absolute;
  left: 0;
}

@keyframes circle-outer135 {
  0% {
    stroke-dashoffset: 25;
  }

  25% {
    stroke-dashoffset: 0;
  }

  65% {
    stroke-dashoffset: 301;
  }

  80% {
    stroke-dashoffset: 276;
  }

  100% {
    stroke-dashoffset: 276;
  }
}

@keyframes circle-middle6123 {
  0% {
    stroke-dashoffset: 17;
  }

  25% {
    stroke-dashoffset: 0;
  }

  65% {
    stroke-dashoffset: 204;
  }

  80% {
    stroke-dashoffset: 187;
  }

  100% {
    stroke-dashoffset: 187;
  }
}

@keyframes circle-inner162 {
  0% {
    stroke-dashoffset: 9;
  }

  25% {
    stroke-dashoffset: 0;
  }

  65% {
    stroke-dashoffset: 106;
  }

  80% {
    stroke-dashoffset: 97;
  }

  100% {
    stroke-dashoffset: 97;
  }
}

@keyframes text-animation76 {
  0% {
    clip-path: inset(0 100% 0 0);
  }

  50% {
    clip-path: inset(0);
  }

  100% {
    clip-path: inset(0 0 0 100%);
  }
}`;
         const style = document.createElement('style');
         style.id = 'axl-wifi-loader-styles';
         style.textContent = css;
         document.head.appendChild(style);
     })();

     // helper: show wifi loader overlay over the visualizer for a given duration (ms)
     function showWifiLoaderFor(ms = 2000) {
         if (!vizCanvas) return new Promise(resolve => resolve());
         // ensure container (parent of canvas) is positioned
         const container = vizCanvas.parentElement || vizCanvas;
         // avoid duplicate loader
         let existing = container.querySelector('#wifi-loader');
         if (existing) existing.remove();

         // Hide the visualizer canvas and place a full-size black overlay so the viz area appears solid black
         const previousVizVisibility = vizCanvas.style.visibility || '';
         vizCanvas.style.visibility = 'hidden';

         // create a black overlay that covers the visualizer area
         const blackOverlay = document.createElement('div');
         blackOverlay.id = 'axl-viz-black-overlay';
         Object.assign(blackOverlay.style, {
             position: 'absolute',
             inset: '0',
             background: '#000',
             zIndex: 9998,
             pointerEvents: 'none'
         });
         // ensure container is positioned
         container.style.position = container.style.position || 'relative';
         container.appendChild(blackOverlay);

         const wrapper = document.createElement('div');
         wrapper.id = 'wifi-loader';
         // absolute center overlay (above black overlay)
         Object.assign(wrapper.style, {
             position: 'absolute',
             left: '50%',
             top: '50%',
             transform: 'translate(-50%,-30%)',
             zIndex: 9999,
             pointerEvents: 'none' // avoid blocking interactions
         });
         wrapper.innerHTML = `
  <svg viewBox="0 0 86 86" class="circle-outer"><circle r="40" cy="43" cx="43" class="back"></circle><circle r="40" cy="43" cx="43" class="front"></circle><circle r="40" cy="43" cx="43" class="new"></circle></svg>
  <svg viewBox="0 0 60 60" class="circle-middle"><circle r="27" cy="30" cx="30" class="back"></circle><circle r="27" cy="30" cx="30" class="front"></circle></svg>
  <svg viewBox="0 0 34 34" class="circle-inner"><circle r="14" cy="17" cx="17" class="back"></circle><circle r="14" cy="17" cx="17" class="front"></circle></svg>
  <div data-text="Searching" class="text"></div>
         `;
         // append to same offset parent as canvas so it overlays correctly
         container.appendChild(wrapper);

         return new Promise(resolve => {
             setTimeout(() => {
                 try {
                     wrapper.remove();
                 } catch (e) { /*ignore*/ }
                 try {
                     const bo = document.getElementById('axl-viz-black-overlay');
                     if (bo) bo.remove();
                 } catch (e) { /*ignore*/ }
                 // restore viz canvas visibility
                 vizCanvas.style.visibility = previousVizVisibility;
                 resolve();
             }, ms);
         });
     }

     // channel buttons - pick a randomized source from a pool each click
     document.querySelectorAll('.walkie-channel-btn').forEach(btn => {
         btn.addEventListener('click', async (e) => {
             // Prevent starting another channel while loader is active
             if (window.__axl_wifi_loader_active) return;
 
             const poolKey = resolvePoolKey(btn);
             const pool = STATION_POOLS[poolKey] || STATION_POOLS['mixed'];
             const src = pickRandomFromPool(pool);
             if (!src) return;
 
             // Helper to disable/enable channel buttons during loader
             const setChannelsEnabled = (enabled) => {
                 document.querySelectorAll('.walkie-channel-btn, #walkie-play-btn').forEach(el => {
                     if (enabled) {
                         el.removeAttribute('aria-disabled');
                         el.classList.remove('opacity-50', 'pointer-events-none');
                     } else {
                         el.setAttribute('aria-disabled', 'true');
                         el.classList.add('opacity-50', 'pointer-events-none');
                     }
                 });
             };
 
             // If this is a police channel, show the wifi-search loader for 2 seconds before playing
             if (poolKey === 'police') {
                 window.__axl_wifi_loader_active = true;
                 try {
                     setChannelsEnabled(false);
                     // show overlay and wait 2s (ensures no other start triggers)
                     await showWifiLoaderFor(2000);
                 } catch (err) {
                     // ignore loader errors
                 } finally {
                     window.__axl_wifi_loader_active = false;
                     setChannelsEnabled(true);
                 }
             }
 
             // Add a cache-busting query so repeated identical filenames still feel shuffled
             const randomizedSrc = `${src}?r=${Math.floor(Math.random() * 1e9)}`;
             setWalkieSource(randomizedSrc);
             playWalkie();
             // highlight selected
             document.querySelectorAll('.walkie-channel-btn').forEach(b => b.classList.remove('bg-cyber-primary/10', 'text-white'));
             btn.classList.add('bg-cyber-primary/10', 'text-white');
             playClick();
         });
     });

     const playBtn = document.getElementById('walkie-play-btn');
     const stopBtn = document.getElementById('walkie-stop-btn');

     if (playBtn) {
         playBtn.addEventListener('click', () => {
             playWalkie();
             playClick();
         });
     }
     if (stopBtn) {
         stopBtn.addEventListener('click', () => {
             stopWalkie();
             playClick();
         });
     }
 }

// Play/stop helpers
function playWalkie() {
    if (!walkieAudio) return;
    // Resume AudioContext on user gesture if needed
    try {
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {}
    walkieAudio.play().then(() => {
        if (walkieStatus) walkieStatus.textContent = 'Playing';
        startVisualizer();
    }).catch(() => {
        if (walkieStatus) walkieStatus.textContent = 'Playback blocked';
    });
}

function stopWalkie() {
    try {
        if (walkieAudio) {
            walkieAudio.pause();
            walkieAudio.currentTime = 0;
        }
    } catch (_) {}
    if (walkieStatus) walkieStatus.textContent = 'Stopped';
    stopVisualizer();
}

// Initialize
setTimeout(() => {
    resizeVizCanvas();
    initWalkieUI();
}, 300);

const settingsCatLanguage = document.getElementById('settings-cat-language');
const settingsCatDisplay = document.getElementById('settings-cat-display');
const settingsCatSecurity = document.getElementById('settings-cat-security');
const settingsSectionLanguage = document.getElementById('settings-section-language');
const settingsSectionDisplay = document.getElementById('settings-section-display');
const settingsSectionSecurity = document.getElementById('settings-section-security');

const soundCheckbox = document.getElementById('setting-sound');
const highContrastCheckbox = document.getElementById('setting-high-contrast');
const reduceMotionCheckbox = document.getElementById('setting-reduce-motion');
const advancedWarningsCheckbox = document.getElementById('setting-advanced-warnings');
const requireAccessCheckbox = document.getElementById('setting-require-access');
const autoLockSecretCheckbox = document.getElementById('setting-auto-lock-secret');
const advancedWarningText = document.getElementById('advanced-warning-text');

let clickAudioCtx = null;

const DEFAULT_SETTINGS = {
    language: 'en',
    sound: true,
    highContrast: false,
    reduceMotion: false,
    advancedWarnings: true,
    requireAccess: true,
    autoLockSecret: false
};

let currentSettings = { ...DEFAULT_SETTINGS };

function loadSettings() {
    try {
        const raw = localStorage.getItem('axl_settings_v1');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        currentSettings = { ...DEFAULT_SETTINGS, ...parsed };
    } catch (_) {
        currentSettings = { ...DEFAULT_SETTINGS };
    }
}

function saveSettings() {
    try {
        localStorage.setItem('axl_settings_v1', JSON.stringify(currentSettings));
    } catch (_) {
        // ignore quota errors
    }
}

function applyHighContrast() {
    if (currentSettings.highContrast) {
        document.body.classList.add('high-contrast');
    } else {
        document.body.classList.remove('high-contrast');
    }
}

function applyReduceMotion() {
    if (currentSettings.reduceMotion) {
        document.body.classList.add('reduce-motion');
    } else {
        document.body.classList.remove('reduce-motion');
    }
}

function applyAdvancedWarnings() {
    if (!advancedWarningText) return;
    if (currentSettings.advancedWarnings) {
        advancedWarningText.classList.remove('hidden');
    } else {
        advancedWarningText.classList.add('hidden');
    }
}

function applyRequireAccess() {
    const accessModal = document.getElementById('access-modal');
    if (!accessModal) return;
    if (!currentSettings.requireAccess) {
        accessModal.classList.add('hidden');
        accessModal.style.display = 'none';
    }
}

function playClick() {
    if (!currentSettings.sound) return;
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!clickAudioCtx) {
            clickAudioCtx = new AudioCtx();
        }
        const ctx = clickAudioCtx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 800;
        gain.gain.setValueAtTime(0.0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.09);
    } catch (_) {
        // silent failure
    }
}

function activateSettingsTab(tab) {
    if (!settingsCatLanguage || !settingsCatDisplay || !settingsCatSecurity) return;

    const allCats = [settingsCatLanguage, settingsCatDisplay, settingsCatSecurity];
    const allSections = [settingsSectionLanguage, settingsSectionDisplay, settingsSectionSecurity];

    allCats.forEach(btn => {
        if (!btn) return;
        btn.classList.remove('bg-cyber-primary/20', 'text-cyber-primary', 'border-cyber-border/80');
        btn.classList.add('bg-black/60', 'text-gray-400', 'border-cyber-border/40');
    });
    allSections.forEach(sec => {
        if (!sec) return;
        sec.classList.add('hidden');
    });

    if (tab === 'language') {
        settingsCatLanguage.classList.add('bg-cyber-primary/20', 'text-cyber-primary', 'border-cyber-border/80');
        settingsCatLanguage.classList.remove('bg-black/60', 'text-gray-400', 'border-cyber-border/40');
        settingsSectionLanguage.classList.remove('hidden');
    } else if (tab === 'display') {
        settingsCatDisplay.classList.add('bg-cyber-primary/20', 'text-cyber-primary', 'border-cyber-border/80');
        settingsCatDisplay.classList.remove('bg-black/60', 'text-gray-400', 'border-cyber-border/40');
        settingsSectionDisplay.classList.remove('hidden');
    } else if (tab === 'security') {
        settingsCatSecurity.classList.add('bg-cyber-primary/20', 'text-cyber-primary', 'border-cyber-border/80');
        settingsCatSecurity.classList.remove('bg-black/60', 'text-gray-400', 'border-cyber-border/40');
        settingsSectionSecurity.classList.remove('hidden');
    }
}

const camerasWindow = document.getElementById('cameras-window');
const camerasWindowHeader = document.getElementById('cameras-window-header');
const camerasDraggable = setupDraggable(camerasWindowHeader, camerasWindow);
const cameraMainFeed = document.getElementById('camera-main-feed');

let currentGallery = [];
let currentGalleryIndex = -1;

function renderFS() {
    const folder = VIRTUAL_FS[currentPath];
    secretContent.innerHTML = '';
    secretPathDisplay.textContent = currentPath;
    secretBackBtn.disabled = pathHistory.length === 0;

    // Filter images for gallery navigation
    const imagesInFolder = folder.contents.filter(i => i.subtype === 'image');

    folder.contents.forEach(item => {
        const div = document.createElement('div');
        div.className = 'flex flex-col items-center group cursor-pointer max-w-[120px]';
        
        let iconHtml = '';
        if (item.type === 'folder') {
            iconHtml = `<img src="folder_icon.png" class="w-16 h-16 mb-2 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all drop-shadow-[0_0_8px_rgba(0,255,255,0.4)]" alt="Folder">`;
        } else if (item.subtype === 'pdf') {
            iconHtml = `
                <div class="relative w-16 h-16 mb-2">
                    <img src="${item.icon || 'pdf_icon.png'}" class="w-full h-full object-contain opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all drop-shadow-[0_0_8px_rgba(255,0,0,0.4)]" alt="PDF Icon">
                    <div class="absolute -bottom-1 -right-1 bg-red-600 text-[8px] px-1 font-bold rounded-sm animate-pulse">PDF</div>
                </div>`;
        } else if (item.subtype === 'image') {
            iconHtml = `
                <div class="relative w-16 h-16 mb-2 border border-cyber-primary/30 bg-black/50 p-1">
                    <img src="${item.path}" class="w-full h-full object-cover opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all" alt="Image">
                    <div class="absolute -bottom-1 -right-1 bg-cyber-primary text-black text-[8px] px-1 font-bold rounded-sm">IMG</div>
                </div>`;
        }

        div.innerHTML = `
            ${iconHtml}
            <span class="text-[10px] text-gray-300 group-hover:text-white text-center leading-tight break-words w-full">${item.name}</span>
        `;

        div.onclick = () => {
            if (item.type === 'folder') {
                pathHistory.push(currentPath);
                currentPath = item.path;
                renderFS();
            } else if (item.subtype === 'pdf') {
                openPDF(item.path);
            } else if (item.subtype === 'image') {
                const index = imagesInFolder.findIndex(img => img.path === item.path);
                openImageGallery(imagesInFolder, index);
            }
        };

        secretContent.appendChild(div);
    });
}

function openPDF(path) {
    pdfViewerWindow.classList.remove('hidden');
    pdfViewerWindow.classList.add('flex');
    pdfDraggable.reset();
    pdfLoader.style.display = 'flex';
    pdfIframe.src = path;
    pdfIframe.onload = () => { pdfLoader.style.display = 'none'; };
}

function openImageGallery(images, index) {
    currentGallery = images;
    currentGalleryIndex = index;
    
    imageViewerWindow.classList.remove('hidden');
    imageViewerWindow.classList.add('flex');
    imageDraggable.reset();
    
    updateImageViewer();
}

function updateImageViewer() {
    if (currentGalleryIndex < 0 || currentGalleryIndex >= currentGallery.length) return;
    
    const item = currentGallery[currentGalleryIndex];
    viewerImageElement.src = item.path;
    imageViewerTitle.textContent = `VIEWER // ${item.name.toUpperCase()}`;
    imageCounterDisplay.textContent = `${currentGalleryIndex + 1} / ${currentGallery.length}`;
    imageFilenameDisplay.textContent = `FILE: ${item.path}`;
}

function nextImage() {
    if (currentGallery.length === 0) return;
    currentGalleryIndex = (currentGalleryIndex + 1) % currentGallery.length;
    updateImageViewer();
}

function prevImage() {
    if (currentGallery.length === 0) return;
    currentGalleryIndex = (currentGalleryIndex - 1 + currentGallery.length) % currentGallery.length;
    updateImageViewer();
}

// Gallery Navigation Listeners
prevImageBtn.onclick = (e) => { e.stopPropagation(); prevImage(); };
nextImageBtn.onclick = (e) => { e.stopPropagation(); nextImage(); };

// Keyboard navigation
window.addEventListener('keydown', (e) => {
    if (imageViewerWindow.classList.contains('hidden')) return;
    if (e.key === 'ArrowRight') nextImage();
    if (e.key === 'ArrowLeft') prevImage();
    if (e.key === 'Escape') {
        imageViewerWindow.classList.add('hidden');
        imageViewerWindow.classList.remove('flex');
    }
});

// Event Listeners
const camerasAppTrigger = document.getElementById('cameras-app-trigger');
if (camerasAppTrigger) {
    camerasAppTrigger.addEventListener('click', () => {
        if (!camerasWindow) return;

        // If access modal is present, hide it so Cameras opens without requiring code
        const accessModal = document.getElementById('access-modal');
        if (accessModal) {
            accessModal.classList.add('hidden');
            accessModal.style.display = 'none';
        }

        camerasWindow.classList.remove('hidden');
        camerasWindow.classList.add('flex');
        if (camerasDraggable && typeof camerasDraggable.reset === 'function') camerasDraggable.reset();
        if (cameraMainFeed) {
            try {
                cameraMainFeed.currentTime = 0;
                cameraMainFeed.play().catch(() => {});
            } catch (e) { /* ignore playback errors */ }
        }
        try { playClick(); } catch (e) {}
    });
}

// Camera selection buttons to switch main feed
const cam01Btn = document.getElementById('cam01-btn');
const cam02Btn = document.getElementById('cam02-btn');

// Ensure the main feed element exists
function switchCameraFeed(src, autoplay = true) {
    if (!cameraMainFeed) return;
    // Pause, change source, then attempt to play
    try {
        cameraMainFeed.pause();
        cameraMainFeed.src = src;
        cameraMainFeed.load();
        if (autoplay) cameraMainFeed.play().catch(() => {});
    } catch (e) {
        // silent
    }
}

if (cam01Btn) {
    cam01Btn.addEventListener('click', () => {
        switchCameraFeed('YTDown.com_YouTube_Witson-CCTV-System-CMS-seven-7-remote-si_Media_LjfG1xWigLE_001_720p.mp4');
    });
}

if (cam02Btn) {
    cam02Btn.addEventListener('click', () => {
        // Alternate feed: use provided 720p CCTV-live-6 file
        switchCameraFeed('YTDown.com_YouTube_Witson-CMS-CCTV-live-6-remote-sites-33-c_Media_ffu93KhnSKg_001_720p.mp4');
    });
}

document.getElementById('movies-app-trigger').addEventListener('click', () => {
    moviesWindow.classList.remove('hidden');
    moviesWindow.classList.add('flex');
    moviesDraggable.reset();
    moviesIframe.src = 'https://vidlo-idk.pages.dev/';
});

document.getElementById('ids-app-trigger').addEventListener('click', () => {
    openIDSWindow();
});

document.getElementById('settings-app-trigger').addEventListener('click', () => {
    settingsWindow.classList.remove('hidden');
    settingsWindow.classList.add('flex');
    settingsDraggable.reset();
    playClick();
    activateSettingsTab('language');
});

document.getElementById('admins-app-trigger').addEventListener('click', () => {
    // Open Admins Only window and show an internal access prompt inside it
    if (!adminsWindow) return;
    adminsWindow.classList.remove('hidden');
    adminsWindow.classList.add('flex');
    if (adminsDraggable && typeof adminsDraggable.reset === 'function') adminsDraggable.reset();
    playClick();

    // Create or reveal an internal access panel inside the admins window (left column)
    let internalPanel = document.getElementById('admins-internal-access');
    const adminContentArea = document.getElementById('admin-content-area');

    if (!internalPanel) {
        internalPanel = document.createElement('div');
        internalPanel.id = 'admins-internal-access';
        internalPanel.className = 'border border-red-700/20 p-3 rounded mb-3 bg-black/60 text-gray-300';
        internalPanel.innerHTML = `
            <div class="text-red-400 text-[11px] uppercase tracking-wide mb-2">Administrative Access</div>
            <div class="text-gray-300 text-[11px] mb-2">Enter administrator passcode to unlock the panel.</div>
            <input id="admins-internal-input" placeholder="Enter admin code" class="w-full bg-black/80 border border-red-700 text-white px-3 py-2 rounded text-sm outline-none mb-2" />
            <div class="flex gap-2">
                <button id="admins-internal-unlock" class="px-3 py-1 bg-red-600 text-black rounded text-sm font-bold">Unlock</button>
                <button id="admins-internal-clear" class="px-3 py-1 bg-transparent border border-red-700 text-red-400 rounded text-sm">Clear</button>
            </div>
            <div id="admins-internal-error" class="mt-2 text-red-500 text-[11px] hidden">Invalid admin code.</div>
        `;
        // insert at top of content area
        if (adminContentArea) adminContentArea.prepend(internalPanel);
    } else {
        internalPanel.classList.remove('hidden');
    }

    // Hide actual admin sections until unlocked
    activateAdminTab('bans'); // keep state consistent but hide sections
    const adminSections = ['admin-section-bans','admin-section-fun','admin-section-ouradmins'];
    adminSections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    const input = document.getElementById('admins-internal-input');
    const unlockBtn = document.getElementById('admins-internal-unlock');
    const clearBtn = document.getElementById('admins-internal-clear');
    const errorEl = document.getElementById('admins-internal-error');

    if (input) input.value = '';
    if (input) input.focus();

    function onUnlock() {
        const val = (input.value || '').trim();
        // admin code now required is '1234'
        if (val === '1234') {
            // reveal left tab column and show only the default 'bans' tab content
            const leftTabs = document.getElementById('admins-left-tabs');
            if (leftTabs) leftTabs.classList.remove('hidden');
            // ensure only 'bans' is visible initially
            activateAdminTab('bans');
            // remove the internal prompt
            if (internalPanel) internalPanel.remove();
            // log action
            const logs = document.getElementById('admin-logs');
            if (logs) {
                const ts = new Date().toISOString().replace('T',' ').split('.')[0];
                const line = document.createElement('div');
                line.textContent = `[${ts}] Admin access granted (internal)`;
                logs.prepend(line);
            }
            playClick();
        } else {
            if (errorEl) errorEl.classList.remove('hidden');
            playClick();
        }
    }

    function onClear() {
        if (input) input.value = '';
        if (errorEl) errorEl.classList.add('hidden');
        if (input) input.focus();
        playClick();
    }

    if (unlockBtn) {
        unlockBtn.onclick = onUnlock;
    }
    if (clearBtn) {
        clearBtn.onclick = onClear;
    }
    if (input) {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                onUnlock();
            } else if (e.key === 'Escape') {
                onClear();
            }
        });
    }
});

// Walkie app trigger
document.getElementById('walkie-app-trigger').addEventListener('click', () => {
    if (!walkieWindow) return;
    walkieWindow.classList.remove('hidden');
    walkieWindow.classList.add('flex');
    if (walkieDraggable && typeof walkieDraggable.reset === 'function') walkieDraggable.reset();
    playClick();
    if (walkieStatus) walkieStatus.textContent = 'Idle';
});



function openIDSWindow() {
    if (!idsWindow) return;
    idsWindow.classList.remove('hidden');
    idsWindow.classList.add('flex');
    if (idsDraggable && typeof idsDraggable.reset === 'function') idsDraggable.reset();

    // Make IDS look like the Files app but only show the two images provided
    const images = [
        {
            type: 'file',
            subtype: 'image',
            name: 'new_york_drivers_license',
            path: '/Dou_fsm_2024-1220_232525-EDIT.jpg'
        },
        {
            type: 'file',
            subtype: 'image',
            name: 'new_york_state_drivers_license',
            path: '/20240729_220410-EDIT.jpg'
        }
    ];

    if (!idsContent) return;
    idsContent.innerHTML = '';

    images.forEach(item => {
        const div = document.createElement('div');
        div.className = 'flex flex-col items-center group cursor-pointer max-w-[140px]';
        
        const iconHtml = `
            <div class="relative w-32 h-20 mb-2 border border-cyber-primary/30 bg-black/50 p-1 overflow-hidden">
                <img src="${item.path}" class="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-all" alt="${item.name}">
                <div class="absolute -bottom-1 -right-1 bg-cyber-primary text-black text-[8px] px-1 font-bold rounded-sm">IMG</div>
            </div>`;

        div.innerHTML = `
            ${iconHtml}
            <span class="text-[10px] text-gray-300 group-hover:text-white text-center leading-tight break-words w-full">${item.name}</span>
        `;

        div.onclick = () => {
            // open image viewer with this single image
            openImageGallery(images, images.findIndex(i => i.path === item.path));
        };

        idsContent.appendChild(div);
    });
}

document.getElementById('secret-folder-trigger').addEventListener('click', () => {
    secretWindow.classList.remove('hidden');
    secretWindow.classList.add('flex');
    secretDraggable.reset();
    currentPath = '/root';
    pathHistory = [];
    renderFS();
});

secretBackBtn.onclick = () => {
    if (pathHistory.length > 0) {
        currentPath = pathHistory.pop();
        renderFS();
    }
};

// Generic close handlers
const closeActions = [
    { btn: 'close-window', win: secretWindow },
    { btn: 'minimize-window', win: secretWindow },
    { btn: 'close-pdf-window', win: pdfViewerWindow, extra: () => pdfIframe.src = 'about:blank' },
    { btn: 'minimize-pdf-window', win: pdfViewerWindow },
    { btn: 'close-image-window', win: imageViewerWindow },
    { btn: 'minimize-image-window', win: imageViewerWindow },
    { btn: 'close-movies-window', win: moviesWindow, extra: () => moviesIframe.src = 'about:blank' },
    { btn: 'minimize-movies-window', win: moviesWindow },
    { btn: 'close-ids-window', win: idsWindow, extra: () => { /* no-op */ } },
    { btn: 'minimize-ids-window', win: idsWindow },
    { btn: 'close-settings-window', win: settingsWindow },
    { btn: 'minimize-settings-window', win: settingsWindow },
    { btn: 'close-cameras-window', win: camerasWindow, extra: () => { if (cameraMainFeed) cameraMainFeed.pause(); } },
    { btn: 'minimize-cameras-window', win: camerasWindow },
    { btn: 'close-walkie-window', win: walkieWindow, extra: () => { try { walkieAudio.pause(); walkieAudio.currentTime = 0; } catch(e){} } },
    { btn: 'minimize-walkie-window', win: walkieWindow },
    { btn: 'close-admins-window', win: adminsWindow },
    { btn: 'minimize-admins-window', win: adminsWindow }
];

closeActions.forEach(action => {
    document.getElementById(action.btn).addEventListener('click', () => {
        action.win.classList.add('hidden');
        action.win.classList.remove('flex');
        if (action.extra) action.extra();
    });
});

 // Settings: language + toggles with persistence
const LANGUAGE_TEXT = {
    en: {
        status: 'Current language: English',
        preview: 'System messages will appear in English.'
    },
    es: {
        status: 'Idioma actual: Español',
        preview: 'Los mensajes del sistema aparecerán en español.'
    }
};

/* Translation dictionary for UI elements */
const TRANSLATIONS = {
    en: {
        secret_breadcrumb: '/root',
        secret_path: '/classified/nsc_records',
        back_btn: '< BACK',
        cameras: 'Cameras',
        movies: 'Hacked Movies',
        ids: 'IDS',
        walkie: 'Walkie Scanner',
        settings: 'Settings',
        admins: 'Admins Only',
        secret_folder_label: 'Secret Government Files',
        mount_label: 'Mount /home/squared',
        used_label: 'used 46%',
        system_time_label: 'UTC +00:00',
        network_status_online: 'ONLINE',
        network_state_label: 'State',
        network_ipv4_label: 'IPv4',
        network_ping_label: 'Ping',
        network_latlon: 'LAT: 34.0522 N / LON: 118.2437 W',
        pdf_secure_reader_title: 'SECURE_READER // EC-121.PDF',
        movies_title: 'HACKED MOVIES // VIDLO',
        ids_title: 'IDS // INTRUSION DETECTION',
        settings_title: 'SYSTEM // SETTINGS',
        walkie_title: 'WALKIE // SCANNER',
        admins_title: 'ADMINS ONLY // RESTRICTED',
        access_required: 'ACCESS REQUIRED',
        access_enter_code: 'Enter 4-digit code',
        access_submit: 'Unlock',
        access_clear: 'Clear',
        access_invalid: 'Invalid code.',
        warning_top: 'TOP SECRET ACCESS DETECTED',
        warning_detected_text: 'You are attempting to access top secret programs. Leave immediately or verify ownership by scanning your face.',
        warning_suspicious: 'Suspicious activity detected.',
        warning_scan_btn: 'Scan Face To Verify Ownership',
        leave_site: 'Leave site',
        scan_ready: 'Ready to scan.',
        scan_analyzing_prefix: 'Analyzing biometric data... ',
        scan_verified: 'VERIFIED',
        scan_access_verified: 'ACCESS VERIFIED — UNLOCKING...',
        settings_language: 'Language & Region',
        settings_display: 'Display & Theme',
        settings_security: 'Security & Privacy',
        language_current_en: 'Current language: English',
        language_preview_en: 'System messages will appear in English.',
        language_current_es: 'Idioma actual: Español',
        language_preview_es: 'Los mensajes del sistema aparecerán en español.'
    },
    es: {
        secret_breadcrumb: '/root',
        secret_path: '/clasificados/nsc_registros',
        back_btn: '< ATRÁS',
        cameras: 'Cámaras',
        movies: 'Películas Hackeadas',
        ids: 'IDS',
        walkie: 'Escáner Walkie',
        settings: 'Ajustes',
        admins: 'Solo Administradores',
        secret_folder_label: 'Archivos Secretos del Gobierno',
        mount_label: 'Montar /home/squared',
        used_label: 'usado 46%',
        system_time_label: 'UTC +00:00',
        network_status_online: 'EN LÍNEA',
        network_state_label: 'Estado',
        network_ipv4_label: 'IPv4',
        network_ping_label: 'Ping',
        network_latlon: 'LAT: 34.0522 N / LON: 118.2437 W',
        pdf_secure_reader_title: 'Lector_Seguro // EC-121.PDF',
        movies_title: 'PELÍCULAS HACKEADAS // VIDLO',
        ids_title: 'IDS // DETECCIÓN DE INTRUSIONES',
        settings_title: 'SISTEMA // AJUSTES',
        walkie_title: 'WALKIE // ESCÁNER',
        admins_title: 'SOLO ADMINISTRADORES // RESTRINGIDO',
        access_required: 'ACCESO REQUERIDO',
        access_enter_code: 'Ingrese código de 4 dígitos',
        access_submit: 'Desbloquear',
        access_clear: 'Borrar',
        access_invalid: 'Código inválido.',
        warning_top: 'ACCESO TOP SECRET DETECTADO',
        warning_detected_text: 'Está intentando acceder a programas top secret. Váyase inmediatamente o verifique la propiedad escaneando su rostro.',
        warning_suspicious: 'Actividad sospechosa detectada.',
        warning_scan_btn: 'Escanear rostro para verificar propiedad',
        leave_site: 'Salir del sitio',
        scan_ready: 'Listo para escanear.',
        scan_analyzing_prefix: 'Analizando datos biométricos... ',
        scan_verified: 'VERIFICADO',
        scan_access_verified: 'ACCESO VERIFICADO — DESBLOQUEANDO...',
        settings_language: 'Idioma y Región',
        settings_display: 'Pantalla y Tema',
        settings_security: 'Seguridad y Privacidad',
        language_current_en: 'Current language: English',
        language_preview_en: 'System messages will appear in English.',
        language_current_es: 'Idioma actual: Español',
        language_preview_es: 'Los mensajes del sistema aparecerán en español.'
    }
};

function translateUI(lang) {
    const t = TRANSLATIONS[lang] || TRANSLATIONS.en;

    // Header / windows
    const secretBreadcrumb = document.getElementById('secret-breadcrumb');
    if (secretBreadcrumb) secretBreadcrumb.textContent = t.secret_breadcrumb;

    const secretPathDisplayEl = document.getElementById('secret-path-display');
    if (secretPathDisplayEl) secretPathDisplayEl.textContent = t.secret_path;

    // Buttons and app labels
    const btnBack = document.getElementById('secret-back-btn');
    if (btnBack) btnBack.innerHTML = t.back_btn;

    const apps = {
        'cameras-app-trigger': t.cameras,
        'movies-app-trigger': t.movies,
        'ids-app-trigger': t.ids,
        'walkie-app-trigger': t.walkie,
        'settings-app-trigger': t.settings,
        'admins-app-trigger': t.admins,
        'secret-folder-trigger': t.secret_folder_label
    };
    Object.keys(apps).forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const span = el.querySelector('span');
        if (span) span.textContent = apps[id];
    });

    // Footer / mount labels (target the footer area explicitly to avoid clobbering app labels)
    const mountLabel = document.querySelector('[data-purpose="lower-dashboard"] .border-t .text-cyber-primary');
    if (mountLabel) mountLabel.textContent = t.mount_label;
    const usedLabel = document.querySelector('[data-purpose="lower-dashboard"] .border-t .text-gray-400');
    if (usedLabel) usedLabel.textContent = t.used_label;

    // PDF viewer title
    const pdfTitle = document.querySelector('#pdf-window-header .text-cyber-primary');
    if (pdfTitle) pdfTitle.textContent = t.pdf_secure_reader_title;

    // Movies title
    const moviesTitle = document.querySelector('#movies-window-header .text-cyber-primary');
    if (moviesTitle) moviesTitle.textContent = t.movies_title;

    // IDS title
    const idsTitle = document.querySelector('#ids-window-header .text-cyber-primary');
    if (idsTitle) idsTitle.textContent = t.ids_title;

    // Settings title and categories
    const settingsTitle = document.querySelector('#settings-window-header .text-cyber-primary');
    if (settingsTitle) settingsTitle.textContent = t.settings_title;
    const catLang = document.getElementById('settings-cat-language');
    const catDisplay = document.getElementById('settings-cat-display');
    const catSecurity = document.getElementById('settings-cat-security');
    if (catLang) catLang.textContent = t.settings_language;
    if (catDisplay) catDisplay.textContent = t.settings_display;
    if (catSecurity) catSecurity.textContent = t.settings_security;

    // Walkie title
    const walkieTitle = document.querySelector('#walkie-window-header .text-cyber-primary');
    if (walkieTitle) walkieTitle.textContent = t.walkie_title;

    // Admins title
    const adminsTitle = document.querySelector('#admins-window-header .text-red-400');
    if (adminsTitle) adminsTitle.textContent = t.admins_title;

    // Access modal text
    const accessTitle = document.querySelector('#access-modal .text-cyber-primary');
    if (accessTitle) accessTitle.textContent = t.access_required;
    const accessLabel = document.querySelector('#access-modal [for="access-input"]');
    const accessInput = document.getElementById('access-input');
    if (accessInput) accessInput.placeholder = t.access_enter_code;
    const accessSubmit = document.getElementById('access-submit');
    if (accessSubmit) accessSubmit.textContent = t.access_submit;
    const accessReset = document.getElementById('access-reset');
    if (accessReset) accessReset.textContent = t.access_clear;
    const accessError = document.getElementById('access-error');
    if (accessError) accessError.textContent = t.access_invalid;

    // Warning page texts
    const warningTop = document.querySelector('#warning-page .text-red-500');
    if (warningTop) warningTop.textContent = t.warning_top;
    const warningDesc = document.querySelector('#warning-page .text-gray-300');
    if (warningDesc) warningDesc.querySelector('p') && (warningDesc.querySelector('p').textContent = t.warning_detected_text);
    const warningSusp = document.querySelector('#warning-page #advanced-warning-text .font-semibold');
    if (warningSusp) warningSusp.textContent = t.warning_suspicious;
    const scanBtn = document.getElementById('start-scan-btn');
    if (scanBtn) scanBtn.textContent = t.warning_scan_btn;
    const leaveBtn = document.getElementById('leave-site-btn');
    if (leaveBtn) leaveBtn.textContent = t.leave_site;

    // Scan status / buttons
    const scanStatus = document.getElementById('scan-status');
    if (scanStatus) scanStatus.textContent = t.scan_ready;
    const attemptScanBtn = document.getElementById('attempt-scan-btn');
    if (attemptScanBtn) attemptScanBtn.textContent = t.warning_scan_btn;
    const stopScanBtn = document.getElementById('stop-scan-btn');
    if (stopScanBtn) stopScanBtn.textContent = 'Cancelar';

    // Network labels
    const networkStateEls = document.querySelectorAll('.mb-2 span:first-child');
    networkStateEls.forEach(el => {
        if (el.textContent.trim() === 'State') el.textContent = t.network_state_label;
        if (el.textContent.trim() === 'IPv4') el.textContent = t.network_ipv4_label;
        if (el.textContent.trim() === 'Ping') el.textContent = t.network_ping_label;
    });
    const networkOnline = document.querySelector('.text-green-400');
    if (networkOnline) networkOnline.textContent = t.network_status_online;
    const latlon = document.querySelector('.absolute.bottom-1.right-1');
    if (latlon) latlon.textContent = t.network_latlon;

    // Update language-specific small labels
    const langStatusLabel = document.getElementById('language-status-label');
    const langPreview = document.getElementById('language-preview');
    if (langStatusLabel && langPreview) {
        if (lang === 'es') {
            langStatusLabel.textContent = TRANSLATIONS.es.language_current_es;
            langPreview.textContent = TRANSLATIONS.es.language_preview_es;
        } else {
            langStatusLabel.textContent = TRANSLATIONS.en.language_current_en;
            langPreview.textContent = TRANSLATIONS.en.language_preview_en;
        }
    }

    // Terminal prompt language sensitive parts (only brief)
    const terminalUser = document.querySelector('.px-3.py-1.bg-cyber-primary\\/20');
    if (terminalUser) {
        terminalUser.textContent = lang === 'es' ? 'user@squared:~ (neofetch)' : 'user@squared:~ (neofetch)';
    }

    // Update PDF/Movie window footers where reasonable
    const moviesFooter = document.querySelector('#movies-window .text-cyber-primary\\/60');
    if (moviesFooter) moviesFooter.textContent = lang === 'es' ? 'FUENTE: https://vidlo-idk.pages.dev/ // MODO: SANDBOX_IFRAME' : 'SOURCE: https://vidlo-idk.pages.dev/ // MODE: SANDBOX_IFRAME';
}

/* Replace applyLanguage to update language strings and run UI translation */
function applyLanguage(code) {
    if (!languageStatusLabel || !languagePreview) return;
    const t = LANGUAGE_TEXT[code] || LANGUAGE_TEXT.en;
    languageStatusLabel.textContent = t.status;
    languagePreview.textContent = t.preview;

    // translate whole UI where possible
    translateUI(code);
}

function initSettingsUI() {
    loadSettings();

    // Apply loaded settings to controls
    if (languageSelect) {
        languageSelect.value = currentSettings.language;
    }
    if (soundCheckbox) {
        soundCheckbox.checked = currentSettings.sound;
    }
    if (highContrastCheckbox) {
        highContrastCheckbox.checked = currentSettings.highContrast;
    }
    if (advancedWarningsCheckbox) {
        advancedWarningsCheckbox.checked = currentSettings.advancedWarnings;
    }

    // Apply effects
    applyLanguage(currentSettings.language);
    applyHighContrast();
    applyReduceMotion();
    applyAdvancedWarnings();
    applyRequireAccess();

    // Wire up change handlers
    if (languageSelect) {
        languageSelect.addEventListener('change', () => {
            currentSettings.language = languageSelect.value || 'en';
            applyLanguage(currentSettings.language);
            saveSettings();
            playClick();
        });
    }

    if (soundCheckbox) {
        soundCheckbox.addEventListener('change', () => {
            currentSettings.sound = !!soundCheckbox.checked;
            saveSettings();
            playClick();
        });
    }

    if (reduceMotionCheckbox) {
        reduceMotionCheckbox.addEventListener('change', () => {
            currentSettings.reduceMotion = !!reduceMotionCheckbox.checked;
            applyReduceMotion();
            saveSettings();
            playClick();
        });
    }

    if (highContrastCheckbox) {
        highContrastCheckbox.addEventListener('change', () => {
            currentSettings.highContrast = !!highContrastCheckbox.checked;
            applyHighContrast();
            saveSettings();
            playClick();
        });
    }

    if (advancedWarningsCheckbox) {
        advancedWarningsCheckbox.addEventListener('change', () => {
            currentSettings.advancedWarnings = !!advancedWarningsCheckbox.checked;
            applyAdvancedWarnings();
            saveSettings();
            playClick();
        });
    }

    if (requireAccessCheckbox) {
        requireAccessCheckbox.addEventListener('change', () => {
            currentSettings.requireAccess = !!requireAccessCheckbox.checked;
            applyRequireAccess();
            saveSettings();
            playClick();
        });
    }

    if (autoLockSecretCheckbox) {
        autoLockSecretCheckbox.addEventListener('change', () => {
            currentSettings.autoLockSecret = !!autoLockSecretCheckbox.checked;
            saveSettings();
            playClick();
        });
    }

    if (settingsCatLanguage && settingsCatDisplay && settingsCatSecurity) {
        settingsCatLanguage.addEventListener('click', () => {
            activateSettingsTab('language');
            playClick();
        });
        settingsCatDisplay.addEventListener('click', () => {
            activateSettingsTab('display');
            playClick();
        });
        settingsCatSecurity.addEventListener('click', () => {
            activateSettingsTab('security');
            playClick();
        });
    }
}

/* Initialize settings once DOM is ready and wire auto‑lock behavior for secret window */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettingsUI);
} else {
    initSettingsUI();
}

/* Auto-lock secret archive when the page becomes hidden or the user navigates away,
   if the "autoLockSecret" setting is enabled. Also close secret window on unload when set. */
function autoLockIfNeeded() {
    try {
        if (currentSettings && currentSettings.autoLockSecret) {
            const secretWin = document.getElementById('secret-window');
            if (secretWin && !secretWin.classList.contains('hidden')) {
                secretWin.classList.add('hidden');
                secretWin.classList.remove('flex');
            }
        }
    } catch (e) { /* silent */ }
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') autoLockIfNeeded();
});

window.addEventListener('blur', () => {
    // Slight delay to avoid locking during quick context switches
    setTimeout(() => {
        if (document.visibilityState !== 'visible') autoLockIfNeeded();
    }, 200);
});

window.addEventListener('beforeunload', () => {
    // if auto-lock enabled, ensure secret window is closed
    if (currentSettings && currentSettings.autoLockSecret) {
        const secretWin = document.getElementById('secret-window');
        if (secretWin) {
            secretWin.classList.add('hidden');
            secretWin.classList.remove('flex');
        }
    }
});

 // Fullscreen handlers
['fullscreen-window', 'fullscreen-pdf-window', 'fullscreen-image-window', 'fullscreen-movies-window', 'fullscreen-ids-window', 'fullscreen-settings-window', 'fullscreen-cameras-window', 'fullscreen-admins-window'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', function() {
        const win = this.closest('.fixed');
        if (!document.fullscreenElement) {
            win.requestFullscreen().catch(() => win.style.inset = '0');
        } else {
            document.exitFullscreen();
        }
    });
});

/**
 * Simple Terminal Command Handler
 * - Captures keystrokes for a single-line prompt
 * - Supports a hidden "help" command and a basic "clear" command
 */

const terminalInputEl = document.getElementById('terminal-input');
const terminalLogEl = document.getElementById('terminal-log');
let currentCommand = '';

function appendLogLine(text) {
    if (!terminalLogEl) return;
    const line = document.createElement('div');
    line.textContent = text;
    terminalLogEl.appendChild(line);
    terminalLogEl.parentElement.scrollTop = terminalLogEl.parentElement.scrollHeight;
}

const TERMINAL_TEXT = {
    en: {
        available_commands: 'Available commands:',
        clear: 'clear         - clear terminal output',
        status: 'status        - show brief system status summary',
        whoami: 'whoami        - display user and platform info',
        date: 'date          - print current date and time',
        uptime: 'uptime        - show session uptime',
        ip: 'ip            - show simulated network address',
        fs: 'fs            - list mounted virtual paths',
        echo: 'echo X        - print text X',
        apps: 'apps          - list available apps',
        open: 'open <app>    - open app (secret, cameras, movies, darkweb, settings)',
        motd: 'motd          - show system banner',
        theme: 'theme         - toggle high contrast theme',
        mounted_paths: 'Mounted virtual paths:',
        available_apps: 'Available apps:',
        use_open: 'Use: open <app>',
        system_status_prefix: 'SYSTEM STATUS:',
        unable_open: 'Unable to open:',
        unknown_app: 'Unknown app:',
        project_banner: '*** PROJECT A.X.L // SYSTEM DASHBOARD ***',
        secure_session: 'Secure session initialized. Unauthorized access will be monitored.',
        high_contrast_enabled: 'High contrast theme: ENABLED',
        high_contrast_disabled: 'High contrast theme: DISABLED',
        command_not_found: 'command not found:'
    },
    es: {
        available_commands: 'Comandos disponibles:',
        clear: 'clear         - limpiar la salida del terminal',
        status: 'status        - mostrar un resumen breve del sistema',
        whoami: 'whoami        - mostrar usuario y plataforma',
        date: 'date          - imprimir la fecha y hora actual',
        uptime: 'uptime        - mostrar tiempo de sesión',
        ip: 'ip            - mostrar dirección de red simulada',
        fs: 'fs            - listar rutas virtuales montadas',
        echo: 'echo X        - imprimir texto X',
        apps: 'apps          - listar aplicaciones disponibles',
        open: 'open <app>    - abrir app (secret, cameras, movies, darkweb, settings)',
        motd: 'motd          - mostrar banner del sistema',
        theme: 'theme         - alternar tema de alto contraste',
        mounted_paths: 'Rutas virtuales montadas:',
        available_apps: 'Aplicaciones disponibles:',
        use_open: 'Usar: open <app>',
        system_status_prefix: 'ESTADO DEL SISTEMA:',
        unable_open: 'No se puede abrir:',
        unknown_app: 'Aplicación desconocida:',
        project_banner: '*** PROYECTO A.X.L // PANEL DEL SISTEMA ***',
        secure_session: 'Sesión segura inicializada. El acceso no autorizado será monitoreado.',
        high_contrast_enabled: 'Tema de alto contraste: ACTIVADO',
        high_contrast_disabled: 'Tema de alto contraste: DESACTIVADO',
        command_not_found: 'comando no encontrado:'
    }
};

function tterm(key) {
    const lang = (currentSettings && currentSettings.language) ? currentSettings.language : 'en';
    return (TERMINAL_TEXT[lang] && TERMINAL_TEXT[lang][key]) || TERMINAL_TEXT.en[key] || key;
}

function processCommand(cmd) {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    appendLogLine(`$ ${trimmed}`);

    if (trimmed === 'help') {
        appendLogLine(tterm('available_commands'));
        appendLogLine(tterm('clear'));
        appendLogLine(tterm('status'));
        appendLogLine(tterm('whoami'));
        appendLogLine(tterm('date'));
        appendLogLine(tterm('uptime'));
        appendLogLine(tterm('ip'));
        appendLogLine(tterm('fs'));
        appendLogLine(tterm('echo'));
        appendLogLine(tterm('apps'));
        appendLogLine(tterm('open'));
        appendLogLine(tterm('motd'));
        appendLogLine(tterm('theme'));
    } else if (trimmed === 'clear') {
        if (terminalLogEl) terminalLogEl.innerHTML = '';
    } else if (trimmed === 'status') {
        const online = navigator.onLine ? 'ONLINE' : 'OFFLINE';
        const uptimeSec = (performance.now() / 1000).toFixed(0);

        const platform = navigator.platform || 'Unknown';
        const browserUA = navigator.userAgent || '';
        let browser = 'Unknown';
        if (/Edg\//.test(browserUA)) browser = 'Microsoft Edge';
        else if (/OPR\//.test(browserUA)) browser = 'Opera';
        else if (/Firefox\//.test(browserUA)) browser = 'Firefox';
        else if (/Chrome\//.test(browserUA)) browser = 'Chrome';
        else if (/Safari\//.test(browserUA)) browser = 'Safari';

        const threads = navigator.hardwareConcurrency || 'Unknown';
        const memGB = navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'Unknown';
        const width = window.screen?.width;
        const height = window.screen?.height;
        const resolution = (width && height) ? `${width}x${height}` : 'Unknown';

        const cpuUsage = (20 + Math.random() * 60).toFixed(0);
        const ramUsage = (30 + Math.random() * 50).toFixed(0);

        appendLogLine(`${tterm('system_status_prefix')} ${online} // UPTIME: ${uptimeSec}s`);
        appendLogLine(`CPU: ~${cpuUsage}% // Threads: ${threads}`);
        appendLogLine(`RAM: ~${ramUsage}% used // Physical: ${memGB}`);
        appendLogLine(`Display: ${resolution}`);
        appendLogLine(`Platform: ${platform} // Browser: ${browser}`);
    } else if (trimmed === 'whoami') {
        const platform = navigator.platform || 'Unknown';
        appendLogLine('user@squared');
        appendLogLine(`Platform: ${platform}`);
    } else if (trimmed === 'date') {
        appendLogLine(new Date().toString());
    } else if (trimmed === 'uptime') {
        const uptimeSeconds = Math.round(performance.now() / 1000);
        const h = Math.floor(uptimeSeconds / 3600);
        const m = Math.floor((uptimeSeconds % 3600) / 60);
        const s = uptimeSeconds % 60;
        appendLogLine(`Session uptime: ${h}h ${m}m ${s}s`);
    } else if (trimmed === 'ip') {
        const online = navigator.onLine ? 'ONLINE' : 'OFFLINE';
        appendLogLine(`${tterm('system_status_prefix')} ${online}`);
        appendLogLine('IPv4: 192.168.1.42');
        appendLogLine('IPv6: fe80::42');
    } else if (trimmed === 'fs') {
        appendLogLine(tterm('mounted_paths'));
        Object.keys(VIRTUAL_FS).forEach(path => {
            const node = VIRTUAL_FS[path];
            const type = node.type === 'folder' ? 'dir ' : 'file';
            appendLogLine(`  [${type}] ${path}`);
        });
    } else if (trimmed === 'apps') {
        appendLogLine(tterm('available_apps'));
        appendLogLine(`  secret   - ${document.getElementById('secret-folder-trigger')?.querySelector('span')?.textContent || 'Secret Government Files'}`);
        appendLogLine(`  cameras  - ${document.getElementById('cameras-app-trigger')?.querySelector('span')?.textContent || 'Cameras'}`);
        appendLogLine(`  movies   - ${document.getElementById('movies-app-trigger')?.querySelector('span')?.textContent || 'Hacked Movies'}`);
        appendLogLine(`  darkweb  - A.X.L Private Dark Web Search Engine`);
        appendLogLine(`  settings - ${document.getElementById('settings-app-trigger')?.querySelector('span')?.textContent || 'Settings'}`);
        appendLogLine(`  admins   - ${document.getElementById('admins-app-trigger')?.querySelector('span')?.textContent || 'Admins Only'}`);
        appendLogLine('');
        appendLogLine(tterm('use_open'));
    } else if (trimmed.startsWith('open ')) {
        const app = trimmed.slice(5).toLowerCase().trim();
        if (app === 'secret') {
            const btn = document.getElementById('secret-folder-trigger');
            if (btn) btn.click();
            else appendLogLine(`${tterm('unable_open')} secret app trigger not found.`);
        } else if (app === 'cameras') {
            const btn = document.getElementById('cameras-app-trigger');
            if (btn) btn.click();
            else appendLogLine(`${tterm('unable_open')} cameras app trigger not found.`);
        } else if (app === 'movies') {
            const btn = document.getElementById('movies-app-trigger');
            if (btn) btn.click();
            else appendLogLine(`${tterm('unable_open')} movies app trigger not found.`);
        } else if (app === 'darkweb') {
            const btn = document.getElementById('darkweb-app-trigger');
            if (btn) btn.click();
            else appendLogLine(`${tterm('unable_open')} darkweb app trigger not found.`);
        } else if (app === 'settings') {
            const btn = document.getElementById('settings-app-trigger');
            if (btn) btn.click();
            else appendLogLine(`${tterm('unable_open')} settings app trigger not found.`);
        } else if (app === 'admins') {
            const btn = document.getElementById('admins-app-trigger');
            if (btn) btn.click();
            else appendLogLine(`${tterm('unable_open')} admins app trigger not found.`);
        } else {
            appendLogLine(`${tterm('unknown_app')} ${app}`);
        }
    } else if (trimmed === 'motd') {
        appendLogLine(tterm('project_banner'));
        appendLogLine(tterm('secure_session'));
    } else if (trimmed === 'theme') {
        currentSettings.highContrast = !currentSettings.highContrast;
        applyHighContrast();
        saveSettings();
        appendLogLine(currentSettings.highContrast ? tterm('high_contrast_enabled') : tterm('high_contrast_disabled'));
    } else if (trimmed.startsWith('echo ')) {
        appendLogLine(trimmed.slice(5));
    } else {
        appendLogLine(`${tterm('command_not_found')} ${trimmed}`);
    }
}

window.addEventListener('keydown', (e) => {
    if (!terminalInputEl) return;

    // Ignore typing when focused on inputs/textareas (none in this UI, but safe)
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.isComposing) return;

    if (e.key === 'Backspace') {
        e.preventDefault();
        currentCommand = currentCommand.slice(0, -1);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        processCommand(currentCommand);
        currentCommand = '';
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Printable character
        currentCommand += e.key;
    } else {
        return;
    }

    terminalInputEl.textContent = currentCommand;
});

/* Window resizing: add draggable corner resizers to app windows with class "fixed".
   Minimum size enforced; supports mouse and touch. */
function setupResizableWindows() {
    const MIN_W = 220;
    const MIN_H = 120;

    function makeResizer(win) {
        // don't add twice
        if (win.__axl_resizer_added) return;
        win.__axl_resizer_added = true;

        const resizer = document.createElement('div');
        resizer.className = 'axl-resizer';
        Object.assign(resizer.style, {
            position: 'absolute',
            width: '16px',
            height: '16px',
            right: '6px',
            bottom: '6px',
            cursor: 'nwse-resize',
            zIndex: 9999,
            background: 'linear-gradient(135deg, rgba(0,255,255,0.12), rgba(255,255,255,0.02))',
            borderRadius: '3px',
            border: '1px solid rgba(0,255,255,0.12)'
        });
        win.style.boxSizing = 'border-box';
        win.appendChild(resizer);

        let startX = 0, startY = 0, startW = 0, startH = 0;
        let resizing = false;

        const onPointerDown = (e) => {
            e.preventDefault();
            resizing = true;
            const pt = e.touches ? e.touches[0] : e;
            startX = pt.clientX;
            startY = pt.clientY;
            const rect = win.getBoundingClientRect();
            // Use computed sizes so transforms don't interfere
            startW = rect.width;
            startH = rect.height;
            // ensure pixel sizes on element
            win.style.width = `${startW}px`;
            win.style.height = `${startH}px`;
            win.style.maxWidth = 'none';
            win.style.maxHeight = 'none';
            document.addEventListener('mousemove', onPointerMove);
            document.addEventListener('mouseup', onPointerUp);
            document.addEventListener('touchmove', onPointerMove, { passive: false });
            document.addEventListener('touchend', onPointerUp);
        };

        const onPointerMove = (e) => {
            if (!resizing) return;
            e.preventDefault();
            const pt = e.touches ? e.touches[0] : e;
            const dx = pt.clientX - startX;
            const dy = pt.clientY - startY;
            let newW = Math.max(MIN_W, Math.round(startW + dx));
            let newH = Math.max(MIN_H, Math.round(startH + dy));
            // clamp to viewport
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            newW = Math.min(newW, vw - 40);
            newH = Math.min(newH, vh - 40);
            win.style.width = `${newW}px`;
            win.style.height = `${newH}px`;
            // If window has a child iframe or video, trigger a resize event for them to adapt
            const evt = new Event('axl-window-resize', { bubbles: true });
            win.dispatchEvent(evt);
        };

        const onPointerUp = () => {
            resizing = false;
            document.removeEventListener('mousemove', onPointerMove);
            document.removeEventListener('mouseup', onPointerUp);
            document.removeEventListener('touchmove', onPointerMove);
            document.removeEventListener('touchend', onPointerUp);
        };

        resizer.addEventListener('mousedown', onPointerDown, false);
        resizer.addEventListener('touchstart', onPointerDown, { passive: false });
    }

    // Attach resizers to all fixed windows (excluding overlays like modals if desired)
    const fixedWindows = Array.from(document.querySelectorAll('.fixed')).filter(el => el.id && el.id !== 'access-modal' && el.id !== 'warning-page');
    fixedWindows.forEach(win => makeResizer(win));

    // Observe DOM for new windows appearing and add resizers
    if (window.MutationObserver) {
        const mo = new MutationObserver(muts => {
            muts.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node.nodeType === 1 && node.classList && node.classList.contains('fixed')) {
                        makeResizer(node);
                    }
                });
            });
        });
        mo.observe(document.body, { childList: true, subtree: true });
    }
}

// Initialize resizers shortly after load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setupResizableWindows();
    });
} else {
    setupResizableWindows();
}

/* Camera overlay: creates an invisible UI over the camera video that adapts based on player size.
   It captures pointer events so the cursor won't directly hover the native video controls,
   and sets a data-size attribute (small/medium/large) depending on the video render width. */
(function setupCameraOverlay() {
    const video = document.getElementById('camera-main-feed');
    if (!video) return;

    // Ensure overlay exists (in case DOM inserted earlier)
    let overlay = document.getElementById('camera-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'camera-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.style.position = 'absolute';
        overlay.style.inset = '0';
        overlay.style.background = 'transparent';
        overlay.style.pointerEvents = 'auto'; // capture cursor
        overlay.style.cursor = 'default';
        // overlay sits above the video
        overlay.style.zIndex = '20';
        video.parentElement.appendChild(overlay);
    }

    // Prevent pointer events from reaching the video (so native hover is suppressed)
    overlay.addEventListener('mouseover', (e) => {
        // nothing visible — used to capture hover; keep default cursor
    }, { passive: true });

    // Click passthrough helper: if you want clicks to pass to controls you can toggle this.
    // By default we block direct interaction so hover/clicks target overlay (making video not hover)
    overlay.addEventListener('click', (e) => {
        // If user clicks overlay, forward a synthetic click to parent container but avoid native video hover.
        // This prevents browser native control hover highlighting but still allows toggling playback programmatically.
        try {
            const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
            // Dispatch click on the video element to simulate user intent (some browsers require a real user gesture)
            video.dispatchEvent(evt);
        } catch (err) {
            // ignore
        }
        e.stopPropagation();
        e.preventDefault();
    });

    // Function to update overlay state depending on rendered video size
    function updateOverlaySizeState() {
        const rect = video.getBoundingClientRect();
        const width = rect.width;
        // thresholds: small < 260, medium < 520, large >= 520 (tweakable)
        let size = 'large';
        if (width < 260) size = 'small';
        else if (width < 520) size = 'medium';
        else size = 'large';
        overlay.dataset.size = size;
        // Optionally change overlay hit area / appearance based on size (no visible change here)
        if (size === 'small') {
            overlay.style.pointerEvents = 'auto';
        } else {
            overlay.style.pointerEvents = 'auto';
        }
    }

    // Use ResizeObserver to react to layout changes
    let ro = null;
    if (window.ResizeObserver) {
        ro = new ResizeObserver(() => {
            updateOverlaySizeState();
        });
        ro.observe(video);
    } else {
        // Fallback: listen to window resize and video's metadata load
        window.addEventListener('resize', updateOverlaySizeState);
        video.addEventListener('loadedmetadata', updateOverlaySizeState);
    }

    // Also handle play/pause and metadata changes to ensure overlay stays in correct place
    video.addEventListener('loadedmetadata', updateOverlaySizeState);
    video.addEventListener('play', updateOverlaySizeState);
    video.addEventListener('pause', updateOverlaySizeState);

    // Run once to initialize
    setTimeout(updateOverlaySizeState, 100);

    // Expose for debugging (optional)
    window.__AXL_cameraOverlay = { overlay, updateOverlaySizeState, observer: ro };

})();

/* Admin panel tab activation helpers */
function activateAdminTab(tab) {
    const tabs = {
        bans: document.getElementById('admin-section-bans'),
        fun: document.getElementById('admin-section-fun'),
        ouradmins: document.getElementById('admin-section-ouradmins')
    };
    Object.keys(tabs).forEach(k => {
        if (!tabs[k]) return;
        tabs[k].classList.add('hidden');
    });
    if (tabs[tab]) tabs[tab].classList.remove('hidden');

    // update button active styles
    ['admin-tab-bans','admin-tab-fun','admin-tab-ouradmins'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('bg-red-600','text-black');
        el.classList.add('bg-black/60','text-gray-300');
    });
    const activeBtn = document.getElementById(`admin-tab-${tab}`);
    if (activeBtn) {
        activeBtn.classList.remove('bg-black/60','text-gray-300');
        activeBtn.classList.add('bg-red-600','text-black');
    }
}

// wire admin tab buttons if present
function initAdminTabs() {
    const btnBans = document.getElementById('admin-tab-bans');
    const btnFun = document.getElementById('admin-tab-fun');
    const btnOurAdmins = document.getElementById('admin-tab-ouradmins');

    if (btnBans) btnBans.addEventListener('click', () => { activateAdminTab('bans'); playClick(); });
    if (btnFun) btnFun.addEventListener('click', () => { activateAdminTab('fun'); playClick(); });
    if (btnOurAdmins) btnOurAdmins.addEventListener('click', () => { activateAdminTab('ouradmins'); playClick(); });

    // Announcement persistence: store announcements in localStorage so they persist across reloads
    function loadAnnouncements() {
        try {
            const raw = localStorage.getItem('axl_announcements_v1');
            if (!raw) return [];
            return JSON.parse(raw);
        } catch (e) {
            return [];
        }
    }
    function saveAnnouncementObj(obj) {
        try {
            const arr = loadAnnouncements();
            arr.unshift(obj);
            localStorage.setItem('axl_announcements_v1', JSON.stringify(arr));
        } catch (e) {
            // ignore
        }
    }
    function renderAnnouncementsToLogs() {
        const logs = document.getElementById('admin-logs');
        if (!logs) return;
        // ensure existing static announcements are not duplicated; clear and re-render
        // keep the preexisting static entries at bottom by preserving any initial children that aren't our announcements
        // For simplicity, just prepend stored announcements
        const ann = loadAnnouncements();
        ann.forEach(a => {
            const line = document.createElement('div');
            line.textContent = `[${a.ts}] ANNOUNCEMENT: ${a.text}`;
            // avoid duplicating identical first-line
            logs.prepend(line);
        });
    }

    // Add "Ban user" action into the Bans section to open the external Google Form
    (function injectBanUserButton(){
        try {
            const bansSection = document.getElementById('admin-section-bans');
            if (!bansSection) return;
            // Avoid injecting multiple times
            if (document.getElementById('admin-ban-user-btn')) return;

            const container = document.createElement('div');
            container.className = 'mt-3 flex flex-col gap-2';

            const btn = document.createElement('button');
            btn.id = 'admin-ban-user-btn';
            btn.className = 'px-3 py-1 bg-red-600 text-black rounded text-sm font-bold w-full';
            btn.textContent = 'Ban user';

            btn.addEventListener('click', () => {
                // open google form in a new tab (kept as action) but place button visually under the bans content
                const url = 'https://docs.google.com/forms/d/e/1FAIpQLSc7ZV3jGc5mAUr8-WVI_ewhYJ3vPDClYEdNcOLLByhr5wL4VQ/viewform?usp=publish-editor';
                try {
                    window.open(url, '_blank', 'noopener,noreferrer');
                } catch (e) {
                    const a = document.createElement('a');
                    a.href = url;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                }
                playClick();
            });

            container.appendChild(btn);

            // append at the end of bans section so it's "under the stuff"
            bansSection.appendChild(container);
        } catch (e) {
            // silent fail
            console.warn('Failed to inject Ban user button', e);
        }
    })();

    // Admin "Fun" placeholder: show a Work In Progress screen instead of cursor particles
    (function initAdminFunWIP(){
        const area = document.getElementById('admin-cursor-area');
        const canvas = document.getElementById('admin-cursor-canvas');

        if (!area) return;

        // Remove any existing canvas usage to avoid double content
        if (canvas && canvas.parentElement) {
            try { canvas.remove(); } catch (_) {}
        }

        // Inject a centered Work In Progress card
        area.innerHTML = `
            <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;">
                <div style="text-align:center;max-width:100%;color:#cbd5da;">
                    <div style="font-weight:700;color:#ff6666;margin-bottom:8px;letter-spacing:0.06em;">WORK IN PROGRESS</div>
                    <div style="color:#9fbfc3;margin-bottom:12px;">This feature is under development.</div>
                    <div style="display:inline-block;padding:6px 10px;border-radius:6px;background:linear-gradient(90deg, rgba(255,102,102,0.08), rgba(0,255,255,0.04));border:1px solid rgba(255,102,102,0.08);font-size:12px;color:#dbeff0;">
                        Coming soon...
                    </div>
                </div>
            </div>
        `;
    })();
}

document.addEventListener('DOMContentLoaded', () => {
    initAdminTabs();
});

/* Startup Beta Notice Modal */
(function showBetaNotice(){
    // avoid duplicate
    if (document.getElementById('beta-notice-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'beta-notice-modal';
    Object.assign(modal.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '99999',
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
    });

    const card = document.createElement('div');
    Object.assign(card.style, {
        width: 'min(720px, 94%)',
        background: '#061212',
        border: '1px solid rgba(0,255,255,0.14)',
        padding: '18px',
        borderRadius: '8px',
        boxShadow: '0 8px 30px rgba(0,255,255,0.06)',
        color: '#e6ffff',
        fontFamily: 'Courier New, monospace',
        fontSize: '13px'
    });

    card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="font-weight:700;letter-spacing:0.12em;color:#00ffff;font-size:12px;">EARLY ACCESS • BETA</div>
            <div style="font-size:11px;color:#9acfd6;">v1.0</div>
        </div>
        <div style="line-height:1.4;color:#cfeff0;margin-bottom:12px;">
            This project is in early access and still in beta — there are many features left to add, improve, and fix. If you'd like to suggest, improve, or fix something, just tell me and I'll try to incorporate it.
        </div>
        <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;">
            <button id="beta-continue" disabled style="background:#00ffff;color:#000;padding:8px 12px;border-radius:6px;border:none;font-weight:700;cursor:not-allowed;opacity:0.7;">Continue (5)</button>
        </div>
    `;

    modal.appendChild(card);
    document.body.appendChild(modal);

    const continueBtn = document.getElementById('beta-continue');

    let counter = 3;
    continueBtn.textContent = `Continue (${counter})`;

    const countdown = setInterval(() => {
        counter--;
        if (counter <= 0) {
            clearInterval(countdown);
            continueBtn.disabled = false;
            continueBtn.style.cursor = 'pointer';
            continueBtn.style.opacity = '1';
            continueBtn.textContent = 'Continue';
        } else {
            continueBtn.textContent = `Continue (${counter})`;
        }
    }, 1000);

    function closeModal() {
        try { modal.remove(); } catch(e){ modal.style.display='none'; }
    }

    continueBtn.addEventListener('click', () => {
        if (continueBtn.disabled) return;
        closeModal();
    });

    // ensure modal added early if DOM already loaded
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        // already appended
    } else {
        window.addEventListener('DOMContentLoaded', () => {});
    }
})();