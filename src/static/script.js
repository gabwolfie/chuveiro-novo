// Variáveis globais
let currentUser = null;
let selectedDuration = 5;
let socket = null;
let deferredPrompt = null;
let showerTimer = null;
let timeRemaining = 0;
let isShowerRunning = false;

// PWA Install
window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById("installPrompt").classList.remove("hidden");
});

function installApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === "accepted") {
                console.log("App instalado");
            }
            deferredPrompt = null;
            document.getElementById("installPrompt").classList.add("hidden");
        });
    }
}

// Service Worker
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js")
        .then(registration => console.log("SW registrado"))
        .catch(error => console.log("SW falhou:", error));
}

// Notificações
function requestNotificationPermission() {
    if ("Notification" in window) {
        if (Notification.permission === "default") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    console.log("Permissão de notificação concedida");
                }
            });
        }
    }
}

function showNotification(title, body, options = {}) {
    const defaultOptions = {
        body: body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        vibrate: [200, 100, 200],
        requireInteraction: true,
        tag: "chuveiro-notification"
    };

    const finalOptions = { ...defaultOptions, ...options };

    if ("Notification" in window && Notification.permission === "granted") {
        const notification = new Notification(title, finalOptions);
        
        notification.onclick = function() {
            window.focus();
            notification.close();
        };
    }

    // Também mostrar notificação na tela
    showInAppNotification(title, body, options.type || "info");
}

function showInAppNotification(title, message, type = "info") {
    const container = document.getElementById("notifications");
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <strong>${title}</strong><br>
        ${message}
    `;
    
    container.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Inicialização
document.addEventListener("DOMContentLoaded", function() {
    requestNotificationPermission();
    initializeSocket();
});

function initializeSocket() {
    socket = io();
    
    socket.on("connect", function() {
        console.log("Conectado ao servidor");
    });
    
    socket.on("disconnect", function() {
        console.log("Desconectado do servidor");
    });
    
    socket.on("shower_started", function(data) {
        if (data.user_name !== currentUser) {
            updateShowerStatus("OCUPADO", `EM USO POR ${data.user_name.toUpperCase()}`);
            showNotification("Chuveiro Ocupado", data.message, { type: "warning" });
        }
    });
    
    socket.on("shower_stopped", function(data) {
        if (data.user_name !== currentUser) {
            updateShowerStatus("Disponível", "");
            showNotification("Chuveiro Disponível", data.message, { type: "success" });
        }
    });

    socket.on("shower_status", function(data) {
        if (data.occupied) {
            updateShowerStatus("OCUPADO", `EM USO POR ${data.user_name.toUpperCase()}`);
            if (currentUser && data.user_name !== currentUser) {
                showNotification("Chuveiro Ocupado", data.message, { type: "warning" });
            }
        } else {
            updateShowerStatus("Disponível", "");
        }
    });
}

// Funções da interface
function enterApp() {
    const userName = document.getElementById("userName").value.trim();
    
    if (!userName) {
        showInAppNotification("Erro", "Por favor, digite seu nome", "error");
        return;
    }
    
    currentUser = userName;
    document.getElementById("userNameDisplay").textContent = userName;
    document.getElementById("nameScreen").classList.add("hidden");
    document.getElementById("showerScreen").classList.remove("hidden");
}

function logout() {
    if (isShowerRunning) {
        showInAppNotification("Aviso", "Pare o chuveiro antes de trocar de usuário!", "warning");
        return;
    }
    
    currentUser = null;
    document.getElementById("userName").value = "";
    document.getElementById("nameScreen").classList.remove("hidden");
    document.getElementById("showerScreen").classList.add("hidden");
}

function selectDuration(minutes) {
    selectedDuration = minutes;
    document.getElementById("selectedDuration").textContent = minutes;
    
    // Atualizar botões de duração
    document.querySelectorAll(".duration-btn").forEach(btn => {
        btn.classList.remove("active");
    });
    event.target.classList.add("active");
}

function startShower() {
    if (!currentUser) {
        showInAppNotification("Erro", "Usuário não identificado", "error");
        return;
    }
    
    // Verificar se o chuveiro já está ocupado por outra pessoa
    const showerStatusElement = document.getElementById("showerStatus");
    if (showerStatusElement.textContent.includes("OCUPADO") && !isShowerRunning) {
        showInAppNotification("Aviso", "O chuveiro já está ocupado por outro usuário. Por favor, aguarde.", "warning");
        return;
    }

    isShowerRunning = true;
    timeRemaining = selectedDuration * 60; // Converter para segundos
    
    // Atualizar interface
    document.getElementById("startBtn").classList.add("hidden");
    document.getElementById("stopBtn").classList.remove("hidden");
    document.getElementById("timer").classList.remove("hidden");
    
    // Desabilitar botão de trocar usuário
    const changeUserBtn = document.querySelector("button[onclick=\'logout()\']");
    changeUserBtn.disabled = true;
    changeUserBtn.style.opacity = "0.5";
    changeUserBtn.style.cursor = "not-allowed";
    
    updateShowerStatus("EM USO", `EM USO POR ${currentUser.toUpperCase()}`);
    
    // Iniciar timer
    startTimer();
    
    // Notificar servidor
    socket.emit("start_shower", {
        user_name: currentUser,
        duration: selectedDuration
    });
    
    showInAppNotification("Chuveiro Iniciado", `Você tem ${selectedDuration} minutos`, "success");
}

function stopShower() {
    if (!isShowerRunning) return;
    
    isShowerRunning = false;
    
    // Parar timer
    if (showerTimer) {
        clearInterval(showerTimer);
        showerTimer = null;
    }
    
    // Atualizar interface
    document.getElementById("startBtn").classList.remove("hidden");
    document.getElementById("stopBtn").classList.add("hidden");
    document.getElementById("timer").classList.add("hidden");
    
    // Reabilitar botão de trocar usuário
    const changeUserBtn = document.querySelector("button[onclick=\'logout()\']");
    changeUserBtn.disabled = false;
    changeUserBtn.style.opacity = "1";
    changeUserBtn.style.cursor = "pointer";
    
    updateShowerStatus("Disponível", "");
    
    // Notificar servidor
    socket.emit("stop_shower", {
        user_name: currentUser
    });
    
    showInAppNotification("Chuveiro Parado", "Obrigado por usar o chuveiro!", "info");
}

function startTimer() {
    updateTimerDisplay();
    
    showerTimer = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();
        
        // Avisos de tempo
        if (timeRemaining === 120) { // 2 minutos
            showNotification("Aviso", "Restam 2 minutos!", { type: "warning" });
        } else if (timeRemaining === 60) { // 1 minuto
            showNotification("Aviso", "Resta 1 minuto!", { type: "warning" });
        } else if (timeRemaining === 30) { // 30 segundos
            showNotification("Aviso", "Restam 30 segundos!", { type: "warning" });
        }
        
        // Tempo esgotado
        if (timeRemaining <= 0) {
            showNotification("Tempo Esgotado", "Seu tempo de chuveiro acabou!", { type: "error" });
            stopShower();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const display = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    document.getElementById("timer").textContent = display;
}

function updateShowerStatus(status, details) {
    document.getElementById("showerStatus").textContent = status;
    document.getElementById("currentUser").textContent = details;
    
    // Atualizar cor do status e frase
    const statusDisplay = document.getElementById("statusDisplay");
    if (status === "OCUPADO") {
        statusDisplay.classList.add("in-use");
        statusDisplay.style.borderLeftColor = "#FF0000";
    } else {
        statusDisplay.classList.remove("in-use");
        statusDisplay.style.borderLeftColor = status === "Disponível" ? "#4CAF50" : "#FF9800";
    }
}

// Eventos do teclado
document.addEventListener("keypress", function(e) {
    if (e.key === "Enter") {
        if (!document.getElementById("nameScreen").classList.contains("hidden")) {
            enterApp();
        }
    }
});

// Prevenir que a tela durma durante o uso do chuveiro
let wakeLock = null;

async function requestWakeLock() {
    if ("wakeLock" in navigator && isShowerRunning) {
        try {
            wakeLock = await navigator.wakeLock.request("screen");
            console.log("Wake lock ativado");
        } catch (err) {
            console.log("Falha ao ativar wake lock:", err);
        }
    }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
        console.log("Wake lock liberado");
    }
}

// Ativar wake lock quando iniciar o chuveiro
const originalStartShower = startShower;
startShower = function() {
    originalStartShower();
    requestWakeLock();
};

// Liberar wake lock quando parar o chuveiro
const originalStopShower = stopShower;
stopShower = function() {
    originalStopShower();
    releaseWakeLock();
};


