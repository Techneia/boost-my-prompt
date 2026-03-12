chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'boostPrompt') {
        const textToImprove = request.text;

        chrome.storage.local.get(
            {
                enabled: true,
                provider: 'openai',
                apiKeys: {},
                providerUrls: { 'ollama-local': 'http://localhost:11434' },
                providerModels: {}
            },
            (settings) => {
                fetch(chrome.runtime.getURL('default_system_prompt.md'))
                    .then(response => response.text())
                    .then(DEFAULT_SYSTEM_PROMPT => {
                        try {
                            const parsed = JSON.parse(DEFAULT_SYSTEM_PROMPT);
                            if (parsed && parsed.content) {
                                DEFAULT_SYSTEM_PROMPT = parsed.content;
                            }
                        } catch (e) { /* It's plain markdown, not JSON, do nothing */ }

                        settings.systemPrompt = DEFAULT_SYSTEM_PROMPT;

                        // Map the active provider's specific settings dynamically
                        settings.apiKey = settings.apiKeys[settings.provider] || '';
                        settings.ollamaUrl = settings.providerUrls[settings.provider] || '';
                        settings.ollamaModel = settings.providerModels[settings.provider] || '';
                        if (!settings.enabled) {
                            sendResponse({ error: 'Extension is disabled' });
                            return;
                        }

                        if (!settings.apiKey && settings.provider !== 'ollama-local' && settings.provider !== 'ollama-remote') {
                            sendResponse({ error: 'API Key is missing. Please configure it in the extension settings.' });
                            return;
                        }

                        if ((settings.provider === 'ollama-local' || settings.provider === 'ollama-remote') && (!settings.ollamaUrl || !settings.ollamaModel)) {
                            sendResponse({ error: 'Ollama URL or Model is missing. Please configure them in the extension settings.' });
                            return;
                        }

                        boostPromptWithAI(textToImprove, settings)
                            .then(improvedText => sendResponse({ success: true, improvedText }))
                            .catch(error => sendResponse({ error: error.message }));
                    })
                    .catch(error => {
                        console.error('Failed to load default system prompt:', error);
                        sendResponse({ error: 'Failed to load default system prompt' });
                    });
            }
        );

        return true; // Indicates we will send response asynchronously
    }
});

async function boostPromptWithAI(text, settings) {
    if (settings.provider === 'openai') {
        return callOpenAI(text, settings);
    } else if (settings.provider === 'inception') {
        return callInception(text, settings);
    } else if (settings.provider === 'openrouter') {
        return callOpenRouter(text, settings);
    } else if (settings.provider === 'gemini') {
        return callGemini(text, settings);
    } else if (settings.provider === 'anthropic') {
        return callAnthropic(text, settings);
    } else if (settings.provider === 'ollama-local' || settings.provider === 'ollama-remote') {
        return callOllama(text, settings);
    } else {
        throw new Error(`Unsupported provider selected: "${settings.provider}". Please refresh the page and make sure the extension is updated.`);
    }
}

async function callOllama(text, settings) {
    let baseUrl = settings.ollamaUrl;
    if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1);
    }

    const headers = {
        'Content-Type': 'application/json'
    };

    if (settings.apiKey) {
        headers['Authorization'] = `Bearer ${settings.apiKey}`;
    }

    const isV1 = baseUrl.endsWith('/v1');
    const endpoint = isV1 ? `${baseUrl}/chat/completions` : `${baseUrl}/api/chat`;

    const bodyData = {
        model: settings.ollamaModel,
        messages: [
            { role: 'system', content: settings.systemPrompt },
            { role: 'user', content: text }
        ]
    };

    if (!isV1) {
        bodyData.stream = false;
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        mode: 'cors',
        credentials: 'omit',
        body: JSON.stringify(bodyData)
    });

    if (!response.ok) {
        const errText = await response.text();
        if (response.status === 403) {
            throw new Error(`Ollama connection rejected. Host permissions might be missing or CORS is blocking the request. Check your local URL.`);
        }
        throw new Error(`Failed to call Ollama: ${response.status} ${errText}`);
    }

    const data = await response.json();
    if (isV1) {
        return data.choices[0].message.content.trim();
    } else {
        return data.message.content.trim();
    }
}

// Helper to parse complex error objects from APIs
async function handleApiError(response, providerName) {
    let errText = await response.text();
    try {
        const errJson = JSON.parse(errText);
        // Try to extract the most descriptive error message
        errText = errJson.error?.message || errJson.error || errJson.message || errJson.detail || errText;
        if (typeof errText === 'object') {
            errText = JSON.stringify(errText);
        }
    } catch (e) {
        // Not JSON, keep raw text
    }
    throw new Error(`${providerName} Error (${response.status}): ${errText}`);
}

// API Caller Functions
async function callOpenAI(text, settings) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
            model: settings.ollamaModel || 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: settings.systemPrompt },
                { role: 'user', content: text }
            ]
        })
    });

    if (!response.ok) {
        await handleApiError(response, 'OpenAI');
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
}

async function callInception(text, settings) {
    const response = await fetch('https://api.inceptionlabs.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
            model: settings.ollamaModel || 'mercury',
            messages: [
                { role: 'system', content: settings.systemPrompt },
                { role: 'user', content: text }
            ]
        })
    });

    if (!response.ok) {
        await handleApiError(response, 'Inception Labs');
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
}

async function callOpenRouter(text, settings) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`,
            'HTTP-Referer': 'https://boostmyprompt.extension', // Optional, for OpenRouter rankings
            'X-Title': 'Boost my prompT' // Optional, for OpenRouter rankings
        },
        body: JSON.stringify({
            model: settings.ollamaModel || 'openrouter/auto',
            messages: [
                { role: 'system', content: settings.systemPrompt },
                { role: 'user', content: text }
            ]
        })
    });

    if (!response.ok) {
        await handleApiError(response, 'OpenRouter');
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
}

async function callGemini(text, settings) {
    let model = settings.ollamaModel || 'gemini-1.5-flash';
    // The Gemini endpoint requires the format /models/model-name:generateContent
    // Our dropdown saves just 'gemini-1.5-flash' because we stripped 'models/' in popup.js for cleaner UI.
    // If it DOES NOT start with 'models/', we must not strip it, we must ensure it isn't duplicated in the URL string below.
    if (model.startsWith('models/')) {
        model = model.replace('models/', '');
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: `${settings.systemPrompt}\n\nUser Prompt to improve:\n${text}` }]
            }]
        })
    });

    if (!response.ok) {
        await handleApiError(response, 'Gemini');
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text.trim();
}

async function callAnthropic(text, settings) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': settings.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true' // Since service workers are technically a browser context for Anthropic
        },
        body: JSON.stringify({
            model: settings.ollamaModel || 'claude-3-haiku-20240307',
            max_tokens: 1024,
            system: settings.systemPrompt,
            messages: [
                { role: 'user', content: text }
            ]
        })
    });

    if (!response.ok) {
        await handleApiError(response, 'Anthropic');
    }

    const data = await response.json();
    return data.content[0].text.trim();
}
