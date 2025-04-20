const { Anthropic } = require("@anthropic-ai/sdk") // Use require for Node.js modules
const imghash = require('imghash');
const { createCanvas, Image } = require('canvas');

// --- State ---
let state = {
	currentMode: "productivity", // 'productivity' or 'relax'
	distractionCount: 0,
	spriteState: "alive", // 'alive' or 'dead'
	isMonitoring: false,
	statsVisible: false,
	contextHistory: [], // <-- Add context history array
	maxContextHistory: 5, // <-- Max items to keep in history
	apiKey: null, // Store API key fetched from preload
	anthropicClient: null,
	uiUpdateCallback: () => {}, // Placeholder for the UI update function from renderer
	monitoringInterval: null,
	timerPausedTimeout: null, // <-- Add handle for paused timer
	captureScreenshotFn: null, // <-- Store the capture function
	lastScreenshotHash: null, // For detecting window/tab changes
	windowChangeDetection: false, // Flag to enable/disable window change detection
	personalityType: "standard", // 'standard', 'asianMom', 'panda', 'oldMan'
	previouslyDistracted: false // Track previous distraction state for state change detection
}

// --- Constants ---
const DISTRACTION_LIMIT = 3
const MONITORING_INTERVAL_MS = 30000 // 15 seconds
const WINDOW_CHECK_INTERVAL_MS = 2000 // Increased to 8 seconds to reduce frequent checks
const HASH_DISTANCE_THRESHOLD = 15; // Lower = more sensitive, higher = less sensitive

// Personality-specific messages
const personalityMessages = {
	standard: {
		productive: [
			"Great work! Keep it up! 💪",
			"You're crushing it! 🌟",
			"Such focus! Much wow! 🎯",
			"Productivity level: OVER 9000! 🚀",
		],
		unproductive: [
			"Hey... maybe we should focus? 🤔",
			"Is this really work related? 😅",
			"I believe in you! Let's get back to it! 💪",
			"Social media can wait! 🙏",
		],
		dead: [
			"Oh no... I didn't make it. 💀",
			"Too many distractions... farewell. 💔",
			"Productivity zero... sprite zero... 😵",
		]
	},
	asianMom: {
		productive: [
			"Not bad, but neighbor's kid works harder! 🧮",
			"Good job! Now do more! 📚",
			"This acceptable. But why not A+? 🥇",
			"You making progress. Doctor career still possible! 👩‍⚕️",
		],
		unproductive: [
			"Why you waste time?! Cousin already finish PhD! 😠",
			"This is how you dishonor family! Back to study! 📝",
			"You play game?! No dinner tonight! 🍚❌",
			"I'm not angry, just disappointed... 😒",
		],
		dead: [
			"So many distraction... you never be doctor now! 😭",
			"You break mother's heart with laziness... 💔",
			"I give up. Going to call your cousin instead... 📱",
		]
	},
	panda: {
		productive: [
			"*happy bamboo munching sounds* 🎋",
			"You work good! Get treat now! 🍫",
			"Panda proud of human focus! 🐼👍",
			"Keep rolling like panda down hill! 🎢",
		],
		unproductive: [
			"*sad panda noises* Human distracted... 🐼",
			"No bamboo for distracted humans! 🎋❌",
			"Panda sad when you not focus... 😢",
			"Panda want human back to work please! 🙏",
		],
		dead: [
			"Panda go sleep now. Too many distraction... 💤",
			"Panda roll away to find focused friend... 🐼👋",
			"No more bamboo energy. Productivity extinct! 🪦",
		]
	},
	oldMan: {
		productive: [
			"Back in my day, we didn't have distractions! 👴",
			"That's the spirit, young whippersnapper! 🧓",
			"Keep it up and you might amount to something! 🏆",
			"Finally putting that fancy education to use! 📚",
		],
		unproductive: [
			"What in tarnation are you doing?! 😠",
			"You kids and your social media nonsense! 📱",
			"In my day, we worked 25 hours a day! Get back to it! ⏰",
			"This is why your generation can't afford houses! 🏠",
		],
		dead: [
			"That's it! I'm taking a nap. Wake me when you're serious! 💤",
			"Too many shenanigans! I've lost all hope in your generation... 🪑",
			"Back in my day, distractions meant THE END! And here we are! 😤",
		]
	}
}

// Default to standard dead messages for backward compatibility
const deadMessages = personalityMessages.standard.dead

// --- Private Functions ---

const _getRandomMessage = (messages) =>
	messages[Math.floor(Math.random() * messages.length)]

const _getSpriteMessage = () => {
	const personality = personalityMessages[state.personalityType] || personalityMessages.standard;
	
	if (state.spriteState === "dead") {
		return _getRandomMessage(personality.dead)
	}
	
	// Return appropriate message based on mode and personality
	if (state.currentMode === "productivity") {
		return _getRandomMessage(personality.productive);
	} else {
		// Custom relax messages based on personality
		switch(state.personalityType) {
			case "asianMom": 
				return "OK, you take small break. Five minutes only!";
			case "panda": 
				return "Panda relax time! Bamboo and nap! 🎋";
			case "oldMan": 
				return "Finally taking a deserved break like in the good old days.";
			default: 
				return "Time to relax! 🧘";
		}
	}
}

// Advanced perceptual hashing function for window changes
// This extracts the top portion of the image and uses perceptual hashing
const _generateScreenshotHash = async (base64Data) => {
    if (!base64Data || base64Data.length < 1000) return null;
    
    try {
        // Create a data URL from the base64 string
        const dataUrl = `data:image/png;base64,${base64Data}`;
        
        // Create a buffer from the base64 string for imghash
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Simply use imghash directly on the buffer - it's more reliable
        // with smaller hash size (8 bits) for less sensitivity to minor changes
        const hash = await imghash.hash(buffer, 8);
        console.log('Generated perceptual hash:', hash);
        
        return hash;
    } catch (error) {
        console.error('Error in perceptual hashing:', error);
        
        // Fallback to simple hash if perceptual hashing fails
        let hash = 0;
        const sampleString = base64Data.substring(0, 500);
        for (let i = 0; i < sampleString.length; i += 10) {
            hash = ((hash << 5) - hash) + sampleString.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString();
    }
}

const _updateContextHistory = (description) => {
	if (description) {
		state.contextHistory.push(description)
		if (state.contextHistory.length > state.maxContextHistory) {
			state.contextHistory.shift() // Remove the oldest item
		}
		console.log("Updated context history:", state.contextHistory)
	}
}

// --- New function to generate sprite's reaction ---
const _generateSpriteReaction = async (isDistracting, activityDescription) => {
	if (!state.anthropicClient) {
		console.warn("Cannot generate reaction, API client not ready.")
		// Use personality-specific fallback messages
		const personality = personalityMessages[state.personalityType] || personalityMessages.standard;
		return isDistracting 
			? _getRandomMessage(personality.unproductive) 
			: _getRandomMessage(personality.productive);
	}

	const promptAction = isDistracting
		? "distracted by"
		: "productively working on"
	
	// Define personality characteristics for the prompt
	let personalityPrompt;
	switch(state.personalityType) {
		case "asianMom":
			personalityPrompt = "You are an Asian mom character who has high expectations, uses broken English, and constantly compares the user to more successful relatives. You're strict but ultimately care about the user's success.";
			break;
		case "panda":
			personalityPrompt = "You are a cute panda character who loves bamboo and speaks in simple, childlike sentences. You're encouraging but get sad when user is distracted.";
			break;
		case "oldMan":
			personalityPrompt = "You are a grumpy old man character who constantly talks about 'back in my day' and complains about 'kids these days'. You use old-fashioned expressions and are critical but wise.";
			break;
		default:
			personalityPrompt = "You are a friendly, motivational productivity assistant with a positive, encouraging tone.";
	}
	
	const promptCore = `The user is currently ${promptAction} '${
		activityDescription || "something"
	}'. Give a very short (1 sentence, max 10 words), in-character reaction that matches your personality.`
	
	const systemPrompt = `${personalityPrompt} Your current state is: Mode=${state.currentMode}, Status=${state.spriteState}, Distractions=${state.distractionCount}.`;

	try {
		console.log(`Generating ${state.personalityType} sprite reaction via Claude...`);
		const response = await state.anthropicClient.messages.create({
			model: "claude-3-haiku-20240307",
			max_tokens: 40, // Short response needed
			system: systemPrompt,
			messages: [{ role: "user", content: promptCore }],
		})

		if (
			response.content &&
			response.content.length > 0 &&
			response.content[0].type === "text"
		) {
			const reaction = response.content[0].text.trim()
			console.log("Generated reaction:", reaction)
			return reaction
		} else {
			console.warn("Claude did not return expected text for reaction.")
			// Use personality-specific fallback messages
			const personality = personalityMessages[state.personalityType] || personalityMessages.standard;
			return isDistracting 
				? _getRandomMessage(personality.unproductive) 
				: _getRandomMessage(personality.productive);
		}
	} catch (error) {
		console.error("Error generating sprite reaction:", error)
		// Use personality-specific fallback messages
		const personality = personalityMessages[state.personalityType] || personalityMessages.standard;
		return isDistracting 
			? _getRandomMessage(personality.unproductive) 
			: _getRandomMessage(personality.productive);
	}
}

// --- Anthropic API Call with Tools (Modified) ---
const analyzeScreenshotWithClaude = async (screenshotBase64) => {
	if (!state.anthropicClient) {
		console.error("Anthropic client not initialized.")
		return {
			error: "API client not ready.",
			isDistracting: false,
			activityDescription: null,
		} // Default to not distracting on error
	}
	if (!screenshotBase64) {
		console.error("No screenshot data provided.")
		return {
			error: "No screenshot data.",
			isDistracting: false,
			activityDescription: null,
		}
	}

	// Define the tool (Modified)
	const productivityTool = {
		name: "report_screen_analysis", // Renamed for clarity
		description:
			"Analyzes user screen content, determines productivity status, and provides a brief description of the main activity.",
		input_schema: {
			type: "object",
			properties: {
				is_distracting: {
					type: "boolean",
					description:
						"True if distracting (social media, games, etc.), false otherwise (coding, documents, etc.).",
				},
				activity_description: {
					// <-- New field
					type: "string",
					description:
						"A brief description of the main activity seen on screen (e.g., 'Coding in VS Code', 'Watching YouTube', 'Reading news').",
				},
			},
			required: ["is_distracting", "activity_description"], // Make description required
		},
	}

	try {
		console.log("Analyzing screenshot with Claude (tools for context)...")
		const response = await state.anthropicClient.messages.create({
			model: "claude-3-haiku-20240307",
			max_tokens: 500,
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: "Analyze the screenshot. Determine if I am being productive (coding, documents, work tools) or distracted (social media, games, entertainment). Also provide a brief description of the main activity. Use the 'report_screen_analysis' tool.",
						},
						{
							type: "image",
							source: {
								type: "base64",
								media_type: "image/png",
								data: screenshotBase64, // Just the base64 data
							},
						},
					],
				},
			],
			tools: [productivityTool],
		})

		console.log("Claude raw response:", JSON.stringify(response, null, 2))

		// Find the tool use block
		const toolUseBlock = response.content.find(
			(block) => block.type === "tool_use"
		)

		if (toolUseBlock && toolUseBlock.name === "report_screen_analysis") {
			const isDistracting = toolUseBlock.input.is_distracting
			const activityDescription = toolUseBlock.input.activity_description
			console.log("Parsed analysis result (tool):", {
				isDistracting,
				activityDescription,
			})
			return { isDistracting, activityDescription } // <-- Return both
		} else {
			console.warn(
				"Could not find expected tool use in response:",
				response.content
			)
			// Fallback or default? Let's default to not distracting if tool wasn't used correctly.
			return {
				error: "Tool not used as expected.",
				isDistracting: false,
				activityDescription: null,
			}
		}
	} catch (error) {
		console.error("Error analyzing screenshot with Claude:", error)
		return {
			error: error.message || "Unknown API error",
			isDistracting: false,
			activityDescription: null,
		} // Default to not distracting on error
	}
}

// --- Core Logic Functions (Modified) ---

const _updateDistractionState = async (isDistracting, activityDescription) => {
	_updateContextHistory(activityDescription)

	let message = ""
	let speakMessage = false // Flag to control speech
	
	// Get the appropriate personality
	const personality = personalityMessages[state.personalityType] || personalityMessages.standard;

	if (state.currentMode !== "productivity" || state.spriteState === "dead") {
		// Generate a simple status message if not in productivity or dead
		message =
			state.spriteState === "dead"
				? _getRandomMessage(personality.dead)
				: `Currently: ${activityDescription || "Idle"}`
		// Don't speak status messages unless dead? Or maybe speak dead messages?
		speakMessage = state.spriteState === "dead"
		state.uiUpdateCallback(getState(), message, speakMessage) // Pass speak flag
		return
	}

	// --- In Productivity Mode & Alive ---

	// Generate reaction message using LLM or use personality-based message
	if (Math.random() < 0.7) { // 70% chance to use personality message
		message = isDistracting
			? _getRandomMessage(personality.unproductive)
			: _getRandomMessage(personality.productive);
	} else {
		// 30% chance to use LLM for more variety
		message = await _generateSpriteReaction(isDistracting, activityDescription)
	}

	// Detect state changes for audible feedback
	const wasDistracted = state.previouslyDistracted;
	const stateChanged = (wasDistracted !== isDistracting);
	
	if (isDistracting) {
		state.distractionCount++
		console.log("Distraction detected! Count:", state.distractionCount)
		// Always speak when distracted
		speakMessage = true; 

		if (state.distractionCount >= DISTRACTION_LIMIT) {
			console.log("Distraction limit reached! Sprite is now dead.")
			state.spriteState = "dead"
			message = _getRandomMessage(personality.dead) // Override with dead message based on personality
			speakMessage = true // Always speak the dead message
			stopProductivityCheck()
		}
	} else {
		console.log("Productive screen detected.")
		// Only speak when transitioning from distracted to focused
		speakMessage = stateChanged && wasDistracted; 
		
		if (speakMessage) {
			console.log("State changed from distracted to focused - speaking message");
			// Override with a "back on track" message
			if (Math.random() < 0.7) {
				switch(state.personalityType) {
					case "asianMom":
						message = "Finally! You back to work now. Good!";
						break;
					case "panda":
						message = "Panda happy! Human focusing again! 🎋";
						break;
					case "oldMan":
						message = "Well, well! Finally back to work, I see!";
						break;
					default:
						message = "Great! Back on track! 👍";
				}
			}
		}
	}
	
	// Update the previous distraction state for next time
	state.previouslyDistracted = isDistracting;
	
	state.uiUpdateCallback(getState(), message, speakMessage) // Update UI with new state, message, and speak flag
}

const analyzeScreenAndUpdate = async (screenshotBase64) => {
	if (state.spriteState === "dead") return
	console.log("Initiating screen analysis for context...")
	const result = await analyzeScreenshotWithClaude(screenshotBase64)

	// Use both results
	if (result && typeof result.isDistracting === "boolean") {
		await _updateDistractionState(
			result.isDistracting,
			result.activityDescription
		)
	} else {
		console.error("Failed to get valid analysis result:", result?.error)
		// Optionally inform UI about the error
		state.uiUpdateCallback(
			getState(),
			`Analysis Error: ${result?.error || "Unknown"}`,
			false
		)
	}
}

// --- Refactored Timer/Check Logic ---

// Hoist the check function logic so it can be called independently
const _performProductivityCheck = async () => {
	if (!state.isMonitoring || state.spriteState === "dead") {
		console.log("Check skipped (not monitoring or dead).")
		stopProductivityCheck() // Ensure timer stops if state is wrong
		return
	}
	if (!state.captureScreenshotFn) {
		console.error("Error: Screenshot capture function not available.")
		state.uiUpdateCallback(
			getState(),
			"Error: Cannot capture screen.",
			true
		)
		stopProductivityCheck()
		return
	}

	try {
		console.log("Capturing screenshot for check...")
		const screenshot = await state.captureScreenshotFn()
		if (screenshot && screenshot.startsWith("data:image/png;base64,")) {
			const base64Data = screenshot.split(",")[1]
			// Note: analyzeScreenAndUpdate handles UI updates internally
			await analyzeScreenAndUpdate(base64Data)
		} else {
			console.error("Invalid screenshot format received.")
			// Maybe notify UI?
		}
	} catch (error) {
		console.error("Error during screenshot capture or analysis:", error)
		state.uiUpdateCallback(getState(), "Error during check.", true)
		// Decide if we should stop monitoring on error
		// stopProductivityCheck();
	}
}

// Function to schedule the next check
const _scheduleNextCheck = (delayMs) => {
	// Clear any existing timers (interval or paused timeout)
	if (state.monitoringInterval) clearInterval(state.monitoringInterval)
	if (state.timerPausedTimeout) clearTimeout(state.timerPausedTimeout)
	state.monitoringInterval = null
	state.timerPausedTimeout = null

	if (!state.isMonitoring || state.spriteState === "dead") {
		console.log("Not scheduling next check (monitoring off or dead).")
		return
	}

	console.log(
		`Scheduling next productivity check in ${delayMs / 1000} seconds.`
	)
	// Use setTimeout for the next check
	state.timerPausedTimeout = setTimeout(async () => {
		await _performProductivityCheck()
		// After the check runs, schedule the *next* one using the regular interval
		if (state.isMonitoring && state.spriteState !== "dead") {
			_scheduleNextCheck(MONITORING_INTERVAL_MS)
		}
	}, delayMs)
}

// Function to set the personality type
const setPersonalityType = (personalityType) => {
	if (["standard", "asianMom", "panda", "oldMan"].includes(personalityType)) {
		state.personalityType = personalityType;
		console.log(`Personality changed to: ${personalityType}`);
		
		// Get welcome message based on the new personality
		const personality = personalityMessages[state.personalityType];
		const welcomeMessage = state.personalityType === "standard" 
			? "Welcome! Ready for Productivity mode? ✨"
			: _getRandomMessage(personality.productive);
			
		// Update UI with the new personality's message
		state.uiUpdateCallback(getState(), welcomeMessage, true);
		return true;
	}
	return false;
}

const initialize = (uiUpdateCallback, apiKey, captureFn, personalityType = "standard") => {
	console.log("Initializing logic module...")
	state.uiUpdateCallback = uiUpdateCallback
	state.apiKey = apiKey
	
	// Set initial personality type
	if (personalityType && ["standard", "asianMom", "panda", "oldMan"].includes(personalityType)) {
		state.personalityType = personalityType;
		console.log(`Initial personality set to: ${personalityType}`);
	}
	
	// Store screenshot capture function if provided
	if (typeof captureFn === 'function') {
		state.captureScreenshotFn = captureFn;
	}
	
	if (apiKey) {
		try {
			// Ensure Anthropic SDK is compatible with Node.js environment
			state.anthropicClient = new Anthropic({ apiKey: state.apiKey })
			console.log("Anthropic client initialized successfully.")
		} catch (error) {
			console.error("Failed to initialize Anthropic client:", error)
			state.anthropicClient = null // Ensure it's null if init fails
		}
	} else {
		console.warn("API Key not provided during initialization.")
	}
	
	// Automatically start window change detection if capture function is available
	if (state.captureScreenshotFn && !state.windowChangeDetection) {
		startWindowChangeDetection(state.captureScreenshotFn);
	}
	
	// Get welcome message based on personality
	const personality = personalityMessages[state.personalityType];
	const welcomeMessage = state.personalityType === "standard" 
		? "Welcome! Ready for Productivity mode? ✨"
		: _getRandomMessage(personality.productive);
	
	// Send initial state to UI (including statsVisible)
	state.uiUpdateCallback(
		getState(),
		welcomeMessage,
		true
	)
}

const getState = () => {
	// Return a copy to prevent direct modification
	return {
		mode: state.currentMode,
		distractions: state.distractionCount,
		status: state.spriteState,
		isMonitoring: state.isMonitoring,
		statsVisible: state.statsVisible,
		personalityType: state.personalityType // Include personality type in state
	}
}

const toggleMode = () => {
	if (state.spriteState === "dead") return

	state.currentMode =
		state.currentMode === "productivity" ? "relax" : "productivity"
	console.log("Mode toggled to:", state.currentMode)

	if (state.currentMode === "productivity") {
		state.distractionCount = 0 // Reset distractions
		console.log("Distraction count reset.")
		// Optionally auto-start monitoring?
		// startProductivityCheck();
	} else {
		// Stop monitoring if switching to relax mode
		stopProductivityCheck()
	}
	state.uiUpdateCallback(getState(), _getSpriteMessage(), false)
}

const toggleStatsVisibility = () => {
	if (state.spriteState === "dead") return // Don't toggle if dead
	state.statsVisible = !state.statsVisible
	console.log("Logic: Stats visibility toggled to", state.statsVisible)
	state.uiUpdateCallback(getState(), null, false)
}

// Helper function to calculate Hamming distance between two hex strings (perceptual hashes)
const _calculateHashDistance = (hash1, hash2) => {
    try {
        // Validate inputs
        if (!hash1 || !hash2) {
            console.warn("One or both hashes are empty:", { hash1, hash2 });
            return Number.MAX_SAFE_INTEGER;
        }
        
        if (hash1.length !== hash2.length) {
            console.warn(`Hash length mismatch: ${hash1.length} vs ${hash2.length}`);
            
            // Try to normalize lengths for more graceful handling
            const minLength = Math.min(hash1.length, hash2.length);
            hash1 = hash1.substring(0, minLength);
            hash2 = hash2.substring(0, minLength);
            
            if (minLength < 4) {
                return Number.MAX_SAFE_INTEGER; // Too short to compare meaningfully
            }
        }
        
        // Convert hex strings to binary safely
        let bin1, bin2;
        try {
            bin1 = Array.from(hash1).map(h => {
                const parsed = parseInt(h, 16);
                return isNaN(parsed) ? '0000' : parsed.toString(2).padStart(4, '0');
            }).join('');
            
            bin2 = Array.from(hash2).map(h => {
                const parsed = parseInt(h, 16);
                return isNaN(parsed) ? '0000' : parsed.toString(2).padStart(4, '0');
            }).join('');
        } catch (conversionError) {
            console.error("Error converting hex to binary:", conversionError);
            return Number.MAX_SAFE_INTEGER;
        }
        
        // Count bit differences (Hamming distance)
        let distance = 0;
        const minLength = Math.min(bin1.length, bin2.length);
        
        for (let i = 0; i < minLength; i++) {
            if (bin1[i] !== bin2[i]) {
                distance++;
            }
        }
        
        // Add penalty for length differences
        distance += Math.abs(bin1.length - bin2.length);
        
        return distance;
    } catch (error) {
        console.error("Error calculating hash distance:", error);
        return Number.MAX_SAFE_INTEGER;
    }
};

// Function to detect window/tab changes and take screenshots
const startWindowChangeDetection = (captureFn) => {
	if (state.windowChangeDetection || !captureFn) {
		console.log("Window change detection already running or missing capture function")
		return
	}
	
	console.log("Starting window change detection...")
	state.captureScreenshotFn = captureFn // Store for later use
	state.windowChangeDetection = true
	
	// For perceptual hashing of window content	
	// Separate interval for window change detection
	const windowChangeInterval = setInterval(async () => {
		if (!state.windowChangeDetection) {
			clearInterval(windowChangeInterval)
			return
		}
		
		try {
			const screenshot = await captureFn()
			if (screenshot && screenshot.startsWith("data:image/png;base64,")) {
				const base64Data = screenshot.split(",")[1]
				const currentHash = await _generateScreenshotHash(base64Data)
				
				// Check if screen has changed significantly using hamming distance comparison
				if (currentHash && state.lastScreenshotHash) {
				    const hashDistance = _calculateHashDistance(currentHash, state.lastScreenshotHash);
				    console.log(`Hash distance: ${hashDistance}, threshold: ${HASH_DISTANCE_THRESHOLD}`);
				    
				    // Only consider it a change if the distance is above threshold
				    if (hashDistance > HASH_DISTANCE_THRESHOLD) {
					    console.log(`Window/tab change detected! (hash distance: ${hashDistance})`)
					    state.lastScreenshotHash = currentHash
					    
					    // If we're monitoring, analyze the screenshot
					    if (state.isMonitoring && state.currentMode === "productivity" && state.spriteState !== "dead") {
						    analyzeScreenAndUpdate(base64Data)
					    } else {
						    console.log("Window change detected, but not analyzing (monitoring off or incorrect mode)")
					    }
				    } else {
				        console.log("Minor screen change - below threshold")
				    }
				} else if (currentHash) {
				    // First run or hash was reset
				    console.log("Setting initial screenshot hash")
				    state.lastScreenshotHash = currentHash
				}
			}
		} catch (error) {
			console.error("Error during window change detection:", error)
		}
	}, WINDOW_CHECK_INTERVAL_MS)
	
	return windowChangeInterval
}

const stopWindowChangeDetection = () => {
	console.log("Stopping window change detection");
	state.windowChangeDetection = false;
	
	// Ensure we don't leave stale hash data
	state.lastScreenshotHash = null;
}

const startProductivityCheck = (captureFn) => {
	if (
		state.currentMode !== "productivity" ||
		state.isMonitoring
	) {
		console.log("Cannot start monitoring:", {
			mode: state.currentMode,
			status: state.spriteState,
			isMonitoring: state.isMonitoring,
		})
		return
	}
	if (typeof captureFn !== "function") {
		console.error(
			"Capture function not provided to startProductivityCheck!"
		)
		state.uiUpdateCallback(
			getState(),
			"Error: Cannot capture screen.",
			true
		)
		return
	}
	if (!state.anthropicClient) {
		console.error(
			"Cannot start monitoring: Anthropic client not available."
		)
		state.uiUpdateCallback(getState(), "Error: API client not ready.", true)
		return
	}

	console.log("Starting productivity monitoring...")
	
	// Reset distraction count when starting monitoring
	state.distractionCount = 0
	console.log("Distraction count reset to 0")
	
	// Reset previous distraction state
	state.previouslyDistracted = false
	console.log("Previous distraction state reset")
	
	// Reset sprite state if it was dead
	if (state.spriteState === "dead") {
		state.spriteState = "alive"
		console.log("Sprite state reset to alive")
	}
	
	state.isMonitoring = true
	state.captureScreenshotFn = captureFn // Store for future use
	
	// Clear any existing monitoring intervals
	if (state.monitoringInterval) {
		clearInterval(state.monitoringInterval)
		state.monitoringInterval = null
	}
	
	// Also start window change detection if not already running
	if (!state.windowChangeDetection) {
		startWindowChangeDetection(captureFn)
	}

	const check = async () => {
		try {
			console.log("Capturing screenshot for check...")
			const screenshot = await captureFn() // Call the function passed from renderer
			if (screenshot && screenshot.startsWith("data:image/png;base64,")) {
				const base64Data = screenshot.split(",")[1]
				
				// Store hash for window change detection
				state.lastScreenshotHash = _generateScreenshotHash(base64Data)
				
				analyzeScreenAndUpdate(base64Data) // Analyze and update state
			} else {
				console.error("Invalid screenshot format received.")
			}
		} catch (error) {
			console.error("Error during screenshot capture:", error)
			state.uiUpdateCallback(getState(), "Error capturing screen.", true)
			stopProductivityCheck() // Stop if capture fails
		}
	}

	check() // Initial check immediately
	state.monitoringInterval = setInterval(check, MONITORING_INTERVAL_MS)
	state.uiUpdateCallback(
		getState(),
		"Monitoring started! Let's focus! ✨",
		true
	)
}

const stopProductivityCheck = () => {
	if (!state.isMonitoring) return

	console.log("Stopping productivity monitoring...")
	state.isMonitoring = false
	if (state.monitoringInterval) {
		clearInterval(state.monitoringInterval)
		state.monitoringInterval = null
	}
	
	// Don't stop window change detection when stopping productivity check
	// This allows window change detection to continue working independently
	// If you want to also stop window change detection, uncomment:
	// if (state.windowChangeDetection) {
	//     stopWindowChangeDetection();
	// }
	
	state.uiUpdateCallback(getState(), "Monitoring stopped.", true)
}

// --- Interaction Function (Modified) ---
const getHelpOrChat = async (userQuery) => {
	if (!state.anthropicClient) {
		return "Sorry, my brain (API client) isn't working right now."
	}
	if (!userQuery || userQuery.trim() === "") {
		return "What would you like to talk about?"
	}

	console.log(`Getting help/chat for query: "${userQuery}"`)

	// --- Pause Timer Logic ---
	let wasMonitoring = state.isMonitoring
	if (wasMonitoring) {
		console.log("Pausing monitoring for chat...")
		// Stop clears interval/timeout and sets isMonitoring=false
		stopProductivityCheck()
		// We keep track that it *was* monitoring to resume later.
		state.isMonitoring = false // Explicitly mark as not monitoring during chat
	}
	// --- End Pause Timer Logic ---

	// Emphasize context more strongly in the system prompt
	const contextString = state.contextHistory.join("; ") || "None recorded yet"
	
	// Define personality characteristics for the prompt
	let personalityPrompt;
	switch(state.personalityType) {
		case "asianMom":
			personalityPrompt = "You are an Asian mom character who has high expectations, uses broken English, and constantly compares the user to more successful relatives. You're strict but ultimately care about the user's success.";
			break;
		case "panda":
			personalityPrompt = "You are a cute panda character who loves bamboo and speaks in simple, childlike sentences. You're encouraging but get sad when user is distracted.";
			break;
		case "oldMan":
			personalityPrompt = "You are a grumpy old man character who constantly talks about 'back in my day' and complains about 'kids these days'. You use old-fashioned expressions and are critical but wise.";
			break;
		default:
			personalityPrompt = "You are a friendly, motivational productivity assistant with a positive, encouraging tone.";
	}
	
	const systemPrompt = `${personalityPrompt} Your current state is: Mode=${state.currentMode}, Status=${state.spriteState}, Distractions=${state.distractionCount}. The user's recent screen activity context is: [${contextString}]. Respond to the user's query concisely and helpfully (1-2 sentences max), keeping your persona in mind. **If their query seems related to their recent activity, reference that context in your response.** If they are just chatting, be friendly but stay in character.`

	let chatResponseText = "..." // Default or loading message
	try {
		const response = await state.anthropicClient.messages.create({
			model: "claude-3-haiku-20240307",
			max_tokens: 150,
			system: systemPrompt,
			messages: [{ role: "user", content: userQuery }],
			// No tools needed for this simple chat interaction yet
		})

		console.log(
			"Chat response from Claude:",
			JSON.stringify(response, null, 2)
		)

		if (
			response.content &&
			response.content.length > 0 &&
			response.content[0].type === "text"
		) {
			chatResponseText = response.content[0].text
		} else {
			chatResponseText = "Hmm, I'm not sure how to respond to that."
		}
	} catch (error) {
		console.error("Error during chat API call:", error)
		chatResponseText = `Sorry, I encountered an error: ${
			error.message || "Unknown"
		}`
	} finally {
		// --- Resume Timer Logic (inside finally block) ---
		if (wasMonitoring && state.spriteState !== "dead") {
			console.log("Scheduling delayed check after chat (60s).")
			// We need to re-enable monitoring conceptually *before* scheduling
			state.isMonitoring = true
			_scheduleNextCheck(60000) // Schedule check after 60 seconds
		}
		// --- End Resume Timer Logic ---
	}
	return chatResponseText // Return the response text
}

// Export the public functions
module.exports = {
	initialize,
	getState,
	toggleMode,
	toggleStatsVisibility,
	startProductivityCheck,
	stopProductivityCheck,
	getHelpOrChat, // <-- Export interaction function
	startWindowChangeDetection, // <-- Export window change detection functions
	stopWindowChangeDetection,
	setPersonalityType, // <-- Export personality function
}
