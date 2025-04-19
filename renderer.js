const speechBubble = document.getElementById("speech-bubble")
const speakBtn = document.getElementById("speak-btn")
const widget = document.getElementById("widget")
const startMonitoringBtn = document.getElementById("start-monitoring")
const spriteHappy = document.getElementById("sprite-happy")
const spriteSad = document.getElementById("sprite-sad")
const widgetContainer = document.getElementById("widget-container")
const spriteImage = document.getElementById("sprite")

// New DOM references
const statsToggleButton = document.getElementById("stats-toggle-button")
const statsDisplay = document.getElementById("stats-display")
const modeToggleButton = document.getElementById("mode-toggle-button")
const statsMode = document.getElementById("stats-mode")
const statsDistractions = document.getElementById("stats-distractions")
const statsStatus = document.getElementById("stats-status")

// Chat input and button
const chatInput = document.getElementById("chat-input")
const chatButton = document.getElementById("chat-button")

// State variables
let currentMode = "productivity" // 'productivity' or 'relax'
let distractionCount = 0
let spriteState = "alive" // 'alive' or 'dead'
let statsVisible = false

let monitoringInterval = null
let isMonitoring = false

// Log that renderer is running
console.log("Renderer script is running")
console.log("Electron API available:", !!window.electron)
console.log("Claude API Key available:", !!window.electron?.env?.CLAUDE_API_KEY)

const productiveMessages = [
	"Great work! Keep it up! 💪",
	"You're crushing it! 🌟",
	"Such focus! Much wow! 🎯",
	"Productivity level: OVER 9000! 🚀",
]

const unproductiveMessages = [
	"Hey... maybe we should focus? 🤔",
	"Is this really work related? 😅",
	"I believe in you! Let's get back to it! 💪",
	"Social media can wait! 🙏",
]

const deadMessages = [
	"Oh no... I didn't make it. 💀",
	"Too many distractions... farewell. 💔",
	"Productivity zero... sprite zero... 😵",
]

const setSpriteEmotion = (isHappy) => {
	console.log("Setting sprite emotion:", isHappy)
	spriteHappy.classList.toggle("hidden", !isHappy)
	spriteSad.classList.toggle("hidden", isHappy)
}

const updateButtonState = (monitoring) => {
	console.log("Updating button state:", monitoring)
	startMonitoringBtn.textContent = monitoring
		? "Stop Monitoring"
		: "Start Monitoring"
	startMonitoringBtn.classList.toggle("bg-red-500", monitoring)
	startMonitoringBtn.classList.toggle("bg-green-500", !monitoring)
}

const analyzeScreenshot = async (screenshot) => {
	try {
		console.log("Analyzing screenshot with Claude...")
		const response = await fetch("https://api.anthropic.com/v1/messages", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": window.electron.env.CLAUDE_API_KEY,
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model: "claude-3-opus-20240229",
				max_tokens: 1024,
				messages: [
					{
						role: "user",
						content: [
							{
								type: "text",
								text: "Here's a screenshot of my computer screen. Is this productive work? Please respond with ONLY 'yes' or 'no'. Consider coding, document writing, and professional tools as productive. Consider social media, gaming, and entertainment as unproductive.",
							},
							{
								type: "image",
								source: {
									type: "base64",
									media_type: "image/png",
									data: screenshot.split(",")[1],
								},
							},
						],
					},
				],
			}),
		})

		const data = await response.json()
		console.log("Claude response:", data)
		return data.content[0].text.toLowerCase().includes("yes")
	} catch (error) {
		console.error("Error analyzing screenshot:", error)
		throw error
	}
}

const getRandomMessage = (messages) =>
	messages[Math.floor(Math.random() * messages.length)]

const checkProductivity = async () => {
	if (!isMonitoring) {
		console.log("Monitoring is off, skipping check")
		return
	}

	console.log("Starting productivity check...")
	try {
		const screenshot = await window.electron.capture.getScreenshot()
		console.log("Screenshot captured")

		const isProductive = await analyzeScreenshot(screenshot)
		console.log("Analysis result:", isProductive)

		setSpriteEmotion(isProductive)
		const message = getRandomMessage(
			isProductive ? productiveMessages : unproductiveMessages
		)
		speechBubble.textContent = message
		console.log("Updated UI with message:", message)

		if ("speechSynthesis" in window) {
			const utter = new window.SpeechSynthesisUtterance(message)
			window.speechSynthesis.cancel()
			window.speechSynthesis.speak(utter)
		}
	} catch (error) {
		console.error("Error during productivity check:", error)
		speechBubble.textContent = "Oops! Something went wrong! 😅"
		setSpriteEmotion(true)
	}
}

const startMonitoring = () => {
	console.log("Starting monitoring...")
	isMonitoring = true
	updateButtonState(true)
	checkProductivity() // Initial check
	monitoringInterval = setInterval(checkProductivity, 30000)
	speechBubble.textContent =
		"Monitoring started! I'll help you stay productive! 🎯"
}

const stopMonitoring = () => {
	console.log("Stopping monitoring...")
	isMonitoring = false
	updateButtonState(false)
	if (monitoringInterval) {
		clearInterval(monitoringInterval)
		monitoringInterval = null
	}
	setSpriteEmotion(true)
	speechBubble.textContent =
		"Taking a break! Let me know when to start again! 😊"
}

startMonitoringBtn.addEventListener("click", () => {
	console.log("Button clicked, current state:", { isMonitoring })

	if (!window.electron?.env?.CLAUDE_API_KEY) {
		console.error("No Claude API key found")
		speechBubble.textContent =
			"Please add your Claude API key to .env file! 🔑"
		return
	}

	if (isMonitoring) {
		stopMonitoring()
	} else {
		startMonitoring()
	}
})

// Initial setup
document.addEventListener("DOMContentLoaded", () => {
	console.log("DOM loaded, initializing...")
	speechBubble.textContent = "Click Start Monitoring to begin! 🚀"
	updateButtonState(false)
})

// --- New UI Update Function ---
const updateUI = () => {
	console.log("Updating UI with state:", {
		currentMode,
		distractionCount,
		spriteState,
		statsVisible,
	})

	// Update Stats Display
	statsMode.textContent =
		currentMode.charAt(0).toUpperCase() + currentMode.slice(1)
	statsDistractions.textContent = distractionCount
	statsStatus.textContent =
		spriteState.charAt(0).toUpperCase() + spriteState.slice(1)

	// Toggle Stats Visibility
	statsDisplay.classList.toggle("hidden", !statsVisible)

	// Update Mode Toggle Button Text
	modeToggleButton.textContent = currentMode === "productivity" ? "⚙️" : "🧘"
	modeToggleButton.classList.toggle(
		"bg-green-600",
		currentMode === "productivity"
	)
	modeToggleButton.classList.toggle(
		"hover:bg-green-700",
		currentMode === "productivity"
	)
	modeToggleButton.setAttribute(
		"title",
		currentMode === "productivity"
			? "Switch to Relax Mode"
			: "Switch to Productivity Mode"
	)

	// Update Sprite Appearance (Example: grayscale when dead)
	spriteImage.classList.toggle("grayscale", spriteState === "dead")

	// Disable buttons if dead
	statsToggleButton.disabled = spriteState === "dead"
	modeToggleButton.disabled = spriteState === "dead"
	// startMonitoringBtn.disabled = spriteState === 'dead'; // Keep original monitoring button if needed

	// Update speech bubble if dead
	if (
		spriteState === "dead" &&
		speechBubble.textContent !== deadMessages[0] &&
		speechBubble.textContent !== deadMessages[1] &&
		speechBubble.textContent !== deadMessages[2]
	) {
		const deadMessage = getRandomMessage(deadMessages)
		speechBubble.textContent = deadMessage
		speechBubble.classList.remove("hidden")
		if ("speechSynthesis" in window) {
			const utter = new window.SpeechSynthesisUtterance(deadMessage)
			window.speechSynthesis.cancel()
			window.speechSynthesis.speak(utter)
		}
	}
}

// --- Event Handlers ---
const handleToggleMode = () => {
	if (spriteState === "dead") return // Cannot change mode if dead

	currentMode = currentMode === "productivity" ? "relax" : "productivity"
	console.log("Mode toggled to:", currentMode)
	if (currentMode === "productivity") {
		distractionCount = 0 // Reset distractions when entering productivity mode
		console.log("Distraction count reset.")
	}
	// If monitoring was active, maybe stop it or adapt based on mode?
	// For now, just update UI.
	updateUI()
}

const handleToggleStats = () => {
	if (spriteState === "dead") return
	statsVisible = !statsVisible
	console.log("Stats visibility toggled:", statsVisible)
	updateUI()
}

// --- Screen Analysis Result Handler ---
// This function should be called by whatever mechanism gets the LLM result
const handleAnalyzeScreenResult = (isDistracting) => {
	if (spriteState === "dead" || currentMode !== "productivity") {
		console.log(
			"Skipping distraction check (dead or not in productivity mode)."
		)
		return // Only count distractions in productivity mode and if alive
	}

	console.log("Received analysis result:", { isDistracting })

	if (isDistracting) {
		distractionCount++
		console.log("Distraction detected! Count:", distractionCount)
		// Optionally show a temporary visual cue or message
		const message = getRandomMessage(unproductiveMessages)
		speechBubble.textContent = message
		speechBubble.classList.remove("hidden")
		if ("speechSynthesis" in window) {
			const utter = new window.SpeechSynthesisUtterance(message)
			window.speechSynthesis.cancel() // Cancel previous speech
			window.speechSynthesis.speak(utter)
		}
		// Set sprite to sad temporarily?
		// setSpriteEmotion(false);
		// setTimeout(() => setSpriteEmotion(true), 2000); // Back to happy after 2s

		if (distractionCount >= 3) {
			console.log(
				"Distraction limit reached! Sprite state changing to dead."
			)
			spriteState = "dead"
			// Stop monitoring or other actions?
			if (isMonitoring) {
				// Assuming isMonitoring is still relevant
				stopMonitoring() // Stop the original monitoring if it exists
			}
		}
	} else {
		// Optionally provide positive feedback if productive
		const message = getRandomMessage(productiveMessages)
		speechBubble.textContent = message
		speechBubble.classList.remove("hidden")
		if ("speechSynthesis" in window) {
			const utter = new window.SpeechSynthesisUtterance(message)
			window.speechSynthesis.cancel() // Cancel previous speech
			window.speechSynthesis.speak(utter)
		}
		// Ensure sprite is happy
		// setSpriteEmotion(true);
	}

	updateUI() // Update stats and potentially sprite state display
}

// --- Event Listeners Setup ---

// Remove or adapt original start button listener if replaced by mode
// const startMonitoringBtn = document.getElementById("start-monitoring");
// if (startMonitoringBtn) {
//     startMonitoringBtn.addEventListener("click", () => {
//         console.log("Start/Stop Button clicked, current state:", { isMonitoring });

//         if (!window.electron?.env?.CLAUDE_API_KEY) {
//             console.error("No Claude API key found");
//             speechBubble.textContent = "Please add your Claude API key to .env file! 🔑";
//             speechBubble.classList.remove("hidden");
//             return;
//         }

//         if (isMonitoring) {
//             stopMonitoring();
//         } else {
//             startMonitoring();
//         }
//     });
// }

// Add listeners for new buttons
modeToggleButton.addEventListener("click", handleToggleMode)
statsToggleButton.addEventListener("click", handleToggleStats)

// --- Initial Setup ---
document.addEventListener("DOMContentLoaded", () => {
	console.log("DOM loaded, initializing Tamagotchi mode...")
	speechBubble.textContent = "Welcome! Ready for Productivity mode? ✨"
	speechBubble.classList.remove("hidden")
	updateUI() // Set initial UI state
	// Maybe start monitoring automatically in productivity mode?
	// if(currentMode === 'productivity') { startMonitoring(); }
})

// --- Example of how to manually trigger the analysis result ---
// You would replace this with your actual backend communication
// setTimeout(() => {
//     if (currentMode === 'productivity') {
//         console.log("Simulating a distraction result...");
//         handleAnalyzeScreenResult(true); // Simulate distraction
//     }
// }, 10000); // After 10 seconds

// setTimeout(() => {
//     if (currentMode === 'productivity') {
//         console.log("Simulating a productive result...");
//         handleAnalyzeScreenResult(false); // Simulate productive
//     }
// }, 15000); // After 15 seconds

// Check if Electron API is available
if (!window.electron || !window.electron.logic || !window.electron.capture) {
	console.error("Electron APIs (logic, capture, env) not fully available!")
	// Display error to user?
	speechBubble.textContent = "Error: App components failed to load."
	speechBubble.classList.remove("hidden")
} else {
	console.log("Electron APIs appear available.")
}

// --- UI Update Function ---
// This function is called by logic.js via the callback
const updateRendererUI = (newState, message, speakMessage = false) => {
	console.log("Updating Renderer UI:", {
		state: newState,
		message,
		speakMessage,
	})

	// Update Stats Display
	statsMode.textContent =
		newState.mode.charAt(0).toUpperCase() + newState.mode.slice(1)
	statsDistractions.textContent = newState.distractions
	statsStatus.textContent =
		newState.status.charAt(0).toUpperCase() + newState.status.slice(1)

	// Toggle Stats Visibility (using state from logic)
	statsDisplay.classList.toggle("hidden", !newState.statsVisible)

	// Update Mode Toggle Button Icon & Style
	const isProductivityMode = newState.mode === "productivity"
	modeToggleButton.textContent = isProductivityMode ? "⚙️" : "🧘" // Set icon based on mode
	modeToggleButton.classList.toggle("bg-green-600", isProductivityMode)
	modeToggleButton.classList.toggle("hover:bg-green-700", isProductivityMode)
	modeToggleButton.classList.toggle("bg-purple-600", !isProductivityMode)
	modeToggleButton.classList.toggle(
		"hover:bg-purple-700",
		!isProductivityMode
	)
	modeToggleButton.setAttribute(
		"title",
		isProductivityMode
			? "Switch to Relax Mode"
			: "Switch to Productivity Mode"
	) // Update title

	// Update Sprite Appearance
	const isDead = newState.status === "dead"
	const isHappy = !isDead // Simplistic: happy unless dead. Adjust if needed.
	spriteHappy?.classList.toggle("hidden", !isHappy)
	spriteSad?.classList.toggle("hidden", isHappy)
	// If using a single sprite image with grayscale:
	// spriteImage?.classList.toggle("grayscale", isDead)

	// Update Speech Bubble
	if (message) {
		speechBubble.textContent = message
		speechBubble.classList.remove("hidden")
		// Optional: Text-to-speech ONLY if flag is true
		if (speakMessage && "speechSynthesis" in window && message) {
			const utter = new window.SpeechSynthesisUtterance(message)
			window.speechSynthesis.cancel() // Cancel previous speech
			window.speechSynthesis.speak(utter)
			console.log("Speaking message:", message)
		}
	}

	// Disable/Enable buttons based on state
	const buttonsDisabled = isDead
	statsToggleButton.disabled = buttonsDisabled
	modeToggleButton.disabled = buttonsDisabled
	// Handle original monitoring button if kept
	if (startMonitoringBtn) {
		startMonitoringBtn.disabled = buttonsDisabled
		// Update original monitoring button text based on logic state
		startMonitoringBtn.textContent = newState.isMonitoring
			? "Stop Monitoring"
			: "Start Monitoring"
		startMonitoringBtn.classList.toggle("bg-red-500", newState.isMonitoring)
		startMonitoringBtn.classList.toggle(
			"hover:bg-red-700",
			newState.isMonitoring
		)
		startMonitoringBtn.classList.toggle(
			"bg-green-500",
			!newState.isMonitoring
		)
		startMonitoringBtn.classList.toggle(
			"hover:bg-green-600",
			!newState.isMonitoring
		)
	}
}

// --- Event Handlers ---

// Toggle Stats Display (Call logic module)
statsToggleButton.addEventListener("click", () => {
	console.log("Stats toggle button clicked.")
	if (window.electron?.logic?.toggleStatsVisibility) {
		window.electron.logic.toggleStatsVisibility() // <-- Call logic function
	} else {
		console.error("logic.toggleStatsVisibility not available!")
	}
	// Remove local state management:
	// statsVisible = !statsVisible;
	// statsDisplay.classList.toggle("hidden", !statsVisible);
	// console.log("Stats visibility toggled (UI):");
})

// Toggle Mode (Call logic module)
modeToggleButton.addEventListener("click", () => {
	console.log("Mode toggle button clicked.")
	if (window.electron?.logic?.toggleMode) {
		window.electron.logic.toggleMode()
	} else {
		console.error("logic.toggleMode not available!")
	}
})

// Handle original start/stop button (if kept)
if (startMonitoringBtn) {
	startMonitoringBtn.addEventListener("click", () => {
		console.log("Start/Stop monitoring button clicked.")
		const currentState = window.electron?.logic?.getState
			? window.electron.logic.getState()
			: { isMonitoring: false }

		if (!window.electron?.env?.CLAUDE_API_KEY) {
			console.error("No Claude API key found")
			updateRendererUI(
				currentState,
				"Please add your Claude API key to .env file! 🔑",
				true
			)
			return
		}

		if (currentState.isMonitoring) {
			if (window.electron?.logic?.stopProductivityCheck) {
				window.electron.logic.stopProductivityCheck()
			} else {
				console.error("logic.stopProductivityCheck not available!")
			}
		} else {
			if (
				window.electron?.logic?.startProductivityCheck &&
				window.electron?.capture?.getScreenshot
			) {
				// Pass the screenshot function from preload API
				window.electron.logic.startProductivityCheck(
					window.electron.capture.getScreenshot
				)
			} else {
				console.error(
					"logic.startProductivityCheck or capture.getScreenshot not available!"
				)
				updateRendererUI(
					currentState,
					"Error: Cannot start monitoring.",
					true
				)
			}
		}
	})
}

// --- Initial Setup ---
document.addEventListener("DOMContentLoaded", () => {
	console.log("DOM loaded. Initializing renderer...")
	// Initialize the logic module, passing the UI update callback and API key
	if (window.electron?.logic?.initialize && window.electron?.env) {
		window.electron.logic.initialize(
			updateRendererUI,
			window.electron.env.CLAUDE_API_KEY
		)
		// Initial UI state is set by the callback within initialize
	} else {
		console.error(
			"Cannot initialize logic module or access env! API:",
			window.electron
		)
		speechBubble.textContent = "Initialization failed!"
		speechBubble.classList.remove("hidden")
	}
	statsDisplay.classList.toggle("hidden", !statsVisible) // Ensure stats hidden initially
})

// --- Removed Functions (Moved to logic.js) ---
// analyzeScreenshot
// checkProductivity
// startMonitoring (replaced by logic.startProductivityCheck)
// stopMonitoring (replaced by logic.stopProductivityCheck)
// handleAnalyzeScreenResult
// updateUI (replaced by updateRendererUI)
// SetSpriteEmotion (integrated into updateRendererUI)
// updateButtonState (integrated into updateRendererUI)

// Chat Button Listener
chatButton.addEventListener("click", async () => {
	const query = chatInput.value.trim()
	if (!query) return // Don't send empty messages

	console.log(`Sending chat query: "${query}"`)
	chatInput.value = "" // Clear input field
	speechBubble.textContent = "Thinking..." // Show thinking indicator
	speechBubble.classList.remove("hidden")

	if (window.electron?.logic?.getHelpOrChat) {
		try {
			const response = await window.electron.logic.getHelpOrChat(query)
			console.log("Received chat response:", response)
			const currentState = window.electron?.logic?.getState
				? window.electron.logic.getState()
				: {}
			updateRendererUI(currentState, response, true)
		} catch (error) {
			console.error("Error calling getHelpOrChat:", error)
			const currentState = window.electron?.logic?.getState
				? window.electron.logic.getState()
				: {}
			updateRendererUI(
				currentState,
				"Sorry, couldn't get a response.",
				true
			)
		}
	} else {
		console.error("logic.getHelpOrChat not available!")
		const currentState = window.electron?.logic?.getState
			? window.electron.logic.getState()
			: {}
		updateRendererUI(currentState, "Chat function not available.", true)
	}
})

// Optional: Allow sending chat with Enter key
chatInput.addEventListener("keydown", (event) => {
	if (event.key === "Enter") {
		event.preventDefault() // Prevent default form submission/newline
		chatButton.click() // Trigger the button click handler
	}
})
