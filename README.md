# Boost my prompT ✨

**Boost my prompT** is a powerful browser extension designed to instantly improve your AI prompts using a "Magic Wand" integrated directly into your favorite AI chat interfaces. It leverages various AI providers (OpenAI, Gemini, Anthropic, Ollama, etc.) to refine and expand your prompts for better results.

## 🚀 Features

-   **Magic Wand Injection**: Seamlessly adds an "Improve" button (wand icon) to the input area of supported AI platforms.
-   **Visual Progress**: A beautiful SVG progress ring gives real-time feedback while the prompt is being processed.
-   **Undo Mode**: Easily toggle between your original prompt and the improved version.
-   **Multi-Provider Support**: Choose from a wide range of cloud-based APIs or run models locally via Ollama.
-   **Customizable System Prompt**: Control precisely how the AI refines your prompts through the extension settings.
-   **Dark/Light Mode Support**: The wand button is styled to match the target site's aesthetic.

## 🌐 Supported Sites

The extension currently supports the following platforms:
-   ChatGPT (chatgpt.com)
-   Google Gemini (gemini.google.com)
-   Google AI Studio (aistudio.google.com)
-   Anthropic Claude (claude.ai)
-   xAI Grok (grok.com)
-   Mistral AI (chat.mistral.ai)
-   Lumo (lumo.proton.me)
-   Lovable.dev
-   Replit & *.replit.com

## 🛠️ AI Providers

Configure your preferred backend in the extension popup:
-   **OpenAI** (GPT-4o, GPT-3.5-Turbo, etc.)
-   **Google Gemini** (Gemini 1.5 Pro/Flash)
-   **Anthropic** (Claude 3.5 Sonnet, Haiku, etc.)
-   **OpenRouter** (Access to almost any model)
-   **Inception Labs** (Mercury models)
-   **Ollama (Local/Remote)**: Run your own models like Llama 3 or Mistral privately.

## ⚙️ Technical Details

### Architecture
-   **Manifest V3**: Built using the latest Chrome extension standards for security and performance.
-   **Content Scripts**: Dynamic injection using `MutationObserver` to ensure the wand button appears even in complex Single Page Applications (SPAs).
-   **Background Service Worker**: Handles all API communication asynchronously to prevent blocking the UI.
-   **Storage API**: Persists your API keys and provider preferences securely across sessions.
-   **Declarative Net Request**: Utilizes rules for optimized network interaction if needed.

### File Structure
-   `manifest.json`: Extension configuration and permissions.
-   `content.js`: Main logic for UI injection and interaction.
-   `content.css`: Styles for the wand button and progress animations.
-   `background.js`: Orchestrator for AI API calls.
-   `popup.html/js/css`: User settings interface.
-   `default_system_prompt.md`: The base instruction set for prompt improvement.
-   `rules.json`: Network routing rules.

## 🔧 Installation

1.  Clone this repository.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** (top right).
4.  Click **Load unpacked** and select the extension directory.
5.  Click the extension icon to configure your API keys.

## 📄 License

MIT License.
