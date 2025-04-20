const { Anthropic } = require("@anthropic-ai/sdk") // Use require for Node.js modules
const { createCanvas, Image } = require("canvas")

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
	windowChangeDetection: false, // Flag to enable/disable window change detection
	personalityType: "standard", // 'standard', 'asianMom', 'panda', 'oldMan'
	previouslyDistracted: false, // Track previous distraction state for state change detection
	lastWindowChangeTime: 0,
	lastAppName: null,
	windowChangeListener: null,
	emotionLevel: 100, // Start at 100% happiness
	currentEmotion: "happy",
}

// --- Constants ---
const DISTRACTION_LIMIT = 3
const MONITORING_INTERVAL_MS = 5000 // 15 seconds
const WINDOW_CHANGE_DEBOUNCE_MS = 3000 // 3 seconds minimum between window changes

// Add emotion level constants
const EMOTION_LEVELS = {
	HAPPY: "happy",
	NEUTRAL: "neutral",
	UNHAPPY: "unhappy",
	WHEELCHAIR: "wheelchair",
	DEAD: "dead",
}

const EMOTION_THRESHOLDS = {
	HAPPY: 80, // 80-100: Happy
	NEUTRAL: 60, // 60-79: Neutral
	UNHAPPY: 40, // 40-59: Unhappy
	WHEELCHAIR: 20, // 20-39: Wheelchair, Below 20: Dead
}

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
		],
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
		],
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
		],
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
		],
	},
}

// Default to standard dead messages for backward compatibility
const deadMessages = personalityMessages.standard.dead

// --- Private Functions ---

const _getRandomMessage = (messages) =>
	messages[Math.floor(Math.random() * messages.length)]

const _getSpriteMessage = () => {
	const personality =
		personalityMessages[state.personalityType] || personalityMessages.standard

	if (state.spriteState === "dead") {
		return _getRandomMessage(personality.dead)
	}

	// Return appropriate message based on mode and personality
	if (state.currentMode === "productivity") {
		return _getRandomMessage(personality.productive)
	} else {
		// Custom relax messages based on personality
		switch (state.personalityType) {
			case "asianMom":
				return "OK, you take small break. Five minutes only!"
			case "panda":
				return "Panda relax time! Bamboo and nap! 🎋"
			case "oldMan":
				return "Finally taking a deserved break like in the good old days."
			default:
				return "Time to relax! 🧘"
		}
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
		const personality =
			personalityMessages[state.personalityType] || personalityMessages.standard
		return isDistracting
			? _getRandomMessage(personality.unproductive)
			: _getRandomMessage(personality.productive)
	}

	const promptAction = isDistracting
		? "distracted by"
		: "productively working on"

	// Define personality characteristics for the prompt
	let personalityPrompt
	switch (state.personalityType) {
		case "asianMom":
			personalityPrompt =
				"You are an Asian mom character who has high expectations, uses broken English, and constantly compares the user to more successful relatives. You're strict but ultimately care about the user's success."
			break
		case "panda":
			personalityPrompt =
				"You are a cute panda character who loves bamboo and speaks in simple, childlike sentences. You're encouraging but get sad when user is distracted."
			break
		case "oldMan":
			personalityPrompt =
				"You are a grumpy old man character who constantly talks about 'back in my day' and complains about 'kids these days'. You use old-fashioned expressions and are critical but wise."
			break
		default:
			personalityPrompt =
				"You are a friendly, motivational productivity assistant with a positive, encouraging tone."
	}

	const promptCore = `The user is currently ${promptAction} '${
		activityDescription || "something"
	}'. Give a very short (1 sentence, max 10 words), in-character reaction that matches your personality.`

	const systemPrompt = `${personalityPrompt} Your current state is: Mode=${state.currentMode}, Status=${state.spriteState}, Distractions=${state.distractionCount}.`

	try {
		console.log(
			`Generating ${state.personalityType} sprite reaction via Claude...`
		)
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
			const personality =
				personalityMessages[state.personalityType] ||
				personalityMessages.standard
			return isDistracting
				? _getRandomMessage(personality.unproductive)
				: _getRandomMessage(personality.productive)
		}
	} catch (error) {
		console.error("Error generating sprite reaction:", error)
		// Use personality-specific fallback messages
		const personality =
			personalityMessages[state.personalityType] || personalityMessages.standard
		return isDistracting
			? _getRandomMessage(personality.unproductive)
			: _getRandomMessage(personality.productive)
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

// Function to update emotion level
const _updateEmotionLevel = (isDistracting) => {
	// Update emotion level based on productivity
	const change = isDistracting ? -15 : +10
	state.emotionLevel = Math.max(0, Math.min(100, state.emotionLevel + change))

	// Determine new emotion based on thresholds
	let newEmotion
	if (state.emotionLevel >= EMOTION_THRESHOLDS.HAPPY) {
		newEmotion = EMOTION_LEVELS.HAPPY
	} else if (state.emotionLevel >= EMOTION_THRESHOLDS.NEUTRAL) {
		newEmotion = EMOTION_LEVELS.NEUTRAL
	} else if (state.emotionLevel >= EMOTION_THRESHOLDS.UNHAPPY) {
		newEmotion = EMOTION_LEVELS.UNHAPPY
	} else if (state.emotionLevel >= EMOTION_THRESHOLDS.WHEELCHAIR) {
		newEmotion = EMOTION_LEVELS.WHEELCHAIR
	} else {
		newEmotion = EMOTION_LEVELS.DEAD
	}

	// Only update if emotion changed
	if (newEmotion !== state.currentEmotion) {
		state.currentEmotion = newEmotion
		if (newEmotion === EMOTION_LEVELS.DEAD) {
			state.spriteState = "dead"
			stopProductivityCheck()
		}
		return true // Emotion changed
	}
	return false // No change
}

const _updateDistractionState = async (isDistracting, activityDescription) => {
	_updateContextHistory(activityDescription)

	let message = ""
	let speakMessage = false // Flag to control speech

	// Update emotion level and get whether it changed
	const emotionChanged = _updateEmotionLevel(isDistracting)

	// Get the appropriate personality
	const personality =
		personalityMessages[state.personalityType] || personalityMessages.standard

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
	if (Math.random() < 0.7) {
		// 70% chance to use personality message
		message = isDistracting
			? _getRandomMessage(personality.unproductive)
			: _getRandomMessage(personality.productive)
	} else {
		// 30% chance to use LLM for more variety
		message = await _generateSpriteReaction(isDistracting, activityDescription)
	}

	// Detect state changes for audible feedback
	const wasDistracted = state.previouslyDistracted
	const stateChanged = wasDistracted !== isDistracting

	if (isDistracting) {
		state.distractionCount++
		console.log(
			"Distraction detected! Count:",
			state.distractionCount,
			"Emotion Level:",
			state.emotionLevel
		)
		// Always speak when distracted
		speakMessage = true

		if (state.currentEmotion === EMOTION_LEVELS.DEAD) {
			message = _getRandomMessage(personality.dead) // Override with dead message based on personality
			speakMessage = true // Always speak the dead message
			stopProductivityCheck()
		}
	} else {
		console.log(
			"Productive screen detected. Emotion Level:",
			state.emotionLevel
		)
		// Only speak when transitioning from distracted to focused
		speakMessage = stateChanged && wasDistracted

		if (speakMessage && emotionChanged) {
			console.log("State changed from distracted to focused - speaking message")
			// Add emotion-specific messages when improving
			switch (state.currentEmotion) {
				case EMOTION_LEVELS.HAPPY:
					message = "Yay! I'm feeling much better now! 🌟"
					break
				case EMOTION_LEVELS.NEUTRAL:
					message = "Getting better! Keep it up! 👍"
					break
				case EMOTION_LEVELS.UNHAPPY:
					message = "Still not feeling great, but improving... 😕"
					break
				case EMOTION_LEVELS.WHEELCHAIR:
					message = "Barely hanging on... please focus! 🙏"
					break
			}
		}
	}

	// Update the previous distraction state for next time
	state.previouslyDistracted = isDistracting

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
		state.uiUpdateCallback(getState(), "Error: Cannot capture screen.", true)
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
		state.personalityType = personalityType
		console.log(`Personality changed to: ${personalityType}`)

		// Get welcome message based on the new personality
		const personality = personalityMessages[state.personalityType]
		const welcomeMessage =
			state.personalityType === "standard"
				? "Welcome! Ready for Productivity mode? ✨"
				: _getRandomMessage(personality.productive)

		// Update UI with the new personality's message
		state.uiUpdateCallback(getState(), welcomeMessage, true)
		return true
	}
	return false
}

const initialize = (
	uiUpdateCallback,
	apiKey,
	captureFn,
	personalityType = "standard"
) => {
	console.log("Initializing logic module...")
	state.uiUpdateCallback = uiUpdateCallback
	state.apiKey = apiKey
	state.emotionLevel = 100
	state.currentEmotion = EMOTION_LEVELS.HAPPY

	// Set initial personality type
	if (
		personalityType &&
		["standard", "asianMom", "panda", "oldMan"].includes(personalityType)
	) {
		state.personalityType = personalityType
		console.log(`Initial personality set to: ${personalityType}`)
	}

	// Store screenshot capture function if provided
	if (typeof captureFn === "function") {
		state.captureScreenshotFn = captureFn
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

	// Start window change detection
	startWindowChangeDetection()

	// Get welcome message based on personality
	const personality = personalityMessages[state.personalityType]
	const welcomeMessage =
		state.personalityType === "standard"
			? "Welcome! Ready for Productivity mode? ✨"
			: _getRandomMessage(personality.productive)

	// Send initial state to UI (including statsVisible)
	state.uiUpdateCallback(getState(), welcomeMessage, true)
}

const getState = () => {
	// Return a copy to prevent direct modification
	return {
		mode: state.currentMode,
		distractions: state.distractionCount,
		status: state.spriteState,
		isMonitoring: state.isMonitoring,
		statsVisible: state.statsVisible,
		personalityType: state.personalityType, // Include personality type in state
		emotionLevel: state.emotionLevel,
		currentEmotion: state.currentEmotion,
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

// Updated window change detection function
const startWindowChangeDetection = () => {
	if (state.windowChangeListener) {
		console.log("Window change detection already running")
		return
	}

	console.log("Starting window change detection...")

	state.windowChangeListener = async (windowInfo) => {
		if (!windowInfo || !windowInfo.appName) {
			console.log("Received invalid window info:", windowInfo)
			return
		}

		const now = Date.now()
		const timeSinceLastChange = now - state.lastWindowChangeTime
		const { appName, windowTitle } = windowInfo

		console.log(
			`App changed to: ${appName}, Window: ${windowTitle}, Time since last change: ${timeSinceLastChange}ms`
		)

		// Only process the change if enough time has passed and it's a new app
		if (
			timeSinceLastChange >= WINDOW_CHANGE_DEBOUNCE_MS &&
			appName !== state.lastAppName
		) {
			console.log("Processing app change after debounce...")
			state.lastWindowChangeTime = now
			state.lastAppName = appName

			// Always trigger a check when app changes, regardless of monitoring state
			try {
				console.log("Triggering productivity check due to app change")
				if (!state.captureScreenshotFn) {
					console.error("Screenshot function not available")
					return
				}

				const screenshot = await state.captureScreenshotFn()
				if (!screenshot) {
					console.error("Failed to capture screenshot")
					return
				}

				if (screenshot.startsWith("data:image/png;base64,")) {
					const base64Data = screenshot.split(",")[1]
					console.log("Analyzing screenshot for productivity...")
					await analyzeScreenAndUpdate(base64Data)
				} else {
					console.error("Invalid screenshot format")
				}
			} catch (error) {
				console.error("Error during app change productivity check:", error)
			}
		} else {
			console.log("Ignoring app change (debounced or same app)")
		}
	}

	// Register the listener with the electron window API
	if (
		typeof window !== "undefined" &&
		window.electron &&
		window.electron.window
	) {
		window.electron.window.onActiveWindowChange(state.windowChangeListener)
		console.log("Window change listener registered successfully")
	} else {
		console.error(
			"Failed to register window change listener - electron API not available"
		)
	}
}

const stopWindowChangeDetection = () => {
	console.log("Stopping window change detection")
	if (
		state.windowChangeListener &&
		typeof window !== "undefined" &&
		window.electron &&
		window.electron.window
	) {
		window.electron.window.removeWindowChangeListener()
		state.windowChangeListener = null
		console.log("Window change listener removed successfully")
	}
	state.lastAppName = null
	state.lastWindowChangeTime = 0
}

const startProductivityCheck = (captureFn) => {
	if (state.currentMode !== "productivity" || state.isMonitoring) {
		console.log("Cannot start monitoring:", {
			mode: state.currentMode,
			isMonitoring: state.isMonitoring,
		})
		return
	}

	if (typeof captureFn !== "function") {
		console.error("Capture function not provided!")
		state.uiUpdateCallback(getState(), "Error: Cannot capture screen.", true)
		return
	}

	if (!state.anthropicClient) {
		console.error("Cannot start monitoring: Anthropic client not available.")
		state.uiUpdateCallback(getState(), "Error: API client not ready.", true)
		return
	}

	console.log("Starting productivity monitoring...")

	state.distractionCount = 0
	state.previouslyDistracted = false
	state.isMonitoring = true
	state.captureScreenshotFn = captureFn

	if (state.monitoringInterval) {
		clearInterval(state.monitoringInterval)
		state.monitoringInterval = null
	}

	// Ensure window change detection is running
	if (!state.windowChangeListener) {
		console.log(
			"Starting window change detection as part of productivity check"
		)
		startWindowChangeDetection()
	}

	// Do an initial check
	const check = async () => {
		try {
			console.log("Performing regular productivity check")
			const screenshot = await captureFn()
			if (screenshot && screenshot.startsWith("data:image/png;base64,")) {
				const base64Data = screenshot.split(",")[1]
				await analyzeScreenAndUpdate(base64Data)
			} else {
				console.error("Invalid screenshot format received")
			}
		} catch (error) {
			console.error("Error during productivity check:", error)
			state.uiUpdateCallback(getState(), "Error during check.", true)
		}
	}

	check()
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
	let personalityPrompt
	switch (state.personalityType) {
		case "asianMom":
			personalityPrompt =
				"You are an Asian mom character who has high expectations, uses broken English, and constantly compares the user to more successful relatives. You're strict but ultimately care about the user's success."
			break
		case "panda":
			personalityPrompt =
				"You are a cute panda character who loves bamboo and speaks in simple, childlike sentences. You're encouraging but get sad when user is distracted."
			break
		case "oldMan":
			personalityPrompt =
				"You are a grumpy old man character who constantly talks about 'back in my day' and complains about 'kids these days'. You use old-fashioned expressions and are critical but wise."
			break
		default:
			personalityPrompt =
				"You are a friendly, motivational productivity assistant with a positive, encouraging tone."
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

		console.log("Chat response from Claude:", JSON.stringify(response, null, 2))

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
