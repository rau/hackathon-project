const speechBubble = document.getElementById("speech-bubble")
const speakBtn = document.getElementById("speak-btn")
const widget = document.getElementById("widget")
const startMonitoringBtn = document.getElementById("start-monitoring")
const spriteHappy = document.getElementById("sprite-happy")
const spriteSad = document.getElementById("sprite-sad")

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
	monitoringInterval = setInterval(checkProductivity, 5000)
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
		speechBubble.textContent = "Please add your Claude API key to .env file! 🔑"
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
