import { MultimodalLiveClient } from './core/websocket-client.js';
import { AudioStreamer } from './audio/audio-streamer.js';
import { AudioRecorder } from './audio/audio-recorder.js';
import { CONFIG } from './config/config.js';
import { Logger } from './utils/logger.js';
import { VideoManager } from './video/video-manager.js';
import { ScreenRecorder } from './video/screen-recorder.js';

/**
 * @fileoverview Main entry point for the application.
 * Initializes and manages the UI, audio, video, and WebSocket interactions.
 */

// DOM Elements
const logsContainer = document.getElementById('logs-container');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const micButton = document.getElementById('mic-button');
const micIcon = document.getElementById('mic-icon');
const audioVisualizer = document.getElementById('audio-visualizer');
const connectButton = document.getElementById('connect-button');
const cameraButton = document.getElementById('camera-button');
const cameraIcon = document.getElementById('camera-icon');
const stopVideoButton = document.getElementById('stop-video');
const screenButton = document.getElementById('screen-button');
const screenIcon = document.getElementById('screen-icon');
const screenContainer = document.getElementById('screen-container');
const screenPreview = document.getElementById('screen-preview');
const inputAudioVisualizer = document.getElementById('input-audio-visualizer');
const apiKeyInput = document.getElementById('api-key');
const voiceSelect = document.getElementById('voice-select');
const fpsInput = document.getElementById('fps-input');
const configToggle = document.getElementById('config-toggle');
const configContainer = document.getElementById('config-container');
const systemInstructionInput = document.getElementById('system-instruction');
systemInstructionInput.value = CONFIG.SYSTEM_INSTRUCTION.TEXT;
const applyConfigButton = document.getElementById('apply-config');
const responseTypeSelect = document.getElementById('response-type-select');
const audioInputSelect = document.getElementById('audio-input-select');
const audioOutputSelect = document.getElementById('audio-output-select');

// Load saved values from localStorage
const savedApiKey = localStorage.getItem('gemini_api_key');
const savedVoice = localStorage.getItem('gemini_voice');
const savedFPS = localStorage.getItem('video_fps');
const savedSystemInstruction = localStorage.getItem('system_instruction');


if (savedApiKey) {
    apiKeyInput.value = savedApiKey;
}
if (savedVoice) {
    voiceSelect.value = savedVoice;
}

if (savedFPS) {
    fpsInput.value = savedFPS;
}
if (savedSystemInstruction) {
    systemInstructionInput.value = savedSystemInstruction;
    CONFIG.SYSTEM_INSTRUCTION.TEXT = savedSystemInstruction;
}

// Handle configuration panel toggle
configToggle.addEventListener('click', () => {
    configContainer.classList.toggle('active');
    configToggle.classList.toggle('active');
});

applyConfigButton.addEventListener('click', () => {
    configContainer.classList.toggle('active');
    configToggle.classList.toggle('active');
});

// State variables
let isRecording = false;
let audioStreamer = null;
let audioCtx = null;
let isConnected = false;
let audioRecorder = null;
let isVideoActive = false;
let videoManager = null;
let isScreenSharing = false;
let screenRecorder = null;
let isUsingTool = false;

// Multimodal Client
const client = new MultimodalLiveClient({
    onAudioData: (audioData) => {
        const source = audioContext.createBufferSource();
        source.buffer = audioData;
        source.connect(gainNode);
        source.start();
    }
});

// 添加音量控制相关变量
let audioContext;
let gainNode;

// 在初始化部分添加音量控制初始化
async function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        gainNode = audioContext.createGain();
        gainNode.connect(audioContext.destination);
        
        // 设置初始音量
        gainNode.gain.value = 1.0;
        
        // 添加音量键事件监听
        document.addEventListener('keydown', handleVolumeKeys);
        // 添加移动端音量变化事件监听
        window.addEventListener('volumechange', handleVolumeChange);
    } catch (error) {
        Logger.error('Failed to initialize audio context:', error);
    }
}

// 处理音量键事件
function handleVolumeKeys(event) {
    // 音量增加键
    if (event.key === 'VolumeUp' || event.keyCode === 175) {
        adjustVolume(0.1);
    }
    // 音量减小键
    else if (event.key === 'VolumeDown' || event.keyCode === 174) {
        adjustVolume(-0.1);
    }
}

// 处理移动端音量变化事件
function handleVolumeChange(event) {
    // 获取系统音量级别（0-1之间）
    const systemVolume = window.navigator.mediaSession?.volume || 1;
    gainNode.gain.value = systemVolume;
}

// 调整音量的辅助函数
function adjustVolume(delta) {
    const newVolume = Math.max(0, Math.min(1, gainNode.gain.value + delta));
    gainNode.gain.value = newVolume;
    
    // 添加音量变化的视觉反馈
    showVolumeIndicator(newVolume);
}

function showVolumeIndicator(volume) {
    // 创建或更新音量指示器
    let volumeIndicator = document.getElementById('volume-indicator');
    if (!volumeIndicator) {
        volumeIndicator = document.createElement('div');
        volumeIndicator.id = 'volume-indicator';
        document.body.appendChild(volumeIndicator);
    }
    
    volumeIndicator.textContent = `Volume: ${Math.round(volume * 100)}%`;
    volumeIndicator.style.opacity = '1';
    
    // 2秒后隐藏指示器
    setTimeout(() => {
        volumeIndicator.style.opacity = '0';
    }, 2000);
}

/**
 * Logs a message to the UI.
 * @param {string} message - The message to log.
 * @param {string} [type='system'] - The type of the message (system, user, ai).
 */
function logMessage(message, type = 'system') {
    const logEntry = document.createElement('div');
    logEntry.classList.add('log-entry', type);

    const timestamp = document.createElement('span');
    timestamp.classList.add('timestamp');
    timestamp.textContent = new Date().toLocaleTimeString();
    logEntry.appendChild(timestamp);

    const emoji = document.createElement('span');
    emoji.classList.add('emoji');
    switch (type) {
        case 'system':
            emoji.textContent = '⚙️';
            break;
        case 'user':
            emoji.textContent = '🫵';
            break;
        case 'ai':
            emoji.textContent = '🤖';
            break;
    }
    logEntry.appendChild(emoji);

    const messageText = document.createElement('span');
    messageText.textContent = message;
    logEntry.appendChild(messageText);

    logsContainer.appendChild(logEntry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

/**
 * Updates the microphone icon based on the recording state.
 */
function updateMicIcon() {
    micIcon.textContent = isRecording ? 'mic_off' : 'mic';
    micButton.style.backgroundColor = isRecording ? '#ea4335' : '#4285f4';
}

/**
 * Updates the audio visualizer based on the audio volume.
 * @param {number} volume - The audio volume (0.0 to 1.0).
 * @param {boolean} [isInput=false] - Whether the visualizer is for input audio.
 */
function updateAudioVisualizer(volume, isInput = false) {
    const visualizer = isInput ? inputAudioVisualizer : audioVisualizer;
    const audioBar = visualizer.querySelector('.audio-bar') || document.createElement('div');
    
    if (!visualizer.contains(audioBar)) {
        audioBar.classList.add('audio-bar');
        visualizer.appendChild(audioBar);
    }
    
    audioBar.style.width = `${volume * 100}%`;
    if (volume > 0) {
        audioBar.classList.add('active');
    } else {
        audioBar.classList.remove('active');
    }
}

/**
 * Initializes the audio context and streamer if not already initialized.
 * @returns {Promise<AudioStreamer>} The audio streamer instance.
 */
async function ensureAudioInitialized() {
    if (!audioCtx) {
        audioCtx = new AudioContext();
    }
    if (!audioStreamer) {
        audioStreamer = new AudioStreamer(audioCtx);
        await audioStreamer.addWorklet('vumeter-out', 'js/audio/worklets/vol-meter.js', (ev) => {
            updateAudioVisualizer(ev.data.volume);
        });
    }
    return audioStreamer;
}

// 初始化音频设备
async function initAudioDevices() {
    try {
        // 获取设备列表权限
        await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // 获取所有音频设备
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        // 清空现有选项
        audioInputSelect.innerHTML = '';
        audioOutputSelect.innerHTML = '';
        
        // 添加输入设备选项
        devices.filter(device => device.kind === 'audioinput')
            .forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Microphone ${audioInputSelect.length + 1}`;
                audioInputSelect.appendChild(option);
            });
            
        // 添加输出设备选项
        devices.filter(device => device.kind === 'audiooutput')
            .forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Speaker ${audioOutputSelect.length + 1}`;
                audioOutputSelect.appendChild(option);
            });
            
        // 保存选择到 localStorage
        audioInputSelect.addEventListener('change', () => {
            localStorage.setItem('preferred_audio_input', audioInputSelect.value);
        });
        
        audioOutputSelect.addEventListener('change', () => {
            localStorage.setItem('preferred_audio_output', audioOutputSelect.value);
            // 更新当前音频输出设备
            if (audioStreamer) {
                audioStreamer.setSinkId(audioOutputSelect.value);
            }
        });
        
        // 加载保存的首选项
        const savedInputId = localStorage.getItem('preferred_audio_input');
        const savedOutputId = localStorage.getItem('preferred_audio_output');
        
        if (savedInputId) audioInputSelect.value = savedInputId;
        if (savedOutputId) audioOutputSelect.value = savedOutputId;
        
    } catch (error) {
        Logger.error('Error initializing audio devices:', error);
        logMessage(`Error: ${error.message}`, 'system');
    }
}

/**
 * Handles the microphone toggle. Starts or stops audio recording.
 * @returns {Promise<void>}
 */
async function handleMicToggle() {
    if (!isRecording) {
        try {
            await ensureAudioInitialized();
            audioRecorder = new AudioRecorder();
            
            // 使用选定的输入设备
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: audioInputSelect.value ? {exact: audioInputSelect.value} : undefined,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            const inputAnalyser = audioCtx.createAnalyser();
            inputAnalyser.fftSize = 256;
            const inputDataArray = new Uint8Array(inputAnalyser.frequencyBinCount);
            
            // 确保使用选定的输出设备
            if (audioStreamer) {
                await audioStreamer.setSinkId(audioOutputSelect.value);
            }
            
            await audioRecorder.start((base64Data) => {
                if (isUsingTool) {
                    client.sendRealtimeInput([{
                        mimeType: "audio/pcm;rate=16000",
                        data: base64Data,
                        interrupt: true     // Model isn't interruptable when using tools, so we do it manually
                    }]);
                } else {
                    client.sendRealtimeInput([{
                        mimeType: "audio/pcm;rate=16000",
                        data: base64Data
                    }]);
                }
                
                inputAnalyser.getByteFrequencyData(inputDataArray);
                const inputVolume = Math.max(...inputDataArray) / 255;
                updateAudioVisualizer(inputVolume, true);
            });

            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(inputAnalyser);
            
            await audioStreamer.resume();
            isRecording = true;
            Logger.info('Microphone started');
            logMessage('Microphone started', 'system');
            updateMicIcon();
        } catch (error) {
            Logger.error('Microphone error:', error);
            logMessage(`Error: ${error.message}`, 'system');
            isRecording = false;
            updateMicIcon();
        }
    } else {
        if (audioRecorder && isRecording) {
            audioRecorder.stop();
        }
        isRecording = false;
        logMessage('Microphone stopped', 'system');
        updateMicIcon();
        updateAudioVisualizer(0, true);
    }
}

/**
 * Resumes the audio context if it's suspended.
 * @returns {Promise<void>}
 */
async function resumeAudioContext() {
    if (audioCtx && audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }
}

/**
 * Connects to the WebSocket server.
 * @returns {Promise<void>}
 */
async function connectToWebsocket() {
    if (!apiKeyInput.value) {
        logMessage('Please input API Key', 'system');
        return;
    }

    // Save values to localStorage
    localStorage.setItem('gemini_api_key', apiKeyInput.value);
    localStorage.setItem('gemini_voice', voiceSelect.value);
    localStorage.setItem('system_instruction', systemInstructionInput.value);

    const config = {
        model: CONFIG.API.MODEL_NAME,
        generationConfig: {
            responseModalities: responseTypeSelect.value,
            speechConfig: {
                voiceConfig: { 
                    prebuiltVoiceConfig: { 
                        voiceName: voiceSelect.value    // You can change voice in the config.js file
                    }
                }
            },

        },
        systemInstruction: {
            parts: [{
                text: systemInstructionInput.value     // You can change system instruction in the config.js file
            }],
        }
    };  

    try {
        await client.connect(config,apiKeyInput.value);
        isConnected = true;
        await resumeAudioContext();
        connectButton.textContent = 'Disconnect';
        connectButton.classList.add('connected');
        messageInput.disabled = false;
        sendButton.disabled = false;
        micButton.disabled = false;
        cameraButton.disabled = false;
        screenButton.disabled = false;
        logMessage('Connected to Gemini 2.0 Flash Multimodal Live API', 'system');
    } catch (error) {
        const errorMessage = error.message || 'Unknown error';
        Logger.error('Connection error:', error);
        logMessage(`Connection error: ${errorMessage}`, 'system');
        isConnected = false;
        connectButton.textContent = 'Connect';
        connectButton.classList.remove('connected');
        messageInput.disabled = true;
        sendButton.disabled = true;
        micButton.disabled = true;
        cameraButton.disabled = true;
        screenButton.disabled = true;
    }
}

/**
 * Disconnects from the WebSocket server.
 */
function disconnectFromWebsocket() {
    client.disconnect();
    isConnected = false;
    if (audioStreamer) {
        audioStreamer.stop();
        if (audioRecorder) {
            audioRecorder.stop();
            audioRecorder = null;
        }
        isRecording = false;
        updateMicIcon();
    }
    connectButton.textContent = 'Connect';
    connectButton.classList.remove('connected');
    messageInput.disabled = true;
    sendButton.disabled = true;
    micButton.disabled = true;
    cameraButton.disabled = true;
    screenButton.disabled = true;
    logMessage('Disconnected from server', 'system');
    
    if (videoManager) {
        stopVideo();
    }
    
    if (screenRecorder) {
        stopScreenSharing();
    }
}

/**
 * Handles sending a text message.
 */
function handleSendMessage() {
    const message = messageInput.value.trim();
    if (message) {
        logMessage(message, 'user');
        client.send({ text: message });
        messageInput.value = '';
    }
}

// Event Listeners
client.on('open', () => {
    logMessage('WebSocket connection opened', 'system');
});

client.on('log', (log) => {
    logMessage(`${log.type}: ${JSON.stringify(log.message)}`, 'system');
});

client.on('close', (event) => {
    logMessage(`WebSocket connection closed (code ${event.code})`, 'system');
});

client.on('audio', async (data) => {
    try {
        await resumeAudioContext();
        const streamer = await ensureAudioInitialized();
        streamer.addPCM16(new Uint8Array(data));
    } catch (error) {
        logMessage(`Error processing audio: ${error.message}`, 'system');
    }
});

client.on('content', (data) => {
    if (data.modelTurn) {
        if (data.modelTurn.parts.some(part => part.functionCall)) {
            isUsingTool = true;
            Logger.info('Model is using a tool');
        } else if (data.modelTurn.parts.some(part => part.functionResponse)) {
            isUsingTool = false;
            Logger.info('Tool usage completed');
        }

        const text = data.modelTurn.parts.map(part => part.text).join('');
        if (text) {
            logMessage(text, 'ai');
        }
    }
});

client.on('interrupted', () => {
    audioStreamer?.stop();
    isUsingTool = false;
    Logger.info('Model interrupted');
    logMessage('Model interrupted', 'system');
});

client.on('setupcomplete', () => {
    logMessage('Setup complete', 'system');
});

client.on('turncomplete', () => {
    isUsingTool = false;
    logMessage('Turn complete', 'system');
});

client.on('error', (error) => {
    if (error instanceof ApplicationError) {
        Logger.error(`Application error: ${error.message}`, error);
    } else {
        Logger.error('Unexpected error', error);
    }
    logMessage(`Error: ${error.message}`, 'system');
});

client.on('message', (message) => {
    if (message.error) {
        Logger.error('Server error:', message.error);
        logMessage(`Server error: ${message.error}`, 'system');
    }
});

sendButton.addEventListener('click', handleSendMessage);
messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        handleSendMessage();
    }
});

micButton.addEventListener('click', handleMicToggle);

connectButton.addEventListener('click', () => {
    if (isConnected) {
        disconnectFromWebsocket();
    } else {
        connectToWebsocket();
    }
});

messageInput.disabled = true;
sendButton.disabled = true;
micButton.disabled = true;
connectButton.textContent = 'Connect';

/**
 * Handles the video toggle. Starts or stops video streaming.
 * @returns {Promise<void>}
 */
async function handleVideoToggle() {
    Logger.info('Video toggle clicked, current state:', { isVideoActive, isConnected });
    
    localStorage.setItem('video_fps', fpsInput.value);

    if (!isVideoActive) {
        try {
            Logger.info('Attempting to start video');
            if (!videoManager) {
                videoManager = new VideoManager();
            }
            
            await videoManager.start(fpsInput.value,(frameData) => {
                if (isConnected) {
                    client.sendRealtimeInput([frameData]);
                }
            });

            isVideoActive = true;
            cameraIcon.textContent = 'videocam_off';
            cameraButton.classList.add('active');
            Logger.info('Camera started successfully');
            logMessage('Camera started', 'system');

        } catch (error) {
            Logger.error('Camera error:', error);
            logMessage(`Error: ${error.message}`, 'system');
            isVideoActive = false;
            videoManager = null;
            cameraIcon.textContent = 'videocam';
            cameraButton.classList.remove('active');
        }
    } else {
        Logger.info('Stopping video');
        stopVideo();
    }
}

/**
 * Stops the video streaming.
 */
function stopVideo() {
    if (videoManager) {
        videoManager.stop();
        videoManager = null;
    }
    isVideoActive = false;
    cameraIcon.textContent = 'videocam';
    cameraButton.classList.remove('active');
    logMessage('Camera stopped', 'system');
}

cameraButton.addEventListener('click', async () => {
    try {
        await handleVideoToggle();
    } catch (error) {
        logMessage(`Camera error: ${error.message}`, 'system');
        // Reset UI state
        isVideoActive = false;
        cameraIcon.textContent = 'videocam';
        cameraButton.classList.remove('active');
    }
});

stopVideoButton.addEventListener('click', async () => {
    try {
        await stopVideo();
    } catch (error) {
        logMessage(`Error stopping camera: ${error.message}`, 'system');
    }
});

cameraButton.disabled = true;

/**
 * Handles the screen share toggle. Starts or stops screen sharing.
 * @returns {Promise<void>}
 */
async function handleScreenShare() {
    if (!isScreenSharing) {
        try {
            screenContainer.style.display = 'block';
            
            screenRecorder = new ScreenRecorder();
            await screenRecorder.start(screenPreview, (frameData) => {
                if (isConnected) {
                    client.sendRealtimeInput([{
                        mimeType: "image/jpeg",
                        data: frameData
                    }]);
                }
            });

            isScreenSharing = true;
            screenIcon.textContent = 'stop_screen_share';
            screenButton.classList.add('active');
            Logger.info('Screen sharing started');
            logMessage('Screen sharing started', 'system');

        } catch (error) {
            Logger.error('Screen sharing error:', error);
            logMessage(`Error: ${error.message}`, 'system');
            isScreenSharing = false;
            screenIcon.textContent = 'screen_share';
            screenButton.classList.remove('active');
            screenContainer.style.display = 'none';
        }
    } else {
        stopScreenSharing();
    }
}

/**
 * Stops the screen sharing.
 */
function stopScreenSharing() {
    if (screenRecorder) {
        screenRecorder.stop();
        screenRecorder = null;
    }
    isScreenSharing = false;
    screenIcon.textContent = 'screen_share';
    screenButton.classList.remove('active');
    screenContainer.style.display = 'none';
    logMessage('Screen sharing stopped', 'system');
}

screenButton.addEventListener('click', handleScreenShare);
screenButton.disabled = true;

// 监听设备变化
navigator.mediaDevices.addEventListener('devicechange', () => {
    initAudioDevices();
});

// 在页面加载时初始化设备
document.addEventListener('DOMContentLoaded', async () => {
    await initAudioDevices();
    await initAudio();
    // ... 其他初始化代码 ...
});

// 添加触摸事件支持
function addTouchSupport() {
    // 音频录制的触摸支持
    micButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleMicToggle();
    });

    // 视频预览拖动支持
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    const videoContainer = document.getElementById('video-container');
    
    videoContainer.addEventListener('touchstart', dragStart);
    videoContainer.addEventListener('touchend', dragEnd);
    videoContainer.addEventListener('touchmove', drag);

    function dragStart(e) {
        initialX = e.touches[0].clientX - xOffset;
        initialY = e.touches[0].clientY - yOffset;
        isDragging = true;
    }

    function dragEnd(e) {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.touches[0].clientX - initialX;
            currentY = e.touches[0].clientY - initialY;
            xOffset = currentX;
            yOffset = currentY;
            setTranslate(currentX, currentY, videoContainer);
        }
    }

    function setTranslate(xPos, yPos, el) {
        el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
    }
}

// 添加移动端手势支持
function addGestureSupport() {
    let touchStartY = 0;
    const logsContainer = document.getElementById('logs-container');

    logsContainer.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
    });

    logsContainer.addEventListener('touchmove', (e) => {
        const touchY = e.touches[0].clientY;
        const diff = touchStartY - touchY;
        logsContainer.scrollTop += diff;
        touchStartY = touchY;
    });
}

// 添加性能优化相关代码
function optimizeForMobile() {
    // 检测设备性能
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
        // 调整视频帧率
        fpsInput.value = "10";
        
        // 降低音频采样率
        CONFIG.AUDIO.SAMPLE_RATE = 16000;
        CONFIG.AUDIO.BUFFER_SIZE = 1024;
        
        // 优化日志显示
        const maxLogs = 50;
        setInterval(() => {
            const logs = logsContainer.children;
            if (logs.length > maxLogs) {
                for (let i = 0; i < logs.length - maxLogs; i++) {
                    logs[0].remove();
                }
            }
        }, 10000);
    }
}

// 添加电池状态监控
async function monitorBatteryStatus() {
    if ('getBattery' in navigator) {
        const battery = await navigator.getBattery();
        
        function handleBatteryChange() {
            if (battery.level < 0.2 && !battery.charging) {
                // 低电量模式
                enablePowerSaving();
            }
        }
        
        battery.addEventListener('levelchange', handleBatteryChange);
        battery.addEventListener('chargingchange', handleBatteryChange);
    }
}

function enablePowerSaving() {
    // 降低视频帧率
    if (videoManager) {
        videoManager.setFrameRate(5);
    }
    
    // 降低音频采样率
    if (audioRecorder) {
        audioRecorder.setSampleRate(16000);
    }
    
    // 减少UI更新频率
    // ...
}

// 添加测试音频功能
async function testAudioDevices() {
    try {
        // 1. 测试音频输出（播放一个测试音频）
        const testAudioContext = new AudioContext();
        const oscillator = testAudioContext.createOscillator();
        const gainNode = testAudioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(testAudioContext.destination);
        
        // 设置音量较小
        gainNode.gain.value = 0.1;
        
        // 播放一个短促的提示音
        oscillator.start();
        setTimeout(() => {
            oscillator.stop();
            testAudioContext.close();
        }, 200);

        // 2. 测试音频输入
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: audioInputSelect.value ? {exact: audioInputSelect.value} : undefined
            }
        });
        
        // 创建音频分析器
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        
        // 显示音频输入电平
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        function updateMicLevel() {
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b) / bufferLength;
            const volume = average / 256;
            updateAudioVisualizer(volume, true);
            requestAnimationFrame(updateMicLevel);
        }
        
        updateMicLevel();
        
        logMessage('Audio devices test started', 'system');
        
    } catch (error) {
        logMessage(`Error testing audio devices: ${error.message}`, 'system');
        console.error('Audio test error:', error);
    }
}

// 添加测试按钮的事件监听
document.getElementById('test-audio').addEventListener('click', testAudioDevices);

// 添加日志展开/收起功能
const logsToggle = document.getElementById('logs-toggle');
const logsContainer = document.getElementById('logs-container');

logsToggle.addEventListener('click', () => {
    logsContainer.classList.toggle('collapsed');
});

// 点击日志容器外部时自动收起
document.addEventListener('click', (e) => {
    if (!logsContainer.contains(e.target) && !logsToggle.contains(e.target)) {
        logsContainer.classList.add('collapsed');
    }
});
  