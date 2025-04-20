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
const windowChangeToggle = document.getElementById("window-change-toggle")

// Chat input and button
const chatInput = document.getElementById("chat-input")
const chatButton = document.getElementById("chat-button")
const taskDescriptionInput = document.getElementById("task-description")

// State variables - DEPRECATED: Using logic.js state instead through getState()
// These variables are kept for backward compatibility but should not be used directly
// Always use the state from window.electron.logic.getState() instead
// DO NOT modify these values directly; use logic module API methods instead
let currentMode = "productivity" // 'productivity' or 'relax'
let distractionCount = 0
let spriteState = "alive" // 'alive' or 'dead'
let statsVisible = false
let monitoringInterval = null
let isMonitoring = false

// Helper function to safely access global state
const getAppState = () => {
  try {
    return window.electron?.logic?.getState ? window.electron.logic.getState() : { 
      mode: currentMode,
      distractions: distractionCount,
      status: spriteState,
      isMonitoring: isMonitoring,
      statsVisible: statsVisible
    };
  } catch (error) {
    console.error("Error getting state:", error);
    return { 
      mode: "productivity", 
      distractions: 0, 
      status: "alive",
      isMonitoring: false,
      statsVisible: false
    };
  }
}

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

const analyzeScreenshot = async (screenshot, taskDescription) => {
	console.log("DEPRECATED: Using local analyzeScreenshot. This function is now handled by logic.js.");
	
	// Validate inputs first
	if (!screenshot) {
		console.error("No screenshot provided for analysis");
		return false; // Default to not distracting on error
	}
	
	if (!window.electron?.env?.CLAUDE_API_KEY) {
		console.error("No Claude API key available");
		return false; // Default to not distracting on error
	}
	
	try {
		console.log("Analyzing screenshot with Claude...");
		console.log("Task Description:", taskDescription);

		// Construct the prompt including the task description
		let promptText = `The user is currently working on: '${taskDescription || "No specific task provided."}'\n\nHere's a screenshot of the computer screen. Does this screen content seem relevant to the stated task, or is it likely a distraction (like social media, games, unrelated browsing)? Please respond with ONLY 'yes' (relevant) or 'no' (distraction).`;
        
        // Prepare screenshot data
        let screenshotData;
        try {
            screenshotData = screenshot.split(",")[1];
            if (!screenshotData) {
                throw new Error("Invalid screenshot format");
            }
        } catch (screenshotError) {
            console.error("Error processing screenshot:", screenshotError);
            return false; // Default to not distracting on error
        }

		// Add timeout to prevent hanging requests
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
		
		try {
			const response = await fetch("https://api.anthropic.com/v1/messages", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": window.electron.env.CLAUDE_API_KEY,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify({
					model: "claude-3-opus-20240229",
					max_tokens: 10,
					messages: [
						{
							role: "user",
							content: [
								{
									type: "text",
									text: promptText,
								},
								{
									type: "image",
									source: {
										type: "base64",
										media_type: "image/png",
										data: screenshotData,
									},
								},
							],
						},
					],
				}),
				signal: controller.signal,
			});
			
			clearTimeout(timeoutId);
			
			// Check for HTTP errors
			if (!response.ok) {
				console.error(`API request failed with status ${response.status}`);
				return false; // Default to not distracting on error
			}

			const data = await response.json();
			console.log("Claude response:", data);
			
			// Validate response format
			if (!data || !data.content || !Array.isArray(data.content) || data.content.length === 0) {
				console.error("Invalid response format from Claude API:", data);
				return false; // Default to not distracting on error
			}
			
			// Improve robustness of checking response
			const resultText = data.content[0]?.text?.toLowerCase()?.trim() || "";
			console.log("Parsed result text:", resultText);
			
			// Interpret both 'yes' and variations as productive
			return resultText === 'yes' || resultText.includes('yes') || resultText.includes('relevant');
		} catch (fetchError) {
			clearTimeout(timeoutId);
			
			if (fetchError.name === 'AbortError') {
				console.error("API request timed out after 30 seconds");
			} else {
				console.error("Error fetching from Claude API:", fetchError);
			}
			
			return false; // Default to not distracting on fetch error
		}
	} catch (error) {
		console.error("Error analyzing screenshot:", error);
		return false; // Default to not distracting on general error
	}
}

const getRandomMessage = (messages) =>
	messages[Math.floor(Math.random() * messages.length)]

const checkProductivity = async () => {
	if (!isMonitoring) {
		console.log("Monitoring is off, skipping check")
		return
	}

	// Get the task description from the input field
	const taskDescription = taskDescriptionInput.value.trim()
	console.log("Starting productivity check with task:", taskDescription)

	try {
		const screenshot = await window.electron.capture.getScreenshot()
		console.log("Screenshot captured")

		// Pass task description to analyzeScreenshot
		const isProductive = await analyzeScreenshot(screenshot, taskDescription)
		console.log("Analysis result:", isProductive)

		setSpriteEmotion(isProductive)

		// Determine message based on productivity AND mode
		let message = ""
		if (currentMode === "productivity") {
			if (isProductive) {
				message = getRandomMessage(productiveMessages)
			} else {
				message = getRandomMessage(unproductiveMessages)
				handleAnalyzeScreenResult(true) // Increment distraction count
			}
		} else {
			// In Relax mode, maybe just acknowledge the check or say something chill
			message = "Just checking in... Relax! 🧘"
			// Optionally, still track 'distractions' differently or not at all in relax mode
		}

		speechBubble.textContent = message
		console.log("Updated UI with message:", message)

		// Speak the message only if not dead and not in relax mode (or customize as needed)
		if (
			"speechSynthesis" in window &&
			spriteState !== "dead" &&
			currentMode === "productivity"
		) {
			const utter = new window.SpeechSynthesisUtterance(message)
			window.speechSynthesis.cancel()
			window.speechSynthesis.speak(utter)
		}
	} catch (error) {
		console.error("Error during productivity check:", error)
		speechBubble.textContent = "Oops! Something went wrong! 😅"
		setSpriteEmotion(true) // Default to happy on error
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

// DEPRECATED: First DOMContentLoaded listener - see unified initialization at the end of the file

// --- New UI Update Function ---
const updateUI = () => {
	// Always get the latest state from logic module
	const state = getAppState();
	
	console.log("Updating UI with state:", state);

	// Update Stats Display
	statsMode.textContent = state.mode.charAt(0).toUpperCase() + state.mode.slice(1);
	statsDistractions.textContent = state.distractions;
	statsStatus.textContent = state.status.charAt(0).toUpperCase() + state.status.slice(1);

	// Toggle Stats Visibility
	statsDisplay.classList.toggle("hidden", !state.statsVisible);

	// Update Mode Toggle Button Text
	const isProductivityMode = state.mode === "productivity";
	modeToggleButton.textContent = isProductivityMode ? "⚙️" : "🧘";
	modeToggleButton.classList.toggle("bg-green-600", isProductivityMode);
	modeToggleButton.classList.toggle("hover:bg-green-700", isProductivityMode);
	modeToggleButton.setAttribute(
		"title",
		isProductivityMode ? "Switch to Relax Mode" : "Switch to Productivity Mode"
	);

	// Update Sprite Appearance (Example: grayscale when dead)
	const isDead = state.status === "dead";
	spriteImage.classList.toggle("grayscale", isDead);

	// Disable buttons if dead
	statsToggleButton.disabled = isDead;
	modeToggleButton.disabled = isDead;
	if (startMonitoringBtn) {
		startMonitoringBtn.disabled = isDead;
	}

	// Update speech bubble if dead
	if (
		isDead &&
		speechBubble.textContent !== deadMessages[0] &&
		speechBubble.textContent !== deadMessages[1] &&
		speechBubble.textContent !== deadMessages[2]
	) {
		const deadMessage = getRandomMessage(deadMessages);
		speechBubble.textContent = deadMessage;
		speechBubble.classList.remove("hidden");
		
		// Use try-catch for speech synthesis
		try {
			if ("speechSynthesis" in window) {
				const utter = new window.SpeechSynthesisUtterance(deadMessage);
				window.speechSynthesis.cancel();
				window.speechSynthesis.speak(utter);
			}
		} catch (error) {
			console.error("Speech synthesis error:", error);
		}
	}
}

// --- Event Handlers ---
// These local handlers are deprecated - use the logic module APIs directly
// Kept for backward compatibility but redirected to use logic module
const handleToggleMode = () => {
	// Get current state
	const state = getAppState();
	if (state.status === "dead") return // Cannot change mode if dead

	// Use the logic module's toggleMode function
	if (window.electron?.logic?.toggleMode) {
		try {
			window.electron.logic.toggleMode();
			// Logic module will call updateRendererUI
		} catch (error) {
			console.error("Error toggling mode:", error);
		}
	} else {
		console.error("toggleMode function not available in logic module");
		// Fallback to local state if logic module not available
		currentMode = currentMode === "productivity" ? "relax" : "productivity";
		if (currentMode === "productivity") {
			distractionCount = 0;
		}
		updateUI();
	}
}

const handleToggleStats = () => {
	// Get current state
	const state = getAppState();
	if (state.status === "dead") return;

	// Use the logic module's toggleStatsVisibility function
	if (window.electron?.logic?.toggleStatsVisibility) {
		try {
			window.electron.logic.toggleStatsVisibility();
			// Logic module will call updateRendererUI
		} catch (error) {
			console.error("Error toggling stats visibility:", error);
		}
	} else {
		console.error("toggleStatsVisibility function not available in logic module");
		// Fallback to local state if logic module not available
		statsVisible = !statsVisible;
		updateUI();
	}
}

// --- Screen Analysis Result Handler ---
// DEPRECATED: This function is kept for backward compatibility
// The logic module now handles this functionality directly
const handleAnalyzeScreenResult = (isDistracting) => {
	console.log("DEPRECATED: handleAnalyzeScreenResult called locally. This should be handled by logic module.");
	
	// Get the current state safely
	const state = getAppState();
	
	if (state.status === "dead" || state.mode !== "productivity") {
		console.log("Skipping distraction check (dead or not in productivity mode).");
		return;
	}

	console.log("Received analysis result:", { isDistracting });
	
	// This function is now deprecated - forward to logic module if available
	if (window.electron?.logic) {
		try {
			// Logic module now handles this internally via analyzeScreenAndUpdate
			console.log("Forwarding analysis result to logic module...");
			// We can't directly call the internal function, but the next scheduled check will handle it
			return;
		} catch (error) {
			console.error("Error forwarding analysis to logic module:", error);
			// Fall back to local implementation
		}
	}

	// Fallback implementation if logic module not available
	let message = "";
	
	if (isDistracting) {
		distractionCount++;
		console.log("Distraction detected! Count:", distractionCount);
		message = getRandomMessage(unproductiveMessages);
		
		if (distractionCount >= 3) {
			console.log("Distraction limit reached! Sprite state changing to dead.");
			spriteState = "dead";
			message = getRandomMessage(deadMessages);
			if (isMonitoring && window.electron?.logic?.stopProductivityCheck) {
				try {
					window.electron.logic.stopProductivityCheck();
				} catch (error) {
					console.error("Error stopping monitoring:", error);
					// Fallback to local function
					if (typeof stopMonitoring === 'function') {
						stopMonitoring();
					}
				}
			}
		}
	} else {
		message = getRandomMessage(productiveMessages);
	}
	
	// Update UI with message
	speechBubble.textContent = message;
	speechBubble.classList.remove("hidden");
	
	// Try speech synthesis with error handling
	try {
		if ("speechSynthesis" in window) {
			const utter = new window.SpeechSynthesisUtterance(message);
			window.speechSynthesis.cancel();
			window.speechSynthesis.speak(utter);
		}
	} catch (speechError) {
		console.error("Speech synthesis error:", speechError);
	}
	
	// Update UI stats
	updateUI();
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

// Window change detection toggle listener
windowChangeToggle.addEventListener("change", (event) => {
	console.log("Window change detection toggle:", event.target.checked)
	if (window.electron?.logic) {
		if (event.target.checked) {
			if (window.electron.logic.startWindowChangeDetection && window.electron.capture) {
				window.electron.logic.startWindowChangeDetection(window.electron.capture.getScreenshot)
				speechBubble.textContent = "Tab change detection enabled! 🔍"
				speechBubble.classList.remove("hidden")
			}
		} else {
			if (window.electron.logic.stopWindowChangeDetection) {
				window.electron.logic.stopWindowChangeDetection()
				speechBubble.textContent = "Tab change detection disabled."
				speechBubble.classList.remove("hidden")
			}
		}
	}
})

// DEPRECATED: Second DOMContentLoaded listener - see unified initialization at the end of the file

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

// --- Single Unified Initialization ---
// Consolidated initialization to prevent issues with multiple event listeners
let initialized = false;

document.addEventListener("DOMContentLoaded", () => {
	// Prevent duplicate initialization
	if (initialized) {
		console.warn("DOMContentLoaded called multiple times - ignoring");
		return;
	}
	
	initialized = true;
	console.log("DOM loaded. Initializing application...");
	
	try {
		// Initialize the logic module first if available
		if (window.electron?.logic?.initialize && window.electron?.env && window.electron?.capture) {
			console.log("Initializing logic module...");
			
			try {
				window.electron.logic.initialize(
					updateRendererUI,
					window.electron.env.CLAUDE_API_KEY,
					window.electron.capture.getScreenshot // Pass the screenshot function for window change detection
				);
				console.log("Logic module initialized successfully");
				
				// Initial message is set by the callback in initialize
			} catch (initError) {
				console.error("Error initializing logic module:", initError);
				speechBubble.textContent = "Logic initialization failed!";
				speechBubble.classList.remove("hidden");
			}
		} else {
			console.error("Required modules not available:", { 
				logic: !!window.electron?.logic, 
				env: !!window.electron?.env, 
				capture: !!window.electron?.capture 
			});
			
			// Fallback to local initialization if logic module not available
			speechBubble.textContent = "Welcome! Ready for Productivity mode? ✨";
			speechBubble.classList.remove("hidden");
			updateButtonState(false); // Initialize button state
			updateUI(); // Update UI with local state
		}
		
		// Always apply these UI settings regardless of initialization method
		const state = getAppState();
		statsDisplay.classList.toggle("hidden", !state.statsVisible);
		
		console.log("Initialization complete");
	} catch (error) {
		console.error("Critical error during initialization:", error);
		speechBubble.textContent = "Critical initialization error!";
		speechBubble.classList.remove("hidden");
	}
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
